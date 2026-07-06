export const STANDARD_UNITS = ['kg', 'g', 'litre', 'ml', 'piece'] as const;
export type UnitOfMeasure = typeof STANDARD_UNITS[number];

export interface UnitConversionRule {
  from: UnitOfMeasure;
  to: UnitOfMeasure;
  factor: number;
}

export const UNIT_CONVERSIONS: UnitConversionRule[] = [
  { from: 'kg', to: 'g', factor: 1000 },
  { from: 'g', to: 'kg', factor: 0.001 },
  { from: 'litre', to: 'ml', factor: 1000 },
  { from: 'ml', to: 'litre', factor: 0.001 },
  { from: 'kg', to: 'kg', factor: 1 },
  { from: 'g', to: 'g', factor: 1 },
  { from: 'litre', to: 'litre', factor: 1 },
  { from: 'ml', to: 'ml', factor: 1 },
  { from: 'piece', to: 'piece', factor: 1 },
];

export interface BaseDocument {
  id: string;
  organizationId: string;
  branchId?: string;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
  deletedAt?: number | null; // Soft delete strategy
  deletedBy?: string;
  createdBy: string;
  updatedBy?: string;
}

export interface OrganizationDoc extends Omit<BaseDocument, 'organizationId'> {
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  plan: 'BASIC' | 'PRO' | 'ENTERPRISE';
  contactEmail: string;
  billingProviderId?: string;
  settings: {
    currency: string;
    timezone: string;
    taxRate: number;
  };
}

export interface UserDoc {
  id: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  photoUrl?: string;
  globalRole: 'SYSTEM_ADMIN' | 'USER';
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  deletedAt?: number | null;
}

export interface OrganizationUserDoc extends BaseDocument {
  userId: string;
  role: 'owner' | 'manager' | 'supervisor' | 'cashier' | 'waiter' | 'kitchen';
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  branchIds?: string[]; // Array of branch IDs this user has access to (if empty, implicit access to all)
}

export interface StaffDoc extends BaseDocument {
  uid?: string; 
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  staffCode: string;
  role: 'owner' | 'manager' | 'supervisor' | 'cashier' | 'waiter' | 'kitchen';
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED' | 'REJECTED';
  
  phone?: string;
  avatarUrl?: string;
  lastLogin?: number;
  pinEnabled?: boolean;
}

export interface CategoryDoc extends BaseDocument {
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface MenuItemOptionDoc {
  id: string;
  name: string;
  priceModifier: number;
  isAvailable: boolean;
}

export interface RecipeIngredientDoc {
  inventoryItemId: string;
  quantity: number;
  unitOfMeasure: UnitOfMeasure | string; // Standardized unit or legacy string
}

export interface RecipeDoc extends BaseDocument {
  menuItemId: string; // The primary menu item this recipe creates
  name: string;
  yield: number;
  ingredients: RecipeIngredientDoc[];
  instructions?: string;
  preparationTimeMinutes?: number;
  isActive: boolean;
  version: number;
  previousVersionId?: string | null;
}

export interface RecipeVersionReference {
  recipeId: string;
  recipeVersion: number;
}

export interface ResourceSnapshotIngredient {
  inventoryItemId: string;
  inventoryItemName: string;
  quantity: number;
  unitOfMeasure: UnitOfMeasure | string;

  estimatedUnitCost?: number;
  estimatedTotalCost?: number;
}

export interface RecipeResourceSnapshot {
  recipeId: string;
  recipeVersion: number;

  recipeName: string;

  capturedAt: number;

