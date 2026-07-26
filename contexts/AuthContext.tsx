import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import {
  onIdTokenChanged,
  User as FirebaseUser,
  signOut,
} from 'firebase/auth';
import { firestore } from '../services/firestoreService';
import { UserProfile, Role, UserStatus } from '../types';
import { logoutUser } from '../utils/auth';
import { resolveOrganizationIdForHydration, resolveRoleForHydration } from '../utils/authHydration';

interface AuthError {
  type: 'auth' | 'profile' | 'organization' | 'role' | 'permission';
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

console.log('[IRSW Auth] Starting profile hydration', {
  action: 'auth-hydration-start',
  uid: firebaseUser.uid,
  claims,
});

console.log("[Hydration] Looking up user profile", {
  uid: firebaseUser.uid,
});

let userDocData = null;

try {
  userDocData = await firestore.users.getById(firebaseUser.uid);

  console.log("[Hydration] Repository returned:", userDocData);
} catch (err) {
  console.error("[Hydration] Repository threw:", err);

  setAuthError({
    type: 'profile',
    message: 'Unable to load user profile.',
  });

  setUser(null);
  setLoading(false);
  return;
}

if (!userDocData) {
  setAuthError({
    type: 'profile',
    message: 'User profile not found. Please contact an administrator.',
  });

  setUser(null);
  setLoading(false);
  return;
}

console.log('[IRSW Auth] Profile resolved', {
  action: 'auth-hydration-profile-resolved',
  uid: firebaseUser.uid,
  profile: userDocData,
});

// Continue with membership lookup...
let activeMemberships: any[] = [];

try {
  activeMemberships = await firestore.memberships.executeQuery({
    where: [
      {
        field: 'userId',
        operator: '==',
        value: firebaseUser.uid,
      },
      {
        field: 'status',
        operator: '==',
        value: 'ACTIVE',
      },
    ],
  });
} catch (err) {
  console.warn(
    '[IRSW Auth] Membership query failed during hydration',
    err
  );
}

console.log('[IRSW Auth] Membership resolution complete', {
  action: 'auth-hydration-memberships-resolved',
  uid: firebaseUser.uid,
  membershipCount: activeMemberships.length,
});

const data = userDocData as any;

let role: Role | null = resolveRoleForHydration(
  claims.role,
  data.role,
  activeMemberships.map((membership: any) => membership.role)
) as Role | null;

let displayName =
  firebaseUser.displayName ||
  firebaseUser.email?.split('@')[0] ||
  'User';

let organizationId: string | null =
  resolveOrganizationIdForHydration(
    claims.organizationId as string | undefined,
    data,
    activeMemberships
  );

let name = data.name || displayName;
displayName = data.displayName || name;
let phone = data.phone || '';
let photoFileName = data.photoFileName || '';
let status = data.status || UserStatus.ACTIVE;

// =====================================================
// PLATFORM ADMINISTRATORS
// System Admin / Super Admin do not require organization
// membership.
// =====================================================

const isPlatformAdmin =
  role === 'system_admin' ||
  role === 'super_admin';

if (!isPlatformAdmin && !organizationId) {
  if (activeMemberships.length === 0) {
    setAuthError({
      type: 'organization',
      message:
        'No active organization memberships found. Access denied.',
    });
    setUser(null);
    setLoading(false);
    return;
  }

  const uniqueOrganizations = [
    ...new Set(
      activeMemberships
        .map((membership: any) => membership.organizationId)
        .filter(Boolean)
    ),
  ];

  if (uniqueOrganizations.length > 1) {
    setAuthError({
      type: 'organization',
      message:
        'Multiple organizations found. Organization switcher not yet implemented.',
    });
    setUser(null);
    setLoading(false);
    return;
  }

  organizationId = uniqueOrganizations[0] || null;
}

console.log('[IRSW Auth] Organization resolved for hydration', {
  action: 'auth-hydration-organization-resolved',
  uid: firebaseUser.uid,
  organizationId,
  role,
});     
      // Look up tenant staff record to get the authoritative role and status
      try {
        const staffDocSnap = await firestore.staff.getById(organizationId as string, firebaseUser.uid);
        if (staffDocSnap) {
           console.log('StaffDoc:', staffDocSnap);
           const staffData = staffDocSnap as any;
           role = resolveRoleForHydration(
             claims.role,
             data.role,
             activeMemberships.map((membership: any) => membership.role),
             staffData.role
           ) as Role | null;
           status = staffData.status || status;
           name = staffData.displayName || staffData.firstName || name;
        }
               if (
                    status === UserStatus.SUSPENDED ||
                    status === UserStatus.INACTIVE
                ) {
                    console.warn('[IRSW Auth] Staff account blocked', {
                        uid: firebaseUser.uid,
                        organizationId,
                        status,
                    });

                    await signOut(auth);

                    setAuthError({
                        type: 'permission',
                        message:
                            'Your account has been suspended or deactivated. Please contact your administrator.',
                    });

                    setUser(null);
                    setLoading(false);
                    return;
                }
                } catch (e) {
            console.error('[IRSW Auth] Failed to fetch staff document', e);

            setAuthError({
              type: 'profile',
              message: 'Unable to verify your staff profile. Please try again.',
            });

            setUser(null);
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

      console.log('[IRSW Auth] Session hydrated', {
        action: 'auth-hydration-complete',
        uid: firebaseUser.uid,
        organizationId,
        role: role as Role,
      });
      setUser(sessionUser);
    } catch (error: any) {
      console.error("Error loading user profile:", error);
      const message = error?.code?.startsWith('auth/')
        ? 'Authentication failed. Please try again.'
        : 'Authorization failed. Please contact an administrator.';
      setAuthError({ type: error?.code?.startsWith('auth/') ? 'auth' : 'profile', message });
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
            organizationId: null,
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
