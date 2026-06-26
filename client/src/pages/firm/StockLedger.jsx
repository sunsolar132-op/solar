import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Calendar, X, Download, BookOpen, TrendingUp, TrendingDown,
  Package, ChevronDown, AlertTriangle, FileText, RefreshCcw, Loader2,
  Trash2, Edit2, MoreVertical, History, Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateUtils';
import BillDetailsModal from '../../components/BillDetailsModal';
import EntryHistoryModal from '../../components/EntryHistoryModal';

const TYPE_META = {
  PURCHASE:         { label: 'Purchase',       badge: 'bg-blue-50 text-blue-700 border-blue-100',   dir: 'in' },
  PURCHASE_RETURN:  { label: 'Purchase Return', badge: 'bg-red-50 text-red-600 border-red-100',     dir: 'out' },
  SALE:             { label: 'Sale (Outward)',  badge: 'bg-orange-50 text-orange-700 border-orange-100', dir: 'out' },
  SALE_RETURN:      { label: 'Sale Return',     badge: 'bg-green-50 text-green-700 border-green-100', dir: 'in' },
  ADJUSTMENT_ADD:   { label: 'Adjustment (Add)', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', dir: 'in' },
  ADJUSTMENT_REMOVE: { label: 'Adjustment (Remove)', badge: 'bg-pink-50 text-pink-700 border-pink-100', dir: 'out' },
};

export default function StockLedger() {
  const { addToast } = useToast();

  const [products, setProducts] = useState([]);
  const [productsFetching, setProductsFetching] = useState(false);
  const [productId, setProductId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [ledger, setLedger] = useState(null); // { openingBalance, hasDateFilter, rows, summary }
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [viewBill, setViewBill] = useState(null);   // full tx object for BillDetailsModal
  const [loadingBill, setLoadingBill] = useState(null); // billId being fetched

  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'adjustments'

  // User details
  const user = JSON.parse(sessionStorage.getItem('wms_user') || '{}');
  const userRole = user.role;

  // Qty Adjustment Form States
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split('T')[0]);
  const [adjProductId, setAdjProductId] = useState('');
  const [adjType, setAdjType] = useState('ADD'); // 'ADD' | 'REMOVE'
  const [adjQty, setAdjQty] = useState('');
  const [adjUnit, setAdjUnit] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Searchable Product Dropdown for the Form
  const [formPdOpen, setFormPdOpen] = useState(false);
  const [formPdSearch, setFormPdSearch] = useState('');
  const [formPdPos, setFormPdPos] = useState({ top: 0, left: 0, width: 0 });
  const formPdTriggerRef = useRef(null);
  const formPdInputRef = useRef(null);
  const formPdAnimRef = useRef(null);

  // Adjustments list & actions
  const [adjustments, setAdjustments] = useState([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // ID of adjustment showing 3-dot dropdown
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0, openUp: false });


  // Modal states
  const [editAdj, setEditAdj] = useState(null); // adjustment being edited
  const [historyAdj, setHistoryAdj] = useState(null); // adjustment showing history modal

  // ── Searchable product dropdown state ──────────────────────────────────────
  const [pdOpen, setPdOpen]       = useState(false);
  const [pdSearch, setPdSearch]   = useState('');
  const [pdPos, setPdPos]         = useState({ top: 0, left: 0, width: 0 });
  const pdTriggerRef  = useRef(null);
  const pdInputRef    = useRef(null);
  const pdAnimRef     = useRef(null);

  // ── Load products for dropdown ─────────────────────────────────────────────
  useEffect(() => {
    setProductsFetching(true);
    api.get('/products')
      .then(data => setProducts(data.filter(p => p.isActive !== false)))
      .catch(() => {})
      .finally(() => setProductsFetching(false));
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (pdOpen) setTimeout(() => pdInputRef.current?.focus(), 50);
  }, [pdOpen]);

  // Portal positioning
  const pdUpdatePos = useCallback(() => {
    if (pdTriggerRef.current) {
      const r = pdTriggerRef.current.getBoundingClientRect();
      setPdPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
  }, []);

  const pdOpen_ = () => { pdUpdatePos(); setPdOpen(true); };

  // Reposition on scroll/resize
  useEffect(() => {
    if (!pdOpen) return;
    const fn = () => {
      if (pdAnimRef.current) cancelAnimationFrame(pdAnimRef.current);
      pdAnimRef.current = requestAnimationFrame(pdUpdatePos);
    };
    window.addEventListener('scroll', fn, true);
    window.addEventListener('resize', fn, true);
    return () => {
      window.removeEventListener('scroll', fn, true);
      window.removeEventListener('resize', fn, true);
      if (pdAnimRef.current) cancelAnimationFrame(pdAnimRef.current);
    };
  }, [pdOpen, pdUpdatePos]);

  // Close on outside click
  useEffect(() => {
    if (!pdOpen) return;
    const handler = (e) => {
      const portal = document.getElementById('sl-product-portal');
      if (!pdTriggerRef.current?.contains(e.target) && !portal?.contains(e.target))
        setPdOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pdOpen]);

  // Derived — filtered product list
  const pdTrim = pdSearch.trim().toLowerCase();
  const pdFiltered = products.filter(p =>
    !pdTrim || p.name.toLowerCase().includes(pdTrim)
  );

  // Highlight helper
  const pdHighlight = (text) => {
    if (!pdTrim) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(pdTrim);
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <span className="bg-emerald-100 text-emerald-700 rounded px-0.5">{text.slice(idx, idx + pdTrim.length)}</span>
        <span>{text.slice(idx + pdTrim.length)}</span>
      </>
    );
  };

  const selectedProduct = products.find((p) => p.id === productId);

  // ── Stock Adjustments Fetch & Handlers ─────────────────────────────────────
  const fetchAdjustments = useCallback(async () => {
    setAdjustmentsLoading(true);
    try {
      const data = await api.get('/firm/adjustments');
      setAdjustments(data);
    } catch (e) {
      addToast(e.message || 'Failed to load adjustments', 'error');
    } finally {
      setAdjustmentsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (activeTab === 'adjustments') {
      fetchAdjustments();
    }
  }, [activeTab, fetchAdjustments]);

  useEffect(() => {
    if (formPdOpen) setTimeout(() => formPdInputRef.current?.focus(), 50);
  }, [formPdOpen]);

  const formPdUpdatePos = useCallback(() => {
    if (formPdTriggerRef.current) {
      const r = formPdTriggerRef.current.getBoundingClientRect();
      setFormPdPos({ top: r.bottom + 6, left: r.left, width: r.width });
    }
  }, []);

  const formPdOpen_ = () => { formPdUpdatePos(); setFormPdOpen(true); };

  useEffect(() => {
    if (!formPdOpen) return;
    const fn = () => {
      if (formPdAnimRef.current) cancelAnimationFrame(formPdAnimRef.current);
      formPdAnimRef.current = requestAnimationFrame(formPdUpdatePos);
    };
    window.addEventListener('scroll', fn, true);
    window.addEventListener('resize', fn, true);
    return () => {
      window.removeEventListener('scroll', fn, true);
      window.removeEventListener('resize', fn, true);
      if (formPdAnimRef.current) cancelAnimationFrame(formPdAnimRef.current);
    };
  }, [formPdOpen, formPdUpdatePos]);

  useEffect(() => {
    if (!formPdOpen) return;
    const handler = (e) => {
      const portal = document.getElementById('form-product-portal');
      if (!formPdTriggerRef.current?.contains(e.target) && !portal?.contains(e.target))
        setFormPdOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [formPdOpen]);

  const formPdTrim = formPdSearch.trim().toLowerCase();
  const formPdFiltered = products.filter(p =>
    !formPdTrim || p.name.toLowerCase().includes(formPdTrim)
  );

  const selectedFormProduct = products.find(p => p.id === adjProductId);

  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    if (!adjProductId) { addToast('Please select a product', 'error'); return; }
    if (!adjQty || parseFloat(adjQty) <= 0) { addToast('Please enter a valid quantity', 'error'); return; }
    if (!adjUnit) { addToast('Please select a unit', 'error'); return; }

    setFormSubmitting(true);
    try {
      await api.post('/firm/adjustments', {
        date: adjDate,
        productId: adjProductId,
        adjustmentType: adjType,
        qty: parseFloat(adjQty),
        unit: adjUnit,
        reason: adjReason,
      });
      addToast('Stock adjustment recorded successfully', 'success');
      
      // Reset form fields
      setAdjQty('');
      setAdjReason('');
      
      // Refresh data
      fetchAdjustments();
      if (productId && productId === adjProductId) {
        fetchLedger();
      }
    } catch (err) {
      addToast(err.message || 'Failed to save adjustment', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteAdjustment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this adjustment? This action cannot be undone.')) return;
    try {
      await api.delete(`/firm/adjustments/${id}`);
      addToast('Adjustment deleted successfully', 'success');
      fetchAdjustments();
      if (productId) {
        fetchLedger();
      }
    } catch (err) {
      addToast(err.message || 'Failed to delete adjustment', 'error');
    }
  };

  // ── Fetch ledger ───────────────────────────────────────────────────────────
  // NOTE: We must bypass api.get() cache here — ledger data changes frequently
  // and the same URL (e.g. /firm/stock-ledger?productId=X) could be stale.
  const fetchLedger = useCallback(async () => {
    if (!productId) { addToast('Please select a product first', 'error'); return; }
    setLoading(true);
    setSearched(true);
    setLedger(null); // clear previous result immediately so stale data never shows
    try {
      const params = new URLSearchParams({ productId });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      // Bypass module-level cache — always fetch fresh from server
      api.clearCache();
      const data = await api.get(`/firm/stock-ledger?${params}`);
      setLedger(data);
    } catch (e) {
      addToast(e.message || 'Failed to load ledger', 'error');
      setSearched(false);
    } finally {
      setLoading(false);
    }
  }, [productId, dateFrom, dateTo, addToast]);

  const handleClear = () => {
    setProductId('');
    setDateFrom('');
    setDateTo('');
    setLedger(null);
    setSearched(false);
  };

  // ── Open bill popup ────────────────────────────────────────────────────────
  const handleBillClick = async (billId) => {
    setLoadingBill(billId);
    try {
      const tx = await api.get(`/firm/transaction/${billId}`);
      setViewBill(tx);
    } catch (e) {
      addToast('Could not load bill details', 'error');
    } finally {
      setLoadingBill(null);
    }
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!ledger) return;
    const selectedProduct = products.find((p) => p.id === productId);
    const rows = [];
    if (ledger.hasDateFilter) {
      rows.push({ Date: '—', 'Bill No': '—', Detail: 'Opening Balance', 'Qty In': '', 'Qty Out': '', Balance: ledger.openingBalance });
    }
    ledger.rows.forEach((r, i) => {
      rows.push({
        '#': i + 1,
        Date: formatDate(r.date),
        'Bill No': r.billNo,
        'Party': r.partyName || '',
        Detail: r.detailLabel,
        'Qty In': r.qtyIn || '',
        'Qty Out': r.qtyOut || '',
        Balance: r.balance,
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Ledger');
    const today = new Date().toISOString().split('T')[0];
    const name = selectedProduct?.name?.replace(/[^a-z0-9]/gi, '_') || 'Product';
    XLSX.writeFile(wb, `Stock_Ledger_${name}_${today}.xlsx`);
  };



  // ── Summary cards ──────────────────────────────────────────────────────────
  const SummaryCard = ({ icon: Icon, label, value, color }) => (
    <div className={`flex items-center gap-4 p-5 rounded-2xl border ${color}`}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/60 shrink-0">
        <Icon size={20} />
      </div>
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</div>
        <div className="text-2xl font-black tracking-tight">{(value || 0).toLocaleString()}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="bg-emerald-500 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Stock Ledger</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              Physical stock movement · outward verified qty only
            </p>
          </div>
        </div>
        {activeTab === 'ledger' && ledger && (
          <div className="flex items-center gap-3 self-start">
            <button onClick={fetchLedger} className="btn-secondary flex items-center gap-2 py-2.5 px-5 shadow-sm">
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
              <span className="text-[10px] font-black uppercase tracking-widest">Refresh</span>
            </button>
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2 py-2.5 px-5 shadow-sm">
              <Download size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Export</span>
            </button>
          </div>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 border-b border-slate-100 pb-px">
        <button
          onClick={() => setActiveTab('ledger')}
          className={`px-6 py-3 font-black text-xs uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'ledger'
              ? 'border-emerald-500 text-slate-800'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Ledger View
        </button>
        <button
          onClick={() => setActiveTab('adjustments')}
          className={`px-6 py-3 font-black text-xs uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'adjustments'
              ? 'border-emerald-500 text-slate-800'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Stock Adjustments
        </button>
      </div>

      {activeTab === 'ledger' ? (
        <>
          {/* Filter Panel */}
          <div className="panel-card !p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-end">
              {/* Searchable Product Dropdown */}
              <div className="lg:col-span-2">
                <label className="field-label">Product</label>
                {/* Trigger */}
                <div
                  ref={pdTriggerRef}
                  onClick={() => pdOpen ? setPdOpen(false) : pdOpen_()}
                  className={`relative flex items-center justify-between input-field pl-12 py-2.5 pr-4 cursor-pointer select-none
                    ${pdOpen ? 'border-emerald-500 ring-2 ring-emerald-50' : 'hover:border-slate-300'}`}
                >
                  <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <span className={`text-sm font-bold truncate ${selectedProduct ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                    {selectedProduct ? `${selectedProduct.name}${selectedProduct.unit ? ` (${selectedProduct.unit})` : ''}` : '— Select Product —'}
                  </span>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {selectedProduct && (
                      <button
                        onClick={e => { e.stopPropagation(); setProductId(''); setLedger(null); setSearched(false); setPdSearch(''); }}
                        className="text-slate-300 hover:text-red-400 transition-colors p-0.5"
                        title="Clear selection"
                      >
                        <X size={13} />
                      </button>
                    )}
                    <ChevronDown size={15} className={`text-slate-300 transition-transform ${pdOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Portal dropdown */}
                {pdOpen && createPortal(
                  <div
                    id="sl-product-portal"
                    style={{
                      position: 'fixed',
                      top: pdPos.top,
                      left: pdPos.left,
                      width: pdPos.width,
                      zIndex: 9999,
                      maxHeight: `calc(100vh - ${pdPos.top}px - 16px)`,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
                  >
                    {/* Search input */}
                    <div className="p-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                      <div className="relative">
                        {productsFetching
                          ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" size={16} />
                          : <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        }
                        <input
                          ref={pdInputRef}
                          type="text"
                          className="w-full pl-9 pr-8 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 placeholder-slate-400 transition-all"
                          placeholder="Search product..."
                          value={pdSearch}
                          onChange={e => setPdSearch(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setPdOpen(false);
                            if (e.key === 'Enter' && pdFiltered.length === 1) {
                              setProductId(pdFiltered[0].id);
                              setLedger(null); setSearched(false);
                              setPdSearch(''); setPdOpen(false);
                            }
                          }}
                        />
                        {pdSearch && (
                          <button
                            onClick={() => setPdSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      {!productsFetching && (
                        <div className="mt-1.5 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {pdTrim
                            ? `${pdFiltered.length} result${pdFiltered.length !== 1 ? 's' : ''} for "${pdSearch}"`
                            : `${products.length} product${products.length !== 1 ? 's' : ''} in catalog`}
                        </div>
                      )}
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto" style={{ flex: '1 1 auto' }}>
                      {productsFetching ? (
                        <div className="p-3 space-y-1.5">
                          {[1,2,3,4].map(i => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                              <div className="w-2 h-2 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
                              <div className="h-3 bg-slate-100 rounded-full animate-pulse" style={{ width: `${45 + i * 13}%` }} />
                            </div>
                          ))}
                        </div>
                      ) : pdFiltered.length > 0 ? (
                        <div className="p-2">
                          {pdFiltered.map(p => (
                            <div
                              key={p.id}
                              onClick={() => {
                                setProductId(p.id);
                                setLedger(null); setSearched(false);
                                setPdSearch(''); setPdOpen(false);
                              }}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all group
                                ${p.id === productId ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors
                                  ${p.id === productId ? 'bg-emerald-500' : 'bg-slate-200 group-hover:bg-emerald-400'}`} />
                                <span className={`text-sm font-bold truncate
                                  ${p.id === productId ? 'text-emerald-800' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                  {pdHighlight(p.name)}
                                </span>
                              </div>
                              {p.unit && (
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2 flex-shrink-0">{p.unit}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                            <Search size={18} className="text-slate-300" />
                          </div>
                          <div className="text-slate-400 font-bold text-sm">No products found</div>
                          <div className="text-slate-300 text-xs mt-1">"{pdSearch}" not in catalog</div>
                        </div>
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

              {/* Date From */}
              <div className="group">
                <label className="field-label">Date From</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={18} />
                  <input
                    type="date"
                    className="input-field pl-12 py-2.5"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
              </div>

              {/* Date To */}
              <div className="group">
                <label className="field-label">Date To</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={18} />
                  <input
                    type="date"
                    className="input-field pl-12 py-2.5"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={fetchLedger}
                  disabled={loading || !productId}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Search size={16} />
                  }
                  <span className="text-[10px] font-black uppercase tracking-widest">Search</span>
                </button>
                <button
                  onClick={handleClear}
                  className="btn-secondary px-4 py-2.5 flex items-center justify-center gap-1 text-slate-400 hover:text-slate-700"
                  title="Clear filters"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Summary Strip */}
          {ledger && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                icon={BookOpen}
                label={ledger.hasDateFilter ? 'Opening Balance' : 'Opening Stock'}
                value={ledger.openingBalance}
                color="border-slate-200 text-slate-700 bg-slate-50"
              />
              <SummaryCard
                icon={TrendingUp}
                label="Total In (Credit)"
                value={ledger.summary.totalIn}
                color="border-blue-100 text-blue-700 bg-blue-50"
              />
              <SummaryCard
                icon={TrendingDown}
                label="Total Out (Debit)"
                value={ledger.summary.totalOut}
                color="border-orange-100 text-orange-700 bg-orange-50"
              />
              <SummaryCard
                icon={Package}
                label="Closing Balance"
                value={ledger.summary.closingBalance}
                color={ledger.summary.closingBalance <= 0
                  ? 'border-red-100 text-red-700 bg-red-50'
                  : 'border-emerald-100 text-emerald-700 bg-emerald-50'}
              />
            </div>
          )}

          {/* Ledger Table */}
          <div className="panel-card !p-0 overflow-hidden">
            <div className="px-10 py-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  {selectedProduct ? selectedProduct.name : 'Product Stock Ledger'}
                </h3>
                {selectedProduct?.unit && (
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                    Standard Unit: {selectedProduct.unit}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                  Physical Stock Only
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-10 w-14">#</th>
                    <th className="min-w-[110px]">Date</th>
                    <th className="min-w-[130px]">Bill No</th>
                    <th>Party</th>
                    <th>Detail</th>
                    <th className="text-right text-blue-600">Qty In</th>
                    <th className="text-right text-orange-600">Qty Out</th>
                    <th className="text-right pr-10">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Loading */}
                  {loading && (
                    <tr>
                      <td colSpan={8} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-8 h-8 border-4 border-emerald-50 border-t-emerald-500 rounded-full animate-spin" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading ledger...</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Not yet searched */}
                  {!loading && !searched && (
                    <tr>
                      <td colSpan={8} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-30">
                          <BookOpen size={48} className="text-slate-300" />
                          <p className="text-sm font-bold text-slate-400">Select a product and click Search to view ledger</p>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* No data — show whether date filter is active or not */}
                  {!loading && searched && ledger && ledger.rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-40">
                          <FileText size={48} className="text-slate-200" />
                          <p className="text-sm font-bold text-slate-400">
                            {ledger.hasDateFilter
                              ? 'No stock movements found for the selected date range'
                              : 'No physical stock movements found for this product'}
                          </p>
                          {ledger.hasDateFilter && (
                            <p className="text-xs text-slate-400">
                              Try expanding the date range or clearing the filter
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Opening Balance Row (when date filter active) */}
                  {!loading && ledger?.hasDateFilter && (
                    <tr className="bg-slate-50/60 italic">
                      <td className="pl-10 text-slate-300 font-bold">—</td>
                      <td className="font-bold text-slate-400">{dateFrom}</td>
                      <td className="text-slate-300 font-bold">—</td>
                      <td className="text-slate-400 font-bold">Opening Balance</td>
                      <td>
                        <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                          Brought Forward
                        </span>
                      </td>
                      <td className="text-right font-bold text-slate-300">—</td>
                      <td className="text-right font-bold text-slate-300">—</td>
                      <td className="text-right pr-10">
                        <span className={`font-black text-base ${ledger.openingBalance < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                          {(ledger.openingBalance || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  )}

                  {/* Ledger Rows */}
                  {!loading && ledger?.rows.map((row, i) => {
                    const meta = TYPE_META[row.type] || { label: row.detailLabel, badge: 'bg-slate-50 text-slate-600 border-slate-100', dir: 'in' };
                    const isNegativeBalance = row.balance < 0;

                    return (
                      <tr key={`${row.billId}-${i}`} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="pl-10 text-slate-400 font-bold">{i + 1}</td>
                        <td className="font-black text-slate-900">{formatDate(row.date)}</td>
                        <td>
                          {row.isAdjustment ? (
                            <span className="font-mono text-xs font-black text-slate-600">
                              {row.billNo}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleBillClick(row.billId)}
                              disabled={loadingBill === row.billId}
                              className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-mono text-xs font-black hover:underline transition-colors disabled:opacity-50"
                              title="View bill details"
                            >
                              {loadingBill === row.billId
                                ? <div className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                : <FileText size={12} className="text-blue-300 group-hover:text-blue-500" />
                              }
                              {row.billNo}
                            </button>
                          )}
                        </td>
                        <td className="font-bold text-slate-600 text-sm max-w-[180px] truncate" title={row.partyName}>
                          {row.partyName || '—'}
                        </td>
                        <td>
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${meta.badge}`} title={row.reason}>
                            {row.detailLabel || meta.label}
                          </span>
                          {row.reason && (
                            <div className="text-[10px] text-slate-400 font-semibold mt-0.5 max-w-[150px] truncate" title={row.reason}>
                              {row.reason}
                            </div>
                          )}
                        </td>
                        <td className="text-right">
                          {row.qtyIn > 0 ? (
                            <span className="font-black text-blue-600">{row.qtyIn.toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-200 font-bold">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          {row.qtyOut > 0 ? (
                            <span className="font-black text-orange-600">{row.qtyOut.toLocaleString()}</span>
                          ) : (
                            <span className="text-slate-200 font-bold">—</span>
                          )}
                        </td>
                        <td className="text-right pr-10">
                          <span className={`inline-flex items-center justify-center gap-1 px-3 py-1 rounded-lg text-sm font-black ${
                            isNegativeBalance
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-slate-50 text-slate-900 border border-slate-100'
                          }`}>
                            {isNegativeBalance && <AlertTriangle size={10} />}
                            {row.balance.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer with totals */}
                {ledger && ledger.rows.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-white text-slate-900 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
                    <tr>
                      <td colSpan={5} className="pl-10 !py-6">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Period Totals</span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">
                            {ledger.rows.length} transaction{ledger.rows.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td className="text-right font-black text-lg !py-6 !border-none text-blue-600">
                        {ledger.summary.totalIn.toLocaleString()}
                      </td>
                      <td className="text-right font-black text-lg !py-6 !border-none text-orange-600">
                        {ledger.summary.totalOut.toLocaleString()}
                      </td>
                      <td className={`text-right pr-10 font-black text-lg !py-6 !border-none ${ledger.summary.closingBalance <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {ledger.summary.closingBalance.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Qty Adjustment Form */}
          <div className="panel-card !p-8">
            <h3 className="text-lg font-black text-slate-900 tracking-tight mb-6">Record New Stock Quantity Adjustment</h3>
            <form onSubmit={handleSaveAdjustment} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5 items-end">
              {/* Date */}
              <div>
                <label className="field-label">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input
                    type="date"
                    required
                    className="input-field pl-12 py-2.5"
                    value={adjDate}
                    onChange={e => setAdjDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Product Searchable Dropdown */}
              <div className="lg:col-span-2 relative">
                <label className="field-label">Product</label>
                <div
                  ref={formPdTriggerRef}
                  onClick={() => formPdOpen ? setFormPdOpen(false) : formPdOpen_()}
                  className={`relative flex items-center justify-between input-field pl-12 py-2.5 pr-4 cursor-pointer select-none
                    ${formPdOpen ? 'border-emerald-500 ring-2 ring-emerald-50' : 'hover:border-slate-300'}`}
                >
                  <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <span className={`text-sm font-bold truncate ${selectedFormProduct ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                    {selectedFormProduct ? `${selectedFormProduct.name}${selectedFormProduct.unit ? ` (${selectedFormProduct.unit})` : ''}` : '— Select Product —'}
                  </span>
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {selectedFormProduct && (
                      <button
                        onClick={e => { e.stopPropagation(); setAdjProductId(''); setAdjUnit(''); setFormPdSearch(''); }}
                        className="text-slate-300 hover:text-red-400 transition-colors p-0.5"
                        title="Clear selection"
                      >
                        <X size={13} />
                      </button>
                    )}
                    <ChevronDown size={15} className={`text-slate-300 transition-transform ${formPdOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {formPdOpen && createPortal(
                  <div
                    id="form-product-portal"
                    style={{
                      position: 'fixed',
                      top: formPdPos.top,
                      left: formPdPos.left,
                      width: formPdPos.width,
                      zIndex: 9999,
                      maxHeight: `calc(100vh - ${formPdPos.top}px - 16px)`,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
                  >
                    <div className="p-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                      <div className="relative">
                        {productsFetching
                          ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 animate-spin" size={16} />
                          : <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                        }
                        <input
                          ref={formPdInputRef}
                          type="text"
                          className="w-full pl-9 pr-8 py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-200 rounded-xl outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-50 placeholder-slate-400 transition-all"
                          placeholder="Search product..."
                          value={formPdSearch}
                          onChange={e => setFormPdSearch(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Escape') setFormPdOpen(false);
                            if (e.key === 'Enter' && formPdFiltered.length === 1) {
                              setAdjProductId(formPdFiltered[0].id);
                              setAdjUnit(formPdFiltered[0].unit || '');
                              setFormPdSearch(''); setFormPdOpen(false);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="overflow-y-auto" style={{ flex: '1 1 auto' }}>
                      {productsFetching ? (
                        <div className="p-3 space-y-1.5">
                          {[1,2,3,4].map(i => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                              <div className="w-2 h-2 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
                              <div className="h-3 bg-slate-100 rounded-full animate-pulse" style={{ width: `${45 + i * 13}%` }} />
                            </div>
                          ))}
                        </div>
                      ) : formPdFiltered.length > 0 ? (
                        <div className="p-2">
                          {formPdFiltered.map(p => (
                            <div
                              key={p.id}
                              onClick={() => {
                                setAdjProductId(p.id);
                                setAdjUnit(p.unit || '');
                                setFormPdSearch(''); setFormPdOpen(false);
                              }}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all group
                                ${p.id === adjProductId ? 'bg-emerald-50 border border-emerald-100' : 'hover:bg-slate-50 border border-transparent'}`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors
                                  ${p.id === adjProductId ? 'bg-emerald-500' : 'bg-slate-200 group-hover:bg-emerald-400'}`} />
                                <span className={`text-sm font-bold truncate
                                  ${p.id === adjProductId ? 'text-emerald-800' : 'text-slate-700 group-hover:text-slate-900'}`}>
                                  {p.name}
                                </span>
                              </div>
                              {p.unit && (
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2 flex-shrink-0">{p.unit}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-8 text-center">
                          <div className="text-slate-400 font-bold text-sm">No products found</div>
                        </div>
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

              {/* Adjustment Type */}
              <div>
                <label className="field-label">Adjustment Type</label>
                <select
                  className="input-field select-field font-bold py-2.5"
                  value={adjType}
                  onChange={e => setAdjType(e.target.value)}
                >
                  <option value="ADD">Add Stock (+)</option>
                  <option value="REMOVE">Remove Stock (-)</option>
                </select>
              </div>

              {/* Qty */}
              <div>
                <label className="field-label">Qty</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  placeholder="0.00"
                  className="input-field py-2.5"
                  value={adjQty}
                  onChange={e => setAdjQty(e.target.value)}
                />
              </div>

              {/* Unit */}
              <div>
                <label className="field-label">Unit</label>
                <select
                  required
                  className="input-field select-field font-bold py-2.5"
                  value={adjUnit}
                  onChange={e => setAdjUnit(e.target.value)}
                  disabled={!adjProductId}
                >
                  <option value="">— Select Unit —</option>
                  {selectedFormProduct && [selectedFormProduct.unit, selectedFormProduct.alternateUnit].filter(Boolean).map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Reason */}
              <div className="lg:col-span-5">
                <label className="field-label">Reason</label>
                <input
                  type="text"
                  required
                  placeholder="Reason / Narration for this adjustment..."
                  className="input-field py-2.5"
                  value={adjReason}
                  onChange={e => setAdjReason(e.target.value)}
                />
              </div>

              {/* Save Button */}
              <div>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn-primary w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50"
                >
                  {formSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest">Save</span>
                </button>
              </div>
            </form>
          </div>

          {/* Adjustments List Table */}
          <div className="panel-card !p-0 overflow-hidden">
            <div className="px-10 py-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Recorded Quantity Adjustments</h3>
              <button
                onClick={fetchAdjustments}
                className="btn-secondary flex items-center gap-2 py-1.5 px-4 shadow-sm"
              >
                <RefreshCcw size={13} className={adjustmentsLoading ? 'animate-spin' : ''} />
                <span className="text-[9px] font-black uppercase tracking-widest">Refresh List</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-10 w-14">#</th>
                    <th className="min-w-[110px]">Date</th>
                    <th className="min-w-[130px]">Adjustment No</th>
                    <th>Product</th>
                    <th>Type</th>
                    <th className="text-right">Qty</th>
                    <th>Unit</th>
                    <th>Reason</th>
                    <th className="text-center w-24 pr-10">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {adjustmentsLoading ? (
                    <tr>
                      <td colSpan={9} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-8 h-8 border-4 border-emerald-50 border-t-emerald-500 rounded-full animate-spin" />
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading adjustments...</span>
                        </div>
                      </td>
                    </tr>
                  ) : adjustments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-24 text-center opacity-30">
                        <Package size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-sm font-bold text-slate-400">No adjustments recorded yet</p>
                      </td>
                    </tr>
                  ) : (
                    adjustments.map((item, idx) => {
                      const isAdd = item.adjustment_type === 'ADD';
                      const adjNo = `ADJ-${String(item.adjustment_no).padStart(3, '0')}`;
                      return (
                        <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="pl-10 text-slate-400 font-bold">{idx + 1}</td>
                          <td className="font-black text-slate-900">{formatDate(item.date)}</td>
                          <td className="font-mono text-xs font-black text-slate-800">{adjNo}</td>
                          <td className="font-bold text-slate-700">{item.product_name || 'Unknown Product'}</td>
                          <td>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                              isAdd
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-pink-50 text-pink-700 border-pink-100'
                            }`}>
                              {isAdd ? 'Add (+)' : 'Remove (-)'}
                            </span>
                          </td>
                          <td className="text-right font-black text-slate-800">
                            {parseFloat(item.qty).toLocaleString()}
                          </td>
                          <td className="font-black text-slate-500 text-xs">{item.unit}</td>
                          <td className="text-slate-600 font-semibold text-sm max-w-[200px] truncate" title={item.reason}>
                            {item.reason || '—'}
                          </td>
                          <td className="pr-10" onClick={evt => evt.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const openUp = rect.bottom > window.innerHeight - 150;
                                    setDropdownPos({
                                      top: openUp ? rect.top - 4 : rect.bottom + 4,
                                      right: window.innerWidth - rect.right,
                                      openUp
                                    });
                                    setOpenDropdown(openDropdown === item.id ? null : item.id);
                                  }}
                                  className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
                                  title="More actions"
                                >
                                  <MoreVertical size={16} />
                                </button>
                                {openDropdown === item.id && createPortal(
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
                                    <div
                                      style={{
                                        position: 'fixed',
                                        top: dropdownPos.top,
                                        right: dropdownPos.right,
                                        transform: dropdownPos.openUp ? 'translateY(-100%)' : 'none',
                                      }}
                                      className="w-44 bg-white border border-slate-100 rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100"
                                    >
                                      <button
                                        onClick={() => { setOpenDropdown(null); setEditAdj(item); }}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                      >
                                        <Edit2 size={14} />
                                        Edit
                                      </button>
                                      <button
                                        onClick={() => { setOpenDropdown(null); handleDeleteAdjustment(item.id); }}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                                      >
                                        <Trash2 size={14} />
                                        Delete
                                      </button>
                                      <button
                                        onClick={() => { setOpenDropdown(null); setHistoryAdj(item); }}
                                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors border-t border-slate-50"
                                      >
                                        <History size={14} />
                                        History
                                      </button>
                                    </div>
                                  </>,
                                  document.body
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Bill Details Modal */}
      {viewBill && (
        <BillDetailsModal entry={viewBill} onClose={() => setViewBill(null)} />
      )}

      {/* Entry History Modal */}
      {historyAdj && (
        <EntryHistoryModal
          entry={{ id: historyAdj.id, type: 'ADJUSTMENT' }}
          userRole={userRole}
          onClose={() => setHistoryAdj(null)}
        />
      )}

      {/* Edit Adjustment Modal */}
      {editAdj && (
        <EditAdjustmentModal
          adj={editAdj}
          products={products}
          onClose={() => setEditAdj(null)}
          onSave={() => {
            fetchAdjustments();
            if (productId) fetchLedger();
          }}
          addToast={addToast}
        />
      )}
    </div>
  );
}

// ── Edit Adjustment Modal Component ──────────────────────────────────────────
function EditAdjustmentModal({ adj, products, onClose, onSave, addToast }) {
  const [date, setDate] = useState(adj.date ? new Date(adj.date).toISOString().split('T')[0] : '');
  const [type, setType] = useState(adj.adjustment_type || 'ADD');
  const [qty, setQty] = useState(adj.qty || '');
  const [unit, setUnit] = useState(adj.unit || '');
  const [reason, setReason] = useState(adj.reason || '');
  const [submitting, setSubmitting] = useState(false);

  const product = products.find(p => p.id === adj.product_id);
  const unitsList = product ? [product.unit, product.alternateUnit].filter(Boolean) : [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!qty || parseFloat(qty) <= 0) { addToast('Please enter a valid quantity', 'error'); return; }
    if (!unit) { addToast('Please select a unit', 'error'); return; }

    setSubmitting(true);
    try {
      await api.put(`/firm/adjustments/${adj.id}`, {
        date,
        productId: adj.product_id,
        adjustmentType: type,
        qty: parseFloat(qty),
        unit,
        reason,
      });
      addToast('Adjustment updated successfully', 'success');
      onSave();
      onClose();
    } catch (err) {
      addToast(err.message || 'Failed to update adjustment', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-250">
        {/* Header */}
        <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Edit Stock Adjustment</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all border border-slate-100 shadow-sm">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="field-label">Product</label>
            <input
              type="text"
              readOnly
              className="input-field bg-slate-50 text-slate-500 font-bold"
              value={product ? `${product.name}${product.unit ? ` (${product.unit})` : ''}` : 'Unknown Product'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Date</label>
              <input
                type="date"
                required
                className="input-field"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Adjustment Type</label>
              <select
                className="input-field select-field font-bold"
                value={type}
                onChange={e => setType(e.target.value)}
              >
                <option value="ADD">Add Stock (+)</option>
                <option value="REMOVE">Remove Stock (-)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Quantity</label>
              <input
                type="number"
                step="0.0001"
                required
                placeholder="0.00"
                className="input-field"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Unit</label>
              <select
                required
                className="input-field select-field font-bold"
                value={unit}
                onChange={e => setUnit(e.target.value)}
              >
                <option value="">— Select Unit —</option>
                {unitsList.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">Reason</label>
            <textarea
              className="input-field min-h-[80px] py-3 resize-none"
              placeholder="Provide reason for adjustment..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>

          <div className="flex gap-4 pt-2 border-t border-slate-50">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1 py-3 text-sm font-black uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex-1 py-3 text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              {submitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
