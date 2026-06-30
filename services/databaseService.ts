import { 
  Role, 
  Order, 
  SystemConfig, 
  MenuItem, 
  RoleDefinition, 
  AuditLog 
} from '../types';

import {
  canManageMenu,
  canManageSystem,
  canReadAudit,
  canWriteOrders,
  canManageRoles
} from '../roleUtils';

/**
 * IRSW Persistence Node: Authoritative Database Service
 * Enforces role-based authority at the logic level for all persistence operations.
 */
class DatabaseService {

  /**
   * Fetches core system configuration. Restricted to System Administrator.
   */
  async getSystemConfig(userRole: Role): Promise<SystemConfig> {
    if (!canManageSystem(userRole)) {
      throw new Error('ACCESS_DENIED: System configuration access is restricted to System Administrator.');
    }

    return {
      initialized: true,
      initializedAt: Date.now(),
      version: '5.0.0-Strict-RBAC',
      lastMaintenance: Date.now()
    };
  }

  /**
   * Commits an order payload to the system. Allowed for Guest and Staff roles.
   */
  async commitOrder(order: Order, userRole: Role): Promise<void> {
    if (!canWriteOrders(userRole)) {
      throw new Error('PRIVILEGE_VIOLATION: Current authority level cannot commit orders.');
    }

    console.info(`[DB] Order ${order.id} successfully committed by ${userRole}`);
  }

  /**
   * Retrieves the immutable system audit trail. Restricted to Governance roles.
   */
  async getAuditLogs(userRole: Role): Promise<AuditLog[]> {
    if (!canReadAudit(userRole)) {
      throw new Error('READ_DENIED: Audit trail access is restricted to Management and Administration.');
    }

    return [];
  }

  /**
   * Modifies a menu item entity. Restricted to roles with Menu Management authority.
   */
  async updateMenuItem(item: Partial<MenuItem>, userRole: Role): Promise<void> {
    if (!canManageMenu(userRole)) {
      throw new Error('WRITE_DENIED: Menu catalogue modification is restricted.');
    }

    console.info(`[DB] Menu item ${item.id} updated by authorized unit: ${userRole}`);
  }

  /**
   * Updates RBAC role definitions. Strictly restricted to System Administrator.
   */
  async updateRoleDefinition(role: RoleDefinition, userRole: Role): Promise<void> {
    if (!canManageRoles(userRole)) {
      throw new Error('AUTHORITY_ERROR: Role definition modification is restricted to System Administrator.');
    }

    console.info(`[DB] Role protocol ${role.id} updated by System Controller.`);
  }

  // ======================================================
  // Authority Predicates (Wrappers for UI Layer Consitency)
  // ======================================================

  canManageRoles(userRole: Role): boolean {
    return canManageRoles(userRole);
  }

  canManageMenu(userRole: Role): boolean {
    return canManageMenu(userRole);
  }

  canWriteOrders(userRole: Role): boolean {
    return canWriteOrders(userRole);
  }
}

export const db = new DatabaseService();
