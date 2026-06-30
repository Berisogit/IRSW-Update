import { runTransaction, doc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FirestoreCollections } from './repository';
import { SupplierPaymentDoc, SupplierInvoiceDoc, SupplierInvoiceStatus } from '../types/firestoreSchema';

export class PaymentProcessingService {
  /**
   * Posts a payment against an approved invoice
   */
  static async postPayment(
    organizationId: string, 
    invoiceId: string, 
    amount: number, 
    paymentMethod: string, 
    userId: string, 
    userRole: string,
    referenceNumber?: string
  ): Promise<string> {
    if (!['SUPER_ADMIN', 'OWNER'].includes(userRole)) {
      throw new Error(`Role ${userRole} is not authorized to post payments.`);
    }

    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    let paymentIdToReturn = '';

    await runTransaction(db!, async (transaction) => {
        const invoiceRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.SUPPLIER_INVOICES}`, invoiceId);
        const invoiceSnap = await transaction.get(invoiceRef);

        if (!invoiceSnap.exists() || (invoiceSnap.data() as any).isDeleted) {
            throw new Error(`Invoice ${invoiceId} not found.`);
        }

        const invoiceDoc = invoiceSnap.data() as SupplierInvoiceDoc;

        if (invoiceDoc.status !== 'APPROVED' && invoiceDoc.status !== 'PARTIALLY_PAID') {
            throw new Error(`Cannot post payment against invoice in ${invoiceDoc.status} state. Only APPROVED or PARTIALLY_PAID.`);
        }

        // small floating point tolerance
        if (amount > invoiceDoc.balanceDue + 0.01) {
             throw new Error(`Payment amount ${amount} exceeds balance due ${invoiceDoc.balanceDue}.`);
        }

        const newAmountPaid = invoiceDoc.amountPaid + amount;
        const newBalanceDue = Math.max(0, invoiceDoc.totalAmount - newAmountPaid);
        
        let newStatus: SupplierInvoiceStatus = invoiceDoc.status;
        if (newBalanceDue === 0) {
            newStatus = 'PAID';
        } else {
            newStatus = 'PARTIALLY_PAID';
        }

        const paymentColRef = collection(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.SUPPLIER_PAYMENTS}`);
        const paymentRef = doc(paymentColRef);
        paymentIdToReturn = paymentRef.id;
        
        const timestamp = Date.now();

        const paymentDoc: Omit<SupplierPaymentDoc, 'id'> = {
           organizationId,
           invoiceId,
           supplierId: invoiceDoc.supplierId,
           amount,
           paymentDate: timestamp,
           paymentMethod,
           referenceNumber,
           status: 'POSTED',
           postedBy: userId,
           createdAt: timestamp,
           updatedAt: timestamp,
           createdBy: userId,
           updatedBy: userId
        };

        transaction.set(paymentRef, paymentDoc);
        
        transaction.update(invoiceRef, {
            amountPaid: newAmountPaid,
            balanceDue: newBalanceDue,
            status: newStatus,
            updatedAt: timestamp,
            updatedBy: userId
        });
    });

    return paymentIdToReturn;
  }

  /**
   * Reverses a posted payment
   */
  static async reversePayment(
    organizationId: string,
    paymentId: string,
    userId: string,
    userRole: string
  ): Promise<void> {
    if (!['SUPER_ADMIN', 'OWNER'].includes(userRole)) {
      throw new Error(`Role ${userRole} is not authorized to reverse payments.`);
    }

    await runTransaction(db!, async (transaction) => {
        const paymentRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.SUPPLIER_PAYMENTS}`, paymentId);
        const paymentSnap = await transaction.get(paymentRef);

        if (!paymentSnap.exists() || (paymentSnap.data() as any).isDeleted) {
            throw new Error(`Payment ${paymentId} not found.`);
        }

        const paymentDoc = paymentSnap.data() as SupplierPaymentDoc;

        if (paymentDoc.status !== 'POSTED') {
            throw new Error(`Cannot reverse payment in ${paymentDoc.status} state. Only POSTED updates are supported.`);
        }

        const invoiceRef = doc(db!, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.SUPPLIER_INVOICES}`, paymentDoc.invoiceId);
        const invoiceSnap = await transaction.get(invoiceRef);

        if (!invoiceSnap.exists() || (invoiceSnap.data() as any).isDeleted) {
            throw new Error(`Related Invoice ${paymentDoc.invoiceId} not found.`);
        }

        const invoiceDoc = invoiceSnap.data() as SupplierInvoiceDoc;

        const newAmountPaid = Math.max(0, invoiceDoc.amountPaid - paymentDoc.amount);
        const newBalanceDue = invoiceDoc.totalAmount - newAmountPaid;

        let newStatus: SupplierInvoiceStatus = invoiceDoc.status;
        if (newBalanceDue === invoiceDoc.totalAmount) {
             newStatus = 'APPROVED';
        } else if (newBalanceDue > 0) {
             newStatus = 'PARTIALLY_PAID';
        }

        const timestamp = Date.now();

        transaction.update(paymentRef, {
            status: 'REVERSED',
            updatedAt: timestamp,
            updatedBy: userId
        });

        transaction.update(invoiceRef, {
            amountPaid: newAmountPaid,
            balanceDue: newBalanceDue,
            status: newStatus,
            updatedAt: timestamp,
            updatedBy: userId
        });
    });
  }
}
