
import React from 'react';
import { Role, UserProfile } from '../types';
import { Button } from './Button';
import { useRole } from '../hooks/useRole';

interface ProtectedRouteProps {
  user: UserProfile | null;
  allowedRoles: Role[];
  onUnauthorized: () => void;
  children: React.ReactNode;
}

/**
 * IRSW Security Node: Authoritative Protected Route
 * This component acts as the primary firewall for operational terminal views.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  user, 
  allowedRoles, 
  onUnauthorized,
  children 
}) => {
  const { isGuest, hasRole } = useRole(user?.role);

  // 1. Identity Verification (Authentication Check)
  if (!user) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-600/10 via-transparent to-transparent animate-pulse pointer-events-none"></div>
        <div className="max-w-md bg-white/5 backdrop-blur-3xl p-12 rounded-[4rem] border border-white/10 shadow-2xl animate-in zoom-in-95 relative z-10">
          <div className="w-24 h-24 bg-brand-600 text-white rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-glow ring-[12px] ring-white/5 animate-float">
            <i className="fas fa-tower-broadcast"></i>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">Identity Required</h2>
          <p className="text-slate-400 font-medium mb-12 leading-relaxed text-sm">
            Operational nodes require an active authority uplink. Please authenticate via the secure portal.
          </p>
          <Button onClick={onUnauthorized} className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-glow">
            Connect to Portal
          </Button>
        </div>
      </div>
    );
  }

  // 2. Persona Boundary (Guest vs Staff Isolation)
  if (isGuest) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="max-w-md bg-white/5 backdrop-blur-3xl p-12 rounded-[4rem] border border-white/10 shadow-2xl animate-in zoom-in-95 relative z-10">
          <div className="w-24 h-24 bg-rose-500 text-white rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-glow ring-[12px] ring-white/5">
            <i className="fas fa-shield-slash"></i>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">Protocol Error</h2>
          <p className="text-slate-400 font-medium mb-8 leading-relaxed text-sm">
            Unauthorized Persona detected. Operational modules are strictly reserved for authenticated staff members.
          </p>
          <div className="bg-slate-900/80 p-6 rounded-3xl mb-12 border border-rose-500/20 shadow-inner">
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] mb-2 leading-none">Security Alert</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
              Dine-In Guest session attempted privileged node access. Incident logged in audit trail.
            </p>
          </div>
          <Button onClick={onUnauthorized} variant="danger" className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-glow">
            Reset Session
          </Button>
        </div>
      </div>
    );
  }

  // 3. Claims Verification (Role-Based Access Check)
  const isAuthorized = hasRole(allowedRoles);

  if (!isAuthorized) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="max-w-md bg-white/5 backdrop-blur-3xl p-12 rounded-[4rem] border border-white/10 shadow-2xl animate-in zoom-in-95 relative z-10">
          <div className="w-24 h-24 bg-amber-500 text-white rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-glow ring-[12px] ring-white/5">
            <i className="fas fa-hand-holding-hand"></i>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">Access Denied</h2>
          <p className="text-slate-400 font-medium mb-10 leading-relaxed text-sm">
            Your staff account does not possess the digital claims required for this workflow node.
          </p>
          <div className="bg-slate-900/80 p-6 rounded-3xl mb-12 border border-white/5 shadow-inner flex flex-col items-center">
             <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em] mb-3">Active Authority</span>
             <span className="text-[11px] font-black text-amber-500 uppercase tracking-[0.2em]">{user.role.replace(/_/g, ' ')}</span>
          </div>
          <Button onClick={onUnauthorized} className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95">
             Switch Authority
          </Button>
        </div>
      </div>
    );
  }

  // 4. Verification Successful
  return <>{children}</>;
};
