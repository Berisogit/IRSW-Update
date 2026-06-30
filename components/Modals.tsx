
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MenuItem, 
  MenuItemOption, 
  Order, 
  OrderStatus, 
  Role, 
  CartItem, 
  Table, 
  AuditLog, 
  UserStatus, 
  UserProfile, 
  RoleDefinition, 
  Task, 
  TaskStatus, 
  TaskPriority,
  PaymentStatus,
  TableStatus
} from '../types';
import { Button } from './Button';
import { askAssistant } from '../services/geminiService';
import { downloadInvoice } from '../services/invoiceService';
import { QRCodeSVG } from 'qrcode.react';

interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
    links?: { title: string, uri: string }[];
}

const HistoryStatusBadge = ({ status, paymentStatus }: { status: OrderStatus, paymentStatus: PaymentStatus }) => {
  if (status === OrderStatus.PAID || paymentStatus === PaymentStatus.PAID) {
    return <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase border border-emerald-500/20">Settled</span>;
  }
  if (status === OrderStatus.CANCELLED) {
    return <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 text-[8px] font-black uppercase border border-rose-500/20">Void</span>;
  }
  return <span className="px-2 py-0.5 rounded-md bg-brand-500/10 text-brand-500 text-[8px] font-black uppercase border border-brand-500/20">Processing</span>;
};

// =======================
// SYSTEM PROTOCOL: CONFIRMATION MODAL
// =======================
export const ConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string 
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 md:p-12 max-w-md w-full relative z-[1010] shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 text-center">
        <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-4">{title}</h3>
        <p className="text-slate-500 dark:text-slate-400 font-bold text-xs md:text-sm leading-relaxed mb-10">
          {message}
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="danger" className="w-full h-16 rounded-2xl font-black uppercase text-xs tracking-widest shadow-glow" onClick={onConfirm}>Confirm Action</Button>
          <Button variant="secondary" className="w-full h-12 rounded-xl font-black uppercase text-[10px] tracking-widest" onClick={onClose}>Abort</Button>
        </div>
      </div>
    </div>
  );
};

