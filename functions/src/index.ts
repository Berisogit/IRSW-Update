import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

import { UserRole, UserStatus, AuditOutcome } from './types/shared';
import { applyOrganizationMemberProvisioningToBatch, setOrganizationClaims } from './provisioning';
admin.initializeApp();

/**
 * Helper to append a standardized audit log entry to a Firestore batch.
 */
const appendAuditLog = (
  batch: admin.firestore.WriteBatch,
  data: {
    organizationId: string;
    userRole: string;
    userIdentifier: string;
    action: string;
    targetEntityType: string;
    targetEntityId: string;
    outcome: AuditOutcome;
    notes?: string;
  }
) => {
  const db = admin.firestore();
  const logRef = db.collection('auditLogs').doc();
  batch.set(logRef, {
    id: logRef.id,
    timestamp: Date.now(),
    ...data,
  });
};

export const createStaffUser = onCall(async (request) => {
  const { data, auth } = request;
  
  // 1. Verify Caller Auth & Role (Only MANAGER, OWNER, SUPER_ADMIN)
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to create staff.');
  }

  const { name, email, role, password, organizationId, phone } = data;

  if (!name || !email || !role || !password || !organizationId || !phone) {
    throw new HttpsError('invalid-argument', 'Missing required fields.');
  }

  // Authorize based on authoritative RBAC source
  const callerId = auth.uid;
  const db = admin.firestore();
  
  const callerStaffRef = db.doc(`organizations/${organizationId}/staff/${callerId}`);
  const callerStaffDoc = await callerStaffRef.get();

  if (!callerStaffDoc.exists) {
    throw new HttpsError('permission-denied', 'Caller is not part of the organization.');
  }

  const callerData = callerStaffDoc.data();
  const callerRole = callerData?.role;
console.log("[PERMISSION DEBUG]", {
  callerRole,
  OWNER: UserRole.OWNER,
  MANAGER: UserRole.MANAGER,
  SUPER_ADMIN: UserRole.SUPER_ADMIN,
  SYSTEM_ADMIN: UserRole.SYSTEM_ADMIN,
});
  if (
    callerRole !== UserRole.MANAGER && 
    callerRole !== UserRole.OWNER && 
    callerRole !== UserRole.SUPER_ADMIN && 
    callerRole !== UserRole.SYSTEM_ADMIN
  ) {
    throw new HttpsError('permission-denied', 'Caller does not have sufficient permissions to create staff.');
  }

  let createdUid: string | null = null;

  try {
    console.log('[IRSW Functions] createStaffUser invoked', {
      action: 'create-staff-user-start',
      callerUid: auth.uid,
      organizationId,
      role,
      email,
    });

    // 2. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });
    createdUid = userRecord.uid;

    const uid = userRecord.uid;
    const normalizedRole = role.toLowerCase() as UserRole; // Ensure it's a valid UserRole

    console.log('[IRSW Functions] Auth user created', {
      action: 'create-staff-user-auth-created',
      uid,
      organizationId,
      role: normalizedRole,
    });

    // 3. Execute Atomically
    const writeBatch = db.batch();
    applyOrganizationMemberProvisioningToBatch(writeBatch, {
      uid,
      email,
      name,
      phone,
      role: normalizedRole,
      organizationId,
      createdBy: callerId,
      status: UserStatus.ACTIVE,
    });

    // 4. Log the action
    appendAuditLog(writeBatch, {
      organizationId,
      userRole: callerRole,
      userIdentifier: callerId,
      action: 'STAFF_USER_CREATED',
      targetEntityType: 'User',
      targetEntityId: uid,
      outcome: AuditOutcome.SUCCESS,
      notes: `Created staff member ${email} with role ${normalizedRole}`
    });

    // 5. Commit database changes first
    console.log('[IRSW Functions] Committing provisioning batch', {
      action: 'create-staff-user-provisioning-commit',
      uid,
      organizationId,
      membershipId: `${organizationId}_${uid}`,
    });
    await writeBatch.commit();

    // 6. Set Custom Claims only after database confirmation
    console.log('[IRSW Functions] Assigning custom claims', {
      action: 'create-staff-user-claims-request',
      uid,
      organizationId,
      role: normalizedRole,
    });
    await setOrganizationClaims(uid, organizationId, normalizedRole);
    console.log('[IRSW Functions] Custom claims assigned', {
      action: 'create-staff-user-claims-success',
      uid,
      organizationId,
      role: normalizedRole,
    });

    console.log('[IRSW Functions] createStaffUser completed', {
      action: 'create-staff-user-complete',
      uid,
      organizationId,
      role: normalizedRole,
    });

    return {
      success: true,
      uid,
      message: 'Staff user created successfully.'
    };
  } catch (error: any) {
    // Log the failure if an identity was created but provisioning logic failed
    if (createdUid) {
      try {
        const failBatch = db.batch();
        appendAuditLog(failBatch, {
          organizationId,
          userRole: callerRole || 'unknown',
          userIdentifier: callerId,
          action: 'STAFF_USER_PROVISIONING_ROLLBACK',
          targetEntityType: 'User',
          targetEntityId: createdUid,
          outcome: AuditOutcome.FAILURE,
          notes: `Provisioning failed after Auth creation. Rollback initiated. Error: ${error.message}`
        });
        await failBatch.commit();
      } catch (logError) {
        console.error('Audit: Failed to log rollback event:', logError);
      }
    }

    // Broad Rollback: If anything failed after user creation, purge the account
    if (createdUid) {
      try {
        await admin.auth().deleteUser(createdUid);
      } catch (rollbackError) {
        console.error('Critical: Failed to rollback auth user in broad catch:', rollbackError);
      }
    }

    console.error('Error creating staff user:', error);
    throw new HttpsError('internal', error.message || 'An error occurred during user creation.');
  }
});

