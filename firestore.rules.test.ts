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
  // Read rules from DRAFT_firestore.rules
  let rules = '';
  try {
    rules = readFileSync(resolve(__dirname, 'DRAFT_firestore.rules'), 'utf8');
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
    await db.doc('users/admin_uid').set({
      email: 'lenchamo@gmail.com',
      globalRole: 'SYSTEM_ADMIN'
    });
    // Org Owner
    await db.doc('organizationUsers/owner_org1').set({
      userId: 'owner_uid',
      organizationId: 'org1',
      role: 'owner',
      status: 'ACTIVE'
    });
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
    const db = testEnv.authenticatedContext('hacker_uid', { email: 'hacker@example.com', email_verified: true }).firestore();
    await assertFails(db.doc('users/victim_uid').set({
      id: 'hacker_uid',
      email: 'hacker@example.com',
      displayName: 'Hacker',
      globalRole: 'USER',
      createdAt: 12345,
      updatedAt: 12345
    }));
  });

  // 2. Tenant Bleeding
  test('Prevents reading other orgs data', async () => {
    const db = testEnv.authenticatedContext('stranger_uid', { email: 'stranger@example.com', email_verified: true }).firestore();
    await assertFails(db.doc('organizations/org1/orders/123').get());
  });

  // 3. Privilege Escalation
  test('Prevents user from upgrading their org role', async () => {
    const db = testEnv.authenticatedContext('some_manager', { email: 'manager@example.com', email_verified: true }).firestore();
    await assertFails(db.doc('organizationUsers/some_manager_org1').update({
      role: 'OWNER'
    }));
  });

  // 4. Resource Poisoning
  test('Prevents injecting large strings into IDs or fields', async () => {
    const db = testEnv.authenticatedContext('admin_uid', { email: 'admin@example.com', email_verified: true }).firestore();
    let largeString = 'a'.repeat(200);
    // Even an admin cannot bypass string limits on the validation logic for name
    await assertFails(db.doc('organizations/org1').update({
      name: largeString
    }));
  });

});
