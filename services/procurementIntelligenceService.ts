import { firestore } from './firestoreService';
import { InventoryItemDoc, InventoryPostingDoc } from '../types/firestoreSchema';

export interface ProcurementAnalyticsParams {
  organizationId: string;
  analysisPeriodDays?: number; // e.g. 30 days for consumption baseline
}

export interface SupplierReadinessMatrix {
  preferredVendorId: string | null;
  leadTimeDays: number;
  supplierReliabilityScore: number;
}

export interface ConsumptionAnalytics {
  averageDailyUsage: number;
  averageWeeklyUsage: number;
  averageMonthlyUsage: number;
  consumptionVelocity: number; // units per day
  daysRemaining: number;
  projectedStockoutDate: number; // timestamp
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ReorderIntelligence {
  reorderPoint: number;
  safetyStock: number;
  suggestedReorderQuantity: number;
  suggestedReorderDate: number;
  urgencyScore: number; // 0-100
  priorityRanking: number; // Rank index
}

export interface ABCAnalysis {
  annualConsumptionValue: number;
  inventoryImportanceScore: number; // 0-100
  classification: 'A' | 'B' | 'C';
}

export interface ProcurementForecast {
  expectedIngredientDemand: number;
  expectedMonthlyConsumption: number;
  expectedPurchasingRequirement: number;
  expectedFoodCostExposure: number;
}

export interface ProcurementItemReport {
  inventoryItemId: string;
  inventoryItemName: string;
  currentStock: number;
  unitOfMeasure: string;
  
