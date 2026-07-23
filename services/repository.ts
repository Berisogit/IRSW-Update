import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  limit,
  startAfter,
  QueryConstraint,
  serverTimestamp,
  DocumentData,
  Firestore,
  onSnapshot,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { BaseDocument, STANDARD_UNITS, UnitOfMeasure } from '../types/firestoreSchema';

export interface QueryOptions {
  where?: Array<{
    field: string;
    operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any';
    value: any;
  }>;
  orderBy?: Array<{
    field: string;
    direction?: 'asc' | 'desc';
  }>;
  limit?: number;
  startAfter?: any;
}

/**
 * Validated Firestore paths for multi-tenancy
 */
export const FirestoreCollections = {
  ORGANIZATIONS: 'organizations',
  USERS: 'users',
  MEMBERSHIPS: 'memberships',
  // Sub-collections under organizations/orgId/
  STAFF: 'staff',
  MENU_ITEMS: 'menuItems',
  CATEGORIES: 'categories',
  INVENTORY: 'inventory',
  TABLES: 'tables',
  RESERVATIONS: 'reservations',
  CUSTOMERS: 'customers',
  ORDERS: 'orders',
  PAYMENTS: 'payments',
  AUDIT_LOGS: 'auditLogs',
  SUBSCRIPTIONS: 'subscriptions',
  RECIPES: 'recipes',
  RECIPE_MAPPINGS: 'recipeMappings',
  INVENTORY_POSTINGS: 'inventoryPostings',
  PURCHASE_ORDERS: 'purchaseOrders',
  INVENTORY_RECEIPTS: 'inventoryReceipts',
  SUPPLIERS: 'suppliers',
  SUPPLIER_PERFORMANCE: 'supplierPerformance',
  PO_APPROVALS: 'purchaseOrderApprovals',
  SUPPLIER_INVOICES: 'supplierInvoices',
  INVOICE_MATCH_RESULTS: 'invoiceMatchResults',
  SUPPLIER_PAYMENTS: 'supplierPayments',
} as const;

