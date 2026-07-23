import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { UserRole, UserStatus } from './types/shared';

export interface OrganizationMemberProvisioningPayload {
  uid: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  organizationId: string;
  createdBy: string;
  status?: UserStatus;
}

export const applyOrganizationMemberProvisioningToBatch = (
  batch: admin.firestore.WriteBatch,
  payload: OrganizationMemberProvisioningPayload
): string => {
  const db = admin.firestore();
  const {
    uid,
    email,
    name,
    phone,
    role,
    organizationId,
    createdBy,
    status = UserStatus.ACTIVE,
  } = payload;

  const membershipId = `${organizationId}_${uid}`;

  const staffData = {
    uid,
    firstName: name.split(' ')[0],
    lastName: name.split(' ').slice(1).join(' '),
    displayName: name,
    email,
    phone,
    staffCode: uid,
    role,
    assignedRoles: [role],
    status,
    organizationId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy,
  };

  const userData = {
    email,
    name,
    phone,
    role,
    organizationId,
    status,
    createdAt: FieldValue.serverTimestamp(),
  };

  const membershipData = {
    id: membershipId,
    userId: uid,
    organizationId,
    role,
    status,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy,
  };

  console.log('[IRSW Functions] Writing provisioned documents', {
    action: 'provisioning-write-docs',
    uid,
    organizationId,
    membershipId,
    userDocPath: `users/${uid}`,
    staffDocPath: `organizations/${organizationId}/staff/${uid}`,
    membershipDocPath: `memberships/${membershipId}`,
  });

  batch.set(db.doc(`users/${uid}`), userData);
  batch.set(db.doc(`organizations/${organizationId}/staff/${uid}`), staffData);
  batch.set(db.doc(`memberships/${membershipId}`), membershipData);

  return membershipId;
};

export const setOrganizationClaims = async (uid: string, organizationId: string, role: UserRole) => {
  await admin.auth().setCustomUserClaims(uid, {
    organizationId,
    role,
  });
};
