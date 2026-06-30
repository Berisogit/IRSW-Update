import { firestore } from './firestoreService';
import { OrderDoc, InventoryPostingDoc } from '../types/firestoreSchema';

export interface MonthlyCOGSResult {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  foodCostPercent: number;
  warnings: string[];
  metadata: {
    processedOrdersCount: number;
    excludedOrdersCount: number;
    year: number;
    month: number;
  };
}

export interface MenuItemProfitabilityRecord {
  menuItemId: string;
  menuItemName: string;
  quantitySold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
}

export interface MenuItemProfitabilityResult {
  items: MenuItemProfitabilityRecord[];
  warnings: string[];
  metadata: {
    processedOrdersCount: number;
    excludedOrdersCount: number;
    startDate: number;
    endDate: number;
  };
}

export interface TopPerformingItemsResult {
  mostProfitable: MenuItemProfitabilityRecord[];
  leastProfitable: MenuItemProfitabilityRecord[];
  negativeMargin: MenuItemProfitabilityRecord[];
  warnings: string[];
}

export class FoodCostService {
  /**
   * Parse various date representations (Date, timestamp string/number) into milliseconds.
   */
  private static parseTimeToMs(value: Date | number | string): number {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
      const num = Number(value);
      if (!isNaN(num)) {
        return num;
      }
    }
    throw new Error(`Invalid date representation: ${value}`);
  }

  /**
   * Helper to fetch consolidated orders and corresponding postings in a date range.
   * Avoids N+1 query patterns by fetching postings and orders in parallel, filtering them,
   * and merging them in-memory.
   */
  private static async getIntegratedData(
    organizationId: string,
    startDate: number,
    endDate: number
  ): Promise<{
    validOrders: OrderDoc[];
    postingsMap: Map<string, InventoryPostingDoc>;
    warnings: string[];
    excludedCount: number;
  }> {
    const warnings: string[] = [];
    let excludedCount = 0;

    // Fetch both orders and postings within the date range in parallel
    const [orders, postings] = await Promise.all([
      firestore.orders.executeQuery(organizationId, {
        where: [
          { field: 'createdAt', operator: '>=', value: startDate },
          { field: 'createdAt', operator: '<=', value: endDate },
        ],
      }),
      firestore.inventoryPostings.executeQuery(organizationId, {
        where: [
          { field: 'timestamp', operator: '>=', value: startDate },
          { field: 'timestamp', operator: '<=', value: endDate },
        ],
      }),
    ]);

    // Index postings by orderId for O(1) retrieval
    const postingsMap = new Map<string, InventoryPostingDoc>();
    postings.forEach(p => {
      if (p.orderId) {
        postingsMap.set(p.orderId, p);
      }
    });

    const validOrders: OrderDoc[] = [];

    for (const order of orders) {
      // Check legacy order exclusion conditions
      if (order.status !== 'PAID' && order.status !== 'CLOSED') {
        excludedCount++;
        continue;
      }

      const posting = postingsMap.get(order.id);
      
      // Determine if they are legacy (exempt from posting if missing snapshots or versions)
      let hasSnapshots = false;
      let hasMissingLegacyData = false;

      if (order.items) {
        for (const item of order.items) {
          if (item.recipeId) {
            if (!item.recipeVersion || !item.resourceSnapshot || !item.snapshotCapturedAt) {
              hasMissingLegacyData = true;
              break;
            }
            if (item.resourceSnapshot && item.resourceSnapshot.ingredients && item.resourceSnapshot.ingredients.length > 0) {
              hasSnapshots = true;
            }
          }
        }
      }

      const isLegacy = hasMissingLegacyData || !hasSnapshots;

      if (order.inventoryPostingStatus !== 'POSTED' || !posting) {
        excludedCount++;
        if (isLegacy) {
          warnings.push(`Order '${order.id}' was excluded from analysis: Legacy order lacking inventory snapshot / posting metadata.`);
        } else if (order.inventoryPostingStatus === 'FAILED') {
          warnings.push(`Order '${order.id}' was excluded from analysis: Inventory posting explicitly flagged as FAILED.`);
        } else {
          warnings.push(`Order '${order.id}' was excluded from analysis: Active order lacking related posting ledger (Stranded/Unposted).`);
        }
        continue;
      }

      validOrders.push(order);
    }

    return {
      validOrders,
      postingsMap,
      warnings,
      excludedCount,
    };
  }

  /**
   * Calculates COGS monthly metrics for the specified year and month.
   */
  static async calculateMonthlyCOGS(
    organizationId: string,
    year: number,
    month: number
  ): Promise<MonthlyCOGSResult> {
    // Determine month bounds
    const startDate = new Date(year, month - 1, 1).getTime();
    const endDate = new Date(year, month, 1).getTime() - 1;

    const { validOrders, postingsMap, warnings, excludedCount } = await this.getIntegratedData(
      organizationId,
      startDate,
      endDate
    );

    let totalRevenue = 0;
    let totalCOGS = 0;

    for (const order of validOrders) {
      const posting = postingsMap.get(order.id)!;
      
      // Calculate actual item-by-item revenue (including options modifiers) to ensure accurate baseline
      let orderRevenue = 0;
      if (order.items) {
        order.items.forEach(item => {
          const optionsPrice = (item.optionsSelected || []).reduce((sum, opt) => sum + (opt.price || 0), 0);
          orderRevenue += item.quantity * (item.unitPrice + optionsPrice);
        });
      } else {
        orderRevenue = order.grandTotal || 0;
      }

      totalRevenue += orderRevenue;
      totalCOGS += posting.totalCalculatedCost || 0;
    }

    const grossProfit = totalRevenue - totalCOGS;
    const foodCostPercent = totalRevenue > 0 ? (totalCOGS / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCOGS,
      grossProfit,
      foodCostPercent,
      warnings,
      metadata: {
        processedOrdersCount: validOrders.length,
        excludedOrdersCount: excludedCount,
        year,
        month,
      },
    };
  }

  /**
   * Calculates individual profitability metrics for each menu item sold within a given timeframe.
   */
  static async calculateMenuItemProfitability(
    organizationId: string,
    dateRange: { startDate: Date | number | string; endDate: Date | number | string }
  ): Promise<MenuItemProfitabilityResult> {
    const startMs = this.parseTimeToMs(dateRange.startDate);
    const endMs = this.parseTimeToMs(dateRange.endDate);

    const { validOrders, postingsMap, warnings, excludedCount } = await this.getIntegratedData(
      organizationId,
      startMs,
      endMs
    );

    const itemAnalysis: Record<string, MenuItemProfitabilityRecord> = {};

    for (const order of validOrders) {
      const posting = postingsMap.get(order.id)!;

      // Calculate total item estimated food cost for this order to safely apportion actual ledger cost
      let totalOrderEstimatedCost = 0;
      if (order.items) {
        order.items.forEach(item => {
          totalOrderEstimatedCost += item.estimatedFoodCost || 0;
        });
      }

      if (order.items) {
        order.items.forEach(item => {
          const itemId = item.menuItemId;
          const itemName = item.name;

          const optionsPrice = (item.optionsSelected || []).reduce((sum, opt) => sum + (opt.price || 0), 0);
          const itemRevenue = item.quantity * (item.unitPrice + optionsPrice);

          // Standard actual cost apportioning
          let actualItemCOGS = 0;
          if (totalOrderEstimatedCost > 0) {
            const itemEst = item.estimatedFoodCost || 0;
            actualItemCOGS = posting.totalCalculatedCost * (itemEst / totalOrderEstimatedCost);
          } else {
            const counts = order.items.filter(i => !!i.recipeId).length || 1;
            actualItemCOGS = item.recipeId ? (posting.totalCalculatedCost / counts) : 0;
          }

          if (!itemAnalysis[itemId]) {
            itemAnalysis[itemId] = {
              menuItemId: itemId,
              menuItemName: itemName,
              quantitySold: 0,
              revenue: 0,
              cogs: 0,
              grossProfit: 0,
              marginPercent: 0,
            };
          }

          const record = itemAnalysis[itemId];
          record.quantitySold += item.quantity;
          record.revenue += itemRevenue;
          record.cogs += actualItemCOGS;
        });
      }
    }

    // Final calculations for each menu item
    const items: MenuItemProfitabilityRecord[] = Object.values(itemAnalysis).map(record => {
      const grossProfit = record.revenue - record.cogs;
      const marginPercent = record.revenue > 0 ? (grossProfit / record.revenue) * 100 : 0;
      return {
        ...record,
        grossProfit,
        marginPercent,
      };
    });

    return {
      items,
      warnings,
      metadata: {
        processedOrdersCount: validOrders.length,
        excludedOrdersCount: excludedCount,
        startDate: startMs,
        endDate: endMs,
      },
    };
  }

  /**
   * Sorts and splits menu items into High Performing, Low Performing, and Negative Margin classifications.
   */
  static async getTopPerformingItems(
    organizationId: string,
    dateRange: { startDate: Date | number | string; endDate: Date | number | string }
  ): Promise<TopPerformingItemsResult> {
    const profitability = await this.calculateMenuItemProfitability(organizationId, dateRange);
    const { items, warnings } = profitability;

    // Filter items with negative margin
    const negativeMargin = items.filter(item => item.grossProfit < 0);

    // Top performers (most profitable)
    const mostProfitable = [...items]
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .slice(0, 5);

    // Least performers (least profitable)
    const leastProfitable = [...items]
      .sort((a, b) => a.grossProfit - b.grossProfit)
      .slice(0, 5);

    return {
      mostProfitable,
      leastProfitable,
      negativeMargin,
      warnings,
    };
  }
}