import { auth } from '../lib/firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class RootRepository<T extends { id: string }> {
  protected collectionPath: string;
  protected db: Firestore;

  constructor(dbInstance: Firestore, collectionPath: string) {
    this.db = dbInstance;
    this.collectionPath = collectionPath;
  }

 async getById(id: string): Promise<T | null> {

    const docRef = doc(this.db, this.collectionPath, id);

    console.log("========== RootRepository.getById ==========");
    console.log("Collection:", this.collectionPath);
    console.log("Requested ID:", id);
    console.log("Firestore path:", docRef.path);
    console.log("Firebase Project:", this.db.app.options.projectId);

    try {
        const docSnap = await getDoc(docRef);

        console.log("========== Firestore Response ==========");
        console.log("Document exists:", docSnap.exists());

        if (!docSnap.exists()) {
            console.log("Document NOT FOUND");
            console.log("Requested path:", docRef.path);
            return null;
        }

        console.log("Document FOUND");
        console.log("Data:", docSnap.data());

        return {
            id: docSnap.id,
            ...docSnap.data(),
        } as T;

    } catch (error) {

        console.error("========== Firestore Exception ==========");
        console.error(error);

        handleFirestoreError(
            error,
            OperationType.GET,
            `${this.collectionPath}/${id}`
        );
    }

} 
  async find(constraints: QueryConstraint[] = []): Promise<T[]> {
    try {
      const q = query(collection(this.db, this.collectionPath), ...constraints);
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T)).filter(doc => !(doc as any).isDeleted);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.collectionPath);
    }
  }

  async executeQuery(options: QueryOptions): Promise<T[]> {
    try {
      const constraints: QueryConstraint[] = [];
      
      if (options.where) {
        options.where.forEach(w => {
          constraints.push(where(w.field, w.operator, w.value));
        });
      }
      
      if (options.orderBy) {
        options.orderBy.forEach(o => {
          constraints.push(orderBy(o.field, o.direction));
        });
      }
      
      if (options.limit !== undefined) {
        constraints.push(limit(options.limit));
      }
      
      if (options.startAfter !== undefined) {
        constraints.push(startAfter(options.startAfter));
      }

      const q = query(collection(this.db, this.collectionPath), ...constraints);
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T)).filter(doc => !(doc as any).isDeleted);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.collectionPath);
    }
  }

  async set(id: string, data: Partial<T>, userId: string = 'system'): Promise<void> {
    try {
      const docRef = doc(this.db, this.collectionPath, id);
      const timestamp = Date.now();
      const payload = {
        ...data,
        updatedAt: timestamp,
        updatedBy: userId
      } as any;
      
      if (!(payload as any).createdAt) {
        payload.createdAt = timestamp;
      }
      if (!(payload as any).createdBy) {
        payload.createdBy = userId;
      }

      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${this.collectionPath}/${id}`);
    }
  }

  async update(id: string, data: Partial<T>, userId: string): Promise<void> {
    try {
      const docRef = doc(this.db, this.collectionPath, id);
      await updateDoc(docRef, { ...data, updatedAt: Date.now(), updatedBy: userId } as any);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${this.collectionPath}/${id}`);
    }
  }

  async delete(id: string, userId: string): Promise<void> {
    try {
      const docRef = doc(this.db, this.collectionPath, id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${this.collectionPath}/${id}`);
    }
  }
}

export class BaseRepository<T extends BaseDocument> {
  protected collectionName: string;
  protected db: Firestore;

  constructor(dbInstance: Firestore, collectionName: string) {
    this.db = dbInstance;
    this.collectionName = collectionName;
  }

  protected getCollectionPath(organizationId: string): string {
    return `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${this.collectionName}`;
  }

  async getById(organizationId: string, id: string): Promise<T | null> {
    try {
      const docRef = doc(this.db, this.getCollectionPath(organizationId), id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as T;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${this.getCollectionPath(organizationId)}/${id}`);
    }
  }

  async executeQuery(
    organizationId: string,
    options: QueryOptions
  ): Promise<T[]> {
    try {
      const constraints: QueryConstraint[] = [];
      
      if (options.where) {
        options.where.forEach(w => {
          constraints.push(where(w.field, w.operator, w.value));
        });
      }
      
      if (options.orderBy) {
        options.orderBy.forEach(o => {
          constraints.push(orderBy(o.field, o.direction));
        });
      }
      
      if (options.limit !== undefined) {
        constraints.push(limit(options.limit));
      }
      
      if (options.startAfter !== undefined) {
        constraints.push(startAfter(options.startAfter));
      }

      const q = query(collection(this.db, this.getCollectionPath(organizationId)), ...constraints);
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T)).filter(doc => !doc.isDeleted);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.getCollectionPath(organizationId));
    }
  }

  async create(organizationId: string, data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy'>, userId: string): Promise<T> {
    const colRef = collection(this.db, this.getCollectionPath(organizationId));
    const docRef = doc(colRef);
    const timestamp = Date.now();
    
    const payload = {
      ...data,
      organizationId,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      await setDoc(docRef, payload);
      return { id: docRef.id, ...payload } as unknown as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `${this.getCollectionPath(organizationId)}/${docRef.id}`);
    }
  }

  async update(organizationId: string, id: string, data: Partial<Omit<T, 'id' | 'organizationId' | 'createdAt' | 'createdBy'>>, userId: string): Promise<void> {
    const docRef = doc(this.db, this.getCollectionPath(organizationId), id);
    
    const payload = {
      ...data,
      updatedBy: userId,
      updatedAt: Date.now(),
    };

    try {
      await updateDoc(docRef, payload as DocumentData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${this.getCollectionPath(organizationId)}/${id}`);
    }
  }

  async softDelete(organizationId: string, id: string, userId: string): Promise<void> {
    await this.update(organizationId, id, { 
      isDeleted: true,
      deletedAt: Date.now(),
      deletedBy: userId
    } as any, userId);
  }

  async hardDelete(organizationId: string, id: string): Promise<void> {
    try {
      const docRef = doc(this.db, this.getCollectionPath(organizationId), id);
      await deleteDoc(docRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${this.getCollectionPath(organizationId)}/${id}`);
    }
  }

  async set(organizationId: string, id: string, data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy'>, userId: string): Promise<T> {
    const docRef = doc(this.db, this.getCollectionPath(organizationId), id);
    const timestamp = Date.now();
    
    const payload = {
      ...data,
      organizationId,
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    try {
      await setDoc(docRef, payload);
      return { id, ...payload } as unknown as T;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${this.getCollectionPath(organizationId)}/${id}`);
    }
  }

  async batchSet(
    organizationId: string,
    items: Array<{ id: string } & Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy'>>,
    userId: string
  ): Promise<T[]> {
    const batch = writeBatch(this.db);
    const timestamp = Date.now();
    const results: T[] = [];

    for (const item of items) {
      const { id, ...data } = item;
      const docRef = doc(this.db, this.getCollectionPath(organizationId), id);
      const payload = {
        ...data,
        organizationId,
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      batch.set(docRef, payload);
      results.push({ id, ...payload } as unknown as T);
    }

    try {
      await batch.commit();
      return results;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, this.getCollectionPath(organizationId));
    }
  }

  subscribe(
    organizationId: string, 
    callback: (data: T[]) => void, 
    errorCallback?: (error: any) => void
  ): () => void {
    const q = query(collection(this.db, this.getCollectionPath(organizationId)));
    const path = this.getCollectionPath(organizationId);
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T)).filter(doc => !doc.isDeleted);
      callback(data);
    }, (error) => {
      if (errorCallback) {
        errorCallback(error);
      } else {
        try {
          handleFirestoreError(error, OperationType.GET, path);
        } catch (e) {
          console.error("onSnapshot error:", e);
        }
      }
    });
  }

  subscribeQuery(
    organizationId: string,
    options: QueryOptions,
    callback: (data: T[]) => void,
    errorCallback?: (error: any) => void
  ): () => void {
    const constraints: QueryConstraint[] = [];
    
    if (options.where) {
      options.where.forEach(w => {
        constraints.push(where(w.field, w.operator, w.value));
      });
    }
    
    if (options.orderBy) {
      options.orderBy.forEach(o => {
        constraints.push(orderBy(o.field, o.direction));
      });
    }
    
    if (options.limit !== undefined) {
      constraints.push(limit(options.limit));
    }
    
    if (options.startAfter !== undefined) {
      constraints.push(startAfter(options.startAfter));
    }

    const q = query(collection(this.db, this.getCollectionPath(organizationId)), ...constraints);
    const path = this.getCollectionPath(organizationId);
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T)).filter(doc => !doc.isDeleted);
      callback(data);
    }, (error) => {
      if (errorCallback) {
        errorCallback(error);
      } else {
        try {
          handleFirestoreError(error, OperationType.GET, path);
        } catch (e) {
          console.error("onSnapshot query error:", e);
        }
      }
    });
  }
}

export class UserSubcollectionRepository<T extends { id: string }> {
  protected collectionName: string;
  protected db: Firestore;

  constructor(dbInstance: Firestore, collectionName: string) {
    this.db = dbInstance;
    this.collectionName = collectionName;
  }

  protected getCollectionPath(userId: string): string {
    return `${FirestoreCollections.USERS}/${userId}/${this.collectionName}`;
  }

  async getById(userId: string, id: string): Promise<T | null> {
    try {
      const docRef = doc(this.db, this.getCollectionPath(userId), id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as T;
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${this.getCollectionPath(userId)}/${id}`);
    }
  }

  async find(userId: string): Promise<T[]> {
    try {
      const q = query(collection(this.db, this.getCollectionPath(userId)));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, this.getCollectionPath(userId));
    }
  }

  async set(userId: string, id: string, data: Partial<T>, performedBy: string = 'system'): Promise<void> {
    const docRef = doc(this.db, this.getCollectionPath(userId), id);
    const timestamp = Date.now();
    const payload = {
      ...data,
      updatedAt: timestamp,
      updatedBy: performedBy
    } as any;
    
    if (!(payload as any).createdAt) {
      payload.createdAt = timestamp;
    }
    if (!(payload as any).createdBy) {
      payload.createdBy = performedBy;
    }

    try {
      await setDoc(docRef, payload, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${this.getCollectionPath(userId)}/${id}`);
    }
  }
}

export class InventoryRepository extends BaseRepository<import('../types/firestoreSchema').InventoryItemDoc> {
  async validateInventoryItem(data: Partial<import('../types/firestoreSchema').InventoryItemDoc>): Promise<string[]> {
    const errors: string[] = [];
    if (data.unitOfMeasure) {
      const validUnits: readonly string[] = STANDARD_UNITS;
      if (!validUnits.includes(data.unitOfMeasure)) {
        errors.push(`Unsupported unit of measure: ${data.unitOfMeasure}. Supported units: ${validUnits.join(', ')}.`);
      }
    }
    return errors;
  }

  async create(organizationId: string, data: Omit<import('../types/firestoreSchema').InventoryItemDoc, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy'>, userId: string): Promise<import('../types/firestoreSchema').InventoryItemDoc> {
    if (!data.unitOfMeasure) {
      throw new Error(`Inventory validation failed:\nUnit of measure is required.`);
    }
    const errors = await this.validateInventoryItem(data);
    if (errors.length > 0) {
      throw new Error(`Inventory validation failed:\n${errors.join('\n')}`);
    }
    return super.create(organizationId, data, userId);
  }

  async update(organizationId: string, id: string, data: Partial<Omit<import('../types/firestoreSchema').InventoryItemDoc, 'id' | 'organizationId' | 'createdAt' | 'createdBy'>>, userId: string): Promise<void> {
    const errors = await this.validateInventoryItem(data);
    if (errors.length > 0) {
      throw new Error(`Inventory validation failed:\n${errors.join('\n')}`);
    }
    return super.update(organizationId, id, data, userId);
  }

  async set(organizationId: string, id: string, data: Omit<import('../types/firestoreSchema').InventoryItemDoc, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy'>, userId: string): Promise<import('../types/firestoreSchema').InventoryItemDoc> {
    if (!data.unitOfMeasure) {
      throw new Error(`Inventory validation failed:\nUnit of measure is required.`);
    }
    const errors = await this.validateInventoryItem(data);
    if (errors.length > 0) {
      throw new Error(`Inventory validation failed:\n${errors.join('\n')}`);
    }
    return super.set(organizationId, id, data, userId);
  }

  async adjustStock(
    organizationId: string, 
    itemId: string, 
    amount: number, // positive for increase, negative for decrease
    adjustmentReason: string,
    userId: string
  ): Promise<number> {
    const docRef = doc(this.db, this.getCollectionPath(organizationId), itemId);
    
    return await runTransaction(this.db, async (transaction) => {
      const docSnap = await transaction.get(docRef);
      if (!docSnap.exists()) {
        throw new Error('Inventory item not found');
      }
      
      const data = docSnap.data();
      const previousStock = data.currentStock || 0;
      const newStock = previousStock + amount;

      if (newStock < 0) {
        throw new Error(`Insufficient stock for ${data.name}. Current stock: ${previousStock}, Requested deduction: ${Math.abs(amount)}`);
      }

      transaction.update(docRef, {
        currentStock: newStock,
        updatedAt: Date.now(),
        updatedBy: userId,
      });

      // Record audit inside the same transaction
      const auditRef = doc(collection(this.db, `${this.getCollectionPath(organizationId)}/${itemId}/stockAdjustments`));
      transaction.set(auditRef, {
        previousStock,
        newStock,
        adjustmentAmount: amount,
        adjustmentReason,
        adjustedBy: userId,
        adjustedAt: Date.now()
      });

      return newStock;
    });
  }

  async increaseStock(organizationId: string, itemId: string, amount: number, reason: string, userId: string): Promise<number> {
    if (amount <= 0) throw new Error("Amount to increase must be greater than zero");
    return this.adjustStock(organizationId, itemId, amount, reason, userId);
  }

  async decreaseStock(organizationId: string, itemId: string, amount: number, reason: string, userId: string): Promise<number> {
    if (amount <= 0) throw new Error("Amount to decrease must be greater than zero");
    return this.adjustStock(organizationId, itemId, -amount, reason, userId);
  }
}

export class RecipeRepository extends BaseRepository<import('../types/firestoreSchema').RecipeDoc> {
  
  async validateRecipe(organizationId: string, recipe: Partial<import('../types/firestoreSchema').RecipeDoc>): Promise<string[]> {
    const errors: string[] = [];
    
    if (!recipe.menuItemId) {
      errors.push('Menu Item reference is missing.');
    } else {
      const menuRef = doc(this.db, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.MENU_ITEMS}`, recipe.menuItemId);
      const menuSnap = await getDoc(menuRef);
      if (!menuSnap.exists() || menuSnap.data()?.isDeleted) {
        errors.push('Menu Item does not exist or has been deleted.');
      }
    }

    if (!recipe.ingredients || recipe.ingredients.length === 0) {
      errors.push('Recipe must contain at least one ingredient.');
    } else {
      const validUnits: readonly string[] = STANDARD_UNITS;
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.inventoryItemId) {
          errors.push('Ingredient reference is missing.');
        } else {
          const invRef = doc(this.db, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY}`, ingredient.inventoryItemId);
          const invSnap = await getDoc(invRef);
          if (!invSnap.exists() || invSnap.data()?.isDeleted) {
             errors.push(`Inventory item ${ingredient.inventoryItemId} does not exist or has been deleted.`);
          } else if (invSnap.data()?.status !== 'ACTIVE') {
             errors.push(`Inventory item ${ingredient.inventoryItemId} is not active.`);
          }
        }
        if (ingredient.quantity <= 0) {
          errors.push(`Ingredient quantity must be greater than zero for ${ingredient.inventoryItemId}.`);
        }
        if (!validUnits.includes(ingredient.unitOfMeasure)) {
          errors.push(`Unsupported unit of measure: ${ingredient.unitOfMeasure}. Supported units: ${validUnits.join(', ')}.`);
        }
      }
    }
    
    return errors;
  }

  async createRecipe(
    organizationId: string, 
    data: Omit<import('../types/firestoreSchema').RecipeDoc, 'id' | 'createdAt' | 'updatedAt' | 'organizationId' | 'createdBy' | 'version' | 'previousVersionId'>, 
    userId: string
  ): Promise<import('../types/firestoreSchema').RecipeDoc> {
    const errors = await this.validateRecipe(organizationId, data);
    if (errors.length > 0) {
      throw new Error(`Recipe validation failed:\n${errors.join('\n')}`);
    }

    const payload = {
      ...data,
      version: 1,
    } as any; // Cast as any because the base create will omit standard fields, but version was omitted in the parameter
    
    return super.create(organizationId, payload, userId);
  }

  async updateRecipe(
    organizationId: string, 
    id: string, 
    data: Partial<import('../types/firestoreSchema').RecipeDoc>, 
    userId: string
  ): Promise<string> {
    const currentDoc = await this.getById(organizationId, id);
    if (!currentDoc) throw new Error("Recipe not found");
    if (currentDoc.isDeleted) throw new Error("Cannot update a deleted recipe");
    if (!currentDoc.isActive) throw new Error("Cannot update an inactive/archived recipe");

    const newPayload = {
      ...currentDoc,
      ...data,
    };
    
    const errors = await this.validateRecipe(organizationId, newPayload);
    if (errors.length > 0) {
      throw new Error(`Recipe validation failed:\n${errors.join('\n')}`);
    }

    // Soft delete and archive old version
    await this.update(organizationId, id, { isActive: false, isDeleted: true, deletedAt: Date.now(), deletedBy: userId }, userId);

    const nextVersion = (currentDoc.version || 1) + 1;
    const { id: oldId, createdAt, createdBy, updatedAt, updatedBy, previousVersionId, isDeleted, deletedAt, deletedBy, ...cleanPayload } = newPayload as any;

    const createPayload = {
      ...cleanPayload,
      version: nextVersion,
      previousVersionId: currentDoc.id
    };

    const newRecipe = await super.create(organizationId, createPayload as any, userId);
    return newRecipe.id;
  }

  async archiveRecipe(organizationId: string, id: string, userId: string): Promise<void> {
    await this.update(organizationId, id, { isActive: false }, userId);
    await this.softDelete(organizationId, id, userId);
  }

  async calculateRecipeConsumption(organizationId: string, recipeId: string, quantityOrdered: number): Promise<{inventoryItemId: string, requiredQuantity: number}[]> {
    const recipe = await this.getById(organizationId, recipeId);
    if (!recipe) throw new Error("Recipe not found");
    if (recipe.isDeleted) throw new Error("Recipe is deleted");
    if (!recipe.isActive) throw new Error("Recipe is archived/inactive");

    const multiplier = quantityOrdered / (recipe.yield || 1);
    
    return recipe.ingredients.map(ing => ({
      inventoryItemId: ing.inventoryItemId,
      requiredQuantity: ing.quantity * multiplier
    }));
  }

  async getLatestRecipeVersion(organizationId: string, menuItemId: string): Promise<import('../types/firestoreSchema').RecipeDoc | null> {
    const mappingsRef = collection(this.db, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.RECIPE_MAPPINGS}`);
    const q = query(mappingsRef, where('menuItemId', '==', menuItemId), where('isActive', '==', true), limit(1));
    const mappingSnap = await getDocs(q);
    
    if (mappingSnap.empty) return null;
    
    const mapping = mappingSnap.docs[0].data() as import('../types/firestoreSchema').MenuItemRecipeMappingDoc;
    const recipe = await this.getById(organizationId, mapping.recipeId);
    
    if (!recipe || recipe.isDeleted || !recipe.isActive) {
      return null;
    }
    
    return recipe;
  }

  async buildRecipeSnapshot(organizationId: string, recipeId: string): Promise<import('../types/firestoreSchema').RecipeResourceSnapshot> {
    const recipe = await this.getById(organizationId, recipeId);
    if (!recipe) {
      throw new Error(`Recipe ${recipeId} not found`);
    }

    const inventoryRef = collection(this.db, `${FirestoreCollections.ORGANIZATIONS}/${organizationId}/${FirestoreCollections.INVENTORY}`);
    const ingredients: import('../types/firestoreSchema').ResourceSnapshotIngredient[] = [];

    for (const ingredient of recipe.ingredients) {
      const invDocRef = doc(inventoryRef, ingredient.inventoryItemId);
      const invSnap = await getDoc(invDocRef);
      
      let estimatedUnitCost: number | undefined;
      let estimatedTotalCost: number | undefined;
      let inventoryItemName = 'Unknown Ingredient';

      if (invSnap.exists() && !invSnap.data().isDeleted) {
        const invData = invSnap.data() as import('../types/firestoreSchema').InventoryItemDoc;
        inventoryItemName = invData.name;
        if (typeof invData.costPerUnit === 'number') {
          estimatedUnitCost = invData.costPerUnit;
          estimatedTotalCost = invData.costPerUnit * ingredient.quantity;
        }
      }

      const ingredientSnapshot = {
        inventoryItemId: ingredient.inventoryItemId,
        inventoryItemName,
        quantity: ingredient.quantity,
        unitOfMeasure: ingredient.unitOfMeasure,
        estimatedUnitCost,
        estimatedTotalCost
      };

      ingredients.push(Object.freeze(ingredientSnapshot));
    }

    const snapshot: import('../types/firestoreSchema').RecipeResourceSnapshot = {
      recipeId: recipe.id,
      recipeVersion: recipe.version,
      recipeName: recipe.name,
      capturedAt: Date.now(),
      ingredients: Object.freeze(ingredients) as any,
    };

    return Object.freeze(snapshot);
  }
}

