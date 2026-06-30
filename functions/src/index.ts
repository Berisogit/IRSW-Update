import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const createStaffUser = onCall(async (request) => {
  const { data, auth } = request;
  
  // 1. Verify Caller Auth & Role (Only MANAGER, OWNER, SUPER_ADMIN)
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to create staff.');
  }

  const { name, email, role, password, organizationId } = data;

  if (!name || !email || !role || !password || !organizationId) {
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
    callerRole !== 'MANAGER' && 
    callerRole !== 'OWNER' && 
    callerRole !== 'SUPER_ADMIN' && 
    callerRole !== 'ADMIN' && 
    callerRole !== 'SYSTEM_ADMIN'
  ) {
    throw new HttpsError('permission-denied', 'Caller does not have sufficient permissions to create staff.');
  }

  try {
    // 2. Create Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    const staffDocId = userRecord.uid;

    const staffData = {
      uid: staffDocId,
      firstName: name.split(' ')[0],
      lastName: name.split(' ').slice(1).join(' '),
      displayName: name,
      email,
      staffCode: staffDocId, // Using UID as fallback for staffCode
      role,
      assignedRoles: [role],
      status: 'ACTIVE',
      organizationId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: callerId,
    };

    const userData = {
      email,
      name,
      role,
      status: 'ACTIVE',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      registeredByOrg: organizationId,
    };

    const membershipId = `${organizationId}_${staffDocId}`;
    const membershipData = {
      id: membershipId,
      userId: staffDocId,
      organizationId,
      role,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: callerId,
    };

    // 3. Execute Atomically
    const writeBatch = db.batch();

    // Create users/{uid}
    const userRef = db.doc(`users/${staffDocId}`);
    writeBatch.set(userRef, userData);

    // Create organizations/{orgId}/staff/{uid}
    const staffRef = db.doc(`organizations/${organizationId}/staff/${staffDocId}`);
    writeBatch.set(staffRef, staffData);

    // Create memberships/{orgId}_{uid}
    const membershipRef = db.doc(`memberships/${membershipId}`);
    writeBatch.set(membershipRef, membershipData);

    try {
      await writeBatch.commit();
    } catch (batchError) {
      // Rollback Auth User if Firestore writes fail
      console.error('Firestore batch write failed, rolling back auth user creation:', batchError);
      try {
        await admin.auth().deleteUser(staffDocId);
      } catch (rollbackError) {
        console.error('Failed to rollback auth user creation:', rollbackError);
      }
      throw batchError;
    }

    return {
      success: true,
      uid: staffDocId,
      message: 'Staff user created successfully.'
    };
  } catch (error: any) {
    console.error('Error creating staff user:', error);
    throw new HttpsError('internal', error.message || 'An error occurred during user creation.');
  }
});
