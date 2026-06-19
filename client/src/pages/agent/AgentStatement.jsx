import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Calendar, Trash2, Edit2, X, Download, Hash, Package, CheckCircle2, History, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDate, fromDBDate } from '../../utils/dateUtils';
import AgentEntryForm from './AgentEntryForm';
import EntryHistoryModal from '../../components/EntryHistoryModal';

export default function AgentStatement({ type, title }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [entries, setEntries] = useState([]);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', search: '' });
  const [loading, setLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [layoutMode, setLayoutMode] = useState('PARTY'); // PARTY, PRODUCT
  const [expandedRow, setExpandedRow] = useState(null);
  const [historyEntry, setHistoryEntry] = useState(null);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/agent/entries?type=${type}`);
      setEntries(data);
    } catch (e) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchEntries(); }, [type]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this ledger record?')) return;
    try {
      await api.delete(`/agent/entries/${id}`);
      addToast('Record purged');
      fetchEntries();
    } catch (e) { addToast(e.message, 'error'); }
  };

  const handleEditRedirect = (entry) => {
    const path = type === 'SO' ? '/agent/so-entry' : '/agent/book-entry';
    navigate(path, { state: { editEntry: entry } });
  };

  const filtered = entries.filter(e => {
    const search = filters.search.toLowerCase();
    const itemSearchMatch = e.items?.some(i => i.productName?.toLowerCase().includes(search) || i.remark?.toLowerCase().includes(search));
    const matchSearch = !search || itemSearchMatch || [e.partyName, e.remarkVersion, e.poId, e.billNo].some(v => v?.toLowerCase().includes(search));
    const isoDate = fromDBDate(e.date);
    const matchFrom = !filters.dateFrom || isoDate >= filters.dateFrom;
    const matchTo = !filters.dateTo || isoDate <= filters.dateTo;
    return matchSearch && matchFrom && matchTo;
  });

  const flattened = layoutMode === 'PRODUCT' ? filtered.flatMap(e => e.items?.map(i => ({ ...e, item: i })) || []) : [];

  const displayData = layoutMode === 'PARTY' ? filtered : flattened;

  const totalQty = displayData.reduce((s, e) => s + (parseFloat(layoutMode === 'PARTY' ? (e.totalQty ?? e.qty) : e.item.qty) || 0), 0);
  const totalAmount = displayData.reduce((s, e) => s + (parseFloat(layoutMode === 'PARTY' ? e.amount : e.item.amount) || 0), 0);

  const handleExport = () => {
    const rows = displayData.map((e, i) => {
      const qty = layoutMode === 'PARTY' ? (e.totalQty ?? e.qty ?? 0) : e.item.qty;
      const amount = layoutMode === 'PARTY' ? e.amount : e.item.amount;
      const row = {
        '#': i + 1,
        'Date': formatDate(e.date),
        'Delivery Date': formatDate(e.deliveryDate),
        'Party Name': e.partyName || '',
      };
      if (layoutMode === 'PRODUCT') {
        row['Product'] = e.item?.productName || '';
      }
      row['Ref'] = e.remarkVersion || '';
      row['Qty'] = qty;
      if (layoutMode === 'PRODUCT') {
        row['Rate (₹)'] = e.item?.rate || '';
      }
      row['Amount (₹)'] = amount || 0;
      if (type === 'SO' || type === 'BOOK') {
        row['SO Serial'] = e.soId || e.poId || '';
      }
      row['Status'] = e.status || 'Pending';
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Statement');
    const today = new Date().toISOString().split('T')[0];
    const safeName = (title || type || 'Statement').replace(/[^a-z0-9]/gi, '_');
    XLSX.writeFile(wb, `${safeName}_Statement_${today}.xlsx`);
  };

  // Status pill component
  const StatusPill = ({ entry }) => {
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="bg-amber-500 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">{title} Ledger</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              Agent operations · {filtered.length} records matched
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
          <button onClick={handleExport} className="btn-secondary !px-4 !py-2.5 text-xs flex items-center gap-2">
            <Download size={16} />
            <span className="font-black uppercase tracking-widest text-[10px]">Export Ledger</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="panel-card !p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-6 items-end">
          <div className="group">
            <label className="field-label">Period Start</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input type="date" className="input-field pl-12 py-2.5" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} />
            </div>
          </div>
          <div className="group">
            <label className="field-label">Period End</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input type="date" className="input-field pl-12 py-2.5" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} />
            </div>
          </div>
          <div className="md:col-span-2 group">
            <label className="field-label">Deep Search (Party, Material, Serial)</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input className="input-field pl-12 py-2.5 font-bold" placeholder="Lookup operational data..." value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
            </div>
          </div>
          <button className="btn-secondary py-2.5 flex items-center justify-center gap-2 border-slate-100" onClick={() => setFilters({ dateFrom: '', dateTo: '', search: '' })}>
            <X size={16} />
            <span className="uppercase tracking-widest text-[10px] font-black">Reset</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="panel-card !p-0 overflow-hidden">
        <div className="px-10 py-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
          <h3 className="text-xl font-black text-slate-900 tracking-tight">Statement Overview</h3>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Logs Only</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-10">Index</th>
                <th>Date</th>
                <th>Delivery Date</th>
                <th>Party Identity</th>
                {layoutMode === 'PRODUCT' && <th>Product</th>}
                <th>Ref</th>
                <th>Qty</th>
                {layoutMode === 'PRODUCT' && <th>Rate</th>}
                <th>Amount</th>
                {(type === 'SO' || type === 'BOOK') ? <th>SO Serial</th> : null}
                <th>Status</th>
                {layoutMode === 'PARTY' && <th className="text-center pr-10">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={24} className="py-24 text-center text-slate-400 font-black uppercase tracking-widest text-[10px] animate-pulse">Syncing Distributed Ledger...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={24} className="py-32 text-center">
                    <div className="flex flex-col items-center gap-3 opacity-20">
                      <Package size={48} />
                      <span className="text-sm font-black uppercase tracking-widest">No entries found</span>
                    </div>
                  </td>
                </tr>
              ) : displayData.map((e, i) => {
                const isConverted = e.status === 'Converted';
                const isReturn = e.type?.includes('_RETURN');
                const qty = layoutMode === 'PARTY' ? (e.totalQty ?? e.qty ?? 0) : e.item.qty;
                const amount = layoutMode === 'PARTY' ? e.amount : e.item.amount;
                const isExpanded = expandedRow === e.id;
                const totalCols = 6
                  + (layoutMode === 'PRODUCT' ? 2 : 0)
                  + ((type === 'SO' || type === 'BOOK') ? 1 : 0);

                return (
                  <React.Fragment key={layoutMode === 'PARTY' ? e.id : `${e.id}-${e.item?.id}`}>
                  <tr
                    className={`group transition-colors ${isConverted ? 'opacity-50' : ''} ${layoutMode === 'PARTY' ? 'cursor-pointer hover:bg-slate-50' : ''} ${isExpanded ? 'bg-blue-50/40' : ''}`}
                    onClick={() => layoutMode === 'PARTY' && setExpandedRow(isExpanded ? null : e.id)}
                  >
                    <td className="pl-10 text-slate-400 font-bold">{i + 1}</td>
                    <td className="font-black text-slate-900">{formatDate(e.date)}</td>
                    <td>
                      <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 w-fit">
                        <Calendar size={12} className="shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-tight">{formatDate(e.deliveryDate)}</span>
                      </div>
                    </td>
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
                          <div className="w-1 h-4 bg-slate-100 group-hover:bg-amber-500 transition-colors rounded-full" />
                          <span className="font-black text-slate-700 group-hover:text-slate-900">{e.item.productName}</span>
                        </div>
                      </td>
                    )}
                    <td className="text-xs font-bold text-slate-400">{layoutMode === 'PRODUCT' ? e.remarkVersion || '—' : '—'}</td>
                    <td className="font-black text-slate-900">
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
                    {(type === 'SO' || type === 'BOOK') && (
                      <td className="font-mono text-xs font-black text-blue-600 bg-blue-50/50 px-2 py-1 rounded-md w-fit whitespace-nowrap">
                        {e.soId || e.poId}
                      </td>
                    )}
                    <td><StatusPill entry={e} /></td>
                    {layoutMode === 'PARTY' && (
                      <td className="pr-10" onClick={(evt) => evt.stopPropagation()}>
                        <div className={`flex items-center justify-center gap-2 ${isConverted ? 'invisible' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                          <button onClick={() => handleEditRedirect(e)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(e.id)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-red-600 hover:text-white transition-all shadow-sm">
                            <Trash2 size={16} />
                          </button>
                          <button onClick={() => setHistoryEntry(e)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-700 hover:text-white transition-all shadow-sm" title="View History">
                            <History size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* Accordion detail row */}
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
                            {(e.remark || e.remarkVersion) && (
                              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs">
                                {e.remarkVersion && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-black uppercase tracking-widest text-[9px] bg-slate-100 px-2 py-0.5 rounded">3rd Party Mob:</span>
                                    <span className="font-bold text-slate-800 text-[13px]">{e.remarkVersion}</span>
                                  </div>
                                )}
                                {e.remark && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-slate-400 font-black uppercase tracking-widest text-[9px] bg-slate-100 px-2 py-0.5 rounded">Narration:</span>
                                    <span className="font-bold text-slate-600 italic text-[13px]">{e.remark}</span>
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
              <tfoot className="bg-slate-900 text-white shadow-xl">
                <tr>
                  <td colSpan={4 + (layoutMode === 'PRODUCT' ? 1 : 0)} className="pl-10 !py-6 text-xs font-black uppercase tracking-widest text-slate-400">Total Operational Value</td>
                  <td className="font-black text-lg">{totalQty.toLocaleString()}</td>
                  {layoutMode === 'PRODUCT' && <td></td>}
                  <td className="font-black text-lg">₹{totalAmount.toLocaleString()}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {showAddModal && (
        <AgentEntryForm
          type={type}
          isModal={true}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { fetchEntries(); setShowAddModal(false); }}
        />
      )}

      {/* Entry Edit History Modal */}
      {historyEntry && (
        <EntryHistoryModal
          entry={historyEntry}
          userRole="AGENT"
          onClose={() => setHistoryEntry(null)}
        />
      )}

    </div>
  );
}
