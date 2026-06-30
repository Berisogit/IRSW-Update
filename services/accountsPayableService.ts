import { firestore } from './firestoreService';

export class AccountsPayableService {

  static async submitInvoice(organizationId: string, invoiceId: string, userId: string, userRole: string): Promise<void> {
    if (!['SUPER_ADMIN', 'OWNER', 'MANAGER'].includes(userRole)) {
      throw new Error(`Role ${userRole} is not authorized to submit invoices.`);
    }

    const invoice = await firestore.supplierInvoices.getById(organizationId, invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status !== 'DRAFT') throw new Error('Only DRAFT invoices can be submitted');

    await firestore.supplierInvoices.update(organizationId, invoiceId, { status: 'PENDING_MATCH' }, userId);

    // Auto-trigger three-way matching
    const { InvoiceMatchingService } = await import('./invoiceMatchingService');
    await InvoiceMatchingService.performThreeWayMatch(organizationId, invoiceId, userId);
  }

  static async approveInvoice(organizationId: string, invoiceId: string, userId: string, userRole: string): Promise<void> {
    if (!['SUPER_ADMIN', 'OWNER'].includes(userRole)) {
      throw new Error(`Role ${userRole} is not authorized to approve invoices.`);
    }

    const invoice = await firestore.supplierInvoices.getById(organizationId, invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.status !== 'MATCHED' && invoice.status !== 'DISPUTED') {
      throw new Error('Only MATCHED or DISPUTED invoices can be approved');
    }

    await firestore.supplierInvoices.update(organizationId, invoiceId, { status: 'APPROVED' }, userId);
  }
}
