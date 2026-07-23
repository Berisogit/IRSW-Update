import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';
import firebaseConfig from '../firebase-applet-config.json';

// Firebase Auth Whitelist & Configuration Guard
if (typeof window !== 'undefined') {
  const currentHost = window.location.hostname;
  console.info(`[Firebase Auth Guard] Initializing from host: "${currentHost}"`);
  console.info(`[Firebase Auth Guard] Configured authDomain: "${firebaseConfig.authDomain}"`);
  console.info(
    `[Firebase Auth Guard] IMPORTANT: If you encounter an 'auth/unauthorized-domain' error, ` +
    `ensure "${currentHost}" (and any other custom domains/stages) are explicitly whitelisted ` +
    `in the Firebase Console under: Authentication -> Settings -> Authorized domains.`
  );
}

export let app: any = null;
export let auth: Auth | null = null;
export let db: Firestore | null = null;
export let storage: FirebaseStorage | null = null;
export let googleProvider: GoogleAuthProvider | null = null;
export let functions: Functions | null = null;

const USE_EMULATOR = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' &&
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

try {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  
 
  try {
    db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
  } catch (e: any) {
    console.warn("initializeFirestore with databaseId and long polling failed, fallback to default getFirestore:", e);
    try {
      db = getFirestore(app);
    } catch (err: any) {
      try {
        db = initializeFirestore(app, {});
      } catch (subErr: any) {
        console.error("All Firestore initialization attempts failed:", subErr);
        db = getFirestore(app);
        console.log("Firebase project:", app.options.projectId);
        console.log("Using emulator:", USE_EMULATOR);
        console.log("Hostname:", window.location.hostname);
      }
    }
  }
  
  storage = getStorage(app);
  functions = getFunctions(app);
  console.log("========== Firebase Init ==========");
  console.log("Project ID:", app.options.projectId);
  console.log("Current Host:", window.location.hostname);
  console.log("USE_EMULATOR:", USE_EMULATOR);
  console.log("Database ID: (default)");
  googleProvider = new GoogleAuthProvider();

  if (USE_EMULATOR) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db!, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    connectFunctionsEmulator(functions, 'localhost', 5001);
  }
  
  console.log("Firebase Auth Init:", auth);
  console.log("Firebase DB Init:", db);


} catch (error) {
  console.error("Firebase initialization failed:", error);
}