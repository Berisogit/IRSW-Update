
import React, { useState, useCallback } from 'react';
import { Role, UserStatus, UserProfile, RoleDefinition } from '../types';
import { UserRole } from '../types/shared';
import { RESTAURANT_NAME } from '../constants';
import { Button } from '../components/Button';

interface AuthViewProps {
    onLogin: (profile: UserProfile) => void;
    onRegisterStaff?: (profile: UserProfile) => void;
    staffDirectory?: UserProfile[];
    roleDefinitions: RoleDefinition[];
}

const GUEST_AVATARS = [
  { icon: 'fa-cat', name: 'Cat' },
  { icon: 'fa-dog', name: 'Dog' },
  { icon: 'fa-fish', name: 'Fish' },
  { icon: 'fa-dragon', name: 'Dragon' },
  { icon: 'fa-otter', name: 'Otter' },
  { icon: 'fa-hippo', name: 'Hippo' },
  { icon: 'fa-pizza-slice', name: 'Pizza' },
  { icon: 'fa-ice-cream', name: 'Cream' },
];

const GUEST_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-sky-500',
];

const AuthView: React.FC<AuthViewProps> = ({ onLogin, onRegisterStaff, staffDirectory = [], roleDefinitions }) => {
    const [step, setStep] = useState<'LANDING' | 'STAFF_ROLE_SELECT' | 'STAFF_FORM' | 'GUEST_CUSTOMIZE' | 'STAFF_PENDING'>('LANDING');
    const [selectedRoleId, setSelectedRoleId] = useState<Role | null>(null);
    const [staffData, setStaffData] = useState({ name: '', phone: '' });
    const [error, setError] = useState<string | null>(null);
    
    const [guestData, setGuestData] = useState({
      name: '',
      avatar: GUEST_AVATARS[0].icon,
      color: GUEST_COLORS[0]
    });

    const handleRoleSelect = useCallback((roleId: Role) => {
        setSelectedRoleId(roleId);
        setStep('STAFF_FORM');
        setError(null);
    }, []);

    const handleStaffSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!selectedRoleId) return;

        if (staffData.phone === '000') {
           const adminAccount = staffDirectory.find(s => s.role?.toLowerCase() === UserRole.OWNER || s.role?.toLowerCase() === UserRole.SUPER_ADMIN);
           if (adminAccount) {
              onLogin(adminAccount);
              return;
           }
        }

        const existingAccount = staffDirectory.find(s => s.phone === staffData.phone);
        
        if (existingAccount) {
          try {
            onLogin(existingAccount);
          } catch (err: any) {
            setError(err.message);
          }
        } else {
          const staffCode = `STF-${Math.floor(100000 + Math.random() * 900000)}`;
          const newStaff: UserProfile = {
            name: staffData.name,
            phone: staffData.phone,
            staffCode,
            role: (selectedRoleId.toLowerCase() as Role),
            status: UserStatus.PENDING_APPROVAL
          };
          onRegisterStaff?.(newStaff);
          setStep('STAFF_PENDING');
        }
    };

    const handleGuestStart = (e: React.FormEvent) => {
      e.preventDefault();
      const sessionId = `GS-${Math.floor(1000 + Math.random() * 9000)}`;
      onLogin({
        name: guestData.name || `Guest ${sessionId}`,
        phone: '',
        sessionId,
        role: UserRole.GUEST,
        status: UserStatus.ACTIVE,
        guestAvatar: guestData.avatar,
        guestColor: guestData.color
      });
    };

    const staffRoles = roleDefinitions.filter(r => r.id?.toLowerCase() !== UserRole.GUEST).map(r => {
        let icon = 'fa-user-tie';
        let color = 'bg-slate-50 text-slate-600';
        const normalizedId = r.id?.toLowerCase();
        
        if (normalizedId === UserRole.OWNER || normalizedId === UserRole.SUPER_ADMIN) { icon = 'fa-user-shield'; color = 'bg-indigo-50 text-indigo-600'; }
        else if (normalizedId === UserRole.MANAGER) { icon = 'fa-user-gear'; color = 'bg-blue-50 text-blue-600'; }
        else if (normalizedId === UserRole.CASHIER) { icon = 'fa-cash-register'; color = 'bg-emerald-50 text-emerald-600'; }
        else if (normalizedId === UserRole.KITCHEN) { icon = 'fa-fire-burner'; color = 'bg-orange-50 text-orange-600'; }

        return { ...r, icon, color };
    });

    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-x-hidden overflow-y-auto pt-safe pb-safe scroll-smooth selection:bg-brand-500/30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-600/20 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse delay-700"></div>

        <div className="w-full max-w-2xl relative z-10 flex flex-col items-center py-6 md:py-12">
          <div className="text-center mb-8 md:mb-16">
            <div className="inline-flex items-center justify-center w-16 h-16 md:w-28 md:h-28 rounded-[1.8rem] md:rounded-[3rem] bg-gradient-to-br from-brand-500 to-indigo-700 text-white text-2xl md:text-5xl mb-6 shadow-glow ring-[10px] md:ring-[15px] ring-white/5 animate-float">
                <i className="fas fa-bolt-lightning"></i>
            </div>
            <h1 className="text-3xl md:text-6xl font-black text-white tracking-tighter mb-2 md:mb-5 uppercase leading-none">{RESTAURANT_NAME}</h1>
            <p className="text-slate-500 font-black tracking-[0.4em] uppercase text-[9px] md:text-xs opacity-70 leading-relaxed max-w-xs mx-auto">
              Intelligent Workflow Node
            </p>
          </div>

          <div className="w-full bg-white/5 backdrop-blur-3xl p-6 md:p-12 rounded-[2.5rem] md:rounded-[5rem] border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)]">
              {step === 'LANDING' ? (
                <div className="space-y-6 md:space-y-12">
                   <div className="text-center">
                      <h2 className="text-xl md:text-3xl font-black text-white mb-2 uppercase tracking-tight">Access Protocol</h2>
                      <p className="text-slate-500 text-[11px] md:text-base font-medium">Select your entry point to the system.</p>
                   </div>
                   <div className="grid grid-cols-1 gap-4 md:gap-8">
                      <button 
                        onClick={() => setStep('GUEST_CUSTOMIZE')}
                        className="group relative h-20 md:h-28 bg-brand-600 hover:bg-brand-500 rounded-2xl md:rounded-[2.5rem] flex items-center justify-between px-8 md:px-12 transition-all duration-500 active:scale-95 shadow-glow overflow-hidden"
                      >
                         <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                         <div className="flex items-center gap-5 md:gap-8">
                            <div className="w-11 h-11 md:w-16 md:h-16 bg-white/20 rounded-xl md:rounded-3xl flex items-center justify-center text-white text-xl md:text-3xl">
                               <i className="fas fa-utensils"></i>
                            </div>
                            <div className="text-left">
                               <span className="block text-white font-black uppercase text-base md:text-2xl leading-none tracking-tight">Start Dining</span>
                               <span className="block text-brand-200 font-black uppercase text-[8px] md:text-[11px] tracking-widest mt-2">New Guest Session</span>
                            </div>
                         </div>
                         <i className="fas fa-chevron-right text-brand-300 group-hover:translate-x-2 transition-transform text-xs md:text-lg"></i>
                      </button>

                      <button 
                        onClick={() => setStep('STAFF_ROLE_SELECT')}
                        className="group h-18 md:h-24 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl md:rounded-[2.5rem] flex items-center justify-between px-8 md:px-12 transition-all active:scale-95"
                      >
                         <div className="flex items-center gap-5 md:gap-8 text-slate-400 group-hover:text-slate-200">
                            <i className="fas fa-shield-halved text-lg md:text-2xl"></i>
                            <div className="text-left">
                               <span className="block font-black uppercase text-xs md:text-lg tracking-widest">Staff Portal</span>
                               <span className="block font-black uppercase text-[7px] md:text-[10px] tracking-[0.2em] opacity-40 mt-1">Secured Terminal Node</span>
                            </div>
                         </div>
                         <i className="fas fa-lock text-slate-700 group-hover:text-slate-500 text-xs md:text-base"></i>
                      </button>
                   </div>
                </div>
              ) : step === 'STAFF_ROLE_SELECT' ? (
                  <div className="space-y-6 md:space-y-10">
                      <div className="flex items-center gap-5 mb-6 md:mb-10">
                        <button onClick={() => setStep('LANDING')} className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-all active:bg-white/10"><i className="fas fa-arrow-left text-sm md:text-lg"></i></button>
                        <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-none">Choose Hub Role</h2>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-6 overflow-y-auto max-h-[55vh] no-scrollbar pr-1 pb-4">
                          {staffRoles.map(role => (
                            <button
                              key={role.id}
                              onClick={() => handleRoleSelect(role.id)}
                              className="group flex flex-col items-center justify-center p-6 md:p-10 bg-white/5 border border-white/5 rounded-2xl md:rounded-[3rem] hover:bg-white hover:scale-[1.02] active:scale-95 transition-all duration-300"
                            >
                                <div className={`w-12 h-12 md:w-20 md:h-20 rounded-xl md:rounded-3xl flex items-center justify-center text-xl md:text-3xl mb-4 transition-all duration-500 ${role.color} group-hover:scale-110 shadow-lg`}>
                                  <i className={`fas ${role.icon}`}></i>
                                </div>
                                <span className="font-black text-slate-400 group-hover:text-slate-900 transition-colors uppercase tracking-widest text-[8px] md:text-[11px] text-center">{role.name}</span>
                            </button>
                          ))}
                      </div>
                  </div>
              ) : step === 'STAFF_FORM' ? (
                  <form onSubmit={handleStaffSubmit} className="space-y-6 md:space-y-10">
                      <div className="flex items-center space-x-5 mb-6 md:mb-10">
                        <button type="button" onClick={() => setStep('STAFF_ROLE_SELECT')} className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors border border-white/10 active:scale-95">
                          <i className="fas fa-arrow-left text-sm md:text-lg"></i>
                        </button>
                        <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight">Credentials</h2>
                      </div>

                      {error && (
                        <div className="bg-rose-500/10 border border-rose-500/20 p-4 md:p-8 rounded-2xl md:rounded-[2.5rem] text-rose-500 text-[10px] md:text-sm font-black uppercase tracking-widest text-center animate-in slide-in-from-top-4 leading-relaxed">
                          {error}
                        </div>
                      )}

                      <div className="space-y-4 md:space-y-6">
                          <div className="group">
                              <label className="block text-[9px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 md:mb-4 px-2">Biological Identifier</label>
                              <div className="relative">
                                <i className="fas fa-user absolute left-5 md:left-7 top-1/2 -translate-y-1/2 text-slate-500 text-sm md:text-lg"></i>
                                <input required type="text" className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-3xl px-12 md:px-16 py-4 md:py-6 text-white outline-none transition-all font-bold text-sm md:text-lg placeholder:text-slate-700" placeholder="Legal Full Name" value={staffData.name} onChange={e => setStaffData({...staffData, name: e.target.value})} />
                              </div>
                          </div>
                          <div className="group">
                              <label className="block text-[9px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 md:mb-4 px-2">Terminal Access Hub</label>
                              <div className="relative">
                                <i className="fas fa-phone absolute left-5 md:left-7 top-1/2 -translate-y-1/2 text-slate-500 text-sm md:text-lg"></i>
                                <input required type="tel" className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-3xl px-12 md:px-16 py-4 md:py-6 text-white outline-none transition-all font-bold text-sm md:text-lg placeholder:text-slate-700" placeholder="Phone Signal ID" value={staffData.phone} onChange={e => setStaffData({...staffData, phone: e.target.value})} />
                              </div>
                              <p className="mt-2 text-[8px] md:text-[10px] text-slate-600 font-bold uppercase tracking-widest px-2">Root access phone ID: 000</p>
                          </div>
                      </div>
                      <div className="pt-4">
                          <Button type="submit" className="w-full h-16 md:h-24 rounded-2xl md:rounded-[3rem] text-xs md:text-xl font-black uppercase tracking-widest shadow-glow active:scale-95 transition-transform">
                              Establish Uplink
                          </Button>
                      </div>
                  </form>
              ) : step === 'STAFF_PENDING' ? (
                <div className="text-center space-y-6 md:space-y-10 py-6 md:py-16">
                    <div className="w-20 h-20 md:w-32 md:h-32 bg-amber-500/20 text-amber-500 rounded-2xl md:rounded-[3rem] flex items-center justify-center text-3xl md:text-6xl mx-auto border border-amber-500/20 shadow-lg animate-pulse">
                        <i className="fas fa-hourglass-half"></i>
                    </div>
                    <div className="max-w-xs mx-auto">
                        <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight mb-3 md:mb-5">Validation Node Active</h2>
                        <p className="text-slate-400 text-[11px] md:text-base font-medium leading-relaxed">
                            Terminal ID is being verified by Administrator. Full activation pending.
                        </p>
                    </div>
                    <Button onClick={() => setStep('LANDING')} variant="secondary" className="w-full h-14 md:h-20 rounded-2xl md:rounded-[2.5rem] font-black uppercase text-[10px] md:text-sm tracking-widest bg-white/5 border-white/10 text-slate-400 hover:text-white">
                        Return to Hub
                    </Button>
                </div>
              ) : (
                <form onSubmit={handleGuestStart} className="space-y-6 md:space-y-10">
                  <div className="flex items-center space-x-5 mb-4 md:mb-8">
                    <button type="button" onClick={() => setStep('LANDING')} className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors border border-white/10 active:scale-95">
                      <i className="fas fa-arrow-left text-sm md:text-lg"></i>
                    </button>
                    <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tight leading-none">Guest Persona</h2>
                  </div>

                  <div className="group text-center">
                      <label className="block text-[9px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2 md:mb-5 px-2">Digital Alias</label>
                      <input 
                          type="text" 
                          className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-[3rem] px-6 py-5 md:px-12 md:py-8 text-white text-center focus:bg-white/10 focus:ring-4 focus:ring-brand-500/20 outline-none transition-all font-black text-xl md:text-4xl tracking-tight appearance-none placeholder:text-slate-800"
                          placeholder="Cyber Penguin"
                          value={guestData.name}
                          onChange={e => setGuestData({...guestData, name: e.target.value})}
                      />
                  </div>

                  <div>
                    <label className="block text-[9px] md:text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-5 md:mb-8 px-2 text-center">Visual Proxy Identity</label>
                    <div className="grid grid-cols-4 gap-3 md:gap-6 max-h-[35vh] overflow-y-auto no-scrollbar pr-1 pb-4">
                      {GUEST_AVATARS.map(av => (
                        <button
                          key={av.icon}
                          type="button"
                          onClick={() => setGuestData({...guestData, avatar: av.icon})}
                          className={`w-full aspect-square rounded-xl md:rounded-[2rem] flex items-center justify-center text-xl md:text-4xl transition-all border-4 ${
                            guestData.avatar === av.icon 
                            ? 'bg-white text-slate-900 border-brand-500 shadow-glow scale-105' 
                            : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10'
                          }`}
                        >
                          <i className={`fas ${av.icon}`}></i>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                      <Button type="submit" className="w-full h-16 md:h-28 rounded-2xl md:rounded-[4rem] text-sm md:text-2xl font-black uppercase tracking-widest shadow-glow active:scale-95 transition-transform">
                          Initialize Session
                      </Button>
                  </div>
                </form>
              )}
          </div>
        </div>
      </div>
    );
};

export default AuthView;
