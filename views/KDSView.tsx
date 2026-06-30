
import React, { useEffect, useRef, useState } from 'react';
import { Order, OrderStatus, Role, Permission } from '../types';

interface KDSViewProps {
    orders: Order[];
    updateOrderStatus: (id: string, s: OrderStatus) => void;
    userRole: Role | string;
    hasPermission: (p: Permission) => boolean;
}

const KDSStatusBadge = ({ status }: { status: OrderStatus }) => {
  const configs: Record<string, { label: string, color: string, icon: string, iconAnim?: string, dotAnim?: string }> = {
    [OrderStatus.PENDING]: { 
      label: 'Confirmed', 
      color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', 
      icon: 'fa-clock',
      dotAnim: 'bg-slate-400'
    },
    [OrderStatus.PREPARING]: { 
      label: 'Processing', 
      color: 'bg-orange-500/20 text-orange-500 border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.15)]', 
      icon: 'fa-fire-flame-curved',
      iconAnim: 'animate-pulse',
      dotAnim: 'bg-orange-500 animate-ping'
    },
    [OrderStatus.READY]: { 
      label: 'Cleared', 
      color: 'bg-emerald-500 text-white border-emerald-600 shadow-glow', 
      icon: 'fa-check-double',
      iconAnim: 'animate-bounce',
      dotAnim: 'bg-white'
    }
  };
  
  const config = configs[status] || { label: status, color: 'bg-slate-500/10 text-slate-500 border-slate-500/20', icon: 'fa-circle', dotAnim: 'bg-current' };
  
  return (
    <span className={`px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] border flex items-center gap-3 transition-all duration-500 ${config.color}`}>
      <div className={`w-2 h-2 rounded-full ${config.dotAnim}`}></div>
      <i className={`fas ${config.icon} text-[10px] ${config.iconAnim || ''}`}></i>
      {config.label}
    </span>
  );
};

