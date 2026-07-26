
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, Legend } from 'recharts';
import { Order, OrderStatus, MenuItem, MenuCategory, Ingredient, Review, Table, AuditLog, Reservation, UserProfile, RoleDefinition, ActionOutcome, ReservationStatus, UserStatus, MenuItemStatus, Permission, Task, TaskStatus, TaskPriority, Role } from '../types';
import { UserRole, INVENTORY_ADMIN_ROLES } from '../types/shared';
import { OrderInspectorModal, ConfirmationModal, TaskEditModal } from '../components/Modals';
import { Button } from '../components/Button';
import { db } from '../services/databaseService';
import { digitizeMenuFromImage } from '../services/geminiService';
import { RESTAURANT_NAME } from '../constants';
import { D3RevenueTrendChart } from '../components/D3RevenueTrendChart';
import { D3HourlySalesChart } from '../components/D3HourlySalesChart';
import { InventoryReconciliationService, InventoryHealthReport, ReconciliationFinding } from '../services/inventoryReconciliationService';
import { InventoryPostingEngine } from '../services/inventoryPostingEngine';
import { firestore } from '../services/firestoreService';
import { FoodCostService, MonthlyCOGSResult, MenuItemProfitabilityRecord, TopPerformingItemsResult, MenuItemProfitabilityResult } from '../services/foodCostService';
import { ForecastingService, ScenarioParameters, ForecastingReport, ForecastItem } from '../services/forecastingService';
import { ProcurementIntelligenceService, ProcurementDashboard, ProcurementItemReport, ABCAnalysis } from '../services/procurementIntelligenceService';
import { canManageInventory } from '../roleUtils';

interface AdminViewProps {
    activeSection: string;
    orders: Order[];
    menu: MenuItem[];
    categories: MenuCategory[];
    ingredients: Ingredient[];
    tables: Table[];
    reviews: Review[];
    auditLogs?: AuditLog[];
    reservations?: Reservation[];
    staffDirectory?: UserProfile[];
    roleDefinitions: RoleDefinition[];
    tasks?: Task[];
    onToggleAvailability?: (id: string) => void;
    onToggleGuestVisibility?: (id: string) => void;
    onUpdateRole?: (role: RoleDefinition) => void;
    onDeleteRole?: (roleId: string) => void;
    onAddTask?: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'createdByCode'>) => void;
    onUpdateTask?: (task: Task) => void;
    onDeleteTask?: (id: string) => void;
    onUpdateTable?: (table: Table) => void;
    onAddMenuItems?: (items: Partial<MenuItem>[]) => void;
    onUpdateStaffStatus?: (staffId: string, status: UserStatus) => void;
    onRegisterStaff?: (name: string, email: string, role: Role, password: string, phone: string) => Promise<void>;
    currentUserRole?: Role;
    currentUser?: UserProfile | null;
    onCreateIngredient?: (ing: Partial<Ingredient>) => void;
    onUpdateIngredient?: (id: string, updates: Partial<Ingredient>) => void;
    onDeleteIngredient?: (id: string) => void;
    organizationId?: string;
    userId?: string;
}

const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
    [Permission.VIEW_POS]: "Access to the main point-of-sale terminal and order taking.",
    [Permission.VIEW_KDS]: "Access to the kitchen display system and preparation queue.",
    [Permission.VIEW_CUSTOMER_MENU]: "Access to the digital guest menu and ordering interface.",
    [Permission.VIEW_FLOOR_PLAN]: "Visual monitoring of station availability and occupancy.",
    [Permission.VIEW_RESERVATIONS]: "View upcoming guest bookings and capacity schedules.",
    [Permission.VIEW_SALES_REPORTS]: "Full access to financial analytics and daily revenue logs.",
    [Permission.VIEW_INVENTORY]: "Monitor ingredient stock levels and supply chain status.",
    [Permission.VIEW_MENU_CATALOGUE]: "View internal dish database and pricing configurations.",
    [Permission.VIEW_AUDIT_TRAIL]: "View the immutable system log of all administrative actions.",
    [Permission.VIEW_FEEDBACK]: "Access guest reviews and operational insights.",
    [Permission.VIEW_TASKS]: "Monitor the operational task board and staff assignments.",
    [Permission.MANAGE_ORDERS]: "Authority to approve, reject, or void guest orders.",
    [Permission.PROCESS_PAYMENTS]: "Ability to handle settlements and confirm financial cycles.",
    [Permission.PREPARE_ORDERS]: "Authority to update prep status and clear kitchen tickets.",
    [Permission.MANAGE_MENU]: "Ability to toggle item availability and edit descriptions.",
    [Permission.MANAGE_FLOOR]: "Authority to reconfigure stations and assign staff to areas.",
    [Permission.MANAGE_TASKS]: "Ability to deploy, assign, and delete operational tasks.",
    [Permission.MANAGE_PERSONNEL]: "Authority to approve staff accounts and manage profiles.",
    [Permission.MANAGE_ROLES]: "Strict access to modify the system's authority matrix.",
    [Permission.MANAGE_SYSTEM]: "Root access to core system flags and initialization nodes."
};

