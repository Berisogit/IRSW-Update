import React from 'react';
import { Role, Permission, RoleDefinition } from '../types';
import { RESTAURANT_NAME } from '../constants';
import { useRole } from '../hooks/useRole';

interface UserProfile {
    name: string;
    phone: string;
    staffCode?: string;
    role: Role | string;
    guestAvatar?: string;
    guestColor?: string;
}

interface NavItemProps {
  item: any;
  isActive: boolean;
  isCollapsed: boolean;
  isMobileOpen?: boolean;
  onChangeView: (v: string) => void;
  onMobileClose?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ item, isActive, isCollapsed, isMobileOpen, onChangeView, onMobileClose }) => (
  <button
    onClick={() => {
      onChangeView(item.id);
      if (onMobileClose) onMobileClose();
    }}
    title={isCollapsed && !isMobileOpen ? item.label : undefined}
    className={`w-full flex items-center rounded-2xl transition-all duration-300 relative group overflow-hidden ${
      isActive 
        ? 'bg-brand-600 text-white shadow-glow translate-x-1' 
        : 'text-slate-400 dark:text-slate-500 hover:bg-white/5 hover:text-white'
    } ${isCollapsed && !isMobileOpen ? 'justify-center py-5' : 'space-x-4 px-4 py-3.5'}`}
  >
    <div className="relative">
      <i className={`fas ${item.icon} text-lg w-6 text-center transition-all ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}></i>
      {isCollapsed && !isMobileOpen && item.badge ? (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
      ) : null}
    </div>

    {(!isCollapsed || isMobileOpen) && (
      <div className="flex-1 flex justify-between items-center whitespace-nowrap overflow-hidden">
        <span className="text-[11px] uppercase font-black tracking-widest leading-none">{item.label}</span>
        {item.badge ? (
          <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-sm">
            {item.badge}
          </span>
        ) : null}
      </div>
    )}
  </button>
);

interface SidebarProps {
  user: UserProfile;
  activeView: string;
  onChangeView: (v: string) => void;
  onLogout: () => void;
  onResetSession: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  roleDefinitions?: RoleDefinition[]; // Make optional
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  badges?: {
    lowStock?: number;
    pendingApprovals?: number;
    pendingPayments?: number;
    readyToServe?: number;
    occupiedTables?: number;
    feedbackCount?: number;
    pendingReservations?: number;
    pendingStaff?: number;
    activeTasks?: number;
  };
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const POS_ACCESS: Role[] = ['waiter', 'cashier', 'manager', 'supervisor', 'owner', 'system_admin', 'super_admin'];
const KDS_ACCESS: Role[] = ['kitchen', 'manager', 'supervisor', 'owner', 'system_admin', 'super_admin'];

export const Sidebar: React.FC<SidebarProps> = React.memo(({ 
  user, 
  activeView, 
  onChangeView, 
  onLogout,
  onResetSession,
  isCollapsed,
  onToggleCollapse,
  roleDefinitions,
  isMobileOpen,
  onMobileClose,
  badges,
  theme,
  onToggleTheme
}) => {
  // userRoleDef is now primarily used for display name, not permissions
  const userRoleDef = roleDefinitions?.find(r => r.id === user.role);
  const { 
    isGuest, 
    isStaff, 
    isAtLeast, 
    hasRole, 
    canManageMenu, 
    canReadAudit,
    canManageRoles,
    canWriteOrders, // Add canWriteOrders from useRole
    canProcessPayments // Add canProcessPayments from useRole
  } = useRole(user.role as Role);

  const sections = [
    {
        title: 'Operations',
        items: [
          { id: 'POS', label: 'Terminal', icon: 'fa-desktop', visible: hasRole(POS_ACCESS), badge: (canWriteOrders ? badges?.pendingApprovals : (canProcessPayments ? badges?.pendingPayments : null)) },
          { id: 'KDS', label: 'Kitchen', icon: 'fa-fire', visible: hasRole(KDS_ACCESS), badge: badges?.readyToServe },
          { id: 'CUSTOMER', label: 'Menu', icon: 'fa-utensils', visible: true },
        ]
      },
      {
        title: 'Governance',
        items: [
          { id: 'ADMIN_FLOOR', label: 'Floor Map', icon: 'fa-layer-group', visible: isAtLeast('manager'), badge: badges?.occupiedTables },
          { id: 'ADMIN_RESERVATIONS', label: 'Reservations', icon: 'fa-calendar-check', visible: isAtLeast('manager'), badge: badges?.pendingReservations },
          { id: 'ADMIN_TASKS', label: 'Task Board', icon: 'fa-list-check', visible: isAtLeast('manager'), badge: badges?.activeTasks },
          { id: 'ADMIN_SALES', label: 'Analytics', icon: 'fa-chart-simple', visible: isAtLeast('manager') },
          { id: 'ADMIN_INVENTORY', label: 'Inventory', icon: 'fa-boxes-stacked', visible: isAtLeast('manager'), badge: badges?.lowStock },
          { id: 'ADMIN_MENU', label: 'Catalogue', icon: 'fa-book-open', visible: canManageMenu },
          { id: 'ADMIN_STAFF', label: 'Personnel', icon: 'fa-users-gear', visible: isAtLeast('manager') },
          { id: 'ADMIN_APPROVALS', label: 'Approvals', icon: 'fa-user-check', visible: isAtLeast('manager'), badge: badges?.pendingStaff },
          { id: 'ADMIN_ROLES', label: 'Authority', icon: 'fa-user-lock', visible: canManageRoles },
          { id: 'ADMIN_AUDIT', label: 'Audit Trail', icon: 'fa-fingerprint', visible: canReadAudit },
        ]
      }
    ];

  const sidebarClasses = `
    glass-dark text-white h-screen flex flex-col fixed top-0 z-50 transition-all duration-500 ease-in-out border-r border-white/5
    ${isCollapsed ? 'md:w-24' : 'md:w-80'}
    ${isMobileOpen ? 'translate-x-0 w-[85vw]' : '-translate-x-full md:translate-x-0'}
  `;

  return (
    <>
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-500" 
          onClick={onMobileClose}
        />
      )}

      <div className={sidebarClasses}>
        <button 
          onClick={onToggleCollapse}
          className="hidden md:flex absolute -right-4 top-14 bg-brand-600 text-white w-8 h-8 rounded-2xl items-center justify-center shadow-glow z-50 border border-white/20 hover:scale-110 active:scale-90 transition-all"
        >
          <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-[10px]`}></i>
        </button>

        <div className={`p-8 md:p-10 transition-all duration-500 ease-in-out overflow-hidden whitespace-nowrap ${isCollapsed && !isMobileOpen ? 'md:px-4 md:text-center' : ''}`}>
          <div className={`flex items-center ${isCollapsed && !isMobileOpen ? 'justify-center' : 'space-x-4'}`}>
            <div className={`rounded-2xl bg-brand-600 flex items-center justify-center shrink-0 shadow-glow ring-8 ring-brand-500/5 transition-all duration-500 ${isCollapsed && !isMobileOpen ? 'w-10 h-10' : 'w-12 h-12'}`}>
              <i className={`fas fa-bolt-lightning text-white transition-all ${isCollapsed && !isMobileOpen ? 'text-lg' : 'text-xl'}`}></i>
            </div>
            {(!isCollapsed || isMobileOpen) && (
              <div className="animate-in slide-in-from-left-4 duration-500">
                  <h1 className="font-black text-2xl tracking-tighter text-white uppercase leading-none">
                  {RESTAURANT_NAME}
                  </h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-400 mt-2">OS Nucleus</p>
              </div>
            )}
          </div>
        </div>
        
        <nav className="flex-1 px-4 md:px-6 space-y-10 overflow-y-auto no-scrollbar py-6 md:py-8">
          {sections.map((section, sIdx) => {
            const visibleItems = section.items.filter(item => item.visible);
            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-3">
                {(!isCollapsed || isMobileOpen) && (
                  <p className="px-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em] mb-4">
                    {section.title}
                  </p>
                )}
                <div className="space-y-1">
                    {visibleItems.map(item => {
                        const isActive = activeView === item.id || (activeView.startsWith('ADMIN') && item.id === activeView);
                        return (
                          <NavItem 
                            key={item.id} 
                            item={item} 
                            isActive={isActive} 
                            isCollapsed={isCollapsed} 
                            isMobileOpen={isMobileOpen}
                            onChangeView={onChangeView}
                            onMobileClose={onMobileClose}
                          />
                        );
                    })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className={`mt-auto transition-all duration-500 ${isCollapsed && !isMobileOpen ? 'p-4' : 'p-8'}`}>
          <div className="flex flex-col gap-2 mb-6">
            <button 
              onClick={onToggleTheme}
              title={isCollapsed && !isMobileOpen ? "Toggle Theme" : undefined}
              className={`w-full flex items-center text-slate-400 hover:text-white hover:bg-white/5 transition-all rounded-xl ${isCollapsed && !isMobileOpen ? 'justify-center p-4' : 'space-x-4 p-4'}`}
            >
              <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'} text-lg`}></i>
              {(!isCollapsed || isMobileOpen) && (
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {theme === 'dark' ? 'Daylight Mode' : 'Spectral Mode'}
                </span>
              )}
            </button>

            {isGuest && (
                <button 
                  onClick={onResetSession}
                  title={isCollapsed && !isMobileOpen ? "Reset Terminal" : undefined}
                  className={`w-full flex items-center text-indigo-400 hover:text-white hover:bg-indigo-500/10 transition-all rounded-xl ${isCollapsed && !isMobileOpen ? 'justify-center p-4' : 'space-x-4 p-4'}`}
                >
                  <i className="fas fa-rotate-left text-lg"></i>
                  {(!isCollapsed || isMobileOpen) && <span className="text-[10px] font-black uppercase tracking-widest">Reset</span>}
                </button>
            )}

            {isStaff && (
                <button 
                  onClick={onLogout}
                  title={isCollapsed && !isMobileOpen ? "Sign Out" : undefined}
                  className={`w-full flex items-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all rounded-xl ${isCollapsed && !isMobileOpen ? 'justify-center p-4' : 'space-x-4 p-4'}`}
                >
                  <i className="fas fa-power-off text-lg"></i>
                  {(!isCollapsed || isMobileOpen) && <span className="text-[10px] font-black uppercase tracking-widest">Sign Out</span>}
                </button>
            )}
          </div>

          {(!isCollapsed || isMobileOpen) && (
            <button 
              onClick={() => isStaff && onChangeView('PROFILE')}
              className={`w-full bg-white/5 rounded-[2rem] p-4 border border-white/5 transition-all text-left ${isStaff ? 'hover:bg-white/10 hover:border-brand-500/50 cursor-pointer cursor-glow' : 'cursor-default'}`}
              title={isStaff ? 'Manage Profile' : undefined}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black uppercase shadow-lg ${isGuest ? user.guestColor || 'bg-brand-500' : 'bg-slate-800 text-brand-400'}`}>
                  {isGuest ? <i className={`fas ${user.guestAvatar || 'fa-user'}`}></i> : user.name.charAt(0)}
                </div>
                <div className="overflow-hidden text-left flex-1">
                  <p className="text-[11px] font-black truncate uppercase tracking-tighter text-white">{user.name}</p>
                  <p className="text-[8px] text-slate-500 uppercase font-black tracking-[0.1em] mt-1">{userRoleDef?.name || user.role}</p>
                </div>
                {isStaff && (
                  <i className="fas fa-chevron-right text-[10px] text-slate-600 group-hover:text-brand-400"></i>
                )}
              </div>
            </button>
          )}
        </div>
      </div>
    </>
  );
});