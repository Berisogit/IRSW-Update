import { Role, STAFF_ROLES } from './types';

/**
 * IRSW Authority Node: Role Rank Mapping
 */
const ROLE_RANK: Record<Role, number> = {
  'system_admin': 100,
  'super_admin': 100,
  'owner': 80,
  'manager': 70,
  'supervisor': 60,
  'cashier': 50,
  'waiter': 40,
  'kitchen': 30,
  'viewer': 20,
  'guest': 10,
};

export const isAtLeast = (userRole: Role, requiredRole: Role): boolean =>
  ROLE_RANK[userRole] >= ROLE_RANK[requiredRole];

export const isStaff = (role: Role): boolean =>
  STAFF_ROLES.includes(role);

export const isGuest = (role: Role): boolean =>
  role === 'guest';

export const isAdmin = (role: Role): boolean =>
  ['system_admin', 'super_admin'].includes(role);

/**
 * IRSW Authority Node: Role Identity Aliases
 * isSystemAdmin is the authoritative check for kernel-level configuration access.
 */
export const isSystemAdmin = isAdmin;

/**
 * IRSW Authority Node: Kernel Permissions
 * canManageSystem grants access to core system configuration and flags.
 */
export const canManageSystem = (role: Role): boolean =>
  isAtLeast(role, 'system_admin');

/**
 * IRSW Authority Node: Access Control Permissions
 * canManageRoles allows modification of the RBAC matrix.
 */
export const canManageRoles = (role: Role): boolean =>
  isAtLeast(role, 'owner');

/**
 * IRSW Authority Node: Operational Permissions
 * canManageMenu allows catalogue modification and item availability toggling.
 */
export const canManageMenu = (role: Role): boolean =>
  isAtLeast(role, 'manager');

/**
 * IRSW Authority Node: Governance Permissions
 * canReadAudit allows viewing the immutable system audit trail.
 */
export const canReadAudit = (role: Role): boolean =>
  isAtLeast(role, 'manager');

/**
 * IRSW Authority Node: Transactional Permissions
 * canWriteOrders identifies roles capable of committing new order payloads to the ledger.
 */
export const canWriteOrders = (role: Role): boolean =>
  isStaff(role) || isGuest(role);

export const canProcessPayments = (role: Role): boolean =>
    isAtLeast(role, "owner");

