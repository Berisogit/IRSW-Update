import React, { useState, useMemo, Suspense, useCallback, useEffect } from 'react';
import { auth, functions } from './lib/firebase';
import { 
  Role, 
  Order, 
  OrderStatus, 
  MenuItem, 
  MenuCategory, 
  CartItem,
  PaymentStatus,
  AuditLog,
  ActionOutcome,
  EntityType,
  UserStatus,
  UserProfile,
  Permission,
  RoleDefinition,
  Table,
  SystemConfig,
  Task,
  TaskStatus,
  STAFF_ROLES,
  MenuItemStatus,
  TableStatus,
  Ingredient
} from './types';

import { 
  INITIAL_CATEGORIES, 
  INITIAL_MENU, 
  INITIAL_TABLES,
  INITIAL_INGREDIENTS,
  RESTAURANT_NAME
} from './constants';

import { useAuth } from './contexts/AuthContext';
import { useRole } from './hooks/useRole';

import { Sidebar } from './components/Sidebar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { InitializationBlocker } from './components/InitializationBlocker';
import { LoginScreen } from './components/LoginScreen';

import { logoutUser } from './utils/auth';

import { 
  signOutStaff, 
  getAllStaff, 
  updateStaffStatus 
} from './services/authService';

import { db } from './services/databaseService';
import { firestore } from './services/firestoreService';
import { captureOrderItemSnapshot } from './services/orderSnapshotService';
import { InventoryPostingEngine } from './services/inventoryPostingEngine';

import { 
    ClearCartConfirmationModal,
    AssistantModal, 
    OptionSelectionModal,
    TableSelectionModal,
    ReceiptModal,
    CustomerHistoryModal,
    LogoutConfirmationModal
} from './components/Modals';

import { QRScannerModal } from './components/QRScannerModal';
import { httpsCallable } from 'firebase/functions';
const POSView = React.lazy(() => import('./views/POSView'));
const KDSView = React.lazy(() => import('./views/KDSView'));
const AdminView = React.lazy(() => import('./views/AdminView'));
const ProfileView = React.lazy(() => import('./views/ProfileView').then(module => ({ default: module.ProfileView })));
const MapOverlayView = React.lazy(() => import('./views/MapOverlayView').then(m => ({ default: m.MapOverlayView })));

const POS_ACCESS: Role[] = ['waiter', 'cashier', 'manager', 'supervisor', 'owner', 'system_admin', 'super_admin'];
const KDS_ACCESS: Role[] = ['kitchen', 'manager', 'supervisor', 'owner', 'system_admin', 'super_admin'];
const ADMIN_ACCESS: Role[] = ['manager', 'owner', 'system_admin', 'super_admin'];

const DEFAULT_ROLES: RoleDefinition[] = [
  { id: 'system_admin', name: 'System Administrator', isSystem: true, permissions: Object.values(Permission) },
  { id: 'owner', name: 'Restaurant Owner', isSystem: true, permissions: [Permission.VIEW_POS, Permission.VIEW_KDS, Permission.VIEW_FLOOR_PLAN, Permission.VIEW_RESERVATIONS, Permission.VIEW_SALES_REPORTS, Permission.VIEW_INVENTORY, Permission.VIEW_MENU_CATALOGUE, Permission.VIEW_AUDIT_TRAIL, Permission.VIEW_FEEDBACK, Permission.VIEW_TASKS, Permission.MANAGE_ORDERS, Permission.PROCESS_PAYMENTS, Permission.PREPARE_ORDERS, Permission.MANAGE_MENU, Permission.MANAGE_FLOOR, Permission.MANAGE_PERSONNEL, Permission.MANAGE_ROLES, Permission.MANAGE_TASKS] },
  { id: 'manager', name: 'Manager', isSystem: true, permissions: [Permission.VIEW_POS, Permission.VIEW_KDS, Permission.VIEW_FLOOR_PLAN, Permission.VIEW_RESERVATIONS, Permission.VIEW_SALES_REPORTS, Permission.VIEW_INVENTORY, Permission.VIEW_MENU_CATALOGUE, Permission.VIEW_AUDIT_TRAIL, Permission.VIEW_FEEDBACK, Permission.VIEW_TASKS, Permission.MANAGE_ORDERS, Permission.PREPARE_ORDERS, Permission.MANAGE_MENU, Permission.MANAGE_FLOOR, Permission.MANAGE_TASKS] },
  { id: 'supervisor', name: 'Supervisor', isSystem: true, permissions: [Permission.VIEW_POS, Permission.VIEW_KDS, Permission.VIEW_FLOOR_PLAN, Permission.VIEW_RESERVATIONS, Permission.VIEW_INVENTORY, Permission.VIEW_MENU_CATALOGUE, Permission.VIEW_TASKS, Permission.MANAGE_ORDERS, Permission.PREPARE_ORDERS, Permission.MANAGE_MENU, Permission.MANAGE_FLOOR, Permission.MANAGE_TASKS] },
  { id: 'waiter', name: 'Service Staff', isSystem: true, permissions: [Permission.VIEW_POS, Permission.MANAGE_ORDERS, Permission.VIEW_FLOOR_PLAN, Permission.VIEW_TASKS] },
  { id: 'cashier', name: 'Cashier', isSystem: true, permissions: [Permission.VIEW_POS, Permission.PROCESS_PAYMENTS, Permission.VIEW_TASKS] },
  { id: 'kitchen', name: 'Kitchen Staff', isSystem: true, permissions: [Permission.VIEW_KDS, Permission.PREPARE_ORDERS, Permission.VIEW_TASKS] },
  { id: 'viewer', name: 'Viewer', isSystem: true, permissions: [Permission.VIEW_MENU_CATALOGUE, Permission.VIEW_FLOOR_PLAN] },
  { id: 'guest', name: 'Guest Client', isSystem: true, permissions: [Permission.VIEW_CUSTOMER_MENU] }
];

const CART_STORAGE_KEY = 'irsw_active_cart';
const PREFS_VIEW_KEY = 'irsw_active_view';
const PREFS_SIDEBAR_KEY = 'irsw_sidebar_collapsed';
const PREFS_THEME_KEY = 'irsw_theme';

const MOCK_HISTORICAL_LOGS: AuditLog[] = [
  {
    organizationId: "demo-id",
    id: 'log_mock_1',
    timestamp: Date.now() - 5 * 60 * 1000, // 5 mins ago
    userRole: 'manager',
    userIdentifier: 'Manager Sarah',
    action: 'ORDER_APPROVED',
    targetEntityType: 'Order',
    targetEntityId: 'order_1042',
    outcome: ActionOutcome.SUCCESS,
    notes: 'Approved high-value corporate lunch ticket manually.'
  },
    
    {
    organizationId: "demo-id",
    id: 'log_mock_2',
    timestamp: Date.now() - 35 * 60 * 1000, // 35 mins ago
    userRole: 'kitchen',
    userIdentifier: 'Chef Marco',
    action: 'ORDER_SERVED',
    targetEntityType: 'Order',
    targetEntityId: 'order_1041',
    notes: 'Successfully served grilled seabass to station 4.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_3',
    timestamp: Date.now() - 2 * 3600 * 1000, // 2 hours ago
    userRole: 'manager',
    userIdentifier: 'Manager Sarah',
    action: 'INVENTORY_CREATED',
    targetEntityType: 'InventoryItem',
    targetEntityId: 'ing_avocado',
    notes: 'Ingested 50 units of Hass Avocado to ingredient catalog.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_4',
    timestamp: Date.now() - 4 * 3600 * 1000, // 4 hours ago
    userRole: 'owner',
    userIdentifier: 'Owner Dave',
    action: 'ROLE_DEFINITION_MODIFIED',
    targetEntityType: 'RoleDefinition',
    targetEntityId: 'manager',
    notes: 'Expanded spectrum permissions for Manager role nodes.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_5',
    timestamp: Date.now() - 1 * 24 * 3600 * 1000, // 1 day ago
    userRole: 'owner',
    userIdentifier: 'Owner Dave',
    action: 'STAFF_REGISTERED',
    targetEntityType: 'User',
    targetEntityId: 'staff_jenna',
    notes: 'Registered Jenna Smith as cashier.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_6',
    timestamp: Date.now() - 1.5 * 24 * 3600 * 1000, // 1.5 days ago
    userRole: 'cashier',
    userIdentifier: 'Cashier Jenna',
    action: 'PAYMENT_CONFIRMED',
    targetEntityType: 'Order',
    targetEntityId: 'order_0998',
    notes: 'Settled bill of $248.50 for station 8 (Amex).',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_7',
    timestamp: Date.now() - 2 * 24 * 3600 * 1000, // 2 days ago
    userRole: 'manager',
    userIdentifier: 'Manager Sarah',
    action: 'TABLE_UPDATED',
    targetEntityType: 'Table',
    targetEntityId: 'table_4',
    notes: 'Station 4 capacity reconfigured to 6 seats.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_8',
    timestamp: Date.now() - 3 * 24 * 3600 * 1000, // 3 days ago
    userRole: 'manager',
    userIdentifier: 'Manager Sarah',
    action: 'QR_SCANNED',
    targetEntityType: 'MenuItem',
    targetEntityId: 'item_shrimp_tacos',
    notes: 'Validated QR menu item lookup for shrimp tacos.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_9',
    timestamp: Date.now() - 4 * 24 * 3600 * 1000, // 4 days ago
    userRole: 'manager',
    userIdentifier: 'Manager Sarah',
    action: 'SESSION_ESTABLISHED',
    targetEntityType: 'User',
    targetEntityId: 'sarah_session',
    notes: 'Successful administrative logon.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_10',
    timestamp: Date.now() - 5 * 24 * 3600 * 1000, // 5 days ago
    userRole: 'manager',
    userIdentifier: 'Manager Sarah',
    action: 'ORDER_COMMIT_FAILURE',
    targetEntityType: 'Order',
    targetEntityId: 'N/A',
    notes: 'Order submit aborted due to database socket timing out.',
    outcome: ActionOutcome.FAILURE
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_11',
    timestamp: Date.now() - 7 * 24 * 3600 * 1000, // 7 days ago
    userRole: 'guest',
    userIdentifier: 'Guest-A38',
    action: 'ORDER_SUBMITTED',
    targetEntityType: 'Order',
    targetEntityId: 'order_0821',
    notes: 'Guest submitted mobile cart checkout order.',
    outcome: ActionOutcome.SUCCESS
  },
    {
    organizationId: "demo-id",
    id: 'log_mock_12',
    timestamp: Date.now() - 10 * 24 * 3600 * 1000, // 10 days ago
    userRole: 'manager',
    userIdentifier: 'Manager Sarah',
    action: 'INVENTORY_DELETED',
    targetEntityType: 'InventoryItem',
    targetEntityId: 'ing_aged_ribeye',
    notes: 'Decompiled spoiled inventory for item: Aged Ribeye.',
    outcome: ActionOutcome.SUCCESS
  },
  {
    organizationId: "demo-id",
    id: 'log_mock_13',
    timestamp: Date.now() - 12 * 24 * 3600 * 1000, // 12 days ago
    userRole: 'owner',
    userIdentifier: 'Owner Dave',
    action: 'STAFF_STATUS_UPDATED',
    targetEntityType: 'User',
    targetEntityId: 'former_chef',
    notes: 'Shifted staff account former_chef status to INACTIVE.',
    outcome: ActionOutcome.SUCCESS
  }
];

