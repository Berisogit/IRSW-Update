import { doc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { firestore } from './firestoreService';
import { FirestoreCollections } from './repository';
import { SupplierDoc, SupplierPerformanceDoc } from '../types/firestoreSchema';

export class SupplierManagementService {
  static async calculateSupplierPerformance(organizationId: string, supplierId: string): Promise<SupplierPerformanceDoc> {
    // 1. Get all POs for this supplier
    const pos = await firestore.purchaseOrders.executeQuery(organizationId, {});
    const supplierPos = pos.filter((po: any) => po.supplierId === supplierId && po.status !== 'CANCELLED');
    
    // 2. Get all Receipts for this supplier
    const receipts = await firestore.inventoryReceipts.executeQuery(organizationId, {});
    const supplierReceipts = receipts.filter((r: any) => r.supplierId === supplierId);

    let onTimeDeliveries = 0;
    let lateDeliveries = 0;
    let totalLeadTimeDays = 0;
    let receiptsWithLeadTime = 0;
    let totalOrderedQty = 0;
    let totalReceivedQty = 0;
    let stockoutIncidents = 0;

    for (const receipt of supplierReceipts) {
      const po = supplierPos.find((p: any) => p.id === receipt.purchaseOrderId);
      if (po) {
        // Calculate late vs on-time
        if (po.expectedDeliveryDate && receipt.receivedAt > po.expectedDeliveryDate) {
          lateDeliveries++;
        } else {
          onTimeDeliveries++;
        }

        // Calculate lead time in days
        const leadTimeMs = receipt.receivedAt - po.orderDate;
        const days = leadTimeMs / (1000 * 60 * 60 * 24);
        totalLeadTimeDays += days;
        receiptsWithLeadTime++;

        // Calculate variance
        for (const rLine of receipt.lineItems) {
            totalReceivedQty += Math.abs(rLine.receivedQuantity);
            const poLine = po.lineItems.find((pLine: any) => pLine.inventoryItemId === rLine.inventoryItemId);
            if (poLine) {
                totalOrderedQty += Math.abs(poLine.quantity);
            }
        }
      }
    }

    const averageLeadTime = receiptsWithLeadTime > 0 ? totalLeadTimeDays / receiptsWithLeadTime : 0;
    const reliabilityScore = supplierReceipts.length > 0 ? (onTimeDeliveries / supplierReceipts.length) * 100 : 100;
    const varianceRate = totalOrderedQty > 0 ? Math.abs(totalOrderedQty - totalReceivedQty) / totalOrderedQty : 0;
    const qualityScore = 100 - (varianceRate * 100);

    const overallScore = (reliabilityScore * 0.6) + (qualityScore * 0.4);

    const perfData: Partial<SupplierPerformanceDoc> = {
      supplierId,
      organizationId,
      totalPurchaseOrders: supplierPos.length,
      totalReceipts: supplierReceipts.length,
      onTimeDeliveries,
      lateDeliveries,
      averageLeadTime,
      varianceRate,
      stockoutIncidents,
      reliabilityScore,
      qualityScore,
      overallScore,
      lastCalculatedAt: Date.now()
    };

    // Save or update to performance collection
    const existingList = await firestore.supplierPerformance.executeQuery(organizationId, {});
    const existing = existingList.find((s: any) => s.supplierId === supplierId);

    if (existing) {
      await firestore.supplierPerformance.update(organizationId, existing.id, perfData, 'SYSTEM');
      return { ...existing, ...perfData } as SupplierPerformanceDoc;
    } else {
      const newId = await firestore.supplierPerformance.create(organizationId, perfData as Omit<SupplierPerformanceDoc, 'id'>, 'SYSTEM');
      return { id: newId, ...perfData } as SupplierPerformanceDoc;
    }
  }
}

