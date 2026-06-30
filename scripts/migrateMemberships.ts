import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 🔒 SAFETY SWITCH
const DRY_RUN = false; // change to false only after verification

// Initialize Firebase Admin (Cloud Shell default credentials will be used)
initializeApp();

const db = getFirestore();

export async function migrateMemberships() {
  console.log('🚀 Starting Membership Migration (ADMIN SDK MODE)');
  console.log(`🔒 DRY_RUN = ${DRY_RUN}`);

  const snapshot = await db.collection('memberships').get();

  const legacyDocs = snapshot.docs.filter(doc =>
    doc.id.startsWith('mem_')
  );

  console.log(`Found ${legacyDocs.length} legacy membership documents.`);

  for (const oldDoc of legacyDocs) {
    const data = oldDoc.data();

    const oldId = oldDoc.id;
    const userId = data.userId;
    const orgId = data.organizationId;

    if (!userId || !orgId) {
      console.warn(`Skipping ${oldId} (missing userId/orgId)`);
      continue;
    }

    const newId = `${orgId}_${userId}`;

    console.log(`\nMigrating: ${oldId} → ${newId}`);

    const oldRef = db.collection('memberships').doc(oldId);
    const newRef = db.collection('memberships').doc(newId);

    try {
      const newSnap = await newRef.get();

      if (newSnap.exists) {
        console.log(`⚠️ Target exists: ${newId} (skipping create)`);
      } else {
        if (!DRY_RUN) {
          await newRef.set({
            ...data,
            id: newId,
            migratedAt: new Date().toISOString()
          });
        }
        console.log(`✔ Created: ${newId}`);
      }

      if (!DRY_RUN) {
        await oldRef.delete();
      }

      console.log(`🗑 Deleted legacy: ${oldId}`);

    } catch (err) {
      console.error(`❌ Failed migration for ${oldId}:`, err);
    }
  }

  console.log('\n✅ Migration completed');
  console.log(`🔒 DRY_RUN = ${DRY_RUN}`);
} 
migrateMemberships()
  .then(() => {
    console.log('Script finished successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  });
