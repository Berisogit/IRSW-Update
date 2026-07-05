
import React, { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { MenuItem, MenuCategory, CartItem, Order, OrderStatus, PaymentStatus, MenuItemStatus, Permission, TableStatus, Table } from '../types';
import { UserRole } from '../types/shared';
import { Button } from '../components/Button';
import { RESTAURANT_NAME } from '../constants';
import { ConfirmationModal } from '../components/Modals';
import { db } from '../services/databaseService';
import { initiateTelebirrPayment } from '../services/paymentService';
import { motion, AnimatePresence } from 'framer-motion';

const StatusBadge = ({ status }: { status: OrderStatus }) => {
  const config: Record<string, { label: string, color: string }> = {
    [OrderStatus.AWAITING_APPROVAL]: { label: 'Service Pending', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    [OrderStatus.PENDING]: { label: 'In Queue', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    [OrderStatus.PREPARING]: { label: 'In Lab', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    [OrderStatus.READY]: { label: 'Ready!', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 animate-pulse' },
    [OrderStatus.SERVED]: { label: 'Served', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    [OrderStatus.PAID]: { label: 'Closed', color: 'bg-emerald-500 text-white border-emerald-600' },
    [OrderStatus.CANCELLED]: { label: 'Rejected', color: 'bg-rose-100 text-rose-700 border-rose-200' },
    [OrderStatus.PAYMENT_SUBMITTED]: { label: 'Payment Sent', color: 'bg-indigo-50 text-indigo-600 border-indigo-200 animate-pulse' }
  };
  const { label, color } = config[status] || { label: status, color: 'bg-slate-100' };
  return <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${color}`}>{label}</span>;
};

const MenuItemCard = React.memo(({ 
  item, 
  onItemClick, 
  readOnly = false
}: { 
  item: MenuItem; 
  onItemClick: (item: MenuItem) => void;
  readOnly?: boolean;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const isAvailable = item.status === MenuItemStatus.AVAILABLE;
  const canInteract = isAvailable && !readOnly; 

  const originalPrice = item.price * 1.25; // Pre-discount calculation (25% markup)
  const savings = originalPrice - item.price;

  const handleFlip = (e: React.MouseEvent) => {
    setIsFlipped(!isFlipped);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering flip state
    if (canInteract) {
      onItemClick(item);
    }
  };

  return (
    <div 
      className="w-full h-80 sm:h-96 [perspective:1000px] select-none"
      onClick={handleFlip}
    >
      <motion.div 
        className="relative w-full h-full cursor-pointer"
        style={{
          transformStyle: 'preserve-3d',
        }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* CARD FRONT SIDE */}
        <div 
          className="absolute inset-0 w-full h-full rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-premium overflow-hidden bg-white dark:bg-slate-900 flex flex-col justify-end p-5 md:p-6"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        >
          {/* Cover Dish Image */}
          <div className="absolute inset-0 z-0">
            <img 
              src={item.image} 
              alt={item.name} 
              loading="lazy" 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" 
            />
            {/* Elegant Dark Gradiant Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent z-10" />
            <div className="absolute inset-0 bg-slate-950/15 z-10" />
          </div>

          {/* Front Content Overlay */}
          <div className="relative z-20 flex flex-col w-full">
            <div className="flex justify-between items-center mb-3">
              <span className="bg-white/20 backdrop-blur-md text-white/95 text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-lg border border-white/10">
                Tap to Flip
              </span>
              <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/10">
                <i className="fas fa-rotate text-[10px]"></i>
              </div>
            </div>

            <h3 className="font-sans font-black tracking-tight text-sm sm:text-lg text-white uppercase leading-snug line-clamp-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              {item.name}
            </h3>
            
            <div className="flex justify-between items-center mt-4 border-t border-white/10 pt-3">
              <div className="flex flex-col">
                <span className="text-[7px] sm:text-[9px] font-black text-brand-400 uppercase tracking-widest leading-none">
                  Lumina Cuisine
                </span>
                <span className="text-xs sm:text-sm font-black text-white font-mono mt-1.5 leading-none">
                  ${item.price.toFixed(2)}
                </span>
              </div>
              {!readOnly && isAvailable && (
                <button 
                  onClick={handleAddToCart}
                  className="bg-brand-500 hover:bg-brand-400 text-white text-[8px] sm:text-[9px] font-black uppercase tracking-[0.15em] px-3.5 py-2 rounded-xl border border-brand-400 shadow-glow active:scale-95 transition-all flex items-center gap-1.5 select-none"
                >
                  <i className="fas fa-plus text-[8px] sm:text-[9px]"></i>
                  Quick Add
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CARD BACK SIDE */}
        <div 
          className="absolute inset-0 w-full h-full rounded-[2rem] border border-white/10 shadow-glow overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 flex flex-col p-5 md:p-6 text-white"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {/* Subtle Radiant Material Accents */}
          <div className="absolute -top-12 -right-12 w-28 h-28 bg-brand-500/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Back Header */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">
              Overview Specification
            </span>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsFlipped(false); }}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 border border-white/5"
            >
              <i className="fas fa-rotate text-[9px]"></i>
            </button>
          </div>

          {/* Name */}
          <h4 className="font-sans font-black tracking-tight text-white uppercase text-xs sm:text-sm mb-2 truncate">
            {item.name}
          </h4>

          {/* High Bold Price + Discount Subtext Section */}
          <div className="mb-3.5 bg-white/5 border border-white/5 rounded-xl p-3 flex flex-col justify-center">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 leading-none">Price Standard</span>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-slate-500 line-through text-[9px] font-black">${originalPrice.toFixed(2)}</span>
                <span className="text-indigo-400 text-[8px] font-mono font-black tracking-wider bg-indigo-500/10 px-1 py-0.5 rounded border border-indigo-500/10">-20% PROMO</span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xl sm:text-3xl font-mono font-black text-amber-400 tracking-tighter leading-none">
                ${item.price.toFixed(2)}
              </span>
              <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/10">
                You save ${savings.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Availability Status */}
          <div className="mb-4">
            {isAvailable ? (
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                In Stock & Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-wider animate-pulse">
                <span className="w-1.5 h-1.5 bg-rose-400 rounded-full" />
                Temporarily Depleted
              </span>
            )}
          </div>

          {/* Description Material Gradient Layout */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950/20 to-slate-900 p-2.5 rounded-xl border border-white/5 grow overflow-y-auto no-scrollbar scroll-smooth">
            <p className="text-[8px] sm:text-[10px] text-slate-300 font-bold uppercase tracking-wide leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Add to Basket Action */}
          {!readOnly && (
            <button 
              onClick={handleAddToCart}
              disabled={!isAvailable}
              className={`w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                isAvailable 
                  ? 'bg-brand-500 border border-brand-400 hover:bg-brand-400 text-white shadow-glow active:scale-[0.97]' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
              }`}
            >
              {isAvailable ? (
                <>
                  <i className="fas fa-plus"></i>
                  Add to Cycle
                </>
              ) : (
                'Depleted'
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
});

const POSView: React.FC<any> = ({ 
  menu, categories, cart, onItemClick, removeFromCart, updateCartQuantity, submitOrder, onClearCart, onOpenAssistant, user, selectedTable, onOpenTableMap,
  pendingGuestOrders = [], onApproveGuestOrder, onRejectGuestOrder, customerActiveOrders = [], submittedPayments = [],
  onCashierConfirmPayment, onGuestSubmitPayment, readyOrders = [], onServeOrder, onOpenHistory, hasPermission, securityError, clearSecurityError,
  updateCartNote, onAddVoiceItems, onOpenScanner
}) => {
  const isGuestRole = user.role?.toLowerCase() === UserRole.GUEST;
  const canCommitOrder = db.canWriteOrders(user.role);
  
  const [guestViewMode, setGuestViewMode] = useState<'MENU' | 'BASKET' | 'ACTIVE'>('MENU');
  const [activeCat, setActiveCat] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const categoryParam = urlParams.get('category');
        if (categoryParam && categories && categories.length > 0) {
          const matchedCat = categories.find((c: any) => 
            c.id.toLowerCase() === categoryParam.toLowerCase() ||
            c.name.toLowerCase() === categoryParam.toLowerCase() ||
            c.name.toLowerCase().replace(/\s+/g, '_') === categoryParam.toLowerCase() ||
            c.name.toLowerCase().replace(/\s+/g, '-') === categoryParam.toLowerCase()
          );
          if (matchedCat) return matchedCat.id;
        }
      }
    } catch (e) {}
    return categories[0]?.id;
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('category')) {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, '', newUrl);
        }
      }
    } catch (e) {}
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  const handleVoiceOrder = () => {
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
      setIsProcessingVoice(true);
      
      try {
        const { parseVoiceOrder } = await import('../services/geminiService');
        const result = await parseVoiceOrder(transcript, menu);
        
        if (result && result.items && result.items.length > 0) {
          if (onAddVoiceItems) {
            onAddVoiceItems(result.items);
          }
        }
      } catch (error) {
        console.error('Voice processing error:', error);
      } finally {
        setIsProcessingVoice(false);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      setIsProcessingVoice(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredItems = useMemo(() => {
    let base = [...menu];
    if (isGuestRole) base = base.filter(m => m.status === MenuItemStatus.AVAILABLE && m.visible_to_guest);
    if (deferredSearchQuery) {
        const query = deferredSearchQuery.toLowerCase();
        base = base.filter((m: MenuItem) => m.name.toLowerCase().includes(query) || m.description.toLowerCase().includes(query));
    } else {
        base = base.filter((m: MenuItem) => m.categoryId === activeCat);
    }
    return base;
  }, [menu, activeCat, deferredSearchQuery, isGuestRole]);

  const cartTotal = useMemo(() => cart.reduce((a: any, b: any) => a + (b.price * b.quantity), 0), [cart]);
  const cartItemCount = useMemo(() => cart.reduce((a: any, b: any) => a + b.quantity, 0), [cart]);

  const basketSidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      <div className="p-6 md:p-8 border-b border-slate-100 dark:border-white/5 flex justify-between items-center shrink-0 pt-safe bg-slate-50/50 dark:bg-slate-950/50">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">{isGuestRole ? 'My Basket' : 'Station Node'}</h2>
          <div className="mt-1 md:mt-2 flex flex-col gap-1">
              {isGuestRole ? (
                <button onClick={onOpenScanner} className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-widest group">
                    <i className="fas fa-qrcode group-hover:scale-110 transition-transform"></i> {selectedTable ? `STATION ${selectedTable.number}` : 'Scan Table QR'}
                </button>
              ) : (
                <button onClick={onOpenTableMap} className="flex items-center gap-2 text-[9px] md:text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-widest group">
                    <i className="fas fa-location-dot group-hover:animate-bounce"></i> {selectedTable ? `STATION ${selectedTable.number}` : 'Link Terminal'}
                </button>
              )}
          </div>
        </div>
        <button onClick={() => setGuestViewMode('MENU')} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-xl md:rounded-2xl transition-all active:scale-90"><i className="fas fa-times text-base md:text-lg"></i></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-6 custom-scrollbar pb-32">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-10 py-10 md:py-20 text-center">
            <i className="fas fa-shopping-basket text-6xl md:text-8xl mb-6 md:mb-8 dark:text-white"></i>
            <p className="text-sm md:text-base font-black uppercase tracking-[0.4em] dark:text-white">Basket Empty</p>
          </div>
        ) : (
          <div className="space-y-4 md:space-y-6">
            <AnimatePresence initial={false}>
              {cart.map((item: CartItem) => (
                <motion.div 
                  key={item.cartId}
                  initial={{ opacity: 0, y: 20, scale: 0.95, height: 'auto' }}
                  animate={{ opacity: 1, y: 0, scale: 1, height: 'auto' }}
                  exit={{ 
                    opacity: 0, 
                    y: -20, 
                    scale: 0.95, 
                    height: 0, 
                    marginTop: 0, 
                    marginBottom: 0, 
                    paddingTop: 0, 
                    paddingBottom: 0, 
                    overflow: 'hidden',
                    transition: {
                      opacity: { duration: 0.15 },
                      height: { delay: 0.1, duration: 0.25 },
                      y: { duration: 0.2 }
                    }
                  }}
                  transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                  className="bg-white dark:bg-slate-800 rounded-2xl md:rounded-[2rem] p-4 md:p-5 border border-slate-100 dark:border-white/5 flex flex-col gap-3 md:gap-4 group transition-all hover:shadow-md"
                >
                  <div className="flex items-center gap-4 md:gap-5">
                    <img src={item.image} referrerPolicy="no-referrer" className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl object-cover shadow-sm" alt="" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-slate-900 dark:text-white truncate text-[10px] md:text-xs uppercase tracking-tighter mb-1 md:mb-2">{item.name}</h4>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center bg-slate-50 dark:bg-slate-900 rounded-lg md:rounded-xl p-0.5 md:p-1 border border-slate-200 dark:border-white/5">
                          <button onClick={() => item.quantity > 1 ? updateCartQuantity(item.cartId, item.quantity - 1) : removeFromCart(item.cartId)} className="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all"><i className={`fas ${item.quantity > 1 ? 'fa-minus' : 'fa-trash-can'} text-[8px] md:text-[10px]`}></i></button>
                          <span className="w-6 md:w-8 text-center text-xs md:text-sm font-black text-slate-900 dark:text-white">{item.quantity}</span>
                          <button onClick={() => updateCartQuantity(item.cartId, item.quantity + 1)} className="w-7 h-7 md:w-9 md:h-9 flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-all"><i className="fas fa-plus text-[8px] md:text-[10px]"></i></button>
                        </div>
                        <span className="font-black text-slate-900 dark:text-white text-sm md:text-base">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  {editingNoteId === item.cartId ? (
                    <textarea 
                      autoFocus
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl p-2 md:p-3 text-[9px] md:text-[10px] font-bold outline-none focus:border-brand-500 transition-all text-slate-900 dark:text-white"
                      placeholder="Operational notes..."
                      defaultValue={item.notes || ''}
                      onBlur={(e) => {
                          updateCartNote(item.cartId, e.target.value);
                          setEditingNoteId(null);
                      }}
                    />
                  ) : (
                    <div 
                      onClick={() => setEditingNoteId(item.cartId)}
                      className="px-3 py-2 md:px-4 md:py-2.5 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100/50 dark:border-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/20 cursor-text transition-colors"
                    >
                      <p className="text-[8px] md:text-[9px] text-amber-700 dark:text-amber-500 font-black uppercase tracking-tight italic flex items-center gap-2">
                        <i className="fas fa-sticky-note opacity-50"></i> 
                        {item.notes || 'Append special instruction...'}
                      </p>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      <div className="p-6 md:p-8 border-t border-slate-100 dark:border-white/5 space-y-4 md:space-y-6 bg-slate-50 dark:bg-slate-950 shadow-[0_-15px_30px_-10px_rgba(0,0,0,0.05)] shrink-0 pb-safe">
        <div className="flex justify-between items-end">
            <div><p className="text-[8px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Statement Total</p><span className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">${cartTotal.toFixed(2)}</span></div>
            {cart.length > 0 && <button onClick={onClearCart} className="text-[8px] md:text-[10px] font-black text-rose-500 uppercase tracking-widest px-3 py-1 md:px-4 md:py-2 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl">Clear All</button>}
        </div>
        <Button 
            className={`w-full h-16 md:h-18 rounded-2xl md:rounded-[2rem] font-black uppercase text-xs md:text-sm tracking-widest shadow-glow active:scale-95 transition-all ${!canCommitOrder ? 'opacity-50 grayscale' : ''}`} 
            disabled={cart.length === 0 || !canCommitOrder} 
            onClick={() => { submitOrder(); if (isGuestRole) setGuestViewMode('ACTIVE'); }}
        >
            {isGuestRole ? 'Confirm Selection' : 'Authorize Payload'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden relative">
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl px-4 md:px-12 pt-6 md:pt-8 pb-4 md:pb-6 border-b border-slate-100 dark:border-white/5 z-30 shrink-0">
          <div className="flex justify-between items-center mb-6 md:mb-8">
            <div className="flex items-center gap-4 md:gap-6">
              <div className="min-w-0">
                <h1 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none truncate">{RESTAURANT_NAME}</h1>
                <p className="text-[8px] md:text-[10px] font-black text-brand-500 uppercase tracking-[0.4em] mt-1 md:mt-2">
                  {isGuestRole 
                    ? (selectedTable ? `Guest Portal • Station ${selectedTable.number}` : 'Guest Portal • Tables Unlinked') 
                    : 'Operating Hub'
                  }
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="relative hidden lg:block">
                  <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                  <input 
                    type="text" 
                    placeholder="Search menu..." 
                    className="w-48 xl:w-64 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl pl-12 pr-4 py-3.5 text-xs font-bold outline-none focus:bg-white dark:focus:bg-slate-700 transition-all text-slate-900 dark:text-white"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
              </div>
              <button onClick={onOpenHistory} title="View Past Orders" className="w-10 h-10 md:w-12 md:h-12 bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 rounded-xl md:rounded-2xl flex items-center justify-center text-slate-400 hover:text-brand-600 shadow-sm transition-all active:scale-90">
                <i className="fas fa-clock-rotate-left text-sm md:text-base"></i>
              </button>
              <button 
                onClick={handleVoiceOrder} 
                disabled={isProcessingVoice}
                title="Voice Order" 
                className={`w-10 h-10 md:w-12 md:h-12 bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm transition-all active:scale-90 ${isListening ? 'text-rose-500 animate-pulse' : isProcessingVoice ? 'text-amber-500 fa-spin' : 'text-slate-400 hover:text-brand-600'}`}
              >
                <i className={`fas ${isProcessingVoice ? 'fa-spinner' : 'fa-microphone'} text-sm md:text-base`}></i>
              </button>
              <button 
                onClick={onOpenScanner} 
                title="Scan QR Code" 
                className="w-10 h-10 md:w-12 md:h-12 bg-white dark:bg-slate-800 border border-slate-100 dark:border-white/5 rounded-xl md:rounded-2xl flex items-center justify-center text-slate-400 hover:text-brand-600 shadow-sm transition-all active:scale-90"
              >
                <i className="fas fa-qrcode text-sm md:text-base"></i>
              </button>
            </div>
          </div>
          
          <div className="flex gap-2 md:gap-3 overflow-x-auto no-scrollbar pb-1.5 touch-pan-x">
            {categories.map((cat: any) => (
              <button key={cat.id} onClick={() => setActiveCat(cat.id)} className={`px-4 py-3 md:px-6 md:py-4 rounded-xl md:rounded-2xl border-2 whitespace-nowrap text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${activeCat === cat.id ? 'bg-slate-950 dark:bg-brand-600 text-white border-slate-950 dark:border-brand-600 shadow-lg' : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                <i className={`fas ${cat.icon} mr-2 md:mr-3 text-xs md:text-sm`}></i>{cat.name}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar pb-32 md:pb-10 bg-slate-50 dark:bg-slate-950">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-10">
            {filteredItems.map(item => (
              <MenuItemCard key={item.id} item={item} onItemClick={onItemClick} readOnly={false} />
            ))}
          </div>
        </div>
      </div>

      {/* Responsive Basket Drawer/Aside */}
      <aside className={`w-[440px] shrink-0 border-l border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 hidden lg:block overflow-hidden`}>
        {guestViewMode === 'ACTIVE' ? (
          <div className="flex flex-col h-full">
            <div className="p-8 border-b dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/50 flex justify-between items-center shrink-0">
               <div>
                 <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Track Cycles</h2>
                 <button onClick={onOpenHistory} className="mt-1 flex items-center gap-2 text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-700 transition-colors">
                   <i className="fas fa-clock-rotate-left"></i> Full History
                 </button>
               </div>
               <button onClick={() => setGuestViewMode('MENU')} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"><i className="fas fa-times"></i></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {customerActiveOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 py-20 text-center">
                    <i className="fas fa-receipt text-8xl mb-8 dark:text-white"></i>
                    <p className="text-base font-black uppercase tracking-[0.4em] dark:text-white">No active cycles</p>
                  </div>
                ) : customerActiveOrders.map((order: Order) => (
                  <div key={order.id} className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-white/5 p-8 rounded-[2.5rem] shadow-sm animate-in fade-in">
                     <div className="flex justify-between items-start mb-6">
                        <div>
                           <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-tight text-lg mb-2">#{order.id.slice(-4)}</h4>
                           <StatusBadge status={order.status} />
                        </div>
                        <span className="font-black text-xl text-slate-950 dark:text-white">${order.total.toFixed(2)}</span>
                     </div>
                  </div>
                ))}
            </div>
          </div>
        ) : basketSidebarContent}
      </aside>

      {/* Mobile-only Full-screen Basket/Status Overlays */}
      {(guestViewMode === 'BASKET' || guestViewMode === 'ACTIVE') && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-900 lg:hidden animate-in slide-in-from-bottom-full duration-400">
           {guestViewMode === 'BASKET' ? basketSidebarContent : (
              <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 overflow-hidden">
                <div className="p-6 border-b dark:border-white/5 bg-white dark:bg-slate-900 flex justify-between items-center pt-safe">
                   <div>
                     <h2 className="text-xl font-black uppercase dark:text-white">Tracking Cycles</h2>
                     <button onClick={onOpenHistory} className="text-[9px] font-black text-brand-600 uppercase tracking-widest mt-1">View Full History</button>
                   </div>
                   <button onClick={() => setGuestViewMode('MENU')} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center dark:text-white"><i className="fas fa-times"></i></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {customerActiveOrders.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-10 text-center py-20">
                            <i className="fas fa-receipt text-6xl mb-4 dark:text-white"></i>
                            <p className="text-xs font-black uppercase tracking-widest dark:text-white">No active payloads</p>
                        </div>
                    ) : customerActiveOrders.map((o: any) => (
                      <div key={o.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 p-6 rounded-3xl shadow-sm">
                         <div className="flex justify-between items-start mb-4">
                            <h4 className="font-black text-slate-900 dark:text-white">Order #{o.id.slice(-4)}</h4>
                            <span className="font-black text-brand-600 dark:text-brand-400">${o.total.toFixed(2)}</span>
                         </div>
                         <StatusBadge status={o.status} />
                      </div>
                    ))}
                </div>
              </div>
           )}
        </div>
      )}

      {/* High-Fidelity Bottom Navigation for Guests (Mobile) */}
      {isGuestRole && (
        <div className="fixed bottom-0 left-0 right-0 lg:hidden z-[110] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-t border-slate-100 dark:border-white/5 pb-safe shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.15)]">
          <div className="grid grid-cols-3 h-16 md:h-20 items-center px-4">
            <button 
              onClick={() => setGuestViewMode('MENU')} 
              className={`flex flex-col items-center justify-center gap-1 transition-all ${guestViewMode === 'MENU' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}
            >
              <i className="fas fa-utensils text-lg md:text-xl"></i>
              <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest">Explore</span>
            </button>
            <button 
              onClick={() => setGuestViewMode('BASKET')} 
              className={`relative flex flex-col items-center justify-center gap-1 transition-all ${guestViewMode === 'BASKET' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}
            >
              <i className="fas fa-shopping-basket text-lg md:text-xl"></i>
              <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest">My Selection</span>
              {cartItemCount > 0 && (
                <span className="absolute top-2 right-1/4 bg-rose-500 text-white text-[7px] font-black w-4 h-4 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-slate-900 shadow-lg">{cartItemCount}</span>
              )}
            </button>
            <button 
              onClick={() => setGuestViewMode('ACTIVE')} 
              className={`relative flex flex-col items-center justify-center gap-1 transition-all ${guestViewMode === 'ACTIVE' ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}
            >
              <i className="fas fa-receipt text-lg md:text-xl"></i>
              <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest">Live Status</span>
              {customerActiveOrders.length > 0 && <span className="absolute top-2 right-1/4 w-2 h-2 bg-brand-500 rounded-full animate-pulse border-2 border-white dark:border-slate-900"></span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default POSView;
