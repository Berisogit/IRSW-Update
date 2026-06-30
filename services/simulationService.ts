import { firestore } from './firestoreService';
import { InventoryItemDoc } from '../types/firestoreSchema';

export interface ConsumptionSimulationResult {
  inventoryItemId: string;
  ingredientName: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
  status: 'SUFFICIENT' | 'LOW_STOCK' | 'INSUFFICIENT';
  estimatedIngredientCost: number;
  recipeId?: string;
  recipeVersion?: number;
}

export interface OrderSimulationSummary {
  totalEstimatedFoodCost: number;
  totalIngredientsUsed: number;
  missingIngredients: number;
  details: ConsumptionSimulationResult[];
}

export class ConsumptionSimulationService {
  async simulateOrderConsumption(organizationId: string, orderId: string): Promise<OrderSimulationSummary> {
    const order = await firestore.orders.getById(organizationId, orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Accumulate items by recipeId (historical) or menuItemId (legacy)
    const orderItemGroups = new Map<string, {
      type: 'HISTORICAL' | 'LEGACY';
      id: string; // recipeId or menuItemId
      quantity: number;
      menuItemId: string;
      recipeVersion?: number;
    }>();

    for (const item of order.items) {
      const quantity = item.quantity || 1;
      const isHistorical = !!item.recipeId;
      const key = isHistorical ? `recipe_${item.recipeId}` : `menuItem_${item.menuItemId}`;
      
      const existing = orderItemGroups.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        orderItemGroups.set(key, {
          type: isHistorical ? 'HISTORICAL' : 'LEGACY',
          id: isHistorical ? item.recipeId! : item.menuItemId,
          quantity,
          menuItemId: item.menuItemId,
          recipeVersion: item.recipeVersion
        });
      }
    }

    // Map to accumulate inventory consumption (inventoryItemId -> {quantity, details[]})
    const inventoryConsumption = new Map<string, { quantity: number, recipeId?: string, recipeVersion?: number }>();

    for (const group of orderItemGroups.values()) {
      let recipe;
      
      if (group.type === 'HISTORICAL') {
        recipe = await firestore.recipes.getById(organizationId, group.id);
      } else {
        recipe = await firestore.recipes.getLatestRecipeVersion(organizationId, group.id);
      }

      if (!recipe) {
        continue; // Recipe not found
      }

      try {
        const consumption = await firestore.recipes.calculateRecipeConsumption(organizationId, recipe.id, group.quantity);
        for (const req of consumption) {
          const current = inventoryConsumption.get(req.inventoryItemId);
          inventoryConsumption.set(req.inventoryItemId, {
            quantity: (current?.quantity || 0) + req.requiredQuantity,
            recipeId: current?.recipeId || (group.type === 'HISTORICAL' ? group.id : recipe.id),
            recipeVersion: current?.recipeVersion || (group.type === 'HISTORICAL' ? group.recipeVersion : recipe.version)
          });
        }
      } catch (error) {
        console.warn(`Could not calculate consumption for recipe ${recipe.id}:`, error);
        // Continue simulation with other items
      }
    }

    const details: ConsumptionSimulationResult[] = [];
    let totalEstimatedFoodCost = 0;
    let missingIngredients = 0;

    for (const [inventoryItemId, consumtionData] of inventoryConsumption.entries()) {
      const requiredQuantity = consumtionData.quantity;
      const item = await firestore.inventory.getById(organizationId, inventoryItemId);
      if (!item) {
        details.push({
          inventoryItemId,
          ingredientName: 'Unknown/Deleted Ingredient',
          requiredQuantity,
          availableQuantity: 0,
          shortageQuantity: requiredQuantity,
          status: 'INSUFFICIENT',
          estimatedIngredientCost: 0,
          recipeId: consumtionData.recipeId,
          recipeVersion: consumtionData.recipeVersion
        });
        missingIngredients++;
        continue;
      }

      const availableQuantity = item.currentStock || 0;
      const shortageQuantity = Math.max(0, requiredQuantity - availableQuantity);
      
      let status: 'SUFFICIENT' | 'LOW_STOCK' | 'INSUFFICIENT' = 'SUFFICIENT';
      if (shortageQuantity > 0) {
        status = 'INSUFFICIENT';
      } else if (availableQuantity - requiredQuantity < (item.minimumStockLevel || 0)) {
        status = 'LOW_STOCK';
      }

      const estimatedIngredientCost = requiredQuantity * (item.costPerUnit || 0);
      totalEstimatedFoodCost += estimatedIngredientCost;

      if (status === 'INSUFFICIENT') {
        missingIngredients++;
      }

      details.push({
        inventoryItemId,
        ingredientName: item.name,
        requiredQuantity,
        availableQuantity,
        shortageQuantity,
        status,
        estimatedIngredientCost,
        recipeId: consumtionData.recipeId,
        recipeVersion: consumtionData.recipeVersion
      });
    }

    return {
      totalEstimatedFoodCost,
      totalIngredientsUsed: inventoryConsumption.size,
      missingIngredients,
      details
    };
  }
}

export const simulationService = new ConsumptionSimulationService();