export class OrderRepository extends BaseRepository<import('../types/firestoreSchema').OrderDoc> {
  /**
   * Identifies orders that are marked as PAID (settled) but whose inventory posting is not POSTED
   */
  async getStrandedPaidOrders(organizationId: string): Promise<import('../types/firestoreSchema').OrderDoc[]> {
    const allOrders = await this.executeQuery(organizationId, {});
    return allOrders.filter(order => 
      order.paymentStatus === 'PAID' && 
      order.inventoryPostingStatus !== 'POSTED'
    );
  }

  /**
   * Identifies orders whose inventory posting has explicitly failed
   */
  async getFailedPostingOrders(organizationId: string): Promise<import('../types/firestoreSchema').OrderDoc[]> {
    const allOrders = await this.executeQuery(organizationId, {});
    return allOrders.filter(order => order.inventoryPostingStatus === 'FAILED');
  }
}

export class PurchaseOrderRepository extends BaseRepository<import('../types/firestoreSchema').PurchaseOrderDoc> {}

export class SupplierRepository extends BaseRepository<import('../types/firestoreSchema').SupplierDoc> {
  override async softDelete(organizationId: string, id: string, userId: string): Promise<void> {
    throw new Error('Suppliers should be ARCHIVED via status instead of soft deleted to preserve historical performance data.');
  }
}

