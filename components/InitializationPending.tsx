import React from 'react'; 

export const InitializationPending = () => (
  <div className="fixed inset-0 bg-slate-950 flex items-center justify-center z-[3000]">
    <div className="max-w-md text-center text-white p-8 animate-in fade-in duration-700">
      <div className="w-20 h-20 bg-brand-600 rounded-[2rem] flex items-center justify-center text-3xl mx-auto mb-8 shadow-glow">
        <i className="fas fa-microchip"></i>
      </div>
      <h1 className="text-2xl font-bold uppercase tracking-tighter">
        System Initialization Pending
      </h1>
      <p className="mt-3 text-slate-300 font-medium">
        Core system configuration has not been completed.
        Please contact the System Administrator.
      </p>
    </div>
  </div>
);