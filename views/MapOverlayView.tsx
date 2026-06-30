import React, { useState, useRef, useEffect } from 'react';
import { Table, Order, TableStatus } from '../types';

interface MapOverlayViewProps {
  tables: Table[];
  orders: Order[];
  onUpdateTable: (table: Table) => void;
}

export const MapOverlayView: React.FC<MapOverlayViewProps> = ({ tables, orders, onUpdateTable }) => {
  const [localTables, setLocalTables] = useState<Table[]>(tables);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setLocalTables(tables);
  }, [tables]);

  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggingId(id);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    setLocalTables(prev => 
      prev.map(t => t.id === draggingId ? { ...t, x, y } : t)
    );
  };

  const handlePointerUp = async (e: React.PointerEvent) => {
    if (!draggingId) return;
    const table = localTables.find(t => t.id === draggingId);
    setDraggingId(null);
    if ((e.target as Element).hasPointerCapture(e.pointerId)) {
        (e.target as Element).releasePointerCapture(e.pointerId);
    }
    
    if (table) {
      setErrorMsg(null);
      try {
        onUpdateTable(table);
      } catch (err: any) {
        console.error("Sync Error (Map Overlay):", err);
        setErrorMsg("Failed to synchronize table coordinates: " + err.message);
      }
    }
  };

  const getTableStatusColor = (status: TableStatus) => {
    switch (status) {
      case TableStatus.AVAILABLE: return 'bg-emerald-50 border-emerald-500 text-emerald-700';
      case TableStatus.OCCUPIED: return 'bg-brand-50 border-brand-500 text-brand-700';
      case TableStatus.RESERVED: return 'bg-amber-50 border-amber-500 text-amber-700';
      case TableStatus.PENDING_CLEANING: return 'bg-rose-50 border-rose-500 text-rose-700';
      default: return 'bg-slate-50 border-slate-500 text-slate-700';
    }
  };

  return (
    <div className="w-full h-full p-6 animate-in fade-in duration-500 flex flex-col">
      <div className="mb-6 flex justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">MEAL Map Overlay</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mt-1">Spatial Restaurant Configuration</p>
        </div>
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">
             <i className="fas fa-exclamation-triangle mr-2"></i> {errorMsg}
          </div>
        )}
      </div>

      <div 
        ref={containerRef}
        className="flex-1 bg-slate-50 border-2 border-slate-200 border-dashed rounded-[3rem] relative overflow-hidden shadow-default"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {localTables.map(table => {
          // Find orders linked to this table
          const activeOrders = orders.filter(o => o.tableId === table.id && o.status !== 'PAID' && o.status !== 'CANCELLED');
          
          return (
            <div 
              key={table.id}
              onPointerDown={(e) => handlePointerDown(table.id, e)}
              className={`absolute top-0 left-0 w-24 h-24 rounded-2xl border-2 shadow-md cursor-grab active:cursor-grabbing flex flex-col items-center justify-center transition-shadow select-none
                         ${getTableStatusColor(table.status)}
                         ${draggingId === table.id ? 'shadow-xl scale-110 z-50 opacity-90' : 'hover:shadow-lg'}`}
              style={{
                transform: `translate(calc(${table.x}cqw - 50%), calc(${table.y}cqh - 50%))`,
                containerType: 'size', // use container sizing for centering
                left: `${table.x}%`,
                top: `${table.y}%`
              }}
            >
              <span className="font-black text-xl">{table.number}</span>
              <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Cap: {table.capacity}</span>
              {activeOrders.length > 0 && (
                 <div className="absolute -top-2 -right-2 bg-brand-500 text-white w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold shadow-sm">
                    {activeOrders.length}
                 </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