// =======================
// SYSTEM PROTOCOL: OPTION SELECTION MODAL
// =======================
export const OptionSelectionModal = ({ 
  isOpen, 
  onClose, 
  item, 
  onConfirm 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  item: MenuItem | null, 
  onConfirm: (item: MenuItem, options: MenuItemOption[], quantity: number, notes: string) => void 
}) => {
  const [selectedOptions, setSelectedOptions] = useState<MenuItemOption[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedOptions([]);
      setQuantity(1);
      setNote('');
    }
  }, [isOpen]);

  if (!isOpen || !item) return null;

  const toggleOption = (opt: MenuItemOption) => {
    setSelectedOptions(prev => 
      prev.find(o => o.name === opt.name) 
        ? prev.filter(o => o.name !== opt.name) 
        : [...prev, opt]
    );
  };

  const totalPrice = (item.price + selectedOptions.reduce((acc, o) => acc + o.priceModifier, 0)) * quantity;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-0 md:p-8">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl md:block hidden" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-900 md:rounded-[3rem] shadow-2xl w-full max-w-xl relative z-10 flex flex-col h-full md:h-auto md:max-h-[90vh] overflow-hidden animate-in md:zoom-in-95 slide-in-from-bottom-full md:slide-in-from-bottom-0 border border-white/10 dark:border-white/5">
        <header className="px-8 py-6 md:py-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0 pt-safe">
          <div>
            <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{item.name}</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configure Item Options</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 md:w-12 md:h-12 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
            <i className="fas fa-times text-slate-400"></i>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
          {item.options && item.options.length > 0 && (
            <div className="space-y-4">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Modifications</p>
              <div className="grid grid-cols-1 gap-2">
                {item.options.map((opt) => {
                  const isSelected = selectedOptions.find(o => o.name === opt.name);
                  return (
                    <button 
                      key={opt.name} 
                      onClick={() => toggleOption(opt)} 
                      className={`p-4 rounded-2xl border-2 flex justify-between items-center transition-all ${
                        isSelected 
                          ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-500 text-brand-700 dark:text-brand-400' 
                          : 'bg-white dark:bg-slate-800 border-slate-50 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <span className="font-black text-[11px] uppercase tracking-widest">{opt.name}</span>
                      <span className="font-black text-xs">+$${opt.priceModifier.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Quantity Allocation</p>
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-inner">
              <div className="flex items-center bg-white dark:bg-slate-800 rounded-2xl p-1 border border-slate-200 dark:border-slate-700 shadow-sm">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-brand-600 transition-colors"><i className="fas fa-minus"></i></button>
                <span className="w-12 text-center font-black text-xl text-slate-900 dark:text-white">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="w-12 h-12 flex items-center justify-center text-slate-400 hover:text-brand-600 transition-colors"><i className="fas fa-plus"></i></button>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Subtotal</p>
                <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter">${totalPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Operational Notes</p>
            <textarea 
              className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl p-4 md:p-6 font-bold text-sm outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all min-h-[100px] text-slate-900 dark:text-white" 
              placeholder="e.g. Allergies, preparation requests..." 
              value={note} 
              onChange={e => setNote(e.target.value)} 
            />
          </div>
        </div>

        <footer className="p-6 md:p-8 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 pb-safe">
          <Button className="w-full h-16 md:h-18 rounded-2xl md:rounded-[2rem] font-black uppercase text-xs md:text-sm tracking-widest shadow-glow active:scale-95 transition-all" onClick={() => onConfirm(item, selectedOptions, quantity, note)}>
            Commit to Basket
          </Button>
        </footer>
      </div>
    </div>
  );
};

// =======================
// SYSTEM PROTOCOL: TABLE SELECTION MODAL
// =======================
export const TableSelectionModal = ({ 
  isOpen, 
  onClose, 
  tables, 
  selectedTableId, 
  onSelectTable 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  tables: Table[], 
  selectedTableId: string | null, 
  onSelectTable: (id: string) => void 
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-4xl relative z-10 flex flex-col h-[80vh] overflow-hidden animate-in zoom-in-95 border border-white/10 dark:border-slate-800">
        <header className="px-10 py-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Station Topology</h3>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Select Terminal Anchor</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
            <i className="fas fa-times text-slate-400"></i>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-10 bg-slate-50 dark:bg-slate-950/50 custom-scrollbar">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {tables.map((t) => (
              <button 
                key={t.id} 
                onClick={() => onSelectTable(t.id)} 
                className={`p-8 rounded-[2rem] border-4 transition-all flex flex-col items-center justify-center gap-4 group ${
                  selectedTableId === t.id 
                    ? 'bg-brand-600 text-white border-brand-500 shadow-glow scale-105' 
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700 hover:border-brand-500/30'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl transition-transform group-hover:scale-110 ${
                  selectedTableId === t.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
                }`}>
                  <i className={`fas ${t.shape === 'CIRCLE' ? 'fa-circle' : t.shape === 'SQUARE' ? 'fa-square' : 'fa-rectangle-wide'}`}></i>
                </div>
                <div className="text-center">
                  <span className="block text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">STATION</span>
                  <span className="block text-3xl font-black tracking-tighter leading-none">{t.number}</span>
                  <span className="block text-[8px] font-black uppercase tracking-[0.2em] mt-3 opacity-40">CAP: {t.capacity}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// =======================
// SYSTEM PROTOCOL: RECEIPT MODAL
// =======================
export const ReceiptModal = ({ 
  isOpen, 
  onClose, 
  order 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  order: Order | null 
}) => {
  if (!isOpen || !order) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="bg-white rounded-[2.5rem] p-8 md:p-12 max-w-md w-full relative z-[1010] shadow-2xl animate-in zoom-in-95 overflow-y-auto max-h-[90vh] custom-scrollbar border border-slate-100">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-[1.8rem] flex items-center justify-center text-2xl mx-auto mb-6 border border-emerald-100 shadow-sm">
            <i className="fas fa-check-circle"></i>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tighter mb-1 italic">Transaction Finalized</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Signal Code: {order.id}</p>
        </div>
        <div className="space-y-6 mb-10">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start group">
              <div className="flex gap-4">
                <span className="font-black text-slate-400 text-xs">{item.quantity}x</span>
                <div>
                  <p className="font-black text-slate-900 uppercase text-xs tracking-tight">{item.name}</p>
                  {item.selectedOptions.map(o => <p key={o.name} className="text-[9px] text-slate-500 uppercase font-bold">+ {o.name}</p>)}
                </div>
              </div>
              <span className="font-black text-slate-900 text-xs">${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t-4 border-slate-50 pt-8 space-y-3 mb-10">
          <div className="flex justify-between text-[10px] font-black uppercase text-slate-400 tracking-widest">
            <span>Operational Subtotal</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-3xl font-black uppercase tracking-tighter text-slate-900 italic">
            <span>Total</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center mb-10 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-100 dark:border-slate-800">
          <div className="p-3 bg-white dark:bg-white rounded-2xl shadow-sm mb-4">
            <QRCodeSVG value={`${window.location.origin}/receipt?id=${order.id}`} size={120} level={"H"} />
          </div>
          <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center leading-relaxed">
            Scan to view digital receipt <br/> or provide feedback
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button className="w-full h-16 rounded-2xl font-black uppercase text-xs tracking-widest shadow-glow" onClick={() => downloadInvoice(order)}>Download Protocol PDF</Button>
          <button onClick={onClose} className="w-full py-4 text-[10px] font-black uppercase text-slate-400 tracking-[0.4em] hover:text-slate-600 transition-colors">Dismiss</button>
        </div>
      </div>
    </div>
  );
};

// =======================
// SYSTEM PROTOCOL: CUSTOMER HISTORY MODAL
// =======================
export const CustomerHistoryModal = ({ 
  isOpen, 
  onClose, 
  orders 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  orders: Order[] 
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-2xl relative z-10 flex flex-col h-[80vh] overflow-hidden animate-in zoom-in-95 border border-white/10 dark:border-slate-800">
        <header className="px-10 py-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Identity Log</h3>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Personnel Order History</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
            <i className="fas fa-times text-slate-400"></i>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-950/50">
          {orders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-10 py-20 text-center">
              <i className="fas fa-receipt text-8xl mb-8 dark:text-white"></i>
              <p className="text-lg font-black uppercase tracking-[0.5em] dark:text-white">Archive Void</p>
            </div>
          ) : [...orders].sort((a,b) => b.timestamp - a.timestamp).map((o) => (
            <div key={o.id} className="p-8 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex justify-between items-center hover:shadow-premium transition-all">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <p className="font-black text-lg text-slate-900 dark:text-white uppercase tracking-tighter leading-none">#{o.id.slice(-4)}</p>
                  <HistoryStatusBadge status={o.status} paymentStatus={o.paymentStatus} />
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-black tracking-widest">
                  {new Date(o.timestamp).toLocaleDateString()} • {new Date(o.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </p>
              </div>
              <div className="text-right">
                <p className="font-black text-2xl text-slate-900 dark:text-white tracking-tighter italic">${o.total.toFixed(2)}</p>
                <button 
                  onClick={() => downloadInvoice(o)} 
                  className="mt-3 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-[8px] font-black uppercase tracking-[0.3em] text-brand-600 dark:text-brand-400 rounded-xl hover:bg-brand-600 hover:text-white transition-all shadow-sm"
                >
                  Retrieve Invoice
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// =======================
// SYSTEM PROTOCOL: ORDER INSPECTOR MODAL
// =======================
export const OrderInspectorModal = ({ 
  isOpen, 
  onClose, 
  order 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  order: Order | null 
}) => {
  if (!isOpen || !order) return null;
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-2xl relative z-10 flex flex-col h-[80vh] overflow-hidden animate-in zoom-in-95 border border-white/10 dark:border-slate-800">
        <header className="px-10 py-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Order Insight</h3>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Cycle Forensic Analysis</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
            <i className="fas fa-times text-slate-400"></i>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-slate-50 dark:bg-slate-950/50">
          <div className="grid grid-cols-2 gap-6">
            <div className="p-8 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] mb-3">Protocol Status</p>
              <p className="font-black uppercase text-brand-600 dark:text-brand-400 tracking-tighter text-xl italic">{order.status}</p>
            </div>
            <div className="p-8 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] mb-3">Financial State</p>
              <p className="font-black uppercase text-brand-600 dark:text-brand-400 tracking-tighter text-xl italic">{order.paymentStatus}</p>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] px-4">Payload Manifest</p>
            {order.items.map((item, idx) => (
              <div key={idx} className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[2rem] flex justify-between items-center group transition-all hover:border-brand-500/30">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center font-black text-slate-500 text-xs">
                    {item.quantity}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-tight">{item.name}</p>
                    {item.notes && (
                      <div className="mt-2 flex items-center gap-2 text-[9px] text-amber-600 dark:text-amber-500 font-bold uppercase italic bg-amber-50 dark:bg-amber-900/10 px-3 py-1 rounded-lg border border-amber-100 dark:border-amber-900/20">
                        <i className="fas fa-sticky-note"></i> {item.notes}
                      </div>
                    )}
                  </div>
                </div>
                <span className="font-black text-slate-900 dark:text-white text-base tracking-tighter italic">${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <footer className="p-8 border-t dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-center px-4">
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Aggregated Total</span>
             <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter italic">${order.total.toFixed(2)}</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

// =======================
// SYSTEM PROTOCOL: CLEAR CART CONFIRMATION MODAL
// =======================
export const ClearCartConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  itemCount, 
  totalAmount 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  itemCount: number, 
  totalAmount: number 
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 max-w-md w-full relative z-[1010] shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 text-center">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-[1.8rem] md:rounded-[2.5rem] bg-rose-50 dark:bg-rose-900/20 text-rose-500 flex items-center justify-center text-2xl md:text-3xl mx-auto mb-6 md:mb-8 shadow-sm border border-rose-100 dark:border-rose-800">
          <i className="fas fa-trash-can"></i>
        </div>
        <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-3 md:mb-4">Purge Selection?</h3>
        <p className="text-slate-500 dark:text-slate-400 font-bold text-xs md:text-sm leading-relaxed mb-8 md:mb-10">
          You are about to clear {itemCount} items (valued at ${totalAmount.toFixed(2)}) from your basket. This action is irreversible.
        </p>
        <div className="flex flex-col gap-3 md:gap-4">
          <Button variant="danger" className="w-full h-16 md:h-18 rounded-xl md:rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest shadow-glow" onClick={onConfirm}>Confirm Purge</Button>
          <Button variant="secondary" className="w-full h-12 md:h-14 rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest" onClick={onClose}>Abort</Button>
        </div>
      </div>
    </div>
  );
};

export const TaskEditModal = ({ 
    isOpen, 
    onClose, 
    task, 
    staffDirectory, 
    onSave 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    task: Task | null, 
    staffDirectory: UserProfile[],
    onSave: (t: any) => void 
}) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
    const [status, setStatus] = useState<TaskStatus>(TaskStatus.PENDING);
    const [assignedStaff, setAssignedStaff] = useState<string>('');
    const [dueDate, setDueDate] = useState<string>('');

    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setDescription(task.description);
            setPriority(task.priority);
            setStatus(task.status);
            setAssignedStaff(task.assignedToCode || '');
            if (task.dueDate) {
                const date = new Date(task.dueDate);
                const offset = date.getTimezoneOffset();
                const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
                setDueDate(adjustedDate.toISOString().slice(0, 16));
            } else {
                setDueDate('');
            }
        } else {
            setTitle('');
            setDescription('');
            setPriority(TaskPriority.MEDIUM);
            setStatus(TaskStatus.PENDING);
            setAssignedStaff('');
            setDueDate('');
        }
    }, [task, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!title.trim()) return;
        const staff = staffDirectory.find(s => s.staffCode === assignedStaff);
        onSave({
            ...(task || {}),
            title,
            description,
            priority,
            status,
            assignedToCode: assignedStaff,
            assignedToName: staff?.name || '',
            dueDate: dueDate ? new Date(dueDate).getTime() : undefined
        });
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] shadow-2xl w-full max-w-2xl relative z-10 flex flex-col max-h-[95vh] overflow-hidden animate-in zoom-in-95 border border-white/10">
                <header className="px-6 md:px-10 py-6 md:py-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{task ? 'Refine Task' : 'Deploy Task'}</h3>
                        <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Operational protocol definition</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all">
                        <i className="fas fa-times"></i>
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 md:space-y-8 custom-scrollbar">
                    <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Task Descriptor</label>
                        <input 
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black uppercase text-xs md:text-sm outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all shadow-inner text-slate-900 dark:text-white"
                            placeholder="e.g. STERILIZE FRONT STATION"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Operational Detail</label>
                        <textarea 
                            className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 md:px-6 py-3 md:py-4 font-bold text-xs md:text-sm outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all min-h-[80px] md:min-h-[100px] text-slate-900 dark:text-white"
                            placeholder="Detailed SOP instructions..."
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                        <div className="space-y-2">
                            <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Priority Matrix</label>
                            <select 
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black uppercase text-[10px] md:text-xs outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all text-slate-900 dark:text-white"
                                value={priority}
                                onChange={e => setPriority(e.target.value as TaskPriority)}
                            >
                                {Object.values(TaskPriority).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Current Lifecycle</label>
                            <select 
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black uppercase text-[10px] md:text-xs outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all text-slate-900 dark:text-white"
                                value={status}
                                onChange={e => setStatus(e.target.value as TaskStatus)}
                            >
                                {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                        <div className="space-y-2">
                            <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Assigned Unit</label>
                            <select 
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black uppercase text-[10px] md:text-xs outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all text-slate-900 dark:text-white"
                                value={assignedStaff}
                                onChange={e => setAssignedStaff(e.target.value)}
                            >
                                <option value="">Awaiting Assignment</option>
                                {staffDirectory.map(s => <option key={s.staffCode} value={s.staffCode}>{s.name} ({s.role})</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] px-2">Deadline</label>
                            <input 
                                type="datetime-local"
                                className="w-full bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-100 dark:border-slate-800 rounded-2xl px-5 md:px-6 py-3 md:py-4 font-black uppercase text-[10px] md:text-xs outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all text-slate-900 dark:text-white"
                                value={dueDate}
                                onChange={e => setDueDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <footer className="p-6 md:p-8 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row gap-3 md:gap-4">
                    <Button variant="secondary" onClick={onClose} className="w-full md:flex-1 h-12 md:h-14 rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest">Abort</Button>
                    <Button onClick={handleSave} className="w-full md:flex-1 h-12 md:h-14 rounded-xl md:rounded-2xl shadow-glow font-black uppercase text-[9px] md:text-[10px] tracking-widest">Execute Task</Button>
                </footer>
            </div>
        </div>
    );
};

export const LogoutConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm,
  userRole,
  hasActiveOrders
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  userRole?: Role, 
  hasActiveOrders?: boolean
}) => {
  if (!isOpen) return null;

  const isGuest = userRole === 'guest';
  const title = isGuest ? (hasActiveOrders ? "Exit to Landing?" : "Reset Terminal?") : "Terminate Session?";
  const message = isGuest 
    ? (hasActiveOrders 
        ? "You have orders pending. The kitchen will continue processing, but this UI will reset. You can reconnect later using your name."
        : "This will clear your local guest session and return to the main entry point.")
    : "This will immediately revoke your operational authority and purge your local credentials.";

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md" onClick={onClose}></div>
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] md:rounded-[3rem] p-8 md:p-12 max-w-md w-full relative z-[1010] shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 text-center">
        <div className={`w-16 h-16 md:w-20 md:h-20 rounded-[1.8rem] md:rounded-[2.5rem] flex items-center justify-center text-2xl md:text-3xl mx-auto mb-6 md:mb-8 shadow-sm border ${isGuest ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 border-indigo-100 dark:border-indigo-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 border-rose-100 dark:border-rose-800'}`}>
          <i className={`fas ${isGuest ? 'fa-arrow-right-from-bracket' : 'fa-power-off'}`}></i>
        </div>
        <h3 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-3 md:mb-4">{title}</h3>
        <p className="text-slate-500 dark:text-slate-400 font-bold text-xs md:text-sm leading-relaxed mb-8 md:mb-10">
          {message}
        </p>
        <div className="flex flex-col gap-3 md:gap-4">
          <Button 
            variant={isGuest ? "primary" : "danger"} 
            className="w-full h-16 md:h-18 rounded-xl md:rounded-2xl font-black uppercase text-[10px] md:text-xs tracking-widest shadow-glow" 
            onClick={onConfirm}
          >
            {isGuest ? (hasActiveOrders ? "Exit Now" : "Reset Station") : "Confirm Sign Out"}
          </Button>
          <Button variant="secondary" className="w-full h-12 md:h-14 rounded-xl md:rounded-2xl font-black uppercase text-[9px] md:text-[10px] tracking-widest" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};

export const AssistantModal = ({ 
    isOpen, 
    onClose, 
    menuContext, 
    cartContext, 
    role, 
    auditContext = [] 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    menuContext: MenuItem[], 
    cartContext: CartItem[], 
    role: Role, 
    auditContext?: AuditLog[] 
}) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{ sender: 'ai', text: "Lumina Concierge active. How may I assist your operations today?" }]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const playConfirmationChime = () => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) return;
            const ctx = new AudioContextClass();
            
            const playTone = (freq: number, startTime: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.15, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                
                osc.start(startTime);
                osc.stop(startTime + duration);
            };
            
            const now = ctx.currentTime;
            playTone(523.25, now, 0.15); // C5
            playTone(659.25, now + 0.08, 0.25); // E5
        } catch (err) {
            console.error('Failed to play sound:', err);
        }
    };

    const triggerHapticFeedback = () => {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            try {
                navigator.vibrate(60);
            } catch (e) {
                console.warn('Haptic vibration failed or blocked:', e);
            }
        }
    };

    const handleSend = async (customQuery?: string) => {
        const queryToUse = customQuery !== undefined ? customQuery : input;
        if (!queryToUse.trim() || isLoading) return;
        const userQuery = queryToUse.trim();
        setInput('');
        setMessages(prev => [...prev, { sender: 'user', text: userQuery }]);
        setIsLoading(true);

        const response = await askAssistant(userQuery, menuContext, cartContext, role, undefined, auditContext);
        setMessages(prev => [...prev, { sender: 'ai', text: response.text, links: response.links }]);
        setIsLoading(false);
    };

    const handleVoiceInput = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in your browser.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = async (event: any) => {
            const transcript = event.results[0][0].transcript;
            setIsListening(false);
            if (transcript && transcript.trim()) {
                setInput(transcript.trim());
                playConfirmationChime();
                triggerHapticFeedback();
                await handleSend(transcript.trim());
            }
        };

        recognition.onerror = (event: any) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-0 md:p-8">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl md:block hidden" onClick={onClose}></div>
            <div className="bg-white dark:bg-slate-900 md:rounded-[4rem] shadow-2xl w-full max-w-2xl relative z-10 flex flex-col h-full md:h-[80vh] overflow-hidden animate-in md:zoom-in-95 slide-in-from-bottom-full md:slide-in-from-bottom-0 border border-white/10 dark:border-white/5">
                <header className="px-6 md:px-12 py-6 md:py-10 border-b dark:border-slate-800 bg-slate-950 text-white flex justify-between items-center shrink-0 pt-safe">
                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="w-10 h-10 md:w-16 md:h-16 bg-brand-600 rounded-xl md:rounded-[2rem] flex items-center justify-center shadow-glow animate-pulse shrink-0">
                            <i className="fas fa-wand-magic-sparkles text-lg md:text-2xl"></i>
                        </div>
                        <div>
                            <h3 className="text-lg md:text-3xl font-black uppercase tracking-tighter leading-none">Concierge</h3>
                            <p className="text-[7px] md:text-[10px] font-black text-brand-400 uppercase tracking-[0.4em] mt-1 md:mt-2">Neural Node v2.5</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl hover:bg-white/10 flex items-center justify-center transition-colors">
                        <i className="fas fa-times text-base md:text-lg"></i>
                    </button>
                </header>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 md:p-12 space-y-6 md:space-y-8 custom-scrollbar bg-slate-50 dark:bg-slate-950/50">
                    {messages.map((m, idx) => (
                        <div key={idx} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                            <div className={`max-w-[90%] md:max-w-[85%] p-4 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border ${
                                m.sender === 'user' 
                                ? 'bg-brand-600 text-white border-brand-500 rounded-tr-none' 
                                : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-slate-100 dark:border-slate-700 rounded-tl-none'
                            }`}>
                                <p className="text-xs md:text-sm font-bold leading-relaxed">{m.text}</p>
                                {m.links && m.links.length > 0 && (
                                    <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-current/10 space-y-2 md:space-y-3">
                                        <p className="text-[7px] md:text-[9px] font-black uppercase tracking-widest opacity-60">Sources Found:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {m.links.map((link, lIdx) => (
                                                <a key={lIdx} href={link.uri} target="_blank" rel="noopener noreferrer" className={`px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest border transition-all ${
                                                    m.sender === 'user' ? 'bg-white/10 border-white/20 hover:bg-white/20' : 'bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 text-brand-600 dark:text-brand-400'
                                                }`}>
                                                    <i className="fas fa-link mr-2"></i>{link.title}
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 md:p-6 rounded-[1.5rem] rounded-tl-none flex items-center gap-3 md:gap-4">
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce"></div>
                                    <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce delay-100"></div>
                                    <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce delay-200"></div>
                                </div>
                                <span className="text-[8px] md:text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Thinking...</span>
                            </div>
                        </div>
                    )}
                </div>
                <footer className="p-5 md:p-10 border-t dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 pb-safe">
                    <div className="relative group">
                        <input 
                            className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-[1.8rem] md:rounded-[2.5rem] px-6 md:px-10 py-4 md:py-6 font-bold text-sm md:text-base outline-none focus:bg-white dark:focus:bg-slate-700 focus:border-brand-500 transition-all pr-[7.5rem] md:pr-[10rem] shadow-inner text-slate-900 dark:text-white"
                            placeholder={isListening ? "Listening..." : "Type query..."}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                        />
                        <button 
                            type="button"
                            onClick={handleVoiceInput}
                            className={`absolute right-[3.75rem] md:right-[5.25rem] top-1/2 -translate-y-1/2 w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[2rem] flex items-center justify-center hover:scale-105 active:scale-90 transition-all ${
                                isListening 
                                ? 'bg-rose-600 text-white animate-pulse shadow-glow shadow-rose-500/50 animate-bounce' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                            title="Voice Input"
                        >
                            <i className={`fas ${isListening ? 'fa-microphone animate-pulse' : 'fa-microphone'} text-sm md:text-base`}></i>
                        </button>
                        <button 
                            disabled={!input.trim() || isLoading}
                            onClick={() => handleSend()}
                            className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 w-12 h-12 md:w-16 md:h-16 bg-brand-600 text-white rounded-2xl md:rounded-[2rem] shadow-glow flex items-center justify-center hover:scale-105 active:scale-90 transition-all disabled:opacity-20 disabled:scale-100"
                        >
                            <i className={`fas ${isLoading ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};
