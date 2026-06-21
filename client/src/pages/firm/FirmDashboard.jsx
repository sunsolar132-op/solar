import React, { useState, useEffect } from 'react';
import {
  ShoppingBag, ShoppingCart, ClipboardList, BookOpen,
  TrendingUp, TrendingDown, Search, ArrowRight, Clock,
  AlertTriangle, RefreshCcw, Package, Boxes, ChevronRight, User,
  Truck, CheckCircle2
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import OrderTrackingModal from '../../components/OrderTrackingModal';
import MarkCompleteModal from '../../components/MarkCompleteModal';

export default function FirmDashboard() {
  const { addToast } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [trackOrderId, setTrackOrderId] = useState(null);
  const [completeEntry, setCompleteEntry] = useState(null);
  const [deliveryFilter, setDeliveryFilter] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    try {
      console.log('Fetching dashboard stats from: /firm/dashboard-stats');
      const data = await api.get('/firm/dashboard-stats');
      console.log('Stats received:', data);
      setStats(data);
    } catch (err) {
      console.error('Dashboard Stats Error:', err);
      addToast(err.message, 'error');

      // Attempt health check to verify backend connectivity
      try {
        const health = await api.get('/firm/test-health');
        console.log('Firm Health Check:', health);
      } catch (hErr) {
        console.error('Firm Health Check FAILED:', hErr);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setTrackOrderId(searchQuery.trim());
  };

  if (loading && !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Initializing Dashboard...</p>
        </div>
      </div>
    );
  }

  const {
    summary,
    recentEntries: allRecent,
    lowStock,
    pendingDeliveries = [],
    todayCapacity = { capacity: 0, used: 0, available: 0 }
  } = stats || {
    summary: {},
    recentEntries: [],
    lowStock: [],
    pendingDeliveries: [],
    todayCapacity: { capacity: 0, used: 0, available: 0 }
  };
  const recentEntries = allRecent.slice(0, 10);

  const filteredDeliveries = pendingDeliveries.filter(entry => {
    const query = deliveryFilter.toLowerCase().trim();
    if (!query) return true;
    const dateStr = (entry.date || '').toLowerCase();
    const deliveryDateStr = (entry.deliveryDate || '').toLowerCase();
    const billNoStr = (entry.billNo || entry.soId || '').toLowerCase();
    const typeStr = (entry.type || '').toLowerCase();
    const partyStr = (entry.partyName || '').toLowerCase();
    const agentStr = (entry.agentName || 'direct').toLowerCase();
    const qtyStr = (entry.totalQty ? entry.totalQty.toString() : '0');
    return dateStr.includes(query) ||
      deliveryDateStr.includes(query) ||
      billNoStr.includes(query) ||
      typeStr.includes(query) ||
      partyStr.includes(query) ||
      agentStr.includes(query) ||
      qtyStr.includes(query);
  });

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Header & Global Search */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div className="flex items-start gap-6">
          <div className="bg-blue-600 rounded-full w-2 h-14 mt-1 shadow-lg shadow-blue-200" />
          <div>
            <h1 className="text-5xl font-black text-slate-900 tracking-tighter">Firm Control Panel</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-3 flex items-center gap-2">
              <Package size={14} className="text-blue-500" />
              Intelligence & Operations Overview
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative w-full lg:max-w-md group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-slate-300 group-focus-within:text-blue-500 transition-colors">
            <Search size={20} />
          </div>
          <input
            type="text"
            placeholder="Search Order ID / Bill No for Tracking..."
            className="w-full bg-white border-2 border-slate-100 rounded-[2rem] pl-14 pr-32 py-4 font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="submit"
            className="absolute right-2 top-2 bottom-2 bg-slate-900 text-white rounded-[1.5rem] px-6 text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-slate-200"
          >
            Track <ArrowRight size={14} />
          </button>
        </form>
      </div>



      {/* Main Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

        {/* Pending Deliveries Queue */}
        <div className="xl:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <Clock size={20} className="text-blue-500" />
              Pending Deliveries Queue
              <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-widest">Oldest First</span>
            </h3>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64 group">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Filter deliveries..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
                  value={deliveryFilter}
                  onChange={(e) => setDeliveryFilter(e.target.value)}
                />
              </div>
              <button onClick={fetchStats} className="btn-secondary flex items-center gap-2 py-2 px-4 shadow-sm shrink-0">
                <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                <span className="text-[9px] font-black uppercase tracking-widest">Sync</span>
              </button>
            </div>
          </div>

          <div className="panel-card !p-0 overflow-hidden shadow-xl shadow-slate-200/40">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="pl-8">Delivery Date</th>
                    <th>Bill No</th>
                    <th>Type</th>
                    <th>Party / Entity</th>
                    <th>Agent</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right pr-8">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center opacity-30">
                        <Boxes size={48} className="mx-auto text-slate-200 mb-4" />
                        <p className="text-sm font-bold text-slate-400">No pending deliveries</p>
                      </td>
                    </tr>
                  ) : filteredDeliveries.map((entry, idx) => (
                    <tr key={idx} className="group hover:bg-slate-50/80 transition-colors">
                      <td className="pl-8 text-slate-500 font-bold text-xs">{entry.deliveryDate || '-'}</td>
                      <td className="font-mono text-xs font-bold text-slate-500">{entry.billNo || entry.soId || '—'}</td>
                      <td>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${entry.type === 'SALE' ? 'bg-blue-100 text-blue-700' :
                            entry.type === 'SO' ? 'bg-amber-100 text-amber-700' :
                              'bg-purple-100 text-purple-700'
                          }`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="font-black text-slate-900 text-sm">{entry.partyName}</td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-tight">
                          <User size={12} className="shrink-0" />
                          {entry.agentName || 'DIRECT'}
                        </span>
                      </td>
                      <td className="text-right font-black text-slate-900">{entry.totalQty ? entry.totalQty.toLocaleString() : 0}</td>
                      <td className="text-right pr-8">
                        <div className="flex justify-end gap-2 py-1">
                          <button
                            onClick={() => setTrackOrderId(entry.id)}
                            className="p-2 rounded-xl bg-slate-100 text-slate-400 hover:bg-blue-600 hover:text-white transition-all"
                            title="Track Order"
                          >
                            <Search size={16} />
                          </button>
                          <button
                            onClick={() => setCompleteEntry(entry)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-blue-100"
                            title="Complete Delivery"
                          >
                            <Truck size={14} />
                            Complete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar: Low Stock & Highlights */}
        <div className="space-y-8">

          {/* Low Stock Panel */}
          <div className="space-y-4">
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-500" />
              Critical Stock
            </h3>
            <div className="panel-card space-y-4 shadow-xl shadow-red-100/30">
              {lowStock.length === 0 ? (
                <div className="py-6 text-center">
                  <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                  <p className="text-xs font-bold text-slate-400">All levels optimized</p>
                </div>
              ) : lowStock.map((item, idx) => (
                <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${Number(item.stock) <= 0 ? 'bg-red-100 border-red-200' : 'bg-amber-50 border-amber-100'
                  }`}>
                  <div>
                    <div className="text-sm font-black text-slate-900">{item.name}</div>
                    <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${Number(item.stock) <= 0 ? 'text-red-600' : 'text-amber-600'
                      }`}>
                      {Number(item.stock) <= 0 ? 'Out of Stock' : 'Low Stock'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-black ${Number(item.stock) <= 0 ? 'text-red-700' : 'text-amber-700'
                      }`}>
                      {Number(item.stock).toLocaleString()}
                    </div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Order Tracking Modal */}
      <OrderTrackingModal
        orderId={trackOrderId}
        onClose={() => setTrackOrderId(null)}
      />

      {/* Mark Complete Modal */}
      {completeEntry && (
        <MarkCompleteModal
          entry={completeEntry}
          onClose={() => setCompleteEntry(null)}
          onSuccess={() => {
            setCompleteEntry(null);
            fetchStats();
          }}
        />
      )}
    </div>
  );
}