export const initializeNewRestaurant = onCall(async (request) => {
  const { data } = request;
  const { restaurantName, ownerName, email, phone, password, version } = data;

  if (!restaurantName || !ownerName || !email || !password || !phone) {
    throw new HttpsError('invalid-argument', 'Missing required fields.');
  }

  const db = admin.firestore();

  let createdUid: string | null = null;
  let organizationId: string | null = null;

  try {
    console.log('[IRSW Functions] initializeNewRestaurant invoked', {
      action: 'initialize-new-restaurant-start',
      email,
      restaurantName,
    });

    // 1. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: ownerName,
    });

    const uid = createdUid = userRecord.uid;
    const orgRef = db.collection('organizations').doc();
    organizationId = orgRef.id;

    console.log('[IRSW Functions] Auth owner created', {
      action: 'initialize-new-restaurant-auth-created',
      uid,
      organizationId,
    });

    // 2. Prepare Data (Lowercase role 'owner' per ADR vocabulary)
    const orgData = {
      id: organizationId,
      name: restaurantName,
      status: UserStatus.ACTIVE,
      plan: 'PRO',
      contactEmail: email,
      settings: { version: version || 'v5.3.0' },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      ownerId: uid,
    };

    // 3. Prepare Batch
    const writeBatch = db.batch();
    writeBatch.set(orgRef, orgData);
    applyOrganizationMemberProvisioningToBatch(writeBatch, {
      uid,
      email,
      name: ownerName,
      phone,
      role: UserRole.OWNER,
      organizationId,
      createdBy: 'SYSTEM_BOOTSTRAP',
      status: UserStatus.ACTIVE,
    });

    // 4. Log the bootstrap event
    appendAuditLog(writeBatch, {
      organizationId,
      userRole: UserRole.OWNER,
      userIdentifier: 'SYSTEM_BOOTSTRAP',
      action: 'RESTAURANT_INITIALIZED',
      targetEntityType: 'Organization',
      targetEntityId: organizationId,
      outcome: AuditOutcome.SUCCESS,
      notes: `Initial provisioning of ${restaurantName} by ${email}`
    });

    // 4. Set Custom Claims for RBAC (Organization Isolation)
    console.log('[IRSW Functions] Assigning custom claims', {
      action: 'initialize-new-restaurant-claims-request',
      uid,
      organizationId,
      role: UserRole.OWNER,
    });
    await setOrganizationClaims(uid, organizationId, UserRole.OWNER);
    console.log('[IRSW Functions] Custom claims assigned', {
      action: 'initialize-new-restaurant-claims-success',
      uid,
      organizationId,
      role: UserRole.OWNER,
    });

    console.log('[IRSW Functions] Committing provisioning batch', {
      action: 'initialize-new-restaurant-provisioning-commit',
      uid,
      organizationId,
      membershipId: `${organizationId}_${uid}`,
    });
    await writeBatch.commit();

    console.log('[IRSW Functions] initializeNewRestaurant completed', {
      action: 'initialize-new-restaurant-complete',
      uid,
      organizationId,
    });

    return {
      success: true,
      organizationId,
      userId: uid,
      message: 'Restaurant and Owner provisioned successfully.'
    };
  } catch (error: any) {
    // Log the failure if an identity was created but provisioning logic failed
    if (createdUid) {
      try {
        const failBatch = db.batch();
        appendAuditLog(failBatch, {
          organizationId: organizationId || 'N/A',
          userRole: UserRole.OWNER,
          userIdentifier: 'SYSTEM_BOOTSTRAP',
          action: 'RESTAURANT_INITIALIZATION_ROLLBACK',
          targetEntityType: 'Organization',
          targetEntityId: organizationId || 'N/A',
          outcome: AuditOutcome.FAILURE,
          notes: `Bootstrap failed after Auth creation. Rollback initiated. Error: ${error.message}`
        });
        await failBatch.commit();
      } catch (logError) {
        console.error('Audit: Failed to log bootstrap rollback:', logError);
      }
    }

    // Broad Rollback: If anything failed after user creation, purge the account
    if (createdUid) {
      try {
        await admin.auth().deleteUser(createdUid);
      } catch (rollbackError) {
        console.error('Critical: Failed to rollback auth user in broad catch:', rollbackError);
      }
    }
    console.error('Error initializing restaurant:', error);
    throw new HttpsError('internal', error.message || 'Bootstrap initialization failed.');
  }
});