/**
 * Authority Node: Token Synchronization
 * Forces Firebase to fetch a new ID token, ensuring custom claims 
 * (organizationId, role) are propagated to the client immediately after 
 * administrative registration or bootstrap sequences.
 */
export const refreshIdToken = async (): Promise<boolean> => {
  try {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.warn('[IRSW Auth] No current user available for ID token refresh', {
        action: 'refresh-id-token-skipped',
      });
      return false;
    }

    console.log('[IRSW Auth] Forcing ID token refresh to synchronize custom claims', {
      action: 'refresh-id-token-request',
      uid: currentUser.uid,
    });

    const refreshedToken = await currentUser.getIdTokenResult(true);

    console.log('[IRSW Auth] ID token refreshed', {
      action: 'refresh-id-token-success',
      uid: currentUser.uid,
      claims: refreshedToken.claims,
    });

    return true;

  } catch (error) {
    console.error('[IRSW Auth] Failed to refresh ID token:', error);
    return false;
  }
};

const App = () => {
  const { user, updateUser: setUser, loading: isAuthLoading, authError, retryInit, logout: authLogout } = useAuth();
  
  const [activeView, setActiveView] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('item') || urlParams.has('category') || urlParams.has('table') || urlParams.get('view') === 'CUSTOMER') {
          return 'CUSTOMER';
        }
      }
      return localStorage.getItem(PREFS_VIEW_KEY) || 'LANDING';
    }
    catch { return 'LANDING'; }
  });
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [historicalOrders, setHistoricalOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const savedCart = localStorage.getItem(CART_STORAGE_KEY);
      return savedCart ? JSON.parse(savedCart) : [];
    } catch (err) {
      console.error("[IRSW Core] Cart restoration failed:", err);
      return [];
    }
  });

  const [tables, setTables] = useState<Table[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => MOCK_HISTORICAL_LOGS);
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>(DEFAULT_ROLES);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [networkLatency, setNetworkLatency] = useState(24);

  const logAction = useCallback((action: string, entityType: EntityType, entityId: string, outcome: ActionOutcome, notes?: string) => {
    const newLog: AuditLog = {
      organizationId: user?.organizationId ?? "demo-id",
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      userRole: user?.role || 'guest',
      userIdentifier: user?.name || 'Anonymous',
      action,
      targetEntityType: entityType,
      targetEntityId: entityId,
      outcome,
      notes
    };
    setAuditLogs(prev => [newLog, ...prev]);
  }, [user]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(PREFS_SIDEBAR_KEY) === 'true'; }
    catch { return false; }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem(PREFS_THEME_KEY) as 'light' | 'dark') || 'light'; }
    catch { return 'light'; }
  });

  const [initTimeout, setInitTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!systemConfig) setInitTimeout(true);
    }, 20000);
    return () => clearTimeout(timer);
  }, [systemConfig]);

  // Persistence Effects
  useEffect(() => {
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch (e) {}
  }, [cart]);

  useEffect(() => {
    try { localStorage.setItem(PREFS_VIEW_KEY, activeView); } catch (e) {}
  }, [activeView]);

  useEffect(() => {
    try { localStorage.setItem(PREFS_SIDEBAR_KEY, String(isSidebarCollapsed)); } catch (e) {}
  }, [isSidebarCollapsed]);

  useEffect(() => {
    try { localStorage.setItem(PREFS_THEME_KEY, theme); } catch (e) {}
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Simulated Network Pulse
  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkLatency(prev => {
        const delta = Math.floor(Math.random() * 5) - 2;
        return Math.max(12, Math.min(60, prev + delta));
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const badges = useMemo(() => ({
    lowStock: ingredients.filter(i => i.stock < 10).length,
    pendingApprovals: activeOrders.filter(o => o.status === OrderStatus.AWAITING_APPROVAL).length,
    pendingPayments: activeOrders.filter(o => o.paymentStatus === PaymentStatus.SUBMITTED).length,
    readyToServe: activeOrders.filter(o => o.status === OrderStatus.READY).length,
    occupiedTables: tables.filter(t => t.status === TableStatus.OCCUPIED).length,
    feedbackCount: 0,
    pendingReservations: 0,
    pendingStaff: staffList.filter(s => s.status === UserStatus.PENDING_APPROVAL).length,
    activeTasks: tasks.filter(t => t.status !== TaskStatus.COMPLETED).length,
  }), [activeOrders, tables, staffList, tasks, ingredients]);

  useEffect(() => {
    if (user) {
      db.getSystemConfig(user.role)
        .then(setSystemConfig)
        .catch(() => {
          setSystemConfig({ initialized: true, initializedAt: Date.now(), version: 'v5.3.0', lastMaintenance: Date.now() });
        });
    } else {
        setSystemConfig({ initialized: true, initializedAt: Date.now(), version: 'v5.3.0', lastMaintenance: Date.now() });
    }
  }, [user]);

  useEffect(() => {
    if (!user || !user.uid || !user.organizationId) {
      setCategories([]);
      setCategoriesError('Organization not assigned');
      setCategoriesLoading(false);
      return;
    }

    setCategoriesLoading(true);
    const unsubscribeCategories = firestore.categories.subscribe(
      user.organizationId,
      async (data) => {
        if (data.length === 0) {
          try {
            console.log('Seeding categories from INITIAL_CATEGORIES...');
            const seedItems = INITIAL_CATEGORIES.map(cat => ({
              id: cat.id,
              name: cat.name,
              icon: cat.icon,
              description: (cat as any).description || '',
              sortOrder: parseInt(cat.id.split('_')[1] || '0', 10),
              status: 'ACTIVE' as const
            }));
            await firestore.categories.batchSet(user.organizationId as string, seedItems, user.uid || 'SYSTEM');
          } catch (err: any) {
            console.error('Failed to seed categories:', err);
            setCategoriesError(err.message || 'Error seeding categories');
            setCategoriesLoading(false);
          }
        } else {
          const sorted = [...data].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
          setCategories(sorted as unknown as MenuCategory[]);
          setCategoriesLoading(false);
          setCategoriesError(null);
        }
      },
      (err: any) => {
        console.error('Categories subscription error:', err);
        setCategoriesError(err.message || 'Failed to load categories');
        setCategoriesLoading(false);
      }
    );

    setTablesLoading(true);
    const unsubscribeTables = firestore.tables.subscribe(
      user.organizationId,
      async (data) => {
        if (data.length === 0) {
          try {
            console.log('Seeding tables from INITIAL_TABLES...');
            const seedItems = INITIAL_TABLES.map(table => ({
              id: table.id,
              name: `Table ${table.number}`,
              capacity: table.capacity,
              status: table.status as any,
              shape: table.shape as any,
              positionX: table.x,
              positionY: table.y,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }));
            await firestore.tables.batchSet(user.organizationId as string, seedItems, user.uid || 'SYSTEM');
          } catch (err: any) {
             console.error('Failed to seed tables:', err);
             setTablesError(err.message || 'Error seeding tables');
             setTablesLoading(false);
          }
        } else {
          const mappedTables: Table[] = data.map(doc => ({
            id: doc.id,
            number: doc.name.replace('Table ', ''),
            x: doc.positionX,
            y: doc.positionY,
            capacity: doc.capacity,
            status: doc.status as TableStatus,
            shape: doc.shape as any
          }));
          const sorted = mappedTables.sort((a,b) => a.number.localeCompare(b.number));
          setTables(sorted);
          setTablesLoading(false);
          setTablesError(null);
        }
      },
      (err: any) => {
        console.error('Tables subscription error:', err);
        setTablesError(err.message || 'Failed to sync tables');
        setTablesLoading(false);
      }
    );

    setMenuLoading(true);
    const unsubscribeMenu = firestore.menuItems.subscribe(
      user.organizationId,
      async (data) => {
        if (data.length === 0) {
          try {
            console.log('Seeding menuItems from INITIAL_MENU...');
            const seedItems = INITIAL_MENU.map((item, idx) => ({
              id: item.id,
              categoryId: item.categoryId,
              name: item.name,
              description: item.description || '',
              price: item.price,
              imageUrl: item.image,
              status: item.available ? 'AVAILABLE' as const : 'UNAVAILABLE' as const,
              options: (item.options || []).map((o, i) => ({
                id: `opt_${Date.now()}_${i}`,
                name: o.name,
                priceModifier: o.priceModifier,
                isAvailable: true
              })),
              sortOrder: idx,
              visible_to_guest: item.visible_to_guest ?? true
            }));
            await firestore.menuItems.batchSet(user.organizationId as string, seedItems, user.uid || 'SYSTEM');
          } catch (err: any) {
             console.error('Failed to seed menuItems:', err);
             setMenuError(err.message || 'Error seeding menu items');
             setMenuLoading(false);
          }
        } else {
          const mappedMenu: MenuItem[] = data.map(doc => ({
            id: doc.id,
            categoryId: doc.categoryId,
            name: doc.name,
            description: doc.description || '',
            price: doc.price,
            image: doc.imageUrl || 'https://picsum.photos/200/200?random=' + Math.floor(Math.random() * 10),
            status: doc.status === 'AVAILABLE' ? MenuItemStatus.AVAILABLE : MenuItemStatus.UNAVAILABLE,
            available: doc.status !== 'UNAVAILABLE' && doc.status !== 'ARCHIVED',
            visible_to_guest: (doc as any).visible_to_guest ?? true,
            options: (doc.options || []).map(o => ({
              name: o.name, 
              priceModifier: o.priceModifier
            }))
          }));
          const sorted = mappedMenu.sort((a,b) => a.categoryId.localeCompare(b.categoryId) || a.name.localeCompare(b.name));
          setMenu(sorted);
          setMenuLoading(false);
          setMenuError(null);
        }
      },
      (err: any) => {
        console.error('MenuItems subscription error:', err);
        setMenuError(err.message || 'Failed to sync menu items');
        setMenuLoading(false);
      }
    );

    setInventoryLoading(true);
    const unsubscribeInventory = user.role !== 'guest' ? firestore.inventory.subscribe(
      user.organizationId,
      async (data) => {
        if (data.length === 0) {
          try {
            console.log('Seeding inventory from INITIAL_INGREDIENTS...');
            const seedItems = INITIAL_INGREDIENTS.map(ing => ({
              id: ing.id,
              name: ing.name,
              unitOfMeasure: ing.unit,
              currentStock: ing.stock,
              minimumStockLevel: 10,
              status: ing.stock <= 0 ? 'OUT_OF_STOCK' : ing.stock < 10 ? 'LOW_STOCK' : 'IN_STOCK' as any,
              costPerUnit: 0,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }));
            await firestore.inventory.batchSet(user.organizationId as string, seedItems, user.uid || 'SYSTEM');
          } catch (err: any) {
            console.error('Failed to seed inventory:', err);
            setInventoryError(err.message || 'Error seeding inventory');
            setInventoryLoading(false);
          }
        } else {
          const mappedIngredients: Ingredient[] = data.map(doc => ({
            id: doc.id,
            name: doc.name,
            stock: doc.currentStock,
            unit: doc.unitOfMeasure
          }));
          const sorted = mappedIngredients.sort((a,b) => a.name.localeCompare(b.name));
          setIngredients(sorted);
          setInventoryLoading(false);
          setInventoryError(null);
        }
      },
      (err: any) => {
        console.error('Inventory subscription error:', err);
        setInventoryError(err.message || 'Failed to sync inventory');
        setInventoryLoading(false);
      }
    ) : () => {};

    setOrdersLoading(true);
    const activeOrdersQuery = {
      where: [{
        field: 'status',
        operator: 'in' as const,
        value: ['AWAITING_APPROVAL', 'PENDING', 'PREPARING', 'READY', 'SERVED']
      }],
      limit: 100
    };

    const unsubscribeOrders = user.role !== 'guest' ? firestore.orders.subscribeQuery(
      user.organizationId,
      activeOrdersQuery,
      (data) => {
        const mappedOrders: Order[] = data.map(doc => ({
          id: doc.id,
          tableId: doc.tableId,
          customerName: doc.customerName,
          status: doc.status as OrderStatus,
          paymentStatus: doc.paymentStatus as PaymentStatus,
          total: doc.grandTotal,
          timestamp: doc.createdAt || Date.now(),
          createdBy: (doc.orderSource as Role) || 'waiter',
          guestAvatar: doc.guestAvatar,
          guestColor: doc.guestColor,
          items: doc.items.map(item => ({
            id: item.menuItemId,
            categoryId: item.legacyCartItem?.categoryId || 'cat_1', // legacy filler
            name: item.name,
            description: item.legacyCartItem?.description || '', // legacy filler
            price: item.unitPrice,
            image: item.legacyCartItem?.image || '', // legacy filler
            status: MenuItemStatus.AVAILABLE,
            available: true,
            visible_to_guest: true,
            cartId: item.id,
            quantity: item.quantity,
            selectedOptions: item.optionsSelected.map(opt => ({
              id: opt.optionId,
              name: opt.name,
              priceModifier: opt.price,
              isAvailable: true
            })),
            notes: item.notes,
            groupId: item.legacyCartItem?.groupId,
            groupName: item.legacyCartItem?.groupName
          }))
        }));
        
        // Sort in memory by timestamp descending to avoid requiring composite indexes on Firestore
        mappedOrders.sort((a, b) => b.timestamp - a.timestamp);
        
        setActiveOrders(mappedOrders);
        setOrdersLoading(false);
        setOrdersError(null);
      },
      (err: any) => {
        console.error('Orders subscription error:', err);
        setOrdersError(err.message || 'Failed to sync active orders');
        setOrdersLoading(false);
      }
    ) : () => {};

    setStaffLoading(true);
    const unsubscribeStaff = firestore.staff.subscribe(
      user.organizationId,
      (data) => {
        const mappedStaff: UserProfile[] = data.map(doc => ({
          uid: doc.uid,
          name: doc.displayName || doc.firstName + ' ' + doc.lastName,
          firstName: doc.firstName,
          lastName: doc.lastName,
          email: doc.email,
          phone: doc.phone || '',
          role: doc.role as any,
          status: doc.status as any,
          staffCode: doc.staffCode,
          photoFileName: doc.avatarUrl,
        }));
        setStaffList(mappedStaff);
        setStaffLoading(false);
        setStaffError(null);
      },
      (err: any) => {
        console.error('Staff subscription error:', err);
        setStaffError(err.message || 'Failed to sync staff');
        setStaffLoading(false);
      }
    );

    return () => {
      unsubscribeCategories();
      unsubscribeTables();
      unsubscribeMenu();
      unsubscribeInventory();
      unsubscribeOrders();
      unsubscribeStaff();
    };
  }, [user?.organizationId, user?.uid, user]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const itemParam = urlParams.get('item');
        if (itemParam && menu && menu.length > 0) {
          const matchedItem = menu.find(i => 
            i.id.toLowerCase() === itemParam.toLowerCase() ||
            i.name.toLowerCase() === itemParam.toLowerCase() ||
            i.name.toLowerCase().replace(/\s+/g, '_') === itemParam.toLowerCase() ||
            i.name.toLowerCase().replace(/\s+/g, '-') === itemParam.toLowerCase()
          );
          if (matchedItem) {
            setPendingSelectionItem(matchedItem);
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
          }
        }
      }
    } catch (e) {
      console.error("[IRSW] Item deep link error:", e);
    }
  }, [menu]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const tableParam = urlParams.get('table');
        if (tableParam && tables && tables.length > 0) {
          const matchedTable = tables.find(t => 
            t.id.toLowerCase() === tableParam.toLowerCase() ||
            t.number.toLowerCase() === tableParam.toLowerCase()
          );
          if (matchedTable) {
            setSelectedTableId(matchedTable.id);
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
            logAction('TABLE_SAMPLED', 'Table', matchedTable.id, ActionOutcome.SUCCESS, `Guest paired to Station ${matchedTable.number} via QR code scan.`);
          }
        }
      }
    } catch (e) {
      console.error("[IRSW] Table deep link error:", e);
    }
  }, [tables, logAction]);
  
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [pendingSelectionItem, setPendingSelectionItem] = useState<MenuItem | null>(null);
  const [lastConfirmedOrder, setLastConfirmedOrder] = useState<Order | null>(null);
  const [isClearCartModalOpen, setIsClearCartModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const [isMapTestOpen, setIsMapTestOpen] = useState(false);
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [qrNotification, setQrNotification] = useState<{ message: string, type: 'success' | 'info' | 'error' } | null>(null);

  const showQRToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setQrNotification({ message, type });
    setTimeout(() => {
      setQrNotification(null);
    }, 4500);
  }, []);

  const handleQRScan = useCallback((scannedText: string) => {
    setIsScannerOpen(false);
    try {
      let url: URL;
      try {
        url = new URL(scannedText);
      } catch (_) {
        url = new URL(`https://dummy.com/?${scannedText.includes('=') ? scannedText : 'table=' + scannedText}`);
      }
      const params = new URLSearchParams(url.search);
      const itemParam = params.get('item');
      const tableParam = params.get('table');

      if (tableParam) {
        const matchedTable = tables.find(t => 
          t.id.toLowerCase() === tableParam.toLowerCase() ||
          t.number.toLowerCase() === tableParam.toLowerCase()
        );
        if (matchedTable) {
          setSelectedTableId(matchedTable.id);
          logAction('TABLE_SAMPLED', 'Table', matchedTable.id, ActionOutcome.SUCCESS, `Terminal paired to Station ${matchedTable.number} via QR code scan.`);
          showQRToast(`Paired successfully to Station ${matchedTable.number}!`, 'success');
          return;
        }
      }

      if (itemParam) {
        const matchedItem = menu.find(i => 
          i.id.toLowerCase() === itemParam.toLowerCase() ||
          i.name.toLowerCase() === itemParam.toLowerCase() ||
          i.name.toLowerCase().replace(/\s+/g, '_') === itemParam.toLowerCase() ||
          i.name.toLowerCase().replace(/\s+/g, '-') === itemParam.toLowerCase()
        );
        if (matchedItem) {
          setPendingSelectionItem(matchedItem);
          logAction('QR_SCANNED', 'MenuItem', matchedItem.id, ActionOutcome.SUCCESS, `Selected menu item via QR scan: ${matchedItem.name}`);
          showQRToast(`Found menu item: ${matchedItem.name}`, 'success');
          return;
        }
      }

      const directTable = tables.find(t => 
        t.id.toLowerCase() === scannedText.toLowerCase() ||
        t.number.toLowerCase() === scannedText.toLowerCase()
      );
      if (directTable) {
        setSelectedTableId(directTable.id);
        logAction('TABLE_SAMPLED', 'Table', directTable.id, ActionOutcome.SUCCESS, `Terminal locked to Station ${directTable.number} via numeric scans.`);
        showQRToast(`Paired successfully to Station ${directTable.number}!`, 'success');
        return;
      }

      const directItem = menu.find(i => 
        i.id.toLowerCase() === scannedText.toLowerCase() ||
        i.name.toLowerCase() === scannedText.toLowerCase()
      );
      if (directItem) {
        setPendingSelectionItem(directItem);
        logAction('QR_SCANNED', 'MenuItem', directItem.id, ActionOutcome.SUCCESS, `Found item: ${directItem.name}`);
        showQRToast(`Selecting item: ${directItem.name}`, 'success');
        return;
      }

      showQRToast(`Scanned raw data: "${scannedText}"`, 'info');
    } catch (e: any) {
      showQRToast(`Could not decode scanned text`, 'error');
    }
  }, [tables, menu, logAction, showQRToast]);

  const guestActiveOrders = useMemo(() => {
    if (!user || user.role !== 'guest') return [];
    return activeOrders.filter(o => o.customerName === user.name && o.status !== OrderStatus.PAID && o.status !== OrderStatus.CANCELLED);
  }, [user, activeOrders]);

  useEffect(() => {
    if (isHistoryModalOpen && user?.organizationId) {
      const fetchHistory = async () => {
        try {
          const queryOptions: any = {
            limit: 50
          };
          
          if (user.role === 'guest') {
             queryOptions.where = [{ field: 'customerName', operator: '==', value: user.name }];
          } else {
             const currentTable = tables.find(t => t.id === selectedTableId);
             if (currentTable) {
               queryOptions.where = [{ field: 'tableId', operator: '==', value: currentTable.number }];
             } else {
               queryOptions.where = [{ field: 'status', operator: 'in', value: ['PAID', 'CANCELLED'] }];
             }
          }

          if (!user?.organizationId) return;
          const rawData = await firestore.orders.executeQuery(user.organizationId, queryOptions);
          const mappedOrders: Order[] = rawData.map((doc: any) => ({
            id: doc.id,
            tableId: doc.tableId,
            customerName: doc.customerName,
            status: doc.status as OrderStatus,
            paymentStatus: doc.paymentStatus as PaymentStatus,
            total: doc.grandTotal,
            timestamp: doc.createdAt || Date.now(),
            createdBy: (doc.orderSource as Role) || 'waiter',
            guestAvatar: doc.guestAvatar,
            guestColor: doc.guestColor,
            items: doc.items.map((item: any) => ({
              id: item.menuItemId,
              categoryId: item.legacyCartItem?.categoryId || 'cat_1',
              name: item.name,
              description: item.legacyCartItem?.description || '',
              price: item.unitPrice,
              image: item.legacyCartItem?.image || '',
              status: MenuItemStatus.AVAILABLE,
              available: true,
              visible_to_guest: true,
              cartId: item.id,
              quantity: item.quantity,
              selectedOptions: item.optionsSelected.map((opt: any) => ({
                id: opt.optionId,
                name: opt.name,
                priceModifier: opt.price,
                isAvailable: true
              })),
              notes: item.notes,
              groupId: item.legacyCartItem?.groupId,
              groupName: item.legacyCartItem?.groupName
            }))
          }));
          
          // Sort in memory by timestamp descending to avoid requiring composite indexes on Firestore
          mappedOrders.sort((a, b) => b.timestamp - a.timestamp);
          
          setHistoricalOrders(mappedOrders);
        } catch (error) {
          console.error("Failed to load historical orders", error);
        }
      };
      
      fetchHistory();
    }
  }, [isHistoryModalOpen, user, selectedTableId, tables, firestore]);

  const historyOrders = historicalOrders;

  const handleLogout = useCallback(async () => {
    setIsTerminating(true);
    try {
      logAction('SESSION_TERMINATION', 'User', user?.staffCode || user?.sessionId || 'Unknown', ActionOutcome.SUCCESS);
      await authLogout(); 
      try { localStorage.removeItem(CART_STORAGE_KEY); localStorage.removeItem(PREFS_VIEW_KEY); } catch(e) {}
      setIsTerminating(false);
    } catch (err) {
      try { localStorage.clear(); } catch(e) {}
      window.location.href = '/';
    }
  }, [user, logAction, authLogout]);

  const handleResetSession = useCallback(async () => {
    if (user?.role === 'guest' && guestActiveOrders.length > 0) {
      logAction('GUEST_EXIT_ACTIVE', 'User', user?.sessionId || 'Unknown', ActionOutcome.SUCCESS, 'Guest exited UI while orders are pending.');
      await authLogout();
      setActiveView('LANDING');
      setCart([]);
      setIsLogoutModalOpen(false);
      try { localStorage.removeItem(CART_STORAGE_KEY); localStorage.removeItem(PREFS_VIEW_KEY); } catch(e) {}
    } else {
      setIsTerminating(true);
      try {
        logAction('GUEST_RESET', 'User', user?.sessionId || 'Unknown', ActionOutcome.SUCCESS);
        await authLogout(); 
        try { localStorage.removeItem(CART_STORAGE_KEY); localStorage.removeItem(PREFS_VIEW_KEY); } catch(e) {}
        setIsTerminating(false);
      } catch (err) {
        try { localStorage.clear(); } catch(e) {}
        window.location.href = '/';
      }
    }
  }, [user, guestActiveOrders, logAction, authLogout]);

  const hasPermission = useCallback((perm: Permission): boolean => {
    if (!user) return false;
    const roleDef = roleDefinitions.find(r => r.id === user.role);
    return roleDef?.permissions.includes(perm) || false;
  }, [user, roleDefinitions]);

  useEffect(() => {
    if (user) {
      setSecurityError(null);
      let savedView = 'LANDING';
      try { savedView = localStorage.getItem(PREFS_VIEW_KEY) || 'LANDING'; } catch(e) {}
      if (!savedView || savedView === 'LANDING') {
        if (user.role === 'guest') {
          setActiveView('CUSTOMER');
        } else {
          switch (user.role as string) {
            case 'kitchen': setActiveView('KDS'); break;
            case 'cashier':
            case 'waiter': setActiveView('POS'); break;
            case 'manager':
            case 'system_admin':
            case 'owner': setActiveView('ADMIN_SALES'); break;
            default: setActiveView('POS');
          }
        }
      }
      logAction('SESSION_ESTABLISHED', 'User', user.staffCode || user.sessionId || 'N/A', ActionOutcome.SUCCESS);
    }
  }, [user]);

  const executeSubmitOrder = useCallback(async () => {
    if (!user || !user.organizationId) return;
    const currentTable = tables.find(t => t.id === selectedTableId);
    
    try {
        const orderDoc = {
          tableId: currentTable?.number,
          customerName: user.name,
          customerId: user.uid,
          orderType: currentTable ? 'DINE_IN' : 'TAKEAWAY',
          status: 'AWAITING_APPROVAL',
          paymentStatus: 'PENDING',
          subtotal: cart.reduce((acc, i) => acc + (i.price * i.quantity), 0),
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: cart.reduce((acc, i) => acc + (i.price * i.quantity), 0),
          orderSource: user.role,
          kitchenStatus: 'PENDING',
          guestAvatar: user.guestAvatar,
          guestColor: user.guestColor,
          items: await Promise.all(cart.map(async item => {
            const baseItem = {
              id: item.cartId || `cart_${Date.now()}_${Math.random().toString(36).substring(2)}`,
              menuItemId: item.id,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.price,
              optionsSelected: item.selectedOptions.map(o => ({
                optionId: o.name,
                name: o.name,
                price: o.priceModifier
              })),
              notes: item.notes,
              fulfilled: false,
              legacyCartItem: item
            };

            try {
              const snapshot = await captureOrderItemSnapshot(user.organizationId!, baseItem as any);
              if (snapshot) {
                return {
                  ...baseItem,
                  recipeId: snapshot.recipeId,
                  recipeVersion: snapshot.recipeVersion,
                  snapshotCapturedAt: snapshot.snapshotCapturedAt,
                  resourceSnapshot: snapshot.resourceSnapshot,
                  estimatedFoodCost: snapshot.estimatedFoodCost
                };
              }
            } catch (snapError) {
              console.error('Failed to capture snapshot for item', item.id, snapError);
            }
            
            return baseItem;
          }))
        };
        
        await firestore.orders.create(user.organizationId, orderDoc as any, user.uid || 'SYSTEM');
        setCart([]);
        setSecurityError(null);
        logAction('ORDER_SUBMITTED', 'Order', 'NEW', ActionOutcome.SUCCESS);
    } catch (err: any) {
        setSecurityError(err.message);
        logAction('ORDER_COMMIT_FAILURE', 'Order', 'NEW', ActionOutcome.FAILURE, err.message);
    }
  }, [user, cart, logAction, tables, selectedTableId]);

  const handleApproveGuestOrder = useCallback(async (o: Order) => {
    if (!user?.organizationId) return;
    await firestore.orders.update(user.organizationId, o.id, { status: OrderStatus.PENDING }, user.uid || 'SYSTEM');
    logAction('ORDER_APPROVED', 'Order', o.id, ActionOutcome.SUCCESS, `Staff ${user?.name} approved guest request.`);
  }, [user, logAction]);

  const handleRejectGuestOrder = useCallback(async (o: Order) => {
    if (!user?.organizationId) return;
    await firestore.orders.update(user.organizationId, o.id, { status: OrderStatus.CANCELLED }, user.uid || 'SYSTEM');
    logAction('ORDER_REJECTED', 'Order', o.id, ActionOutcome.SUCCESS, `Staff ${user?.name} rejected guest request.`);
  }, [user, logAction]);

  const handleUpdateTable = useCallback(async (updatedTable: Table) => {
    if (!user?.organizationId) return;
    try {
      await firestore.tables.update(user.organizationId, updatedTable.id, {
        name: `Table ${updatedTable.number}`,
        positionX: Math.round(updatedTable.x),
        positionY: Math.round(updatedTable.y),
        capacity: updatedTable.capacity,
        status: updatedTable.status as any,
        shape: updatedTable.shape as any
      }, user.uid || 'SYSTEM');
      logAction('TABLE_UPDATED', 'Table', updatedTable.id, ActionOutcome.SUCCESS, `Station ${updatedTable.number} reconfigured.`);
    } catch (err: any) {
      console.error('Failed to update table:', err);
    }
  }, [user, logAction]);

  const handleCreateIngredient = useCallback(async (ing: Partial<Ingredient>) => {
    if (!user?.organizationId) return;
    try {
      if (!ing.unit) throw new Error("Unit of measure is required for inventory.");
      const payload = {
        name: ing.name || 'New Ingredient',
        description: '',
        unitOfMeasure: ing.unit,
        currentStock: ing.stock || 0,
        minimumStockLevel: 10,
        status: (ing.stock || 0) <= 0 ? 'OUT_OF_STOCK' : (ing.stock || 0) < 10 ? 'LOW_STOCK' : 'IN_STOCK' as any,
        costPerUnit: 0
      };
      if (ing.id) {
        await firestore.inventory.set(user.organizationId, ing.id, payload, user.uid || 'SYSTEM');
      } else {
        await firestore.inventory.create(user.organizationId, payload, user.uid || 'SYSTEM');
      }
      logAction('INVENTORY_CREATED', 'InventoryItem', ing.id || 'NEW', ActionOutcome.SUCCESS, `Added ${ing.name} to inventory.`);
    } catch (err) {
      console.error('Failed to create ingredient:', err);
    }
  }, [user, logAction]);

  const handleUpdateIngredient = useCallback(async (id: string, updates: Partial<Ingredient>) => {
    if (!user?.organizationId) return;
    try {
      const existingIngredient = ingredients.find(i => i.id === id);
      if (!existingIngredient) return;

      const docUpdates: any = {};
      let hasMetadataUpdates = false;

      if (updates.name !== undefined) {
        docUpdates.name = updates.name;
        hasMetadataUpdates = true;
      }
      if (updates.unit !== undefined) {
        docUpdates.unitOfMeasure = updates.unit;
        hasMetadataUpdates = true;
      }

      if (updates.stock !== undefined) {
        const previousStock = existingIngredient.stock || 0;
        const requestedStock = updates.stock;
        const delta = requestedStock - previousStock;
        
        if (delta !== 0) {
          await firestore.inventory.adjustStock(
            user.organizationId,
            id,
            delta,
            'Manual Adjustment',
            user.uid || 'SYSTEM'
          );
        }
        
        const newStatus = requestedStock <= 0 ? 'OUT_OF_STOCK' : requestedStock < 10 ? 'LOW_STOCK' : 'IN_STOCK';
        docUpdates.status = newStatus;
        hasMetadataUpdates = true;
      }

      if (hasMetadataUpdates) {
        await firestore.inventory.update(user.organizationId, id, docUpdates, user.uid || 'SYSTEM');
      }
    } catch (err) {
      console.error('Failed to update ingredient:', err);
    }
  }, [user, ingredients]);

  const handleDeleteIngredient = useCallback(async (id: string) => {
    if (!user?.organizationId) return;
    try {
      await firestore.inventory.softDelete(user.organizationId, id, user.uid || 'SYSTEM');
      logAction('INVENTORY_DELETED', 'InventoryItem', id, ActionOutcome.SUCCESS, 'Removed ingredient.');
    } catch (err) {
      console.error('Failed to delete ingredient:', err);
    }
  }, [user, logAction]);

  const handleUpdateRole = useCallback((newRole: RoleDefinition) => {
    setRoleDefinitions(prev => {
        const index = prev.findIndex(r => r.id === newRole.id);
        if (index !== -1) {
            const updated = [...prev];
            updated[index] = newRole;
            return updated;
        }
        return [...prev, newRole];
    });
    logAction('ROLE_DEFINITION_MODIFIED', 'RoleDefinition', newRole.id, ActionOutcome.SUCCESS, `Authority protocol '${newRole.name}' adjusted.`);
  }, [logAction]);

  const handleDeleteRole = useCallback((roleId: string) => {
    setRoleDefinitions(prev => prev.filter(r => r.id !== roleId));
    logAction('ROLE_DEFINITION_REMOVED', 'RoleDefinition', roleId, ActionOutcome.SUCCESS, 'Authority protocol decommissioned.');
  }, [logAction]);

  const handleAddMenuItems = useCallback(async (items: Partial<MenuItem>[]) => {
    if (!user?.organizationId) return;
    try {
      const newDocs = items.map((item, idx) => ({
        id: `item_digitized_${Date.now()}_${idx}`,
        categoryId: item.categoryId || 'cat_1',
        name: item.name || 'Unknown Item',
        description: item.description || '',
        price: item.price || 0,
        imageUrl: item.image || 'https://picsum.photos/200/200?random=' + Math.floor(Math.random() * 100),
        status: 'AVAILABLE' as const,
        options: (item.options || []).map((o, i) => ({
          id: `opt_${Date.now()}_${i}`,
          name: o.name,
          priceModifier: o.priceModifier,
          isAvailable: true
        })),
        sortOrder: 0,
        visible_to_guest: true
      }));
      await firestore.menuItems.batchSet(user.organizationId, newDocs as any, user.uid || 'SYSTEM');
      logAction('MENU_DIGITIZED', 'MenuItem', 'MULTIPLE', ActionOutcome.SUCCESS, `Successfully ingested ${items.length} digitized entries.`);
    } catch (err) {
      console.error('Failed to ingest digitized menu:', err);
    }
  }, [user, logAction]);

  const handleToggleAvailability = useCallback(async (id: string) => {
      if (!user?.organizationId) return;
      const item = menu.find(m => m.id === id);
      if (item) {
          const newStatus = item.status === MenuItemStatus.AVAILABLE ? 'UNAVAILABLE' : 'AVAILABLE';
          await firestore.menuItems.update(user.organizationId, id, { status: newStatus }, user.uid || 'SYSTEM');
      }
  }, [menu, user]);

  const handleToggleGuestVisibility = useCallback(async (id: string) => {
      if (!user?.organizationId) return;
      const item = menu.find(m => m.id === id);
      if (item) {
          await firestore.menuItems.update(user.organizationId, id, { visible_to_guest: !item.visible_to_guest }, user.uid || 'SYSTEM');
      }
  }, [menu, user]);

  const handleUpdateStaffStatus = useCallback(async (staffId: string, status: UserStatus) => {
    if (!user?.organizationId) return;
    try {
      await firestore.staff.update(user.organizationId, staffId, { status: status as any }, user.uid || 'SYSTEM');
      logAction('STAFF_STATUS_UPDATED', 'User', staffId, ActionOutcome.SUCCESS, `Account status shifted to ${status}.`);
    } catch (err) {
      console.error('Failed to update staff status:', err);
    }
  }, [user, logAction]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const { isSystemAdmin } = useRole(user?.role);

    /**
     * Stage 4: Bootstrap Architecture - Register New Restaurant
     * This resolves the bootstrap deadlock by creating an organization and an owner simultaneously.
     */
    const handleRegisterRestaurant = useCallback(async (restaurantName: string, ownerName: string, email: string, phone: string, password: string) => {
        setIsTerminating(true); // Show loading overlay for initialization
        console.log('[Bootstrap START] Initializing new restaurant and owner profile', {
            action: 'bootstrap-start',
            restaurantName,
            email,
        });

          try {
            if (!functions) {
                throw new Error("Firebase Functions not initialized");
            }

            const initializeNewRestaurant = httpsCallable(
                functions,
                'initializeNewRestaurant'
            );
            console.log('[Bootstrap CALLABLE] Invoking initializeNewRestaurant', {
                action: 'callable-initialize-new-restaurant',
                email,
                restaurantName,
            });
            const result = await initializeNewRestaurant({
                restaurantName,
                ownerName,
                email,
                phone,
                password,
                // Default metadata for Stage 4
                version: systemConfig?.version || 'v5.3.0'
            });

            const data = result.data as any;
            if (!data.success) {
                throw new Error(data.message || 'Bootstrap initialization failed.');
            }

            console.log('[Bootstrap SUCCESS] Restaurant and Owner provisioned', {
                action: 'bootstrap-success',
                orgId: data.organizationId,
                userId: data.userId,
            });
            
            // Log first audit entry for the new organization
            logAction('ORGANIZATION_INITIALIZED', 'User', email, ActionOutcome.SUCCESS, `New restaurant "${restaurantName}" established.`);
            
            // Refreshing the window or forcing a session check is recommended here 
            // so AuthContext picks up the new Custom Claims (Stage 5)
            await refreshIdToken();
            console.log('[Bootstrap HYDRATION] Refreshing auth context after provisioning', {
                action: 'bootstrap-auth-refresh',
                orgId: data.organizationId,
                userId: data.userId,
            });
            await retryInit();
            setIsTerminating(false); 
            
        } catch (err: any) {
            console.error('[Bootstrap ERROR] Failed to initialize restaurant:', err);
            setIsTerminating(false);
            setSecurityError(`${err.message} (Code: ${err.code || 'unknown'})`);
            throw err;
        }
    }, [systemConfig, logAction]);

    if (!systemConfig) {
      if (initTimeout) {
         return (
           <div className="flex flex-col h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white p-6">
             <i className="fas fa-exclamation-triangle text-amber-500 text-5xl mb-4"></i>
             <h2 className="text-2xl font-bold mb-2">System Load Timeout</h2>
             <p className="text-slate-500 mb-6 max-w-md text-center">The application took too long to load configuration. This may be due to network issues.</p>
             <div className="flex gap-4">
                 <button onClick={() => setInitTimeout(false)} className="px-6 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold">Continue Waiting</button>
                 <button onClick={() => window.location.reload()} className="px-6 py-3 bg-brand-600 text-white rounded-xl font-bold">Reload System</button>
                 <button onClick={authLogout} className="px-6 py-3 bg-rose-600 text-white rounded-xl font-bold">Sign Out</button>
             </div>
           </div>
         );
      }
      return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
          <div className="text-center">
            <i className="fas fa-spinner fa-spin text-4xl text-brand-500 mb-4"></i>
            <h2 className="text-xl font-bold">Initializing System...</h2>
          </div>
        </div>
      );
    }

    if (!systemConfig.initialized) {
      return <InitializationBlocker isSystemAdmin={isSystemAdmin} />;
    }

  if (isTerminating) {
    return (
      <div className="fixed inset-0 z-[5000] bg-slate-950 flex flex-col items-center justify-center animate-in fade-in duration-500">
        <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-8 shadow-glow"></div>
        <h2 className="text-white font-black uppercase tracking-[0.4em] text-xs">Purging Protocol State</h2>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden font-sans ${theme === 'dark' ? 'dark bg-slate-950' : 'bg-slate-50'}`}>
      {user && (
        <Sidebar 
          user={user} activeView={activeView} onChangeView={setActiveView} 
          onLogout={() => setIsLogoutModalOpen(true)} onResetSession={() => setIsLogoutModalOpen(true)}
          isCollapsed={isSidebarCollapsed} onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobileOpen={isMobileSidebarOpen} onMobileClose={() => setIsMobileSidebarOpen(false)}
          roleDefinitions={roleDefinitions}
          badges={badges}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
      
      {/* Mobile Top Bar Node */}
      {user && (
        <div className="fixed top-0 left-0 right-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-white/5 z-40 md:hidden flex items-center justify-between px-6">
          <button 
            onClick={() => setIsMobileSidebarOpen(true)}
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
          >
            <i className="fas fa-bars"></i>
          </button>
          <div className="flex items-center gap-2">
            <i className="fas fa-bolt-lightning text-brand-600 text-sm"></i>
            <span className="font-black uppercase tracking-tighter text-xs dark:text-white">{RESTAURANT_NAME}</span>
          </div>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black uppercase ${user.role === 'guest' ? user.guestColor : 'bg-slate-800 text-brand-400'}`}>
             {user.role === 'guest' ? <i className={`fas ${user.guestAvatar}`}></i> : user.name.charAt(0)}
          </div>
        </div>
      )}

      {/* Network Status Overlay (Top Right) */}
      {user && (
        <div className="fixed top-8 right-8 z-[100] hidden md:flex items-center gap-3 bg-white/10 dark:bg-slate-900/50 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/5 dark:border-white/10 shadow-2xl animate-in slide-in-from-top-4 duration-700">
          <div className="flex gap-1 items-end h-3">
             <div className={`w-1 rounded-full transition-all duration-500 ${networkLatency < 30 ? 'bg-emerald-500 h-1.5' : 'bg-amber-500 h-1'}`}></div>
             <div className={`w-1 rounded-full transition-all duration-500 ${networkLatency < 40 ? 'bg-emerald-500 h-2.5' : 'bg-amber-500 h-1.5'}`}></div>
             <div className={`w-1 rounded-full transition-all duration-500 ${networkLatency < 50 ? 'bg-emerald-500 h-3.5' : 'bg-amber-500 h-2'}`}></div>
          </div>
          <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{networkLatency}ms Latency</span>
        </div>
      )}

      <main className={`flex-1 relative transition-all duration-500 ${user ? (isSidebarCollapsed ? 'md:ml-24' : 'md:ml-80') : ''} ${user ? 'pt-16 md:pt-0' : ''}`}>
         {isAuthLoading ? (
            <div className="flex bg-slate-950 h-screen items-center justify-center">
              <i className="fas fa-circle-notch fa-spin text-3xl text-brand-500"></i>
            </div>
         ) : authError ? (
           <div className="flex h-screen items-center justify-center text-center p-8">
             <div className="bg-rose-50 dark:bg-rose-950 p-8 rounded-3xl border border-rose-200 dark:border-rose-900 max-w-lg shadow-2xl">
               <i className="fas fa-shield-halved text-4xl text-rose-500 mb-4"></i>
               <h3 className="text-xl font-bold text-rose-700 dark:text-rose-400 mb-2">Authorization Failure</h3>
               <p className="text-slate-600 dark:text-slate-400 text-sm mx-auto mb-6">
                 {authError.message}
               </p>
               <div className="flex gap-4 justify-center">
                 <button onClick={retryInit} className="px-6 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95">Retry</button>
                 <button onClick={authLogout} className="px-6 py-3 bg-rose-600 text-white rounded-xl font-bold transition-all hover:bg-rose-700 border border-transparent active:scale-95">Sign Out</button>
               </div>
             </div>
           </div>
         ) : user === undefined ? (
           <div className="flex h-screen items-center justify-center text-center p-8">
             <div className="bg-rose-50 dark:bg-rose-950 p-8 rounded-3xl border border-rose-200 dark:border-rose-900">
               <i className="fas fa-ghost text-4xl text-rose-500 mb-4"></i>
               <h3 className="text-xl font-bold text-rose-700 dark:text-rose-400 mb-2">Session Error</h3>
               <p className="text-slate-600 dark:text-slate-400 text-sm max-w-sm mx-auto">
                 User state has become corrupted or undefined. Please restart the sequence.
               </p>
               <button onClick={() => window.location.reload()} className="mt-6 px-6 py-3 bg-rose-600 text-white rounded-xl font-bold">Restart</button>
             </div>
           </div>
         ) : !user ? (
           <LoginScreen 
             onRegisterRestaurant={handleRegisterRestaurant}
             onLoginError={(msg) => setSecurityError(msg)}
           />
         ) : (categoriesLoading || menuLoading || ordersLoading) ? (
            <div className="flex bg-slate-950 h-screen items-center justify-center">
              <div className="text-center">
                <i className="fas fa-circle-notch fa-spin text-3xl text-brand-500 mb-4"></i>
                <p className="text-slate-400 font-medium">Syncing data...</p>
              </div>
            </div>
          ) : (categoriesError || menuError || ordersError) ? (
            <div className="flex bg-slate-950 h-screen items-center justify-center text-center p-8">
              <div className="bg-rose-950 p-8 rounded-3xl border border-rose-900 max-w-lg shadow-2xl">
                <i className="fas fa-exclamation-triangle text-4xl text-rose-500 mb-4"></i>
                <h3 className="text-xl font-bold text-rose-400 mb-2">Sync Error</h3>
                <p className="text-slate-400 text-sm mx-auto mb-6">
                  {categoriesError || menuError || ordersError}
                </p>
                <button onClick={() => window.location.reload()} className="px-6 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold transition-all hover:bg-slate-700 active:scale-95">Retry Sync</button>
              </div>
            </div>
          ) : categories.length === 0 ? (
            <div className="flex bg-slate-950 h-screen items-center justify-center text-center p-8">
              <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 max-w-lg shadow-2xl">
                <i className="fas fa-box-open text-4xl text-slate-500 mb-4"></i>
                <h3 className="text-xl font-bold text-slate-300 mb-2">Empty Catalog</h3>
                <p className="text-slate-400 text-sm mx-auto mb-6">
                  Your organization's menu catalog is currently empty. Please access the Admin dashboard to construct your operational catalog.
                </p>
                <button onClick={() => setActiveView('ADMIN_DASHBOARD')} className="px-6 py-3 bg-brand-600 text-white rounded-xl font-bold transition-all hover:bg-brand-500 active:scale-95">Open Admin</button>
              </div>
            </div>
          ) : (
           <Suspense fallback={<div className="flex items-center justify-center h-full"><i className="fas fa-spinner fa-spin text-3xl text-brand-500"></i></div>}>
              {activeView === 'POS' && (
                <ProtectedRoute user={user} allowedRoles={POS_ACCESS} onUnauthorized={handleLogout}>
                  <POSView 
                    menu={menu} categories={categories} cart={cart} onItemClick={setPendingSelectionItem}
                    removeFromCart={(id: string) => setCart(prev => prev.filter(i => i.cartId !== id))}
                    updateCartQuantity={(id: string, q: number) => setCart(prev => prev.map(i => i.cartId === id ? { ...i, quantity: q } : i))}
                    updateCartNote={(id: string, n: string) => setCart(prev => prev.map(i => i.cartId === id ? { ...i, notes: n } : i))}
                    onAddVoiceItems={(items: any[]) => {
                      const newCartItems = items.map(item => {
                        const menuItem = menu.find(m => m.id === item.id);
                        if (!menuItem) return null;
                        return {
                          ...menuItem,
                          cartId: `cart_${Date.now()}_${Math.random()}`,
                          selectedOptions: [],
                          quantity: item.quantity || 1,
                          notes: item.notes || '',
                          price: menuItem.price
                        };
                      }).filter(Boolean) as CartItem[];
                      if (newCartItems.length > 0) {
                        setCart(prev => [...prev, ...newCartItems]);
                      }
                    }}
                    submitOrder={executeSubmitOrder} 
                    onClearCart={() => setIsClearCartModalOpen(false)}
                    onOpenAssistant={() => setIsAssistantOpen(true)} user={user}
                    onOpenHistory={() => setIsHistoryModalOpen(true)}
                    onOpenLogout={() => setIsLogoutModalOpen(true)}
                    selectedTable={tables.find(t => t.id === selectedTableId)}
                    onOpenTableMap={() => setIsTableModalOpen(true)}
                    pendingGuestOrders={activeOrders.filter(o => o.status === OrderStatus.AWAITING_APPROVAL)}
                    onApproveGuestOrder={handleApproveGuestOrder}
                    onRejectGuestOrder={handleRejectGuestOrder}
                    customerActiveOrders={guestActiveOrders}
                    submittedPayments={activeOrders.filter(o => o.paymentStatus === PaymentStatus.SUBMITTED)}
                    onCashierConfirmPayment={async (o: Order) => {
                        if (user?.organizationId) {
                            try {
                               await InventoryPostingEngine.completeOrderPaymentAndInventoryPosting(user.organizationId, o.id, user.uid || 'SYSTEM');
                               setLastConfirmedOrder({...o, status: OrderStatus.PAID, paymentStatus: PaymentStatus.PAID});
                               logAction('PAYMENT_CONFIRMED', 'Order', o.id, ActionOutcome.SUCCESS);
                            } catch (error: any) {
                               console.error("Payment and inventory posting failed:", error);
                               logAction('PAYMENT_CONFIRMED', 'Order', o.id, ActionOutcome.FAILURE);
                            }
                        }
                    }}
                    onGuestSubmitPayment={() => {}}
                    readyOrders={activeOrders.filter(o => o.status === OrderStatus.READY)}
                    onServeOrder={async (o: Order) => {
                        if (user?.organizationId) {
                           await firestore.orders.update(user.organizationId, o.id, { status: OrderStatus.SERVED }, user.uid || 'SYSTEM');
                           logAction('ORDER_SERVED', 'Order', o.id, ActionOutcome.SUCCESS);
                        }
                    }}
                    onOpenScanner={() => setIsScannerOpen(true)}
                    hasPermission={hasPermission}
                    securityError={securityError}
                    clearSecurityError={() => setSecurityError(null)}
                  />
                </ProtectedRoute>
              )}

              {activeView === 'KDS' && (
                <ProtectedRoute user={user} allowedRoles={KDS_ACCESS} onUnauthorized={handleLogout}>
                  <KDSView orders={activeOrders} updateOrderStatus={async (id, s) => {
                      if (user?.organizationId) {
                          await firestore.orders.update(user.organizationId, id, { status: s }, user.uid || 'SYSTEM');
                      }
                  }} userRole={user.role} hasPermission={hasPermission} />
                </ProtectedRoute>
              )}

              {activeView.startsWith('ADMIN') && (
                <ProtectedRoute user={user} allowedRoles={ADMIN_ACCESS} onUnauthorized={handleLogout}>
                  <AdminView 
                    activeSection={activeView} orders={activeOrders} menu={menu} categories={categories}
                    ingredients={ingredients} tables={tables} reviews={[]} auditLogs={auditLogs} 
                    reservations={[]} staffDirectory={staffList} roleDefinitions={roleDefinitions}
                    tasks={tasks} 
                    currentUserRole={user.role}
                    organizationId={user.organizationId || undefined}
                    userId={user.uid || undefined}
                    onCreateIngredient={handleCreateIngredient}
                    onUpdateIngredient={handleUpdateIngredient}
                    onDeleteIngredient={handleDeleteIngredient}
                    onAddTask={(t) => setTasks(prev => [...prev, { ...t, id: `task_${Date.now()}`, createdAt: Date.now(), updatedAt: Date.now(), createdByCode: user.staffCode || 'SYSTEM' }])}
                    onUpdateTask={(t) => setTasks(prev => prev.map(task => task.id === t.id ? { ...t, updatedAt: Date.now() } : task))}
                    onDeleteTask={(id) => setTasks(prev => prev.filter(t => t.id !== id))}
                    onUpdateRole={handleUpdateRole}
                    onDeleteRole={handleDeleteRole}
                    onUpdateTable={handleUpdateTable}
                    onAddMenuItems={handleAddMenuItems}
                    onToggleAvailability={handleToggleAvailability}
                    onToggleGuestVisibility={handleToggleGuestVisibility}
                    onUpdateStaffStatus={handleUpdateStaffStatus}
                    onRegisterStaff={async (name, email, role, password, phone) => {
                        if (!user?.organizationId) {
                            const errorMsg = 'Registration failed: Your current session is not associated with an organization.';
                            console.error('[onRegisterStaff ERROR] Precondition failed:', { user });
                            throw new Error(errorMsg);
                        }
                        
                        // Stage 3: Cloud Function RBAC - Client-side validation
                        const adminRoles: Role[] = ['system_admin', 'super_admin', 'owner'];
                        const isTargetingAdmin = adminRoles.includes(role);
                        const currentUserRole = user.role;

                        if (isTargetingAdmin && currentUserRole !== 'system_admin' && currentUserRole !== 'super_admin') {
                            const errorMsg = `Authorization Denied: Your role (${currentUserRole}) does not have permission to create administrative accounts (${role}).`;
                            console.error('[onRegisterStaff ERROR] Privilege Escalation Blocked:', { currentUserRole, targetRole: role });
                            throw new Error(errorMsg);
                        }

                        console.log('[onRegisterStaff START] Initiating staff registration flow', {
                            action: 'staff-registration-start',
                            name,
                            email,
                            role,
                            organizationId: user.organizationId,
                        });

                          try {
                              if (!functions) {
                                  throw new Error("Firebase Functions not initialized");
                              }

                              const createStaffUser = httpsCallable(
                                  functions,
                                  'createStaffUser'
                              );
                            console.log('[onRegisterStaff CALLABLE] Invoking createStaffUser', {
                                action: 'callable-create-staff-user',
                                organizationId: user.organizationId,
                                email,
                                role,
                            });
                           console.log('[onRegisterStaff PAYLOAD DEBUG]', {
                              name,
                              email,
                              role,
                              passwordProvided: !!password,
                              phone,
                              organizationId: user.organizationId
                          });
                            const result = await createStaffUser({
                                name,
                                email,
                                role,
                                password,
                                phone,
                                organizationId: user.organizationId
                            });

                            const data = result.data as any;
                            if (!data.success) {
                            // Remove internal masking: pass the specific error message and code from the function
                            const error = new Error(data.message || 'Internal Registration Protocol Error');
                            (error as any).code = data.code || 'functions/internal';
                            throw error;
                            }
                        console.log('[onRegisterStaff SUCCESS] Cloud Function completed provisioning and claims assignment', {
                            action: 'staff-registration-success',
                            organizationId: user.organizationId,
                            email,
                            role,
                        });
                        await refreshIdToken();
                        console.log('[onRegisterStaff HYDRATION] Refreshing auth context after provisioning', {
                            action: 'staff-registration-auth-refresh',
                            organizationId: user.organizationId,
                            email,
                            role,
                        });
                        await retryInit();
                        } catch (callError: any) {
                        // Improve diagnostics: Expose underlying Firebase/Firestore error codes
                        const errorCode = callError.code || callError.details?.code || 'unknown';
                        console.error('[onRegisterStaff ERROR] Cloud Function rejected!', {
                            organizationId: user.organizationId,
                            message: callError.message,
                            code: errorCode,
                            details: callError.details
                        });
                        
                        // Throw a descriptive error that include the system code for the UI to display
                        throw new Error(`${callError.message || 'Registration failed'} (Code: ${errorCode})`);
                        }

                        try {
                            console.log("[onRegisterStaff] Logging audit trail action STAFF_REGISTERED...");
                            logAction('STAFF_REGISTERED', 'User', email, ActionOutcome.SUCCESS, `Registered ${name} as ${role}.`);
                        } catch (logErr) {
                            console.warn('[onRegisterStaff WARNING] logAction rejected, ignoring audit warning:', logErr);
                        }

                        console.log('[onRegisterStaff COMPLETE] Member registration completed fully and successfully without any issues!', {
                            registeredName: name,
                            registeredEmail: email,
                            assignedRole: role
                        });
                    }}
                  />
                </ProtectedRoute>
              )}

              {activeView === 'PROFILE' && (
                <ProtectedRoute user={user} allowedRoles={POS_ACCESS} onUnauthorized={handleLogout}>
                  <ProfileView 
                    user={user} 
                    onLogout={handleLogout} 
                    onProfileUpdate={(updated) => setUser(updated)} 
                  />
                </ProtectedRoute>
              )}
              
              {activeView === 'CUSTOMER' && (
                <POSView 
                  menu={menu} categories={categories} cart={cart} onItemClick={setPendingSelectionItem}
                  removeFromCart={(id: string) => setCart(prev => prev.filter(i => i.cartId !== id))}
                  updateCartQuantity={(id: string, q: number) => setCart(prev => prev.map(i => i.cartId === id ? { ...i, quantity: q } : i))}
                  updateCartNote={(id: string, n: string) => setCart(prev => prev.map(i => i.cartId === id ? { ...i, notes: n } : i))}
                  onAddVoiceItems={(items: any[]) => {
                    const newCartItems = items.map(item => {
                      const menuItem = menu.find(m => m.id === item.id);
                      if (!menuItem) return null;
                      return {
                        ...menuItem,
                        cartId: `cart_${Date.now()}_${Math.random()}`,
                        selectedOptions: [],
                        quantity: item.quantity || 1,
                        notes: item.notes || '',
                        price: menuItem.price
                      };
                    }).filter(Boolean) as CartItem[];
                    if (newCartItems.length > 0) {
                      setCart(prev => [...prev, ...newCartItems]);
                    }
                  }}
                  submitOrder={executeSubmitOrder}
                  onClearCart={() => setIsClearCartModalOpen(true)}
                  onOpenAssistant={() => setIsAssistantOpen(true)} user={user}
                  onOpenHistory={() => setIsHistoryModalOpen(true)}
                  onOpenLogout={() => setIsLogoutModalOpen(true)}
                  customerActiveOrders={guestActiveOrders}
                  onGuestSubmitPayment={() => {}}
                  onOpenScanner={() => setIsScannerOpen(true)}
                  selectedTable={tables.find(t => t.id === selectedTableId)}
                  onOpenTableMap={() => setIsTableModalOpen(true)}
                  hasPermission={hasPermission}
                  securityError={securityError}
                  clearSecurityError={() => setSecurityError(null)}
                />
              )}
              {activeView === 'MAP_OVERLAY' && (
                <ProtectedRoute user={user} allowedRoles={ADMIN_ACCESS} onUnauthorized={handleLogout}>
                  <Suspense fallback={
                    <div className="flex justify-center items-center h-full bg-slate-50 border-2 overflow-hidden">
                       <i className="fas fa-spinner fa-spin text-3xl text-brand-500"></i>
                    </div>
                  }>
                    <MapOverlayView tables={tables} orders={activeOrders} onUpdateTable={handleUpdateTable} />
                  </Suspense>
                </ProtectedRoute>
              )}
           </Suspense>
         )}
      </main>

      {/* Assistant Floating Trigger (Desktop Only or Guest) */}
      {user && activeView !== 'KDS' && (
        <button 
          onClick={() => setIsAssistantOpen(true)}
          className="fixed bottom-24 right-6 md:right-10 z-[120] w-14 h-14 md:w-16 md:h-16 bg-slate-950 dark:bg-brand-600 text-white rounded-2xl shadow-glow flex items-center justify-center transition-all hover:scale-110 active:scale-90 animate-float"
        >
          <i className="fas fa-wand-magic-sparkles text-xl"></i>
        </button>
      )}

      <Suspense fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-xl flex items-center gap-4">
             <i className="fas fa-spinner fa-spin text-2xl text-brand-500"></i>
             <span className="font-bold">Loading component...</span>
          </div>
        </div>
      }>
        {user && (
            <>
                <AssistantModal isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} menuContext={menu} cartContext={cart} role={user.role} auditContext={auditLogs} />
                <OptionSelectionModal 
                    isOpen={!!pendingSelectionItem} onClose={() => setPendingSelectionItem(null)} 
                    item={pendingSelectionItem} onConfirm={(item, opts, qty, note) => {
                      setCart(prev => [...prev, {...item, cartId: `cart_${Date.now()}`, selectedOptions: opts, quantity: qty, notes: note, price: item.price + opts.reduce((a, o) => a + o.priceModifier, 0)}]);
                      setPendingSelectionItem(null);
                    }} 
                />
                <TableSelectionModal isOpen={isTableModalOpen} onClose={() => setIsTableModalOpen(false)} tables={tables} selectedTableId={selectedTableId} onSelectTable={(id) => { setSelectedTableId(id); setIsTableModalOpen(false); }} />
                <ClearCartConfirmationModal isOpen={isClearCartModalOpen} onClose={() => setIsClearCartModalOpen(false)} onConfirm={() => { setCart([]); setIsClearCartModalOpen(false); }} itemCount={cart.length} totalAmount={cart.reduce((acc, i) => acc + (i.price * i.quantity), 0)} />
                <ReceiptModal isOpen={!!lastConfirmedOrder} onClose={() => setLastConfirmedOrder(null)} order={lastConfirmedOrder} />
                <LogoutConfirmationModal 
                    isOpen={isLogoutModalOpen} 
                    onClose={() => setIsLogoutModalOpen(false)} 
                    onConfirm={user.role === 'guest' ? handleResetSession : handleLogout} 
                    userRole={user.role}
                    hasActiveOrders={guestActiveOrders.length > 0}
                />
                <CustomerHistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} orders={historyOrders} />
                <QRScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={handleQRScan} />
            </>
        )}
      </Suspense>

      {/* Toast Notification Alert Banner */}
      {qrNotification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[800] max-w-sm w-full px-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`p-4 rounded-2xl shadow-2xl border flex items-center gap-3 ${
            qrNotification.type === 'success' 
              ? 'bg-emerald-500 text-white border-emerald-400' 
              : qrNotification.type === 'error' 
              ? 'bg-rose-500 text-white border-rose-450' 
              : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-700'
          }`}>
            <i className={`fas ${
              qrNotification.type === 'success' 
                ? 'fa-circle-check' 
                : qrNotification.type === 'error' 
                ? 'fa-triangle-exclamation' 
                : 'fa-circle-info'
            } text-lg`}></i>
            <span className="text-[11px] font-black uppercase tracking-wider">{qrNotification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
