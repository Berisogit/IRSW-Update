import { Firestore } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BaseRepository, RootRepository, FirestoreCollections, InventoryRepository, RecipeRepository, UserSubcollectionRepository, InventoryPostingRepository, OrderRepository, PurchaseOrderRepository, InventoryReceiptRepository, SupplierRepository, SupplierPerformanceRepository, PurchaseOrderApprovalRepository, SupplierInvoiceRepository, InvoiceMatchResultRepository, SupplierPaymentRepository } from './repository';
import {
  OrganizationDoc,
  UserDoc,
  OrganizationUserDoc,
  StaffDoc,
  MenuItemDoc,
  CategoryDoc,
  InventoryItemDoc,
  TableDoc,
  ReservationDoc,
  CustomerDoc,
  OrderDoc,
  PaymentDoc,
  AuditLogDoc,
  SubscriptionDoc,
  RecipeDoc,
  MenuItemRecipeMappingDoc,
  InventoryPostingDoc,
  PurchaseOrderDoc,
  InventoryReceiptDoc,
  SupplierDoc,
  SupplierPerformanceDoc,
} from '../types/firestoreSchema';

/**
 * Service Layer instances for Firestore collections.
 * Organizations, Users, and OrganizationUsers are root-level collections.
 * The rest are sub-collections under /organizations/{orgId}
 */
export class FirestoreService {
  // Root collections
  public organizations: RootRepository<OrganizationDoc>;
  public users: RootRepository<UserDoc>;
  public memberships: RootRepository<any>;
  public legacyStaff: RootRepository<any>;

  // User sub-collections
  public userFiles: import('./repository').UserSubcollectionRepository<any>;

  // Sub-collections
  public staff: BaseRepository<StaffDoc>;
  public menuItems: BaseRepository<MenuItemDoc>;
  public categories: BaseRepository<CategoryDoc>;
  public inventory: InventoryRepository;
  public tables: BaseRepository<TableDoc>;
  public reservations: BaseRepository<ReservationDoc>;
  public customers: BaseRepository<CustomerDoc>;
  public orders: OrderRepository;
  public payments: BaseRepository<PaymentDoc>;
  public auditLogs: BaseRepository<AuditLogDoc>;
  public subscriptions: BaseRepository<SubscriptionDoc>;
  public recipes: RecipeRepository;
  public recipeMappings: BaseRepository<MenuItemRecipeMappingDoc>;
  public inventoryPostings: InventoryPostingRepository;
  public purchaseOrders: PurchaseOrderRepository;
  public inventoryReceipts: InventoryReceiptRepository;
  public suppliers: SupplierRepository;
  public supplierPerformance: SupplierPerformanceRepository;
  public purchaseOrderApprovals: PurchaseOrderApprovalRepository;
  public supplierInvoices: SupplierInvoiceRepository;
  public invoiceMatchResults: InvoiceMatchResultRepository;
  public supplierPayments: SupplierPaymentRepository;

  constructor(dbInst: Firestore) {
    this.organizations = new RootRepository<OrganizationDoc>(dbInst, FirestoreCollections.ORGANIZATIONS);
    this.users = new RootRepository<UserDoc>(dbInst, FirestoreCollections.USERS);
    this.memberships = new RootRepository<any>(dbInst, FirestoreCollections.MEMBERSHIPS);
    this.legacyStaff = new RootRepository<any>(dbInst, 'staff');
    
    this.userFiles = new UserSubcollectionRepository<any>(dbInst, 'files');

    this.staff = new BaseRepository<StaffDoc>(dbInst, FirestoreCollections.STAFF);
    this.menuItems = new BaseRepository<MenuItemDoc>(dbInst, FirestoreCollections.MENU_ITEMS);
    this.categories = new BaseRepository<CategoryDoc>(dbInst, FirestoreCollections.CATEGORIES);
    this.inventory = new InventoryRepository(dbInst, FirestoreCollections.INVENTORY);
    this.tables = new BaseRepository<TableDoc>(dbInst, FirestoreCollections.TABLES);
    this.reservations = new BaseRepository<ReservationDoc>(dbInst, FirestoreCollections.RESERVATIONS);
    this.customers = new BaseRepository<CustomerDoc>(dbInst, FirestoreCollections.CUSTOMERS);
    this.orders = new OrderRepository(dbInst, FirestoreCollections.ORDERS);
    this.payments = new BaseRepository<PaymentDoc>(dbInst, FirestoreCollections.PAYMENTS);
    this.auditLogs = new BaseRepository<AuditLogDoc>(dbInst, FirestoreCollections.AUDIT_LOGS);
    this.subscriptions = new BaseRepository<SubscriptionDoc>(dbInst, FirestoreCollections.SUBSCRIPTIONS);
    this.recipes = new RecipeRepository(dbInst, FirestoreCollections.RECIPES);
    this.recipeMappings = new BaseRepository<MenuItemRecipeMappingDoc>(dbInst, FirestoreCollections.RECIPE_MAPPINGS);
    this.inventoryPostings = new InventoryPostingRepository(dbInst, FirestoreCollections.INVENTORY_POSTINGS);
    this.purchaseOrders = new PurchaseOrderRepository(dbInst, FirestoreCollections.PURCHASE_ORDERS);
    this.inventoryReceipts = new InventoryReceiptRepository(dbInst, FirestoreCollections.INVENTORY_RECEIPTS);
    this.suppliers = new SupplierRepository(dbInst, FirestoreCollections.SUPPLIERS);
    this.supplierPerformance = new SupplierPerformanceRepository(dbInst, FirestoreCollections.SUPPLIER_PERFORMANCE);
    this.purchaseOrderApprovals = new PurchaseOrderApprovalRepository(dbInst, FirestoreCollections.PO_APPROVALS);
    this.supplierInvoices = new SupplierInvoiceRepository(dbInst, FirestoreCollections.SUPPLIER_INVOICES);
    this.invoiceMatchResults = new InvoiceMatchResultRepository(dbInst, FirestoreCollections.INVOICE_MATCH_RESULTS);
    this.supplierPayments = new SupplierPaymentRepository(dbInst, FirestoreCollections.SUPPLIER_PAYMENTS);
  }
}

export const firestore = new FirestoreService(db!);