export class SupplierPerformanceRepository extends BaseRepository<import('../types/firestoreSchema').SupplierPerformanceDoc> {}
export class PurchaseOrderApprovalRepository extends BaseRepository<import('../types/firestoreSchema').PurchaseOrderApprovalDoc> {}

export class SupplierInvoiceRepository extends BaseRepository<import('../types/firestoreSchema').SupplierInvoiceDoc> {}
export class InvoiceMatchResultRepository extends BaseRepository<import('../types/firestoreSchema').InvoiceMatchResultDoc> {}
export class SupplierPaymentRepository extends BaseRepository<import('../types/firestoreSchema').SupplierPaymentDoc> {
  override async update(organizationId: string, id: string, data: Partial<import('../types/firestoreSchema').SupplierPaymentDoc>, userId: string): Promise<void> {
    const currentDoc = await this.getById(organizationId, id);
    if (currentDoc && currentDoc.status === 'POSTED') {
      throw new Error('SupplierPayments that are POSTED are immutable and cannot be updated. Use a compensating entry.');
    }
    return super.update(organizationId, id, data, userId);
  }

  override async softDelete(organizationId: string, id: string, userId: string): Promise<void> {
    const currentDoc = await this.getById(organizationId, id);
    if (currentDoc && currentDoc.status === 'POSTED') {
      throw new Error('SupplierPayments that are POSTED are immutable and cannot be soft deleted.');
    }
    return super.softDelete(organizationId, id, userId);
  }

