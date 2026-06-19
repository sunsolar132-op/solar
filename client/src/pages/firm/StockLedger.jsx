import { useState, useEffect, useCallback } from 'react';
import {
  Search, Calendar, X, Download, BookOpen, TrendingUp, TrendingDown,
  Package, ChevronDown, AlertTriangle, FileText, RefreshCcw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateUtils';
import BillDetailsModal from '../../components/BillDetailsModal';

const TYPE_META = {
  PURCHASE:         { label: 'Purchase',       badge: 'bg-blue-50 text-blue-700 border-blue-100',   dir: 'in' },
  PURCHASE_RETURN:  { label: 'Purchase Return', badge: 'bg-red-50 text-red-600 border-red-100',     dir: 'out' },
  SALE:             { label: 'Sale (Outward)',  badge: 'bg-orange-50 text-orange-700 border-orange-100', dir: 'out' },
  SALE_RETURN:      { label: 'Sale Return',     badge: 'bg-green-50 text-green-700 border-green-100', dir: 'in' },
};

export default function StockLedger() {
  const { addToast } = useToast();

  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [ledger, setLedger] = useState(null); // { openingBalance, hasDateFilter, rows, summary }
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [viewBill, setViewBill] = useState(null);   // full tx object for BillDetailsModal
  const [loadingBill, setLoadingBill] = useState(null); // billId being fetched

  // ── Load products for dropdown ─────────────────────────────────────────────
  useEffect(() => {
    api.get('/products').then(setProducts).catch(() => {});
  }, []);

  // ── Fetch ledger ───────────────────────────────────────────────────────────
  const fetchLedger = useCallback(async () => {
    if (!productId) { addToast('Please select a product first', 'error'); return; }
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({ productId });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const data = await api.get(`/firm/stock-ledger?${params}`);
      setLedger(data);
    } catch (e) {
      addToast(e.message, 'error');
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

  const selectedProduct = products.find((p) => p.id === productId);

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
        {ledger && (
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

      {/* Filter Panel */}
      <div className="panel-card !p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-end">
          {/* Product Dropdown */}
          <div className="lg:col-span-2 group">
            <label className="field-label">Product</label>
            <div className="relative">
              <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <select
                className="input-field pl-12 py-2.5 pr-10 appearance-none font-bold"
                value={productId}
                onChange={(e) => { setProductId(e.target.value); setLedger(null); setSearched(false); }}
              >
                <option value="">— Select Product —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} {p.unit ? `(${p.unit})` : ''}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={16} />
            </div>
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

              {/* No data */}
              {!loading && searched && ledger && ledger.rows.length === 0 && !ledger.hasDateFilter && (
                <tr>
                  <td colSpan={8} className="py-24 text-center opacity-30">
                    <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-sm font-bold text-slate-400">No physical stock movements found for this product</p>
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
                    </td>
                    <td className="font-bold text-slate-600 text-sm max-w-[180px] truncate" title={row.partyName}>
                      {row.partyName || '—'}
                    </td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${meta.badge}`}>
                        {row.detailLabel || meta.label}
                      </span>
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

      {/* Bill Details Modal */}
      {viewBill && (
        <BillDetailsModal entry={viewBill} onClose={() => setViewBill(null)} />
      )}
    </div>
  );
}
