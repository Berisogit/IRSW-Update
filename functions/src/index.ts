import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { UserRole, UserStatus, AuditOutcome } from '../types/shared';
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
    // 2. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });
    createdUid = userRecord.uid;

    const uid = userRecord.uid;
    const normalizedRole = role.toLowerCase() as UserRole; // Ensure it's a valid UserRole

    const staffData = {
      uid,
      firstName: name.split(' ')[0],
      lastName: name.split(' ').slice(1).join(' '),
      displayName: name,
      email,
      phone,
      staffCode: uid, // Using UID as fallback for staffCode
      role: normalizedRole,
      assignedRoles: [normalizedRole],
      status: UserStatus.ACTIVE,
      organizationId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: callerId,
    };

    const userData = {
      email,
      name,
      phone,
      role: normalizedRole,
      organizationId,
      status: UserStatus.ACTIVE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const membershipId = `${organizationId}_${uid}`;
    const membershipData = {
      id: membershipId,
      userId: uid,
      organizationId,
      role: normalizedRole,
      status: UserStatus.ACTIVE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: callerId,
    };

    // 3. Execute Atomically
    const writeBatch = db.batch();

    // Create users/{uid}
    const userRef = db.doc(`users/${uid}`);
    writeBatch.set(userRef, userData);

    // Create organizations/{orgId}/staff/{uid}
    const staffRef = db.doc(`organizations/${organizationId}/staff/${uid}`);
    writeBatch.set(staffRef, staffData);

    // Create memberships/{orgId}_{uid}
    const membershipRef = db.doc(`memberships/${membershipId}`);
    writeBatch.set(membershipRef, membershipData);

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
    await writeBatch.commit();

    // 6. Set Custom Claims only after database confirmation
    await admin.auth().setCustomUserClaims(uid, {
      organizationId,
      role: normalizedRole
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
    // 1. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: ownerName,
    });

    const uid = createdUid = userRecord.uid;
    const orgRef = db.collection('organizations').doc();
    organizationId = orgRef.id;

    // 2. Prepare Data (Lowercase role 'owner' per ADR vocabulary)
    const orgData = {
      id: organizationId,
      name: restaurantName,
      status: UserStatus.ACTIVE,
      plan: 'PRO',
      contactEmail: email,
      settings: { version: version || 'v5.3.0' },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'SYSTEM_BOOTSTRAP',
      ownerId: uid,
    };

    const staffData = {
      uid: uid,
      firstName: ownerName.split(' ')[0],
      lastName: ownerName.split(' ').slice(1).join(' '),
      displayName: ownerName,
      email,
      phone,
      staffCode: uid,
      role: UserRole.OWNER,
      assignedRoles: [UserRole.OWNER],
      status: UserStatus.ACTIVE,
      organizationId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'SYSTEM_BOOTSTRAP',
    };

    const userData = {
      email,
      name: ownerName,
      phone,
      role: UserRole.OWNER,
      organizationId,
      status: UserStatus.ACTIVE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const membershipId = `${organizationId}_${uid}`;
    const membershipData = {
      id: membershipId,
      userId: uid,
      organizationId,
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'SYSTEM_BOOTSTRAP',
    };

    // 3. Prepare Batch
    const writeBatch = db.batch();
    writeBatch.set(orgRef, orgData);
    writeBatch.set(db.doc(`users/${uid}`), userData);
    writeBatch.set(db.doc(`organizations/${organizationId}/staff/${uid}`), staffData);
    writeBatch.set(db.doc(`memberships/${membershipId}`), membershipData);

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
    await admin.auth().setCustomUserClaims(uid, {
      organizationId,
      role: UserRole.OWNER
    });

    await writeBatch.commit();

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
