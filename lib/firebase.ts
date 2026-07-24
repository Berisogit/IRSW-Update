import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  Auth, 
  connectAuthEmulator 
} from 'firebase/auth';

import { 
  initializeFirestore, 
  getFirestore, 
  Firestore, 
  connectFirestoreEmulator 
} from 'firebase/firestore';

import { 
  getStorage, 
  FirebaseStorage, 
  connectStorageEmulator 
} from 'firebase/storage';

import { 
  getFunctions, 
  Functions, 
  connectFunctionsEmulator 
} from 'firebase/functions';

import firebaseConfig from '../firebase-applet-config.json';


/**
 * Firebase environment guard
 */
if (typeof window !== 'undefined') {
  const currentHost = window.location.hostname;

  console.info(`[Firebase Auth Guard] Host: ${currentHost}`);
  console.info(`[Firebase Auth Guard] Auth Domain: ${firebaseConfig.authDomain}`);
}


const USE_EMULATOR =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' &&
  typeof window !== 'undefined' &&
  (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );


/**
 * Firebase App
 */
export const app =
  getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig);


/**
 * Firebase Services
 */
export const auth: Auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();


export const db: Firestore = (() => {
  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
    });
  } catch (error) {
    console.warn(
      '[Firebase] initializeFirestore failed, using existing Firestore instance',
      error
    );

    return getFirestore(app);
  }
})();


export const storage: FirebaseStorage = getStorage(app);

export const functions: Functions = getFunctions(app);



/**
 * Emulator connections
 */
if (USE_EMULATOR) {

  console.info('[Firebase] Connecting to emulators');

  connectAuthEmulator(
    auth,
    'http://localhost:9099',
    { disableWarnings: true }
  );


  connectFirestoreEmulator(
    db,
    'localhost',
    8080
  );


  connectStorageEmulator(
    storage,
    'localhost',
    9199
  );


  connectFunctionsEmulator(
    functions,
    'localhost',
    5001
  );
}


/**
 * Firebase diagnostics
 */
console.info('========== Firebase Init ==========');
console.info('Project ID:', app.options.projectId);
console.info('USE_EMULATOR:', USE_EMULATOR);
console.info('Auth:', auth);
console.info('Firestore:', db);
console.info('Functions:', functions);