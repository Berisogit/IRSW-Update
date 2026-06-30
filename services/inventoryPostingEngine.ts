import { runTransaction, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FirestoreCollections } from './repository';
import { 
  OrderDoc, 
  InventoryPostingDoc, 
  OrderStatus, 
  InventoryPostingStatus,
  InventoryPostingMovement,
  PaymentStatus
} from '../types/firestoreSchema';
import { UnitConversionService } from './unitConversionService';

export class InventoryPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryPostingError';
  }
}

export class InventoryEligibilityError extends InventoryPostingError {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryEligibilityError';
  }
}

export class InventoryConversionError extends InventoryPostingError {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryConversionError';
  }
}

export class InventoryPostingEngine {
  static async createInventoryPosting(
    organizationId: string,
    orderId: string,
    performedBy: string
  ): Promise<string> {
      if (!db) {
        throw new Error("Firebase database is not initialized.");
      }

      return await runTransaction(db, async (transaction) => {
        // STEP 1: Re-read order
        const orderRef = doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.ORDERS}`, orderId);
      const orderSnap = await transaction.get(orderRef);

      if (!orderSnap.exists()) {
        throw new InventoryPostingError(`Order ${orderId} does not exist`);
      }

      const order = orderSnap.data() as OrderDoc;

      // STEP 2: Re-check posting status
      if (order.inventoryPostingStatus === InventoryPostingStatus.POSTED) {
        throw new InventoryPostingError(`Order ${orderId} is already posted`);
      }

      // Verify order status is eligible
      if (order.status !== 'PAID' && order.status !== 'CLOSED') {
        throw new InventoryEligibilityError(`Order status ${order.status} is not eligible for posting`);
      }

      // Check legacy constraints and snapshots
      let hasSnapshots = false;
      let hasMissingLegacyData = false;

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

      if (hasMissingLegacyData || !hasSnapshots) {
        throw new InventoryEligibilityError("Order is not eligible for automated inventory posting.");
      }

      // STEP 3: Verify posting document does not already exist
      const postingRef = doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY_POSTINGS}`, orderId);
      const postingSnap = await transaction.get(postingRef);
      if (postingSnap.exists()) {
        throw new InventoryPostingError(`Inventory posting for order ${orderId} already exists`);
      }

      // STEP 4: Read all required inventory items
      const rawRequirements: { 
        inventoryItemId: string; 
        quantity: number; 
        unitOfMeasure: string;
      }[] = [];

      for (const item of order.items) {
        if (item.resourceSnapshot && item.resourceSnapshot.ingredients) {
          for (const ingredient of item.resourceSnapshot.ingredients) {
            const totalQuantity = ingredient.quantity * item.quantity;
            rawRequirements.push({
              inventoryItemId: ingredient.inventoryItemId,
              quantity: totalQuantity,
              unitOfMeasure: ingredient.unitOfMeasure
            });
          }
        }
      }

      const uniqueItemIds = Array.from(new Set(rawRequirements.map(req => req.inventoryItemId)));
      const inventoryRefs = uniqueItemIds.map(id => doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY}`, id));
      
      const inventorySnaps = await Promise.all(inventoryRefs.map(ref => transaction.get(ref)));
      const inventoryMap = new Map<string, any>();
      uniqueItemIds.forEach((id, index) => {
        if (inventorySnaps[index].exists()) {
          inventoryMap.set(id, inventorySnaps[index].data());
        } else {
          throw new InventoryPostingError(`Inventory item ${id} not found during posting`);
        }
      });

      // Aggregate deductions safely
      const aggregatedRequirements: Record<string, { quantity: number; unitOfMeasure: string }> = {};

      for (const req of rawRequirements) {
        try {
          const invData = inventoryMap.get(req.inventoryItemId);
          const targetUnit = invData.unitOfMeasure;
          const normalizedQuantity = UnitConversionService.convertQuantity(req.quantity, req.unitOfMeasure, targetUnit);

          if (!aggregatedRequirements[req.inventoryItemId]) {
            aggregatedRequirements[req.inventoryItemId] = { quantity: 0, unitOfMeasure: targetUnit };
          }
          aggregatedRequirements[req.inventoryItemId].quantity += normalizedQuantity;
        } catch (error: any) {
          throw new InventoryConversionError(`Conversion failed for item ${req.inventoryItemId}: ${error.message}`);
        }
      }

      // STEP 5, 6, 7: Calculate deductions & update
      const movements: InventoryPostingMovement[] = [];
      let totalCalculatedCost = 0;

      for (const [id, req] of Object.entries(aggregatedRequirements)) {
        const invData = inventoryMap.get(id);
        const previousStock = invData.currentStock || 0;
        // Allows negative stock
        const newStock = previousStock - req.quantity;
        const unitCost = invData.unitCost || 0;
        const totalCost = unitCost * req.quantity;

        movements.push({
          inventoryItemId: id,
          quantity: req.quantity,
          unitOfMeasure: req.unitOfMeasure,
          previousStock,
          newStock,
          unitCost,
          totalCost
        });

        totalCalculatedCost += totalCost;

        const invRef = doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY}`, id);
        transaction.update(invRef, {
          currentStock: newStock,
          updatedAt: Date.now(),
          updatedBy: performedBy
        });
      }

      const snapshotReferences: { recipeId: string; recipeVersion: number }[] = [];
      for (const item of order.items) {
        if (item.recipeId && item.recipeVersion) {
           if (!snapshotReferences.find(s => s.recipeId === item.recipeId && s.recipeVersion === item.recipeVersion)) {
             snapshotReferences.push({
               recipeId: item.recipeId,
               recipeVersion: item.recipeVersion
             });
           }
        }
      }

      const timestamp = Date.now();

      // STEP 8: Create InventoryPosting ledger document
      const postingData: Partial<InventoryPostingDoc> = {
        organizationId,
        orderId,
        timestamp,
        status: InventoryPostingStatus.POSTED,
        actionBy: performedBy,
        movements,
        snapshotReferences,
        totalCalculatedCost,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: performedBy,
        updatedBy: performedBy
      };

      transaction.set(postingRef, postingData);

      // STEP 9: Update OrderDoc
      transaction.update(orderRef, {
        inventoryPostingStatus: InventoryPostingStatus.POSTED,
        inventoryPostingId: orderId,
        inventoryPostedAt: timestamp,
        updatedAt: timestamp,
        updatedBy: performedBy
      });

      return orderId;
    });
  }

  static async completeOrderPaymentAndInventoryPosting(
    organizationId: string,
    orderId: string,
    performedBy: string
  ): Promise<string> {
      if (!db) {
        throw new Error("Firebase database is not initialized.");
      }

      return await runTransaction(db, async (transaction) => {
        // STEP 1: Re-read the OrderDoc inside a Firestore transaction.
        const orderRef = doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.ORDERS}`, orderId);
        const orderSnap = await transaction.get(orderRef);

        if (!orderSnap.exists()) {
          throw new InventoryPostingError(`Order ${orderId} does not exist`);
        }

        const order = orderSnap.data() as OrderDoc;

        // STEP 2: Validate eligibility
        if (order.status === OrderStatus.PAID || order.status === OrderStatus.CLOSED) {
          throw new InventoryPostingError(`Order ${orderId} is already paid or closed.`);
        }
        if (order.paymentStatus === PaymentStatus.PAID) {
          throw new InventoryPostingError(`Payment for order ${orderId} is already finalized.`);
        }
        if (order.inventoryPostingStatus === InventoryPostingStatus.POSTED) {
          throw new InventoryPostingError(`Order ${orderId} has already posted inventory.`);
        }
        if (order.status === OrderStatus.CANCELLED) {
          throw new InventoryPostingError(`Order ${orderId} is cancelled and cannot be paid.`);
        }

        // Check if this is a legacy order
        let hasSnapshots = false;
        let hasMissingLegacyData = false;

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

        const isLegacy = hasMissingLegacyData || !hasSnapshots;
        const timestamp = Date.now();

        if (isLegacy) {
          // Legacy orders MUST continue functioning without being posted to inventory
          transaction.update(orderRef, {
            status: OrderStatus.PAID,
            paymentStatus: PaymentStatus.PAID,
            updatedAt: timestamp,
            updatedBy: performedBy
          });
          return orderId;
        }

        // STEP 3: Execute inventory posting logic
        // Verify posting document does not already exist
        const postingRef = doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY_POSTINGS}`, orderId);
        const postingSnap = await transaction.get(postingRef);
        if (postingSnap.exists()) {
          throw new InventoryPostingError(`Inventory posting for order ${orderId} already exists`);
        }

        // Read all required inventory items
        const rawRequirements: { 
          inventoryItemId: string; 
          quantity: number; 
          unitOfMeasure: string;
        }[] = [];

        for (const item of order.items) {
          if (item.resourceSnapshot && item.resourceSnapshot.ingredients) {
            for (const ingredient of item.resourceSnapshot.ingredients) {
              const totalQuantity = ingredient.quantity * item.quantity;
              rawRequirements.push({
                inventoryItemId: ingredient.inventoryItemId,
                quantity: totalQuantity,
                unitOfMeasure: ingredient.unitOfMeasure
              });
            }
          }
        }

        const uniqueItemIds = Array.from(new Set(rawRequirements.map(req => req.inventoryItemId)));
        const inventoryRefs = uniqueItemIds.map(id => doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY}`, id));
        
        const inventorySnaps = await Promise.all(inventoryRefs.map(ref => transaction.get(ref)));
        const inventoryMap = new Map<string, any>();
        uniqueItemIds.forEach((id, index) => {
          if (inventorySnaps[index].exists()) {
            inventoryMap.set(id, inventorySnaps[index].data());
          } else {
            throw new InventoryPostingError(`Inventory item ${id} not found during posting`);
          }
        });

        // Aggregate deductions safely
        const aggregatedRequirements: Record<string, { quantity: number; unitOfMeasure: string }> = {};

        for (const req of rawRequirements) {
          try {
            const invData = inventoryMap.get(req.inventoryItemId);
            const targetUnit = invData.unitOfMeasure;
            const normalizedQuantity = UnitConversionService.convertQuantity(req.quantity, req.unitOfMeasure, targetUnit);

            if (!aggregatedRequirements[req.inventoryItemId]) {
              aggregatedRequirements[req.inventoryItemId] = { quantity: 0, unitOfMeasure: targetUnit };
            }
            aggregatedRequirements[req.inventoryItemId].quantity += normalizedQuantity;
          } catch (error: any) {
            throw new InventoryConversionError(`Conversion failed for item ${req.inventoryItemId}: ${error.message}`);
          }
        }

        // STEP 5: Calculate deductions & prepare movements
        const movements: InventoryPostingMovement[] = [];
        let totalCalculatedCost = 0;

        for (const [id, req] of Object.entries(aggregatedRequirements)) {
          const invData = inventoryMap.get(id);
          const previousStock = invData.currentStock || 0;
          const newStock = previousStock - req.quantity;
          const unitCost = invData.unitCost || 0;
          const totalCost = unitCost * req.quantity;

          movements.push({
            inventoryItemId: id,
            quantity: req.quantity,
            unitOfMeasure: req.unitOfMeasure,
            previousStock,
            newStock,
            unitCost,
            totalCost
          });

          totalCalculatedCost += totalCost;

          // STEP 7: Update inventory quantities inside transaction
          const invRef = doc(db as import('firebase/firestore').Firestore, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY}`, id);
          transaction.update(invRef, {
            currentStock: newStock,
            updatedAt: timestamp,
            updatedBy: performedBy
          });
        }

        const snapshotReferences: { recipeId: string; recipeVersion: number }[] = [];
        for (const item of order.items) {
          if (item.recipeId && item.recipeVersion) {
             if (!snapshotReferences.find(s => s.recipeId === item.recipeId && s.recipeVersion === item.recipeVersion)) {
               snapshotReferences.push({
                 recipeId: item.recipeId,
                 recipeVersion: item.recipeVersion
               });
             }
          }
        }

        // STEP 8: Create immutable ledger document inside transaction
        const postingData: Partial<InventoryPostingDoc> = {
          organizationId,
          orderId,
          timestamp,
          status: InventoryPostingStatus.POSTED,
          actionBy: performedBy,
          movements,
          snapshotReferences,
          totalCalculatedCost,
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: performedBy,
          updatedBy: performedBy
        };

        transaction.set(postingRef, postingData);

        // STEP 9: Update OrderDoc inside transaction (PAID/PAID and POSTED)
        transaction.update(orderRef, {
          status: OrderStatus.PAID,
          paymentStatus: PaymentStatus.PAID,
          inventoryPostingStatus: InventoryPostingStatus.POSTED,
          inventoryPostingId: orderId,
          inventoryPostedAt: timestamp,
          updatedAt: timestamp,
          updatedBy: performedBy
        });

        return orderId;
      });
  }
}
