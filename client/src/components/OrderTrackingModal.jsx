import React, { useState, useEffect } from 'react';
import { X, Search, Clock, User, ArrowRight, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../api';

export default function OrderTrackingModal({ orderId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!orderId) return;
    // Reset state on every new orderId so stale data/error doesn't flash
    setData(null);
    setError(null);
    setLoading(true);
    api.get(`/firm/track-order/${orderId}`)
      .then(res => {
        setData(res);
      })
      .catch(err => {
        setError(err.message || 'Order not found');
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  if (!orderId) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-6 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col relative border border-slate-100 max-h-[90vh]">
        
        {/* Header */}
        <div className="p-8 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Order Tracking</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1 flex items-center gap-2">
              <Clock size={12} className="text-blue-500" />
              Real-time Lifecycle Status
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all duration-300"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 pt-4 scrollbar-hide">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4 text-center">
              <div className="w-12 h-12 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Searching records...</p>
            </div>
          ) : error ? (
            <div className="py-20 flex flex-col items-center gap-6 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 shadow-lg shadow-red-100">
                <AlertCircle size={40} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Tracking Failed</h3>
                <p className="text-slate-500 font-medium mt-2 max-w-xs mx-auto">{error}</p>
              </div>
              <button onClick={onClose} className="btn-secondary py-3 px-8">Close Portal</button>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Order Info Card */}
              <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Record</div>
                  <div className="text-xl font-black text-slate-900">{data?.order?.billNo || data?.order?.soId || data?.order?.id || '—'}</div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest mt-2">
                    {data?.order?.type || '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</div>
                  <div className={`text-lg font-black ${data?.order?.status === 'Converted' ? 'text-orange-500' : data?.order?.deliveryStatus === 'Completed' ? 'text-emerald-500' : 'text-blue-500'}`}>
                    {data?.order?.deliveryStatus || data?.order?.status || 'Active'}
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="relative pl-10 space-y-12">
                {/* Vertical Line */}
                <div className="absolute left-[1.125rem] top-2 bottom-2 w-0.5 bg-slate-100" />

                {/* Event: Created */}
                <div className="relative">
                  <div className="absolute -left-[1.875rem] top-1 w-6 h-6 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center z-10 shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Entry Created</h4>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      Initial record established in the system
                    </p>
                    <div className="mt-4 flex flex-wrap gap-4">
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                        <Clock size={12} className="text-slate-400" />
                        {data?.order?.createdAt ? new Date(data.order.createdAt).toLocaleString() : '—'}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                        <User size={12} className="text-slate-400" />
                        {data?.order?.agentName || 'Firm Admin'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Event: Converted From (Source) */}
                {data.source && (
                  <div className="relative">
                    <div className="absolute -left-[1.875rem] top-1 w-6 h-6 rounded-full bg-white border-2 border-orange-400 flex items-center justify-center z-10 shadow-sm">
                      <ArrowRight size={12} className="text-orange-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Converted From {data.source.type}</h4>
                      <p className="text-xs font-medium text-slate-500 mt-1">
                        Originating from record <span className="font-bold text-slate-700">{data.source.soId || data.source.id}</span>
                      </p>
                      <div className="mt-4">
                        <div className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100">
                          <Clock size={12} className="text-orange-400" />
                          Source created on {new Date(data.source.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Event: Conversions (Next Steps) */}
                {(data?.conversions || []).map((conv, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[1.875rem] top-1 w-6 h-6 rounded-full bg-white border-2 border-purple-500 flex items-center justify-center z-10 shadow-sm">
                      <ArrowRight size={12} className="text-purple-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Transformed to {conv.type}</h4>
                      <p className="text-xs font-medium text-slate-500 mt-1">
                        Processed as new entry <span className="font-bold text-slate-700">{conv.billNo || conv.id}</span>
                      </p>
                      <div className="mt-4 flex flex-wrap gap-4">
                         <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100">
                           <Clock size={12} className="text-purple-400" />
                           {new Date(conv.createdAt).toLocaleString()}
                         </div>
                         <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100">
                           <User size={12} className="text-purple-400" />
                           {conv.agentName || 'Firm Admin'}
                         </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Event: Delivery */}
                {(data?.order?.deliveryStatus === 'Completed' || data?.order?.completedAt) && (
                  <div className="relative">
                    <div className="absolute -left-[1.875rem] top-1 w-6 h-6 rounded-full bg-white border-2 border-emerald-500 flex items-center justify-center z-10 shadow-sm">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Delivery Fulfilled</h4>
                      <p className="text-xs font-medium text-slate-500 mt-1">
                        Stock has been dispatched and marked as completed
                      </p>
                      <div className="mt-4">
                        <div className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-400 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                           <Clock size={12} className="text-emerald-500" />
                           {data?.order?.completedAt ? new Date(data.order.completedAt).toLocaleString() : 'Date not recorded'}
                         </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-50 bg-slate-50/30 flex justify-end">
           <button onClick={onClose} className="btn-secondary py-3 px-8 text-xs font-black uppercase tracking-widest">Close Portal</button>
        </div>
      </div>
    </div>
  );
}