  ingredients: ResourceSnapshotIngredient[];
}

export interface MenuItemRecipeMappingDoc extends BaseDocument {
  menuItemId: string;
  recipeId: string;
  isActive: boolean;
}

export interface MenuItemDoc extends BaseDocument {
  categoryId: string;
  name: string;
  description?: string;
  price: number;
  costPrice?: number;
  imageUrl?: string;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'ARCHIVED';
  sku?: string;
  barcode?: string;
  options: MenuItemOptionDoc[];
  allergens?: string[];
  visible_to_guest?: boolean;
}

export interface InventoryItemDoc extends BaseDocument {
  name: string;
  description?: string;
  unitOfMeasure: UnitOfMeasure | string;
  currentStock: number;
  minimumStockLevel: number;
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  costPerUnit: number;
  supplierId?: string;
  // Safety Prep for future phases:
  usedInRecipes?: string[]; // Array of MenuItem IDs
  autoReorderEnabled?: boolean;
  alertWhenLow?: boolean;
}

export interface TableDoc extends BaseDocument {
  name: string; // e.g. "Table 1"
  capacity: number;
  zoneId?: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE' | 'PENDING_CLEANING';
  shape: 'CIRCLE' | 'SQUARE' | 'RECTANGLE';
  positionX: number;
  positionY: number;
}

export interface ReservationDoc extends BaseDocument {
  customerId: string;
  tableId?: string; // Optional until assigned
  partySize: number;
  reservationTime: number; // Unix timestamp
  status: 'PENDING' | 'CONFIRMED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
  specialRequests?: string;
}

export interface CustomerDoc extends BaseDocument {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  totalOrders: number;
  totalSpent: number;
  loyaltyPoints: number;
  lastVisitAt?: number;
}

export const OrderStatus = {
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  PENDING: 'PENDING',
  PAYMENT_SUBMITTED: 'PAYMENT_SUBMITTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  DRAFT: 'DRAFT',
  CLOSED: 'CLOSED'
} as const;

export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  REFUNDED: 'REFUNDED'
} as const;

export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

export interface OrderItemDoc {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  optionsSelected: { optionId: string; name: string; price: number }[];
  notes?: string;
  fulfilled: boolean;
  legacyCartItem?: any;
  recipeId?: string;
  recipeVersion?: number;
  resourceSnapshot?: RecipeResourceSnapshot;
  snapshotCapturedAt?: number;
  estimatedFoodCost?: number;
}

export const InventoryPostingStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  POSTED: 'POSTED',
  FAILED: 'FAILED',
  RECONCILED: 'RECONCILED'
} as const;

export type InventoryPostingStatus = typeof InventoryPostingStatus[keyof typeof InventoryPostingStatus];

export interface InventoryPostingMovement {
  inventoryItemId: string;
  quantity: number;
  unitOfMeasure: string;
  previousStock: number;
  newStock: number;
  unitCost: number;
  totalCost: number;
}

export interface InventoryPostingDoc extends BaseDocument {
  orderId: string;
  timestamp: number;
  status: InventoryPostingStatus;
  actionBy: string;

  movements: InventoryPostingMovement[];
  snapshotReferences: {
    recipeId: string;
    recipeVersion: number;
  }[];
  
  totalCalculatedCost: number;
}

export interface OrderDoc extends BaseDocument {
  tableId?: string;
  customerId?: string;
  customerName?: string;
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  items: OrderItemDoc[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  kitchenStatus?: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
  orderSource?: 'POS' | 'QR' | 'CUSTOMER' | 'STAFF' | string;
  guestCount?: number;
  guestAvatar?: string;
  guestColor?: string;
  
  // Inventory Posting Infrastructure fields
  inventoryPostingStatus?: InventoryPostingStatus;
  inventoryPostingId?: string;
  inventoryPostedAt?: number;
}

export interface PaymentDoc extends BaseDocument {
  orderId: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'DIGITAL_WALLET' | 'OTHER';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  processorTransactionId?: string;
}

export interface AuditLogDoc extends BaseDocument {
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, any>; // Store diff/changes
  ipAddress?: string;
  userAgent?: string;
}

export const InventoryReceiptStatus = {
  DRAFT: 'DRAFT',
  RECEIVED: 'RECEIVED',
  POSTED: 'POSTED',
  CANCELLED: 'CANCELLED'
} as const;

export type InventoryReceiptStatus = typeof InventoryReceiptStatus[keyof typeof InventoryReceiptStatus];

export interface InventoryReceiptLineItem {
  inventoryItemId: string;
  inventoryItemName: string;
  unit: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: number;
  lineCost: number;
  previousStock: number;
  newStock: number;
  varianceQuantity: number;
}

export interface InventoryReceiptDoc extends BaseDocument {
  receiptNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  supplierName: string;
  status: InventoryReceiptStatus;
  receivedAt: number;
  receivedBy: string;
  postedAt?: number;
  postedBy?: string;
  totalReceivedCost: number;
  notes?: string;
  lineItems: InventoryReceiptLineItem[];
}

export const PurchaseOrderStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED'
} as const;