const KDSView: React.FC<KDSViewProps> = ({ orders, updateOrderStatus, userRole, hasPermission }) => {
  const [showToast, setShowToast] = useState(false);
  const [now, setNow] = useState(Date.now());
  const prevConfirmedIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const canPrepare = hasPermission(Permission.PREPARE_ORDERS);

  const activeOrders = orders.filter(o => 
    o.status === OrderStatus.PENDING || 
    o.status === OrderStatus.PREPARING ||
    o.status === OrderStatus.READY
  );

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
    audioRef.current.volume = 0.15;
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const currentConfirmedIds = orders.filter(o => o.status === OrderStatus.PENDING).map(o => o.id);
    const newOrderIds = currentConfirmedIds.filter(id => !prevConfirmedIds.current.has(id));
    
    if (newOrderIds.length > 0 && prevConfirmedIds.current.size > 0) {
        setShowToast(true);
        if (audioRef.current) audioRef.current.play().catch(() => {});
        setTimeout(() => setShowToast(false), 6000);
    }
    prevConfirmedIds.current = new Set(currentConfirmedIds);
  }, [orders]);

  const sortedOrders = [...activeOrders].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="h-full bg-slate-950 flex flex-col overflow-hidden relative">
       <div className={`fixed top-20 md:top-8 left-1/2 -translate-x-1/2 z-[500] transition-all duration-700 ease-out transform ${
         showToast ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-32 opacity-0 scale-90'
       } w-[90%] md:w-auto`}>
         <div className="bg-brand-600/90 backdrop-blur-2xl text-white px-8 md:px-10 py-5 md:py-6 rounded-[2.5rem] md:rounded-[3rem] shadow-[0_30px_60px_-15px_rgba(99,102,241,0.5)] flex items-center space-x-6 md:space-x-8 border border-white/20">
            <div className="w-10 h-10 md:w-14 md:h-14 bg-white/20 rounded-2xl md:rounded-3xl flex items-center justify-center animate-bounce shadow-inner">
              <i className="fas fa-fire-flame-curved text-sm md:text-xl"></i>
            </div>
            <div>
                <p className="font-black text-xl md:text-2xl tracking-tighter uppercase leading-none">New Signal</p>
                <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] text-brand-200 mt-2">Initialize Prep Protocol</p>
            </div>
         </div>
       </div>

       <header className="px-6 md:px-12 py-6 md:py-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-8 shrink-0">
            <div>
              <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter flex items-center leading-none uppercase italic">
                Culinary Console
                <span className="ml-4 md:ml-8 px-3 py-1.5 md:px-5 md:py-2 bg-emerald-500 text-[8px] md:text-[10px] rounded-full font-black uppercase tracking-widest shadow-glow text-white animate-pulse hidden sm:inline-block">Real-time Stream</span>
              </h2>
              <p className="text-slate-500 font-black mt-2 md:mt-4 uppercase tracking-[0.4em] text-[8px] md:text-xs">Uplink active • {activeOrders.filter(o => o.status !== OrderStatus.READY).length} Processing</p>
            </div>
       </header>

       <div className="flex-1 overflow-x-auto no-scrollbar flex space-x-4 md:space-x-10 px-6 md:px-12 pb-16 snap-x snap-mandatory">
            {activeOrders.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-800 border-4 border-dashed border-white/5 rounded-[3rem] md:rounded-[5rem] animate-in fade-in duration-1000 m-4">
                     <i className="fas fa-layer-group text-6xl md:text-8xl opacity-10 mb-6 md:mb-10"></i>
                     <p className="text-xl md:text-3xl font-black uppercase tracking-[0.5em] opacity-10 text-center px-4">Buffer Empty</p>
                </div>
            ) : sortedOrders.map(order => {
                const elapsedMins = Math.floor((now - order.timestamp) / 60000);
                const progress = Math.min(100, (elapsedMins / 20) * 100);
                const isLate = elapsedMins >= 15 && order.status !== OrderStatus.READY;
                const isCritical = elapsedMins >= 25 && order.status !== OrderStatus.READY;
                
                let borderClass = 'border-transparent';
                let progressColor = 'bg-brand-500';
                
                if (isCritical) {
                    borderClass = 'border-rose-600 shadow-[0_0_80px_rgba(225,29,72,0.4)]';
                    progressColor = 'bg-rose-600';
                } else if (isLate) {
                    borderClass = 'border-rose-500/50';
                    progressColor = 'bg-rose-500';
                }

                return (
                    <div 
                      key={order.id} 
                      className={`bg-white rounded-[3rem] md:rounded-[4rem] shadow-2xl flex flex-col w-[85vw] md:w-[480px] shrink-0 h-full transition-all duration-700 border-4 ${borderClass} relative overflow-hidden snap-center group`}
                    >
                        <div className="absolute top-0 left-0 right-0 h-1.5 md:h-2 bg-slate-100">
                            <div 
                                className={`h-full transition-all duration-1000 ${progressColor} ${isCritical ? 'animate-pulse' : ''}`}
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>

                        <div className={`p-6 md:p-10 border-b flex justify-between items-start pt-10 md:pt-12 ${isLate ? 'bg-rose-50' : 'bg-slate-50'}`}>
                            <div className="flex flex-col gap-4 md:gap-6">
                                <div className="flex items-center gap-4 md:gap-6">
                                    <div className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[2rem] flex items-center justify-center text-white text-lg md:text-2xl shadow-xl shrink-0 ${order.guestColor || 'bg-slate-900'}`}>
                                      <i className={`fas ${order.guestAvatar || 'fa-user'}`}></i>
                                    </div>
                                    <div>
                                        <h3 className="font-black text-2xl md:text-4xl tracking-tighter leading-none mb-1 md:mb-2 uppercase">#{order.id.slice(-4)}</h3>
                                        <p className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                                          {order.tableId ? `STATION ${order.tableId}` : 'EXPRESS'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex">
                                    <KDSStatusBadge status={order.status} />
                                </div>
                            </div>
                            <div className="text-right">
                              <span className={`text-2xl md:text-4xl font-black italic tracking-tighter ${isLate ? 'text-rose-600' : 'text-slate-900'}`}>
                                {elapsedMins}<span className="text-sm md:text-lg ml-1 opacity-30">m</span>
                              </span>
                            </div>
                        </div>
                        
                        <div className="p-6 md:p-10 flex-1 overflow-y-auto space-y-4 md:space-y-6 custom-scrollbar bg-white">
                            {order.items.map((item, idx) => (
                                <div key={idx} className="bg-slate-50 p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] border border-slate-100 flex items-start gap-4 md:gap-6 group hover:bg-slate-100 transition-colors">
                                    <span className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-slate-950 text-white rounded-[1rem] md:rounded-[1.2rem] text-lg md:text-xl font-black shrink-0 shadow-lg">
                                      {item.quantity}
                                    </span>
                                    <div className="flex-1">
                                        <p className="font-black text-slate-900 text-lg md:text-xl leading-tight uppercase tracking-tight">{item.name}</p>
                                        {item.notes && (
                                          <div className="mt-3 md:mt-4 p-3 md:p-4 bg-amber-50 rounded-xl md:rounded-2xl border border-amber-100/50">
                                            <p className="text-[8px] md:text-[10px] text-amber-700 font-black uppercase tracking-widest italic flex items-center gap-2 md:gap-3">
                                              <i className="fas fa-circle-exclamation text-[6px] md:text-[8px] animate-pulse"></i>
                                              {item.notes}
                                            </p>
                                          </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-6 md:p-10 bg-white mt-auto">
                            {order.status === OrderStatus.PENDING && (
                              <button 
                                disabled={!canPrepare}
                                className={`w-full h-16 md:h-20 bg-slate-950 text-white rounded-[2rem] md:rounded-[2.5rem] text-[9px] md:text-[11px] font-black uppercase tracking-[0.4em] shadow-xl hover:bg-brand-600 hover:shadow-glow active:scale-95 transition-all ${!canPrepare ? 'opacity-30 cursor-not-allowed' : ''}`} 
                                onClick={() => updateOrderStatus(order.id, OrderStatus.PREPARING)}
                              >
                                Initialize Prep
                              </button>
                            )}
                            {order.status === OrderStatus.PREPARING && (
                              <button 
                                disabled={!canPrepare}
                                className={`w-full h-16 md:h-20 text-white rounded-[2rem] md:rounded-[2.5rem] text-[9px] md:text-[11px] font-black uppercase tracking-[0.4em] shadow-glow transition-all active:scale-95 ${!canPrepare ? 'opacity-30 cursor-not-allowed' : (isLate ? 'bg-rose-600 animate-pulse' : 'bg-brand-600')}`} 
                                onClick={() => updateOrderStatus(order.id, OrderStatus.READY)}
                              >
                                {isLate ? 'CRITICAL CLEAR' : 'MARK READY'}
                              </button>
                            )}
                            {order.status === OrderStatus.READY && (
                              <div className="w-full h-16 md:h-20 bg-emerald-50 text-emerald-600 rounded-[2rem] md:rounded-[2.5rem] text-[9px] md:text-[10px] font-black uppercase tracking-[0.4em] border border-emerald-100 flex items-center justify-center">
                                Station Ready
                              </div>
                            )}
                        </div>
                    </div>
                );
            })}
       </div>
    </div>
  );
};

export default KDSView;
