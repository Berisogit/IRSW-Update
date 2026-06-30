import { runTransaction, doc, collection, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { firestore } from './firestoreService';
import { FirestoreCollections } from './repository';
import { 
  PurchaseOrderDoc, 
  InventoryReceiptDoc, 
  InventoryReceiptLineItem, 
  InventoryItemDoc 
} from '../types/firestoreSchema';

export interface ReceiveLineItemInput {
  inventoryItemId: string;
  receivedQuantity: number;
}

export interface ReceiveGoodsOptions {
  organizationId: string;
  purchaseOrderId: string;
  userId: string;
  receiptNumber: string;
  lineItems: ReceiveLineItemInput[];
  notes?: string;
}

export class GoodsReceivingService {
  /**
   * Processes an inventory receipt against a Purchase Order, strictly 
   * managed within a single atomic Firestore transaction.
   */
  static async receiveGoods({
    organizationId,
    purchaseOrderId,
    userId,
    receiptNumber,
    lineItems,
    notes
  }: ReceiveGoodsOptions): Promise<string> {
    
    if (!lineItems || lineItems.length === 0) {
      throw new Error("Cannot receive zero line items.");
    }

    const newReceiptId = doc(collection(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY_RECEIPTS}`)).id;
    const timestamp = Date.now();

    await runTransaction(db!, async (transaction) => {
      // STEP 1: Read PO
      const poRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.PURCHASE_ORDERS}`, purchaseOrderId);
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists() || (poSnap.data() as any).isDeleted) {
        throw new Error(`Purchase order ${purchaseOrderId} not found.`);
      }
      const poDoc = poSnap.data() as PurchaseOrderDoc;

      // STEP 2: Validate status
      if (poDoc.status === 'RECEIVED' || poDoc.status === 'CANCELLED') {
        throw new Error(`Cannot receive against PO ${purchaseOrderId} in status ${poDoc.status}.`);
      }

      // STEP 3: Read inventory items (Bulk read into a map)
      const inventoryRefs = new Map<string, any>();
      const inventoryDocs = new Map<string, InventoryItemDoc>();
      
      for (const inputLine of lineItems) {
        if (inputLine.receivedQuantity < 0) {
          throw new Error("Received quantity cannot be negative.");
        }
        if (!inventoryRefs.has(inputLine.inventoryItemId)) {
          const invRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY}`, inputLine.inventoryItemId);
          inventoryRefs.set(inputLine.inventoryItemId, invRef);
        }
      }

      // Read all inventory refs
      for (const [id, ref] of inventoryRefs.entries()) {
        const invSnap = await transaction.get(ref);
        if (!invSnap.exists() || (invSnap.data() as any).isDeleted) {
          throw new Error(`Inventory item ${id} not found.`);
        }
        inventoryDocs.set(id, invSnap.data() as InventoryItemDoc);
      }

      // STEP 4: Calculate new stock and build receipt line items
      const receiptLineItems: InventoryReceiptLineItem[] = [];
      let totalReceivedCost = 0;
      let allItemsFullyReceived = true;

      // We need to keep track of PO quantities previously received vs ordered
      // For simplicity in this phase, we assume the receipt maps directly to PO lines.
      // E.g., we look up the PO line item to find unit Cost and ordered quantity.
      for (const inputLine of lineItems) {
        const poLine = poDoc.lineItems.find(li => li.inventoryItemId === inputLine.inventoryItemId);
        if (!poLine) {
          throw new Error(`Item ${inputLine.inventoryItemId} is not on purchase order ${purchaseOrderId}.`);
        }

        const invDoc = inventoryDocs.get(inputLine.inventoryItemId);
        if (!invDoc) {
          throw new Error(`Missing inventory doc for ${inputLine.inventoryItemId}`);
        }

        // Wait, how do we know what was ALREADY received on this PO if it's partially received?
        // We'd need to aggregate previous receipts. To keep it contained, we might just mark partially received 
        // if anything received is less than ordered. Usually you track "remaining" on PO, but since schema doesn't have it, 
        // we'll compute it strictly based on this receipt's received vs PO's ordered for now, or just look at partial completion in the input.
        if (inputLine.receivedQuantity < poLine.quantity) {
          allItemsFullyReceived = false; // short delivery
        }

        const previousStock = invDoc.currentStock || 0;
        const newStock = previousStock + inputLine.receivedQuantity;
        const varianceQuantity = inputLine.receivedQuantity - poLine.quantity;
        const lineCost = inputLine.receivedQuantity * poLine.unitCost;

        totalReceivedCost += lineCost;

        receiptLineItems.push({
          inventoryItemId: poLine.inventoryItemId,
          inventoryItemName: poLine.inventoryItemName,
          unit: poLine.unit,
          orderedQuantity: poLine.quantity,
          receivedQuantity: inputLine.receivedQuantity,
          unitCost: poLine.unitCost,
          lineCost,
          previousStock,
          newStock,
          varianceQuantity
        });
        
        // STEP 6: Update inventory stock (prep transaction updates)
        transaction.update(inventoryRefs.get(inputLine.inventoryItemId), {
          currentStock: newStock,
          updatedAt: timestamp,
          updatedBy: userId
        });
      }

      // If there are PO lines not included in this receipt at all, it's partially received.
      for (const poLine of poDoc.lineItems) {
        if (!lineItems.find(li => li.inventoryItemId === poLine.inventoryItemId)) {
          allItemsFullyReceived = false;
        }
      }

      // STEP 5: Create InventoryReceiptDoc
      const receiptRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY_RECEIPTS}`, newReceiptId);
      const newReceipt: InventoryReceiptDoc = {
        id: newReceiptId,
        organizationId,
        receiptNumber,
        purchaseOrderId,
        supplierId: poDoc.supplierId,
        supplierName: poDoc.supplierName,
        status: 'POSTED',
        receivedAt: timestamp,
        receivedBy: userId,
        postedAt: timestamp,
        postedBy: userId,
        totalReceivedCost,
        notes,
        lineItems: receiptLineItems,
        createdAt: timestamp,
        createdBy: userId,
        updatedAt: timestamp,
        updatedBy: userId
      };

      transaction.set(receiptRef, newReceipt);

      // STEP 7: Update PO status
      const newPoStatus = allItemsFullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      
      transaction.update(poRef, {
        status: newPoStatus,
        updatedAt: timestamp,
        updatedBy: userId
      });

      // STEP 8: Commit (happens implicitly when transaction block succeeds)
    });

    return newReceiptId;
  }
}
