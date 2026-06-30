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
  
  const dbId = (!firebaseConfig.firestoreDatabaseId || firebaseConfig.firestoreDatabaseId === 'default') 
    ? '(default)' 
    : firebaseConfig.firestoreDatabaseId;

  try {
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
    }, dbId);
  } catch (e: any) {
    console.warn("initializeFirestore with databaseId and long polling failed, fallback to default getFirestore:", e);
    try {
      db = getFirestore(app, dbId);
    } catch (err: any) {
      try {
        db = initializeFirestore(app, {}, dbId);
      } catch (subErr: any) {
        console.error("All Firestore initialization attempts failed:", subErr);
        db = getFirestore(app);
      }
    }
  }
  
  storage = getStorage(app);
  functions = getFunctions(app);
  googleProvider = new GoogleAuthProvider();

  if (USE_EMULATOR) {
    console.log("Connecting to Firebase Emulators...");
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db!, '127.0.0.1', 8080);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  
  console.log("Firebase Auth Init:", auth);
  console.log("Firebase DB Init:", db);


} catch (error) {
  console.error("Firebase initialization failed:", error);
}