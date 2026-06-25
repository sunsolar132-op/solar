import { useState, useEffect, useMemo } from 'react';
import { Building2, AlertTriangle, RefreshCcw, Boxes, Search, ChevronDown, ArrowUpDown } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';

export default function WarehouseDashboard() {
  const { addToast } = useToast();
  const [firms, setFirms] = useState([]);
  const [selectedFirmId, setSelectedFirmId] = useState('ALL');
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Load all firms on mount, then immediately fetch stock for ALL
  useEffect(() => {
    api.get('/admin/firms')
      .then(data => {
        setFirms(data);
        fetchStock('ALL', data);
      })
      .catch(e => addToast(e.message, 'error'));
  }, []);

  // Fetch stock whenever firm selection changes (skip on initial load — handled above)
  useEffect(() => {
    if (firms.length === 0) return;
    fetchStock(selectedFirmId, firms);
  }, [selectedFirmId, firms]);

  const fetchStock = async (firmId, firmList) => {
    const list = firmList || firms;
    if (list.length === 0) return;
    setLoading(true);
    setStock([]);
    try {
      if (firmId === 'ALL') {
        // Combine all firms' stock
        const allStocks = await Promise.all(
          list.map(f => api.get(`/admin/firms/${f.id}/livestock`).catch(() => []))
        );
        // Merge by productId
        const merged = {};
        allStocks.forEach((firmStock, idx) => {
          const firmName = list[idx].name;
          firmStock.forEach(item => {
            if (!merged[item.productId]) {
              merged[item.productId] = {
                productId: item.productId,
                productName: item.productName,
                productUnit: item.productUnit || '',
                byFirm: {},
                openingStock: 0,
                purchase: 0,
                purchaseReturn: 0,
                sale: 0,
                saleReturn: 0,
                physicalStock: 0,
                po: 0,
                book: 0,
                estimateStock: 0,
              };
            }
            merged[item.productId].byFirm[firmName] = item;
            merged[item.productId].openingStock += (item.openingStock || 0);
            merged[item.productId].purchase += (item.purchase || 0);
            merged[item.productId].purchaseReturn += (item.purchaseReturn || 0);
            merged[item.productId].sale += (item.sale || 0);
            merged[item.productId].saleReturn += (item.saleReturn || 0);
            merged[item.productId].physicalStock += (item.physicalStock || 0);
            merged[item.productId].po += (item.po || 0);
            merged[item.productId].book += (item.book || 0);
            merged[item.productId].estimateStock += (item.estimateStock || 0);
          });
        });
        setStock(Object.values(merged));
      } else {
        const data = await api.get(`/admin/firms/${firmId}/livestock`);
        setStock(data);
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

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
  const selectedFirm = firms.find(f => f.id === selectedFirmId);

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="bg-amber-500 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Warehouse Dashboard</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              Live inventory across all firms
            </p>
          </div>
        </div>
        <button onClick={() => fetchStock(selectedFirmId, firms)} className="btn-secondary flex items-center gap-2 py-3 px-6 self-start">
          <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
          <span className="text-[10px] font-black uppercase tracking-widest">Refresh</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="panel-card flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shrink-0">
            <Building2 size={22} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{firms.length}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Total Firms</div>
          </div>
        </div>
        <div className="panel-card flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shrink-0">
            <Boxes size={22} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{stock.length}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Products</div>
          </div>
        </div>
        <div className="panel-card flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-600 flex items-center justify-center text-white shrink-0">
            <Boxes size={22} />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{stock.length - criticalCount}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Healthy</div>
          </div>
        </div>
        <div className="panel-card flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 ${criticalCount > 0 ? 'bg-red-500' : 'bg-slate-300'}`}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className={`text-2xl font-black ${criticalCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{criticalCount}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Critical</div>
          </div>
        </div>
      </div>

      {/* Firm Selector */}
      <div className="panel-card !p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          <div>
            <label className="field-label">Select Firm</label>
            <div className="relative">
              <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <select
                className="input-field pl-12 pr-10 appearance-none cursor-pointer"
                value={selectedFirmId}
                onChange={e => setSelectedFirmId(e.target.value)}
              >
                <option value="ALL">All Firms (Combined View)</option>
                {firms.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={18} />
            </div>
          </div>
          <div>
            <label className="field-label">Search Product</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                className="input-field pl-12 py-3 font-bold"
                placeholder="Filter by product name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="panel-card !p-0 overflow-hidden">
        <div className="px-10 py-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            {selectedFirmId === 'ALL' ? 'All Firms — Combined Stock' : `${selectedFirm?.name} — Live Stock`}
          </h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {filtered.length} products
          </span>
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
                    <ArrowUpDown size={12} className={sortField === 'productName' ? 'text-amber-500 font-bold' : 'text-slate-300'} />
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
                    <ArrowUpDown size={12} className={sortField === 'physicalStock' ? 'text-amber-500 font-bold' : 'text-slate-300'} />
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
                    <ArrowUpDown size={12} className={sortField === 'estimateStock' ? 'text-amber-500 font-bold' : 'text-slate-300'} />
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
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fetching live stock...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-24 text-center opacity-30">
                    <Boxes size={48} className="mx-auto text-slate-200 mb-4" />
                    <p className="text-sm font-bold text-slate-400">No stock data found</p>
                    <p className="text-xs text-slate-300 mt-2">Create a firm and add entries to see data.</p>
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
              <tfoot className="bg-slate-900 text-white">
                <tr>
                  <td colSpan={2} className="pl-10 !py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 !border-none">Combined Totals</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.openingStock || 0), 0).toLocaleString()}</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.purchase || 0), 0).toLocaleString()}</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.purchaseReturn || 0), 0).toLocaleString()}</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.sale || 0), 0).toLocaleString()}</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.saleReturn || 0), 0).toLocaleString()}</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.physicalStock || 0), 0).toLocaleString()}</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.po || 0), 0).toLocaleString()}</td>
                  <td className="text-right font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.book || 0), 0).toLocaleString()}</td>
                  <td className="text-right pr-10 font-black !border-none !py-5">{filtered.reduce((s, e) => s + (e.estimateStock || 0), 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
