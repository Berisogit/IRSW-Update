import { firestore } from './firestoreService';
import { OrderItemDoc, RecipeResourceSnapshot } from '../types/firestoreSchema';

export interface OrderItemSnapshotPayload {
  recipeId: string;
  recipeVersion: number;
  resourceSnapshot: RecipeResourceSnapshot;
  estimatedFoodCost: number;
  snapshotCapturedAt: number;
}

/**
 * Service to capture an immutable snapshot of an order item's resource requirements
 * at a specific point in time. This service performs reads only and does not
 * execute recipes or modify inventory.
 */
export const captureOrderItemSnapshot = async (
  organizationId: string,
  orderItem: OrderItemDoc
): Promise<OrderItemSnapshotPayload | null> => {
  // 1 & 2. Identify mapping and resolve latest recipe version
  const recipe = await firestore.recipes.getLatestRecipeVersion(organizationId, orderItem.menuItemId);
  if (!recipe) {
    return null;
  }

  // 3. Build immutable resource snapshot
  const resourceSnapshot = await firestore.recipes.buildRecipeSnapshot(organizationId, recipe.id);

  // 4. Calculate estimated food cost
  const multiplier = orderItem.quantity / (recipe.yield || 1);
  let estimatedFoodCost = 0;

  for (const ingredient of resourceSnapshot.ingredients) {
    if (ingredient.estimatedUnitCost !== undefined) {
      const requiredQuantity = ingredient.quantity * multiplier;
      estimatedFoodCost += requiredQuantity * ingredient.estimatedUnitCost;
    }
  }

  // 5. Return snapshot payload as an immutable object
  const payload: OrderItemSnapshotPayload = {
    recipeId: recipe.id,
    recipeVersion: recipe.version || 1,
    resourceSnapshot,
    estimatedFoodCost,
    snapshotCapturedAt: Date.now()
  };

  return Object.freeze(payload);
};
