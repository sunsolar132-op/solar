import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Calendar, Trash2, Edit2, X, Download, Hash, User, CheckCircle2, Truck, FileDown, MoreVertical, ChevronDown, ChevronUp, Package, History } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDate, fromDBDate } from '../../utils/dateUtils';
import EntryForm from './EntryForm';
import ConvertToSaleModal from '../../components/ConvertToSaleModal';
import BillDetailsModal from '../../components/BillDetailsModal';
import OutwardDetailsModal from '../../components/OutwardDetailsModal';
import MarkCompleteModal from '../../components/MarkCompleteModal';
import EntryHistoryModal from '../../components/EntryHistoryModal';
import { printBillAsGSTInvoice } from '../../utils/BillPrintUtil';

export default function StatementPage({ type: initialType, title, showAgent }) {
  const [openDropdown, setOpenDropdown] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [historyEntry, setHistoryEntry] = useState(null);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [viewMode, setViewMode] = useState('STANDARD'); // STANDARD, RETURN, BOTH
  const [layoutMode, setLayoutMode] = useState('PARTY'); // PARTY, PRODUCT
  const currentType = viewMode === 'BOTH' ? `${initialType}_ALL` : (viewMode === 'RETURN' ? `${initialType}_RETURN` : initialType);

  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', search: '' });
  const [loading, setLoading] = useState(false);
  const [firmProfile, setFirmProfile] = useState({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [convertEntry, setConvertEntry] = useState(null); // entry being converted
  const [viewBillEntry, setViewBillEntry] = useState(null);
  const [viewOutwardEntry, setViewOutwardEntry] = useState(null);
  const [editOutwardEntry, setEditOutwardEntry] = useState(null);

  const isPOorBook = initialType === 'SO' || initialType === 'BOOK';

  const fetchEntries = async (typeOverride) => {
    setLoading(true);
    const typeToFetch = typeOverride !== undefined ? typeOverride : currentType;
    try {
      let path = '';
      if (initialType === 'SO') path = '/firm/so-statement';
      else if (initialType === 'BOOK') path = '/firm/book-statement';
      else path = `/firm/entries?type=${typeToFetch}`;

      const data = await api.get(path);
      setEntries(data);
    } catch (e) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(currentType); }, [initialType, currentType]);

  // Fetch firm profile once for bill printing
  useEffect(() => {
    api.get('/firm/profile').then(setFirmProfile).catch(() => {});
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    try {
      await api.delete(`/firm/entries/${id}`);
      addToast('Record removed from ledger');
      fetchEntries();
    } catch (e) { addToast(e.message, 'error'); }
  };

  const handleEditRedirect = (entry) => {
    if (entry.type === 'SALE' && entry.deliveryStatus === 'Completed') {
      const proceed = window.confirm('This sale is already delivered. Editing the sale bill will not change stock/outward rows. Use "Edit Outward / Stock" if delivered product or delivered qty changed. Continue editing bill only?');
      if (!proceed) return;
    }
    let path = '';
    const type = entry.type;
    if (type.startsWith('PURCHASE')) path = '/firm/purchase-entry';
    else if (type.startsWith('SALE')) path = '/firm/sale-entry';
    else if (type.startsWith('SO')) path = '/firm/so-entry';
    else if (type.startsWith('BOOK')) path = '/firm/book-entry';
    navigate(path, { state: { editEntry: entry } });
  };

  const filtered = entries.filter(e => {
    const search = filters.search.toLowerCase();
    const itemSearchMatch = e.items?.some(i => i.productName?.toLowerCase().includes(search) || i.remark?.toLowerCase().includes(search));
    const matchSearch = !search || itemSearchMatch || [e.partyName, e.remarkVersion, e.agentName, e.poId, e.billNo].some(v => v?.toLowerCase().includes(search));
    const isoDate = fromDBDate(e.date);
    const matchFrom = !filters.dateFrom || isoDate >= filters.dateFrom;
    const matchTo = !filters.dateTo || isoDate <= filters.dateTo;
    return matchSearch && matchFrom && matchTo;
  });

  const flattened = layoutMode === 'PRODUCT' ? filtered.flatMap(e => e.items?.map(i => ({ ...e, item: i })) || []) : [];

  const displayData = layoutMode === 'PARTY' ? filtered : flattened;

  const totalQty = displayData.reduce((s, e) => s + (parseFloat(layoutMode === 'PARTY' ? (e.totalQty ?? e.qty) : e.item.qty) || 0), 0);
  const totalAmount = displayData.reduce((s, e) => s + (parseFloat(layoutMode === 'PARTY' ? e.amount : e.item.amount) || 0), 0);

  const pendingCount = isPOorBook ? filtered.filter(e => e.status !== 'Converted').length : 0;
  const convertedCount = isPOorBook ? filtered.filter(e => e.status === 'Converted').length : 0;

  const handleExport = () => {
    const rows = displayData.map((e, i) => {
      const qty = layoutMode === 'PARTY' ? (e.totalQty ?? e.qty ?? 0) : e.item.qty;
      const amount = layoutMode === 'PARTY' ? e.amount : e.item.amount;
      const row = { '#': i + 1, 'Date': formatDate(e.date) };
      if (initialType === 'SO' || initialType === 'BOOK' || initialType === 'SALE') {
        row['Delivery Date'] = formatDate(e.deliveryDate);
      }
      row['Party Name'] = e.partyName || '';
      if (layoutMode === 'PRODUCT') {
        row['Product'] = e.item?.productName || '';
      }
      if (showAgent) {
        row['Agent'] = e.agentName || 'DIRECT';
      }
      row['Ref'] = e.remarkVersion || '';
      row['Qty'] = qty;
      if (layoutMode === 'PRODUCT') {
        row['Rate (₹)'] = e.item?.rate || '';
      }
      row['Amount (₹)'] = amount || 0;
      if (initialType === 'SO') {
        row['SO Serial'] = e.soId || e.poId || '';
      }
      if (initialType === 'PURCHASE' || initialType === 'SALE') {
        row['Bill No'] = e.soId || e.billNo || '';
      }
      if (initialType === 'SALE') {
        row['Outward Status'] = e.deliveryStatus || '';
      }
      if (isPOorBook) {
        row['Status'] = e.status || 'Pending';
      }
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Statement');
    const today = new Date().toISOString().split('T')[0];
    const safeName = (title || 'Statement').replace(/[^a-z0-9]/gi, '_');
    XLSX.writeFile(wb, `${safeName}_${today}.xlsx`);
  };

  // Per-bill GST Tax Invoice print (opens in new tab → Ctrl+P → Save as PDF)
  const handlePrintBill = (e) => {
    printBillAsGSTInvoice(e, firmProfile);
  };

  // Status pill component
  const StatusPill = ({ entry }) => {
    if (!isPOorBook) return null;
    if (entry.status === 'Converted') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap">
          <CheckCircle2 size={10} />
          Converted
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-100 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Pending
      </span>
    );
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className={`rounded-full w-1.5 h-12 mt-1 ${viewMode === 'RETURN' ? 'bg-amber-500' : (viewMode === 'BOTH' ? 'bg-slate-900' : 'bg-blue-600')}`} />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
              {viewMode === 'BOTH' ? `${title} (Consolidated)` : (viewMode === 'RETURN' ? `${title} (Returns)` : title)}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              Showing {filtered.length} matched ledger transactions
              {isPOorBook && pendingCount > 0 && <span className="text-amber-500 ml-2">· {pendingCount} pending</span>}
              {isPOorBook && convertedCount > 0 && <span className="text-emerald-500 ml-2">· {convertedCount} converted</span>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-2xl flex gap-1">
            <button
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${layoutMode === 'PARTY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => setLayoutMode('PARTY')}
            >
              Party Wise
            </button>
            <button
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${layoutMode === 'PRODUCT' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              onClick={() => setLayoutMode('PRODUCT')}
            >
              Product Wise
            </button>
          </div>

          {(initialType === 'PURCHASE' || initialType === 'SALE') && (
            <div className="bg-slate-100 p-1 rounded-2xl flex gap-1">
              {['STANDARD', 'RETURN', 'BOTH'].map((mode) => {
                const modeType = mode === 'BOTH' ? `${initialType}_ALL` : (mode === 'RETURN' ? `${initialType}_RETURN` : initialType);
                return (
                  <button
                    key={mode}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    onClick={() => { setViewMode(mode); fetchEntries(modeType); }}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
          )}

          <button onClick={handleExport} className="btn-secondary !px-4 !py-2.5 text-xs flex items-center gap-2">
            <Download size={16} />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Filter Section */}
      <div className="panel-card !p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-6 items-end">
          <div className="group">
            <label className="field-label">Date From</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input type="date" className="input-field pl-12 py-2.5" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
            </div>
          </div>
          <div className="group">
            <label className="field-label">Date To</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input type="date" className="input-field pl-12 py-2.5" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
            </div>
          </div>
          <div className="md:col-span-2 group">
            <label className="field-label">Master Search (Product, Party, SO ID)</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
              <input
                className="input-field pl-12 py-2.5 font-bold"
                placeholder="Type query to filter records..."
                value={filters.search}
                onChange={e => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
          </div>
          <button
            className="btn-secondary !bg-slate-50 !text-slate-400 hover:!bg-slate-100 hover:!text-slate-900 border border-slate-100 py-2.5 flex items-center justify-center gap-2"
            onClick={() => setFilters({ dateFrom: '', dateTo: '', search: '' })}
          >
            <X size={16} />
            <span className="uppercase tracking-widest text-[10px] font-black text-center">Clear</span>
          </button>
        </div>
      </div>

      {/* Statement Table Panel */}
      <div className="panel-card !p-0 overflow-hidden">
        <div className="px-10 py-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Ledger Analysis</h3>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Audit Trail</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-10">#</th>
                <th className="min-w-[120px]">Date</th>
                {(initialType === 'SO' || initialType === 'BOOK' || initialType === 'SALE') && <th>Delivery</th>}
                <th>Party Identity</th>
                {layoutMode === 'PRODUCT' && <th>Product</th>}
                {showAgent && <th>Agent</th>}
                <th>Ref</th>
                <th>Qty</th>
                {layoutMode === 'PRODUCT' && <th>Rate</th>}
                <th>Amount</th>
                {isPOorBook ? <th>SO Serial</th> : null}
                {(initialType === 'PURCHASE' || initialType === 'SALE') ? <th>Bill No</th> : null}
                {initialType === 'SALE' && <th>Outward</th>}
                {isPOorBook && <th>Status</th>}
                {layoutMode === 'PARTY' && <th className="text-center pr-10">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={24} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Retrieving Ledger...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={24} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400">
                        <Search size={32} />
                      </div>
                      <span className="text-sm font-bold text-slate-400 italic">No transactions matched your current filters.</span>
                    </div>
                  </td>
                </tr>
              ) : displayData.map((e, i) => {
                const isConverted = e.status === 'Converted';
                const isReturn = e.type?.includes('_RETURN');
                const qty = layoutMode === 'PARTY' ? (e.totalQty ?? e.qty ?? 0) : e.item.qty;
                const amount = layoutMode === 'PARTY' ? e.amount : e.item.amount;

                const isExpanded = expandedRow === e.id;
                const totalCols = 3
                  + (initialType === 'SO' || initialType === 'BOOK' || initialType === 'SALE' ? 1 : 0)
                  + (showAgent ? 1 : 0)
                  + (isPOorBook ? 1 : 0)
                  + (initialType === 'PURCHASE' || initialType === 'SALE' ? 1 : 0)
                  + (initialType === 'SALE' ? 1 : 0)
                  + (layoutMode === 'PARTY' ? 1 : 0);

                return (
                  <React.Fragment key={layoutMode === 'PARTY' ? e.id : `${e.id}-${e.item?.id}`}>
                  <tr
                    className={`group transition-colors ${isConverted ? 'opacity-50' : ''} ${layoutMode === 'PARTY' ? 'cursor-pointer hover:bg-slate-50' : ''} ${isExpanded ? 'bg-blue-50/40' : ''}`}
                    onClick={() => layoutMode === 'PARTY' && setExpandedRow(isExpanded ? null : e.id)}
                  >
                    <td className="pl-10 text-slate-400 font-bold">{i + 1}</td>
                    <td className="font-black text-slate-900">{formatDate(e.date)}</td>
                    {(initialType === 'SO' || initialType === 'BOOK' || initialType === 'SALE') && (
                      <td>
                        <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg w-fit">
                          <Calendar size={12} className="shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-tight">{formatDate(e.deliveryDate)}</span>
                        </div>
                      </td>
                    )}
                    <td className="font-bold text-slate-600">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{e.partyName}</span>
                        {isReturn && layoutMode === 'PARTY' && (
                          <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter whitespace-nowrap">Return</span>
                        )}
                      </div>
                    </td>
                    {layoutMode === 'PRODUCT' && (
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-6 bg-blue-100 rounded-full group-hover:bg-blue-600 transition-colors" />
                          <div className="flex flex-col">
                            <span className="font-black text-blue-600 tracking-tight">{e.item.productName}</span>
                            {e.type?.includes('_RETURN') && (
                              <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 w-fit uppercase tracking-tighter mt-0.5">Return</span>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                    {showAgent && (
                      <td>
                        <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg w-fit">
                          <User size={12} className="shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-tight">{e.agentName || 'DIRECT'}</span>
                        </div>
                      </td>
                    )}
                    <td className="text-xs font-bold text-slate-400">
                      <div className="flex flex-col">
                        {layoutMode === 'PRODUCT' ? (
                          <>
                            <span>{e.remarkVersion || '—'}</span>
                            {e.remark && (
                              <span className="text-xs text-slate-500 font-semibold italic mt-1 max-w-[200px] truncate block" title={e.remark}>
                                {e.remark}
                              </span>
                            )}
                          </>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </td>
                    <td className="font-bold text-slate-900">
                      <div className="flex items-center gap-1.5">
                        {layoutMode === 'PRODUCT' && e.item?.qtyEntered != null && e.item?.unitUsed ? (
                          <div className="flex flex-col items-start leading-tight">
                            <span className="font-bold text-slate-800 uppercase text-xs">
                              {e.item.qtyEntered} {e.item.unitUsed}
                            </span>
                            {e.item.qty !== e.item.qtyEntered && (
                              <span className="text-[10px] text-slate-400 font-bold">
                                ({e.item.qty} STD)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span>{qty}</span>
                        )}
                        {layoutMode === 'PARTY' && (e.items || []).length > 0 && (
                          <span className="text-slate-300 group-hover:text-blue-500 transition-colors">
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </span>
                        )}
                      </div>
                    </td>
                    {layoutMode === 'PRODUCT' && <td className="text-slate-400 font-bold">₹{e.item.rate}</td>}
                    <td className="font-black text-slate-900">₹{(amount || 0).toLocaleString()}</td>
                    {isPOorBook && (
                      <td>
                        <div className="flex items-center gap-2 text-blue-600 font-mono text-xs font-black">
                          <Hash size={12} className="text-blue-200" />
                          <span className="text-slate-900 font-bold">{e.soId || e.poId}</span>
                        </div>
                      </td>
                    )}
                    {(initialType === 'PURCHASE' || initialType === 'SALE') && (
                      <td className="font-mono text-xs font-black text-slate-500">
                        {e.soId || e.billNo || '—'}
                      </td>
                    )}
                    {initialType === 'SALE' && (
                      <td>
                        {e.deliveryStatus === 'Completed' ? (
                          <button
                            onClick={(evt) => { evt.stopPropagation(); setViewOutwardEntry(e); }}
                            className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-blue-100"
                          >
                            <Truck size={14} />
                          </button>
                        ) : (
                          <span className="text-slate-300 font-bold ml-2">—</span>
                        )}
                      </td>
                    )}
                    {isPOorBook && (
                      <td><StatusPill entry={e} /></td>
                    )}
                    {layoutMode === 'PARTY' && (
                      <td className="pr-10" onClick={(evt) => evt.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          {/* 3-dot dropdown menu */}
                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdown(openDropdown === e.id ? null : e.id)}
                              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-all"
                              title="More actions"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openDropdown === e.id && (
                              <>
                                {/* Backdrop to close on outside click */}
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenDropdown(null)}
                                />
                                <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-100 rounded-xl shadow-lg z-20 overflow-hidden">
                                  {initialType === 'SALE' && (
                                    <button
                                      onClick={() => { setOpenDropdown(null); handlePrintBill(e); }}
                                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-violet-600 hover:bg-violet-50 transition-colors"
                                    >
                                      <FileDown size={14} />
                                      Export Invoice
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setOpenDropdown(null); handleEditRedirect(e); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                  >
                                    <Edit2 size={14} />
                                    {initialType === 'SALE' && e.deliveryStatus === 'Completed' ? 'Edit Sale Bill' : 'Edit'}
                                  </button>
                                  {initialType === 'SALE' && e.deliveryStatus === 'Completed' && (
                                    <button
                                      onClick={() => { setOpenDropdown(null); setEditOutwardEntry(e); }}
                                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors"
                                    >
                                      <Truck size={14} />
                                      Edit Outward / Stock
                                    </button>
                                  )}
                                  <button
                                    onClick={() => { setOpenDropdown(null); handleDelete(e.id); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => { setOpenDropdown(null); setHistoryEntry(e); }}
                                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors border-t border-slate-50"
                                  >
                                    <History size={14} />
                                    History
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* Accordion detail row - simple clean design */}
                  {layoutMode === 'PARTY' && (
                    <tr key={`${e.id}-detail`}>
                      <td colSpan={totalCols} className="!p-0 !border-0 bg-white">
                        <div
                          style={{
                            maxHeight: isExpanded ? '500px' : '0px',
                            opacity: isExpanded ? 1 : 0,
                            transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
                            overflow: 'hidden',
                          }}
                        >
                          <div className="pl-16 pr-10 py-5 border-t border-slate-50 bg-slate-50/5">
                            {(e.items || []).length > 0 ? (
                              <div className="w-full overflow-x-auto">
                                <table className="w-full border-collapse text-left">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                      <th className="pb-2 w-12 pl-2">#</th>
                                      <th className="pb-2 min-w-[200px]">Product Name</th>
                                      <th className="pb-2 w-28 text-center">Qty</th>
                                      <th className="pb-2 w-32 text-center">Rate</th>
                                      <th className="pb-2 w-36 text-center">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100/40">
                                    {(e.items || []).map((item, idx) => (
                                      <tr key={item.id || idx} className="text-sm font-semibold text-slate-700 hover:bg-slate-50/30 transition-colors">
                                        <td className="py-2.5 text-slate-400 font-bold pl-2">#{idx + 1}</td>
                                        <td className="py-2.5 font-bold text-slate-800">{item.productName || '—'}</td>
                                        <td className="py-2.5 text-center text-slate-900 font-bold">
                                          {item.qtyEntered != null && item.unitUsed ? (
                                            <div className="flex flex-col items-center leading-tight">
                                              <span className="font-bold text-slate-800 uppercase text-xs">
                                                {item.qtyEntered} {item.unitUsed}
                                              </span>
                                              {item.qty !== item.qtyEntered && (
                                                <span className="text-[10px] text-slate-400 font-bold">
                                                  ({item.qty} STD)
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <span>{item.qty ?? '—'}</span>
                                          )}
                                        </td>
                                        <td className="py-2.5 text-center text-slate-900 font-bold">{item.rate ? `₹${Number(item.rate).toLocaleString()}` : '—'}</td>
                                        <td className="py-2.5 text-center text-slate-900 font-black">{item.amount ? `₹${Number(item.amount).toLocaleString()}` : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300 italic">No item details available.</span>
                            )}

                            {/* General Transaction Narration and 3rd Party Mobile */}
                            {(e.remark || e.remarkVersion) && (
                              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs">
                                {e.remarkVersion && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-black uppercase tracking-widest text-[9px] bg-slate-100 px-2 py-0.5 rounded">3rd Party Mob:</span>
                                    <span className="font-bold text-slate-800 text-[13px]">
                                      {e.remarkVersion}
                                    </span>
                                  </div>
                                )}
                                {e.remark && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-black uppercase tracking-widest text-[9px] bg-slate-100 px-2 py-0.5 rounded">Narration:</span>
                                    <span className="font-bold text-slate-600 italic text-[13px]">
                                      {e.remark}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-slate-900 text-white rounded-b-3xl overflow-hidden">
                <tr>
                  <td colSpan={4 + (showAgent ? 1 : 0) + ((initialType === 'SO' || initialType === 'BOOK' || initialType === 'SALE') ? 1 : 0) + (layoutMode === 'PRODUCT' ? 1 : 0)} className="pl-10 !py-6 text-xs font-black uppercase tracking-[0.2em] text-slate-400 !border-none">Final Weighted Aggregate</td>
                  <td className="font-black text-lg !py-6 !border-none">{totalQty.toLocaleString()}</td>
                  {layoutMode === 'PRODUCT' && <td className="!py-6 !border-none"></td>}
                  <td className="font-black text-lg !py-6 !border-none">₹{totalAmount.toLocaleString()}</td>
                  <td colSpan={5} className="!py-6 !border-none"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add Entry Modal */}
      {showAddModal && (
        <EntryForm
          type={initialType}
          isModal={true}
          defaultReturn={viewMode === 'RETURN'}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { fetchEntries(); setShowAddModal(false); }}
        />
      )}

      {/* Convert to Sale Modal */}
      {convertEntry && (
        <ConvertToSaleModal
          entry={convertEntry}
          onClose={() => setConvertEntry(null)}
          onSuccess={() => { fetchEntries(); setConvertEntry(null); }}
        />
      )}

      {/* View Bill Details Modal */}
      {viewBillEntry && (
        <BillDetailsModal
          entry={viewBillEntry}
          onClose={() => setViewBillEntry(null)}
        />
      )}

      {/* View Outward Details Modal */}
      {viewOutwardEntry && (
        <OutwardDetailsModal
          entry={viewOutwardEntry}
          onClose={() => setViewOutwardEntry(null)}
        />
      )}

      {/* Edit Outward Details Modal */}
      {editOutwardEntry && (
        <MarkCompleteModal
          entry={editOutwardEntry}
          editMode
          onClose={() => setEditOutwardEntry(null)}
          onSuccess={() => { fetchEntries(); setEditOutwardEntry(null); }}
        />
      )}

      {/* Entry Edit History Modal */}
      {historyEntry && (
        <EntryHistoryModal
          entry={historyEntry}
          userRole="FIRM"
          onClose={() => setHistoryEntry(null)}
        />
      )}

    </div>
  );
}
