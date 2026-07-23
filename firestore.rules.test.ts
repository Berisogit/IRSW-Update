import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Read rules from production firestore.rules
  let rules = '';
  try {
    rules = readFileSync(resolve(__dirname, 'firestore.rules'), 'utf8');
  } catch(e) {
    console.error('Test could not locate DRAFT_firestore.rules');
    return;
  }
  
  testEnv = await initializeTestEnvironment({
    projectId: 'test-project',
    firestore: {
      rules: rules,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  
  // Set up auth data and parent structures
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // System admin user
    // Data setups for 'organizationUsers' are removed as authorization
    // now relies on token claims simulated in authenticatedContext().

    // Regular Org
    await db.doc('organizations/org1').set({
      name: 'Test Org',
      status: 'ACTIVE',
      contactEmail: 'contact@test.com'
    });
  });
});

describe('Firestore Rules - The Dirty Dozen', () => {

  // 1. Identity Spoofing
  test('Prevents identity spoofing on user update', async () => {
    const db = testEnv.authenticatedContext('hacker_uid', { organizationId: 'org2', role: 'waiter' }).firestore();
    await assertFails(db.doc('users/victim_uid').set({
      id: 'hacker_uid',
      displayName: 'Hacker',
      createdAt: 12345,
      updatedAt: 12345
    }));
  });

  test('Prevents clients from creating profile documents', async () => {
    const db = testEnv.authenticatedContext('tenant_user', { organizationId: 'org1', role: 'waiter' }).firestore();
    await assertFails(db.doc('users/tenant_user').set({
      id: 'tenant_user',
      displayName: 'Tenant User',
      role: 'waiter',
      createdAt: 12345,
      updatedAt: 12345
    }));
  });

  test('Prevents clients from creating membership documents', async () => {
    const db = testEnv.authenticatedContext('tenant_user', { organizationId: 'org1', role: 'waiter' }).firestore();
    await assertFails(db.doc('memberships/org1_tenant_user').set({
      userId: 'tenant_user',
      organizationId: 'org1',
      role: 'waiter',
      status: 'ACTIVE',
      createdAt: 12345,
      updatedAt: 12345
    }));
  });

  // 2. Tenant Bleeding
  test('Prevents reading other orgs data', async () => {
    const db = testEnv.authenticatedContext('stranger_uid', { organizationId: 'org_other', role: 'owner' }).firestore();
    await assertFails(db.doc('organizations/org1/orders/123').get());
  });

  // 3. Privilege Escalation
  test('Prevents user from upgrading their org role', async () => {
    const db = testEnv.authenticatedContext('some_manager', { organizationId: 'org1', role: 'manager' }).firestore();
    await assertFails(db.doc('organizations/org1/staff/some_manager').update({
      role: 'owner'
    }));
  });

  // 4. Resource Poisoning
  test('Prevents injecting large strings into IDs or fields', async () => {
    const db = testEnv.authenticatedContext('admin_uid', { role: 'system_admin' }).firestore();
    let largeString = 'a'.repeat(200);
    // Even an admin cannot bypass string limits on the validation logic for name
    await assertFails(db.doc('organizations/org1').update({
      name: largeString
    }));
  });

  // 5. Collection Crawling
  test('Prevents listing all organizations (Collection Crawling)', async () => {
    const db = testEnv.authenticatedContext('some_user', { organizationId: 'org1', role: 'waiter' }).firestore();
    await assertFails(db.collection('organizations').get());
  });

  // 6. Field Injection
  test('Prevents waiters from tampering with restricted order fields', async () => {
    const db = testEnv.authenticatedContext('waiter_1', { organizationId: 'org1', role: 'waiter' }).firestore();
    await assertFails(db.doc('organizations/org1/orders/ord1').set({
      items: [],
      status: 'PENDING',
      inventoryPostingStatus: 'SUCCESS' // Metadata tampering attempt
    }));
  });

  // 7. Cross-Tenant Write
  test('Prevents writing data to a different organization namespace', async () => {
    const db = testEnv.authenticatedContext('user_org1', { organizationId: 'org1', role: 'owner' }).firestore();
    await assertFails(db.doc('organizations/org2/orders/leak_order').set({ status: 'PENDING' }));
  });

  // 8. Unauthenticated Access
  test('Prevents unauthenticated users from accessing any internal data', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('organizations').get());
    await assertFails(db.doc('organizations/org1').get());
  });

  // 9. Unauthorized Staff Management
  test('Prevents waiters from adding or modifying staff records', async () => {
    const db = testEnv.authenticatedContext('waiter_1', { organizationId: 'org1', role: 'waiter' }).firestore();
    await assertFails(db.doc('organizations/org1/staff/new_employee').set({
      role: 'manager',
      email: 'hacked@test.com'
    }));
  });

  // 10. Batch Write Consistency
  test('Prevents a batch from succeeding if it contains one unauthorized cross-tenant write', async () => {
    const db = testEnv.authenticatedContext('user_org1', { organizationId: 'org1', role: 'owner' }).firestore();
    const batch = db.batch();
    batch.set(db.doc('organizations/org1/orders/valid_ord'), { status: 'PENDING' });
    batch.set(db.doc('organizations/org2/orders/leak_ord'), { status: 'HACKED' }); // Invalid: Cross-tenant
    await assertFails(batch.commit());
  });

  // 11. Method-Level Restriction (Unauthorized Deletion)
  test('Prevents waiters from deleting order records', async () => {
    const db = testEnv.authenticatedContext('waiter_1', { organizationId: 'org1', role: 'waiter' }).firestore();
    await assertFails(db.doc('organizations/org1/orders/ord1').delete());
  });

  // 12. Schema/Type Validation
  test('Prevents using invalid data types for organization names', async () => {
    const db = testEnv.authenticatedContext('admin_uid', { role: 'system_admin' }).firestore();
    await assertFails(db.doc('organizations/org1').update({ name: ['Invalid', 'Array', 'Name'] }));
  });

  // Advanced Schema Enforcement via diff()
  test('Prevents updating createdAt even for owners (Immutability)', async () => {
    const db = testEnv.authenticatedContext('owner_1', { organizationId: 'org1', role: 'owner' }).firestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('organizations/org1/orders/ord1').set({ createdAt: 1000, status: 'PENDING' });
    });
    // Fails because createdAt is in affectedKeys() but is blacklisted for updates
    await assertFails(db.doc('organizations/org1/orders/ord1').update({ createdAt: 2000 }));
  });

  test('Requires cancellationReason when an order is moved to CANCELLED', async () => {
    const db = testEnv.authenticatedContext('manager_1', { organizationId: 'org1', role: 'manager' }).firestore();
    // Fails because status changed to CANCELLED but cancellationReason was not provided in the write
    await assertFails(db.doc('organizations/org1/orders/ord1').set({ status: 'CANCELLED' }, { merge: true }));
  });

});
