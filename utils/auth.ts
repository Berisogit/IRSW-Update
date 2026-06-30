
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

/**
 * IRSW Security Node: Session Termination Utility
 */
export const logoutUser = async () => {
  try {
    if (auth) {
      await signOut(auth).catch(() => {});
    }

    // Purge all local authority signals
    try { localStorage.clear(); } catch(e) {}
    try { sessionStorage.clear(); } catch(e) {}

    // Reset persistence nodes
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      dbs.forEach(db => {
        if (db.name) indexedDB.deleteDatabase(db.name);
      });
    }

    // Force terminal reset
    window.location.href = '/';
  } catch (err) {
    console.error('[Auth Utils] Logout sequence interrupted:', err);
  }
};