  override async hardDelete(organizationId: string, id: string): Promise<void> {
    const currentDoc = await this.getById(organizationId, id);
    if (currentDoc && currentDoc.status === 'POSTED') {
      throw new Error('SupplierPayments that are POSTED are immutable and cannot be hard deleted.');
    }
    return super.hardDelete(organizationId, id);
  }
}

export class InventoryReceiptRepository extends BaseRepository<import('../types/firestoreSchema').InventoryReceiptDoc> {
  override async update(organizationId: string, id: string, data: Partial<import('../types/firestoreSchema').InventoryReceiptDoc>, userId: string): Promise<void> {
    const currentDoc = await this.getById(organizationId, id);
    if (currentDoc && currentDoc.status === 'POSTED') {
      throw new Error('InventoryReceipts that are POSTED are immutable and cannot be updated. Use a compensating entry.');
    }
    return super.update(organizationId, id, data, userId);
  }

  override async softDelete(organizationId: string, id: string, userId: string): Promise<void> {
    const currentDoc = await this.getById(organizationId, id);
    if (currentDoc && currentDoc.status === 'POSTED') {
      throw new Error('InventoryReceipts that are POSTED are immutable and cannot be soft deleted.');
    }
    return super.softDelete(organizationId, id, userId);
  }

  override async hardDelete(organizationId: string, id: string): Promise<void> {
    const currentDoc = await this.getById(organizationId, id);
    if (currentDoc && currentDoc.status === 'POSTED') {
      throw new Error('InventoryReceipts that are POSTED are immutable and cannot be hard deleted.');
    }
    return super.hardDelete(organizationId, id);
  }
}

