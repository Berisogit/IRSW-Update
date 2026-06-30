import { firestore } from './firestoreService';
import { InvoiceMatchResultDoc, SupplierInvoiceStatus } from '../types/firestoreSchema';

export class InvoiceMatchingService {
  static async performThreeWayMatch(organizationId: string, invoiceId: string, userId: string): Promise<InvoiceMatchResultDoc> {
    const invoice = await firestore.supplierInvoices.getById(organizationId, invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

    let discrepancies: string[] = [];
    let stateMatched = true;

    // 1. Validate PO exists
    if (!invoice.purchaseOrderId) {
        discrepancies.push('MISSING_PO');
        stateMatched = false;
    }

    // 2. Validate Receipt exists
    if (!invoice.receiptId) {
        discrepancies.push('MISSING_RECEIPT');
        stateMatched = false;
    }

    if (stateMatched && invoice.purchaseOrderId && invoice.receiptId) {
        const po = await firestore.purchaseOrders.getById(organizationId, invoice.purchaseOrderId);
        const receipt = await firestore.inventoryReceipts.getById(organizationId, invoice.receiptId);

        if (!po) {
             discrepancies.push('MISSING_PO');
             stateMatched = false;
        } else if (po.supplierId !== invoice.supplierId) {
             discrepancies.push('SUPPLIER_MISMATCH');
             stateMatched = false;
        }

        if (!receipt) {
             discrepancies.push('MISSING_RECEIPT');
             stateMatched = false;
        } else if (receipt.supplierId !== invoice.supplierId) {
             discrepancies.push('SUPPLIER_MISMATCH');
             stateMatched = false;
        }

        if (po && receipt) {
            // Check totals / quantities
            // Using a basic tolerance of 0.01 for floating point issues
            const costDiff = receipt.totalReceivedCost - invoice.subtotal;
            if (costDiff > 0.01) {
                discrepancies.push('UNDER_BILLED'); // receipt value is higher than they billed for
                stateMatched = false;
            } else if (costDiff < -0.01) {
                discrepancies.push('OVER_BILLED');
                stateMatched = false;
            }

            // Check if quantities exactly match across PO and receipt for strict match
            let totalOrdered = 0;
            let totalReceived = 0;
            for (const rLine of receipt.lineItems) {
                totalReceived += rLine.receivedQuantity;
                totalOrdered += rLine.orderedQuantity;
            }

            if (totalReceived !== totalOrdered) {
                 discrepancies.push('QUANTITY_MISMATCH');
                 stateMatched = false;
            }
        }
    }

    let resultStatus: any = 'MATCHED';
    if (!stateMatched) {
        if (discrepancies.includes('MISSING_PO')) resultStatus = 'MISSING_PO';
        else if (discrepancies.includes('MISSING_RECEIPT')) resultStatus = 'MISSING_RECEIPT';
        else if (discrepancies.includes('SUPPLIER_MISMATCH')) resultStatus = 'SUPPLIER_MISMATCH';
        else if (discrepancies.includes('QUANTITY_MISMATCH')) resultStatus = 'QUANTITY_MISMATCH';
        else if (discrepancies.includes('OVER_BILLED')) resultStatus = 'OVER_BILLED';
        else if (discrepancies.includes('UNDER_BILLED')) resultStatus = 'UNDER_BILLED';
    }

    const docPayload = {
      invoiceId,
      status: resultStatus,
      discrepancies,
      matchedAt: Date.now(),
      matchedBy: userId,
    };

    const matchDoc = await firestore.invoiceMatchResults.create(organizationId, docPayload, userId);

    // Update invoice status based on match result
    let nextInvoiceStatus: SupplierInvoiceStatus = invoice.status;
    if (resultStatus === 'MATCHED') {
        nextInvoiceStatus = 'MATCHED';
    } else {
        nextInvoiceStatus = 'DISPUTED'; 
    }

    await firestore.supplierInvoices.update(organizationId, invoiceId, { status: nextInvoiceStatus }, userId);

    return matchDoc as unknown as InvoiceMatchResultDoc;
  }
}
