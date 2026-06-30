import { MenuCategory, MenuItem, Order, OrderStatus, Role, Ingredient, PaymentStatus, Table, TableStatus, MenuItemStatus } from './types';

export const APP_NAME = "IRSW";
export const RESTAURANT_NAME = "Lumina Dining";

export const INITIAL_CATEGORIES: MenuCategory[] = [
  { id: 'cat_1', name: 'Starters', icon: 'fa-utensils' },
  { id: 'cat_2', name: 'Mains', icon: 'fa-burger' },
  { id: 'cat_3', name: 'Drinks', icon: 'fa-glass-water' },
  { id: 'cat_4', name: 'Desserts', icon: 'fa-ice-cream' },
];

export const INITIAL_MENU: MenuItem[] = [
  {
    id: 'item_1',
    categoryId: 'cat_1',
    name: 'Crispy Calamari',
    description: 'Golden fried squid rings served with tartare sauce.',
    price: 12.50,
    image: '/src/assets/images/crispy_calamari_1780667595936.png',
    status: MenuItemStatus.AVAILABLE,
    available: true,
    visible_to_guest: true,
  },
  {
    id: 'item_2',
    categoryId: 'cat_2',
    name: 'Classic Cheeseburger',
    description: 'Angus beef patty, cheddar, lettuce, tomato, house sauce.',
    price: 16.00,
    image: '/src/assets/images/classic_cheeseburger_1780667610885.png',
    status: MenuItemStatus.AVAILABLE,
    available: true,
    visible_to_guest: true,
    options: [
      { name: 'Extra Cheese', priceModifier: 1.5 },
      { name: 'Bacon', priceModifier: 2.0 },
      { name: 'Gluten Free Bun', priceModifier: 1.0 }
    ]
  },
  {
    id: 'item_3',
    categoryId: 'cat_2',
    name: 'Truffle Mushroom Risotto',
    description: 'Arborio rice, wild mushrooms, parmesan, truffle oil.',
    price: 22.00,
    image: '/src/assets/images/truffle_risotto_1780667627984.png',
    status: MenuItemStatus.UNAVAILABLE,
    available: false,
    visible_to_guest: true,
  },
  {
    id: 'item_4',
    categoryId: 'cat_3',
    name: 'Craft Cola',
    description: 'Artisanal cola with botanical extracts.',
    price: 4.50,
    image: '/src/assets/images/craft_cola_1780667642824.png',
    status: MenuItemStatus.AVAILABLE,
    available: true,
    visible_to_guest: true,
  },
  {
    id: 'item_5',
    categoryId: 'cat_4',
    name: 'New York Cheesecake',
    description: 'Rich and creamy with a berry compote.',
    price: 9.00,
    image: '/src/assets/images/ny_cheesecake_1780667657677.png',
    status: MenuItemStatus.AVAILABLE,
    available: true,
    visible_to_guest: true,
  },
  {
    id: 'item_6',
    categoryId: 'cat_2',
    name: 'Grilled Salmon',
    description: 'Fresh Atlantic salmon fillet served with roasted vegetables and lemon butter sauce.',
    price: 24.50,
    image: '/src/assets/images/grilled_salmon_1780667670153.png',
    status: MenuItemStatus.AVAILABLE,
    available: true,
    visible_to_guest: true,
  }
];

export const INITIAL_TABLES: Table[] = [
  { id: 't1', number: '01', x: 15, y: 15, capacity: 2, status: TableStatus.AVAILABLE, shape: 'CIRCLE' },
  { id: 't2', number: '02', x: 35, y: 15, capacity: 4, status: TableStatus.OCCUPIED, shape: 'SQUARE' },
  { id: 't3', number: '03', x: 60, y: 15, capacity: 4, status: TableStatus.OCCUPIED, shape: 'SQUARE' },
  { id: 't4', number: '04', x: 80, y: 15, capacity: 2, status: TableStatus.AVAILABLE, shape: 'CIRCLE' },
  { id: 't5', number: '05', x: 15, y: 45, capacity: 6, status: TableStatus.RESERVED, shape: 'RECTANGLE' },
  { id: 't6', number: '06', x: 50, y: 45, capacity: 4, status: TableStatus.AVAILABLE, shape: 'SQUARE' },
  { id: 't7', number: '07', x: 80, y: 45, capacity: 4, status: TableStatus.PENDING_CLEANING, shape: 'SQUARE' },
  { id: 't8', number: '08', x: 15, y: 75, capacity: 2, status: TableStatus.PENDING_CLEANING, shape: 'CIRCLE' },
  { id: 't9', number: '09', x: 35, y: 75, capacity: 4, status: TableStatus.AVAILABLE, shape: 'SQUARE' },
  { id: 't10', number: '10', x: 60, y: 75, capacity: 4, status: TableStatus.AVAILABLE, shape: 'SQUARE' },
  { id: 't11', number: '11', x: 80, y: 75, capacity: 2, status: TableStatus.AVAILABLE, shape: 'CIRCLE' },
];

export const INITIAL_INGREDIENTS: Ingredient[] = [
  { id: 'ing_1', name: 'Burger Buns', stock: 45, unit: 'pcs' },
  { id: 'ing_2', name: 'Beef Patties', stock: 20, unit: 'pcs' },
  { id: 'ing_3', name: 'Cheddar Cheese', stock: 8, unit: 'slices' },
  { id: 'ing_4', name: 'Milk', stock: 12, unit: 'liters' },
  { id: 'ing_5', name: 'Coffee Beans', stock: 2, unit: 'kg' },
  { id: 'ing_6', name: 'Lettuce', stock: 4, unit: 'heads' },
  { id: 'ing_7', name: 'Tomatoes', stock: 15, unit: 'kg' },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord_123',
    customerName: 'Guest',
    tableId: '04',
    status: OrderStatus.PREPARING,
    paymentStatus: PaymentStatus.PENDING,
    total: 16.00,
    timestamp: Date.now() - 1000 * 60 * 5, // 5 mins ago
    createdBy: 'service',
    items: [
      {
        ...INITIAL_MENU[1],
        cartId: 'mock_cart_1',
        quantity: 1,
        selectedOptions: []
      }
    ] 
  },
  {
    id: 'ord_124',
    customerName: 'Guest',
    tableId: '02',
    status: OrderStatus.READY,
    paymentStatus: PaymentStatus.PENDING,
    total: 31.00,
    timestamp: Date.now() - 1000 * 60 * 15, // 15 mins ago
    createdBy: 'service',
    items: [
        {
          ...INITIAL_MENU[2],
          cartId: 'mock_cart_2',
          quantity: 1,
          selectedOptions: []
        },
        {
          ...INITIAL_MENU[4],
          cartId: 'mock_cart_3',
          quantity: 1,
          selectedOptions: []
        }
    ]
  },
  {
    id: 'ord_125',
    customerName: 'Guest',
    tableId: '01',
    status: OrderStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    total: 45.50,
    timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
    createdBy: 'guest',
    items: [
      {
        ...INITIAL_MENU[5],
        cartId: 'mock_cart_4',
        quantity: 1,
        selectedOptions: []
      },
      {
        ...INITIAL_MENU[0],
        cartId: 'mock_cart_5',
        quantity: 2,
        selectedOptions: []
      }
    ]
  }
];