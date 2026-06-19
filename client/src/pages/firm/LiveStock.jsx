import { useState, useEffect, useMemo } from 'react';
import { Search, Boxes, RefreshCcw, AlertTriangle, Download, ArrowUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../../api';
import { useToast } from '../../context/ToastContext';

export default function LiveStock() {
  const { addToast } = useToast();
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchStock = async () => {
    setLoading(true);
    try {
      const data = await api.get('/firm/livestock');
      setStock(data);
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStock(); }, []);

  const [sortField, setSortField] = useState('productName');
  const [sortOrder, setSortOrder] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filtered = useMemo(() => {
    const res = stock.filter(s =>
      s.productName?.toLowerCase().includes(search.toLowerCase())
    );
    if (!sortField) return res;

    return [...res].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      } else {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [stock, search, sortField, sortOrder]);

  const criticalCount = filtered.filter(s => s.estimateStock <= 0).length;

  const handleExport = () => {
    const rows = filtered.map((s, i) => ({
      '#': i + 1,
      'Product Name': s.productName || '',
      'Opening stock QTY': s.openingStock || 0,
      'Purchase Qty': s.purchase || 0,
      'Purchase Return Qty': s.purchaseReturn || 0,
      'Sale Qty': s.sale || 0,
      'Sale Return Qty': s.saleReturn || 0,
      'Physical Stock': s.physicalStock || 0,
      'SO Qty': s.po || 0,
      'Book Qty': s.book || 0,
      'Estimate Stock': s.estimateStock || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Live Stock');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Live_Stock_${today}.xlsx`);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="bg-blue-600 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Live Stock</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              Real-time inventory valuation — {filtered.length} products
              {criticalCount > 0 && <span className="text-red-500 ml-2">· {criticalCount} critical</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={fetchStock} className="btn-secondary flex items-center gap-2 py-3 px-6">
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
            <span className="text-[10px] font-black uppercase tracking-widest">Refresh</span>
          </button>
          <button onClick={handleExport} className="btn-secondary flex items-center gap-2 py-3 px-6">
            <Download size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Export</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="panel-card !p-6 max-w-xl">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
          <input
            className="input-field pl-12 py-3 font-bold"
            placeholder="Search product name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Stock Table */}
      <div className="panel-card !p-0 overflow-hidden">
        <div className="px-10 py-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 tracking-tight">Inventory Ledger</h3>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Data</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-10 w-16">No.</th>
                <th
                  onClick={() => handleSort('productName')}
                  className="cursor-pointer select-none hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Product Name</span>
                    <ArrowUpDown size={12} className={sortField === 'productName' ? 'text-blue-600 font-bold' : 'text-slate-300'} />
                  </div>
                </th>
                <th className="text-right">Opening stock QTY</th>
                <th className="text-right">Purchase Qty</th>
                <th className="text-right">p. return qty</th>
                <th className="text-right">Sale Qty</th>
                <th className="text-right">s. return qty</th>
                <th
                  onClick={() => handleSort('physicalStock')}
                  className="text-right cursor-pointer select-none hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Physical Stock</span>
                    <ArrowUpDown size={12} className={sortField === 'physicalStock' ? 'text-blue-600 font-bold' : 'text-slate-300'} />
                  </div>
                </th>
                <th className="text-right">SO Qty</th>
                <th className="text-right">Book Qty</th>
                <th
                  onClick={() => handleSort('estimateStock')}
                  className="text-right pr-10 cursor-pointer select-none hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Estimate Stock</span>
                    <ArrowUpDown size={12} className={sortField === 'estimateStock' ? 'text-blue-600 font-bold' : 'text-slate-300'} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-8 h-8 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading inventory...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-24 text-center opacity-30">
                    <Boxes size={48} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-sm font-bold text-slate-400">No stock data found</p>
                  </td>
                </tr>
              ) : filtered.map((s, i) => {
                const isCritical = s.estimateStock <= 0;
                return (
                  <tr key={s.productId} className={`group ${isCritical ? 'bg-red-50 hover:bg-red-100/50' : ''}`}>
                    <td className="pl-10 text-slate-400 font-bold">{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        {isCritical && <AlertTriangle size={14} className="text-red-500 shrink-0" />}
                        <div className="flex flex-col">
                          <span className={`font-black text-sm ${isCritical ? 'text-red-700' : 'text-slate-900'}`}>{s.productName}</span>
                          {s.productUnit && (
                            <span className="text-[10px] font-black text-slate-400 uppercase mt-0.5 tracking-wider">
                              Std Unit: {s.productUnit}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-bold text-slate-600">{(s.openingStock || 0).toLocaleString()}</td>
                    <td className="text-right font-bold text-blue-600">{(s.purchase || 0).toLocaleString()}</td>
                    <td className="text-right font-bold text-red-600">{(s.purchaseReturn || 0).toLocaleString()}</td>
                    <td className="text-right font-bold text-orange-500">{(s.sale || 0).toLocaleString()}</td>
                    <td className="text-right font-bold text-green-600">{(s.saleReturn || 0).toLocaleString()}</td>
                    <td className="text-right">
                      <span className={`font-black text-sm ${s.physicalStock < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {(s.physicalStock || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="text-right font-bold text-purple-600">{(s.po || 0).toLocaleString()}</td>
                    <td className="text-right font-bold text-indigo-600">{(s.book || 0).toLocaleString()}</td>
                    <td className="text-right pr-10">
                      <span className={`inline-flex items-center justify-center px-3 py-1 rounded-lg text-xs font-black ${isCritical ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700'
                        }`}>
                        {(s.estimateStock || 0).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-white text-slate-900 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
                <tr>
                  <td colSpan={2} className="pl-10 !py-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Ledger Totals</span>
                      <span className="text-[8px] font-bold text-slate-500 uppercase mt-1">Aggregated Value</span>
                    </div>
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none text-slate-600">
                    {filtered.reduce((s, e) => s + (e.openingStock || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none text-blue-600">
                    {filtered.reduce((s, e) => s + (e.purchase || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none text-red-600">
                    {filtered.reduce((s, e) => s + (e.purchaseReturn || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none text-orange-500">
                    {filtered.reduce((s, e) => s + (e.sale || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none text-green-600">
                    {filtered.reduce((s, e) => s + (e.saleReturn || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none">
                    {filtered.reduce((s, e) => s + (e.physicalStock || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none text-purple-600">
                    {filtered.reduce((s, e) => s + (e.po || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right font-black text-lg !py-6 !border-none text-indigo-600">
                    {filtered.reduce((s, e) => s + (e.book || 0), 0).toLocaleString()}
                  </td>
                  <td className="text-right pr-10 font-black text-lg !py-6 !border-none text-blue-600 italic">
                    {filtered.reduce((s, e) => s + (e.estimateStock || 0), 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
