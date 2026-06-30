
import React from 'react';
import { Button } from './Button';
import { logoutUser } from '../utils/auth';

interface InitializationBlockerProps {
  isSystemAdmin: boolean;
}

/**
 * IRSW Security Node: Initialization Interceptor
 * Prevents access to operational modules if the core system is not validated.
 */
export const InitializationBlocker: React.FC<InitializationBlockerProps> = ({ isSystemAdmin }) => {
  // If the user is a system admin, they might be seeing this because initialization failed 
  // or is in progress. We allow them to logout to try a different session.
  
  return (
    <div className="fixed inset-0 z-[3000] bg-slate-950 flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-brand-600/10 via-transparent to-transparent animate-pulse pointer-events-none"></div>
      
      <div className="max-w-lg w-full text-center bg-white/5 backdrop-blur-3xl p-12 rounded-[3.5rem] border border-white/10 shadow-2xl animate-in zoom-in-95 relative z-10">
        <div className="w-24 h-24 bg-brand-600 text-white rounded-[2.5rem] flex items-center justify-center text-4xl mx-auto mb-10 shadow-glow ring-[12px] ring-white/5 animate-float">
          <i className="fas fa-microchip"></i>
        </div>
        
        <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-4 leading-none">System Validation Required</h1>
        
        <p className="text-slate-400 font-medium mb-12 leading-relaxed text-sm">
          The Intelligent Operating System core has not been initialized. 
          Please contact the System Administrator to authorize the primary node configuration.
        </p>

        <div className="bg-slate-900/80 p-6 rounded-3xl mb-12 border border-brand-500/20 shadow-inner">
           <p className="text-[10px] font-black text-brand-400 uppercase tracking-[0.3em] mb-2 leading-none">Status Code</p>
           <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
             CORE_INIT_PENDING: Handshake refused by authority server.
           </p>
        </div>

        <Button onClick={() => logoutUser()} variant="danger" className="w-full h-18 rounded-[2rem] font-black uppercase text-xs tracking-widest shadow-glow">
          Terminate Uplink
        </Button>
      </div>
    </div>
  );
};
