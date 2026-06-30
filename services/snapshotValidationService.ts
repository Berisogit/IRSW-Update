import { firestore } from './firestoreService';
import { OrderItemDoc } from '../types/firestoreSchema';

export type RecipeVersionMatchMode = 'MATCH' | 'VERSION_CHANGED' | 'RECIPE_MISSING' | 'NO_SNAPSHOT';

export interface IngredientDrift {
  readonly inventoryItemId: string;
  readonly name: string;
  readonly status: 'ADDED_INGREDIENTS' | 'REMOVED_INGREDIENTS' | 'QUANTITY_CHANGED' | 'UNCHANGED';
  readonly snapshotQuantity?: number;
  readonly currentQuantity?: number;
  readonly difference?: number;
}

export interface CostDrift {
  readonly snapshotCost: number;
  readonly currentProjectedCost: number;
  readonly costVariance: number;
  readonly variancePercentage: number;
}

export interface OrderItemValidationReport {
  readonly orderItemId: string;
  readonly menuItemId: string;
  readonly hasSnapshot: boolean;
  readonly versionMatch: RecipeVersionMatchMode;
  readonly ingredientDrifts: readonly IngredientDrift[];
  readonly costDrift: CostDrift | null;
}

export interface OrderValidationReport {
  readonly orderId: string;
  readonly itemReports: readonly OrderItemValidationReport[];
  readonly totalCostVariance: number;
  readonly totalVariancePercentage: number;
  readonly generatedAt: number;
}

export const validateRecipeVersionConsistency = async (
  organizationId: string,
  orderItem: OrderItemDoc
): Promise<RecipeVersionMatchMode> => {
  if (!orderItem.resourceSnapshot || !orderItem.recipeId) {
    return 'NO_SNAPSHOT';
  }

  const currentRecipe = await firestore.recipes.getLatestRecipeVersion(organizationId, orderItem.menuItemId);

  if (!currentRecipe) {
    return 'RECIPE_MISSING';
  }

  if (currentRecipe.version !== orderItem.recipeVersion) {
    return 'VERSION_CHANGED';
  }

  return 'MATCH';
};

export const validateIngredientConsistency = async (
  organizationId: string,
  orderItem: OrderItemDoc
): Promise<readonly IngredientDrift[]> => {
  if (!orderItem.resourceSnapshot || !orderItem.recipeId) {
    return Object.freeze([]);
  }

  const currentRecipe = await firestore.recipes.getLatestRecipeVersion(organizationId, orderItem.menuItemId);
  if (!currentRecipe) {
    const removedDrifts = orderItem.resourceSnapshot.ingredients.map(ing => Object.freeze({
      inventoryItemId: ing.inventoryItemId,
      name: ing.inventoryItemName,
      status: 'REMOVED_INGREDIENTS' as const,
      snapshotQuantity: ing.quantity,
      currentQuantity: 0,
      difference: -ing.quantity
    }));
    return Object.freeze(removedDrifts);
  }

  const currentSnapshot = await firestore.recipes.buildRecipeSnapshot(organizationId, currentRecipe.id);
  
  const drifts: IngredientDrift[] = [];
  const snapshotIngs = new Map(orderItem.resourceSnapshot.ingredients.map(i => [i.inventoryItemId, i]));
  const currentIngs = new Map(currentSnapshot.ingredients.map(i => [i.inventoryItemId, i]));

  for (const [id, snapIng] of snapshotIngs) {
    const currIng = currentIngs.get(id);
    if (!currIng) {
      drifts.push(Object.freeze({
        inventoryItemId: id,
        name: snapIng.inventoryItemName,
        status: 'REMOVED_INGREDIENTS',
        snapshotQuantity: snapIng.quantity,
        currentQuantity: 0,
        difference: -snapIng.quantity
      }));
    } else {
      if (currIng.quantity !== snapIng.quantity) {
        drifts.push(Object.freeze({
          inventoryItemId: id,
          name: snapIng.inventoryItemName,
          status: 'QUANTITY_CHANGED',
          snapshotQuantity: snapIng.quantity,
          currentQuantity: currIng.quantity,
          difference: currIng.quantity - snapIng.quantity
        }));
      } else {
        drifts.push(Object.freeze({
          inventoryItemId: id,
          name: snapIng.inventoryItemName,
          status: 'UNCHANGED',
          snapshotQuantity: snapIng.quantity,
          currentQuantity: currIng.quantity,
          difference: 0
        }));
      }
    }
  }

  for (const [id, currIng] of currentIngs) {
    if (!snapshotIngs.has(id)) {
      drifts.push(Object.freeze({
        inventoryItemId: id,
        name: currIng.inventoryItemName,
        status: 'ADDED_INGREDIENTS',
        snapshotQuantity: 0,
        currentQuantity: currIng.quantity,
        difference: currIng.quantity
      }));
    }
  }

  return Object.freeze(drifts);
};

export const validateCostConsistency = async (
  organizationId: string,
  orderItem: OrderItemDoc
): Promise<CostDrift | null> => {
  if (orderItem.estimatedFoodCost === undefined) {
    return null;
  }
  
  const currentRecipe = await firestore.recipes.getLatestRecipeVersion(organizationId, orderItem.menuItemId);
  if (!currentRecipe) {
    return null;
  }

  const currentSnapshot = await firestore.recipes.buildRecipeSnapshot(organizationId, currentRecipe.id);
  const multiplier = orderItem.quantity / (currentRecipe.yield || 1);
  let currentProjectedCost = 0;

  for (const ingredient of currentSnapshot.ingredients) {
    if (ingredient.estimatedUnitCost !== undefined) {
      const requiredQuantity = ingredient.quantity * multiplier;
      currentProjectedCost += requiredQuantity * ingredient.estimatedUnitCost;
    }
  }

  const snapshotCost = orderItem.estimatedFoodCost;
  const costVariance = currentProjectedCost - snapshotCost;
  const variancePercentage = snapshotCost === 0 ? 0 : (costVariance / snapshotCost) * 100;

  return Object.freeze({
    snapshotCost,
    currentProjectedCost,
    costVariance,
    variancePercentage
  });
};

export const generateOrderValidationReport = async (
  organizationId: string,
  orderId: string
): Promise<OrderValidationReport | null> => {
  const order = await firestore.orders.getById(organizationId, orderId);
  if (!order) return null;

  const itemReports: OrderItemValidationReport[] = [];
  let totalSnapshotCost = 0;
  let totalCurrentCost = 0;

  for (const item of order.items) {
    const versionMatch = await validateRecipeVersionConsistency(organizationId, item);
    const ingredientDrifts = await validateIngredientConsistency(organizationId, item);
    const costDrift = await validateCostConsistency(organizationId, item);

    if (costDrift) {
      totalSnapshotCost += costDrift.snapshotCost;
      totalCurrentCost += costDrift.currentProjectedCost;
    }

    itemReports.push(Object.freeze({
      orderItemId: item.id,
      menuItemId: item.menuItemId,
      hasSnapshot: !!item.resourceSnapshot,
      versionMatch,
      ingredientDrifts,
      costDrift
    }));
  }

  const totalCostVariance = totalCurrentCost - totalSnapshotCost;
  const totalVariancePercentage = totalSnapshotCost === 0 ? 0 : (totalCostVariance / totalSnapshotCost) * 100;

  const report: OrderValidationReport = {
    orderId,
    itemReports: Object.freeze(itemReports),
    totalCostVariance,
    totalVariancePercentage,
    generatedAt: Date.now()
  };

  return Object.freeze(report);
};