export type PurchaseOrderStatus = typeof PurchaseOrderStatus[keyof typeof PurchaseOrderStatus];

export interface PurchaseOrderApprovalDoc extends BaseDocument {
  purchaseOrderId: string;
  organizationId: string;
  status: 'APPROVED' | 'REJECTED';
  notes?: string;
  approvedBy: string;
  approvedAt: number;
}

export const SupplierStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  BLOCKED: 'BLOCKED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type SupplierStatus = typeof SupplierStatus[keyof typeof SupplierStatus];

export interface SupplierDoc extends BaseDocument {
  supplierCode: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  leadTimeDays: number;
  paymentTerms?: string;
  status: SupplierStatus;
  preferredSupplier: boolean;
  categories: string[];
  notes?: string;
}

export interface SupplierPerformanceDoc extends BaseDocument {
  supplierId: string;
  organizationId: string;
  totalPurchaseOrders: number;
  totalReceipts: number;
  onTimeDeliveries: number;
  lateDeliveries: number;
  averageLeadTime: number;
  varianceRate: number;
  stockoutIncidents: number;
  reliabilityScore: number;
  qualityScore: number;
  overallScore: number;
  lastCalculatedAt: number;
}

export interface PurchaseOrderLineItem {
  inventoryItemId: string;
  inventoryItemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrderDoc extends BaseDocument {
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  orderDate: number;
  expectedDeliveryDate?: number;
  totalAmount: number;
  notes?: string;
  lineItems: PurchaseOrderLineItem[];
}

export const SupplierInvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING_MATCH: 'PENDING_MATCH',
  MATCHED: 'MATCHED',
  DISPUTED: 'DISPUTED',
  APPROVED: 'APPROVED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  VOID: 'VOID'
} as const;

export type SupplierInvoiceStatus = typeof SupplierInvoiceStatus[keyof typeof SupplierInvoiceStatus];

export interface SupplierInvoiceDoc extends BaseDocument {
  supplierId: string;
  purchaseOrderId?: string;
  receiptId?: string;
  invoiceNumber: string;
  invoiceDate: number;
  dueDate: number;
  currency: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  status: SupplierInvoiceStatus;
}

export const InvoiceMatchResultStatus = {
  MATCHED: 'MATCHED',
  OVER_BILLED: 'OVER_BILLED',
  UNDER_BILLED: 'UNDER_BILLED',
  QUANTITY_MISMATCH: 'QUANTITY_MISMATCH',
  SUPPLIER_MISMATCH: 'SUPPLIER_MISMATCH',
  MISSING_RECEIPT: 'MISSING_RECEIPT',
  MISSING_PO: 'MISSING_PO'
} as const;

export type InvoiceMatchResultStatus = typeof InvoiceMatchResultStatus[keyof typeof InvoiceMatchResultStatus];

export interface InvoiceMatchResultDoc extends BaseDocument {
  invoiceId: string;
  status: InvoiceMatchResultStatus;
  discrepancies: string[];
  matchedAt: number;
  matchedBy: string;
}

export const SupplierPaymentStatus = {
  PENDING: 'PENDING',
  POSTED: 'POSTED',
  REVERSED: 'REVERSED'
} as const;

export type SupplierPaymentStatus = typeof SupplierPaymentStatus[keyof typeof SupplierPaymentStatus];

export interface SupplierPaymentDoc extends BaseDocument {
  invoiceId: string;
  supplierId: string;
  amount: number;
  paymentDate: number;
  paymentMethod: string;
  referenceNumber?: string;
  status: SupplierPaymentStatus;
  postedBy: string;
}

export interface SubscriptionDoc extends BaseDocument {
  planId: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId?: string;
}
