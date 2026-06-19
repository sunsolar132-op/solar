import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, ShoppingCart, Boxes, Users, ClipboardList, TrendingUp,
  MapPin, Clock, Package, AlertCircle, ArrowUpRight, ArrowDownRight,
  ChevronRight, Calendar, User, IndianRupee, Layers, ListFilter
} from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function AgentDashboard() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    summary: {
      today: { poCount: 0, poAmount: 0, bookCount: 0, bookAmount: 0 },
      overall: { poCount: 0, poAmount: 0, bookCount: 0, bookAmount: 0 }
    },
    recentEntries: [],
    recentItems: [],
    topProducts: []
  });
  const [activeTab, setActiveTab] = useState('party'); // 'party' or 'product'

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/agent/dashboard');
      if (res) {
        setData(res);
      }
    } catch (e) {
      addToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const StatCard = ({ title, todayCount, todayAmount, overallCount, overallAmount, icon: Icon, gradient, color }) => (
    <div className="relative group overflow-hidden rounded-[2rem] bg-white/80 backdrop-blur-md border border-white/20 p-6 md:p-7 shadow-2xl shadow-slate-200/50 hover:shadow-blue-200/40 transition-all duration-700 flex flex-col items-center text-center">
      <div className={`absolute top-0 right-0 w-24 h-24 ${gradient} opacity-5 rounded-full -mr-8 -mt-8 blur-2xl group-hover:opacity-10 transition-opacity`} />
      
      <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl ${color} flex items-center justify-center text-white shadow-xl shadow-blue-100 mb-5 group-hover:scale-110 transition-transform duration-500`}>
        <Icon size={22} className="md:w-[24px] md:h-[24px]" />
      </div>

      <div className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1.5">{title}</div>
      <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-50 px-2.5 py-0.5 md:py-1 rounded-full mb-6">
        <TrendingUp size={10} />
        <span className="text-[9px] font-black uppercase tracking-widest text-[8px] md:text-[9px]">Active</span>
      </div>

      <div className="w-full space-y-6">
        <div className="flex flex-col items-center">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Today's Pulse</div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">{todayCount || 0}</div>
            <div className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg">₹{(todayAmount || 0).toLocaleString()}</div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-slate-100 to-transparent w-full" />

        <div className="grid grid-cols-2 gap-3 w-full">
          <div>
            <div className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Entries</div>
            <div className="text-base md:text-lg font-black text-slate-700 tracking-tight">{overallCount || 0}</div>
          </div>
          <div className="border-l border-slate-100">
            <div className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Amount</div>
            <div className="text-base md:text-lg font-black text-slate-700 tracking-tight">₹{(overallAmount || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-2 md:space-y-4 pb-10 md:pb-20 animate-in fade-in duration-700">
      {/* Premium Header Section */}
      <div className="relative overflow-hidden rounded-[2rem] md:rounded-[2.5rem] bg-slate-900 p-8 md:p-10 lg:p-12 text-white shadow-3xl">
        <div className="absolute top-0 right-0 w-[400px] md:w-[600px] h-[400px] md:h-[600px] bg-blue-600/30 rounded-full blur-[100px] md:blur-[140px] -mt-40 md:-mt-60 -mr-40 md:-mr-60 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-60 md:w-80 h-60 md:h-80 bg-indigo-500/10 rounded-full blur-[80px] md:blur-[100px] -mb-30 md:-mb-40 -ml-30 md:-ml-40" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10 lg:gap-16">
          <div className="max-w-xl lg:pr-10">
            <div className="flex flex-wrap items-center gap-3 md:gap-4 mb-4 md:mb-6">
              <span className="px-3 md:px-4 py-1 md:py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-blue-400">Agent Command Center</span>
              <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-slate-700" />
              <div className="flex items-center gap-2 text-slate-400">
                <Clock size={14} className="text-blue-500 md:w-[16px] md:h-[16px]" />
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-7xl font-black tracking-tighter mb-4 md:mb-8 leading-[0.9] md:leading-[0.85]">
              Hello, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500">{user?.name}</span>
            </h1>

            <p className="text-slate-400 font-medium text-sm md:text-lg leading-relaxed max-w-md">
              Manage your orders and inventory with precision. Your operational efficiency today is at <span className="text-white font-bold">Optimal Levels</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 shrink-0 w-full lg:w-auto mt-10 lg:mt-0">
            <div className="w-full lg:w-[320px] xl:w-[380px]">
              <StatCard
                title="Sale Orders (SO)"
                todayCount={data?.summary?.today?.poCount}
                todayAmount={data?.summary?.today?.poAmount}
                overallCount={data?.summary?.overall?.poCount}
                overallAmount={data?.summary?.overall?.poAmount}
                icon={ShoppingCart}
                gradient="bg-blue-600"
                color="bg-blue-600"
              />
            </div>
            <div className="w-full lg:w-[320px] xl:w-[380px]">
              <StatCard
                title="Book Entries"
                todayCount={data?.summary?.today?.bookCount}
                todayAmount={data?.summary?.today?.bookAmount}
                overallCount={data?.summary?.overall?.bookCount}
                overallAmount={data?.summary?.overall?.bookAmount}
                icon={Boxes}
                gradient="bg-indigo-600"
                color="bg-indigo-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tables and Top Products Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 md:gap-14">
        {/* Recent Entry Summary Board */}
        <div className="xl:col-span-2 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200/60 pb-6">
            <div>
              <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter leading-none">Recent Entry Summary</h2>
              <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mt-3">Real-time ledger activity</p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-[1.25rem] self-start md:self-center border border-slate-200/50 shadow-inner">
              <button 
                onClick={() => setActiveTab('party')}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === 'party' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Party Wise
              </button>
              <button 
                onClick={() => setActiveTab('product')}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === 'product' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                Product Wise
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/40 overflow-hidden min-h-[500px]">
            {activeTab === 'party' ? (
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Date</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">SO Number</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Party Name</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-right">Amount</th>
                      <th className="px-8 py-6 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Delivery</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.recentEntries || []).map((entry, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <div className="flex items-center gap-3">
                            <Calendar size={14} className="text-slate-300" />
                            <span className="text-xs font-bold text-slate-600">{entry.date}</span>
                          </div>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <span className="text-xs font-black text-slate-900 group-hover:text-blue-600 transition-colors">{entry.poNumber}</span>
                          <div className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{entry.type}</div>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-slate-100 flex items-center justify-center text-[9px] md:text-[10px] font-black text-slate-500">
                              {entry?.partyName?.charAt(0)}
                            </div>
                            <span className="text-xs font-black text-slate-700 truncate max-w-[150px] md:max-w-xs">{entry.partyName}</span>
                          </div>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5 text-right">
                          <span className="text-xs font-black text-blue-600">â‚¹{(entry.amount || 0).toLocaleString()}</span>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1.5 h-1.5 rounded-full ${entry.status === 'Converted' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">{entry.deliveryDate}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(!data?.recentEntries || data.recentEntries.length === 0) && (
                      <tr>
                        <td colSpan="5" className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-4 text-slate-300">
                            <Layers size={48} />
                            <p className="text-sm font-black uppercase tracking-widest">No recent entries found</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="px-6 md:px-8 py-5 md:py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                      <th className="px-6 md:px-8 py-5 md:py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty</th>
                      <th className="px-6 md:px-8 py-5 md:py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate</th>
                      <th className="px-6 md:px-8 py-5 md:py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Party</th>
                      <th className="px-6 md:px-8 py-5 md:py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.recentItems || []).map((item, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <div className="flex items-center gap-3">
                            <Package size={14} className="text-indigo-400" />
                            <span className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors">{item.productName}</span>
                          </div>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <span className="text-xs font-black text-slate-700">{item.qty}</span>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <span className="text-xs font-bold text-slate-500">â‚¹{(item.rate || 0).toLocaleString()}</span>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <span className="text-xs font-bold text-slate-600 truncate max-w-[150px] md:max-w-xs">{item.partyName}</span>
                        </td>
                        <td className="px-6 md:px-8 py-4 md:py-5">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.date}</span>
                        </td>
                      </tr>
                    ))}
                    {(!data?.recentItems || data.recentItems.length === 0) && (
                      <tr>
                        <td colSpan="5" className="px-8 py-20 text-center">
                          <div className="flex flex-col items-center gap-4 text-slate-300">
                            <Package size={48} />
                            <p className="text-sm font-black uppercase tracking-widest">No recent products found</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Top Products Section */}
        <div className="space-y-8">
          <div className="flex flex-col justify-between h-auto md:h-[72px] border-b border-slate-200/60 pb-6">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tighter leading-none">Top Products</h2>
            <p className="text-[10px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mt-3">Highest sales volume</p>
          </div>

          <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl shadow-slate-200/40 p-8 space-y-6 min-h-[500px]">
            {(data?.topProducts || []).map((prod, i) => {
              const maxQty = Math.max(...(data?.topProducts || []).map(p => p.qty), 1);
              const percentage = (prod.qty / maxQty) * 100;

              return (
                <div key={i} className="group">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center text-[9px] md:text-[10px] font-black shadow-sm transition-all duration-300 group-hover:scale-110 ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
                        0{i + 1}
                      </div>
                      <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate max-w-[120px] sm:max-w-none">{prod.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-slate-900">{prod.qty.toLocaleString()}</div>
                      <div className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase">Units</div>
                    </div>
                  </div>
                  <div className="w-full h-1.5 md:h-2 bg-slate-50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-out ${i === 0 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-blue-400 to-indigo-500'}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(!data?.topProducts || data.topProducts.length === 0) && (
              <div className="py-16 md:py-20 text-center text-slate-300">
                <BarChart3 size={48} className="mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">Analysis Pending</p>
              </div>
            )}

            <div className="pt-4 md:pt-6 mt-4 md:mt-6 border-t border-slate-50">
              <div className="flex items-center gap-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <div className="text-[9px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest">Growth Metric</div>
                  <div className="text-[11px] md:text-xs font-bold text-slate-600">Product velocity is up 12% from last week.</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
