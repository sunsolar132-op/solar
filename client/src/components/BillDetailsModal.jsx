import { X, Package } from 'lucide-react';
import { formatDate } from '../utils/dateUtils';

export default function BillDetailsModal({ entry, onClose }) {
  if (!entry) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl p-10 overflow-hidden animate-in zoom-in-95 duration-300">
         <button onClick={onClose} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 transition-colors">
            <X size={28} />
         </button>
         
         <div className="space-y-8">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Bill Details</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                {entry.partyName} • {formatDate(entry.date)}
                {entry.billNo && ` • Bill No: ${entry.billNo}`}
                {entry.soId || entry.poId ? ` • SO: ${entry.soId || entry.poId}` : ''}
              </p>
            </div>

            <div className="border border-slate-100 rounded-2xl overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">#</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Qty</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rate</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entry.items?.length > 0 ? (
                    entry.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-blue-600">{item.productName}</td>
                        <td className="px-4 py-3 font-black text-slate-900">{item.qty}</td>
                        <td className="px-4 py-3 font-bold text-slate-400">₹{item.rate}</td>
                        <td className="px-4 py-3 font-black text-slate-900">₹{(item.amount || 0).toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm font-bold">No products found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
         </div>
      </div>
    </div>
  );
}
