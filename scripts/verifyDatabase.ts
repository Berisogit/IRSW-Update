

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();

const db = getFirestore();

export async function verifyDatabase() {
  console.log('--- POST-STABILIZATION VALIDATION AUDIT ---');

  // Note: This script requires a Firebase Admin SDK service account key.
  // Example initialization:
  // initializeApp({ credential: cert(serviceAccountKey) });
  //const db = getFirestore();

  console.log('\n1. Count all users documents:');
  const usersSnap = await db.collection('users').get();
  console.log(`Total users: ${usersSnap.size}`);

  console.log('\n2. Count all memberships documents:');
  const membershipsSnap = await db.collection('memberships').get();
  console.log(`Total memberships: ${membershipsSnap.size}`);

  console.log('\n3. Count all organizations/{orgId}/staff documents:');
  const orgsSnap = await db.collection('organizations').get();
  let totalStaff = 0;
  for (const org of orgsSnap.docs) {
    const staffSnap = await db.collection(`organizations/${org.id}/staff`).get();
    totalStaff += staffSnap.size;
  }
  console.log(`Total staff records across all orgs: ${totalStaff}`);

  console.log('\n4. Identify memberships that do not have matching staff records:');
  for (const mem of membershipsSnap.docs) {
    const data = mem.data();
    if (data.organizationId && data.userId) {
      const staffRef = await db.collection(`organizations/${data.organizationId}/staff`).doc(data.userId).get();
      if (!staffRef.exists) {
        console.warn(`Orphan Membership: ${mem.id} has no matching staff record.`);
      }
    }
  }

  console.log('\n5. Identify staff records that do not have matching memberships:');
  for (const org of orgsSnap.docs) {
    const staffSnap = await db.collection(`organizations/${org.id}/staff`).get();
    for (const staff of staffSnap.docs) {
      const membershipId = `${org.id}_${staff.id}`;
      const memRef = await db.collection('memberships').doc(membershipId).get();
      if (!memRef.exists) {
        console.warn(`Orphan Staff: Staff ${staff.id} in Org ${org.id} has no matching membership (${membershipId}).`);
      }
    }
  }

  console.log('\n6. Identify users without memberships:');
  for (const user of usersSnap.docs) {
    const userMemberships = membershipsSnap.docs.filter(m => m.data().userId === user.id);
    if (userMemberships.length === 0) {
      console.warn(`User without membership: ${user.id}`);
    }
  }

  console.log('\n7. Identify any remaining memberships using the legacy mem_ format:');
  const legacyMemberships = membershipsSnap.docs.filter(doc => doc.id.startsWith('mem_'));
  console.log(`Legacy mem_ memberships found: ${legacyMemberships.length}`);
  legacyMemberships.forEach(m => console.warn(`Legacy format: ${m.id}`));

  console.log('\n8. Identify any remaining organizationUsers documents anywhere in Firestore:');
  const orgUsersSnap = await db.collectionGroup('organizationUsers').get();
  console.log(`Total organizationUsers documents found: ${orgUsersSnap.size}`);
  if (orgUsersSnap.size > 0) {
    orgUsersSnap.forEach(doc => console.warn(`Found organizationUsers: ${doc.ref.path}`));
  }

  console.log('\n--- AUDIT COMPLETE ---');
}

// To execute, uncomment and run with admin credentials:
  verifyDatabase()
  .then(() => {
    console.log('Verification complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });