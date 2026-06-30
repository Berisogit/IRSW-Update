import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { RESTAURANT_NAME } from '../constants';
import { signInWithGoogle, signInWithEmail, resetPassword, signUpWithEmail } from '../services/authService';

const GUEST_AVATARS = [
  { icon: 'fa-cat', color: 'bg-indigo-500', name: 'Neko' },
  { icon: 'fa-dog', color: 'bg-emerald-500', name: 'Shiba' },
  { icon: 'fa-dragon', color: 'bg-rose-500', name: 'Draco' },
  { icon: 'fa-otter', color: 'bg-amber-500', name: 'Lutra' },
  { icon: 'fa-hippo', color: 'bg-violet-500', name: 'Hippo' },
  { icon: 'fa-fish', color: 'bg-sky-500', name: 'Mizu' },
];

export const LoginScreen: React.FC = () => {
  const [authPath, setAuthPath] = useState<'CHOICE' | 'GUEST' | 'STAFF_AUTH'>('CHOICE');
  const [staffMode, setStaffMode] = useState<'SIGN_IN' | 'SIGN_UP' | 'PENDING' | 'FORGOT_PASSWORD'>('SIGN_IN');

  // Guest state
  const [guestName, setGuestName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(GUEST_AVATARS[0]);

  // Staff state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setError(null);
    setIsLoading(false);
    if (staffMode !== 'FORGOT_PASSWORD') {
      setEmail('');
    }
    setPassword('');
  }, [authPath, staffMode]);

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (staffMode === 'SIGN_UP') {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      // Auth context will pick up the change
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await resetPassword(email);
      setResetSentTo(email);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset link.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await signInWithGoogle();
      // Auth context will pick up the change
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  const handleGuestLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setTimeout(() => {
      const newUrl = `${window.location.pathname}?view=CUSTOMER&guest=${encodeURIComponent(guestName)}`;
      window.history.pushState({path: newUrl}, '', newUrl);
      window.location.reload(); // Quick hack to trigger App.tsx URL parameter read
    }, 800);
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col p-4 md:p-8 bg-slate-950 overflow-x-hidden overflow-y-auto relative">
      {/* Background Decorative Elements */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] bg-brand-600/20 rounded-full blur-[120px] animate-pulse pointer-events-none"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse delay-700 pointer-events-none"></div>
      
      <div className="my-auto mx-auto w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-0 bg-white/5 backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-700">
        
        {/* Left Side: Branding & Info */}
        <div className="hidden lg:flex flex-col justify-between p-16 bg-gradient-to-br from-brand-600 to-indigo-900 text-white relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
          
          <div className="relative z-10">
            <div className="w-20 h-20 bg-white/20 rounded-3xl flex items-center justify-center mb-10 shadow-xl backdrop-blur-md ring-8 ring-white/5">
              <i className="fas fa-bolt-lightning text-3xl"></i>
            </div>
            <h1 className="text-6xl font-black tracking-tighter leading-none mb-6 uppercase italic">
              {RESTAURANT_NAME}
            </h1>
            <div className="h-1.5 w-24 bg-brand-400 rounded-full mb-8"></div>
            <p className="text-xl font-medium text-brand-100 leading-relaxed max-w-sm">
              The premier digital operating core for modern hospitality management.
            </p>
          </div>
          
          <div className="relative z-10 space-y-8">
            <div className="flex items-center gap-5 group">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all group-hover:scale-110">
                <i className="fas fa-microchip text-xl"></i>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white">AI Neural Engine</p>
                <p className="text-[10px] text-brand-300 font-bold uppercase mt-1 opacity-60">Real-time Optimization</p>
              </div>
            </div>
            <div className="flex items-center gap-5 group">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all group-hover:scale-110">
                <i className="fas fa-shield-halved text-xl"></i>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-white">RBAC Security</p>
                <p className="text-[10px] text-brand-300 font-bold uppercase mt-1 opacity-60">Claim-Based Authorization</p>
              </div>
            </div>
          </div>

          <p className="relative z-10 text-[11px] font-black uppercase tracking-[0.5em] text-white/30">
            System OS v5.3.2 • Secure Uplink Verified
          </p>
        </div>

        {/* Right Side: Auth Forms */}
        <div className="p-8 md:p-14 flex flex-col justify-center bg-slate-900/40 lg:bg-transparent min-h-[600px]">
          <div className="lg:hidden text-center mb-12">
             <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center text-white text-2xl mx-auto mb-4 shadow-glow">
                <i className="fas fa-bolt-lightning"></i>
             </div>
             <h1 className="text-4xl font-black text-white uppercase tracking-tighter italic mb-2">{RESTAURANT_NAME}</h1>
             <p className="text-[10px] font-black text-brand-400 uppercase tracking-widest opacity-60">Intelligent Gateway</p>
          </div>

          {authPath === 'CHOICE' && (
            <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-3">Welcome to Core</h2>
                <p className="text-slate-400 text-base font-medium">Select identity to initialize session.</p>
              </div>

              <div className="grid grid-cols-1 gap-5">
                <button 
                  onClick={() => setAuthPath('GUEST')}
                  className="group relative h-28 bg-brand-600 hover:bg-brand-500 rounded-[2.5rem] flex items-center justify-between px-10 transition-all duration-500 active:scale-95 shadow-[0_20px_40px_-10px_rgba(99,102,241,0.5)]"
                >
                   <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-white text-2xl group-hover:scale-110 transition-transform">
                         <i className="fas fa-utensils"></i>
                      </div>
                      <div className="text-left">
                         <span className="block text-white font-black uppercase text-xl leading-none tracking-tight">Dine-In Guest</span>
                         <span className="block text-brand-200 font-black uppercase text-[10px] tracking-widest mt-2 opacity-80">Explore & Order</span>
                      </div>
                   </div>
                   <i className="fas fa-arrow-right text-brand-300 group-hover:translate-x-3 transition-transform"></i>
                </button>

                <button 
                  onClick={() => { setAuthPath('STAFF_AUTH'); setStaffMode('SIGN_IN'); }}
                  className="group h-24 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[2rem] flex items-center justify-between px-10 transition-all active:scale-95"
                >
                   <div className="flex items-center gap-6 text-slate-400 group-hover:text-white transition-colors">
                      <i className="fas fa-id-card-clip text-2xl"></i>
                      <div className="text-left">
                         <span className="block font-black uppercase text-lg tracking-widest leading-none">Staff Console</span>
                         <span className="block font-black uppercase text-[9px] tracking-[0.2em] opacity-30 mt-2">Secured Node</span>
                      </div>
                   </div>
                   <i className="fas fa-lock text-slate-700 group-hover:text-slate-500 transition-colors"></i>
                </button>
              </div>

              <div className="pt-6 text-center border-t border-white/5">
                <p className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mb-4">New to Lumina Dining?</p>
                <p className="text-[10px] font-black text-brand-500 uppercase tracking-[0.2em]">
                  Contact Manager for Access
                </p>
              </div>
            </div>
          )}

          {authPath === 'GUEST' && (
            <form onSubmit={handleGuestLogin} className="space-y-10 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-5">
                <button type="button" onClick={() => setAuthPath('CHOICE')} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors border border-white/10">
                  <i className="fas fa-arrow-left"></i>
                </button>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">Guest Persona</h2>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-2">Alias Identifier</label>
                <input
                  required
                  autoFocus
                  placeholder="e.g. Cyber Penguin"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  className="w-full p-6 rounded-[2rem] bg-white/5 border-2 border-white/5 text-white font-black text-2xl focus:border-brand-500 focus:bg-white/10 outline-none transition-all placeholder:text-slate-800"
                />
              </div>

              <div className="space-y-5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-2 block text-center">Visual Proxy Identity</label>
                <div className="grid grid-cols-3 gap-4">
                  {GUEST_AVATARS.map((av, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedAvatar(av)}
                      className={`relative h-24 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all border-4 ${
                        selectedAvatar.icon === av.icon
                          ? `${av.color} text-white border-white/40 shadow-glow scale-105 z-10`
                          : 'bg-white/5 text-slate-500 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      <i className={`fas ${av.icon} text-3xl`}></i>
                      <span className="text-[9px] font-black uppercase tracking-widest">{av.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" isLoading={isLoading} className="w-full h-24 rounded-[2.5rem] text-lg font-black uppercase tracking-[0.2em] shadow-glow">
                Initialize Session
              </Button>
            </form>
          )}

          {authPath === 'STAFF_AUTH' && staffMode !== 'PENDING' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <button type="button" onClick={() => setAuthPath('CHOICE')} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors border border-white/10">
                    <i className="fas fa-arrow-left"></i>
                  </button>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">
                    Auth Console
                  </h2>
                </div>
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-2xl text-rose-500 text-[11px] font-black uppercase tracking-widest text-center animate-bounce-short">
                   <i className="fas fa-circle-exclamation mr-2"></i> {error}
                </div>
              )}

              {/* Google Sign-In Primary Action */}
              <div className="pb-4">
                <button 
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full h-18 md:h-20 bg-white text-slate-900 rounded-3xl flex items-center justify-center gap-4 font-black uppercase text-xs tracking-widest shadow-lg hover:shadow-xl active:scale-95 transition-all border border-slate-200"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
                  Continue with Google
                </button>
              </div>

              <div className="flex items-center gap-4 text-slate-800">
                <div className="h-px flex-1 bg-white/10"></div>
                <span className="text-[9px] font-black uppercase tracking-[0.4em]">Or Use Manual Protocol</span>
                <div className="h-px flex-1 bg-white/10"></div>
              </div>

              <form onSubmit={handleStaffSubmit} className="space-y-6">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-2">Secure Link (Email)</label>
                    <input
                      required
                      type="email"
                      placeholder="crew@luminadining.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full p-5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold outline-none focus:border-brand-500 transition-all focus:bg-white/10 placeholder:text-slate-700"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Passphrase</label>
                      <button type="button" onClick={() => setStaffMode('FORGOT_PASSWORD')} className="text-[10px] text-brand-500 font-bold uppercase tracking-widest hover:text-brand-400">
                        Forgot password?
                      </button>
                    </div>
                    <input
                      required
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full p-5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold outline-none focus:border-brand-500 transition-all focus:bg-white/10 placeholder:text-slate-700"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Button type="submit" isLoading={isLoading} className="w-full h-20 rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-glow">
                    {staffMode === 'SIGN_IN' ? 'Verify Authority' : 'Register Crew Account'}
                  </Button>
                </div>
              </form>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStaffMode(prev => prev === 'SIGN_IN' ? 'SIGN_UP' : 'SIGN_IN');
                    setError(null);
                  }}
                  className="text-[11px] text-brand-500 hover:text-brand-400 font-bold uppercase tracking-widest transition-colors"
                >
                  {staffMode === 'SIGN_IN' ? "Need a crew account? Register" : "Already registered? Sign In"}
                </button>
              </div>

              {staffMode === 'SIGN_IN' && (
                <p className="text-center text-[9px] text-slate-600 font-bold uppercase tracking-[0.3em] mt-6 opacity-60">
                  Approved credentials required for kernel access
                </p>
              )}
              {staffMode === 'SIGN_UP' && (
                <p className="text-center text-[9px] text-slate-600 font-bold uppercase tracking-[0.3em] mt-6 opacity-60">
                  Registering will initialize your crew profile and setup authorizations
                </p>
              )}
            </div>
          )}

          {staffMode === 'FORGOT_PASSWORD' && (
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <button type="button" onClick={() => { setStaffMode('SIGN_IN'); setResetSentTo(null); setError(null); }} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition-colors border border-white/10">
                    <i className="fas fa-arrow-left"></i>
                  </button>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">
                    Reset Password
                  </h2>
                </div>
              </div>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 p-5 rounded-2xl text-rose-500 text-[11px] font-black uppercase tracking-widest text-center">
                   <i className="fas fa-circle-exclamation mr-2"></i> {error}
                </div>
              )}

              {resetSentTo ? (
                <div className="text-center space-y-8 py-8 animate-in zoom-in-95 duration-500">
                  <div className="w-24 h-24 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center text-4xl mx-auto border border-emerald-500/20 shadow-glow">
                    <i className="fas fa-envelope-circle-check"></i>
                  </div>
                  <p className="text-brand-100 text-lg font-medium px-4">
                    We sent you a password change link to <strong>{resetSentTo}</strong>
                  </p>
                  <Button onClick={() => { setStaffMode('SIGN_IN'); setResetSentTo(null); }} className="w-full h-20 rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-glow mt-4">
                    Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handlePasswordReset} className="space-y-6">
                  <p className="text-slate-400 text-sm leading-relaxed mb-6">
                    Enter your secure uplink email address. We will transmit a reset token sequence to regain access.
                  </p>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] px-2">Secure Link (Email)</label>
                    <input
                      required
                      type="email"
                      placeholder="crew@luminadining.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full p-5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold outline-none focus:border-brand-500 transition-all focus:bg-white/10 placeholder:text-slate-700"
                    />
                  </div>
                  <div className="pt-4">
                    <Button type="submit" isLoading={isLoading} className="w-full h-20 rounded-[2rem] text-sm font-black uppercase tracking-[0.3em] shadow-glow">
                      Get Reset Link
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {staffMode === 'PENDING' && (
            <div className="text-center space-y-12 py-12 animate-in zoom-in-95 duration-500">
              <div className="w-32 h-32 bg-amber-500/20 text-amber-500 rounded-[3rem] flex items-center justify-center text-5xl mx-auto border border-amber-500/20 shadow-[0_0_50px_rgba(245,158,11,0.2)] animate-pulse">
                <i className="fas fa-hourglass-half"></i>
              </div>
              <div className="space-y-4">
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter italic">Handshake Pending</h3>
                <p className="text-slate-400 text-base font-medium leading-relaxed max-w-[280px] mx-auto opacity-80">
                  Your identity payload has been transmitted. A System Controller must verify your claims before activation.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setAuthPath('CHOICE')} className="w-full h-16 rounded-2xl font-black uppercase text-xs tracking-widest border-white/10 hover:bg-white/5">
                Return to Landing
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Persistent App Identifier */}
      <div className="fixed bottom-10 left-10 hidden md:flex items-center gap-4 opacity-20 pointer-events-none select-none group">
         <div className="w-12 h-12 rounded-xl border border-white/50 flex items-center justify-center text-white">
            <i className="fas fa-bolt-lightning text-xl group-hover:scale-110 transition-transform"></i>
         </div>
         <div>
            <p className="text-lg font-black text-white uppercase tracking-tighter leading-none italic">LUMINA</p>
            <p className="text-[9px] font-black text-brand-400 uppercase tracking-[0.3em] mt-1">Operating Core</p>
         </div>
      </div>

      <div className="fixed bottom-10 right-10 hidden md:block opacity-20 pointer-events-none select-none">
        <span className="text-[10px] font-black text-white uppercase tracking-[0.6em]">Powered by IRSW v5.3</span>
      </div>
    </div>
  );
};
