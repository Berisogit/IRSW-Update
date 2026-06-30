
import React from 'react';
import { Role, Permission, RoleDefinition } from '../types';
import { isStaff } from '../roleUtils';
import { Button } from './Button';

interface StaffGuardProps {
  userRole: Role | null;
  requiredPermission?: Permission;
  roleDefinitions: RoleDefinition[];
  onUnauthorized: () => void;
  children: React.ReactNode;
}

/**
 * IRSW Security Node: Unified Staff Authority Guard
 */
export const StaffGuard: React.FC<StaffGuardProps> = ({ 
  userRole, 
  requiredPermission, 
  roleDefinitions, 
  onUnauthorized,
  children 
}) => {
  // 1. Connection State Validation
  if (!userRole) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center overflow-hidden selection:bg-brand-500/30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-600/10 via-transparent to-transparent animate-pulse pointer-events-none"></div>
        <div className="max-w-md bg-white/5 backdrop-blur-3xl p-12 rounded-[3.5rem] border border-white/10 shadow-2xl animate-in zoom-in-95 relative z-10">
          <div className="w-24 h-24 bg-brand-600 text-white rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-glow ring-[12px] ring-white/5 animate-float">
            <i className="fas fa-tower-broadcast"></i>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">Establishing Uplink</h2>
          <p className="text-slate-400 font-medium mb-12 leading-relaxed text-sm">
            Operational terminals require an active authority handshake. Please authenticate via the secure portal.
          </p>
          <Button onClick={onUnauthorized} className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-glow">
            Connect to Portal
          </Button>
        </div>
      </div>
    );
  }

  // 2. Persona Boundary Validation (Guest vs Staff)
  if (!isStaff(userRole)) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="max-w-md bg-white/5 backdrop-blur-3xl p-12 rounded-[3.5rem] border border-white/10 shadow-2xl animate-in zoom-in-95 relative z-10">
          <div className="w-24 h-24 bg-rose-500 text-white rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-glow ring-[12px] ring-white/5">
            <i className="fas fa-shield-slash"></i>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">Protocol Violation</h2>
          <p className="text-slate-400 font-medium mb-8 leading-relaxed text-sm">
            Unauthorized Persona detected. This operational node is strictly reserved for authenticated staff members.
          </p>
          <div className="bg-slate-900/80 p-6 rounded-3xl mb-12 border border-rose-500/20 shadow-inner">
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em] mb-2 leading-none">Security Alert</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
              Dine-In Guest session attempted privileged module access. Incident logged.
            </p>
          </div>
          <Button onClick={onUnauthorized} variant="danger" className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-glow">
            Reset Terminal State
          </Button>
        </div>
      </div>
    );
  }

  // 3. Claims Verification Node
  const roleDef = roleDefinitions.find(r => r.id === userRole);
  const hasClaim = requiredPermission ? roleDef?.permissions.includes(requiredPermission) : true;

  if (!hasClaim) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center p-8 text-center overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="max-w-md bg-white/5 backdrop-blur-3xl p-12 rounded-[3.5rem] border border-white/10 shadow-2xl animate-in zoom-in-95 relative z-10">
          <div className="w-24 h-24 bg-amber-500 text-white rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-glow ring-[12px] ring-white/5">
            <i className="fas fa-hand-holding-hand"></i>
          </div>
          <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">Insufficient Claims</h2>
          <p className="text-slate-400 font-medium mb-10 leading-relaxed text-sm">
            Your current staff profile does not possess the required digital claims for this specific terminal operation.
          </p>
          <div className="bg-slate-900/80 p-6 rounded-3xl mb-12 border border-white/5 shadow-inner flex flex-col items-center">
             <span className="text-[9px] font-black text-slate-600 uppercase tracking-[0.4em] mb-3">Enforced Protocol</span>
             <span className="text-[11px] font-black text-amber-500 uppercase tracking-[0.2em]">{roleDef?.name || 'Awaiting Recognition'}</span>
             {requiredPermission && (
               <div className="mt-4 pt-4 border-t border-white/5 w-full">
                  <span className="text-[8px] font-black text-slate-700 uppercase tracking-widest block mb-2">Missing Privilege</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight opacity-50">{requiredPermission.replace(/_/g, ' ')}</span>
               </div>
             )}
          </div>
          <div className="grid grid-cols-1 gap-4">
             <Button onClick={onUnauthorized} className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest bg-white/10 text-white hover:bg-white/20 transition-all active:scale-95">
               Switch Authority
             </Button>
             <button onClick={() => window.location.reload()} className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors">Emergency Clear</button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Claims Verified: Grant Terminal Access
  return <>{children}</>;
};
