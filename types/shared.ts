import type { Role } from '../types';

export type UserRole = Role;

export const UserRole = {
  SYSTEM_ADMIN: 'system_admin',
  SUPER_ADMIN: 'super_admin',
  OWNER: 'owner',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  CASHIER: 'cashier',
  WAITER: 'waiter',
  KITCHEN: 'kitchen',
  VIEWER: 'viewer',
  GUEST: 'guest',
} as const;

export const INVENTORY_ADMIN_ROLES = [
  UserRole.SYSTEM_ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.MANAGER,
];

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETED = 'DELETED',
}

export enum AuditOutcome {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  WARNING = 'WARNING',
}