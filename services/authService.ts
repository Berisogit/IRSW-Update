import { Role, UserProfile, UserStatus, STAFF_ROLES } from '../types';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, getAuth, signOut as authSignOut, fetchSignInMethodsForEmail } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import firebaseConfig from '../firebase-applet-config.json';
import { firestore } from '../services/firestoreService';

export const dispatchAuthLoading = (loading: boolean) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firebase-auth-loading', { detail: { loading } }));
  }
};

const getSecondaryAuth = () => {
  const secondaryAppName = 'SecondaryStaffRegApp';
  const apps = getApps();
  const existingApp = apps.find(app => app.name === secondaryAppName);
  const secondaryApp = existingApp || initializeApp(firebaseConfig, secondaryAppName);
  return getAuth(secondaryApp);
};

export interface AuthResponse {
  user: UserProfile;
}

export const signInWithGoogle = async (): Promise<AuthResponse> => {
  if (!auth || !googleProvider || !db) {
    throw new Error('Firebase Auth or Database is not initialized.');
  }

  dispatchAuthLoading(true);
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const email = result.user?.email?.toLowerCase().trim();

    if (!email) {
      throw new Error('AUTH_FAILED: No email payload returned from identity provider.');
    }

    let role: Role | null = null;
    let name = result.user?.displayName || 'Guest';
    let defaultOrganizationId = null;

           // Check if user is registered in root users collection
    const userDocData = await firestore.users.getById(result.user.uid);

    if (userDocData) {
      const data = userDocData as any;

      role = data.role as Role || null;
      name = data.name || data.displayName || name;
      defaultOrganizationId = data.organizationId || null;
    }

    if (!role) {
      // Check for active memberships if not natively in users
      const memberships = await firestore.memberships.executeQuery({
        where: [
          { field: 'userId', operator: '==', value: result.user.uid },
          { field: 'status', operator: '==', value: 'ACTIVE' }
        ]
      });

      if (memberships.length === 0) {
        throw new Error('UNAUTHORIZED_UPLINK: This Google identity is not mapped to an IRSW Role. Please request personnel onboarding.');
      }

      let activeMembership = null;
      if (defaultOrganizationId) {
        activeMembership = memberships.find((d: any) => d.organizationId === defaultOrganizationId);
      }
      
      if (!activeMembership) {
        if (memberships.length === 1) {
          activeMembership = memberships[0];
        } else {
          throw new Error('MULTIPLE_ORGANIZATIONS: Multiple active organizations found. Organization switcher not yet implemented.');
        }
      }

      const mem = activeMembership as any;
      role = mem.role as Role || null;
      
      if (!role) {
         throw new Error('UNAUTHORIZED_UPLINK: This Google identity is not mapped to an IRSW Role.');
      }
    }

    return {
      user: {
        name,
        phone: email,
        role,
        status: UserStatus.ACTIVE,
        staffCode: `STF-G-${role.toUpperCase().slice(0, 3)}`,
        sessionId: `GSEC-${Date.now()}`,
      }
    };
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      throw new Error('Handshake cancelled by user.');
    }
    throw error;
  } finally {
    dispatchAuthLoading(false);
  }
};

export const updateStaffStatus = async (
  organizationId: string,
  staffId: string,
  status: UserStatus,
  updatedBy: string = 'system'
): Promise<boolean> => {
  try {
    await firestore.staff.update(
      organizationId,
      staffId,
      { status: status as any },
      updatedBy
    );

    return true;
  } catch (error) {
    console.error('Error updating staff status:', error);
    return false;
  }
};

export const getAllStaff = async (
  organizationId: string
): Promise<UserProfile[]> => {
  try {
    const docs = await firestore.staff.executeQuery(
      organizationId,
      {}
    );

    return docs.map((data: any) => ({
      uid: data.uid || data.id,
      displayName: data.displayName ?? data.name ?? '',
      name: data.name ?? data.displayName ?? '',
      email: data.email ?? '',
      phone: data.phone ?? '',
      role: data.role,
      status: data.status,
      organizationId,
      staffCode: data.uid || data.id,
    } as UserProfile));

  } catch (error) {
    console.error(
      "Error fetching organization staff:",
      error
    );

    return [];
  }
};

export const signOutStaff = async (): Promise<void> => {
  if (!auth) {
    console.warn('Firebase Auth is not initialized. Sign out aborted.');
    return;
  }
  try {
    await signOut(auth);
    console.info('[Auth Node] Authority context cleared.');
  } catch (error) {
    console.warn('[Auth Node] Sign out error:', error);
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized.');
  }
  dispatchAuthLoading(true);
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Document creation removed per Phase 5B rules
    const finalDoc = await firestore.users.getById(user.uid);
    return { ...finalDoc, uid: user.uid };
  } catch (error: any) {
    const errorMsg = error?.message 
      ? `Password or Email Incorrect (${error.message})`
      : 'Password or Email Incorrect';
    console.error('Sign in error:', error);
    throw new Error(errorMsg);
  } finally {
    dispatchAuthLoading(false);
  }
};

export const signUpWithEmail = async (email: string, password: string) => {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized.');
  }
  dispatchAuthLoading(true);
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // firestore users write removed per Phase 5B rules
    return { uid: user.uid, email: user.email };
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
      const errorMsg = 'User already exists. Sign in?';
      console.error(errorMsg, error);
      throw new Error(errorMsg);
    }
    const errorMsg = error?.message || 'Sign up error occured.';
    console.error('Sign up error:', error);
    throw new Error(errorMsg);
  } finally {
    dispatchAuthLoading(false);
  }
};

export const resetPassword = async (email: string) => {
  if (!auth) {
    throw new Error('Firebase Auth is not initialized.');
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    console.error('Password reset error', error);
    throw error;
  }
};