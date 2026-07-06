import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import { onIdTokenChanged, User as FirebaseUser } from 'firebase/auth';
import { writeBatch, doc } from 'firebase/firestore';
import { firestore } from '../services/firestoreService';
import { UserProfile, Role, UserStatus } from '../types';
import { logoutUser } from '../utils/auth';

interface AuthError {
  type: 'auth' | 'profile' | 'organization' | 'role';
  message: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  authError: AuthError | null;
  logout: () => Promise<void>;
  updateUser: (data: Partial<UserProfile>) => void;
  retryInit: () => Promise<void>;
}

const globalContextKey = '__IRSW_AUTH_CONTEXT__';
let AuthContext: React.Context<AuthContextType | undefined>;
if (typeof window !== 'undefined' && (window as any)[globalContextKey]) {
  AuthContext = (window as any)[globalContextKey];
} else {
  AuthContext = createContext<AuthContextType | undefined>(undefined);
  if (typeof window !== 'undefined') {
    (window as any)[globalContextKey] = AuthContext;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<AuthError | null>(null);
  const [fireUser, setFireUser] = useState<FirebaseUser | null>(null);

  const initUser = async (firebaseUser: FirebaseUser) => {
    try {
      setAuthError(null);

      // AUTHORITY: Parse custom claims from the ID token (ADR-001 Identity & RBAC)
      const idTokenResult = await firebaseUser.getIdTokenResult();
      const claims = idTokenResult.claims;
      
      console.log('Firebase UID:', firebaseUser.uid, 'Claims detected:', claims);

      let userDocData = await firestore.users.getById(firebaseUser.uid);
      
      console.log('UserDoc:', userDocData);

      if (!userDocData && firebaseUser.email) {
          const matchedUsers = await firestore.users.executeQuery({
              where: [{ field: 'email', operator: '==', value: firebaseUser.email }]
          });
          if (matchedUsers.length > 0) {
              userDocData = matchedUsers[0];
          }
      }

      // Check for active memberships
      let activeMemberships: any[] = [];
      try {
        activeMemberships = await firestore.memberships.executeQuery({
          where: [
            { field: 'userId', operator: '==', value: firebaseUser.uid },
            { field: 'status', operator: '==', value: 'active' }
          ]
        });
      } catch (err) {
        console.warn('Membership query failed initially, will retry if auto-bootstrapped', err);
      }

      // Seamless Auto-Bootstrap Block to ensure local and live dev registration work nicely without missing users collection blockages
      if (!userDocData && db) {
        console.info('[Auth Context] No user document found. Performing sandbox/dev auto-onboarding...');
        try {
          const orgId = 'org_main';
          const uId = firebaseUser.uid;
          const uEmail = firebaseUser.email || '';
          const rawName = uEmail.split('@')[0] || 'Crew Member';
          const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

          const bootstrappedUser = {
            id: uId,
            email: uEmail,
            displayName: formattedName,
            name: formattedName,
            phone: '',
            role: 'owner' as Role,
            globalRole: 'USER' as const,
            status: UserStatus.ACTIVE,
            defaultOrganizationId: orgId,
            organizationId: orgId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const bootstrappedOrg = {
            name: 'Lumina Dining',
            status: 'active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const bootstrappedStaff = {
            uid: uId,
            firstName: formattedName.split(' ')[0],
            lastName: formattedName.split(' ').slice(1).join(' ') || 'Owner',
            displayName: formattedName,
            email: uEmail,
            phone: '',
            staffCode: `STF-${uId.slice(0, 5).toUpperCase()}`,
            role: 'owner' as Role,
            status: 'ACTIVE',
            organizationId: orgId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const bootstrappedMembership = {
            userId: uId,
            organizationId: orgId,
            role: 'owner' as Role,
            status: 'active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          const batch = writeBatch(db);
          batch.set(doc(db, 'users', uId), bootstrappedUser, { merge: true });
          batch.set(doc(db, 'organizations', orgId), bootstrappedOrg, { merge: true });
          batch.set(doc(db, 'organizations', orgId, 'staff', uId), bootstrappedStaff, { merge: true });
          batch.set(doc(db, 'memberships', `${orgId}_${uId}`), bootstrappedMembership, { merge: true });

          await batch.commit();
          console.info('[Auth Context] Auto-bootstrapping completed.');
          userDocData = bootstrappedUser;
        } catch (bootstrapErr) {
          console.error('[Auth Context] Auto-bootstrapping failed:', bootstrapErr);
        }
      }
      
      console.log('UserDoc (after membership query):', userDocData);

      let role: Role | null = (claims.role as string)?.toLowerCase() as Role || null;
      let displayName = firebaseUser.email?.split('@')[0] || 'User';
      let organizationId: string | null = (claims.organizationId as string) || null;
      let defaultOrganizationId = null;
      let name = displayName;
      let phone = '';
      let photoFileName = '';
      let status = UserStatus.ACTIVE;

      if (!userDocData) {
        setAuthError({ type: 'profile', message: 'User profile not found. Please contact an administrator.' });
        setLoading(false);
        return;
      }

      const data = userDocData as any;
      const actualUserId = data.id || firebaseUser.uid;
      
      // Hydrate missing authorization identifiers from Firestore if claims aren't set yet
      role = role || (data.role as string)?.toLowerCase() as Role || null;
      organizationId = organizationId || data.organizationId || null;

      name = data.name || name;
      displayName = data.displayName || name;
      defaultOrganizationId = data.defaultOrganizationId || null;
      phone = data.phone || phone;
      photoFileName = data.photoFileName || photoFileName;
      status = data.status || status;

      // 2. Load Organization Memberships & Explicit Resolution
      // Skip resolution if organization is already established via claims
      const memberships = organizationId ? [] : await firestore.memberships.executeQuery({
        where: [
          { field: 'userId', operator: '==', value: actualUserId },
          { field: 'status', operator: '==', value: 'active' }
        ]
      });

      if (memberships.length === 0 && !organizationId) {
        setAuthError({ type: 'organization', message: 'No active organization memberships found. Access denied.' });
        setLoading(false);
        return;
      }

      if (!organizationId) {
        let activeMembership = null;

        // Try defaultOrganizationId first
        if (defaultOrganizationId) {
          activeMembership = memberships.find((d: any) => d.organizationId === defaultOrganizationId);
        }

        // If not found or not valid, check if only one membership exists
        if (!activeMembership) {
          if (memberships.length === 1) {
            activeMembership = memberships[0];
          } else {
            setAuthError({ type: 'organization', message: 'Multiple organizations found. Organization switcher not yet implemented.' });
            setLoading(false);
            return;
          }
        }
        organizationId = (activeMembership as any).organizationId;
      }
      
      console.log('OrganizationId:', organizationId);
      
      // Look up tenant staff record to get the authoritative role and status
      try {
        const staffDocSnap = await firestore.staff.getById(organizationId as string, actualUserId);
        if (staffDocSnap) {
           console.log('StaffDoc:', staffDocSnap);
           const staffData = staffDocSnap as any;
           role = role || (staffData.role as string)?.toLowerCase() as Role || null;
           status = staffData.status || status;
           name = staffData.displayName || staffData.firstName || name;
        }
      } catch (e) {
        console.warn('Failed to fetch tenant staff document', e);
      }

      if (!role) {
        setAuthError({ type: 'role', message: 'No active roles assigned. Application access denied. Please contact an administrator.' });
        setLoading(false);
        return;
      }

      // 3 & 4. Hydrate session object
      const sessionUser: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || undefined,
        displayName,
        organizationId,
        role: role as Role,
        name,
        phone,
        photoFileName,
        status,
        sessionId: `SEC-${Date.now()}`
      };

      setUser(sessionUser);
    } catch (error: any) {
      console.error("Error loading user profile:", error);
      setAuthError({ type: 'profile', message: 'Internal system error during profile hydration. Please try again.' });
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      setFireUser(firebaseUser);
      if (firebaseUser) {
        setLoading(true);
        await initUser(firebaseUser);
      } else {
        // Handle Guest QR URL Params logic here if needed, or fallback to null
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('item') || urlParams.has('category') || urlParams.has('table') || urlParams.get('view') === 'CUSTOMER') {
          setUser({
            uid: 'guest_user',
            name: 'Guest Client (QR)',
            phone: '',
            role: 'guest',
            status: UserStatus.ACTIVE,
            guestAvatar: 'fa-cat',
            guestColor: 'bg-indigo-500',
            organizationId: 'org_main',
            sessionId: `GST-QR-${Date.now()}`
          } as UserProfile);
        } else {
          setUser(null);
        }
        setAuthError(null);
        setLoading(false);
      }
    });

    const handleAuthOp = (e: Event) => {
      const customEvent = e as CustomEvent<{ loading: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.loading === 'boolean') {
        console.log(`[Auth Context] Global loading state updated via custom auth listener: ${customEvent.detail.loading}`);
        setLoading(customEvent.detail.loading);
      }
    };

    window.addEventListener('firebase-auth-loading', handleAuthOp);

    return () => {
      unsubscribe();
      window.removeEventListener('firebase-auth-loading', handleAuthOp);
    };
  }, []);

  const logout = async () => {
    try {
      await logoutUser();
      setUser(null);
      setAuthError(null);
      setFireUser(null);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const updateUser = (data: Partial<UserProfile>) => {
    setUser(prev => prev ? { ...prev, ...data } : prev);
  };
  
  const retryInit = async () => {
    if (fireUser) {
      setLoading(true);
      await initUser(fireUser);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, logout, updateUser, retryInit }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
