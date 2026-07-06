export enum UserRole {
  MANAGER = 'manager',
  OWNER = 'owner',
  SUPER_ADMIN = 'super_admin',
  SYSTEM_ADMIN = 'system_admin',
  SUPERVISOR = 'supervisor',
  CASHIER = 'cashier',
  WAITER = 'waiter',
  KITCHEN = 'kitchen',
  STAFF = 'staff',
}

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