import { firestore } from './firestoreService';
import { OrderDoc, InventoryPostingDoc } from '../types/firestoreSchema';

export interface ReconciliationFinding {
  orderId: string;
  postingId: string;
  organizationId: string;
  failureReason: string;
  detectedAt: number;
}

export interface InventoryHealthReport {
  totalPaidOrders: number;
  totalPostedOrders: number;
  failedPostings: number;
  strandedOrders: number;
  orphanedLedgers: number;
  reconciliationScore: number;
  findings: ReconciliationFinding[];
  generatedAt: number;
}

export interface ReconciliationSummary {
  strandedOrders: number;
  failedPostings: number;
  orphanedLedgers: number;
  healthyOrders: number;
}

export class InventoryReconciliationService {
  /**
   * Runs a complete, read-only diagnostic reconciliation of an organization's inventory postings.
   */
  static async runReconciliation(organizationId: string): Promise<InventoryHealthReport> {
    const detectedAt = Date.now();
    const findings: ReconciliationFinding[] = [];

    // 1. Fetch all orders and posting documents using the query repositories
    const allOrders = await firestore.orders.executeQuery(organizationId, {});
    const allPostings = await firestore.inventoryPostings.executeQuery(organizationId, {});

    const postingsMap = new Map<string, InventoryPostingDoc>();
    allPostings.forEach(p => postingsMap.set(p.id, p));

    const ordersMap = new Map<string, OrderDoc>();
    allOrders.forEach(o => ordersMap.set(o.id, o));

    let totalPaidOrders = 0;
    let totalPostedOrders = 0;
    let failedPostings = 0;
    let strandedOrders = 0;
    let orphanedLedgers = 0;

    // 2. Identify stranded and failed orders
    for (const order of allOrders) {
      if (order.paymentStatus === 'PAID') {
        totalPaidOrders++;

        // Determine if they are legacy (exempt from posting if missing snapshots or versions)
        let hasSnapshots = false;
        let hasMissingLegacyData = false;

        if (order.items) {
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
        }
        const isLegacy = hasMissingLegacyData || !hasSnapshots;

        if (order.inventoryPostingStatus === 'POSTED') {
          totalPostedOrders++;
        } else if (order.inventoryPostingStatus === 'FAILED') {
          failedPostings++;
          findings.push({
            orderId: order.id,
            postingId: order.id,
            organizationId,
            failureReason: `Order posting explicitly marked as FAILED.`,
            detectedAt
          });
        } else if (!isLegacy) {
          strandedOrders++;
          findings.push({
            orderId: order.id,
            postingId: order.id,
            organizationId,
            failureReason: `Order is PAID but inventory is never posted (stranded order).`,
            detectedAt
          });
        }
      }
    }

    // 3. Identify orphaned postings (postings without corresponding orders)
    for (const posting of allPostings) {
      if (!ordersMap.has(posting.orderId)) {
        orphanedLedgers++;
        findings.push({
          orderId: posting.orderId,
          postingId: posting.id,
          organizationId,
          failureReason: `Ledger posting exists but associated Order document is missing from the database.`,
          detectedAt
        });
      }
    }

    // 4. Identify inconsistent postings (where order references don't align with posting docs)
    const inconsistentPostingsResult = await firestore.inventoryPostings.getInconsistentPostings(organizationId, ordersMap);
    inconsistentPostingsResult.forEach(item => {
      findings.push({
        orderId: item.order.id,
        postingId: item.posting.id,
        organizationId,
        failureReason: `Data Inconsistency: ${item.reason}`,
        detectedAt
      });
    });

    // 5. Calculate reconciliation score mathematically
    const totalIssues = strandedOrders + failedPostings + orphanedLedgers;
    const totalObserved = totalPaidOrders + orphanedLedgers;
    const reconciliationScore = totalObserved > 0
      ? Math.max(0, Math.min(100, Math.round(((totalObserved - totalIssues) / totalObserved) * 100)))
      : 100;

    return {
      totalPaidOrders,
      totalPostedOrders,
      failedPostings,
      strandedOrders,
      orphanedLedgers,
      reconciliationScore,
      findings,
      generatedAt: detectedAt
    };
  }

  /**
   * Produces a high-level summary of posting health.
   */
  static async getReconciliationSummary(organizationId: string): Promise<ReconciliationSummary> {
    const report = await this.runReconciliation(organizationId);
    const healthyPaidOrders = report.totalPaidOrders - report.strandedOrders - report.failedPostings;

    return {
      strandedOrders: report.strandedOrders,
      failedPostings: report.failedPostings,
      orphanedLedgers: report.orphanedLedgers,
      healthyOrders: healthyPaidOrders
    };
  }
}
