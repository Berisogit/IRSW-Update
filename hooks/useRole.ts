import { useMemo } from 'react';
import { Role, Permission } from '../types';
import {
  isStaff,
  isGuest,
  isAdmin,
  isSystemAdmin,
  canManageSystem,
  canManageRoles,
  canManageMenu,
  canReadAudit,
  canWriteOrders
} from '../roleUtils';

export const useRole = (userRole?: Role) => {
  return useMemo(() => {
    const role = userRole || 'guest';
    
    return {
      role,
      isStaff: isStaff(role),
      isGuest: isGuest(role),
      isAdmin: isAdmin(role),
      isSystemAdmin: isSystemAdmin(role),
      canManageSystem: canManageSystem(role),
      canManageRoles: canManageRoles(role),
      canManageMenu: canManageMenu(role),
      canReadAudit: canReadAudit(role),
      canWriteOrders: canWriteOrders(role),
      hasRole: (allowedRoles: Role[]) => allowedRoles.includes(role),
    };
  }, [userRole]);
};
