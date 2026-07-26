
// =======================
// AUTHORITATIVE ROLE MODEL & HIERARCHY
// =======================
// 
// Role Hierarchy:
// 1. system_admin: Unlimited cross-organization access (System only)
// 2. super_admin: High-level administrative access
// 3. owner: Full organization control, billing, destructive actions
// 4. manager: Operational oversight, personnel, reporting, inventory
// 5. supervisor: Shift lead, KDS/POS management, basic inventory limits
// 6. cashier: Order processing, payments, drawer control
// 7. waiter: Order entry, table management
// 8. kitchen: KDS view, order preparation
// 9. viewer: Read-only access to menus and floor plans
// 9. guest: Customer access (Mobile ordering)
//

export type Role =
  | 'system_admin'
  | 'super_admin'
  | 'owner'
  | 'manager'
  | 'supervisor'
  | 'cashier'
  | 'waiter'
  | 'kitchen'
  | 'viewer'
  | 'guest';

export const STAFF_ROLES: readonly Role[] = [
  'system_admin',
  'super_admin',
  'owner',
  'manager',
  'supervisor',
  'cashier',
  'waiter',
  'kitchen',
  'viewer',
];

export const GUEST_ROLE: Role = 'guest';

// =======================
// PERMISSIONS
// =======================

export enum Permission {
  VIEW_POS = 'VIEW_POS',
  VIEW_KDS = 'VIEW_KDS',
  VIEW_CUSTOMER_MENU = 'VIEW_CUSTOMER_MENU',
  VIEW_FLOOR_PLAN = 'VIEW_FLOOR_PLAN',
  VIEW_RESERVATIONS = 'VIEW_RESERVATIONS',
  VIEW_SALES_REPORTS = 'VIEW_SALES_REPORTS',
  VIEW_INVENTORY = 'VIEW_INVENTORY',
  VIEW_MENU_CATALOGUE = 'VIEW_MENU_CATALOGUE',
  VIEW_AUDIT_TRAIL = 'VIEW_AUDIT_TRAIL',
  VIEW_FEEDBACK = 'VIEW_FEEDBACK',
  VIEW_TASKS = 'VIEW_TASKS',

  MANAGE_ORDERS = 'MANAGE_ORDERS',
  PROCESS_PAYMENTS = 'PROCESS_PAYMENTS',
  PREPARE_ORDERS = 'PREPARE_ORDERS',
  MANAGE_MENU = 'MANAGE_MENU',
  MANAGE_FLOOR = 'MANAGE_FLOOR',
  MANAGE_TASKS = 'MANAGE_TASKS',

  MANAGE_PERSONNEL = 'MANAGE_PERSONNEL',
  MANAGE_ROLES = 'MANAGE_ROLES',
  MANAGE_SYSTEM = 'MANAGE_SYSTEM',
}

// =======================
// CORE ENUMS
// =======================

export enum UserStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

import { OrderStatus, PaymentStatus } from './types/firestoreSchema';

export { OrderStatus, PaymentStatus };

export enum MenuItemStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  PENDING_CLEANING = 'PENDING_CLEANING',
}

// =======================
// CORE MODELS
// =======================

export interface UserClaims {
  role: Role;
  organizationId: string;
  claimsSetAt: number;
}

export interface UserProfile {
  uid?: string;
  displayName?: string;
  organizationId?: string | null;
  name: string;
  phone: string;            
  email?: string;
  photoFileName?: string;
  role: Role;
  status: UserStatus;
  staffCode?: string;
  sessionId?: string;
  guestAvatar?: string;
  guestColor?: string;
  claimsVerified?: boolean;
}

export interface SystemConfig {
  initialized: boolean;
  initializedAt: number | null;
  version: string;
  lastMaintenance: number;
}

export interface MenuItemOption {
  name: string;
  priceModifier: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  image: string;
  status: MenuItemStatus;
  available: boolean;
  visible_to_guest: boolean;
  options?: MenuItemOption[];
}

export interface MenuCategory {
  id: string;
  name: string;
  icon: string;
}

export interface Ingredient {
  id: string;
  name: string;
  stock: number;
  unit: string;
}

export interface Review {
  id: string;
  orderId: string;
  rating: number;
  comment: string;
  timestamp: number;
}

export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export interface Reservation {
  id: string;
  customerName: string;
  tableId: string;
  timestamp: number;
  status: ReservationStatus;
  guests: number;
}

export interface CartItem extends MenuItem {
  cartId: string;
  quantity: number;
  selectedOptions: MenuItemOption[];
  notes?: string;
  groupId?: string;
  groupName?: string;
  recipeId?: string;
  recipeVersion?: number;
  resourceSnapshot?: any;
  snapshotCapturedAt?: number;
}

export interface Order {
  id: string;
  tableId?: string;
  customerName?: string;
  items: CartItem[];
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  timestamp: number;
  createdBy: Role;
  guestAvatar?: string;
  guestColor?: string;
  inventoryPostingStatus?: string;
  grandTotal?: number;
}

export interface RoleDefinition {
  id: Role;
  name: string;
  isSystem: boolean;
  permissions: Permission[];
}

export interface Table {
  id: string;
  number: string;
  x: number;
  y: number;
  capacity: number;
  status: TableStatus;
  shape: 'CIRCLE' | 'SQUARE' | 'RECTANGLE';
  assignedStaffId?: string;
  assignedStaffName?: string;
}

export interface AuditLog {
  id: string;
  timestamp: number;
  organizationId: string;
  userRole: Role;
  userIdentifier: string;
  action: string;
  targetEntityType: string;
  targetEntityId: string;
  outcome: ActionOutcome;
  notes?: string;
}

export enum ActionOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  WARNING = 'WARNING',
}

export type EntityType = 'Order' | 'User' | 'Table' | 'MenuItem' | 'RoleDefinition' | 'Task' | 'InventoryItem';

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedToCode?: string;
  assignedToName?: string;
  createdAt: number;
  updatedAt: number;
  dueDate?: number;
  createdByCode: string;
}