export class InventoryPostingRepository extends BaseRepository<import('../types/firestoreSchema').InventoryPostingDoc> {

  async getPostingByOrderId(organizationId: string, orderId: string): Promise<import('../types/firestoreSchema').InventoryPostingDoc | null> {
    const qParams = {
      where: [{ field: 'orderId', operator: '==' as const, value: orderId }],
      limit: 1
    };
    const results = await this.executeQuery(organizationId, qParams);
    return results.length > 0 ? results[0] : null;
  }

  async postingExists(organizationId: string, orderId: string): Promise<boolean> {
    const posting = await this.getPostingByOrderId(organizationId, orderId);
    return posting !== null;
  }

  /**
   * Identifies postings whose corresponding order document does not exist
   */
  async getOrphanedPostings(organizationId: string, extantOrderIds: Set<string>): Promise<import('../types/firestoreSchema').InventoryPostingDoc[]> {
    const postings = await this.executeQuery(organizationId, {});
    return postings.filter(posting => !extantOrderIds.has(posting.orderId));
  }

  /**
   * Identifies postings with inconsistent reference states between order status and posting status
   */
  async getInconsistentPostings(
    organizationId: string, 
    ordersMap: Map<string, import('../types/firestoreSchema').OrderDoc>
  ): Promise<Array<{ posting: import('../types/firestoreSchema').InventoryPostingDoc; order: import('../types/firestoreSchema').OrderDoc; reason: string }>> {
    const postings = await this.executeQuery(organizationId, {});
    const inconsistencies: Array<{ posting: import('../types/firestoreSchema').InventoryPostingDoc; order: import('../types/firestoreSchema').OrderDoc; reason: string }> = [];

    for (const posting of postings) {
      const order = ordersMap.get(posting.orderId);
      if (order) {
        if (order.inventoryPostingStatus !== 'POSTED' && posting.status === 'POSTED') {
          inconsistencies.push({
            posting,
            order,
            reason: `Order has posting status '${order.inventoryPostingStatus}' but posting ledger is '${posting.status}'`
          });
        }
      }
    }
    return inconsistencies;
  }