  consumption: ConsumptionAnalytics;
  reorder: ReorderIntelligence;
  abc: ABCAnalysis;
  forecast: ProcurementForecast;
  supplierReadiness: SupplierReadinessMatrix;
}

export interface ProcurementDashboard {
  items: ProcurementItemReport[];
  summary: {
    criticalStockouts: number;
    highRiskStockouts: number;
    totalWorkingCapitalExposure: number;
    totalPurchasingRequirement: number;
    aItemsCount: number;
    bItemsCount: number;
    cItemsCount: number;
  };
}

export class ProcurementIntelligenceService {
  /**
   * Generates a read-only procurement intelligence report.
   * Runs in O(P + I) where P = postings and I = inventory items.
   */
  static async generateProcurementReport({
    organizationId,
    analysisPeriodDays = 30
  }: ProcurementAnalyticsParams): Promise<ProcurementDashboard> {
    const analysisMs = analysisPeriodDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const startDate = now - analysisMs;

    // Fetch active items and recent postings in parallel
    const [items, postings] = await Promise.all([
      firestore.inventory.executeQuery(organizationId, {}),
      firestore.inventoryPostings.executeQuery(organizationId, {
        where: [
          { field: 'timestamp', operator: '>=', value: startDate },
          { field: 'timestamp', operator: '<=', value: now },
        ]
      })
    ]);

    // O(P) processing of postings to consumption aggregates
    // We sum up the quantity decreased per inventory item
    const consumptionMap = new Map<string, number>();
    for (const posting of postings) {
      if (posting.status !== 'POSTED') continue;
      for (const movement of posting.movements || []) {
        // Only count deductions as consumption, ignoring manual positive adjustments here (since this is usage)
        if (movement.previousStock > movement.newStock) {
          const qtyUsed = movement.previousStock - movement.newStock;
          const currentUsage = consumptionMap.get(movement.inventoryItemId) || 0;
          consumptionMap.set(movement.inventoryItemId, currentUsage + qtyUsed);
        }
      }
    }

    const reports: ProcurementItemReport[] = [];
    let totalWorkingCapital = 0;
    let totalPurchasing = 0;
    let criticalCount = 0;
    let highRiskCount = 0;
    let aCount = 0;
    let bCount = 0;
    let cCount = 0;

    // First pass to compute baseline metrics and ABC sorting values
    for (const item of items) {
      const totalPeriodUsage = consumptionMap.get(item.id) || 0;
      const averageDailyUsage = totalPeriodUsage / analysisPeriodDays;
      const averageWeeklyUsage = averageDailyUsage * 7;
      const averageMonthlyUsage = averageDailyUsage * 30;
      const consumptionVelocity = averageDailyUsage;
      
      const currentStock = item.currentStock || 0;
      const daysRemaining = averageDailyUsage > 0 ? (currentStock / averageDailyUsage) : 999;
      const projectedStockoutDate = now + (daysRemaining * 24 * 60 * 60 * 1000);

      let riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (daysRemaining <= 3) riskLevel = 'CRITICAL';
      else if (daysRemaining <= 7) riskLevel = 'HIGH';
      else if (daysRemaining <= 14) riskLevel = 'MEDIUM';

      // Mock lead time for intelligence architecture readiness
      const mockLeadTimeDays = 3;
      const mockDeliveryCycleDays = 7;
      
      // Safety Stock calculation
      const maxDailyUsage = averageDailyUsage * 1.5; // Approximation of max usage
      const maxLeadTime = mockLeadTimeDays + 2; 
      const safetyStock = (maxDailyUsage * maxLeadTime) - (averageDailyUsage * mockLeadTimeDays);
      
      // Economic Reorder Point
      const reorderPoint = (averageDailyUsage * mockLeadTimeDays) + safetyStock;
      
      // Suggested Reorder Quantity (simplified EOQ or min-max replenishment)
      const targetStockLevel = safetyStock + (averageDailyUsage * mockDeliveryCycleDays);
      let suggestedReorderQuantity = targetStockLevel - currentStock;
      if (suggestedReorderQuantity < 0) suggestedReorderQuantity = 0;

      const suggestedReorderDate = projectedStockoutDate - (mockLeadTimeDays * 24 * 60 * 60 * 1000);
      
      let urgencyScore = 0;
      if (daysRemaining <= 30) {
        urgencyScore = Math.max(0, 100 - (daysRemaining * (100 / 30))); // 100 at 0 days, 0 at 30 days
      }

      // ABC Analysis values
      const annualConsumptionQty = averageMonthlyUsage * 12;
      const unitCost = item.costPerUnit || 0;
      const annualConsumptionValue = annualConsumptionQty * unitCost;

      // Procurement Forecast (30 days outlook)
      const expectedIngredientDemand = averageMonthlyUsage;
      const expectedMonthlyConsumption = averageMonthlyUsage; // usually equal to demand 
      const expectedPurchasingRequirement = Math.max(0, (expectedMonthlyConsumption + safetyStock) - currentStock);
      const expectedFoodCostExposure = expectedPurchasingRequirement * unitCost;

      // Architecture Readiness
      const supplierReadiness: SupplierReadinessMatrix = {
        preferredVendorId: null,
        leadTimeDays: mockLeadTimeDays,
        supplierReliabilityScore: 85 // Mock metric
      };

      reports.push({
        inventoryItemId: item.id,
        inventoryItemName: item.name,
        currentStock,
        unitOfMeasure: item.unitOfMeasure,
        consumption: {
          averageDailyUsage,
          averageWeeklyUsage,
          averageMonthlyUsage,
          consumptionVelocity,
          daysRemaining,
          projectedStockoutDate,
          riskLevel
        },
        reorder: {
          reorderPoint,
          safetyStock,
          suggestedReorderQuantity,
          suggestedReorderDate,
          urgencyScore,
          priorityRanking: 0 // Will assign later
        },
        abc: {
          annualConsumptionValue,
          inventoryImportanceScore: 0,
          classification: 'C'
        },
        forecast: {
          expectedIngredientDemand,
          expectedMonthlyConsumption,
          expectedPurchasingRequirement,
          expectedFoodCostExposure
        },
        supplierReadiness
      });

      totalWorkingCapital += (currentStock * unitCost);
      totalPurchasing += expectedFoodCostExposure;
      if (riskLevel === 'CRITICAL') criticalCount++;
      if (riskLevel === 'HIGH') highRiskCount++;
    }

    // Sort to determine ABC Classification & Priorities
    // ABC Analysis: Sort by Annual Consumption Value descending
    reports.sort((a, b) => b.abc.annualConsumptionValue - a.abc.annualConsumptionValue);
    
    let cumulativeValue = 0;
    const totalAnnualValue = reports.reduce((acc, r) => acc + r.abc.annualConsumptionValue, 0);

    reports.forEach((report, index) => {
      cumulativeValue += report.abc.annualConsumptionValue;
      const percentage = totalAnnualValue > 0 ? (cumulativeValue / totalAnnualValue) * 100 : 0;
      
      let classification: 'A' | 'B' | 'C' = 'C';
      if (percentage <= 80) {
        classification = 'A';
        aCount++;
      } else if (percentage <= 95) {
        classification = 'B';
        bCount++;
      } else {
        cCount++;
      }
      
      report.abc.classification = classification;
      report.abc.inventoryImportanceScore = totalAnnualValue > 0 ? (report.abc.annualConsumptionValue / totalAnnualValue) * 100 : 0;
    });

    // Re-sort by Urgency Score to establish Priority Ranking
    reports.sort((a, b) => b.reorder.urgencyScore - a.reorder.urgencyScore);
    
    reports.forEach((report, index) => {
      report.reorder.priorityRanking = index + 1;
    });

    return {
      items: reports,
      summary: {
        criticalStockouts: criticalCount,
        highRiskStockouts: highRiskCount,
        totalWorkingCapitalExposure: totalWorkingCapital,
        totalPurchasingRequirement: totalPurchasing,
        aItemsCount: aCount,
        bItemsCount: bCount,
        cItemsCount: cCount
      }
    };
  }
}
