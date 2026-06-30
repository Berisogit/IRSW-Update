
import React from 'react';
import { Role, Permission, RoleDefinition } from '../types';
import { Button } from './Button';

interface RoleGuardProps {
  userRole: Role;
  requiredPermission?: Permission;
  roleDefinitions: RoleDefinition[];
  onReset: () => void;
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ 
  userRole, 
  requiredPermission, 
  roleDefinitions, 
  onReset,
  children 
}) => {
  const roleDef = roleDefinitions.find(r => r.id === userRole);
  
  if (!roleDef) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center p-8 text-center">
        <div className="max-w-md bg-white p-12 rounded-[3rem] shadow-premium border border-slate-100 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-[2rem] flex items-center justify-center text-3xl mx-auto mb-8">
            <i className="fas fa-user-secret"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-4">Authority Void</h2>
          <p className="text-slate-500 font-medium mb-10 leading-relaxed">
            Your current session has an undefined authority level. 
            Access is blocked for system safety.
          </p>
          <Button onClick={onReset} variant="danger" className="w-full h-16 rounded-2xl font-black uppercase text-xs tracking-widest">
            Reset Session
          </Button>
        </div>
      </div>
    );
  }

  if (requiredPermission && !roleDef.permissions.includes(requiredPermission)) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center p-8 text-center">
        <div className="max-w-md bg-white p-12 rounded-[3rem] shadow-premium border border-slate-100 animate-in fade-in zoom-in-95">
          <div className="w-24 h-24 bg-amber text-amber-500 rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-sm border border-amber-100">
            <i className="fas fa-shield-halved"></i>
          </div>
          
          <div className="space-y-4 mb-10">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter leading-none">Role mismatch detected</h2>
            <div className="space-y-2">
              <p className="text-slate-500 font-medium leading-relaxed">
                This session is locked to a single authority.<br/>
                Please reset your session to continue.
              </p>
              <p className="text-[10px] font-black text-brand-600 uppercase tracking-[0.2em] mt-4">
                Active Protocol: {roleDef.name}
              </p>
            </div>
          </div>

          <Button onClick={onReset} variant="danger" className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-glow">
            Reset Session
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
