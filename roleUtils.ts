import { Role, STAFF_ROLES } from './types';

export const isStaff = (role: Role): boolean =>
  STAFF_ROLES.includes(role);

export const isGuest = (role: Role): boolean =>
  role === 'guest';

export const isAdmin = (role: Role): boolean =>
  role === 'SUPER_ADMIN';

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
  role === 'SUPER_ADMIN';

/**
 * IRSW Authority Node: Access Control Permissions
 * canManageRoles allows modification of the RBAC matrix.
 */
export const canManageRoles = (role: Role): boolean =>
  role === 'SUPER_ADMIN';

/**
 * IRSW Authority Node: Operational Permissions
 * canManageMenu allows catalogue modification and item availability toggling.
 */
export const canManageMenu = (role: Role): boolean =>
  ['MANAGER', 'OWNER', 'SUPER_ADMIN'].includes(role);

/**
 * IRSW Authority Node: Governance Permissions
 * canReadAudit allows viewing the immutable system audit trail.
 */
export const canReadAudit = (role: Role): boolean =>
  ['MANAGER', 'OWNER', 'SUPER_ADMIN'].includes(role);

/**
 * IRSW Authority Node: Transactional Permissions
 * canWriteOrders identifies roles capable of committing new order payloads to the ledger.
 */
export const canWriteOrders = (role: Role): boolean =>
  isStaff(role) || isGuest(role);