  isValidTransition(currentStatus: import('../types/firestoreSchema').InventoryPostingStatus | undefined, newStatus: import('../types/firestoreSchema').InventoryPostingStatus): boolean {
    if (!currentStatus) return newStatus === 'PENDING';
    
    switch (currentStatus) {
      case 'PENDING': return newStatus === 'PROCESSING';
      case 'PROCESSING': return newStatus === 'POSTED' || newStatus === 'FAILED';
      case 'FAILED': return newStatus === 'PROCESSING';
      case 'POSTED': return newStatus === 'RECONCILED';
      case 'RECONCILED': return false; // terminal state
      default: return false;
    }
  }

  async createPosting(organizationId: string, posting: Partial<Omit<import('../types/firestoreSchema').InventoryPostingDoc, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>>, userId: string): Promise<string> {
    if (!posting.orderId) {
      throw new Error('InventoryPosting must have an orderId.');
    }
    const idToUse = posting.orderId;
    // We enforce id === orderId for idempotency and fetch speed
    const newDoc = await this.set(organizationId, idToUse, posting as any, userId);
    return newDoc.id;
  }

  override async update(organizationId: string, id: string, data: Partial<import('../types/firestoreSchema').InventoryPostingDoc>, userId: string): Promise<void> {
    if ('movements' in data) {
      throw new Error('InventoryPostings are immutable. Movements cannot be updated. Use a compensating posting instead.');
    }
    return super.update(organizationId, id, data, userId);
  }

  override async softDelete(organizationId: string, id: string, userId: string): Promise<void> {
    throw new Error('InventoryPostings are immutable and cannot be soft deleted.');
  }

  override async hardDelete(organizationId: string, id: string): Promise<void> {
    throw new Error('InventoryPostings are immutable and cannot be hard deleted.');
  }
}