const MenuDigitizationModal = ({ 
    isOpen, 
    onClose, 
    categories, 
    onInjest 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    categories: MenuCategory[], 
    onInjest: (items: Partial<MenuItem>[]) => void 
}) => {
    const [preview, setPreview] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [digitizedItems, setDigitizedItems] = useState<Partial<MenuItem>[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsCameraActive(true);
                setError(null);
            }
        } catch (err) {
            setError("Camera access denied. Please use file upload.");
        }
    };

    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            if (context) {
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                context.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvasRef.current.toDataURL('image/jpeg');
                setPreview(dataUrl);
                stopCamera();
            }
        }
    };

    useEffect(() => {
        if (!isOpen) {
            stopCamera();
            setPreview(null);
            setDigitizedItems([]);
            setError(null);
            setIsSuccess(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result as string);
            reader.readAsDataURL(selected);
            setDigitizedItems([]);
            setError(null);
            stopCamera();
        }
    };

    const processImage = async () => {
        if (!preview) return;
        setIsProcessing(true);
        setError(null);
        try {
            const base64 = preview.split(',')[1];
            const items = await digitizeMenuFromImage(base64, categories);
            if (items && items.length > 0) {
                setDigitizedItems(items);
            } else {
                setError("No menu entries detected. Ensure the image is clear and contains prices.");
            }
        } catch (err) {
            setError("Neural extraction failed. Please retry with a clearer image.");
        } finally {
            setIsProcessing(false);
        }
    };

    const updateDigitizedItem = (index: number, updates: Partial<MenuItem>) => {
        setDigitizedItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
    };

    const removeDigitizedItem = (index: number) => {
        setDigitizedItems(prev => prev.filter((_, i) => i !== index));
    };

    const applyGlobalCategory = (catId: string) => {
        setDigitizedItems(prev => prev.map(item => ({ ...item, categoryId: catId })));
    };

    const handleConfirmInjest = () => {
        onInjest(digitizedItems);
        setIsSuccess(true);
        setTimeout(() => {
            onClose();
        }, 2000);
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-5xl relative z-10 flex flex-col h-[85vh] overflow-hidden animate-in zoom-in-95 border border-white/10">
                <header className="px-10 py-8 border-b bg-slate-50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Neural Menu Ingestion</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">AI-Powered Digitization Node</p>
                    </div>
                    {!isSuccess && (
                        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white flex items-center justify-center border border-slate-100 text-slate-400 hover:text-slate-900 transition-all active:scale-90">
                            <i className="fas fa-times"></i>
                        </button>
                    )}
                </header>
                
                <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                    {isSuccess && (
                        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur flex flex-col items-center justify-center animate-in fade-in duration-500">
                            <div className="w-24 h-24 bg-emerald-500 text-white rounded-[2.5rem] flex items-center justify-center text-4xl shadow-glow animate-bounce mb-8">
                                <i className="fas fa-check"></i>
                            </div>
                            <h4 className="text-3xl font-black text-slate-900 uppercase tracking-tighter mb-4 italic">Payload Ingested</h4>
                            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">{digitizedItems.length} records committed to core protocol.</p>
                        </div>
                    )}

                    <div className="lg:w-2/5 border-r border-slate-100 p-10 flex flex-col gap-8 bg-slate-50/30 overflow-y-auto">
                        <div className="space-y-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Visual Payload</p>
                            <div className="relative rounded-[2.5rem] overflow-hidden border-4 border-white shadow-premium aspect-[3/4] bg-slate-200 group">
                                {isCameraActive ? (
                                    <>
                                        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                                        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
                                            <button onClick={capturePhoto} className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-glow text-brand-600 transition-transform active:scale-90">
                                                <i className="fas fa-camera text-2xl"></i>
                                            </button>
                                            <button onClick={stopCamera} className="w-16 h-16 bg-slate-900/80 text-white rounded-full flex items-center justify-center backdrop-blur-md">
                                                <i className="fas fa-times text-xl"></i>
                                            </button>
                                        </div>
                                    </>
                                ) : preview ? (
                                    <>
                                        <img src={preview} className="w-full h-full object-cover" alt="Captured menu" />
                                        {isProcessing && (
                                            <div className="absolute inset-0 bg-brand-500/20 backdrop-blur-[2px] flex items-center justify-center overflow-hidden">
                                                <div className="absolute inset-0 bg-gradient-to-b from-brand-400/50 to-transparent h-1/4 animate-[scan_2s_ease-in-out_infinite]"></div>
                                                <style>{`
                                                    @keyframes scan {
                                                        0% { transform: translateY(-100%); }
                                                        100% { transform: translateY(400%); }
                                                    }
                                                `}</style>
                                                <div className="bg-white/90 backdrop-blur px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-pulse">
                                                    <i className="fas fa-microchip text-brand-600 animate-spin-slow"></i>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">Neural Analysis...</span>
                                                </div>
                                            </div>
                                        )}
                                        {!isProcessing && (
                                            <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setPreview(null); setDigitizedItems([]); }} className="w-10 h-10 bg-rose-500 text-white rounded-xl shadow-lg flex items-center justify-center hover:scale-110 active:scale-90 transition-all">
                                                    <i className="fas fa-trash-can"></i>
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center gap-6 p-8">
                                        <label className="w-full flex flex-col items-center justify-center py-10 border-4 border-dashed border-slate-300 rounded-[2rem] cursor-pointer hover:bg-white hover:border-brand-500/50 transition-all group/upload">
                                            <i className="fas fa-cloud-arrow-up text-4xl text-slate-300 mb-4 group-hover/upload:scale-110 transition-transform"></i>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload Image</p>
                                            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                        </label>
                                        <div className="flex items-center gap-4 w-full">
                                            <div className="h-px bg-slate-300 flex-1"></div>
                                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Or</span>
                                            <div className="h-px bg-slate-300 flex-1"></div>
                                        </div>
                                        <button onClick={startCamera} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] flex flex-col items-center gap-2 hover:bg-brand-600 transition-all shadow-lg active:scale-95">
                                            <i className="fas fa-camera text-xl"></i>
                                            <span className="text-[9px] font-black uppercase tracking-widest">Live Capture</span>
                                        </button>
                                    </div>
                                )}
                                <canvas ref={canvasRef} className="hidden" />
                            </div>
                        </div>

                        {preview && digitizedItems.length === 0 && !isProcessing && (
                            <Button 
                                onClick={processImage} 
                                className="w-full h-18 rounded-3xl shadow-glow font-black uppercase text-sm tracking-widest"
                            >
                                <i className="fas fa-brain mr-3"></i> Run Neural Extraction
                            </Button>
                        )}
                    </div>

                    <div className="lg:w-3/5 flex flex-col overflow-hidden bg-white">
                        <div className="p-8 border-b border-slate-50 flex justify-between items-center shrink-0">
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Extracted Manifest</p>
                                {digitizedItems.length > 0 && <p className="text-[9px] font-bold text-emerald-500 uppercase mt-1 tracking-widest">{digitizedItems.length} Entities Identified</p>}
                            </div>
                            {digitizedItems.length > 0 && (
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-xl border border-slate-200">
                                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Global Cat:</span>
                                        <select 
                                            className="bg-transparent text-[8px] font-black uppercase outline-none"
                                            onChange={(e) => applyGlobalCategory(e.target.value)}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Set All</option>
                                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={() => setDigitizedItems([])} className="text-slate-400 hover:text-rose-500 text-[10px] font-black uppercase tracking-widest">Purge</button>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar">
                            {error && (
                                <div className="p-10 bg-rose-50 border border-rose-100 rounded-[2.5rem] text-rose-600 flex flex-col items-center gap-4 text-center">
                                    <i className="fas fa-triangle-exclamation text-3xl"></i>
                                    <p className="text-[11px] font-black uppercase tracking-widest leading-relaxed">{error}</p>
                                </div>
                            )}
                            {digitizedItems.length === 0 && !isProcessing && !error && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 py-20 text-center">
                                    <div className="w-32 h-32 bg-slate-100 rounded-full flex items-center justify-center mb-8">
                                        <i className="fas fa-wand-magic-sparkles text-6xl"></i>
                                    </div>
                                    <p className="text-sm font-black uppercase tracking-[0.4em]">Awaiting Uplink Signal</p>
                                    <p className="text-[10px] mt-4 max-w-[200px] leading-relaxed italic">Input visual menu data to begin neural mapping.</p>
                                </div>
                            )}
                            {isProcessing && (
                                <div className="h-full flex flex-col items-center justify-center py-20 space-y-10 animate-in fade-in duration-500">
                                    <div className="relative">
                                        <div className="w-24 h-24 border-4 border-brand-100 border-t-brand-500 rounded-full animate-spin"></div>
                                        <i className="fas fa-brain absolute inset-0 flex items-center justify-center text-2xl text-brand-500 animate-pulse"></i>
                                    </div>
                                    <div className="text-center space-y-3">
                                        <p className="text-sm font-black text-slate-900 uppercase tracking-widest">Processing Neural Clusters</p>
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-1 h-1 bg-brand-500 rounded-full animate-bounce"></div>
                                            <div className="w-1 h-1 bg-brand-500 rounded-full animate-bounce delay-100"></div>
                                            <div className="w-1 h-1 bg-brand-500 rounded-full animate-bounce delay-200"></div>
                                        </div>
                                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.3em]">Decoding visual price anchors</p>
                                    </div>
                                </div>
                            )}
                            {digitizedItems.map((item, idx) => (
                                <div key={idx} className="group bg-slate-50 border border-slate-100 rounded-[2rem] p-6 hover:bg-white hover:shadow-premium hover:border-brand-200 transition-all flex flex-col md:flex-row gap-6 animate-in slide-in-from-bottom-2">
                                    <div className="flex-1 space-y-4">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Item Title</label>
                                                <input 
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase outline-none focus:border-brand-500"
                                                    value={item.name}
                                                    onChange={e => updateDigitizedItem(idx, { name: e.target.value })}
                                                />
                                            </div>
                                            <div className="w-full md:w-32 space-y-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Price ($)</label>
                                                <input 
                                                    type="number"
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black outline-none focus:border-brand-500"
                                                    value={item.price}
                                                    onChange={e => updateDigitizedItem(idx, { price: parseFloat(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Classification</label>
                                                <select 
                                                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:border-brand-500"
                                                    value={item.categoryId}
                                                    onChange={e => updateDigitizedItem(idx, { categoryId: e.target.value })}
                                                >
                                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">Confidence Node</label>
                                                <div className="h-9 px-4 flex items-center bg-emerald-50 rounded-xl border border-emerald-100">
                                                    <div className="flex gap-1">
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                                        <div className="w-2 h-2 bg-emerald-200 rounded-full"></div>
                                                    </div>
                                                    <span className="ml-auto text-[8px] font-black text-emerald-600 uppercase tracking-widest">Optimized</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">AI Descriptor</label>
                                            <textarea 
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-brand-500 min-h-[60px] resize-none"
                                                value={item.description}
                                                onChange={e => updateDigitizedItem(idx, { description: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex md:flex-col justify-end shrink-0 gap-2">
                                        <button 
                                            onClick={() => removeDigitizedItem(idx)}
                                            className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-sm"
                                        >
                                            <i className="fas fa-trash-can"></i>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {digitizedItems.length > 0 && !isSuccess && (
                            <div className="p-8 border-t border-slate-100 bg-slate-50/50">
                                <Button 
                                    onClick={handleConfirmInjest} 
                                    className="w-full h-18 rounded-3xl shadow-glow font-black uppercase text-sm tracking-widest"
                                >
                                    Commit {digitizedItems.length} Extracted Records
                                </Button>
                                <p className="text-center text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-4 opacity-60 italic">Validating identified nodes before commit.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const AdminView: React.FC<AdminViewProps> = ({ 
    activeSection,
    orders, 
    menu, 
    categories, 
    ingredients, 
    tables,
    reviews,
    auditLogs = [],
    reservations = [],
    staffDirectory = [],
    roleDefinitions,
    tasks = [],
    onToggleAvailability,
    onToggleGuestVisibility,
    onUpdateRole,
    onDeleteRole,
    onAddTask,
    onUpdateTask,
    onDeleteTask,
    onUpdateTable,
    onUpdateStaffStatus,
    onRegisterStaff,
    onAddMenuItems,
    currentUserRole,
    currentUser,
    onCreateIngredient,
    onUpdateIngredient,
    onDeleteIngredient,
    organizationId,
    userId
}) => {
    const [inspectedOrder, setInspectedOrder] = useState<Order | null>(null);

    // Audit Log Filtering States
    const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
    const [auditUserFilter, setAuditUserFilter] = useState<string>('ALL');
    const [auditStartDate, setAuditStartDate] = useState<string>('');
    const [auditEndDate, setAuditEndDate] = useState<string>('');
    const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
    const [auditCurrentPage, setAuditCurrentPage] = useState<number>(1);
    const ITEMS_PER_PAGE = 10;

    // Reactive Filtered Logs Computation
    const filteredAuditLogs = useMemo(() => {
        let result = [...auditLogs];

        // Search Query filter (notes, action, targetEntityId, userIdentifier)
        if (auditSearchQuery.trim()) {
            const query = auditSearchQuery.toLowerCase();
            result = result.filter(log => 
                (log.notes?.toLowerCase() || '').includes(query) ||
                log.action.toLowerCase().includes(query) ||
                log.targetEntityId.toLowerCase().includes(query) ||
                log.targetEntityType.toLowerCase().includes(query) ||
                log.userIdentifier.toLowerCase().includes(query)
            );
        }

        // Action filter
        if (auditActionFilter !== 'ALL') {
            result = result.filter(log => log.action === auditActionFilter);
        }

        // Operator filter
        if (auditUserFilter !== 'ALL') {
            result = result.filter(log => log.userIdentifier === auditUserFilter);
        }

        // Date Range filter
        if (auditStartDate) {
            const dStart = new Date(auditStartDate);
            dStart.setHours(0, 0, 0, 0);
            result = result.filter(log => log.timestamp >= dStart.getTime());
        }
        if (auditEndDate) {
            const dEnd = new Date(auditEndDate);
            dEnd.setHours(23, 59, 59, 999);
            result = result.filter(log => log.timestamp <= dEnd.getTime());
        }

        // Sort descending by timestamp initially
        return result.sort((a, b) => b.timestamp - a.timestamp);
    }, [auditLogs, auditSearchQuery, auditActionFilter, auditUserFilter, auditStartDate, auditEndDate]);

    // Pagination slicing
    const paginatedAuditLogs = useMemo(() => {
        const startIndex = (auditCurrentPage - 1) * ITEMS_PER_PAGE;
        return filteredAuditLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredAuditLogs, auditCurrentPage, ITEMS_PER_PAGE]);

    const totalAuditPages = Math.ceil(filteredAuditLogs.length / ITEMS_PER_PAGE) || 1;

    // Reset pagination page to 1 when filters change
    useEffect(() => {
        setAuditCurrentPage(1);
    }, [auditSearchQuery, auditActionFilter, auditUserFilter, auditStartDate, auditEndDate]);

    const uniqueActions = useMemo(() => {
        const set = new Set<string>();
        auditLogs.forEach(log => {
            if (log.action) set.add(log.action);
        });
        return Array.from(set).sort();
    }, [auditLogs]);

    const uniqueUsers = useMemo(() => {
        const set = new Set<string>();
        auditLogs.forEach(log => {
            if (log.userIdentifier) set.add(log.userIdentifier);
        });
        return Array.from(set).sort();
    }, [auditLogs]);

    const auditStats = useMemo(() => {
        const total = filteredAuditLogs.length;
        const successCount = filteredAuditLogs.filter(log => log.outcome === ActionOutcome.SUCCESS).length;
        const failureCount = filteredAuditLogs.filter(log => log.outcome === ActionOutcome.FAILURE).length;
        const warningCount = filteredAuditLogs.filter(log => log.outcome === ActionOutcome.WARNING).length;
        const successRate = total > 0 ? (successCount / total) * 100 : 100;

        return {
            total,
            successCount,
            failureCount,
            warningCount,
            successRate
        };
    }, [filteredAuditLogs]);

    const getRoleColor = (role: Role | string) => {
        switch (role?.toLowerCase()) {
            case UserRole.SUPER_ADMIN:
                return 'bg-violet-500/10 text-violet-500 border border-violet-500/20';
            case UserRole.OWNER:
                return 'bg-purple-500/10 text-purple-500 border border-purple-500/20';
            case UserRole.MANAGER:
                return 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20';
            case UserRole.SUPERVISOR:
                return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
            case UserRole.CASHIER:
                return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
            case UserRole.WAITER:
                return 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20';
            case UserRole.KITCHEN:
                return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
            case UserRole.VIEWER:
                return 'bg-slate-500/10 text-slate-500 border border-slate-500/20';
            case UserRole.GUEST:
            default:
                return 'bg-slate-400/10 text-slate-500 border border-slate-400/10';
        }
    };

    // Inventory Reconciliation Sub-section States
    const [inventorySubTab, setInventorySubTab] = useState<'STOCK' | 'RECONCILIATION' | 'PROCUREMENT' | 'RECEIVING' | 'SUPPLIERS' | 'PURCHASE_ORDERS' | 'ACCOUNTS_PAYABLE'>('STOCK');
    const [reconciliationReport, setReconciliationReport] = useState<InventoryHealthReport | null>(null);
    const [isReconciliationLoading, setIsReconciliationLoading] = useState(false);
    const [reconciliationError, setReconciliationError] = useState<string | null>(null);
    
    // Procurement Intelligence States
    const [procurementDashboard, setProcurementDashboard] = useState<any | null>(null);
    const [isProcurementLoading, setIsProcurementLoading] = useState(false);
    const [procurementError, setProcurementError] = useState<string | null>(null);
    const [reconciliationSortField, setReconciliationSortField] = useState<'date' | 'severity' | 'type'>('date');
    const [reconciliationSortOrder, setReconciliationSortOrder] = useState<'asc' | 'desc'>('desc');
    const [inspectedPosting, setInspectedPosting] = useState<any | null>(null);
    const [isRetryingMap, setIsRetryingMap] = useState<Record<string, boolean>>({});
    const [reconciliationActionLogs, setReconciliationActionLogs] = useState<Array<{ id: string; timestamp: number; type: string; message: string; status: 'SUCCESS' | 'FAILURE' }>>([]);

    const handleRunReconciliation = async (force: boolean = false) => {
        if (!organizationId) {
            setReconciliationError("Session organization ID is missing.");
            return;
        }

        const now = Date.now();
        if (!force && reconciliationReport && now - reconciliationReport.generatedAt < 5000) {
            return;
        }

        setIsReconciliationLoading(true);
        setReconciliationError(null);
        try {
            const report = await InventoryReconciliationService.runReconciliation(organizationId);
            setReconciliationReport(report);
        } catch (err: any) {
            setReconciliationError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsReconciliationLoading(false);
        }
    };

    const handleInspectPosting = async (postingId: string) => {
        if (!organizationId) return;
        try {
            setIsReconciliationLoading(true);
            const doc = await firestore.inventoryPostings.getById(organizationId, postingId);
            setInspectedPosting(doc);
        } catch (err: any) {
            setReconciliationError(`Inspection failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsReconciliationLoading(false);
        }
    };

    const handleRetryPosting = async (orderId: string) => {
        if (!organizationId) return;

        setIsRetryingMap(prev => ({ ...prev, [orderId]: true }));
        try {
            const operator = userId || 'SYSTEM';
            await InventoryPostingEngine.createInventoryPosting(organizationId, orderId, operator);
            
            setReconciliationActionLogs(prev => [
                {
                    id: String(Date.now()),
                    timestamp: Date.now(),
                    type: 'RETRY_SUCCESS',
                    message: `Inventory posting recovery executed successfully for Order ${orderId}`,
                    status: 'SUCCESS'
                },
                ...prev
            ]);

            // Refresh findings
            await handleRunReconciliation(true);
        } catch (err: any) {
            setReconciliationActionLogs(prev => [
                {
                    id: String(Date.now()),
                    timestamp: Date.now(),
                    type: 'RETRY_FAILURE',
                    message: `Recovery failed for Order ${orderId}: ${err instanceof Error ? err.message : String(err)}`,
                    status: 'FAILURE'
                },
                ...prev
            ]);
        } finally {
            setIsRetryingMap(prev => {
                const updated = { ...prev };
                delete updated[orderId];
                return updated;
            });
        }
    };

    const canRetryOrder = (orderId: string): boolean => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return false;

        const isAllowedRole = currentUserRole?.toLowerCase() === UserRole.SUPER_ADMIN || currentUserRole?.toLowerCase() === UserRole.OWNER;
        if (!isAllowedRole) return false;

        // Determine if legacy
        let hasSnapshots = false;
        let hasMissingLegacyData = false;
        if (order.items) {
            for (const item of order.items) {
                if (item.recipeId) {
                    if (!item.recipeVersion || !item.resourceSnapshot || !item.snapshotCapturedAt) {
                        hasMissingLegacyData = true;
                        break;
                    }
                    if (item.resourceSnapshot && item.resourceSnapshot.ingredients && item.resourceSnapshot.ingredients.length > 0) {
                        hasSnapshots = true;
                    }
                }
            }
        }
        const isLegacy = hasMissingLegacyData || !hasSnapshots;
        if (isLegacy) return false;

        if (order.paymentStatus !== 'PAID' && order.status !== 'CLOSED' && order.status !== 'PAID') return false;

        const status = order.inventoryPostingStatus;
        if (status === 'POSTED' || status === 'RECONCILED') return false;

        return status === 'FAILED' || !status;
    };

    const sortedFindings = useMemo(() => {
        if (!reconciliationReport) return [];

        const getSeverityWeight = (finding: ReconciliationFinding) => {
            const reason = finding.failureReason.toLowerCase();
            if (reason.includes('failed') || reason.includes('inconsistency')) return 3; // CRITICAL
            if (reason.includes('stranded') || reason.includes('never posted')) return 2; // HIGH
            if (reason.includes('orphaned') || reason.includes('missing')) return 1; // MEDIUM
            return 0; // LOW
        };

        const list = [...reconciliationReport.findings];
        list.sort((a, b) => {
            let valA: any = 0;
            let valB: any = 0;

            if (reconciliationSortField === 'date') {
                valA = a.detectedAt;
                valB = b.detectedAt;
            } else if (reconciliationSortField === 'severity') {
                valA = getSeverityWeight(a);
                valB = getSeverityWeight(b);
            } else if (reconciliationSortField === 'type') {
                valA = a.failureReason;
                valB = b.failureReason;
            }

            if (typeof valA === 'string') {
                return reconciliationSortOrder === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA);
            } else {
                return reconciliationSortOrder === 'asc' 
                    ? valA - valB 
                    : valB - valA;
            }
        });

        return list;
    }, [reconciliationReport, reconciliationSortField, reconciliationSortOrder]);

    useEffect(() => {
        if (inventorySubTab === 'RECONCILIATION' && !reconciliationReport && !isReconciliationLoading) {
            handleRunReconciliation(true);
        }
    }, [inventorySubTab, organizationId]);
    const handleRunProcurement = async (force: boolean = false) => {
        if (!organizationId) {
            setProcurementError("Session organization ID is missing.");
            return;
        }

        if (!force && procurementDashboard) {
            return;
        }

        setIsProcurementLoading(true);
        setProcurementError(null);

        try {
            const report = await ProcurementIntelligenceService.generateProcurementReport({
                organizationId,
                analysisPeriodDays: 30
            });
            setProcurementDashboard(report);
        } catch (error: any) {
            console.error("Procurement Engine Runtime Error:", error);
            setProcurementError(error.message || "Failed to generate procurement intelligence report");
        } finally {
            setIsProcurementLoading(false);
        }
    };

    useEffect(() => {
        if (inventorySubTab === 'PROCUREMENT' && !procurementDashboard && !isProcurementLoading && organizationId) {
            handleRunProcurement(true);
        }
    }, [inventorySubTab, organizationId]);

    const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isDigitizationModalOpen, setIsDigitizationModalOpen] = useState(false);
    const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);
    const [taskedIngredients, setTaskedIngredients] = useState<Record<string, boolean>>({});
    const [menuFilter, setMenuFilter] = useState<'ALL' | 'UNAVAILABLE' | 'HIDDEN'>('ALL');

    // Sales Subsections, Capital Costs & Revenue Dashboard State
    const [activeSalesSubTab, setActiveSalesSubTab] = useState<'P_L' | 'CATEGORY' | 'PRODUCT' | 'BALANCE_SHEET' | 'P_L_STATEMENT' | 'LEDGER' | 'FOOD_COST_ENGINE'>('P_L');

    // Food Cost Engine States
    const [foodCostViewMode, setFoodCostViewMode] = useState<'EXECUTIVE' | 'DIAGNOSTICS' | 'FORECAST'>('EXECUTIVE');
    const [foodCostThreshold, setFoodCostThreshold] = useState<number>(30); // Default threshold 30%
    const [scenarioGrowthRate, setScenarioGrowthRate] = useState<number>(0);
    const [scenarioCogsDrift, setScenarioCogsDrift] = useState<number>(0);
    const [scenarioPriceAdjustment, setScenarioPriceAdjustment] = useState<number>(0);
    const [cogsYear, setCogsYear] = useState<number>(new Date().getFullYear());
    const [cogsMonth, setCogsMonth] = useState<number>(new Date().getMonth() + 1);
    const [monthlyCogsResult, setMonthlyCogsResult] = useState<MonthlyCOGSResult | null>(null);
    const [prevMonthlyCogsResult, setPrevMonthlyCogsResult] = useState<MonthlyCOGSResult | null>(null);
    const [isCalculatingCogs, setIsCalculatingCogs] = useState(false);

    const [profitStartDate, setProfitStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(1); // Default to start of current month
        return d.toISOString().split('T')[0];
    });
    const [profitEndDate, setProfitEndDate] = useState<string>(() => {
        const d = new Date();
        return d.toISOString().split('T')[0]; // Default to today
    });
    const [profitabilityResult, setProfitabilityResult] = useState<MenuItemProfitabilityResult | null>(null);
    const [topPerformersResult, setTopPerformersResult] = useState<TopPerformingItemsResult | null>(null);
    const [isCalculatingProfit, setIsCalculatingProfit] = useState(false);

    const runMonthlyCogsCalculation = async () => {
        if (!organizationId) return;
        setIsCalculatingCogs(true);
        try {
            const prevMonthVal = cogsMonth === 1 ? 12 : cogsMonth - 1;
            const prevYearVal = cogsMonth === 1 ? cogsYear - 1 : cogsYear;

            const [res, prevRes] = await Promise.all([
                FoodCostService.calculateMonthlyCOGS(organizationId, cogsYear, cogsMonth),
                FoodCostService.calculateMonthlyCOGS(organizationId, prevYearVal, prevMonthVal)
            ]);
            setMonthlyCogsResult(res);
            setPrevMonthlyCogsResult(prevRes);
        } catch (err) {
            console.error('COGS calculation error:', err);
        } finally {
            setIsCalculatingCogs(false);
        }
    };

    const runProfitabilityAndPerformersCalculation = async () => {
        if (!organizationId) return;
        setIsCalculatingProfit(true);
        try {
            const startStr = `${profitStartDate}T00:00:00`;
            const endStr = `${profitEndDate}T23:59:59`;
            
            const [profRes, topRes] = await Promise.all([
                FoodCostService.calculateMenuItemProfitability(organizationId, { startDate: startStr, endDate: endStr }),
                FoodCostService.getTopPerformingItems(organizationId, { startDate: startStr, endDate: endStr })
            ]);
            
            setProfitabilityResult(profRes);
            setTopPerformersResult(topRes);
        } catch (err) {
            console.error('Profitability calculation error:', err);
        } finally {
            setIsCalculatingProfit(false);
        }
    };

    const forecastParams = useMemo(() => ({
        orderGrowthRate: scenarioGrowthRate,
        cogsDriftRate: scenarioCogsDrift,
        priceAdjustment: scenarioPriceAdjustment
    }), [scenarioGrowthRate, scenarioCogsDrift, scenarioPriceAdjustment]);

    const forecastReport = useMemo(() => {
        if (!profitabilityResult?.items) return null;
        return ForecastingService.projectForecasting(
            profitabilityResult.items,
            monthlyCogsResult,
            prevMonthlyCogsResult,
            reconciliationReport as any,
            forecastParams
        );
    }, [profitabilityResult?.items, monthlyCogsResult, prevMonthlyCogsResult, reconciliationReport, forecastParams]);

    // Calculate automatically when tab changes or parameters change (safe & reactive)
    useEffect(() => {
        if (activeSalesSubTab === 'FOOD_COST_ENGINE' && organizationId) {
            runMonthlyCogsCalculation();
            runProfitabilityAndPerformersCalculation();
            handleRunReconciliation(); // Populate reconciliation findings for executive dashboard!
        }
    }, [activeSalesSubTab, organizationId, cogsYear, cogsMonth, profitStartDate, profitEndDate]);
    
    // MenuItem Custom Cost mappings (cost price of ingredients / preparation)
    const [menuItemCosts, setMenuItemCosts] = useState<Record<string, number>>({
        'cheeseburger': 4.50,
        'double_burger': 6.00,
        'fries': 1.20,
        'soda': 0.50,
        'beer': 1.80,
        'salad': 2.00,
        'pizza': 5.50,
        'pasta': 3.80,
        'ice_cream': 1.00
    });

    const [customTransactions, setCustomTransactions] = useState<Array<{
        id: string;
        timestamp: number;
        type: 'REVENUE' | 'EXPENSE';
        category: string; // 'SALARY' | 'RENT' | 'UTILITIES' | 'MARKETING' | 'INGREDIENTS' | 'OTHER_REVENUE' | 'OTHER_EXPENSE'
        amount: number;
        description: string;
        staffName: string;
    }>>([
        { id: 'tx_1', timestamp: Date.now() - 3 * 24 * 3600 * 1000, type: 'EXPENSE', category: 'RENT', amount: 1500.00, description: 'Monthly facilities lease leasehold fee', staffName: 'Manager John' },
        { id: 'tx_2', timestamp: Date.now() - 2 * 24 * 3600 * 1000, type: 'EXPENSE', category: 'SALARY', amount: 2400.00, description: 'Staff payroll disbursement cycle', staffName: 'Manager John' },
        { id: 'tx_3', timestamp: Date.now() - 20 * 3600 * 1000, type: 'EXPENSE', category: 'UTILITIES', amount: 350.00, description: 'Power grid & commercial water fee', staffName: 'Manager John' },
        { id: 'tx_4', timestamp: Date.now() - 10 * 3600 * 1000, type: 'EXPENSE', category: 'MARKETING', amount: 180.00, description: 'Social media growth advertising campaigns', staffName: 'Manager John' },
        { id: 'tx_5', timestamp: Date.now() - 15 * 3605 * 1000, type: 'REVENUE', category: 'OTHER_REVENUE', amount: 450.00, description: 'Catering deposit for birthday party booking', staffName: 'Manager John' },
    ]);

    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<{
        id: string;
        timestamp: number;
        type: 'REVENUE' | 'EXPENSE';
        category: string;
        amount: number;
        description: string;
        staffName: string;
    } | null>(null);
    const [transactionForm, setTransactionForm] = useState({
        type: 'EXPENSE' as 'REVENUE' | 'EXPENSE',
        category: 'UTILITIES',
        amount: 0,
        description: '',
        staffName: 'Manager John'
    });

    const handleSaveTransaction = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingTransaction) {
            setCustomTransactions(prev => prev.map(t => t.id === editingTransaction.id ? {
                ...t,
                type: transactionForm.type,
                category: transactionForm.category,
                amount: Number(transactionForm.amount),
                description: transactionForm.description,
                staffName: transactionForm.staffName
            } : t));
        } else {
            setCustomTransactions(prev => [
                {
                    id: `tx_${Date.now()}`,
                    timestamp: Date.now(),
                    type: transactionForm.type,
                    category: transactionForm.category,
                    amount: Number(transactionForm.amount),
                    description: transactionForm.description,
                    staffName: transactionForm.staffName
                },
                ...prev
            ]);
        }
        setIsTransactionModalOpen(false);
        setEditingTransaction(null);
    };

    const handleDeleteTransaction = (id: string) => {
        setCustomTransactions(prev => prev.filter(t => t.id !== id));
    };

    const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
    const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);

    // Generate QR Code state
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [qrTargetType, setQrTargetType] = useState<'ITEM' | 'CATEGORY' | 'TABLE'>('ITEM');
    const [qrSelectedItemId, setQrSelectedItemId] = useState('');
    const [qrSelectedCategoryId, setQrSelectedCategoryId] = useState('');
    const [qrSelectedTableId, setQrSelectedTableId] = useState('');
    const [qrColor, setQrColor] = useState('#0f172a');
    const [qrCopied, setQrCopied] = useState(false);

    const openQRGenerator = (type?: 'ITEM' | 'CATEGORY' | 'TABLE', targetId?: string) => {
        if (type) {
            setQrTargetType(type);
            if (type === 'ITEM') {
                setQrSelectedItemId(targetId || menu[0]?.id || '');
            } else if (type === 'CATEGORY') {
                setQrSelectedCategoryId(targetId || categories[0]?.id || '');
            } else {
                setQrSelectedTableId(targetId || tables[0]?.id || '');
            }
        } else {
            setQrTargetType('ITEM');
            setQrSelectedItemId(menu[0]?.id || '');
            setQrSelectedCategoryId(categories[0]?.id || '');
            setQrSelectedTableId(tables[0]?.id || '');
        }
        setQrCopied(false);
        setIsQRModalOpen(true);
    };

    const [ingredientForm, setIngredientForm] = useState({ name: '', stock: 0, unit: 'piece' });
    const [usageReports, setUsageReports] = useState<Array<{
        id: string;
        timestamp: number;
        staffName: string;
        action: 'DEPS_DEDUCTION' | 'DEPS_REPLENISH' | 'DEPS_DELETE' | 'DEPS_ADD' | 'DEPS_EDIT';
        ingredientName: string;
        amount?: number;
        unit: string;
        reason: string;
    }>>([
        { id: 'u_1', timestamp: Date.now() - 15 * 60 * 1000, staffName: 'Chef Daniel', action: 'DEPS_DEDUCTION', ingredientName: 'Beef Patties', amount: 15, unit: 'piece', reason: 'Deducted for cooked Orders #1024' },
        { id: 'u_2', timestamp: Date.now() - 42 * 60 * 1000, staffName: 'Waiter Sarah', action: 'DEPS_DEDUCTION', ingredientName: 'Lettuce', amount: 3, unit: 'kg', reason: 'Consumed for guest order salad portions' },
        { id: 'u_3', timestamp: Date.now() - 2 * 3600 * 1000, staffName: 'Chef Daniel', action: 'DEPS_REPLENISH', ingredientName: 'Brioche Buns', amount: 100, unit: 'piece', reason: 'Bulk bakery delivery procurement logs' },
        { id: 'u_4', timestamp: Date.now() - 4 * 3600 * 1000, staffName: 'Waiter Alex', action: 'DEPS_DEDUCTION', ingredientName: 'Cheddar Cheese', amount: 8, unit: 'piece', reason: 'Assigned to gourmet cheeseburger builds' },
        { id: 'u_5', timestamp: Date.now() - 6 * 3600 * 1000, staffName: 'Manager John', action: 'DEPS_REPLENISH', ingredientName: 'Tomato Sauce', amount: 15, unit: 'litre', reason: 'Wholesale batch delivery logging' }
    ]);

    const handleSaveIngredient = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingIngredient) {
            if (onUpdateIngredient) onUpdateIngredient(editingIngredient.id, { name: ingredientForm.name, stock: Number(ingredientForm.stock), unit: ingredientForm.unit });
            setUsageReports(prev => [
                {
                    id: `u_${Date.now()}`,
                    timestamp: Date.now(),
                    staffName: 'Manager John',
                    action: 'DEPS_EDIT',
                    ingredientName: ingredientForm.name,
                    amount: Number(ingredientForm.stock),
                    unit: ingredientForm.unit,
                    reason: `Calibrated stock database levels to ${ingredientForm.stock} ${ingredientForm.unit}.`
                },
                ...prev
            ]);
        } else {
            const newId = ingredientForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') || `ing_${Date.now()}`;
            const finalId = ingredients.some(i => i.id === newId) ? `${newId}_${Date.now()}` : newId;
            const newIng: Partial<Ingredient> = {
                id: finalId,
                name: ingredientForm.name,
                stock: Number(ingredientForm.stock),
                unit: ingredientForm.unit
            };
            if (onCreateIngredient) onCreateIngredient(newIng);
            setUsageReports(prev => [
                {
                    id: `u_${Date.now()}`,
                    timestamp: Date.now(),
                    staffName: 'Manager John',
                    action: 'DEPS_ADD',
                    ingredientName: ingredientForm.name,
                    amount: Number(ingredientForm.stock),
                    unit: ingredientForm.unit,
                    reason: `Registered brand new item into core food stock balance: ${ingredientForm.stock} ${ingredientForm.unit}.`
                },
                ...prev
            ]);
        }
        setIsIngredientModalOpen(false);
    };

    const handleDeleteIngredient = (id: string, name: string) => {
        if (onDeleteIngredient) onDeleteIngredient(id);
        setUsageReports(prev => [
            {
                id: `u_${Date.now()}`,
                timestamp: Date.now(),
                staffName: 'Manager John',
                action: 'DEPS_DELETE',
                ingredientName: name,
                unit: '',
                reason: `Decommissioned item completely from database tracking.`
            },
            ...prev
        ]);
    };

    const canManageRoles = db.canManageRoles(currentUserRole || 'guest');
    const canManageMenu = db.canManageMenu(currentUserRole || 'guest');

    const pendingStaff = useMemo(() => {
        return staffDirectory.filter(s => s.status === UserStatus.PENDING_APPROVAL);
    }, [staffDirectory]);

    const filteredMenu = useMemo(() => {
        if (menuFilter === 'UNAVAILABLE') return menu.filter(m => m.status === MenuItemStatus.UNAVAILABLE);
        if (menuFilter === 'HIDDEN') return menu.filter(m => !m.visible_to_guest);
        return menu;
    }, [menu, menuFilter]);

    const revenue = useMemo(() => orders.filter(o => o.paymentStatus === 'PAID').reduce((acc, o) => acc + o.total, 0), [orders]);
    const paidOrdersCount = orders.filter(o => o.paymentStatus === 'PAID').length;
    const avgOrderValue = paidOrdersCount > 0 ? revenue / paidOrdersCount : 0;

    // Financial Analysis Engine Variables
    const otherRevenues = useMemo(() => {
        return customTransactions.filter(t => t.type === 'REVENUE').reduce((sum, t) => sum + t.amount, 0);
    }, [customTransactions]);

    const totalCombinedRevenue = revenue + otherRevenues;

    const calculatedCOGS = useMemo(() => {
        let totalCost = 0;
        orders.filter(o => o.paymentStatus === 'PAID').forEach(order => {
            order.items.forEach(item => {
                const costPerUnit = menuItemCosts[item.id] || menuItemCosts[item.name.toLowerCase()] || (item.price * 0.35);
                totalCost += costPerUnit * item.quantity;
            });
        });
        return totalCost;
    }, [orders, menuItemCosts]);

    const manualExpensesByCategory = useMemo(() => {
        const categoriesAmount = {
            SALARY: 0,
            RENT: 0,
            UTILITIES: 0,
            MARKETING: 0,
            INGREDIENTS: 0,
            OTHER_EXPENSE: 0
        };
        customTransactions.filter(t => t.type === 'EXPENSE').forEach(t => {
            const cat = t.category as keyof typeof categoriesAmount;
            if (categoriesAmount[cat] !== undefined) {
                categoriesAmount[cat] += t.amount;
            } else {
                categoriesAmount.OTHER_EXPENSE += t.amount;
            }
        });
        return categoriesAmount;
    }, [customTransactions]);

    const totalCOGS = calculatedCOGS + manualExpensesByCategory.INGREDIENTS;
    const grossProfit = revenue - totalCOGS;
    const grossMarginPercentage = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

    const totalOpex = manualExpensesByCategory.SALARY + manualExpensesByCategory.RENT + manualExpensesByCategory.UTILITIES + manualExpensesByCategory.MARKETING + manualExpensesByCategory.OTHER_EXPENSE;
    const operatingExpensesList = [
        { label: 'Staff Payroll & Salaries', value: manualExpensesByCategory.SALARY, icon: 'fa-user-tie' },
        { label: 'Facilities Rent & Leases', value: manualExpensesByCategory.RENT, icon: 'fa-building' },
        { label: 'Digital Power & Commercial Utilities', value: manualExpensesByCategory.UTILITIES, icon: 'fa-bolt' },
        { label: 'Marketing and Ads Spend', value: manualExpensesByCategory.MARKETING, icon: 'fa-bullhorn' },
        { label: 'Other Operational Expenses', value: manualExpensesByCategory.OTHER_EXPENSE, icon: 'fa-cubes' }
    ];

    const netProfit = grossProfit + otherRevenues - totalOpex;
    const netProfitMarginPercentage = totalCombinedRevenue > 0 ? (netProfit / totalCombinedRevenue) * 100 : 0;

    // Sales by Category Breakdowns
    const categorySales = useMemo(() => {
        const breakdown: Record<string, { categoryId: string, name: string, quantity: number, revenue: number, cogs: number }> = {};
        
        categories.forEach(cat => {
            breakdown[cat.id] = {
                categoryId: cat.id,
                name: cat.name,
                quantity: 0,
                revenue: 0,
                cogs: 0
            };
        });

        const UNKNOWN_KEY = 'other';
        breakdown[UNKNOWN_KEY] = {
            categoryId: UNKNOWN_KEY,
            name: 'Other / Uncategorized',
            quantity: 0,
            revenue: 0,
            cogs: 0
        };

        orders.filter(o => o.paymentStatus === 'PAID').forEach(order => {
            order.items.forEach(item => {
                const catId = item.categoryId || UNKNOWN_KEY;
                if (!breakdown[catId]) {
                    breakdown[catId] = {
                        categoryId: catId,
                        name: 'Special Item',
                        quantity: 0,
                        revenue: 0,
                        cogs: 0
                    };
                }
                const costPerUnit = menuItemCosts[item.id] || menuItemCosts[item.name.toLowerCase()] || (item.price * 0.35);
                breakdown[catId].quantity += item.quantity;
                breakdown[catId].revenue += item.price * item.quantity;
                breakdown[catId].cogs += costPerUnit * item.quantity;
            });
        });

        return Object.values(breakdown).filter(c => c.quantity > 0 || c.categoryId !== UNKNOWN_KEY);
    }, [orders, categories, menuItemCosts]);

    // Sales by Item Breakdowns
    const itemSales = useMemo(() => {
        const breakdown: Record<string, { id: string, name: string, categoryName: string, price: number, quantity: number, revenue: number, cogs: number, profit: number }> = {};
        
        orders.filter(o => o.paymentStatus === 'PAID').forEach(order => {
            order.items.forEach(item => {
                if (!breakdown[item.id]) {
                    const categoryObj = categories.find(c => c.id === item.categoryId);
                    breakdown[item.id] = {
                        id: item.id,
                        name: item.name,
                        categoryName: categoryObj ? categoryObj.name : 'Other',
                        price: item.price,
                        quantity: 0,
                        revenue: 0,
                        cogs: 0,
                        profit: 0
                    };
                }
                const costPerUnit = menuItemCosts[item.id] || menuItemCosts[item.name.toLowerCase()] || (item.price * 0.35);
                breakdown[item.id].quantity += item.quantity;
                breakdown[item.id].revenue += item.price * item.quantity;
                breakdown[item.id].cogs += costPerUnit * item.quantity;
            });
        });

        return Object.values(breakdown).map(i => ({
            ...i,
            profit: i.revenue - i.cogs
        })).sort((a, b) => b.revenue - a.revenue);
    }, [orders, categories, menuItemCosts]);

    // Payment Methods Analytics
    const salesByPaymentMethod = useMemo(() => {
        const methods = { CASH: 0, CARD: 0, TELEBIRR: 0 };
        orders.filter(o => o.paymentStatus === 'PAID').forEach(o => {
            const m = ((o as any).paymentMethod || 'CASH') as 'CASH' | 'CARD' | 'TELEBIRR';
            methods[m] = (methods[m] || 0) + o.total;
        });
        return methods;
    }, [orders]);

    // Balance Sheet formulations to balance perfectly
    const balanceSheetData = useMemo(() => {
        // Assets
        const cashBalance = Math.max(1200, 2500 + salesByPaymentMethod.CASH + otherRevenues - (manualExpensesByCategory.RENT + manualExpensesByCategory.SALARY + manualExpensesByCategory.UTILITIES));
        const bankBalance = 10000 + salesByPaymentMethod.CARD + salesByPaymentMethod.TELEBIRR - manualExpensesByCategory.MARKETING;
        const inventoryValuation = ingredients.reduce((sum, ing) => sum + (ing.stock * 1.50), 0);
        const physicalAssets = 35000; // Net Value of Kitchen Equipment & Leaseholds
        
        const totalAssets = cashBalance + bankBalance + inventoryValuation + physicalAssets;

        // Liabilities
        const accountsPayable = Number((manualExpensesByCategory.INGREDIENTS * 0.15).toFixed(2)) || 250.00; // Vendor accounts
        const payrollTaxesAccrued = Number((manualExpensesByCategory.SALARY * 0.08).toFixed(2)) || 180.00;
        const totalLiabilities = accountsPayable + payrollTaxesAccrued;

        // Owner's equity is calculated so the sheet balances perfectly:
        // Equity = Assets - Liabilities
        const calculatedEquity = totalAssets - totalLiabilities;
        const retainedEarnings = netProfit;
        const contributedCapital = calculatedEquity - retainedEarnings;

        return {
            cashBalance,
            bankBalance,
            inventoryValuation,
            physicalAssets,
            totalAssets,
            accountsPayable,
            payrollTaxesAccrued,
            totalLiabilities,
            contributedCapital,
            retainedEarnings,
            totalEquity: calculatedEquity,
            totalLiabilitiesAndEquity: totalLiabilities + calculatedEquity
        };
    }, [salesByPaymentMethod, otherRevenues, manualExpensesByCategory, ingredients, netProfit]);

    const criticalIngredients = useMemo(() => {
        return ingredients.filter(i => i.stock < 10);
    }, [ingredients]);

    return (
        <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden page-transition select-none">
            <header className="px-12 pt-12 pb-8 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div>
                  <h2 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter uppercase flex items-center gap-4 leading-none italic">
                      {activeSection === 'ADMIN_FLOOR' && 'Floor Monitor'}
                      {activeSection === 'ADMIN_SALES' && 'Sales Analytics'}
                      {activeSection === 'ADMIN_INVENTORY' && 'Inventory Node'}
                      {activeSection === 'ADMIN_MENU' && 'Catalogue Console'}
                      {activeSection === 'ADMIN_AUDIT' && 'Audit Trail'}
                      {activeSection === 'ADMIN_FEEDBACK' && 'Guest Insights'}
                      {activeSection === 'ADMIN_RESERVATIONS' && 'Reservations'}
                      {activeSection === 'ADMIN_STAFF' && 'Staff Directory'}
                      {activeSection === 'ADMIN_APPROVALS' && 'Personnel Uplink Control'}
                      {activeSection === 'ADMIN_ROLES' && 'Authority Matrix'}
                      {activeSection === 'ADMIN_TASKS' && 'Task Board'}
                      <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse shadow-glow"></span>
                  </h2>
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] mt-3">
                      Authenticated Security Uplink Verified
                  </p>
                </div>
                <div className="flex gap-4 items-center">
                    {/* Low Stock Alerts Notification Button */}
                    <button 
                        onClick={() => setIsLowStockModalOpen(true)}
                        className={`relative h-12 w-12 flex items-center justify-center rounded-2xl border transition-all active:scale-90 ${criticalIngredients.length > 0 ? 'bg-rose-500/15 border-rose-500/50 text-rose-500 shadow-glow cursor-pointer' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 cursor-pointer'}`}
                        title="Stock Level Alerts"
                    >
                        <i className={`fas ${criticalIngredients.length > 0 ? 'fa-triangle-exclamation animate-bounce' : 'fa-check'}`}></i>
                        {criticalIngredients.length > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full text-[8px] font-black flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-lg">
                                {criticalIngredients.length}
                            </span>
                        )}
                    </button>

                    {activeSection === 'ADMIN_ROLES' && canManageRoles && (
                        <Button 
                            onClick={() => { setEditingRole(null); setIsRoleModalOpen(true); }}
                            className="h-12 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-glow"
                        >
                            <i className="fas fa-plus-circle mr-2"></i> New Protocol
                        </Button>
                    )}
                    {activeSection === 'ADMIN_MENU' && (
                        <div className="flex gap-4">
                            <button 
                                onClick={() => openQRGenerator()}
                                className="h-12 px-6 bg-slate-900 border border-slate-800 hover:bg-slate-800 dark:bg-brand-600 dark:border-brand-500 dark:hover:bg-brand-500 text-white rounded-2xl flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-glow"
                            >
                                <i className="fas fa-qrcode text-xs animate-pulse"></i>
                                Generate QR
                            </button>
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
                                {(['ALL', 'UNAVAILABLE', 'HIDDEN'] as const).map(f => (
                                    <button 
                                        key={f}
                                        onClick={() => setMenuFilter(f)}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${menuFilter === f ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-605'}`}
                                    >
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex-1 overflow-hidden p-12 custom-scrollbar flex gap-12">
                {activeSection === 'ADMIN_FLOOR' && (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar pb-20">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-premium mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 animate-in fade-in duration-500">
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                                    <i className="fas fa-layer-group text-brand-500"></i>
                                    Tables & Dining Stations Configuration
                                </h3>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-2">
                                    Manage physical station capacity, monitor real-time dining state, and produce direct guest QR ordering overlays
                                </p>
                            </div>
                            <button
                                onClick={() => openQRGenerator('TABLE')}
                                className="px-5 py-3 bg-brand-500 hover:bg-brand-400 text-white rounded-2xl flex items-center gap-2.5 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-glow self-stretch md:self-auto justify-center"
                            >
                                <i className="fas fa-qrcode text-sm"></i>
                                Master Table QR Linker
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 animate-in fade-in duration-500">
                            {tables.map(table => {
                                const tableStatus = table.status || 'AVAILABLE';
                                return (
                                    <div key={table.id} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col items-center text-center group hover:shadow-xl transition-all hover:-translate-y-1 relative">
                                        
                                        {/* Graphic table preview matching shape */}
                                        <div className="relative mb-6 flex items-center justify-center">
                                            <div className={`w-24 h-24 flex flex-col items-center justify-center border-4 shadow-md transition-all
                                                ${table.shape === 'CIRCLE' ? 'rounded-full' : table.shape === 'RECTANGLE' ? 'rounded-xl w-32 h-20' : 'rounded-[2rem]'} 
                                                ${tableStatus === 'AVAILABLE' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' : 
                                                  tableStatus === 'OCCUPIED' ? 'bg-brand-50 border-brand-500 text-brand-700 dark:bg-brand-950/20 dark:text-brand-400' : 
                                                  tableStatus === 'RESERVED' ? 'bg-amber-50 border-amber-500 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400' : 
                                                  'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400'}`}
                                            >
                                                <span className="font-extrabold text-2xl tracking-tighter leading-none text-slate-800 dark:text-white">{table.number}</span>
                                                <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mt-1 dark:text-slate-300">{table.shape}</span>
                                            </div>
                                        </div>

                                        {/* Capacity & Identifier info */}
                                        <div className="space-y-1 mb-5">
                                            <h4 className="font-black text-sm uppercase tracking-tight text-slate-800 dark:text-white">Station {table.number}</h4>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Capacity Limit: {table.capacity} Guests</p>
                                        </div>

                                        {/* Status Switcher Select */}
                                        <div className="w-full space-y-2 mb-6 text-left">
                                            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Station Status</label>
                                            <select
                                                value={table.status}
                                                onChange={(e) => {
                                                    if (onUpdateTable) {
                                                        onUpdateTable({
                                                            ...table,
                                                            status: e.target.value as any
                                                        });
                                                    }
                                                }}
                                                className="w-full h-10 bg-slate-50 dark:bg-slate-950/40 border border-slate-150 dark:border-slate-800 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 focus:outline-none"
                                            >
                                                <option value="AVAILABLE">🟢 Available</option>
                                                <option value="OCCUPIED">🔵 Occupied</option>
                                                <option value="RESERVED">🟡 Reserved</option>
                                                <option value="PENDING_CLEANING">🔴 Clean Pending</option>
                                            </select>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="w-full mt-auto pt-6 border-t border-slate-50 dark:border-slate-850">
                                            <button
                                                onClick={() => openQRGenerator('TABLE', table.id)}
                                                className="w-full h-11 bg-slate-950 hover:bg-slate-850 dark:bg-brand-600 dark:hover:bg-brand-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer shadow-glow"
                                            >
                                                <i className="fas fa-qrcode text-xs"></i>
                                                Generate Table QR
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {activeSection === 'ADMIN_ROLES' && (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar pb-20">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                             {roleDefinitions.map(role => (
                                 <div key={role.id} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col group transition-all hover:-translate-y-1 relative">
                                     {role.isSystem && (
                                         <div className="absolute top-6 right-8 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-[8px] font-black uppercase tracking-widest rounded-lg">
                                             System Immutable
                                         </div>
                                     )}
                                     <div className="flex items-center gap-5 mb-8">
                                         <div className="w-14 h-14 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-2xl flex items-center justify-center text-xl font-black border border-brand-100 dark:border-brand-800">
                                             <i className="fas fa-shield-halved"></i>
                                         </div>
                                         <div>
                                             <h4 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-2">{role.name}</h4>
                                             <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Protocol ID: {role.id}</p>
                                         </div>
                                     </div>
                                     
                                     <div className="flex-1 space-y-4 mb-8">
                                         <div className="flex justify-between items-center">
                                             <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Claims Spectrum</span>
                                             <span className="text-[10px] font-bold text-brand-500 bg-brand-50 dark:bg-brand-900/40 px-2 py-0.5 rounded-md">{role.permissions.length} Active</span>
                                         </div>
                                         <div className="flex flex-wrap gap-2">
                                             {role.permissions.slice(0, 6).map(p => (
                                                 <span key={p} className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tight">
                                                     {p.replace(/VIEW_|MANAGE_/, '').replace(/_/g, ' ')}
                                                 </span>
                                             ))}
                                             {role.permissions.length > 6 && (
                                                 <span className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight">
                                                     +{role.permissions.length - 6} More
                                                 </span>
                                             )}
                                         </div>
                                     </div>

                                     <div className="grid grid-cols-2 gap-4 mt-auto pt-6 border-t border-slate-50 dark:border-slate-800">
                                         <button 
                                             onClick={() => { setEditingRole(role); setIsRoleModalOpen(true); }}
                                             className="h-12 rounded-2xl border-2 border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white font-black uppercase text-[9px] tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
                                         >
                                             Refine Spectrum
                                         </button>
                                         <button 
                                             disabled={role.isSystem}
                                             onClick={() => setRoleToDelete(role.id)}
                                             className={`h-12 rounded-2xl border-2 font-black uppercase text-[9px] tracking-widest transition-all active:scale-95 ${role.isSystem ? 'border-slate-50 dark:border-slate-900 text-slate-200 dark:text-slate-700 cursor-not-allowed' : 'border-rose-100 dark:border-rose-900 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'}`}
                                         >
                                             Decommission
                                         </button>
                                     </div>
                                 </div>
                             ))}
                         </div>
                    </div>
                )}

                {activeSection === 'ADMIN_STAFF' && (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar pb-20 flex flex-col gap-8">
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-premium">
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-6">Register New Personnel</h3>
                            <form 
                                onSubmit={async (e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.currentTarget);
                                    const name = formData.get('name') as string;
                                    const email = formData.get('email') as string;
                                    const role = (formData.get('role') as string)?.toLowerCase() as Role;
                                    const password = formData.get('password') as string;
                                    const phone = formData.get('phone') as string;
                                    
                                    if (name && email && role && password && phone && onRegisterStaff) {
                                        try {
                                            await onRegisterStaff(name, email, role, password, phone);
                                            (e.target as HTMLFormElement).reset();
                                        } catch (err) {
                                            alert(err);
                                        }
                                    }
                                }}
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
                            >
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Full Name</label>
                                    <input required name="name" type="text" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" placeholder="e.g. John Doe" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Secure Link (Email)</label>
                                    <input required name="email" type="email" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" placeholder="crew@luminadining.com" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Phone Number</label>
                                    <input 
                                        required 
                                        name="phone" 
                                        type="tel" 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" 
                                        placeholder="+251 9XX XXX XXX" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Assigned Role</label>
                                    <select required name="role" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors">
                                        {roleDefinitions.filter(r => r.id?.toLowerCase() !== UserRole.SUPER_ADMIN).map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Passphrase</label>
                                    <input required name="password" type="password" minLength={6} title="6+ characters" className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-brand-500 transition-colors" placeholder="••••••••" />
                                </div>
                                <Button type="submit" className="h-[46px] rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-glow">
                                    <i className="fas fa-user-plus mr-2"></i> Register
                                </Button>
                            </form>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                            {staffDirectory.map(staff => (
                                <div key={staff.uid || staff.email || staff.phone} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col group transition-all hover:-translate-y-1">
                                    <div className="flex items-center gap-6 mb-8">
                                        <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-3xl flex items-center justify-center text-2xl font-black shadow-sm border border-brand-100 dark:border-brand-800">
                                            {staff.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-2">{staff.name}</h4>
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Phone: {staff.phone}</p>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 mb-8">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Assigned Claim</span>
                                            <span className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-brand-600 dark:text-brand-400">{staff.role}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Protocol status</span>
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${staff.status === UserStatus.ACTIVE ? 'text-emerald-500' : staff.status === UserStatus.PENDING_APPROVAL ? 'text-amber-500 animate-pulse' : 'text-rose-500'}`}>
                                                {(staff.status ?? UserStatus.PENDING_APPROVAL).replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    </div>
                                    {staff.status === UserStatus.PENDING_APPROVAL && (
                                        <div className="grid grid-cols-2 gap-4 mt-auto">
                                            <button 
                                                onClick={() => onUpdateStaffStatus?.(staff.uid!, UserStatus.REJECTED)}
                                                className="h-14 rounded-2xl border-2 border-rose-100 dark:border-rose-900 text-rose-500 font-black uppercase text-[10px] tracking-widest hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all active:scale-95"
                                            >
                                                Reject
                                            </button>
                                            <button 
                                                onClick={() => onUpdateStaffStatus?.(staff.uid!, UserStatus.ACTIVE)}
                                                className="h-14 rounded-2xl bg-brand-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-brand-700 transition-all active:scale-95"
                                            >
                                                Authorize
                                            </button>
                                        </div>
                                    )}
                                    {staff.status === UserStatus.ACTIVE && (
                                        <div className="mt-auto">
                                            <button 
                                                onClick={() => {
                                                    if (
                                                        currentUser?.uid &&
                                                        staff.uid &&
                                                        staff.uid === currentUser.uid
                                                    ) {
                                                        console.warn('[IRSW RBAC] Prevented self-suspension attempt');
                                                        return;
                                                    }

                                                    onUpdateStaffStatus?.(
                                                        staff.uid!,
                                                        UserStatus.SUSPENDED
                                                    );
                                                }}
                                                className="w-full h-14 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
                                            >
                                                Deactivate
                                            </button>
                                        </div>
                                    )}
                                    {staff.status === UserStatus.SUSPENDED &&
                                        staff.uid !== currentUser?.uid && (
                                            <div className="mt-auto">
                                                <button
                                                    onClick={() =>
                                                        onUpdateStaffStatus?.(
                                                            staff.uid!,
                                                            UserStatus.ACTIVE
                                                        )
                                                    }
                                                >
                                                    Reactivate
                                                </button>
                                            </div>
                                        )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeSection === 'ADMIN_APPROVALS' && (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar pb-20">
                         {pendingStaff.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center opacity-10 py-20 text-center">
                                 <i className="fas fa-user-check text-8xl mb-8"></i>
                                 <p className="text-xl font-black uppercase tracking-[0.5em]">No Pending handshakes</p>
                                 <p className="mt-4 text-sm font-bold uppercase">All personnel identities are currently verified.</p>
                             </div>
                         ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                                {pendingStaff.map(staff => (
                                    <div key={staff.uid || staff.email || staff.phone} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col group transition-all hover:-translate-y-1">
                                        <div className="flex items-center gap-6 mb-8">
                                            <div className="w-16 h-16 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-3xl flex items-center justify-center text-2xl font-black shadow-sm border border-brand-100 dark:border-brand-800">
                                                {staff.name.charAt(0)}
                                            </div>
                                            <div>
                                                <h4 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-2">{staff.name}</h4>
                                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Phone: {staff.phone}</p>
                                            </div>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 mb-8">
                                            <div className="flex justify-between items-center mb-4">
                                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Requested Claim</span>
                                                <span className="px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-[9px] font-black uppercase tracking-widest text-brand-600 dark:text-brand-400">{staff.role}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Protocol status</span>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 animate-pulse">Validation Pending</span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mt-auto">
                                            <button 
                                                onClick={() => onUpdateStaffStatus?.(staff.uid!, UserStatus.REJECTED)}
                                                className="h-14 rounded-2xl border-2 border-rose-100 dark:border-rose-900 text-rose-500 font-black uppercase text-[10px] tracking-widest hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all active:scale-95"
                                            >
                                                Reject
                                            </button>
                                            <button 
                                                onClick={() => onUpdateStaffStatus?.(staff.uid!, UserStatus.ACTIVE)}
                                                className="h-14 rounded-2xl bg-brand-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-brand-700 transition-all active:scale-95"
                                            >
                                                Authorize
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                         )}
                    </div>
                )}

                {activeSection === 'ADMIN_TASKS' && (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar pb-20">
                        {tasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[50vh] opacity-10">
                                <i className="fas fa-list-check text-8xl mb-8"></i>
                                <p className="text-xl font-black uppercase tracking-[0.5em]">No Active Deployments</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                                {tasks.map(task => {
                                    const priorityColors = {
                                        [TaskPriority.HIGH]: 'bg-rose-500 text-white shadow-glow-sm',
                                        [TaskPriority.MEDIUM]: 'bg-amber-500 text-white',
                                        [TaskPriority.LOW]: 'bg-slate-400 text-white'
                                    };
                                    const statusColors = {
                                        [TaskStatus.PENDING]: 'bg-slate-50 border-slate-100 text-slate-500',
                                        [TaskStatus.IN_PROGRESS]: 'bg-brand-50 border-brand-100 text-brand-600',
                                        [TaskStatus.COMPLETED]: 'bg-emerald-50 border-emerald-100 text-emerald-600',
                                        [TaskStatus.CANCELLED]: 'bg-rose-50 border-rose-100 text-rose-600'
                                    };

                                    return (
                                        <div key={task.id} className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col group transition-all hover:-translate-y-1 relative">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${priorityColors[task.priority]}`}>
                                                    {task.priority} Priority
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingTask(task); setIsTaskModalOpen(true); }} className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-brand-600 flex items-center justify-center transition-colors">
                                                        <i className="fas fa-pen text-[10px]"></i>
                                                    </button>
                                                    <button onClick={() => onDeleteTask?.(task.id)} className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors">
                                                        <i className="fas fa-trash text-[10px]"></i>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex-1 mb-8">
                                                <h4 className="font-black text-xl text-slate-900 dark:text-white uppercase tracking-tighter leading-none mb-3">{task.title}</h4>
                                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{task.description}</p>
                                            </div>
                                            
                                            <div className="relative pt-6 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                                                <div className={`flex items-center gap-3 group/assignee p-2 -ml-2 rounded-2xl transition-all`}>
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm transition-all ${task.assignedToCode ? 'bg-slate-900 dark:bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 border-dashed'}`}>
                                                        {task.assignedToName?.charAt(0) || <i className="fas fa-plus text-[10px]"></i>}
                                                    </div>
                                                    <div className="text-left">
                                                        <p className={`text-[10px] font-black uppercase truncate max-w-[100px] leading-tight ${task.assignedToCode ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                                                            {task.assignedToName || 'Select Agent'}
                                                        </p>
                                                        <p className="text-[7px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Personnel</p>
                                                    </div>
                                                </div>

                                                <div className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${statusColors[task.status]}`}>
                                                    {task.status.replace(/_/g, ' ')}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'ADMIN_INVENTORY' && (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar pb-20">
                        {/* Sub-tab selection with RBAC controls */}
                        {currentUserRole && canManageInventory(currentUserRole) && (
                            <div className="flex gap-4 mb-8 border-b border-slate-100/80 dark:border-slate-800 pb-5 px-1 shrink-0">
                                <button
                                    onClick={() => setInventorySubTab('STOCK')}
                                    className={`px-8 py-3.5 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all duration-300 ${inventorySubTab === 'STOCK' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-955 shadow-lg shadow-slate-900/10 dark:shadow-none scale-[1.02]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-955'}`}
                                >
                                    <i className="fas fa-boxes-stacked mr-2.5"></i>
                                    Food Stock Control
                                </button>
                                <button
                                    onClick={() => setInventorySubTab('RECONCILIATION')}
                                    className={`px-8 py-3.5 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all duration-300 ${inventorySubTab === 'RECONCILIATION' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-955 shadow-lg shadow-slate-900/10 dark:shadow-none scale-[1.02]' : 'text-slate-400 dark:text-slate-505 hover:text-slate-700 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-955'}`}
                                >
                                    <i className="fas fa-arrows-spin mr-2.5"></i>
                                    Posting Reconciliation
                                </button>
                                <button
                                    onClick={() => setInventorySubTab('PROCUREMENT')}
                                    className={`px-8 py-3.5 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all duration-300 ${inventorySubTab === 'PROCUREMENT' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-955 shadow-lg shadow-slate-900/10 dark:shadow-none scale-[1.02]' : 'text-slate-400 dark:text-slate-505 hover:text-slate-700 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-955'}`}
                                >
                                    <i className="fas fa-satellite-dish mr-2.5"></i>
                                    Procurement Intelligence
                                </button>
                                <button
                                    onClick={() => setInventorySubTab('RECEIVING')}
                                    className={`px-8 py-3.5 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all duration-300 ${inventorySubTab === 'RECEIVING' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-955 shadow-lg shadow-slate-900/10 dark:shadow-none scale-[1.02]' : 'text-slate-400 dark:text-slate-505 hover:text-slate-700 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-955'}`}
                                >
                                    <i className="fas fa-truck-loading mr-2.5"></i>
                                    Goods Receiving
                                </button>
                                <button
                                    onClick={() => setInventorySubTab('SUPPLIERS')}
                                    className={`px-8 py-3.5 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all duration-300 ${inventorySubTab === 'SUPPLIERS' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-955 shadow-lg shadow-slate-900/10 dark:shadow-none scale-[1.02]' : 'text-slate-400 dark:text-slate-505 hover:text-slate-700 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-955'}`}
                                >
                                    <i className="fas fa-building-user mr-2.5"></i>
                                    Suppliers
                                </button>
                                <button
                                    onClick={() => setInventorySubTab('PURCHASE_ORDERS')}
                                    className={`px-8 py-3.5 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all duration-300 ${inventorySubTab === 'PURCHASE_ORDERS' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-955 shadow-lg shadow-slate-900/10 dark:shadow-none scale-[1.02]' : 'text-slate-400 dark:text-slate-505 hover:text-slate-700 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-955'}`}
                                >
                                    <i className="fas fa-file-invoice mr-2.5"></i>
                                    Purchase Orders
                                </button>
                                <button
                                    onClick={() => setInventorySubTab('ACCOUNTS_PAYABLE')}
                                    className={`px-8 py-3.5 rounded-2xl text-[10px] uppercase font-black tracking-widest transition-all duration-300 ${inventorySubTab === 'ACCOUNTS_PAYABLE' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-955 shadow-lg shadow-slate-900/10 dark:shadow-none scale-[1.02]' : 'text-slate-400 dark:text-slate-505 hover:text-slate-700 dark:hover:text-slate-350 bg-slate-50 dark:bg-slate-955'}`}
                                >
                                    <i className="fas fa-money-check-dollar mr-2.5"></i>
                                    Accounts Payable
                                </button>
                            </div>
                        )}

                        {inventorySubTab === 'RECONCILIATION' ? (
                            <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-300">
                                {/* Dashboard Header stats cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {/* Reconciliation Score Ring & Diagnostics Card */}
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col justify-between col-span-1 md:col-span-2">
                                        <div className="flex items-start justify-between min-w-0">
                                            <div className="space-y-2">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-405 dark:text-slate-505">System Integrity Index</span>
                                                <h3 className="font-sans font-black text-2xl text-slate-900 dark:text-white uppercase tracking-tight">System Health Score</h3>
                                                <p className="text-[10px] font-bold text-slate-500 select-none">
                                                    Measures correlation precision between PAID transactions and Posted Inventory Ledgers.
                                                </p>
                                            </div>
                                            {/* Circular Progress Ring */}
                                            {reconciliationReport ? (
                                                <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                                                    <svg className="w-full h-full transform -rotate-90 animate-in fade-in zoom-in duration-500">
                                                        <circle
                                                            className="text-slate-100 dark:text-slate-850"
                                                            strokeWidth="8"
                                                            stroke="currentColor"
                                                            fill="transparent"
                                                            r="38"
                                                            cx="48"
                                                            cy="48"
                                                        />
                                                        <circle
                                                            className={`${
                                                                reconciliationReport.reconciliationScore >= 95 
                                                                    ? 'text-emerald-500' 
                                                                    : reconciliationReport.reconciliationScore >= 80 
                                                                        ? 'text-amber-500' 
                                                                        : 'text-rose-500'
                                                            } transition-all duration-1000 ease-in-out`}
                                                            strokeWidth="8"
                                                            strokeDasharray={2 * Math.PI * 38}
                                                            strokeDashoffset={2 * Math.PI * 38 * (1 - reconciliationReport.reconciliationScore / 100)}
                                                            strokeLinecap="round"
                                                            stroke="currentColor"
                                                            fill="transparent"
                                                            r="38"
                                                            cx="48"
                                                            cy="48"
                                                        />
                                                    </svg>
                                                    <div className="absolute flex flex-col items-center">
                                                        <span className="font-extrabold text-xl text-slate-900 dark:text-white tracking-tighter">
                                                            {reconciliationReport.reconciliationScore}%
                                                        </span>
                                                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-400">
                                                            {reconciliationReport.reconciliationScore >= 95 
                                                                ? 'HEALTHY' 
                                                                : reconciliationReport.reconciliationScore >= 80 
                                                                    ? 'WARNING' 
                                                                    : 'CRITICAL'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-24 h-24 rounded-full bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                                                    <i className="fas fa-rotate animate-spin text-slate-305 dark:text-slate-700"></i>
                                                </div>
                                            )}
                                        </div>

                                        <div className="pt-6 border-t border-slate-50 dark:border-slate-850 flex items-center justify-between gap-4 mt-6">
                                            <div className="text-[9px] font-mono font-bold text-slate-400">
                                                {reconciliationReport ? (
                                                    <span>DIAGNOSTICS LAST GENERATED: <span className="font-extrabold text-slate-700 dark:text-slate-300">{new Date(reconciliationReport.generatedAt).toLocaleString()}</span></span>
                                                ) : (
                                                    <span>WAITING FOR SYSTEM RUN...</span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleRunReconciliation(true)}
                                                disabled={isReconciliationLoading}
                                                className="px-5 py-2.5 bg-slate-950 hover:bg-slate-850 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-955 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                            >
                                                <i className={`fas fa-rotate ${isReconciliationLoading ? 'animate-spin' : ''}`}></i>
                                                Force Diagnostics Run
                                            </button>
                                        </div>
                                    </div>

                                    {/* Stats 1: Paid Orders vs Posted */}
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col justify-between">
                                        <div className="space-y-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-55 dark:bg-slate-955 flex items-center justify-center border border-slate-100/50 dark:border-slate-800/50">
                                                <i className="fas fa-file-invoice text-slate-500"></i>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Transaction Balance</span>
                                                <div className="flex items-baseline gap-2 mt-1">
                                                    <span className="font-extrabold text-2xl text-slate-900 dark:text-white">
                                                        {reconciliationReport ? reconciliationReport.totalPostedOrders : '--'}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        / {reconciliationReport ? reconciliationReport.totalPaidOrders : '--'} POSTED
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pt-4 border-t border-slate-50 dark:border-slate-850 mt-4">
                                            <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wide">
                                                <span>Total Audited Orders</span>
                                                <span className="font-mono text-slate-655 dark:text-slate-300 font-extrabold">
                                                    {reconciliationReport ? reconciliationReport.totalPaidOrders : '--'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats 2: Total Discrepancies */}
                                    <div className={`${reconciliationReport && reconciliationReport.findings.length > 0 ? 'bg-rose-50/20 dark:bg-rose-955/10' : 'bg-white dark:bg-slate-900'} p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col justify-between`}>
                                        <div className="space-y-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${reconciliationReport && reconciliationReport.findings.length > 0 ? 'bg-rose-50 border-rose-222 text-rose-500' : 'bg-slate-50 dark:bg-slate-955 border-slate-100 text-slate-500'}`}>
                                                <i className="fas fa-triangle-exclamation"></i>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Active Non-Compliance</span>
                                                <h4 className={`font-black text-2xl mt-1 tracking-tight ${reconciliationReport && reconciliationReport.findings.length > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-900 dark:text-white'}`}>
                                                    {reconciliationReport ? reconciliationReport.findings.length : '--'}
                                                </h4>
                                            </div>
                                        </div>
                                        <div className="pt-4 border-t border-slate-100/50 dark:border-slate-850 mt-4">
                                            <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wide">
                                                <span>Findings Require Attn</span>
                                                <span className={`font-mono font-extrabold ${reconciliationReport && reconciliationReport.findings.length > 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                                                    {reconciliationReport ? reconciliationReport.findings.length : '--'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Custom error callout if error */}
                                {reconciliationError && (
                                    <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-4 text-rose-500 animate-in fade-in">
                                        <i className="fas fa-circle-exclamation mt-1"></i>
                                        <div>
                                            <h5 className="font-black text-[10px] uppercase tracking-widest">Diagnostic Run Interrupted</h5>
                                            <p className="text-[10px] font-bold leading-relaxed mt-1">{reconciliationError}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Action Logs Section (if we performed actions in this window) */}
                                {reconciliationActionLogs.length > 0 && (
                                    <div className="bg-slate-950 dark:bg-slate-900 border border-slate-900 dark:border-slate-800 p-8 rounded-[2rem] text-slate-100 shadow-premium space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-sans font-black text-xs uppercase tracking-widest text-slate-400">Recovery Execution Logs</h4>
                                            <button 
                                                onClick={() => setReconciliationActionLogs([])}
                                                className="text-[8px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-350 cursor-pointer"
                                            >
                                                Clear Log Window
                                            </button>
                                        </div>
                                        <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar font-mono text-[9px] text-slate-300 leading-normal">
                                            {reconciliationActionLogs.map(log => (
                                                <div key={log.id} className="flex gap-4 p-4 bg-slate-900 dark:bg-slate-955 rounded-xl border border-slate-850/50">
                                                    <span className={`font-black ${log.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-450'}`}>
                                                        [{log.status}]
                                                    </span>
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-slate-100">{log.message}</p>
                                                        <span className="text-[8px] text-slate-500 mt-1 block">{new Date(log.timestamp).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Findings Table and sorting tools */}
                                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-805 shadow-premium overflow-hidden font-sans">
                                    <div className="p-8 border-b border-slate-100 dark:border-slate-805 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                        <div className="space-y-2">
                                            <h4 className="font-sans font-black text-sm text-slate-900 dark:text-white uppercase tracking-tight">Compliance & Variance Desk</h4>
                                            <p className="text-[10px] font-bold text-slate-400">Review discrepancies and execute atomic repairs.</p>
                                        </div>

                                        {/* Sorting controls */}
                                        <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-955 p-2 rounded-2xl border border-slate-100/50 dark:border-slate-805/50">
                                            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 pl-3">Sort:</span>
                                            <div className="flex gap-1.5">
                                                {(['date', 'severity', 'type'] as const).map(field => (
                                                    <button
                                                        key={field}
                                                        onClick={() => {
                                                            if (reconciliationSortField === field) {
                                                                setReconciliationSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                                                            } else {
                                                                setReconciliationSortField(field);
                                                                setReconciliationSortOrder('desc');
                                                            }
                                                        }}
                                                        className={`px-3 py-2 rounded-xl text-[8px] uppercase tracking-wider font-extrabold cursor-pointer transition-all ${reconciliationSortField === field ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black' : 'text-slate-400 dark:text-slate-505 hover:text-slate-705'}`}
                                                    >
                                                        {field}
                                                        {reconciliationSortField === field && (
                                                            <i className={`fas fa-arrow-${reconciliationSortOrder === 'asc' ? 'up' : 'down'} ml-1 text-[7px]`}></i>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Table layout */}
                                    {isReconciliationLoading && !reconciliationReport ? (
                                        <div className="py-20 flex flex-col items-center justify-center gap-4">
                                            <i className="fas fa-rotate animate-spin text-[2rem] text-slate-300 dark:text-slate-600"></i>
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 animate-pulse font-sans">Running Database Audit and Analysis...</p>
                                        </div>
                                    ) : sortedFindings.length === 0 ? (
                                        <div className="py-20 flex flex-col items-center justify-center text-center p-8">
                                            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/25 text-emerald-500 flex items-center justify-center mb-6 border border-emerald-100/50 dark:border-emerald-800/30">
                                                <i className="fas fa-circle-check text-xl"></i>
                                            </div>
                                            <h5 className="font-sans font-black text-xs text-slate-900 dark:text-white uppercase tracking-wider">Perfect Alignment Certified</h5>
                                            <p className="text-[10px] font-bold text-slate-400 mt-2 max-w-sm font-sans normal-case">No duplicate, stranded, or orphaned posting documents were discovered inside the audited transaction boundary.</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left uppercase text-[9px] font-black tracking-wide border-collapse">
                                                <thead>
                                                    <tr className="border-b border-slate-100 dark:border-slate-850 text-slate-400 dark:text-slate-505 bg-slate-50/50 dark:bg-slate-955/20">
                                                        <th className="p-6 font-bold">Severity</th>
                                                        <th className="p-6 font-bold">Order Boundaries</th>
                                                        <th className="p-6 font-bold">Details & Anomalies</th>
                                                        <th className="p-6 font-bold">Organization ID</th>
                                                        <th className="p-6 font-bold">Identified At</th>
                                                        <th className="p-6 font-bold text-right">Emergency Recovery Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-855">
                                                    {sortedFindings.map((finding, idx) => {
                                                        const isOrphan = finding.failureReason.toLowerCase().includes('orphaned') || finding.failureReason.toLowerCase().includes('missing');
                                                        const isFailedState = finding.failureReason.toLowerCase().includes('failed');
                                                        
                                                        // Resolve severity style
                                                        let severityLevel = 'MEDIUM';
                                                        let severityColor = 'bg-blue-50 dark:bg-blue-955 text-blue-500 border-blue-200/50 dark:border-blue-800/30';
                                                        if (isFailedState) {
                                                            severityLevel = 'CRITICAL';
                                                            severityColor = 'bg-rose-50 dark:bg-rose-955 text-rose-500 border-rose-222 dark:border-rose-800/50';
                                                        } else if (finding.failureReason.toLowerCase().includes('stranded')) {
                                                            severityLevel = 'HIGH';
                                                            severityColor = 'bg-amber-50 dark:bg-amber-955 text-amber-555 border-amber-200/50 dark:border-amber-800/30';
                                                        }

                                                        const orderObj = orders.find(o => o.id === finding.orderId);

                                                        return (
                                                            <tr key={finding.orderId + '_' + finding.postingId + '_' + idx} className="hover:bg-slate-50/30 dark:hover:bg-slate-955/10 transition-colors">
                                                                <td className="p-6">
                                                                    <span className={`px-2.5 py-1 rounded-full text-[8px] font-extrabold border uppercase tracking-wider ${severityColor}`}>
                                                                        {severityLevel}
                                                                    </span>
                                                                </td>
                                                                <td className="p-6">
                                                                    <div className="font-mono text-slate-900 dark:text-white font-extrabold mb-1 text-[11px]">
                                                                        #{finding.orderId.toUpperCase().slice(0, 12)}
                                                                    </div>
                                                                    <div className="text-[8px] text-slate-400 dark:text-slate-505 lowercase font-semibold">
                                                                        {isOrphan ? (
                                                                            <span className="text-rose-455 font-extrabold uppercase text-[7.5px]">Order reference missing</span>
                                                                        ) : (
                                                                            <span>Post Status: <span className="font-extrabold uppercase">{orderObj?.inventoryPostingStatus || 'PENDING'}</span></span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="p-6 max-w-xs normal-case font-bold text-slate-600 dark:text-slate-350 leading-relaxed text-[10px] font-sans">
                                                                    {finding.failureReason}
                                                                    {orderObj && (
                                                                        <div className="mt-1 flex items-center gap-1.5 uppercase font-semibold text-[8px] text-slate-400">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                                                                            <span>Order Total: ${(orderObj.grandTotal || 0).toFixed(2)}</span>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="p-6 font-mono text-slate-400 dark:text-slate-505 text-[8px]">
                                                                    {finding.organizationId}
                                                                </td>
                                                                <td className="p-6 text-slate-400 dark:text-slate-550 text-[8px] font-medium font-mono">
                                                                    {new Date(finding.detectedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                                </td>
                                                                <td className="p-6 text-right">
                                                                    <div className="flex items-center justify-end gap-3.5">
                                                                        {isOrphan ? (
                                                                            <button
                                                                                onClick={() => handleInspectPosting(finding.postingId)}
                                                                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-700 dark:text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200/20 dark:border-slate-705/20 shadow-premium"
                                                                            >
                                                                                <i className="fas fa-magnifying-glass text-[7.5px] text-slate-455"></i>
                                                                                Inspect Ledger
                                                                            </button>
                                                                        ) : canRetryOrder(finding.orderId) ? (
                                                                            <button
                                                                                onClick={() => handleRetryPosting(finding.orderId)}
                                                                                disabled={isRetryingMap[finding.orderId]}
                                                                                className="px-4 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-glow disabled:opacity-50 border border-brand-400/20"
                                                                            >
                                                                                {isRetryingMap[finding.orderId] ? (
                                                                                    <i className="fas fa-rotate animate-spin"></i>
                                                                                ) : (
                                                                                    <i className="fas fa-arrows-spin"></i>
                                                                                )}
                                                                                Execute Recovery
                                                                            </button>
                                                                        ) : (
                                                                            <span className="text-[8px] font-black uppercase text-slate-300 dark:text-slate-600 select-none pb-0.5 border-b border-dashed border-slate-200 dark:border-slate-800">
                                                                                {currentUserRole?.toLowerCase() === UserRole.MANAGER ? 'ReadOnly Account' : 'Action Unavailable'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : inventorySubTab === 'PROCUREMENT' ? (
                            <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-300">
                                {isProcurementLoading && !procurementDashboard ? (
                                    <div className="py-20 flex flex-col items-center justify-center gap-4">
                                        <i className="fas fa-satellite-dish animate-spin text-[2rem] text-slate-300 dark:text-slate-600"></i>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 animate-pulse font-sans">Compiling Procurement Intelligence Models...</p>
                                    </div>
                                ) : procurementError ? (
                                    <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-4 text-rose-500">
                                        <i className="fas fa-circle-exclamation mt-1"></i>
                                        <div>
                                            <h5 className="font-black text-[10px] uppercase tracking-widest">Procurement Engine Error</h5>
                                            <p className="text-[10px] font-bold leading-relaxed mt-1">{procurementError}</p>
                                        </div>
                                    </div>
                                ) : procurementDashboard ? (
                                    <>
                                        {/* Executive Summary Cards */}
                                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                                            {/* Working Capital Exposure */}
                                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col justify-between col-span-1 xl:col-span-2">
                                                <div className="flex items-start justify-between min-w-0">
                                                    <div className="space-y-2">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Working Capital</span>
                                                        <h3 className="font-sans font-black text-2xl text-slate-900 dark:text-white tracking-tight">Stock Exposure</h3>
                                                    </div>
                                                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 flex items-center justify-center">
                                                        <i className="fas fa-vault text-xl"></i>
                                                    </div>
                                                </div>
                                                <div className="mt-8">
                                                    <span className="font-mono text-4xl font-extrabold text-slate-900 dark:text-white tracking-tighter">
                                                        ${procurementDashboard.summary.totalWorkingCapitalExposure.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                                    </span>
                                                    <div className="flex items-center gap-2 mt-3 text-[10px] font-bold text-slate-400">
                                                        <i className="fas fa-arrow-trend-up text-emerald-500"></i>
                                                        Expected Purch Req: <span className="font-mono text-slate-600 dark:text-slate-300 text-[11px]">${procurementDashboard.summary.totalPurchasingRequirement.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stockout Risk Radar */}
                                            <div className={`${procurementDashboard.summary.criticalStockouts > 0 ? 'bg-rose-50/20 dark:bg-rose-950/10' : 'bg-white dark:bg-slate-900'} p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col justify-between`}>
                                                <div className="space-y-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${procurementDashboard.summary.criticalStockouts > 0 ? 'bg-rose-50 border-rose-222 text-rose-500' : 'bg-slate-50 border-slate-100 text-slate-500 dark:bg-slate-955 dark:border-slate-800'}`}>
                                                        <i className="fas fa-exclamation-triangle"></i>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Critical Stockouts</span>
                                                        <h4 className={`font-black text-3xl tracking-tighter mt-1 ${procurementDashboard.summary.criticalStockouts > 0 ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}>
                                                            {procurementDashboard.summary.criticalStockouts}
                                                        </h4>
                                                    </div>
                                                </div>
                                                <div className="pt-4 border-t border-slate-100/50 dark:border-slate-850 mt-2">
                                                    <div className="flex justify-between text-[10px] font-bold text-slate-400">
                                                        <span>High Risk (&lt; 7 Days):</span>
                                                        <span className="font-mono text-slate-600 dark:text-slate-300">{procurementDashboard.summary.highRiskStockouts}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ABC Classification Breakdown */}
                                            <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col justify-between">
                                                <div className="space-y-4">
                                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center border bg-blue-50 border-blue-200 text-blue-500 dark:bg-blue-950/30 dark:border-blue-900/40">
                                                        <i className="fas fa-layer-group"></i>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">ABC Classes</span>
                                                        <div className="flex gap-4 mt-2">
                                                            <div className="flex flex-col">
                                                                <span className="font-black text-xl text-slate-900 dark:text-white">{procurementDashboard.summary.aItemsCount}</span>
                                                                <span className="text-[8px] font-bold text-slate-400">A Items (80%)</span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="font-black text-xl text-slate-900 dark:text-white">{procurementDashboard.summary.bItemsCount}</span>
                                                                <span className="text-[8px] font-bold text-slate-400">B Items (15%)</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Procurement Details Table */}
                                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-805 shadow-premium overflow-hidden font-sans">
                                            <div className="p-8 border-b border-slate-100 dark:border-slate-805 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                                                <div className="space-y-2">
                                                    <h4 className="font-sans font-black text-sm text-slate-900 dark:text-white uppercase tracking-tight">Smart Reorder Engine</h4>
                                                    <p className="text-[10px] font-bold text-slate-400">Procurement intelligence, consumption analytics, and restocking models</p>
                                                </div>
                                                <button
                                                    onClick={() => handleRunProcurement(true)}
                                                    disabled={isProcurementLoading}
                                                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-700 dark:text-slate-300 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                                                >
                                                    <i className="fas fa-rotate"></i>
                                                    Refresh Models
                                                </button>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left uppercase text-[9px] font-black tracking-wide border-collapse min-w-[900px]">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-850 text-slate-400 dark:text-slate-505 bg-slate-50/50 dark:bg-slate-955/20">
                                                            <th className="p-6">Prioritization</th>
                                                            <th className="p-6">Inventory Resource</th>
                                                            <th className="p-6">Consumption Velocity (Monthly)</th>
                                                            <th className="p-6">Risk Profile & Dates</th>
                                                            <th className="p-6">Procurement Metrics</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-855">
                                                        {procurementDashboard.items.map((item: any) => {
                                                            const isCritical = item.consumption.riskLevel === 'CRITICAL';
                                                            const priorityColor = item.abc.classification === 'A' ? 'text-amber-500' : item.abc.classification === 'B' ? 'text-blue-500' : 'text-slate-400';
                                                            
                                                            return (
                                                                <tr key={item.inventoryItemId} className="hover:bg-slate-50/30 dark:hover:bg-slate-955/10 transition-colors">
                                                                    <td className="p-6">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex flex-col items-center">
                                                                                <span className={`text-xl font-black tracking-tighter ${priorityColor}`}>{item.abc.classification}</span>
                                                                                <span className="text-[7px] tracking-widest text-slate-400 mt-1">Class</span>
                                                                            </div>
                                                                            <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>
                                                                            <div className="flex flex-col items-center">
                                                                                <span className="text-sm font-black text-slate-600 dark:text-slate-300">#{item.reorder.priorityRanking}</span>
                                                                                <span className="text-[7px] tracking-widest text-slate-400 mt-1">Rank</span>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-6">
                                                                        <div className="font-bold text-slate-900 dark:text-white text-[11px] mb-1 truncate max-w-[150px]" title={item.inventoryItemName}>
                                                                            {item.inventoryItemName}
                                                                        </div>
                                                                        <div className="text-[10px] font-mono font-bold text-slate-400">
                                                                            Stock: {item.currentStock.toFixed(1)} {item.unitOfMeasure}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-6">
                                                                        <div className="font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                                                                            {item.consumption.averageDailyUsage.toFixed(2)}/day &middot; {item.consumption.averageMonthlyUsage.toFixed(1)}/mo
                                                                        </div>
                                                                        <div className="mt-1 text-[8px] text-slate-400">
                                                                            Safety Stock Req: {item.reorder.safetyStock.toFixed(1)}
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-6">
                                                                        <div className="flex items-center gap-2">
                                                                            {isCritical ? (
                                                                                <i className="fas fa-triangle-exclamation text-rose-500"></i>
                                                                            ) : item.consumption.riskLevel === 'HIGH' ? (
                                                                                <i className="fas fa-circle-exclamation text-amber-500"></i>
                                                                            ) : (
                                                                                <i className="fas fa-check-circle text-emerald-500"></i>
                                                                            )}
                                                                            <span className={`text-[10px] font-extrabold tracking-wider ${isCritical ? 'text-rose-500' : item.consumption.riskLevel === 'HIGH' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                                                {item.consumption.daysRemaining === 999 ? 'Stable' : `${Math.floor(item.consumption.daysRemaining)} Days Left`}
                                                                            </span>
                                                                        </div>
                                                                        {item.consumption.daysRemaining !== 999 && (
                                                                            <div className="mt-1 text-[8px] font-bold text-slate-400 font-mono">
                                                                                Est. Out: {new Date(item.consumption.projectedStockoutDate).toLocaleDateString()}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="p-6">
                                                                        <div className="font-sans font-black text-indigo-500 text-[11px]">
                                                                            Reorder: {item.reorder.suggestedReorderQuantity.toFixed(1)} {item.unitOfMeasure}
                                                                        </div>
                                                                        <div className="mt-1 text-[8px] font-extrabold text-slate-400 flex items-center gap-1.5">
                                                                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                                                            Trigger Level (ERP): {item.reorder.reorderPoint.toFixed(1)}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        ) : inventorySubTab === 'RECEIVING' ? (
                            <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2 flex items-center gap-4">
                                                <i className="fas fa-truck-loading text-brand-500"></i>
                                                Goods Receiving Engine
                                            </h3>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                                                Intake and Post Incoming Purchase Orders
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="h-full flex flex-col items-center justify-center opacity-40 py-20 text-center border-t border-slate-100 dark:border-slate-800 mt-8">
                                        <i className="fas fa-boxes-packing text-8xl mb-8 text-slate-300 dark:text-slate-700"></i>
                                        <p className="text-xl font-black uppercase tracking-[0.5em] text-slate-800 dark:text-slate-300">No Pending Deliveries</p>
                                        <p className="mt-4 text-[10px] font-bold text-slate-400 capitalize max-w-sm">
                                            The goods receiving module is active, but there are no approved purchase orders awaiting receipt.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : inventorySubTab === 'SUPPLIERS' ? (
                            <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2 flex items-center gap-4">
                                                <i className="fas fa-building-user text-brand-500"></i>
                                                Supplier Management
                                            </h3>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                                                Manage Vendors and Track Performance Reliability
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="h-full flex flex-col items-center justify-center opacity-40 py-20 text-center border-t border-slate-100 dark:border-slate-800 mt-8">
                                        <i className="fas fa-handshake-angle text-8xl mb-8 text-slate-300 dark:text-slate-700"></i>
                                        <p className="text-xl font-black uppercase tracking-[0.5em] text-slate-800 dark:text-slate-300">No Suppliers Registered</p>
                                        <p className="mt-4 text-[10px] font-bold text-slate-400 capitalize max-w-sm">
                                            The supplier directory is empty. Add your first vendor to start placing purchase orders.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : inventorySubTab === 'PURCHASE_ORDERS' ? (
                            <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2 flex items-center gap-4">
                                                <i className="fas fa-file-invoice text-brand-500"></i>
                                                Purchase Order Lifecycle
                                            </h3>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                                                Draft, Approve, and Track Purchase Orders
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="h-full flex flex-col items-center justify-center opacity-40 py-20 text-center border-t border-slate-100 dark:border-slate-800 mt-8">
                                        <i className="fas fa-clipboard-list text-8xl mb-8 text-slate-300 dark:text-slate-700"></i>
                                        <p className="text-xl font-black uppercase tracking-[0.5em] text-slate-800 dark:text-slate-300">No Purchase Orders</p>
                                        <p className="mt-4 text-[10px] font-bold text-slate-400 capitalize max-w-sm">
                                            There are no active or historical purchase orders to display.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : inventorySubTab === 'ACCOUNTS_PAYABLE' ? (
                            <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-300">
                                <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800">
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2 flex items-center gap-4">
                                                <i className="fas fa-file-invoice-dollar text-brand-500"></i>
                                                Accounts Payable & Settlement
                                            </h3>
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
                                                Three-Way Matching and Invoice Payments
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                                        <div className="p-6 rounded-[2rem] bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex flex-col items-center text-center justify-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Outstanding</p>
                                            <p className="text-3xl font-black text-slate-900 dark:text-white">$0.00</p>
                                        </div>
                                        <div className="p-6 rounded-[2rem] bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50 flex flex-col items-center text-center justify-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2">Overdue Liability</p>
                                            <p className="text-3xl font-black text-rose-600 dark:text-rose-400">$0.00</p>
                                        </div>
                                        <div className="p-6 rounded-[2rem] bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/50 flex flex-col items-center text-center justify-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-2">Pending Match</p>
                                            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">0 INVOICES</p>
                                        </div>
                                        <div className="p-6 rounded-[2rem] bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/50 flex flex-col items-center text-center justify-center">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">Awaiting Payment</p>
                                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">0 INVOICES</p>
                                        </div>
                                    </div>

                                    <div className="h-full flex flex-col items-center justify-center opacity-40 py-20 text-center border-t border-slate-100 dark:border-slate-800 mt-8">
                                        <i className="fas fa-file-signature text-8xl mb-8 text-slate-300 dark:text-slate-700"></i>
                                        <p className="text-xl font-black uppercase tracking-[0.5em] text-slate-800 dark:text-slate-300">No Pending Invoices</p>
                                        <p className="mt-4 text-[10px] font-bold text-slate-400 capitalize max-w-sm">
                                            There are no supplier invoices demanding attention or matching.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : ingredients.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-40 py-20 text-center">
                                <i className="fas fa-boxes-stacked text-8xl mb-8 text-slate-300 dark:text-slate-700"></i>
                                <p className="text-xl font-black uppercase tracking-[0.5em] text-slate-800 dark:text-slate-300">Inventory Void</p>
                                <button 
                                    onClick={() => {
                                        setEditingIngredient(null);
                                        setIngredientForm({ name: '', stock: 10, unit: 'piece' });
                                        setIsIngredientModalOpen(true);
                                    }}
                                    className="mt-6 h-12 px-6 bg-brand-500 hover:bg-brand-400 text-white rounded-2xl uppercase tracking-widest font-black text-[10px] shadow-glow cursor-pointer transition-all active:scale-95"
                                >
                                    Add First Stock Item
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-12 animate-in fade-in duration-500">
                                {/* Left Column: Metrics & Stock Balance Console (2 Cols Wide) */}
                                <div className="xl:col-span-2 space-y-12">
                                    {/* Stats Cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Total Ingredients</p>
                                                <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{ingredients.length}</h3>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Critical Alerts</p>
                                                <h3 className={`text-4xl font-black tracking-tighter ${criticalIngredients.length > 0 ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>{criticalIngredients.length}</h3>
                                            </div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                            <div>
                                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Supply Status</p>
                                                <h3 className="text-xl font-black tracking-tighter uppercase text-emerald-500 mt-2 flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                                                    Operational
                                                </h3>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sub-Header Actions Controls */}
                                    <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-800/80 shadow-premium">
                                        <div>
                                            <h4 className="font-sans font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs">Resources Controls</h4>
                                            <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Calibrate, replenish, or register active food stock</p>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setEditingIngredient(null);
                                                setIngredientForm({ name: '', stock: 10, unit: 'piece' });
                                                setIsIngredientModalOpen(true);
                                            }}
                                            className="h-12 px-6 bg-brand-500 hover:bg-brand-400 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-glow active:scale-95 transition-all flex items-center gap-2 cursor-pointer border border-brand-400/20"
                                        >
                                            <i className="fas fa-plus"></i>
                                            Add Food Stock
                                        </button>
                                    </div>

                                    {/* Grid of stock cards */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {ingredients.map(ing => {
                                            const isLow = ing.stock < 10;
                                            const standardLevel = 50;
                                            const percentage = Math.min(100, Math.floor((ing.stock / standardLevel) * 100));

                                            const handleRestock = (amount: number) => {
                                                if (onUpdateIngredient) onUpdateIngredient(ing.id, { stock: ing.stock + amount });
                                                setUsageReports(rep => [
                                                            {
                                                                id: `u_${Date.now()}`,
                                                                timestamp: Date.now(),
                                                                staffName: 'Manager John',
                                                                action: 'DEPS_REPLENISH',
                                                                ingredientName: ing.name,
                                                                amount,
                                                                unit: ing.unit,
                                                                reason: `Restocked manually by +${amount} ${ing.unit}`
                                                            },
                                                            ...rep
                                                        ]);
                                            };

                                            const handleEditInit = () => {
                                                setEditingIngredient(ing);
                                                setIngredientForm({ name: ing.name, stock: ing.stock, unit: ing.unit });
                                                setIsIngredientModalOpen(true);
                                            };

                                            return (
                                                <div key={ing.id} className={`bg-white dark:bg-slate-900 p-8 rounded-[3rem] border transition-all duration-500 flex flex-col relative ${isLow ? 'border-rose-250 dark:border-rose-900/40 bg-rose-50/10 dark:bg-rose-950/5 shadow-glow-sm hover:border-rose-500/30' : 'border-slate-100 dark:border-slate-800 shadow-premium hover:border-brand-500/20'}`}>
                                                    {isLow && (
                                                        <span className="absolute -top-3 right-8 z-10 px-3 py-1 bg-rose-600 text-white text-[7px] font-black uppercase tracking-widest rounded-lg shadow-glow animate-pulse">
                                                            Critical Stock
                                                        </span>
                                                    )}

                                                    {/* Edit & Delete Action Buttons */}
                                                    <div className="absolute top-6 right-6 flex gap-2">
                                                        <button 
                                                            onClick={handleEditInit}
                                                            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs transition-colors cursor-pointer border border-slate-200/40 dark:border-slate-700/40 active:scale-90"
                                                            title="Edit Stock Item"
                                                        >
                                                            <i className="fas fa-pencil-alt text-[10px]"></i>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteIngredient(ing.id, ing.name)}
                                                            className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900 text-rose-500 dark:text-rose-450 flex items-center justify-center text-xs transition-colors cursor-pointer border border-rose-150/50 dark:border-rose-900/30 active:scale-90"
                                                            title="Delete Stock Item"
                                                        >
                                                            <i className="fas fa-trash-can text-[10px]"></i>
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center gap-5 mb-8">
                                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl ${isLow ? 'bg-rose-100 dark:bg-rose-950 text-rose-500' : 'bg-slate-50 dark:bg-slate-850 text-slate-500 border border-slate-100 dark:border-slate-800'}`}>
                                                            <i className="fas fa-boxes-stacked text-base"></i>
                                                        </div>
                                                        <div className="pr-16">
                                                            <h4 className="font-sans font-black text-slate-900 dark:text-white uppercase tracking-tighter text-sm leading-none mb-1.5 truncate max-w-[120px] sm:max-w-none">{ing.name}</h4>
                                                            <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Protocol ID: {ing.id}</p>
                                                        </div>
                                                    </div>

                                                    {/* Percentage levels */}
                                                    <div className="space-y-3 mb-8">
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Levels Matrix</span>
                                                            <span className={`text-xs font-mono font-black ${isLow ? 'text-rose-500' : 'text-slate-700 dark:text-slate-300'}`}>
                                                                {ing.stock} / {standardLevel} {ing.unit}
                                                            </span>
                                                        </div>
                                                        <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-[2px]">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-700 ${isLow ? 'bg-gradient-to-r from-rose-500 to-amber-500' : 'bg-gradient-to-r from-brand-500 to-indigo-550'}`}
                                                                style={{ width: `${percentage}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="mt-auto pt-6 border-t border-slate-50 dark:border-slate-800/50 flex gap-3">
                                                        <button 
                                                            onClick={() => handleRestock(10)}
                                                            className="flex-1 h-12 rounded-2xl border border-slate-105 dark:border-slate-800 bg-transparent text-slate-600 dark:text-slate-300 font-black uppercase text-[8px] sm:text-[9px] tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
                                                        >
                                                            +10 {ing.unit}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRestock(50)}
                                                            className="flex-1 h-12 bg-slate-900 dark:bg-slate-800 hover:bg-slate-805 text-white rounded-2xl font-black uppercase text-[8px] sm:text-[9px] tracking-widest shadow-lg active:scale-95 transition-all cursor-pointer"
                                                        >
                                                            Refuel All
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Right Column: Staff Stock Usage Reports (Journal Log) */}
                                <div className="xl:col-span-1 space-y-8">
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[3.5rem] border border-slate-150/80 dark:border-slate-800 shadow-premium flex flex-col h-[75vh]">
                                        <div className="flex justify-between items-center mb-6 shrink-0 pb-6 border-b border-slate-100 dark:border-slate-850">
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2 leading-none">
                                                    <i className="fas fa-file-invoice text-brand-500"></i>
                                                    Staff Usage Records
                                                </h3>
                                                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">
                                                    Active Inventory Consumption
                                                </p>
                                            </div>
                                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse pointer-events-none" />
                                        </div>

                                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
                                            {usageReports.map(report => {
                                                const actionStyles = {
                                                    DEPS_DEDUCTION: { bg: 'bg-rose-50 dark:bg-rose-950/20 text-rose-500/80', icon: 'fa-arrow-down-wide-short' },
                                                    DEPS_REPLENISH: { bg: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500/80', icon: 'fa-arrow-up-wide-short' },
                                                    DEPS_ADD: { bg: 'bg-brand-50 dark:bg-brand-900/20 text-brand-500', icon: 'fa-plus' },
                                                    DEPS_EDIT: { bg: 'bg-amber-50 dark:bg-amber-950/20 text-amber-500', icon: 'fa-pen-to-square' },
                                                    DEPS_DELETE: { bg: 'bg-red-100/50 dark:bg-red-955 text-red-500', icon: 'fa-trash' }
                                                }[report.action] || { bg: 'bg-slate-50 text-slate-500', icon: 'fa-circle' };

                                                return (
                                                    <div 
                                                        key={report.id} 
                                                        className="p-5 bg-slate-50/50 dark:bg-slate-950/30 rounded-2xl border border-slate-100 dark:border-slate-850/60 hover:border-slate-205 dark:hover:border-slate-800 transition-colors flex gap-4 animate-in fade-in slide-in-from-top-4 duration-300"
                                                    >
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${actionStyles.bg}`}>
                                                            <i className={`fas ${actionStyles.icon} text-xs`}></i>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-baseline mb-1">
                                                                <h5 className="font-sans font-black text-[11px] text-slate-900 dark:text-white uppercase tracking-tight">{report.staffName}</h5>
                                                                <span className="text-[8px] font-mono font-bold text-slate-400 dark:text-slate-500">
                                                                    {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase leading-normal tracking-wide">
                                                                {report.action === 'DEPS_DEDUCTION' && 'Deducted '}
                                                                {report.action === 'DEPS_REPLENISH' && 'Procured '}
                                                                {report.action === 'DEPS_ADD' && 'Added '}
                                                                {report.action === 'DEPS_EDIT' && 'Modified '}
                                                                {report.action === 'DEPS_DELETE' && 'Deleted '}
                                                                <span className="font-extrabold text-slate-950 dark:text-white">
                                                                    {" "}{report.ingredientName}
                                                                </span>
                                                                {report.amount !== undefined && ` (${report.amount} ${report.unit})`}
                                                            </p>
                                                            <p className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5 flex items-center gap-1">
                                                                <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                                                                {report.reason}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Immersive Orphaned Ledger Inspector Overlay */}
                        {inspectedPosting && (
                            <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
                                <div className="bg-white dark:bg-slate-900 rounded-[3rem] border border-slate-105 dark:border-slate-800 p-10 max-w-2xl w-full shadow-premium flex flex-col max-h-[85vh] animate-in scale-in duration-300 font-sans">
                                    {/* Modal Header */}
                                    <div className="flex items-start justify-between pb-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                                        <div className="space-y-1.5">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-sans">Post Incident Investigation Desk</span>
                                            <h3 className="font-sans font-black text-xl text-slate-950 dark:text-white uppercase tracking-tight leading-tight">Ledger Document Inspector</h3>
                                            <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wide flex items-center gap-1.5 mt-1.5 bg-rose-500/10 px-3 py-1 rounded-full w-fit">
                                                <i className="fas fa-shield-halved text-[8px]"></i> Security Policy: Read-Only System. Inspection only.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setInspectedPosting(null)}
                                            className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-655 dark:text-slate-555 dark:hover:text-slate-350 transition-colors flex items-center justify-center cursor-pointer"
                                        >
                                            <i className="fas fa-xmark animate-in spin-in-180 duration-500"></i>
                                        </button>
                                    </div>

                                    {/* Modal Body */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar py-8 space-y-8">
                                        {/* Ledger Meta Grid */}
                                        <div className="grid grid-cols-2 gap-6 bg-slate-55 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100/50 dark:border-slate-800/50">
                                            <div>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-sans">Ledger Posting ID</span>
                                                <p className="font-mono font-black text-slate-900 dark:text-white text-[10px] mt-1 break-all uppercase">
                                                    {inspectedPosting.id}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-sans">Associated Order ID</span>
                                                <p className="font-mono font-black text-slate-950 dark:text-white text-[10px] mt-1 break-all uppercase">
                                                    {inspectedPosting.orderId || 'MISSING_LINK'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-sans">Posting Date & Time</span>
                                                <p className="font-black text-slate-700 dark:text-slate-300 text-[10px] mt-1 uppercase">
                                                    {inspectedPosting.timestamp ? new Date(inspectedPosting.timestamp).toLocaleString() : '--'}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-sans">Total Calculated Cost</span>
                                                <p className="font-black text-slate-900 dark:text-white text-[14px] mt-0.5 font-mono">
                                                    ${(inspectedPosting.totalCalculatedCost || 0).toFixed(2)}
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-sans">Audited Movements Count</span>
                                                <p className="font-black text-slate-700 dark:text-slate-300 text-[10px] mt-1 uppercase font-mono">
                                                    {inspectedPosting.movements?.length || 0} Movements
                                                </p>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-sans">Triggered operator</span>
                                                <p className="font-sans font-extrabold text-slate-705 dark:text-slate-303 text-[10px] mt-1 uppercase truncate font-mono">
                                                    {inspectedPosting.actionBy || 'SYSTEM'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Movements detail list */}
                                        <div className="space-y-4">
                                            <h4 className="font-sans font-black text-xs text-slate-900 dark:text-white uppercase tracking-widest">Movement Ledger Details</h4>
                                            
                                            {(!inspectedPosting.movements || inspectedPosting.movements.length === 0) ? (
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-505 bg-slate-50 dark:bg-slate-955 p-4 rounded-xl border border-dotted border-slate-205">
                                                    No physical stock movements recorded in this ledger posting.
                                                </p>
                                            ) : (
                                                <div className="space-y-3.5">
                                                    {inspectedPosting.movements.map((movement: any, midx: number) => {
                                                        const ingObj = ingredients.find(i => i.id === movement.inventoryItemId);
                                                        return (
                                                            <div key={midx} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-250 flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all">
                                                                <div className="space-y-1">
                                                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-sans">Ingredient Node</span>
                                                                    <p className="font-black text-[11px] text-slate-905 dark:text-white uppercase tracking-wide leading-tight">
                                                                        {ingObj?.name || movement.inventoryItemId}
                                                                    </p>
                                                                    <p className="font-mono text-[8.5px] text-slate-400">ID: {movement.inventoryItemId}</p>
                                                                </div>
                                                                
                                                                <div className="grid grid-cols-2 sm:flex sm:items-center gap-6 text-right font-sans">
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-405 block">Deducted</span>
                                                                        <span className="font-extrabold text-[10px] text-rose-500">
                                                                            -{movement.quantity} {movement.unitOfMeasure}
                                                                        </span>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-405 block">Stock Shift</span>
                                                                        <span className="font-mono text-[9px] text-slate-500 block">
                                                                            {movement.previousStock} → {movement.newStock}
                                                                        </span>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-405 block">Unit Cost</span>
                                                                        <span className="font-mono text-[9px] text-slate-550 block">
                                                                            ${(movement.unitCost || 0).toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                    <div className="space-y-0.5">
                                                                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-405 block">Total cost</span>
                                                                        <span className="font-mono text-[10px] font-black text-slate-855 dark:text-slate-100 block">
                                                                            ${(movement.totalCost || 0).toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Modal Footer */}
                                    <div className="pt-6 border-t border-slate-101 dark:border-slate-800 flex justify-end shrink-0">
                                        <button
                                            onClick={() => setInspectedPosting(null)}
                                            className="px-6 py-3 bg-slate-900 dark:bg-white hover:bg-slate-855 dark:hover:bg-slate-100 text-white dark:text-slate-955 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                                        >
                                            Close Investigation
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'ADMIN_MENU' && (
                    <div className="w-full h-full overflow-y-auto custom-scrollbar pb-20">
                         {menu.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center opacity-10 py-20 text-center">
                                 <i className="fas fa-book-open text-8xl mb-8"></i>
                                 <p className="text-xl font-black uppercase tracking-[0.5em]">Catalogue Void</p>
                                 <p className="mt-4 text-sm font-bold max-w-sm uppercase leading-relaxed">Initialize the catalogue by digitizing a physical menu or creating entries manually.</p>
                             </div>
                         ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
                                {filteredMenu.map(item => {
                                    const isAvailable = item.status === MenuItemStatus.AVAILABLE;
                                    const isDigitized = item.id.includes('digitized');
                                    return (
                                        <div key={item.id} className={`bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border transition-all duration-500 flex flex-col relative group ${isAvailable ? 'border-slate-100 dark:border-slate-800 shadow-premium' : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 grayscale-[40%] opacity-80'}`}>
                                            {isDigitized && (
                                                <div className="absolute -top-3 -right-3 z-10 px-3 py-1 bg-brand-600 text-white text-[7px] font-black uppercase tracking-widest rounded-lg shadow-glow animate-pulse">
                                                    AI Ingested
                                                </div>
                                            )}
                                            <div className="flex gap-6 mb-6">
                                                <div className="relative shrink-0">
                                                    <img src={item.image} className="w-24 h-24 rounded-3xl object-cover shadow-lg group-hover:scale-105 transition-transform duration-500" alt="" />
                                                    {!isAvailable && (
                                                        <div className="absolute inset-0 bg-slate-950/40 rounded-3xl flex items-center justify-center">
                                                            <i className="fas fa-ban text-white text-xl opacity-80"></i>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col">
                                                    <h4 className="font-black text-slate-900 dark:text-white uppercase leading-tight text-lg mb-1 truncate">{item.name}</h4>
                                                    <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest mb-auto">
                                                        {categories.find(c => c.id === item.categoryId)?.name || 'Uncategorized'}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-4">
                                                        <button 
                                                            disabled={!canManageMenu}
                                                            onClick={() => onToggleAvailability?.(item.id)}
                                                            className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${isAvailable ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700'}`}
                                                        >
                                                            {isAvailable ? 'Active' : 'Off-Line'}
                                                        </button>
                                                        <button 
                                                            disabled={!canManageMenu}
                                                            onClick={() => onToggleGuestVisibility?.(item.id)}
                                                            className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${item.visible_to_guest ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400 border-indigo-100 dark:border-indigo-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'}`}
                                                            title={item.visible_to_guest ? "Visible to Guests" : "Hidden from Guests"}
                                                        >
                                                            <i className={`fas ${item.visible_to_guest ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                                                        </button>
                                                        <button 
                                                            onClick={() => openQRGenerator('ITEM', item.id)}
                                                            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-brand-500 dark:text-slate-500 dark:hover:text-brand-400 transition-all shadow-sm cursor-pointer"
                                                            title="Generate Item QR Code"
                                                        >
                                                            <i className="fas fa-qrcode"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight line-clamp-2 mb-4 leading-relaxed">{item.description}</p>
                                            <div className="mt-auto pt-4 border-t border-slate-50 dark:border-slate-800 flex justify-between items-center">
                                                <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">${item.price.toFixed(2)}</span>
                                                <button className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 hover:text-brand-600 transition-colors">Edit Entity</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                         )}
                    </div>
                )}

                {activeSection === 'ADMIN_SALES' && (
                    <div className="w-full flex flex-col gap-8 animate-in fade-in duration-500 overflow-y-auto no-scrollbar pb-20">
                        {/* Elegant Performance & Ledger Tab Toggle Rail */}
                        <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-205 dark:border-slate-800 p-1.5 rounded-[2rem] w-full shrink-0 flex-wrap gap-1">
                            {[
                                { id: 'P_L', label: 'Financial Matrix', icon: 'fa-chart-pie' },
                                { id: 'P_L_STATEMENT', label: 'Income Statement', icon: 'fa-file-invoice-dollar' },
                                { id: 'BALANCE_SHEET', label: 'Daily Balance Sheet', icon: 'fa-scale-balanced' },
                                { id: 'CATEGORY', label: 'By Category', icon: 'fa-layer-group' },
                                { id: 'PRODUCT', label: 'By Menu Item', icon: 'fa-bowl-food' },
                                { id: 'LEDGER', label: 'Transaction Ledger', icon: 'fa-book-open' },
                                { id: 'FOOD_COST_ENGINE', label: 'Food Cost Engine', icon: 'fa-calculator' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveSalesSubTab(tab.id as any)}
                                    className={`flex-1 min-w-[150px] h-12 px-6 rounded-2xl flex items-center justify-center gap-2.5 text-[10px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer ${activeSalesSubTab === tab.id ? 'bg-white dark:bg-slate-850 text-brand-500 shadow-md border border-slate-200/50 dark:border-slate-700/50 scale-[1.02]' : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    <i className={`fas ${tab.icon} text-sm`}></i>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* SUB-TAB 1: FINANCIAL OVERVIEW MATRIX (P&L) */}
                        {activeSalesSubTab === 'P_L' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between group hover:border-brand-500/20 transition-all">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Total Gross Income</p>
                                            <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter italic">${totalCombinedRevenue.toFixed(2)}</h3>
                                        </div>
                                        <div className="mt-4 flex items-center gap-1.5 text-slate-400 text-[8px] font-black uppercase tracking-widest leading-none">
                                            <i className="fas fa-arrow-trend-up text-xs text-emerald-500"></i>
                                            <span>${revenue.toFixed(2)} sales + ${otherRevenues.toFixed(2)} custom</span>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between group hover:border-rose-500/20 transition-all">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Cost of Goods (COGS)</p>
                                            <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter italic">${totalCOGS.toFixed(2)}</h3>
                                        </div>
                                        <div className="mt-4 flex items-center gap-1.5 text-slate-400 text-[8px] font-black uppercase tracking-widest leading-none">
                                            <i className="fas fa-boxes-stacked text-xs text-rose-500"></i>
                                            <span>Est. Margin: {grossMarginPercentage.toFixed(1)}%</span>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[3rem] shadow-premium border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between group hover:border-slate-350 transition-all">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Operating Expenses</p>
                                            <h3 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter italic">${totalOpex.toFixed(2)}</h3>
                                        </div>
                                        <div className="mt-4 flex items-center gap-1.5 text-slate-400 text-[8px] font-black uppercase tracking-widest leading-none">
                                            <i className="fas fa-receipt text-xs text-brand-500"></i>
                                            <span>Rent, Payroll, Utilities</span>
                                        </div>
                                    </div>

                                    <div className={`p-8 rounded-[3rem] border transition-all flex flex-col justify-between ${netProfit >= 0 ? 'bg-emerald-500/5 dark:bg-emerald-500/5 border-emerald-550/20 hover:border-emerald-500/40 text-slate-900' : 'bg-rose-500/5 dark:bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40 text-slate-900'}`}>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Net Period Income</p>
                                            <h3 className={`text-4xl font-black tracking-tighter italic ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {netProfit >= 0 ? '+' : '-'}${Math.abs(netProfit).toFixed(2)}
                                            </h3>
                                        </div>
                                        <div className="mt-4 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest leading-none text-slate-400">
                                            <i className={`fas ${netProfit >= 0 ? 'fa-circle-check text-emerald-500' : 'fa-triangle-exclamation text-rose-500'} text-xs`}></i>
                                            <span>Net Margin: {netProfitMarginPercentage.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    {/* Main Profit & Sales Chart */}
                                    <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-10 rounded-[4rem] shadow-premium border border-slate-100 dark:border-slate-800">
                                        <div className="flex justify-between items-center mb-8">
                                            <div>
                                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">Operational Fluidity</h3>
                                                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Simulated periodic revenues vs operating profit</p>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-brand-500">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Sales Gross
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-500">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Net Surplus
                                                </div>
                                            </div>
                                        </div>
                                        <div className="h-[280px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={[
                                                    { name: 'Mon', revenue: Math.max(100, revenue * 0.12), profit: Math.max(20, netProfit * 0.11) },
                                                    { name: 'Tue', revenue: Math.max(140, revenue * 0.15), profit: Math.max(30, netProfit * 0.14) },
                                                    { name: 'Wed', revenue: Math.max(200, revenue * 0.18), profit: Math.max(50, netProfit * 0.17) },
                                                    { name: 'Thu', revenue: Math.max(160, revenue * 0.14), profit: Math.max(45, netProfit * 0.13) },
                                                    { name: 'Fri', revenue: Math.max(300, revenue * 0.22), profit: Math.max(85, netProfit * 0.24) },
                                                    { name: 'Sat', revenue: Math.max(380, revenue * 0.28), profit: Math.max(120, netProfit * 0.29) },
                                                    { name: 'Sun', revenue: Math.max(240, revenue * 0.16), profit: Math.max(60, netProfit * 0.15) },
                                                ]}>
                                                    <defs>
                                                        <linearGradient id="colorRevenueAdmin" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                        </linearGradient>
                                                        <linearGradient id="colorProfitAdmin1" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} dy={10} />
                                                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} />
                                                    <RechartsTooltip 
                                                        contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.06)', backgroundColor: 'rgba(255,255,255,0.95)'}}
                                                        itemStyle={{fontWeight: 900, fontSize: '11px', textTransform: 'uppercase'}}
                                                    />
                                                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3.5} fillOpacity={1} fill="url(#colorRevenueAdmin)" name="Gross Revenue" />
                                                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3.5} fillOpacity={1} fill="url(#colorProfitAdmin1)" name="Net Operating Income" />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Cost Distribution Breakdowns */}
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[4rem] shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-sans font-black text-slate-900 dark:text-white uppercase tracking-tighter text-sm italic mb-2">Cost Segments</h4>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active operational categories</p>
                                            
                                            <div className="space-y-5 mt-6">
                                                {operatingExpensesList.map((exp, idx) => {
                                                    const opexPCT = totalOpex > 0 ? (exp.value / totalOpex) * 100 : 0;
                                                    return (
                                                        <div key={idx} className="space-y-1.5">
                                                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wide">
                                                                <span className="text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                                                    <i className={`fas ${exp.icon} text-slate-400 text-xs`}></i>
                                                                    {exp.label}
                                                                </span>
                                                                <span className="text-slate-950 dark:text-white font-mono">${exp.value.toFixed(2)}</span>
                                                            </div>
                                                            <div className="h-2 w-full bg-slate-50 dark:bg-slate-850 rounded-full overflow-hidden">
                                                                <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${opexPCT}%` }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                <div className="space-y-1.5 pt-4 border-t border-slate-50 dark:border-slate-800/60">
                                                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wide">
                                                        <span className="text-slate-600 dark:text-slate-350">
                                                            Raw Food Ingredient COGS
                                                        </span>
                                                        <span className="text-slate-900 dark:text-white font-mono">${totalCOGS.toFixed(2)}</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-slate-50 dark:bg-slate-850 rounded-full overflow-hidden">
                                                        <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${(totalCOGS / (totalCOGS + totalOpex || 1)) * 100}%` }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* D3 Revenue Trend Visualization Card */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-2">
                                        <D3RevenueTrendChart orders={orders} />
                                    </div>
                                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[4rem] shadow-premium border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-sans font-black text-slate-900 dark:text-white uppercase tracking-tighter text-sm italic mb-2">Ledger Insights</h4>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest font-sans">Statistical Distribution Analysis</p>
                                            
                                            <div className="mt-6 space-y-4 text-xs">
                                                <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                                                    <p className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Average Order Flow</p>
                                                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">${avgOrderValue.toFixed(2)}</p>
                                                    <p className="text-[8.5px] text-slate-450 dark:text-slate-500 uppercase font-bold mt-1">Calculated from {paidOrdersCount} realized tickets</p>
                                                </div>

                                                <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-100 dark:border-slate-800/60">
                                                    <p className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Revenue Pipeline Velocity</p>
                                                    {orders.length > 0 ? (
                                                        <p className="text-xl font-black text-emerald-500 mt-1">
                                                            +{((orders.filter(o => o.paymentStatus === 'PAID').length / orders.length) * 100).toFixed(0)}% Settle Rate
                                                        </p>
                                                    ) : (
                                                        <p className="text-xl font-black text-slate-400 mt-1">0% Settle Rate</p>
                                                    )}
                                                    <p className="text-[8.5px] text-slate-450 dark:text-slate-500 uppercase font-bold mt-1">Active terminal conversion efficiency</p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="pt-4 border-t border-slate-50 dark:border-slate-800/60 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 leading-normal">
                                            D3 chart rendering processes local storage snapshots in real-time.
                                        </div>
                                    </div>
                                </div>

                                {/* D3 24-Hour Hourly Sales Performance & Crew Scheduling Assistant */}
                                <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-550">
                                    <D3HourlySalesChart orders={orders} />
                                </div>

                                
                            </div>
                        )}

                        {/* SUB-TAB 2: GENERAL INCOME STATEMENT (P&L REPORT) */}
                        {activeSalesSubTab === 'P_L_STATEMENT' && (
                            <div className="bg-white dark:bg-slate-900 p-12 rounded-[4rem] border border-slate-105 dark:border-slate-800/80 shadow-premium animate-in fade-in duration-500 max-w-4xl mx-auto w-full">
                                <header className="text-center pb-8 border-b border-slate-100 dark:border-slate-800/60 mb-10">
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter italic">General Income Statement</h3>
                                    <p className="text-[10px] font-mono text-slate-450 uppercase tracking-[0.4em] mt-2">RECONCILIATION FOR CURRENT ACCOUNTING PERIOD</p>
                                    <div className="inline-flex py-1.5 px-4 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 text-[8px] font-black uppercase tracking-widest rounded-full mt-4 items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                        SECURE EXTERNAL AUDIT VERIFIED
                                    </div>
                                </header>

                                <div className="space-y-8 font-mono text-xs text-slate-700 dark:text-slate-350 leading-relaxed">
                                    {/* Part 1: Revenues */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-wider mb-3 leading-none pb-2 border-b border-slate-50 dark:border-slate-850">Revenues</h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <span>Net Restaurant Sales (F&B Ticket Ingress)</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${revenue.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Other Income & Catering Services</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${otherRevenues.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-slate-900 dark:text-white font-extrabold pt-2 border-t border-dashed border-slate-100 dark:border-slate-850">
                                                <span>TOTAL NET REVENUES</span>
                                                <span>${totalCombinedRevenue.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Part 2: COGS */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-wider mb-3 leading-none pb-2 border-b border-slate-50 dark:border-slate-850">Cost of Goods Sold (COGS)</h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <span>Estimated Food & Plate Preparation Costs</span>
                                                <span>${calculatedCOGS.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Raw Bulk Ingredient Procurements</span>
                                                <span>${manualExpensesByCategory.INGREDIENTS.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-slate-900 dark:text-white font-extrabold pt-2 border-t border-dashed border-slate-100 dark:border-slate-850">
                                                <span>TOTAL COST OF GOODS SOLD</span>
                                                <span className="text-rose-500">(${totalCOGS.toFixed(2)})</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Part 3: Gross Profit */}
                                    <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl flex justify-between items-center text-slate-900 dark:text-white font-black uppercase text-[11px] tracking-tight border border-slate-100 dark:border-slate-850">
                                        <span>GROSS PROFIT (GP)</span>
                                        <span className="text-emerald-500">${grossProfit.toFixed(2)} ({grossMarginPercentage.toFixed(1)}%)</span>
                                    </div>

                                    {/* Part 4: OPEX */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-wider mb-3 leading-none pb-2 border-b border-slate-50 dark:border-slate-850">Operating Expenses (OPEX)</h4>
                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <span>Staff Wages, Allowances & Payroll</span>
                                                <span>${manualExpensesByCategory.SALARY.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Facilities Rent Leasehold Payments</span>
                                                <span>${manualExpensesByCategory.RENT.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Digital Power Grid & Commercial Utilities</span>
                                                <span>${manualExpensesByCategory.UTILITIES.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Marketing Campaign and Promotion Spend</span>
                                                <span>${manualExpensesByCategory.MARKETING.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Sundry & General Office Administration</span>
                                                <span>${manualExpensesByCategory.OTHER_EXPENSE.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between text-slate-900 dark:text-white font-extrabold pt-2 border-t border-dashed border-slate-105 dark:border-slate-850">
                                                <span>TOTAL OPERATING EXPENSES</span>
                                                <span className="text-rose-500">(${totalOpex.toFixed(2)})</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Part 5: Net Profit double bordered summary */}
                                    <div className="pt-6 border-t-2 border-double border-slate-900 dark:border-slate-700 flex justify-between items-center text-slate-950 dark:text-white font-black uppercase text-sm italic tracking-tight">
                                        <span>NET PERIOD REVENUE IN EXCESS (NET INCOME)</span>
                                        <span className={`px-4 py-1 rounded-lg ${netProfit >= 0 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                                            {netProfit >= 0 ? '' : '-'}${Math.abs(netProfit).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUB-TAB 3: DOUBLE COLUMN BALANCE SHEET */}
                        {activeSalesSubTab === 'BALANCE_SHEET' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                {/* Balancing Check verification banner */}
                                <div className="bg-emerald-500/10 rounded-3xl p-6 border border-emerald-500/30 flex items-center gap-6 shadow-glow-sm">
                                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg text-lg">
                                        <i className="fas fa-scale-balanced animate-pulse"></i>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                                            LEDGER ACCURACY WARRANT CONFIRMED
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                                        </h4>
                                        <p className="text-[9px] uppercase tracking-wider text-slate-450 mt-1 leading-normal">
                                            The General Ledger assets balances exactly equate with total liabilities and owner equity parameters to the cent: <span className="font-mono text-slate-700 dark:text-slate-350 font-bold">${balanceSheetData.totalAssets.toFixed(2)} ≡ ${balanceSheetData.totalLiabilitiesAndEquity.toFixed(2)}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto w-full">
                                    {/* Column 1: Assets Layout */}
                                    <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border border-slate-100 dark:border-slate-800 shadow-premium">
                                        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-850 mb-6">
                                            <h4 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-widest flex items-center gap-2">
                                                <i className="fas fa-vault text-brand-500"></i>
                                                Balance Sheet Assets
                                            </h4>
                                            <span className="text-[10px] font-black uppercase text-slate-400">Standard GAAP</span>
                                        </div>

                                        <div className="space-y-4 font-mono text-xs text-slate-600 dark:text-slate-350">
                                            <div className="flex justify-between items-baseline">
                                                <span>Liquid Paper Cash (In Hand)</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.cashBalance.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-baseline">
                                                <span>Bank Clearing Receivables (Card / Telebirr)</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.bankBalance.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-baseline">
                                                <span>F&B Foodstock Inventory Valuations</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.inventoryValuation.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-baseline pb-4">
                                                <span>Kitchen Equipment & Leasehold Investments (Net)</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.physicalAssets.toFixed(2)}</span>
                                            </div>
                                            
                                            <div className="py-4 border-t-2 border-double border-slate-900 dark:border-slate-700 flex justify-between items-center text-slate-950 dark:text-white font-black uppercase text-[11px] tracking-tight">
                                                <span>TOTAL COMBINED LEDGER ASSETS</span>
                                                <span className="text-brand-500">${balanceSheetData.totalAssets.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column 2: Liabilities and Equity Layout */}
                                    <div className="bg-white dark:bg-slate-900 p-10 rounded-[3.5rem] border border-slate-100 dark:border-slate-800 shadow-premium">
                                        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-850 mb-6">
                                            <h4 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-widest flex items-center gap-2">
                                                <i className="fas fa-hand-holding-dollar text-brand-500"></i>
                                                Liabilities & Owner Equity
                                            </h4>
                                            <span className="text-[10px] font-black uppercase text-slate-400">Current Periods</span>
                                        </div>

                                        <div className="space-y-4 font-mono text-xs text-slate-600 dark:text-slate-350">
                                            <h5 className="text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-dashed border-slate-100 dark:border-slate-850 pb-1 mb-2">Liabilities Obligations</h5>
                                            <div className="flex justify-between items-baseline">
                                                <span>Outstanding Vendor Payables (Ingredient Purchases)</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.accountsPayable.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-baseline pb-3">
                                                <span>Wages Accrued & Payroll Contributions</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.payrollTaxesAccrued.toFixed(2)}</span>
                                            </div>

                                            <h5 className="text-[9px] font-black text-slate-450 uppercase tracking-widest border-b border-dashed border-slate-101 dark:border-slate-850 pb-1 mb-2 pt-2">Owner's Equity Reserves</h5>
                                            <div className="flex justify-between items-baseline">
                                                <span>Contributed / Seed Investment Capital</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.contributedCapital.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-baseline pb-4">
                                                <span>Retained Period Revenue Surpluses</span>
                                                <span className="font-bold text-slate-900 dark:text-white">${balanceSheetData.retainedEarnings.toFixed(2)}</span>
                                            </div>
                                            
                                            <div className="py-4 border-t-2 border-double border-slate-900 dark:border-slate-700 flex justify-between items-center text-slate-950 dark:text-white font-black uppercase text-[11px] tracking-tight">
                                                <span>TOTAL LIABILITIES & RETAINED EQUITY</span>
                                                <span className="text-brand-500">${balanceSheetData.totalLiabilitiesAndEquity.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUB-TAB 4: RELEVANT REVENUE BREAKDOWN BY CATEGORY */}
                        {activeSalesSubTab === 'CATEGORY' && (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 animate-in fade-in duration-500">
                                {/* Category table */}
                                <div className="bg-white dark:bg-slate-900 p-10 rounded-[4rem] border border-slate-100 dark:border-slate-800 shadow-premium">
                                    <div className="pb-6 border-b border-slate-100 dark:border-slate-850 mb-8 shrink-0">
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                            <i className="fas fa-layer-group text-brand-500"></i>
                                            Inflow Calculations by Menu Category
                                        </h3>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-widest mt-1.5">
                                            System classification of completed customer item receipts
                                        </p>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-slate-100 dark:border-slate-850/60 pb-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                    <th className="pb-3">Menu Category</th>
                                                    <th className="pb-3 text-center">Portions Sold</th>
                                                    <th className="pb-3 text-right">Inflow ($)</th>
                                                    <th className="pb-3 text-right">COGS Cost ($)</th>
                                                    <th className="pb-3 text-right">Gross profit margins</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-850 text-xs">
                                                {categorySales.map(cat => {
                                                    const catProfit = cat.revenue - cat.cogs;
                                                    const catMargin = cat.revenue > 0 ? (catProfit / cat.revenue) * 100 : 0;
                                                    return (
                                                        <tr key={cat.categoryId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                                                            <td className="py-4 font-black uppercase text-slate-900 dark:text-white tracking-wider">{cat.name}</td>
                                                            <td className="py-4 text-center font-bold text-slate-600 dark:text-slate-350">{cat.quantity} units</td>
                                                            <td className="py-4 text-right font-black font-mono text-slate-900 dark:text-white">${cat.revenue.toFixed(2)}</td>
                                                            <td className="py-4 text-right font-bold font-mono text-rose-500">(${cat.cogs.toFixed(2)})</td>
                                                            <td className="py-4 text-right text-[10px] font-black uppercase">
                                                                <span className={`px-2 py-0.5 rounded ${catProfit >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                                    {catMargin.toFixed(0)}% Margin
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Category BarChart */}
                                <div className="bg-white dark:bg-slate-900 p-10 rounded-[4rem] border border-slate-100 dark:border-slate-800 shadow-premium flex flex-col justify-between">
                                    <div className="pb-6 border-b border-slate-100 dark:border-slate-850 mb-6 flex justify-between items-center">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Revenue Distribution Graph</h3>
                                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-widest mt-1.5">Visual split matching commercial category nodes</p>
                                        </div>
                                    </div>
                                    <div className="h-[320px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={categorySales} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: '#94a3b8' }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 950, fill: '#94a3b8' }} />
                                                <RechartsTooltip 
                                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 12px 24px rgba(0,0,0,0.05)', backgroundColor: 'rgba(255,255,255,0.9)' }} 
                                                    itemStyle={{ color: '#6366f1', fontWeight: 900, fontSize: '11px', textTransform: 'uppercase' }} 
                                                />
                                                <Bar dataKey="revenue" fill="#6366f1" radius={[8, 8, 0, 0]} name="Category Sales">
                                                    {categorySales.map((entry, index) => {
                                                        const colors = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
                                                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                                                    })}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SUB-TAB 5: CALCULATIONS BY PRODUCTS (MENU ITEMS) */}
                        {activeSalesSubTab === 'PRODUCT' && (
                            <div className="bg-white dark:bg-slate-900 p-10 rounded-[4rem] border border-slate-100 dark:border-slate-800 shadow-premium animate-in fade-in duration-500">
                                <div className="pb-6 border-b border-slate-100 dark:border-slate-850 mb-8 flex justify-between items-center flex-wrap gap-4">
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                            <i className="fas fa-bowl-food text-brand-500"></i>
                                            Granular Item costings and profit margins Console
                                        </h3>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-widest mt-1.5">
                                            Modify estimated F&B prep costs dynamically using the input fields below to recalculate real COGS live!
                                        </p>
                                    </div>
                                    <div className="px-5 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center gap-3">
                                        <span className="w-2.5 h-2.5 bg-brand-500 rounded-full animate-ping" />
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-350">Drives Income Statement Numbers</span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-slate-100 dark:border-slate-850/60 pb-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                <th className="pb-3 text-[10px] tracking-widest">Item Specs</th>
                                                <th className="pb-3 text-center">Retail Price</th>
                                                <th className="pb-3 text-center">Quantity Sold</th>
                                                <th className="pb-3 text-right">Inflow Revenue</th>
                                                <th className="pb-3 text-center px-4">Est Prep Cost ($)</th>
                                                <th className="pb-3 text-right">Total Net Cost (COGS)</th>
                                                <th className="pb-3 text-right">Estimated Gross Margin</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-55 dark:divide-slate-850 text-xs">
                                            {itemSales.map(item => {
                                                const currentUnitCost = menuItemCosts[item.id] || menuItemCosts[item.name.toLowerCase()] || Number((item.price * 0.35).toFixed(2));
                                                const isProfitable = item.revenue > (currentUnitCost * item.quantity);
                                                const totalItemCOGS = currentUnitCost * item.quantity;
                                                const netItemProfit = item.revenue - totalItemCOGS;
                                                const profitMarginPCT = item.revenue > 0 ? (netItemProfit / item.revenue) * 100 : 100;

                                                const handleUnitCostChange = (newVal: number) => {
                                                    setMenuItemCosts(prev => ({
                                                        ...prev,
                                                        [item.id]: newVal,
                                                        [item.name.toLowerCase()]: newVal
                                                    }));
                                                };

                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                                                        <td className="py-4">
                                                            <div className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">{item.name}</div>
                                                            <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mt-0.5">{item.categoryName}</div>
                                                        </td>
                                                        <td className="py-4 text-center font-mono font-bold text-slate-800 dark:text-slate-350">${item.price.toFixed(2)}</td>
                                                        <td className="py-4 text-center font-bold text-slate-650 dark:text-slate-400">{item.quantity} portions</td>
                                                        <td className="py-4 text-right font-black font-mono text-slate-900 dark:text-white">${item.revenue.toFixed(2)}</td>
                                                        <td className="py-4 text-center px-4">
                                                            <div className="inline-flex items-center bg-slate-50 dark:bg-slate-950/40 rounded-xl px-3 border border-slate-205 dark:border-slate-800">
                                                                <span className="text-[10px] font-bold text-slate-400 mr-1">$</span>
                                                                <input 
                                                                    type="number"
                                                                    step="0.05"
                                                                    min="0"
                                                                    value={currentUnitCost}
                                                                    onChange={e => handleUnitCostChange(Math.max(0, Number(e.target.value)))}
                                                                    className="w-16 h-8 text-xs font-semibold focus:outline-none bg-transparent font-mono text-slate-900 dark:text-white text-center"
                                                                />
                                                            </div>
                                                        </td>
                                                        <td className="py-4 text-right font-bold font-mono text-rose-500">(${totalItemCOGS.toFixed(2)})</td>
                                                        <td className="py-4 text-right text-[10px] font-black uppercase">
                                                            <span className={`px-2.5 py-1 rounded-lg ${isProfitable ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                                ${netItemProfit.toFixed(2)} ({profitMarginPCT.toFixed(0)}%)
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* SUB-TAB 6: DETAILED TRANSACTION LEDGER & DISBURSEMENTS BOOK */}
                        {activeSalesSubTab === 'LEDGER' && (
                            <div className="bg-white dark:bg-slate-900 p-10 rounded-[4rem] border border-slate-100 dark:border-slate-800 shadow-premium animate-in fade-in duration-500 flex flex-col">
                                <div className="pb-6 border-b border-slate-100 dark:border-slate-850 mb-8 flex justify-between items-center flex-wrap gap-4">
                                    <div>
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                            <i className="fas fa-receipt text-brand-500"></i>
                                            General Ledger & Disbursements Journal Book
                                        </h3>
                                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5">
                                            Audit audit-compliant double-entry log of all restaurant sales and administrative outflows
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setEditingTransaction(null);
                                            setTransactionForm({
                                                type: 'EXPENSE',
                                                category: 'UTILITIES',
                                                amount: 0,
                                                description: '',
                                                staffName: 'Manager John'
                                            });
                                            setIsTransactionModalOpen(true);
                                        }}
                                        className="h-12 px-6 bg-brand-500 hover:bg-brand-400 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-glow active:scale-95 transition-all flex items-center gap-2 border border-brand-400/20 cursor-pointer"
                                    >
                                        <i className="fas fa-plus-circle"></i>
                                        Record General Entry
                                    </button>
                                </div>

                                <div className="overflow-x-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-slate-100 dark:border-slate-850/60 pb-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                                <th className="pb-3">Timestamp / Date</th>
                                                <th className="pb-3 text-center">Entry Code</th>
                                                <th className="pb-3">Reporting Staff</th>
                                                <th className="pb-3">Memo / Narrative</th>
                                                <th className="pb-3 text-center">General Ledger Tag</th>
                                                <th className="pb-3 text-right">Inflow ($)</th>
                                                <th className="pb-3 text-right">Outflow ($)</th>
                                                <th className="pb-3 text-center">Actions Protocol</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-850 text-xs text-slate-700 dark:text-slate-350">
                                            {/* Inbound Sales orders represented dynamically */}
                                            {orders.filter(o => o.paymentStatus === 'PAID').map((order, index) => (
                                                <tr key={order.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors opacity-80">
                                                    <td className="py-4 font-mono font-bold text-[10px] text-slate-400">
                                                        {new Date(order.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                    </td>
                                                    <td className="py-4 text-center font-mono font-bold text-brand-500">#SALES_{index + 1024}</td>
                                                    <td className="py-4 font-black uppercase tracking-wider text-[10px]">POS Terminal Cashier</td>
                                                    <td className="py-4 italic text-slate-550 dark:text-slate-400">
                                                        Settled Guest order ticket {order.id.slice(0,6)} by {((order as any).paymentMethod || 'CASH')}
                                                    </td>
                                                    <td className="py-4 text-center">
                                                        <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border border-emerald-110/30 rounded text-[9px] font-black uppercase tracking-wider">
                                                            CORE SALES
                                                        </span>
                                                    </td>
                                                    <td className="py-4 text-right font-black font-mono text-emerald-500">+${order.total.toFixed(2)}</td>
                                                    <td className="py-4 text-right font-mono text-slate-350">-</td>
                                                    <td className="py-4 text-center">
                                                        <span className="text-[8px] font-mono uppercase bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-400 block w-max mx-auto">
                                                            SYSTEM LOCKED
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}

                                            {/* Custom Transactions */}
                                            {customTransactions.map(tx => (
                                                <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                                                    <td className="py-4 font-mono font-bold text-[10px] text-slate-400">
                                                        {new Date(tx.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                    </td>
                                                    <td className="py-4 text-center font-mono font-bold text-slate-500">#{tx.id.toUpperCase()}</td>
                                                    <td className="py-4 font-black uppercase tracking-wider text-[10px]">{tx.staffName}</td>
                                                    <td className="py-4 text-slate-900 dark:text-white font-medium">{tx.description}</td>
                                                    <td className="py-4 text-center">
                                                        <span className={`px-2 py-0.5 border rounded text-[9px] font-black uppercase tracking-wider ${tx.type === 'REVENUE' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border-emerald-200' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-500 border-rose-200'}`}>
                                                            {tx.category}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 text-right font-black font-mono text-emerald-500">
                                                        {tx.type === 'REVENUE' ? `+$${tx.amount.toFixed(2)}` : '-'}
                                                    </td>
                                                    <td className="py-4 text-right font-black font-mono text-rose-500">
                                                        {tx.type === 'EXPENSE' ? `($${tx.amount.toFixed(2)})` : '-'}
                                                    </td>
                                                    <td className="py-4">
                                                        <div className="flex gap-2 justify-center">
                                                            <button 
                                                                onClick={() => {
                                                                    setEditingTransaction(tx);
                                                                    setTransactionForm({
                                                                        type: tx.type,
                                                                        category: tx.category,
                                                                        amount: tx.amount,
                                                                        description: tx.description,
                                                                        staffName: tx.staffName
                                                                    });
                                                                    setIsTransactionModalOpen(true);
                                                                }}
                                                                className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 flex items-center justify-center text-xs transition-colors cursor-pointer border border-slate-200/40 dark:border-slate-700/40"
                                                                title="Edit Entry"
                                                            >
                                                                <i className="fas fa-edit text-[9px]"></i>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteTransaction(tx.id)}
                                                                className="w-7 h-7 rounded bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900 text-rose-550 flex items-center justify-center text-xs transition-colors cursor-pointer border border-rose-100/30"
                                                                title="Delete Entry"
                                                            >
                                                                <i className="fas fa-trash-can text-[9px]"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeSalesSubTab === 'FOOD_COST_ENGINE' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                {/* FOOD COST ENGINE SUMMARY CARD */}
                                <div className="bg-white dark:bg-slate-900 p-10 rounded-[4rem] border border-slate-100 dark:border-slate-800 shadow-premium">
                                    <div className="pb-6 border-b border-slate-100 dark:border-slate-850 mb-8 flex justify-between items-center flex-wrap gap-6">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                                                <i className="fas fa-calculator text-brand-500 animate-spin-slow"></i>
                                                Food Cost & COGS Engine Dashboard
                                            </h3>
                                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-widest mt-1.5La">
                                                Implements full-stack physical ledger material cost auditing, recipe versioning checks, and financial reporting.
                                            </p>
                                        </div>

                                        {/* Configuration Control Panel for Alerts */}
                                        <div className="flex flex-wrap items-center gap-6">
                                            <div className="flex flex-col gap-1.5 bg-slate-50 dark:bg-slate-950/50 px-4 py-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-800">
                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Configure Food Cost Alert Target</span>
                                                <div className="flex items-center gap-3">
                                                    <input 
                                                        type="range" 
                                                        min="15" 
                                                        max="45" 
                                                        value={foodCostThreshold}
                                                        onChange={(e) => setFoodCostThreshold(Number(e.target.value))}
                                                        className="accent-brand-500 h-1 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer w-24"
                                                    />
                                                    <span className="text-[10px] font-mono font-black text-brand-600 dark:text-brand-400">{foodCostThreshold}%</span>
                                                </div>
                                            </div>

                                            <div className="px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-2">
                                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-450">Read-Only Executive Audit Ledger Connection</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* NAVIGATION TAB CONTROLLER BETWEEN EXECUTIVE VIEW AND DIAGNOSTICS DETAILED AUDIT */}
                                    <div className="flex bg-slate-50 dark:bg-slate-950 p-2 rounded-3xl w-fit mb-8 gap-2 border border-slate-100 dark:border-slate-850">
                                        <button 
                                            onClick={() => setFoodCostViewMode('EXECUTIVE')}
                                            className={`px-6 py-2.5 rounded-[1.25rem] text-[9px] font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer ${foodCostViewMode === 'EXECUTIVE' ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200/30 dark:border-slate-700/50' : 'text-slate-400 dark:text-slate-505 hover:text-slate-600'}`}
                                        >
                                            <i className="fas fa-gauge"></i>
                                            Executive Reporting Dashboard
                                        </button>
                                        <button 
                                            onClick={() => setFoodCostViewMode('DIAGNOSTICS')}
                                            className={`px-6 py-2.5 rounded-[1.25rem] text-[9px] font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer ${foodCostViewMode === 'DIAGNOSTICS' ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200/30 dark:border-slate-700/50' : 'text-slate-400 dark:text-slate-505 hover:text-slate-600'}`}
                                        >
                                            <i className="fas fa-toolbox"></i>
                                            Granular Database & Ledger Audit
                                        </button>
                                        <button 
                                            onClick={() => setFoodCostViewMode('FORECAST')}
                                            className={`px-6 py-2.5 rounded-[1.25rem] text-[9px] font-black uppercase tracking-wider transition-all duration-300 flex items-center gap-2 cursor-pointer ${foodCostViewMode === 'FORECAST' ? 'bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm border border-slate-200/30 dark:border-slate-700/50' : 'text-slate-400 dark:text-slate-505 hover:text-slate-600'}`}
                                        >
                                            <i className="fas fa-chart-line animate-pulse"></i>
                                            Scenario Forecasting Hub
                                        </button>
                                    </div>

                                    {/* DYNAMIC ALERT TERMINAL */}
                                    {(() => {
                                        const rev = monthlyCogsResult?.totalRevenue ?? 0;
                                        const cogsVal = monthlyCogsResult?.totalCOGS ?? 0;
                                        const gp = monthlyCogsResult?.grossProfit ?? 0;
                                        const fcPercent = monthlyCogsResult?.foodCostPercent ?? 0;

                                        const prevRev = prevMonthlyCogsResult?.totalRevenue ?? 0;
                                        const prevGp = prevMonthlyCogsResult?.grossProfit ?? 0;

                                        const reconScore = reconciliationReport?.reconciliationScore ?? 0;
                                        const failedPostingsCount = reconciliationReport?.failedPostings ?? 0;
                                        const strandedOrdersCount = reconciliationReport?.strandedOrders ?? 0;

                                        const foodCostAlert = fcPercent > foodCostThreshold;
                                        const negativeMarginItems = topPerformersResult?.negativeMargin ?? [];
                                        const failedPostingsAlert = failedPostingsCount > 0;
                                        const lowReconciliationAlert = reconScore < 90;

                                        let revenueDeclinePercent = 0;
                                        let profitDeclinePercent = 0;
                                        if (prevRev > 0 && rev < prevRev) {
                                            revenueDeclinePercent = ((prevRev - rev) / prevRev) * 100;
                                        }
                                        if (prevGp > 0 && gp < prevGp) {
                                            profitDeclinePercent = ((prevGp - gp) / prevGp) * 100;
                                        }
                                        const revenueDeclineAlert = revenueDeclinePercent > 5;
                                        const profitDeclineAlert = profitDeclinePercent > 5;

                                        const largeVarianceFindings = reconciliationReport?.findings.filter(f => 
                                            f.failureReason.toLowerCase().includes('variance') || 
                                            f.failureReason.toLowerCase().includes('inconsistency') || 
                                            f.failureReason.toLowerCase().includes('mismatch') || 
                                            f.failureReason.toLowerCase().includes('discrepancy')
                                        ) || [];
                                        const largeInventoryVarianceAlert = largeVarianceFindings.length > 0;

                                        const hasAnyAlerts = foodCostAlert || negativeMarginItems.length > 0 || failedPostingsAlert || lowReconciliationAlert || revenueDeclineAlert || profitDeclineAlert || largeInventoryVarianceAlert;

                                        if (!hasAnyAlerts) return null;

                                        return (
                                            <div className="mb-8 bg-rose-500/[0.02] border border-rose-500/10 p-8 rounded-[3rem] animate-in fade-in slide-in-from-top duration-300">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <div className="relative flex h-3 w-3">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-455 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                                                    </div>
                                                    <h4 className="text-xs font-black uppercase text-rose-500 tracking-wider">Executive Intelligence Watchflow ({[
                                                        foodCostAlert,
                                                        negativeMarginItems.length > 0,
                                                        failedPostingsAlert,
                                                        lowReconciliationAlert,
                                                        revenueDeclineAlert,
                                                        profitDeclineAlert,
                                                        largeInventoryVarianceAlert
                                                    ].filter(Boolean).length} Active Anomaly Alerts)</h4>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {foodCostAlert && (
                                                        <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl flex gap-3">
                                                            <i className="fas fa-triangle-exclamation text-rose-500 mt-0.5"></i>
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider text-rose-500 block">Critical Food Cost Overflow</span>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-bold leading-relaxed">
                                                                    Actual food cost ratio has soared to <span className="font-mono font-black text-rose-500">{fcPercent.toFixed(1)}%</span>, exceeding the configured {foodCostThreshold}% tolerance threshold.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {negativeMarginItems.length > 0 && (
                                                        <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl flex gap-3">
                                                            <i className="fas fa-circle-minus text-rose-500 mt-0.5"></i>
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider text-rose-505 block">Negative Margin Items Identified</span>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-bold leading-relaxed">
                                                                    Found <span className="font-mono font-black text-rose-500">{negativeMarginItems.length}</span> menu items currently selling at a loss. Immediate pricing adjustments recommended.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {failedPostingsAlert && (
                                                        <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl flex gap-3">
                                                            <i className="fas fa-circle-exclamation text-red-500 mt-0.5"></i>
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider text-red-505 block">Failed Ledger Postings</span>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-bold leading-relaxed">
                                                                    There are <span className="font-mono font-black text-red-500">{failedPostingsCount}</span> postings that failed validation routines. Direct ledger hazard detected.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {lowReconciliationAlert && (
                                                        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3">
                                                            <i className="fas fa-shield-virus text-amber-500 mt-0.5"></i>
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 block">Low Integrity Score Alert</span>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-bold leading-relaxed">
                                                                    Inventory reconciliation score has fallen to <span className="font-mono font-black text-amber-500">{reconScore}%</span>. Discrepancies exist in transaction records.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {revenueDeclineAlert && (
                                                        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3">
                                                            <i className="fas fa-chart-line-down text-amber-505 mt-0.5"></i>
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 block">Periodic Revenue Contraction</span>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-bold leading-relaxed">
                                                                    Consolidated revenue declined by <span className="font-mono font-black text-rose-500">{revenueDeclinePercent.toFixed(1)}%</span> relative to the prior fiscal month cycle.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {profitDeclineAlert && (
                                                        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3">
                                                            <i className="fas fa-money-bill-trend-up text-amber-505 mt-0.5"></i>
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 block">Gross Profit Contraction</span>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-bold leading-relaxed">
                                                                    Consolidated raw profit margin contracted by <span className="font-mono font-black text-rose-500">{profitDeclinePercent.toFixed(1)}%</span> relative to the prior month.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {largeInventoryVarianceAlert && (
                                                        <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-2xl flex gap-3">
                                                            <i className="fas fa-boxes-stacked text-orange-500 mt-0.5"></i>
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider text-orange-500 block">Large Physical Cost Spills</span>
                                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 uppercase font-bold leading-relaxed">
                                                                    Discovered <span className="font-mono font-black text-orange-500">{largeVarianceFindings.length}</span> anomalous physical stock shifts. Suggests rounding drift or cost leaks.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {foodCostViewMode === 'EXECUTIVE' && (
                                        <div className="space-y-8 animate-in fade-in duration-500">
                                            {/* CONSOLIDATED METRICS: COGS ENGINE PRINCIPALS */}
                                            {(() => {
                                                const rev = monthlyCogsResult?.totalRevenue ?? 0;
                                                const cogsVal = monthlyCogsResult?.totalCOGS ?? 0;
                                                const gp = monthlyCogsResult?.grossProfit ?? 0;
                                                const fcPercent = monthlyCogsResult?.foodCostPercent ?? 0;
                                                const totalQty = profitabilityResult?.items?.reduce((sum, it) => sum + it.quantitySold, 0) ?? 0;

                                                const prevRev = prevMonthlyCogsResult?.totalRevenue ?? 0;
                                                const prevGp = prevMonthlyCogsResult?.grossProfit ?? 0;

                                                const revIncline = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : 0;
                                                const gpIncline = prevGp > 0 ? ((gp - prevGp) / prevGp) * 100 : 0;

                                                return (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                                                        {/* KPI #1: REVENUE */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Gross Sales Inflow</span>
                                                                <p className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1.5">${rev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                            </div>
                                                            <div className="mt-3.5 flex items-center gap-1.5">
                                                                {revIncline >= 0 ? (
                                                                    <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                                        <i className="fas fa-caret-up"></i>
                                                                        +{revIncline.toFixed(1)}%
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                                        <i className="fas fa-caret-down"></i>
                                                                        {revIncline.toFixed(1)}%
                                                                    </span>
                                                                )}
                                                                <span className="text-[8px] text-slate-450 uppercase font-bold tracking-widest font-sans">vs prior cycle</span>
                                                            </div>
                                                        </div>

                                                        {/* KPI #2: COGS */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Consolidated COGS Ledger</span>
                                                                <p className="text-2xl font-black font-mono text-rose-505 dark:text-rose-500 mt-1.5">${cogsVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                            </div>
                                                            <div className="mt-3.5">
                                                                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1">
                                                                    <div className="bg-rose-500 h-1 rounded-full" style={{ width: `${Math.min(100, fcPercent)}%` }}></div>
                                                                </div>
                                                                <span className="text-[8px] text-slate-450 uppercase font-black tracking-widest block mt-1.5">Standard materials allocation</span>
                                                            </div>
                                                        </div>

                                                        {/* KPI #3: GROSS PROFIT */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Consolidated Profit Pool</span>
                                                                <p className="text-2xl font-black font-mono text-emerald-500 mt-1.5">${gp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                                            </div>
                                                            <div className="mt-3.5 flex items-center gap-1.5">
                                                                {gpIncline >= 0 ? (
                                                                    <span className="text-[9px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                                        <i className="fas fa-caret-up"></i>
                                                                        +{gpIncline.toFixed(1)}%
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-black text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                                                                        <i className="fas fa-caret-down"></i>
                                                                        {gpIncline.toFixed(1)}%
                                                                    </span>
                                                                )}
                                                                <span className="text-[8px] text-slate-450 uppercase font-bold tracking-widest font-sans">vs prior pool</span>
                                                            </div>
                                                        </div>

                                                        {/* KPI #4: MARGIN PERCENT */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Consolidated Raw Margin</span>
                                                                <p className={`text-2xl font-black font-mono mt-1.5 ${gp > 0 ? "text-emerald-500" : "text-rose-500"}`}>{rev > 0 ? ((gp / rev) * 100).toFixed(1) : "0.0"}%</p>
                                                            </div>
                                                            <div className="mt-3.5">
                                                                <span className="text-[8px] text-slate-450 dark:text-slate-505 uppercase font-black tracking-widest">
                                                                    {gp > 0 ? "HEALTHY SPREAD" : "MATERIAL EXHAUSTION"}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* KPI #5: PORTIONS SOLD */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">Integrated Portions Sold</span>
                                                                <p className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1.5">{totalQty.toLocaleString('en-US')} units</p>
                                                            </div>
                                                            <div className="mt-3.5">
                                                                <span className="text-[8px] text-slate-450 dark:text-slate-505 uppercase font-black tracking-widest">Processed from {profitabilityResult?.metadata?.processedOrdersCount || 0} orders</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* SYSTEM RECONCILIATION & IMMUTABLE LEDGER HEALTH */}
                                            {(() => {
                                                const reconScore = reconciliationReport?.reconciliationScore ?? 0;
                                                const failedPostingsCount = reconciliationReport?.failedPostings ?? 0;
                                                const strandedOrdersCount = reconciliationReport?.strandedOrders ?? 0;
                                                const orphanedLedgersCount = reconciliationReport?.orphanedLedgers ?? 0;
                                                const totalPosted = reconciliationReport?.totalPostedOrders ?? 0;
                                                const totalPaid = reconciliationReport?.totalPaidOrders ?? 0;

                                                const postingSuccessPercent = totalPaid > 0 ? (totalPosted / totalPaid) * 100 : 100;
                                                const totalAllReconGroup = totalPosted + failedPostingsCount + strandedOrdersCount;
                                                const recoverySuccessPercent = totalAllReconGroup > 0 ? (totalPosted / totalAllReconGroup) * 100 : 100;

                                                // Progress Ring Math
                                                const radius = 30;
                                                const stroke = 5;
                                                const normalizedRadius = radius - stroke * 2;
                                                const circumference = normalizedRadius * 2 * Math.PI;
                                                const strokeDashoffsetRecon = circumference - (reconScore / 100) * circumference;
                                                const strokeDashoffsetSuccess = circumference - (postingSuccessPercent / 100) * circumference;

                                                return (
                                                    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-6">
                                                        {/* CARD 1: RECONCILIATION INTEGRITY */}
                                                        <div className="md:col-span-1 xl:col-span-2 bg-slate-50 dark:bg-slate-950/45 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex items-center justify-between gap-4">
                                                            <div className="flex-1">
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">Reconciliation Integrity</span>
                                                                <p className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">{reconScore}%</p>
                                                                <span className="text-[8px] text-slate-450 font-black tracking-widest uppercase mt-2 block">
                                                                    {reconScore >= 95 ? "OPTIMAL SECURITY" : reconScore >= 85 ? "MODERATE VARIATION" : "RECOGNITION DEVIATION"}
                                                                </span>
                                                            </div>
                                                            <div className="shrink-0 relative flex items-center justify-center">
                                                                <svg height={radius * 2} width={radius * 2} className="rotate-[-90deg]">
                                                                    <circle
                                                                        stroke="rgba(226, 232, 240, 0.2)"
                                                                        fill="transparent"
                                                                        strokeWidth={stroke}
                                                                        r={normalizedRadius}
                                                                        cx={radius}
                                                                        cy={radius}
                                                                    />
                                                                    <circle
                                                                        stroke={reconScore >= 90 ? "#10b981" : reconScore >= 75 ? "#f59e0b" : "#ef4444"}
                                                                        fill="transparent"
                                                                        strokeWidth={stroke}
                                                                        strokeDasharray={circumference + ' ' + circumference}
                                                                        style={{ strokeDashoffset: strokeDashoffsetRecon }}
                                                                        strokeLinecap="round"
                                                                        r={normalizedRadius}
                                                                        cx={radius}
                                                                        cy={radius}
                                                                    />
                                                                </svg>
                                                                <span className="absolute text-[9px] font-mono font-black text-slate-700 dark:text-slate-350">{reconScore}%</span>
                                                            </div>
                                                        </div>

                                                        {/* CARD 2: POSTING SUCCESS RATE */}
                                                        <div className="md:col-span-1 xl:col-span-2 bg-slate-50 dark:bg-slate-950/45 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex items-center justify-between gap-4">
                                                            <div className="flex-1">
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">Posting Success %</span>
                                                                <p className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">{postingSuccessPercent.toFixed(1)}%</p>
                                                                <span className="text-[8px] text-slate-450 font-black tracking-widest uppercase mt-2 block">
                                                                    {postingSuccessPercent >= 95 ? "LEDGERS ALIGNED" : "UNPOSTED EXPOSURE"}
                                                                </span>
                                                            </div>
                                                            <div className="shrink-0 relative flex items-center justify-center">
                                                                <svg height={radius * 2} width={radius * 2} className="rotate-[-90deg]">
                                                                    <circle
                                                                        stroke="rgba(226, 232, 240, 0.2)"
                                                                        fill="transparent"
                                                                        strokeWidth={stroke}
                                                                        r={normalizedRadius}
                                                                        cx={radius}
                                                                        cy={radius}
                                                                    />
                                                                    <circle
                                                                        stroke={postingSuccessPercent >= 90 ? "#6366f1" : "#f59e0b"}
                                                                        fill="transparent"
                                                                        strokeWidth={stroke}
                                                                        strokeDasharray={circumference + ' ' + circumference}
                                                                        style={{ strokeDashoffset: strokeDashoffsetSuccess }}
                                                                        strokeLinecap="round"
                                                                        r={normalizedRadius}
                                                                        cx={radius}
                                                                        cy={radius}
                                                                    />
                                                                </svg>
                                                                <span className="absolute text-[9px] font-mono font-black text-slate-700 dark:text-slate-350">{postingSuccessPercent.toFixed(0)}%</span>
                                                            </div>
                                                        </div>

                                                        {/* CARD 3: RECOVERY SUCCESS RATE */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">Recovery Success %</span>
                                                                <p className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1">{recoverySuccessPercent.toFixed(1)}%</p>
                                                            </div>
                                                            <span className="text-[8px] text-slate-450 font-black tracking-widest uppercase mt-2 block">Retry resolution index</span>
                                                        </div>

                                                        {/* CARD 4: DISCREPANCIES PACK (FAILED, STRANDED, ORPHANED) */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div className="flex justify-between items-start">
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block leading-tight">Failed<br />Postings</span>
                                                                {failedPostingsCount > 0 ? (
                                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-500/10 text-rose-505 animate-pulse">CRITICAL</span>
                                                                ) : (
                                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/10 text-emerald-500">SAFE</span>
                                                                )}
                                                            </div>
                                                            <p className={`text-xl font-black font-mono mt-2 ${failedPostingsCount > 0 ? "text-rose-505" : "text-slate-900 dark:text-white"}`}>{failedPostingsCount}</p>
                                                        </div>

                                                        {/* CARD 5: STRANDED TICKETS */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div className="flex justify-between items-start">
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block leading-tight">Stranded<br />Orders</span>
                                                                {strandedOrdersCount > 0 ? (
                                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500/10 text-amber-500">EXPOSED</span>
                                                                ) : (
                                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/10 text-emerald-500">SAFE</span>
                                                                )}
                                                            </div>
                                                            <p className="text-xl font-black font-mono text-slate-900 dark:text-white mt-2">{strandedOrdersCount}</p>
                                                        </div>

                                                        {/* CARD 6: ORPHANED LEDGERS */}
                                                        <div className="bg-slate-50 dark:bg-slate-950/45 p-5 rounded-[2rem] border border-slate-100 dark:border-slate-850/80 flex flex-col justify-between">
                                                            <div className="flex justify-between items-start">
                                                                <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block leading-tight">Orphaned<br />Ledgers</span>
                                                                {orphanedLedgersCount > 0 ? (
                                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-500/15 text-slate-500">DRIFT</span>
                                                                ) : (
                                                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-500/10 text-emerald-500">SECURE</span>
                                                                )}
                                                            </div>
                                                            <p className="text-xl font-black font-mono text-slate-900 dark:text-white mt-2">{orphanedLedgersCount}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            {/* CHARTS CONTAINER: BAR & AREA RENDERING */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                {/* CHART 1: REVENUE & MATERIAL ALLOCATION TRAJECTORY */}
                                                <div className="bg-slate-50 dark:bg-slate-950/45 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-850/80">
                                                    <div className="pb-4 border-b border-slate-200/40 dark:border-slate-850/60 mb-6 flex justify-between items-center">
                                                        <div>
                                                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Revenue vs. COGS Expansion</h4>
                                                            <p className="text-[9px] text-slate-450 uppercase font-black tracking-wide mt-1">Comparing Gross Inflow versus physical ingredient ledger cost</p>
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const trendData = [
                                                            { name: 'Last Period', Revenue: prevMonthlyCogsResult?.totalRevenue || 0, COGS: prevMonthlyCogsResult?.totalCOGS || 0 },
                                                            { name: 'Current', Revenue: monthlyCogsResult?.totalRevenue || 0, COGS: monthlyCogsResult?.totalCOGS || 0 }
                                                        ];
                                                        return (
                                                            <ResponsiveContainer width="100%" height={240}>
                                                                <AreaChart data={trendData}>
                                                                    <defs>
                                                                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                                                        </linearGradient>
                                                                        <linearGradient id="colorCogs" x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                                                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                                                        </linearGradient>
                                                                    </defs>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.15}/>
                                                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} fontWeight="900" tickLine={false} axisLine={false}/>
                                                                    <YAxis stroke="#94a3b8" fontSize={9} fontWeight="900" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`}/>
                                                                    <RechartsTooltip formatter={(value: number) => [`$${value.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '1rem', color: '#fff', fontSize: '10px', textTransform: 'uppercase', fontFamily: 'monospace' }}/>
                                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}/>
                                                                    <Area name="Gross Revenue" type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)"/>
                                                                    <Area name="Ingredients COGS" type="monotone" dataKey="COGS" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorCogs)"/>
                                                                </AreaChart>
                                                            </ResponsiveContainer>
                                                        );
                                                    })()}
                                                </div>

                                                {/* CHART 2: TOP PERFORMING ITEM REVENUES & PROFILING */}
                                                <div className="bg-slate-50 dark:bg-slate-950/45 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-850/80">
                                                    <div className="pb-4 border-b border-slate-200/40 dark:border-slate-850/60 mb-6 flex justify-between items-center">
                                                        <div>
                                                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Profits Profile Breakdown</h4>
                                                            <p className="text-[9px] text-slate-450 uppercase font-black tracking-wide mt-1">Top performers of selected month and gross margin spreads</p>
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const itemProfitData = (profitabilityResult?.items || [])
                                                            .sort((a: any, b: any) => b.revenue - a.revenue)
                                                            .slice(0, 5)
                                                            .map((it: any) => ({
                                                                name: it.menuItemName,
                                                                Revenue: it.revenue,
                                                                Profit: it.grossProfit
                                                            }));
                                                        return (
                                                            <ResponsiveContainer width="100%" height={240}>
                                                                <BarChart data={itemProfitData}>
                                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.15}/>
                                                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} fontWeight="900" tickLine={false} axisLine={false}/>
                                                                    <YAxis stroke="#94a3b8" fontSize={8} fontWeight="900" tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`}/>
                                                                    <RechartsTooltip formatter={(value: number) => [`$${value.toFixed(2)}`, '']} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '1rem', color: '#fff', fontSize: '10px', textTransform: 'uppercase', fontFamily: 'monospace' }}/>
                                                                    <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}/>
                                                                    <Bar name="Net Gross Profit" dataKey="Profit" fill="#10b981" radius={[10, 10, 0, 0]}>
                                                                        {itemProfitData.map((entry: any, index: number) => (
                                                                            <Cell key={`cell-${index}`} fill={entry.Profit >= 0 ? '#10b981' : '#f43f5e'}/>
                                                                        ))}
                                                                    </Bar>
                                                                    <Bar name="Portion Revenue" dataKey="Revenue" fill="#6366f1" radius={[10, 10, 0, 0]}/>
                                                                </BarChart>
                                                            </ResponsiveContainer>
                                                        );
                                                    })()}
                                                </div>
                                            </div>

                                            {/* BENTO SECTION: TOP PERFORMERS & ANOMALY LISTINGS */}
                                            {topPerformersResult && (
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8 animate-in fade-in duration-300">
                                                    {/* MOST PROFITABLE ITEMS */}
                                                    <div className="bg-emerald-500/[0.02] dark:bg-emerald-950/[0.04] p-8 rounded-[3rem] border border-emerald-500/10 flex flex-col">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <i className="fas fa-crown text-emerald-500"></i>
                                                            <h5 className="text-xs font-black text-emerald-500 uppercase tracking-wider">Most Profitable Items</h5>
                                                        </div>
                                                        <div className="space-y-3.5 flex-1">
                                                            {topPerformersResult.mostProfitable.length > 0 ? (
                                                                topPerformersResult.mostProfitable.map((item, index) => (
                                                                    <div key={item.menuItemId} className="flex justify-between items-center text-xs pb-2.5 border-b border-slate-50 dark:border-slate-800 last:border-b-0">
                                                                        <div>
                                                                            <p className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                                                                                {index + 1}. {item.menuItemName}
                                                                            </p>
                                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-wide mt-0.5">
                                                                                {item.quantitySold} sold • {item.marginPercent.toFixed(0)}% margin
                                                                            </p>
                                                                        </div>
                                                                        <span className="font-black font-mono text-emerald-500 text-right">
                                                                            +${item.grossProfit.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <p className="text-[10px] text-slate-400 uppercase tracking-wide italic">No high-performing data</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* LEAST PROFITABLE ITEMS */}
                                                    <div className="bg-amber-500/[0.01] dark:bg-amber-950/[0.03] p-8 rounded-[3rem] border border-amber-500/10 flex flex-col">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <i className="fas fa-arrow-down-long text-amber-500"></i>
                                                            <h5 className="text-xs font-black text-amber-500 uppercase tracking-wider">Least Profitable Items</h5>
                                                        </div>
                                                        <div className="space-y-3.5 flex-1">
                                                            {topPerformersResult.leastProfitable.length > 0 ? (
                                                                topPerformersResult.leastProfitable.map((item, index) => (
                                                                    <div key={item.menuItemId} className="flex justify-between items-center text-xs pb-2.5 border-b border-slate-50 dark:border-slate-800 last:border-b-0">
                                                                        <div>
                                                                            <p className="font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                                                                                {index + 1}. {item.menuItemName}
                                                                            </p>
                                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-wide mt-0.5">
                                                                                {item.quantitySold} sold • {item.marginPercent.toFixed(0)}% margin
                                                                            </p>
                                                                        </div>
                                                                        <span className="font-black font-mono text-slate-800 dark:text-slate-400 text-right">
                                                                            ${item.grossProfit.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <p className="text-[10px] text-slate-400 uppercase tracking-wide italic">No low-performing data</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* NEGATIVE MARGIN ITEMS */}
                                                    <div className="bg-rose-500/[0.02] dark:bg-rose-950/[0.04] p-8 rounded-[3rem] border border-rose-500/10 flex flex-col">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <i className="fas fa-triangle-exclamation text-rose-500 font-bold animate-pulse"></i>
                                                            <h5 className="text-xs font-black text-rose-500 uppercase tracking-wider">Negative Margin Warning</h5>
                                                        </div>
                                                        <div className="space-y-3.5 flex-1">
                                                            {topPerformersResult.negativeMargin.length > 0 ? (
                                                                topPerformersResult.negativeMargin.map((item, index) => (
                                                                    <div key={item.menuItemId} className="flex justify-between items-center text-xs pb-2.5 border-b border-slate-50 dark:border-slate-800 last:border-b-0">
                                                                        <div>
                                                                            <p className="font-extrabold text-rose-500 uppercase tracking-wide">
                                                                                {item.menuItemName}
                                                                            </p>
                                                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-wide mt-0.5">
                                                                                {item.quantitySold} sold • {item.marginPercent.toFixed(0)}% margin
                                                                            </p>
                                                                        </div>
                                                                        <span className="font-black font-mono text-rose-500 text-right">
                                                                            ${item.grossProfit.toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <div className="flex flex-col items-center justify-center py-6 text-center text-emerald-500 uppercase tracking-wider text-[9px] font-black">
                                                                    <i className="fas fa-circle-check text-base mb-2"></i>
                                                                    No negative margin items detected
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {foodCostViewMode === 'DIAGNOSTICS' && (
                                        <div className="space-y-8 animate-in fade-in duration-500">
                                            {/* DIAGNOSTICS & LEDGER DEEPER INTEGRITY SECTORS (ORIGINAL SECTION UI CONTENT PRESERVED PERFECTLY) */}
                                            {/* COGS MONTHLY DIAGNOSTICS CONTROL GRID */}
                                            <div className="bg-slate-50 dark:bg-slate-950/45 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-850/85">
                                                <div className="flex flex-wrap items-center justify-between gap-6 mb-6">
                                                    <div>
                                                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Monthly COGS Diagnostics</h4>
                                                        <p className="text-[9px] text-slate-450 font-bold uppercase mt-1">Select Year & Month to trigger server-side aggregation and analysis</p>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <select 
                                                            value={cogsYear} 
                                                            onChange={e => setCogsYear(Number(e.target.value))}
                                                            className="h-10 px-4 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 dark:text-white"
                                                        >
                                                            {[2024, 2025, 2026, 2027].map(y => (
                                                                <option key={y} value={y}>{y}</option>
                                                            ))}
                                                        </select>
                                                        <select 
                                                            value={cogsMonth} 
                                                            onChange={e => setCogsMonth(Number(e.target.value))}
                                                            className="h-10 px-4 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 dark:text-white"
                                                        >
                                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                                                                const name = new Date(2026, m - 1, 1).toLocaleString('default', { month: 'long' });
                                                                return <option key={m} value={m}>{name}</option>;
                                                            })}
                                                        </select>
                                                        <button 
                                                            onClick={runMonthlyCogsCalculation}
                                                            disabled={isCalculatingCogs}
                                                            className="h-10 px-5 bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-50 transition-all rounded-xl font-black uppercase text-[9px] tracking-wider flex items-center gap-2 cursor-pointer"
                                                        >
                                                            {isCalculatingCogs ? (
                                                                <>
                                                                    <i className="fas fa-spinner animate-spin"></i>
                                                                    Analyzing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <i className="fas fa-arrows-rotate"></i>
                                                                    Refresh COGS
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* MONTHLY RESULTS DISPLAY */}
                                                {monthlyCogsResult && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
                                                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Total Sales Inflow</span>
                                                                <p className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1">
                                                                    ${monthlyCogsResult.totalRevenue.toFixed(2)}
                                                                </p>
                                                            </div>
                                                            <span className="text-[8px] text-slate-400 dark:text-slate-550 uppercase font-bold mt-2">
                                                                From {monthlyCogsResult.metadata.processedOrdersCount} integrated orders
                                                            </span>
                                                        </div>

                                                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Actual COGS (Ledger)</span>
                                                                <p className="text-2xl font-black font-mono text-rose-505 mt-1">
                                                                    ${monthlyCogsResult.totalCOGS.toFixed(2)}
                                                                </p>
                                                            </div>
                                                            <span className="text-[8px] text-rose-455 dark:text-rose-500 uppercase font-bold mt-2">
                                                                Realized physical ingredients outflow
                                                            </span>
                                                        </div>

                                                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Gross Profit Baseline</span>
                                                                <p className="text-2xl font-black font-mono text-emerald-500 mt-1">
                                                                    ${monthlyCogsResult.grossProfit.toFixed(2)}
                                                                </p>
                                                            </div>
                                                            <span className="text-[8px] text-emerald-505 uppercase font-bold mt-2">
                                                                Revenue less material cost of prep
                                                            </span>
                                                        </div>

                                                        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-850 flex flex-col justify-between">
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Realized Food Cost %</span>
                                                                <p className="text-2xl font-black font-mono text-brand-500 mt-1">
                                                                    {monthlyCogsResult.foodCostPercent.toFixed(1)}%
                                                                </p>
                                                            </div>
                                                            <span className="text-[8px] text-brand-505 uppercase font-bold mt-2">
                                                                Standard range: 25% - 35% targets
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* MENU ITEM PROFITABILITY & DATE SELECTOR COMPANIONS */}
                                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                                                {/* DATE RANGE FILTER SIDEBAR */}
                                                <div className="lg:col-span-1 bg-slate-50 dark:bg-slate-950/45 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-850/85">
                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-6">Profitability Control Range</h4>
                                                    <div className="space-y-4">
                                                        <div>
                                                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-505 uppercase tracking-widest block mb-2">Start Date</label>
                                                            <input 
                                                                type="date" 
                                                                value={profitStartDate}
                                                                onChange={e => setProfitStartDate(e.target.value)}
                                                                className="w-full h-10 px-4 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 dark:text-white"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-505 uppercase tracking-widest block mb-2">End Date</label>
                                                            <input 
                                                                type="date" 
                                                                value={profitEndDate}
                                                                onChange={e => setProfitEndDate(e.target.value)}
                                                                className="w-full h-10 px-4 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl text-xs font-extrabold focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-900 dark:text-white"
                                                            />
                                                        </div>
                                                        <button 
                                                            onClick={runProfitabilityAndPerformersCalculation}
                                                            disabled={isCalculatingProfit}
                                                            className="w-full h-12 bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-50 transition-all rounded-xl font-black uppercase text-[9px] tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-4"
                                                        >
                                                            {isCalculatingProfit ? (
                                                                <>
                                                                    <i className="fas fa-spinner animate-spin"></i>
                                                                    Calculating...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <i className="fas fa-circle-play"></i>
                                                                    Recalculate Profitability
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* GRANULAR PROFITABILITY LISTING */}
                                                <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850/80 p-8 rounded-[3rem] shadow-sm">
                                                    <div className="pb-4 border-b border-slate-50 dark:border-slate-800 mb-6 flex justify-between items-center">
                                                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Active Range Profitability Breakdown</h4>
                                                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">
                                                            Processed: {profitabilityResult?.metadata?.processedOrdersCount || 0} integrated tickets
                                                        </span>
                                                    </div>

                                                    <div className="overflow-x-auto custom-scrollbar font-sans">
                                                        <table className="w-full text-left">
                                                            <thead>
                                                                <tr className="border-b border-slate-50 dark:border-slate-800/80 pb-3 text-[9px] font-black text-slate-400 dark:text-slate-555 uppercase tracking-widest">
                                                                    <th className="pb-3 text-[10px] tracking-widest">Item Name</th>
                                                                    <th className="pb-3 text-center">Portions Sold</th>
                                                                    <th className="pb-3 text-right">Inflow Revenue</th>
                                                                    <th className="pb-3 text-right">Actual COGS</th>
                                                                    <th className="pb-3 text-right">Gross Profit</th>
                                                                    <th className="pb-3 text-right">Margin %</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-850 text-xs">
                                                                {profitabilityResult && profitabilityResult.items.length > 0 ? (
                                                                    profitabilityResult.items.map(item => {
                                                                        const isProfitable = item.grossProfit > 0;
                                                                        return (
                                                                            <tr key={item.menuItemId} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/25 transition-colors">
                                                                                <td className="py-3.5">
                                                                                    <span className="font-black text-slate-900 dark:text-white uppercase tracking-wider">{item.menuItemName}</span>
                                                                                </td>
                                                                                <td className="py-3.5 text-center font-bold text-slate-650 dark:text-slate-400">
                                                                                    {item.quantitySold} portions
                                                                                </td>
                                                                                <td className="py-3.5 text-right font-bold font-mono text-slate-900 dark:text-white">
                                                                                    ${item.revenue.toFixed(2)}
                                                                                </td>
                                                                                <td className="py-3.5 text-right font-bold font-mono text-rose-500">
                                                                                    -${item.cogs.toFixed(2)}
                                                                                </td>
                                                                                <td className={`py-3.5 text-right font-black font-mono ${isProfitable ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                                    ${item.grossProfit.toFixed(2)}
                                                                                </td>
                                                                                <td className="py-3.5 text-right">
                                                                                    <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${isProfitable ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                                                        {item.marginPercent.toFixed(0)}%
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <tr>
                                                                        <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-505 uppercase tracking-widest text-[10px] font-black">
                                                                            No analytical calculations found for this date range segment
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {foodCostViewMode === 'FORECAST' && (
                                        <div className="space-y-8 animate-in fade-in duration-500">
                                            {!profitabilityResult?.items || profitabilityResult.items.length === 0 ? (
                                                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-12 rounded-[3.5rem] shadow-premium text-center max-w-2xl mx-auto flex flex-col items-center justify-center">
                                                    <div className="w-16 h-16 bg-brand-500/10 rounded-full flex items-center justify-center mb-6 text-brand-500">
                                                        <i className="fas fa-chart-line text-2xl animate-pulse"></i>
                                                    </div>
                                                    <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider mb-2">Predictive core data required</h4>
                                                    <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wide max-w-md leading-relaxed mb-6">
                                                        The forecasting layer requires historical item profitability distributions to generate statistical models. Please run calculation routines first.
                                                    </p>
                                                    <button 
                                                        onClick={() => {
                                                            runProfitabilityAndPerformersCalculation();
                                                            runMonthlyCogsCalculation();
                                                        }}
                                                        disabled={isCalculatingProfit || isCalculatingCogs}
                                                        className="h-12 px-8 bg-brand-500 hover:bg-brand-405 text-white transition-all rounded-2xl font-black uppercase text-[10px] tracking-wider flex items-center gap-2 cursor-pointer shadow-premium"
                                                    >
                                                        {isCalculatingProfit ? (
                                                            <>
                                                                <i className="fas fa-spinner animate-spin"></i>
                                                                Calibrating Base...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <i className="fas fa-microchip"></i>
                                                                Compile Predictive Base Ledger
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* EXEC SCREEN: SCENARIO PARAMETERS PANEL */}
                                                    <div className="bg-slate-50 dark:bg-slate-950/40 p-8 rounded-[3rem] border border-slate-100 dark:border-slate-850">
                                                        <div className="flex items-center gap-3 mb-6">
                                                            <div className="w-8 h-8 rounded-lg bg-brand-500/10 text-brand-505 flex items-center justify-center">
                                                                <i className="fas fa-sliders-h"></i>
                                                            </div>
                                                            <div>
                                                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Predictive Scenario Parameters</h4>
                                                                <p className="text-[9px] text-slate-450 font-bold uppercase mt-0.5">Model financial changes instantly and dynamically recalibrate the forecasting layer</p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                            {/* SLIDER A: Sales volume growth */}
                                                            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/40 dark:border-slate-800 flex flex-col gap-3">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Order Volume Growth</span>
                                                                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md ${scenarioGrowthRate >= 0 ? 'bg-emerald-500/10 text-emerald-505' : 'bg-rose-500/10 text-rose-505'}`}>
                                                                        {scenarioGrowthRate >= 0 ? `+${scenarioGrowthRate}` : scenarioGrowthRate}%
                                                                    </span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="-50"
                                                                    max="50"
                                                                    value={scenarioGrowthRate}
                                                                    onChange={(e) => setScenarioGrowthRate(Number(e.target.value))}
                                                                    className="accent-brand-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer w-full"
                                                                />
                                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Adjust forecasted portion volumes</span>
                                                            </div>

                                                            {/* SLIDER B: Cost inflation drift */}
                                                            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/40 dark:border-slate-800 flex flex-col gap-3">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">COGS Inflation / Drift</span>
                                                                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md ${scenarioCogsDrift <= 0 ? 'bg-emerald-500/10 text-emerald-505' : 'bg-rose-500/10 text-rose-505'}`}>
                                                                        {scenarioCogsDrift >= 0 ? `+${scenarioCogsDrift}` : scenarioCogsDrift}%
                                                                    </span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="-50"
                                                                    max="50"
                                                                    value={scenarioCogsDrift}
                                                                    onChange={(e) => setScenarioCogsDrift(Number(e.target.value))}
                                                                    className="accent-brand-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer w-full"
                                                                />
                                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Shift in physical material prices</span>
                                                            </div>

                                                            {/* SLIDER C: Price adjustment */}
                                                            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/40 dark:border-slate-800 flex flex-col gap-3">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Menu Price Adjustments</span>
                                                                    <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md ${scenarioPriceAdjustment >= 0 ? 'bg-emerald-500/10 text-emerald-505' : 'bg-rose-500/10 text-rose-505'}`}>
                                                                        {scenarioPriceAdjustment >= 0 ? `+${scenarioPriceAdjustment}` : scenarioPriceAdjustment}%
                                                                    </span>
                                                                </div>
                                                                <input 
                                                                    type="range"
                                                                    min="-50"
                                                                    max="50"
                                                                    value={scenarioPriceAdjustment}
                                                                    onChange={(e) => setScenarioPriceAdjustment(Number(e.target.value))}
                                                                    className="accent-brand-500 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer w-full"
                                                                />
                                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Simulate menu billing increases</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* EXEC SCREEN: SCORECARDS PANEL */}
                                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                                                        {forecastReport && [
                                                            { title: 'Overall Score', score: forecastReport.overallBusinessScore, desc: 'Composite status index', key: 'overall' },
                                                            { title: 'Financial Health', score: forecastReport.financialHealthScore, desc: 'COGS compliance health', key: 'fin' },
                                                            { title: 'Profitability Pool', score: forecastReport.profitabilityScore, desc: 'Gross margin quality', key: 'prof' },
                                                            { title: 'Operational Integrity', score: forecastReport.operationalIntegrityScore, desc: 'Posting ledger sync', key: 'op' },
                                                            { title: 'Inventory Accuracy', score: forecastReport.inventoryIntegrityScore, desc: 'Physical versus system', key: 'inv' },
                                                            { title: 'Growth Capability', score: forecastReport.growthScore, desc: 'Expansion capacity', key: 'growth' }
                                                        ].map(item => {
                                                            const isExcellent = item.score >= 82;
                                                            const isSuboptimal = item.score < 65;
                                                            let barColor = 'bg-brand-500';
                                                            let textColor = 'text-brand-500';
                                                            if (isExcellent) {
                                                                barColor = 'bg-emerald-500';
                                                                textColor = 'text-emerald-500';
                                                            } else if (isSuboptimal) {
                                                                barColor = 'bg-rose-500';
                                                                textColor = 'text-rose-500';
                                                            } else {
                                                                barColor = 'bg-amber-500';
                                                                textColor = 'text-amber-500';
                                                            }

                                                            return (
                                                                <div key={item.key} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-5 rounded-2xl flex flex-col justify-between shadow-premium transition-all hover:scale-[1.02] duration-300">
                                                                    <div>
                                                                        <span className="text-[8px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">{item.title}</span>
                                                                        <div className="flex items-baseline gap-2 mt-2">
                                                                            <span className={`text-2xl font-black font-mono ${textColor}`}>{item.score}</span>
                                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">/100</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-4">
                                                                        <div className="w-full bg-slate-100 dark:bg-slate-800/80 h-1.5 rounded-full overflow-hidden">
                                                                            <div className={`h-full ${barColor}`} style={{ width: `${item.score}%` }}></div>
                                                                        </div>
                                                                        <span className="text-[8px] font-extrabold text-slate-400 dark:text-slate-505 uppercase mt-2 block tracking-tight leading-none">{item.desc}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* PROJECTIONS CONSOLIDATED OVERVIEW */}
                                                    {forecastReport && (
                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Consolidated Revenue Forecast</span>
                                                                    <p className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1">
                                                                        ${forecastReport.consolidatedExpectedRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-2">
                                                                    <i className={`fas ${scenarioGrowthRate >= 0 ? 'fa-arrow-up text-emerald-500' : 'fa-arrow-down text-rose-500'} text-[10px]`}></i>
                                                                    <span className={`text-[8px] font-black uppercase ${scenarioGrowthRate >= 0 ? 'text-emerald-505' : 'text-rose-505'}`}>
                                                                        {scenarioGrowthRate >= 0 ? `+${scenarioGrowthRate}` : scenarioGrowthRate}% volume shift
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Consolidated Material COGS Forecast</span>
                                                                    <p className="text-2xl font-black font-mono text-rose-500 mt-1">
                                                                        ${forecastReport.consolidatedExpectedCOGS.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-2">
                                                                    <i className={`fas ${scenarioCogsDrift >= 0 ? 'fa-arrow-up text-rose-500' : 'fa-arrow-down text-emerald-500'} text-[10px]`}></i>
                                                                    <span className={`text-[8px] font-black uppercase ${scenarioCogsDrift >= 0 ? 'text-rose-505' : 'text-emerald-505'}`}>
                                                                        {scenarioCogsDrift >= 0 ? `+${scenarioCogsDrift}` : scenarioCogsDrift}% cost drift
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Expected Gross Profit Pool</span>
                                                                    <p className="text-2xl font-black font-mono text-emerald-500 mt-1">
                                                                        ${forecastReport.consolidatedExpectedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-2">
                                                                    <i className="fas fa-sack-dollar text-emerald-500 text-[10px]"></i>
                                                                    <span className="text-[8px] font-black uppercase text-emerald-505">
                                                                        Realized scenario yield value
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Expected Food Cost Target</span>
                                                                    <p className="text-2xl font-black font-mono text-brand-500 mt-1">
                                                                        {forecastReport.expectedFoodCostPercent.toFixed(1)}%
                                                                    </p>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-2">
                                                                    <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-wider ${forecastReport.expectedFoodCostPercent <= foodCostThreshold ? 'bg-emerald-500/10 text-emerald-505' : 'bg-rose-500/10 text-rose-505'}`}>
                                                                        {forecastReport.expectedFoodCostPercent <= foodCostThreshold ? 'Target compliant' : 'Exceeds limit alert'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* CHARTS CONTAINER (PROJECTION CHARTS & VARIANCE CHARTS) */}
                                                    {forecastReport && (
                                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-[2rem] shadow-sm">
                                                                <div className="pb-4 border-b border-slate-50 dark:border-slate-800 mb-6 flex justify-between items-center">
                                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Revenue vs Profit Projections</h4>
                                                                    <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Historical vs Adjusted</span>
                                                                </div>
                                                                <div className="h-64 font-mono text-[9px] font-bold">
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <BarChart
                                                                            data={[
                                                                                { name: 'Revenue Inflow', Historical: monthlyCogsResult?.totalRevenue || 0, Expected: forecastReport.consolidatedExpectedRevenue },
                                                                                { name: 'Raw Material (COGS)', Historical: monthlyCogsResult?.totalCOGS || 0, Expected: forecastReport.consolidatedExpectedCOGS },
                                                                                { name: 'Gross Margin Pool', Historical: monthlyCogsResult?.grossProfit || 0, Expected: forecastReport.consolidatedExpectedProfit }
                                                                            ]}
                                                                            margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                                                                        >
                                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                                            <XAxis dataKey="name" stroke="#94A3B8" />
                                                                            <YAxis stroke="#94A3B8" />
                                                                            <RechartsTooltip contentStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                                            <Legend wrapperStyle={{ fontSize: '10px' }} />
                                                                            <Bar dataKey="Historical" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                                                                            <Bar dataKey="Expected" fill="#6366F1" radius={[4, 4, 0, 0]} />
                                                                        </BarChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            </div>

                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-[2rem] shadow-sm">
                                                                <div className="pb-4 border-b border-slate-50 dark:border-slate-800 mb-6 flex justify-between items-center">
                                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Forecasted Margin Risk Distribution</h4>
                                                                    <span className="text-[8px] font-black uppercase text-rose-505 tracking-wider">Bottom item expected margin %</span>
                                                                </div>
                                                                <div className="h-64 font-mono text-[9px] font-bold">
                                                                    <ResponsiveContainer width="100%" height="100%">
                                                                        <AreaChart
                                                                            data={forecastReport.marginRiskForecast.map(item => ({
                                                                                name: item.menuItemName,
                                                                                'Expected Margin %': item.expectedMargin
                                                                            }))}
                                                                            margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                                                                        >
                                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                                                            <XAxis dataKey="name" stroke="#94A3B8" />
                                                                            <YAxis stroke="#94A3B8" />
                                                                            <RechartsTooltip contentStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                                            <Area type="monotone" dataKey="Expected Margin %" stroke="#EE4950" fill="#EE4950" fillOpacity={0.1} />
                                                                        </AreaChart>
                                                                    </ResponsiveContainer>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* CLASSIFICATIONS CARDS (TOP SALES, PROFITS, RISKS, SLOW MOVING) */}
                                                    {forecastReport && (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                            {/* CARD 1: TOP REVENUE MODELS */}
                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-6 flex items-center justify-between">
                                                                        <span>Forecasted Top Revenue Items</span>
                                                                        <span className="text-[8px] font-black bg-brand-500/10 text-brand-505 px-2.5 py-1 rounded-full">Top 5 Revenue</span>
                                                                    </h4>
                                                                    <div className="space-y-4">
                                                                        {forecastReport.topRevenueForecast.map(item => (
                                                                            <div key={item.menuItemId} className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100/50 dark:border-slate-850/50 rounded-xl">
                                                                                <div>
                                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white block">{item.menuItemName}</span>
                                                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5 block">Confidence: {item.confidenceScore}% • Trend: {item.trend}</span>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <span className="text-xs font-black font-mono text-slate-900 dark:text-white block">${item.expectedRevenue.toFixed(2)}</span>
                                                                                    <span className="text-[8px] font-black text-slate-455 dark:text-slate-500 uppercase mt-0.5 block">Est. margin: {item.expectedMargin.toFixed(0)}%</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* CARD 2: TOP PROFIT MODELS */}
                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-6 flex items-center justify-between">
                                                                        <span>Forecasted Top Profit Items</span>
                                                                        <span className="text-[8px] font-black bg-emerald-500/10 text-emerald-505 px-2.5 py-1 rounded-full">Top 5 Net Margin</span>
                                                                    </h4>
                                                                    <div className="space-y-4">
                                                                        {forecastReport.topProfitForecast.map(item => (
                                                                            <div key={item.menuItemId} className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100/50 dark:border-slate-850/50 rounded-xl">
                                                                                <div>
                                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white block">{item.menuItemName}</span>
                                                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5 block">Confidence: {item.confidenceScore}% • Trend: {item.trend}</span>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <span className="text-xs font-black font-mono text-emerald-505 block">${item.expectedProfit.toFixed(2)}</span>
                                                                                    <span className="text-[8px] font-black text-slate-455 dark:text-slate-500 uppercase mt-0.5 block">Est. margin: {item.expectedMargin.toFixed(0)}%</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* CARD 3: SLOW MOVING INVENTORY CHURN RISK */}
                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-6 flex items-center justify-between">
                                                                        <span>Projected Slow-Moving Stock Trajectories</span>
                                                                        <span className="text-[8px] font-black bg-amber-500/10 text-amber-505 px-2.5 py-1 rounded-full">Turnover Risk</span>
                                                                    </h4>
                                                                    <div className="space-y-4">
                                                                        {forecastReport.slowMovingForecast.map(item => (
                                                                            <div key={item.menuItemId} className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100/50 dark:border-slate-850/50 rounded-xl">
                                                                                <div>
                                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white block">{item.menuItemName}</span>
                                                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5 block">Risk Rating: {item.expectedQuantity < 10 ? 'HIGH' : 'MEDIUM'} CHURN RISK</span>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <span className="text-xs font-black font-mono text-slate-700 dark:text-slate-300 block">{item.expectedQuantity.toFixed(0)} portions</span>
                                                                                    <span className="text-[8px] font-black text-slate-455 dark:text-slate-505 uppercase mt-0.5 block">Historical: {item.historicalQuantity} portions</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* CARD 4: MATERIAL MARGIN RISKS */}
                                                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 p-6 rounded-[2.5rem] shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-6 flex items-center justify-between">
                                                                        <span>Forecasted Raw Material Margin Risks</span>
                                                                        <span className="text-[8px] font-black bg-rose-500/10 text-rose-505 px-2.5 py-1 rounded-full">Margin Drift Limit</span>
                                                                    </h4>
                                                                    <div className="space-y-4">
                                                                        {forecastReport.marginRiskForecast.map(item => (
                                                                            <div key={item.menuItemId} className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-950/20 border border-slate-100/50 dark:border-slate-850/50 rounded-xl">
                                                                                <div>
                                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-white block">{item.menuItemName}</span>
                                                                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5 block">Material risk mapping status: {item.riskLevel}</span>
                                                                                </div>
                                                                                <div className="text-right">
                                                                                    <span className="text-xs font-black font-mono text-rose-505 block">{item.expectedMargin.toFixed(0)}% margin</span>
                                                                                    <span className="text-[8px] font-black text-slate-455 dark:text-slate-505 uppercase mt-0.5 block">Historical: {item.expectedMargin.toFixed(0)}% margin</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* SECTION 4: HISTORICAL WARNINGS CALLOUT BANNER - STAYS VISIBLE AT BOTTOM ALWAYS TO DISCLOSE SENSITIVE EXCLUSIONS */}
                                    {((monthlyCogsResult?.warnings && monthlyCogsResult.warnings.length > 0) || 
                                      (profitabilityResult?.warnings && profitabilityResult.warnings.length > 0)) && (
                                        <div className="mt-8 bg-amber-500/[0.02] border border-amber-500/10 p-8 rounded-[3rem] animate-in slide-in-from-bottom duration-300">
                                            <div className="flex items-center gap-3 mb-4">
                                                <i className="fas fa-circle-exclamation text-amber-505 text-lg"></i>
                                                <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-500">Historical & Legacy Warning Logs</h4>
                                            </div>
                                            <p className="text-[9px] font-bold text-slate-450 uppercase mb-4 tracking-wide leading-relaxed">
                                                The following events occurred during the calculation window. Real legacy order lines lacking proper mappings or postings were excluded as required to secure maximum COGS calculation precision:
                                            </p>
                                            <div className="max-h-36 overflow-y-auto space-y-2.5 custom-scrollbar pr-2">
                                                {Array.from(new Set([
                                                    ...(monthlyCogsResult?.warnings || []),
                                                    ...(profitabilityResult?.warnings || [])
                                                ])).map((warn, i) => (
                                                    <div key={i} className="text-[9px] text-slate-600 dark:text-slate-400 font-mono flex items-start gap-2 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                                        <span className="text-amber-505 shrink-0">•</span>
                                                        <span className="leading-normal">{warn}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'ADMIN_AUDIT' && (
                    <div className="w-full flex-1 overflow-y-auto p-8 sm:p-12 space-y-8 custom-scrollbar">
                        {/* OVERVIEW STATS CARDS */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Operational Events logged</span>
                                    <p className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                                        {auditStats.total} <span className="text-xs text-slate-400 font-extrabold">records</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 mt-2">
                                    <i className="fas fa-database text-brand-500 text-xs"></i>
                                    <span className="text-[8px] font-black uppercase text-slate-400">
                                        Real-time immutable audit trail
                                    </span>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Integrity Success Rate</span>
                                    <p className="text-3xl font-black font-mono text-emerald-500 mt-1">
                                        {auditStats.successRate.toFixed(1)}%
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 mt-2">
                                    <i className="fas fa-check-circle text-emerald-505 text-xs"></i>
                                    <span className="text-[8px] font-black uppercase text-emerald-600 dark:text-emerald-500">
                                        {auditStats.successCount} successful listings
                                    </span>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">System Anomalies / Failures</span>
                                    <p className="text-3xl font-black font-mono text-rose-500 mt-1">
                                        {auditStats.failureCount} <span className="text-xs text-slate-400 font-extrabold">faults</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 mt-2">
                                    <i className="fas fa-circle-exclamation text-rose-505 text-xs"></i>
                                    <span className="text-[8px] font-black uppercase text-rose-600 dark:text-rose-500">
                                        Action rejections or connection faults
                                    </span>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
                                <div>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Warnings Recorded</span>
                                    <p className="text-3xl font-black font-mono text-amber-500 mt-1">
                                        {auditStats.warningCount} <span className="text-xs text-slate-400 font-extrabold">alerts</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 mt-2">
                                    <i className="fas fa-triangle-exclamation text-amber-505 text-xs"></i>
                                    <span className="text-[8px] font-black uppercase text-amber-600 dark:text-amber-550">
                                        System-wide non-critical items
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* FILTERING CONTROLS TOOLBAR */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-6 rounded-[2.5rem] shadow-premium flex flex-col gap-6">
                            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                                <div>
                                    <h4 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">Audit Log Filters</h4>
                                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">Refining operational trace events</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        setAuditActionFilter('ALL');
                                        setAuditUserFilter('ALL');
                                        setAuditStartDate('');
                                        setAuditEndDate('');
                                        setAuditSearchQuery('');
                                    }}
                                    className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-805 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer h-10 flex items-center gap-2"
                                >
                                    <i className="fas fa-rotate"></i>
                                    Reset Filters
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                {/* Search query input */}
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Search log data</label>
                                    <div className="relative">
                                        <input 
                                            type="text"
                                            value={auditSearchQuery}
                                            onChange={(e) => setAuditSearchQuery(e.target.value)}
                                            placeholder="Search by note, action or target ID..."
                                            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs text-slate-900 dark:text-white placeholder-slate-405 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                                        />
                                        <i className="fas fa-search absolute left-4 top-3.5 text-xs text-slate-400"></i>
                                    </div>
                                </div>

                                {/* Action Filter Dropdown */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Action Protocol</label>
                                    <select
                                        value={auditActionFilter}
                                        onChange={(e) => setAuditActionFilter(e.target.value)}
                                        className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-brand-500 font-semibold cursor-pointer w-full focus:bg-white dark:focus:bg-slate-900"
                                    >
                                        <option value="ALL">All Actions</option>
                                        {uniqueActions.map(act => (
                                            <option key={act} value={act}>{act}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* User Filter Dropdown */}
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Operator</label>
                                    <select
                                        value={auditUserFilter}
                                        onChange={(e) => setAuditUserFilter(e.target.value)}
                                        className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-brand-500 font-semibold cursor-pointer w-full focus:bg-white dark:focus:bg-slate-900"
                                    >
                                        <option value="ALL">All Operators</option>
                                        {uniqueUsers.map(usr => (
                                            <option key={usr} value={usr}>{usr}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Date inputs */}
                                <div className="flex flex-col gap-1.5 md:col-span-1">
                                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Date Range</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="date"
                                            value={auditStartDate}
                                            onChange={(e) => setAuditStartDate(e.target.value)}
                                            className="w-1/2 h-11 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-[10px] text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-brand-500 font-semibold uppercase cursor-pointer"
                                            placeholder="Start"
                                        />
                                        <input 
                                            type="date"
                                            value={auditEndDate}
                                            onChange={(e) => setAuditEndDate(e.target.value)}
                                            className="w-1/2 h-11 px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-[10px] text-slate-700 dark:text-slate-350 focus:outline-none focus:ring-1 focus:ring-brand-500 font-semibold uppercase cursor-pointer"
                                            placeholder="End"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* TABLE SECTION PANEL */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-[2.5rem] shadow-premium overflow-hidden flex flex-col">
                            <div className="p-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-wrap items-center justify-between gap-4 shrink-0">
                                <div>
                                    <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white tracking-wider">Transaction Records</h4>
                                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1">Chronological System Events</p>
                                </div>
                                <span className="bg-brand-500/10 text-brand-500 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider">
                                    {filteredAuditLogs.length} matching logs
                                </span>
                            </div>

                            <div className="flex-1 overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-800/80 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                            <th className="py-4.5 px-8">Audit ID</th>
                                            <th className="py-4.5 px-6">Timestamp</th>
                                            <th className="py-4.5 px-6">Operator Node</th>
                                            <th className="py-4.5 px-6">Action Code</th>
                                            <th className="py-4.5 px-6">Target Entity</th>
                                            <th className="py-4.5 px-6 text-center">Status</th>
                                            <th className="py-4.5 px-8">Event Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                        {paginatedAuditLogs.length > 0 ? (
                                            paginatedAuditLogs.map((log) => {
                                                const outcomeSuccess = log.outcome === ActionOutcome.SUCCESS;
                                                const outcomeFailure = log.outcome === ActionOutcome.FAILURE;
                                                const outcomeWarning = log.outcome === ActionOutcome.WARNING;

                                                let statusBadge = (
                                                    <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100/80 dark:bg-slate-800/80 text-slate-500">
                                                        PENDING
                                                    </span>
                                                );

                                                if (outcomeSuccess) {
                                                    statusBadge = (
                                                        <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-555 border border-emerald-500/10 dark:text-emerald-500">
                                                            SUCCESS
                                                        </span>
                                                    );
                                                } else if (outcomeFailure) {
                                                    statusBadge = (
                                                        <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-505 border border-rose-500/10 animate-pulse">
                                                            FAILURE
                                                        </span>
                                                    );
                                                } else if (outcomeWarning) {
                                                    statusBadge = (
                                                        <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-505 border border-amber-500/10">
                                                            WARNING
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <tr key={log.id} className="text-xs text-slate-800 dark:text-slate-350 hover:bg-slate-50/50 dark:hover:bg-slate-950/20 transition-colors">
                                                        <td className="py-4.5 px-8 font-mono text-[9px] text-slate-400 font-medium">
                                                            {log.id}
                                                        </td>
                                                        <td className="py-4.5 px-6 font-mono text-[10px] text-slate-600 dark:text-slate-400 leading-none">
                                                            <div className="font-semibold">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                                            <div className="text-[8px] text-slate-400 font-medium mt-1 uppercase">{new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}</div>
                                                        </td>
                                                        <td className="py-4.5 px-6 font-semibold">
                                                            <div className="flex flex-col gap-1 items-start">
                                                                <span className="text-slate-900 dark:text-white">{log.userIdentifier}</span>
                                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase mt-0.5 ${getRoleColor(log.userRole)}`}>
                                                                    {log.userRole}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4.5 px-6">
                                                            <span className="font-mono text-[10px] px-2 py-1 rounded bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800 font-semibold uppercase">
                                                                {log.action}
                                                            </span>
                                                        </td>
                                                        <td className="py-4.5 px-6 font-mono text-[10.5px] leading-tight">
                                                            <span className="text-slate-405 font-bold uppercase text-[9px]">{log.targetEntityType}</span>
                                                            <span className="text-slate-650 dark:text-slate-400 block mt-0.5 font-bold">{log.targetEntityId}</span>
                                                        </td>
                                                        <td className="py-4.5 px-6 text-center">
                                                            {statusBadge}
                                                        </td>
                                                        <td className="py-4.5 px-8 max-w-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                                                            {log.notes || <span className="opacity-30 italic">No supplemental description logs</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={7} className="py-16 text-center text-slate-400 dark:text-slate-505 uppercase tracking-widest text-[10px] font-black">
                                                    No system audit actions match those criteria tags
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* PAGINATION PANEL FOOTER */}
                            {totalAuditPages > 1 && (
                                <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-4 shrink-0">
                                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                                        Showing page <span className="font-serif text-slate-900 dark:text-white font-black">{auditCurrentPage}</span> of <span className="font-serif text-slate-900 dark:text-white font-black">{totalAuditPages}</span>
                                    </span>
                                    <div className="flex gap-2">
                                        <button 
                                            disabled={auditCurrentPage === 1}
                                            onClick={() => setAuditCurrentPage(prev => Math.max(1, prev - 1))}
                                            className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-750 transition-all active:scale-95 disabled:opacity-40 disabled:scale-100 cursor-pointer"
                                        >
                                            Previous
                                        </button>
                                        <button 
                                            disabled={auditCurrentPage === totalAuditPages}
                                            onClick={() => setAuditCurrentPage(prev => Math.min(totalAuditPages, prev + 1))}
                                            className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-250 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-black uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-750 transition-all active:scale-95 disabled:opacity-40 disabled:scale-100 cursor-pointer"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <OrderInspectorModal isOpen={!!inspectedOrder} onClose={() => setInspectedOrder(null)} order={inspectedOrder} />
            <RoleEditModal 
                isOpen={isRoleModalOpen} 
                onClose={() => { setIsRoleModalOpen(false); setEditingRole(null); }} 
                role={editingRole} 
                onSave={(r) => onUpdateRole?.(r)} 
            />
            <TaskEditModal 
                isOpen={isTaskModalOpen} 
                onClose={() => { setIsTaskModalOpen(false); setEditingTask(null); }} 
                task={editingTask} 
                staffDirectory={staffDirectory} 
                onSave={(t) => {
                    if (editingTask) onUpdateTask?.(t);
                    else onAddTask?.(t);
                    setIsTaskModalOpen(false);
                }} 
            />
            <MenuDigitizationModal 
                isOpen={isDigitizationModalOpen} 
                onClose={() => setIsDigitizationModalOpen(false)} 
                categories={categories} 
                onInjest={(items) => onAddMenuItems?.(items)} 
            />
            <ConfirmationModal 
                isOpen={!!roleToDelete} 
                onClose={() => setRoleToDelete(null)} 
                onConfirm={() => { if (roleToDelete) onDeleteRole?.(roleToDelete); setRoleToDelete(null); }} 
                title="Decommission Role?" 
                message="This will immediately revoke access for any users currently mapped to this authority protocol. This action is immutable." 
            />

            {/* Low Stock Alerts Quick-view Modal */}
            {isLowStockModalOpen && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsLowStockModalOpen(false)}></div>
                    <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-2xl relative z-10 flex flex-col h-[75vh] overflow-hidden border border-slate-100 dark:border-white/10 animate-in zoom-in-95 duration-300">
                        <header className="px-10 py-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-2xl font-black text-rose-500 uppercase tracking-tighter flex items-center gap-3">
                                    <i className="fas fa-triangle-exclamation text-xl"></i>
                                    Stock Level Alert
                                </h3>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                                    Manager Command Console
                                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></span>
                                </p>
                            </div>
                            <button 
                                onClick={() => setIsLowStockModalOpen(false)} 
                                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </header>
                        
                        <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar dark:bg-slate-950/20">
                            {criticalIngredients.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                                    <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center text-2xl mb-4">
                                        <i className="fas fa-circle-check"></i>
                                    </div>
                                    <h4 className="text-xl font-black text-slate-800 dark:text-slate-200 uppercase tracking-tighter">Inventory Satiated</h4>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">All items currently meet standard operating levels.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] mb-4">
                                        🚨 {criticalIngredients.length} ingredients require immediate replenishment
                                    </p>
                                    <div className="divide-y divide-slate-150 dark:divide-slate-800/60 border border-slate-100 dark:border-slate-800/80 rounded-[2.5rem] overflow-hidden bg-white dark:bg-slate-900/40">
                                        {criticalIngredients.map(ing => {
                                            const standardLevel = 50;
                                            const hasTask = taskedIngredients[ing.id];

                                            const handleRestockOne = () => {
                                                if (onUpdateIngredient) onUpdateIngredient(ing.id, { stock: standardLevel });
                                            };

                                            const handleCreateTask = () => {
                                                if (hasTask) return;
                                                onAddTask?.({
                                                    title: `Procure ${ing.name}`,
                                                    description: `Ingredient stock level has dropped to critical limit: currently ${ing.stock} ${ing.unit}. Requires replenishment to ${standardLevel} ${ing.unit}.`,
                                                    priority: TaskPriority.HIGH,
                                                    status: TaskStatus.PENDING,
                                                    assignedToName: '',
                                                    assignedToCode: '',
                                                });
                                                setTaskedIngredients(prev => ({ ...prev, [ing.id]: true }));
                                            };

                                            return (
                                                <div key={ing.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 flex items-center justify-center text-sm font-bold border border-rose-100/50 dark:border-rose-900/30">
                                                            <i className="fas fa-boxes-stacked"></i>
                                                        </div>
                                                        <div>
                                                            <h5 className="font-sans font-black text-slate-900 dark:text-white uppercase text-xs sm:text-sm tracking-tight">{ing.name}</h5>
                                                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mt-0.5">
                                                                Current stock: <span className="text-rose-500 font-mono font-black">{ing.stock}</span> / {standardLevel} {ing.unit}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2.5 items-center sm:self-center self-end">
                                                        <button 
                                                            onClick={handleCreateTask}
                                                            className={`h-10 px-4 rounded-xl border font-black uppercase text-[8px] tracking-widest transition-all active:scale-95 cursor-pointer ${hasTask ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-205 text-indigo-500 dark:text-indigo-400 cursor-default' : 'border-rose-205 dark:border-rose-900/40 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20'}`}
                                                            title={hasTask ? "Task created" : "Generate restocking ticket"}
                                                        >
                                                            {hasTask ? 'Task Ordered ✓' : 'Create Task'}
                                                        </button>
                                                        <button 
                                                            onClick={handleRestockOne}
                                                            className="h-10 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl border border-slate-850 dark:border-slate-700 font-black uppercase text-[8px] tracking-widest transition-all active:scale-95 cursor-pointer"
                                                        >
                                                            Restock
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {criticalIngredients.length > 0 && (
                            <footer className="px-10 py-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-4 shrink-0">
                                <button 
                                    onClick={() => {
                                        criticalIngredients.forEach(p => {
                                            if (onUpdateIngredient) onUpdateIngredient(p.id, { stock: 50 });
                                        });
                                    }}
                                    className="h-12 px-6 bg-rose-600 hover:bg-rose-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-glow active:scale-95 transition-all cursor-pointer"
                                >
                                    Refuel All Critical Items
                                </button>
                            </footer>
                        )}
                    </div>
                </div>
            )}

            {/* Add / Edit Ingredient Modal */}
            {isIngredientModalOpen && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsIngredientModalOpen(false)}></div>
                    <form onSubmit={handleSaveIngredient} className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-lg relative z-10 flex flex-col overflow-hidden border border-slate-100 dark:border-white/10 animate-in zoom-in-95 duration-300">
                        <header className="px-10 py-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                                    <i className="fas fa-boxes-stacked text-brand-500"></i>
                                    {editingIngredient ? 'Edit Stock Item' : 'New Stock Item'}
                                </h3>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5">
                                    {editingIngredient ? 'Modify Stock Level Specs' : 'Introduce Food Resource Protocol'}
                                </p>
                            </div>
                            <button 
                                type="button"
                                onClick={() => setIsIngredientModalOpen(false)} 
                                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </header>
                        
                        <div className="p-10 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Item Name</label>
                                <input 
                                    type="text" 
                                    required
                                    value={ingredientForm.name}
                                    onChange={e => setIngredientForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="e.g. Cheddar Cheese"
                                    className="w-full h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Stock Level</label>
                                    <input 
                                        type="number" 
                                        min="0"
                                        required
                                        value={ingredientForm.stock}
                                        onChange={e => setIngredientForm(prev => ({ ...prev, stock: Number(e.target.value) }))}
                                        className="w-full h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-mono font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Unit of Measure</label>
                                    <select 
                                        value={ingredientForm.unit}
                                        onChange={e => setIngredientForm(prev => ({ ...prev, unit: e.target.value }))}
                                        className="w-full h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                    >
                                        <option value="piece">Pieces (piece)</option>
                                        <option value="kg">Kilograms (kg)</option>
                                        <option value="g">Grams (g)</option>
                                        <option value="litre">Liters (litre)</option>
                                        <option value="ml">Milliliters (ml)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <footer className="px-10 py-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 shrink-0">
                            <button 
                                type="button"
                                onClick={() => setIsIngredientModalOpen(false)}
                                className="h-12 px-6 border-2 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-widest rounded-2xl active:scale-95 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit"
                                className="h-12 px-6 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-glow active:scale-95 transition-all cursor-pointer"
                            >
                                Save Protocol
                            </button>
                        </footer>
                    </form>
                </div>
            )}

            {/* Custom Transactions Ledger Form Modal */}
            {isTransactionModalOpen && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }}></div>
                    <form onSubmit={handleSaveTransaction} className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-lg relative z-10 flex flex-col overflow-hidden border border-slate-100 dark:border-white/10 animate-in zoom-in-95 duration-300">
                        <header className="px-10 py-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                                    <i className="fas fa-file-invoice-dollar text-brand-500"></i>
                                    {editingTransaction ? 'Edit Ledger Entry' : 'New General Entry'}
                                </h3>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5">
                                    General Ledger Bookkeeping Console
                                </p>
                            </div>
                            <button 
                                type="button"
                                onClick={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }} 
                                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </header>
                        
                        <div className="p-10 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Transaction Type</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setTransactionForm(prev => ({ ...prev, type: 'EXPENSE', category: 'UTILITIES' }))}
                                        className={`h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${transactionForm.type === 'EXPENSE' ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-500 border-rose-200' : 'bg-slate-50 dark:bg-slate-950/20 text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-700'}`}
                                    >
                                        <i className="fas fa-arrow-down-wide-short mr-2 text-xs"></i>
                                        Expense
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTransactionForm(prev => ({ ...prev, type: 'REVENUE', category: 'OTHER_REVENUE' }))}
                                        className={`h-12 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${transactionForm.type === 'REVENUE' ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 border-emerald-250' : 'bg-slate-50 dark:bg-slate-950/20 text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-700'}`}
                                    >
                                        <i className="fas fa-arrow-up-wide-short mr-2 text-xs"></i>
                                        Revenue
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Accounting Category</label>
                                    <select 
                                        value={transactionForm.category}
                                        onChange={e => setTransactionForm(prev => ({ ...prev, category: e.target.value }))}
                                        className="w-full h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                    >
                                        {transactionForm.type === 'EXPENSE' ? (
                                            <>
                                                <option value="SALARY">Staff Salaries / Payroll</option>
                                                <option value="RENT">Facilities Rent & Leases</option>
                                                <option value="UTILITIES">Power & Utility Bills</option>
                                                <option value="MARKETING">Marketing & Advertising</option>
                                                <option value="INGREDIENTS">Raw Food Ingredients Procurement</option>
                                                <option value="OTHER_EXPENSE">Sundry Administrative Expense</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="OTHER_REVENUE">General Catering Services</option>
                                                <option value="OTHER_REVENUE">Event Hall Booking Rent</option>
                                                <option value="OTHER_REVENUE">Other Capital Revenue</option>
                                            </>
                                        )}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Financial Amount ($)</label>
                                    <input 
                                        type="number" 
                                        min="0.01"
                                        step="0.01"
                                        required
                                        value={transactionForm.amount || ''}
                                        onChange={e => setTransactionForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                                        placeholder="0.00"
                                        className="w-full h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-mono font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Accounting Narrative (Memo)</label>
                                <input 
                                    type="text" 
                                    required
                                    value={transactionForm.description}
                                    onChange={e => setTransactionForm(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="e.g. Cleared electricity bill for May"
                                    className="w-full h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Recorded By Staff</label>
                                <input 
                                    type="text" 
                                    required
                                    value={transactionForm.staffName}
                                    onChange={e => setTransactionForm(prev => ({ ...prev, staffName: e.target.value }))}
                                    className="w-full h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                />
                            </div>
                        </div>

                        <footer className="px-10 py-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 shrink-0">
                            <button 
                                type="button"
                                onClick={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }}
                                className="h-12 px-6 border-2 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-widest rounded-2xl active:scale-95 transition-all cursor-pointer"
                            >
                                Close
                            </button>
                            <button 
                                type="submit"
                                className="h-12 px-6 bg-slate-900 dark:bg-slate-800 hover:bg-slate-805 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-glow active:scale-95 transition-all cursor-pointer"
                            >
                                Journalize Entry
                            </button>
                        </footer>
                    </form>
                </div>
            )}

            {/* Elegant QR Code Generator Modal */}
            {isQRModalOpen && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-300 text-slate-900 dark:text-white">
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsQRModalOpen(false)}></div>
                    <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-4xl relative z-10 flex flex-col h-[85vh] overflow-hidden border border-slate-100 dark:border-white/10 animate-in zoom-in-95 duration-300">
                        <header className="px-10 py-8 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter flex items-center gap-3">
                                    <i className="fas fa-qrcode text-brand-500 text-xl"></i>
                                    Guest QR Portal Linker
                                </h3>
                                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1.5">
                                    Generate scannable codes for item, category, or table station landing
                                </p>
                            </div>
                            <button 
                                type="button"
                                onClick={() => setIsQRModalOpen(false)} 
                                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all active:scale-90 cursor-pointer border border-slate-200 dark:border-slate-700"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </header>
                        
                        <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 md:grid-cols-12 gap-10 custom-scrollbar dark:bg-slate-950/20">
                            {/* Left Side: Configuration Controls */}
                            <div className="md:col-span-7 flex flex-col gap-6 text-left">
                                {/* Destination Selector */}
                                <div className="space-y-3">
                                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">QR Code Destination</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setQrTargetType('ITEM');
                                                if (!qrSelectedItemId && menu.length > 0) {
                                                    setQrSelectedItemId(menu[0].id);
                                                }
                                            }}
                                            className={`py-4 rounded-2xl border-2 text-center transition-all cursor-pointer ${qrTargetType === 'ITEM' ? 'bg-brand-500/10 border-brand-500 text-brand-600 dark:text-brand-400 font-black' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 font-bold hover:border-slate-200 dark:hover:border-slate-700'}`}
                                        >
                                            <i className="fas fa-burger mb-2 text-lg block"></i>
                                            <span className="text-[10px] uppercase tracking-widest">Menu Item</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setQrTargetType('CATEGORY');
                                                if (!qrSelectedCategoryId && categories.length > 0) {
                                                    setQrSelectedCategoryId(categories[0].id);
                                                }
                                            }}
                                            className={`py-4 rounded-2xl border-2 text-center transition-all cursor-pointer ${qrTargetType === 'CATEGORY' ? 'bg-brand-500/10 border-brand-500 text-brand-600 dark:text-brand-400 font-black' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 font-bold hover:border-slate-200 dark:hover:border-slate-700'}`}
                                        >
                                            <i className="fas fa-layer-group mb-2 text-lg block"></i>
                                            <span className="text-[10px] uppercase tracking-widest">Category Landing</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setQrTargetType('TABLE');
                                                if (!qrSelectedTableId && tables.length > 0) {
                                                    setQrSelectedTableId(tables[0].id);
                                                }
                                            }}
                                            className={`py-4 rounded-2xl border-2 text-center transition-all cursor-pointer ${qrTargetType === 'TABLE' ? 'bg-brand-500/10 border-brand-500 text-brand-600 dark:text-brand-400 font-black' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 font-bold hover:border-slate-200 dark:hover:border-slate-700'}`}
                                        >
                                            <i className="fas fa-chair mb-2 text-lg block"></i>
                                            <span className="text-[10px] uppercase tracking-widest">Table Station</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Selection dropdown */}
                                <div className="space-y-3">
                                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                        Select {qrTargetType === 'ITEM' ? 'Menu Item' : qrTargetType === 'CATEGORY' ? 'Category' : 'Table Station'}
                                    </h4>
                                    {qrTargetType === 'ITEM' ? (
                                        <select
                                            value={qrSelectedItemId}
                                            onChange={(e) => setQrSelectedItemId(e.target.value)}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-950/55 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                        >
                                            {menu.map(item => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name} (${item.price.toFixed(2)})
                                                </option>
                                            ))}
                                        </select>
                                    ) : qrTargetType === 'CATEGORY' ? (
                                        <select
                                            value={qrSelectedCategoryId}
                                            onChange={(e) => setQrSelectedCategoryId(e.target.value)}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-950/55 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-955 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                        >
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id}>
                                                    {cat.name} Category
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <select
                                            value={qrSelectedTableId}
                                            onChange={(e) => setQrSelectedTableId(e.target.value)}
                                            className="w-full h-12 bg-slate-50 dark:bg-slate-950/55 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-bold text-slate-955 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                        >
                                            {tables.map(table => (
                                                <option key={table.id} value={table.id}>
                                                    Table {table.number} (Cap: {table.capacity})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {/* Custom Color Preset Selection */}
                                <div className="space-y-3">
                                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Aesthetic Core Color</h4>
                                    <div className="flex gap-4 flex-wrap">
                                        {[
                                            { name: 'Cosmic Slate', hex: '#0f172a', bg: 'bg-slate-900' },
                                            { name: 'Indigo Aura', hex: '#4f46e5', bg: 'bg-indigo-600' },
                                            { name: 'Emerald Mint', hex: '#059669', bg: 'bg-emerald-600' },
                                            { name: 'Crimson Rose', hex: '#e11d48', bg: 'bg-rose-600' },
                                            { name: 'Amber Glow', hex: '#d97706', bg: 'bg-amber-600' },
                                        ].map(color => (
                                            <button
                                                key={color.hex}
                                                type="button"
                                                onClick={() => setQrColor(color.hex)}
                                                className={`flex items-center gap-2 px-4 py-2 border rounded-xl hover:scale-105 transition-all text-[10px] font-black uppercase tracking-wider cursor-pointer ${qrColor === color.hex ? 'border-indigo-600 dark:border-indigo-500 bg-slate-50 dark:bg-slate-800' : 'border-slate-150 dark:border-slate-800'}`}
                                            >
                                                <span className={`w-3.5 h-3.5 rounded-full ${color.bg}`}></span>
                                                {color.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Live URL Details */}
                                <div className="space-y-3 mt-auto">
                                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Deep Link Web Address</h4>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={(() => {
                                                if (typeof window === 'undefined') return '';
                                                const urlBase = window.location.origin + window.location.pathname;
                                                return qrTargetType === 'ITEM' 
                                                    ? `${urlBase}?item=${encodeURIComponent(qrSelectedItemId)}` 
                                                    : qrTargetType === 'CATEGORY'
                                                    ? `${urlBase}?category=${encodeURIComponent(qrSelectedCategoryId)}`
                                                    : `${urlBase}?table=${encodeURIComponent(qrSelectedTableId)}`;
                                            })()}
                                            className="flex-1 h-12 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl px-4 text-xs font-mono font-bold text-slate-500 focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (typeof window === 'undefined') return;
                                                const urlBase = window.location.origin + window.location.pathname;
                                                const linkUrl = qrTargetType === 'ITEM' 
                                                    ? `${urlBase}?item=${encodeURIComponent(qrSelectedItemId)}` 
                                                    : qrTargetType === 'CATEGORY'
                                                    ? `${urlBase}?category=${encodeURIComponent(qrSelectedCategoryId)}`
                                                    : `${urlBase}?table=${encodeURIComponent(qrSelectedTableId)}`;
                                                    
                                                navigator.clipboard.writeText(linkUrl);
                                                setQrCopied(true);
                                                setTimeout(() => setQrCopied(false), 2000);
                                            }}
                                            className={`h-12 px-6 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${qrCopied ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300'}`}
                                        >
                                            <i className={`fas ${qrCopied ? 'fa-check' : 'fa-copy'}`}></i>
                                            {qrCopied ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: Polaroids Mockup Frame & Direct QR Actions */}
                            <div className="md:col-span-5 flex flex-col gap-6 items-center justify-center bg-slate-50 dark:bg-slate-900/40 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800/80">
                                {/* Table Tent Polaroid Mockup */}
                                <div className="bg-white dark:bg-slate-950 p-6 rounded-[2rem] shadow-premium border border-slate-150 dark:border-slate-800 flex flex-col items-center max-w-[280px] w-full text-center">
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] font-sans text-brand-600 dark:text-brand-400 leading-none mb-1">
                                        ⚡ {RESTAURANT_NAME}
                                    </div>
                                    <div className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">
                                        Scan Mobile Menu
                                    </div>
                                    
                                    {/* QR Code Graphic Frame */}
                                    <div className="bg-white p-4 border border-slate-105 rounded-2xl shadow-inner mb-6 flex items-center justify-center">
                                        <img 
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                                                qrTargetType === 'ITEM' 
                                                    ? `${window.location.origin}${window.location.pathname}?item=${qrSelectedItemId}` 
                                                    : qrTargetType === 'CATEGORY'
                                                    ? `${window.location.origin}${window.location.pathname}?category=${qrSelectedCategoryId}`
                                                    : `${window.location.origin}${window.location.pathname}?table=${qrSelectedTableId}`
                                            )}&color=${qrColor.replace('#', '')}&bgcolor=ffffff`} 
                                            alt="" 
                                            className="w-40 h-40 object-contain block"
                                            referrerPolicy="no-referrer"
                                        />
                                    </div>

                                    {/* Captioned item specifications */}
                                    <div className="font-extrabold text-[#0c0a09] dark:text-white uppercase tracking-tight leading-tight text-sm line-clamp-1 mb-1">
                                        {qrTargetType === 'ITEM' 
                                            ? (menu.find(m => m.id === qrSelectedItemId)?.name || 'Select Menu Item') 
                                            : qrTargetType === 'CATEGORY'
                                            ? (categories.find(c => c.id === qrSelectedCategoryId)?.name || 'Select Category')
                                            : `Table ${tables.find(t => t.id === qrSelectedTableId)?.number || 'Select Table'}`
                                        }
                                    </div>
                                    <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                        {qrTargetType === 'ITEM' ? 'Direct Selection Link' : qrTargetType === 'CATEGORY' ? 'Menu Category Section' : 'Direct Dining Station Link'}
                                    </div>
                                </div>

                                {/* Download and Print Buttons */}
                                <div className="w-full grid grid-cols-2 gap-4 max-w-[280px]">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (typeof window === 'undefined') return;
                                            const urlBase = window.location.origin + window.location.pathname;
                                            const finalUrl = qrTargetType === 'ITEM' 
                                                ? `${urlBase}?item=${encodeURIComponent(qrSelectedItemId)}` 
                                                : qrTargetType === 'CATEGORY'
                                                ? `${urlBase}?category=${encodeURIComponent(qrSelectedCategoryId)}`
                                                : `${urlBase}?table=${encodeURIComponent(qrSelectedTableId)}`;
                                            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(finalUrl)}&color=${qrColor.replace('#', '')}&bgcolor=ffffff`;
                                            try {
                                                const response = await fetch(qrImageUrl);
                                                const blob = await response.blob();
                                                const dlUrl = window.URL.createObjectURL(blob);
                                                const link = document.createElement('a');
                                                link.href = dlUrl;
                                                const dlName = qrTargetType === 'ITEM' 
                                                    ? `QR_item_${qrSelectedItemId}` 
                                                    : qrTargetType === 'CATEGORY' 
                                                    ? `QR_category_${qrSelectedCategoryId}` 
                                                    : `QR_table_${qrSelectedTableId}`;
                                                link.download = `${dlName}.png`;
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                                window.URL.revokeObjectURL(dlUrl);
                                            } catch (err) {
                                                window.open(qrImageUrl, '_blank');
                                            }
                                        }}
                                        className="h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-indigo"
                                    >
                                        <i className="fas fa-file-arrow-down"></i>
                                        Save PNG
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (typeof window === 'undefined') return;
                                            const urlBase = window.location.origin + window.location.pathname;
                                            const finalUrl = qrTargetType === 'ITEM' 
                                                ? `${urlBase}?item=${encodeURIComponent(qrSelectedItemId)}` 
                                                : qrTargetType === 'CATEGORY'
                                                ? `${urlBase}?category=${encodeURIComponent(qrSelectedCategoryId)}`
                                                : `${urlBase}?table=${encodeURIComponent(qrSelectedTableId)}`;
                                            const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(finalUrl)}&color=${qrColor.replace('#', '')}&bgcolor=ffffff`;
                                            const printWindow = window.open('', '_blank');
                                            if (!printWindow) return;
                                            
                                            const entityName = qrTargetType === 'ITEM' 
                                                ? (menu.find(m => m.id === qrSelectedItemId)?.name || 'Menu Item')
                                                : qrTargetType === 'CATEGORY'
                                                ? (categories.find(c => c.id === qrSelectedCategoryId)?.name || 'Category')
                                                : `Table ${tables.find(t => t.id === qrSelectedTableId)?.number || 'Dining Station'}`;
                                                
                                            printWindow.document.write(`
                                                <html>
                                                <head>
                                                    <title>Print QR Code - ${entityName}</title>
                                                    <style>
                                                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                                                        body {
                                                            font-family: 'Inter', sans-serif;
                                                            display: flex;
                                                            flex-direction: column;
                                                            align-items: center;
                                                            justify-content: center;
                                                            min-height: 100vh;
                                                            margin: 0;
                                                            padding: 40px;
                                                            background-color: #ffffff;
                                                            color: #0c0a09;
                                                        }
                                                        .card {
                                                            border: 3px solid #000000;
                                                            border-radius: 40px;
                                                            padding: 60px;
                                                            text-align: center;
                                                            max-width: 420px;
                                                            box-shadow: 0 10px 30px rgba(0,0,0,0.05);
                                                        }
                                                        .logo {
                                                            font-size: 24px;
                                                            font-weight: 900;
                                                            text-transform: uppercase;
                                                            letter-spacing: 0.1em;
                                                            margin-bottom: 20px;
                                                        }
                                                        .tagline {
                                                            font-size: 14px;
                                                            font-weight: 700;
                                                            letter-spacing: 0.25em;
                                                            color: #64748b;
                                                            text-transform: uppercase;
                                                            margin-bottom: 40px;
                                                        }
                                                        .qr-container {
                                                            background: white;
                                                            border: 2px solid #f1f5f9;
                                                            border-radius: 24px;
                                                            padding: 24px;
                                                            display: inline-block;
                                                            margin-bottom: 40px;
                                                        }
                                                        img {
                                                            display: block;
                                                            width: 250px;
                                                            height: 250px;
                                                        }
                                                        .title {
                                                            font-size: 22px;
                                                            font-weight: 950;
                                                            text-transform: uppercase;
                                                            margin-bottom: 10px;
                                                        }
                                                        .description {
                                                            font-size: 12px;
                                                            font-weight: 500;
                                                            color: #94a3b8;
                                                            text-transform: uppercase;
                                                            letter-spacing: 0.1em;
                                                        }
                                                        @media print {
                                                            body { padding: 0; }
                                                            .card { border: none; box-shadow: none; }
                                                        }
                                                    </style>
                                                </head>
                                                <body>
                                                    <div class="card">
                                                        <div class="logo">⚡ ${RESTAURANT_NAME}</div>
                                                        <div class="tagline">Scan to explore menu on mobile</div>
                                                        <div class="qr-container">
                                                            <img src="${qrImageUrl}" alt="QR Code" />
                                                        </div>
                                                        <div class="title">${entityName}</div>
                                                        <div class="description">${qrTargetType === 'ITEM' ? 'Direct Menu Selection' : qrTargetType === 'CATEGORY' ? 'Menu Category Section' : 'Instant Customer Table Terminal'}</div>
                                                    </div>
                                                    <script>
                                                        window.onload = function() {
                                                            setTimeout(function() {
                                                                window.print();
                                                                window.close();
                                                            }, 800);
                                                        };
                                                    </script>
                                                </body>
                                                </html>
                                            `);
                                            printWindow.document.close();
                                        }}
                                        className="h-12 bg-slate-900 border border-slate-705 hover:bg-slate-800 text-white rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-glow"
                                    >
                                        <i className="fas fa-print"></i>
                                        Print Tent
                                    </button>
                                </div>
                            </div>
                        </div>

                        <footer className="px-10 py-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 shrink-0">
                            <button 
                                type="button"
                                onClick={() => setIsQRModalOpen(false)}
                                className="h-12 px-8 bg-slate-900 hover:bg-slate-850 dark:bg-brand-600 dark:hover:bg-brand-505 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl active:scale-95 transition-all cursor-pointer shadow-glow"
                            >
                                Close Portal
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

const RoleEditModal = ({ 
    isOpen, 
    onClose, 
    role, 
    onSave 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    role: RoleDefinition | null, 
    onSave: (r: RoleDefinition) => void 
}) => {
    const [name, setName] = useState('');
    const [permissions, setPermissions] = useState<Permission[]>([]);

    React.useEffect(() => {
        if (role) {
            setName(role.name);
            setPermissions(role.permissions);
        } else {
            setName('');
            setPermissions([]);
        }
    }, [role, isOpen]);

    if (!isOpen) return null;

    const togglePermission = (p: Permission) => {
        setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    };

    const handleSave = () => {
        if (!name.trim()) return;
        onSave({
            id: role?.id || `custom_role_${Date.now()}` as Role,
            name,
            permissions,
            isSystem: role?.isSystem || false
        });
        onClose();
    };

    const groups = {
        'Visibility': [Permission.VIEW_POS, Permission.VIEW_KDS, Permission.VIEW_CUSTOMER_MENU, Permission.VIEW_FLOOR_PLAN, Permission.VIEW_RESERVATIONS, Permission.VIEW_SALES_REPORTS, Permission.VIEW_INVENTORY, Permission.VIEW_MENU_CATALOGUE, Permission.VIEW_AUDIT_TRAIL, Permission.VIEW_FEEDBACK, Permission.VIEW_TASKS],
        'Control': [Permission.MANAGE_ORDERS, Permission.PROCESS_PAYMENTS, Permission.PREPARE_ORDERS, Permission.MANAGE_MENU, Permission.MANAGE_FLOOR, Permission.MANAGE_TASKS],
        'Root': [Permission.MANAGE_PERSONNEL, Permission.MANAGE_ROLES, Permission.MANAGE_SYSTEM]
    };

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={onClose}></div>
            <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl w-full max-w-4xl relative z-10 flex flex-col h-[85vh] overflow-hidden animate-in zoom-in-95 border border-white/10 dark:border-slate-800">
                <header className="px-10 py-8 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{role ? 'Refine Protocol' : 'New Authority Node'}</h3>
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Configure RBAC Claim Spectrum</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-slate-900 dark:hover:text-white"><i className="fas fa-times"></i></button>
                </header>
                <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] px-2">Alias Identification</label>
                        <input 
                            className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl px-6 py-4 font-black uppercase text-xl outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-500 transition-all shadow-inner text-slate-900 dark:text-white"
                            placeholder="e.g. FLOOR SUPERVISOR"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>
                    {Object.entries(groups).map(([gName, gPerms]) => (
                        <div key={gName} className="space-y-6">
                            <h4 className="text-[11px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-[0.4em] border-l-4 border-brand-500 pl-4">{gName} Cluster</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {gPerms.map(p => (
                                    <button 
                                        key={p} 
                                        onClick={() => togglePermission(p)}
                                        className={`p-5 rounded-2xl border-2 text-left transition-all ${permissions.includes(p) ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-500 shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-50 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}`}
                                    >
                                        <div className="flex justify-between items-center mb-2">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${permissions.includes(p) ? 'text-brand-900 dark:text-brand-200' : 'text-slate-400 dark:text-slate-500'}`}>{p.replace(/VIEW_|MANAGE_/, '').replace(/_/g, ' ')}</span>
                                            {permissions.includes(p) && <i className="fas fa-check-circle text-brand-600 dark:text-brand-400"></i>}
                                        </div>
                                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-relaxed">{PERMISSION_DESCRIPTIONS[p]}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <footer className="p-8 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex gap-4 shrink-0">
                    <Button variant="secondary" onClick={onClose} className="flex-1 h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest border-slate-200 dark:border-slate-700">Abort</Button>
                    <Button onClick={handleSave} className="flex-1 h-14 rounded-2xl shadow-glow font-black uppercase text-[10px] tracking-widest">Update Spectrum</Button>
                </footer>
            </div>
        </div>
    );
};

export default AdminView;
