import { runTransaction, doc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { firestore } from './firestoreService';
import { FirestoreCollections } from './repository';
import { PurchaseOrderDoc, PurchaseOrderApprovalDoc, PurchaseOrderStatus } from '../types/firestoreSchema';

export class PurchaseOrderWorkflowService {
  /**
   * Submit a PO for approval
   */
  static async submitForApproval(organizationId: string, purchaseOrderId: string, userId: string, userRole: string): Promise<void> {
    if (!['super_admin', 'system_admin', 'owner', 'manager'].includes(userRole)) {
      throw new Error(`Role ${userRole} is not authorized to submit purchase orders.`);
    }

    const timestamp = Date.now();
    await runTransaction(db!, async (transaction) => {
      const poRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.PURCHASE_ORDERS}`, purchaseOrderId);
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists()) {
        throw new Error(`Purchase order ${purchaseOrderId} not found.`);
      }

      const poDoc = poSnap.data() as PurchaseOrderDoc;
      if (poDoc.status !== 'DRAFT') {
        throw new Error(`Can only submit DRAFT purchase orders. Current status: ${poDoc.status}`);
      }

      transaction.update(poRef, {
        status: 'PENDING_APPROVAL',
        updatedAt: timestamp,
        updatedBy: userId
      });
    });
  }

  /**
   * Approve a PO
   */
  static async approvePurchaseOrder(organizationId: string, purchaseOrderId: string, userId: string, userRole: string, notes?: string): Promise<void> {
    if (!['SUPER_ADMIN', 'OWNER'].includes(userRole)) {
      throw new Error(`Role ${userRole} is not authorized to approve purchase orders.`);
    }

    const timestamp = Date.now();
    await runTransaction(db!, async (transaction) => {
      const poRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.PURCHASE_ORDERS}`, purchaseOrderId);
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists()) {
        throw new Error(`Purchase order ${purchaseOrderId} not found.`);
      }

      const poDoc = poSnap.data() as PurchaseOrderDoc;
      if (poDoc.status !== 'PENDING_APPROVAL') {
        throw new Error(`Can only approve PENDING_APPROVAL purchase orders. Current status: ${poDoc.status}`);
      }

      // Create an approval doc
      const approvalRef = doc(collection(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.PO_APPROVALS}`));
      const approvalDoc: Omit<PurchaseOrderApprovalDoc, 'id'> = {
        organizationId,
        purchaseOrderId,
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: timestamp,
        notes,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: userId,
        updatedBy: userId
      };

      transaction.set(approvalRef, approvalDoc);

      transaction.update(poRef, {
        status: 'APPROVED',
        updatedAt: timestamp,
        updatedBy: userId
      });
    });
  }

  /**
   * Reject a PO
   */
  static async rejectPurchaseOrder(organizationId: string, purchaseOrderId: string, userId: string, userRole: string, notes?: string): Promise<void> {
    if (!['SUPER_ADMIN', 'OWNER'].includes(userRole)) {
      throw new Error(`Role ${userRole} is not authorized to reject purchase orders.`);
    }

    const timestamp = Date.now();
    await runTransaction(db!, async (transaction) => {
      const poRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.PURCHASE_ORDERS}`, purchaseOrderId);
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists()) {
        throw new Error(`Purchase order ${purchaseOrderId} not found.`);
      }

      const poDoc = poSnap.data() as PurchaseOrderDoc;
      if (poDoc.status !== 'PENDING_APPROVAL') {
        throw new Error(`Can only reject PENDING_APPROVAL purchase orders. Current status: ${poDoc.status}`);
      }

      // Create an approval doc
      const approvalRef = doc(collection(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.PO_APPROVALS}`));
      const approvalDoc: Omit<PurchaseOrderApprovalDoc, 'id'> = {
        organizationId,
        purchaseOrderId,
        status: 'REJECTED',
        approvedBy: userId,
        approvedAt: timestamp,
        notes,
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: userId,
        updatedBy: userId
      };

      transaction.set(approvalRef, approvalDoc);

      transaction.update(poRef, {
        status: 'REJECTED',
        updatedAt: timestamp,
        updatedBy: userId
      });
    });
  }
}
