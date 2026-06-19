import { useState, useEffect } from 'react';
import { X, Truck, Package, User, Phone, Hash, Info, ArrowRight } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';

export default function OutwardDetailsModal({ entry, onClose }) {
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    api.get(`/firm/outward-details/${entry.id}`)
      .then(data => setDetails(data))
      .catch(err => addToast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [entry.id]);

  if (loading) return null;

  const first = details[0] || {};

  // ── Group rows by original_product_id ─────────────────────────────────────
  // grouped = [ { originalProductId, originalProductName, originalQty, deliveries: [...] } ]
  const groupedMap = {};
  for (const row of details) {
    const key = row.original_product_id;
    if (!groupedMap[key]) {
      groupedMap[key] = {
        originalProductId: key,
        originalProductName:
          row.original_product_name ||
          entry.items?.find(i => i.productId === key)?.productName ||
          'Unknown',
        originalQty: row.original_qty,
        deliveries: [],
      };
    }
    groupedMap[key].deliveries.push({
      deliveredProductName:
        row.delivered_product_name ||
        entry.items?.find(i => i.productId === row.delivered_product_id)?.productName ||
        row.delivered_product_id,
      deliveredQty: row.delivered_qty,
      deliveredProductId: row.delivered_product_id,
    });
  }
  const grouped = Object.values(groupedMap);

  // Preserve original bill order
  const billOrder = (entry.items || []).map(i => i.productId);
  grouped.sort((a, b) => {
    const ai = billOrder.indexOf(a.originalProductId);
    const bi = billOrder.indexOf(b.originalProductId);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Truck size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Outward Detail Audit</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">
                Bill No: <span className="text-blue-600">{entry.billNo || 'N/A'}</span>
                {' '}• Completed:{' '}
                {entry.completedAt ? new Date(entry.completedAt).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-10">

          {/* Transport info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { icon: Hash,  label: 'Vehicle No',   value: first.vehicle_no   },
              { icon: Info,  label: 'Transport ID',  value: first.transport_id },
              { icon: User,  label: 'Driver Name',   value: first.person_name  },
              { icon: Phone, label: 'Contact No',    value: first.mobile       },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-slate-50 p-5 rounded-3xl border border-slate-100/50">
                <div className="flex items-center gap-3 mb-2 text-slate-400">
                  <Icon size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
                </div>
                <div className="text-lg font-black text-slate-900">{value || '—'}</div>
              </div>
            ))}
          </div>

          {/* Grouped product verification table */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Package size={14} className="text-blue-600" />
              Product Verification Log
            </h3>

            <div className="border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Original Product</th>
                    <th className="px-4 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-28 text-center">Billed Qty</th>
                    <th className="px-2 py-4 w-8 text-center text-slate-200 text-base">→</th>
                    <th className="px-6 py-4 text-[10px] font-black text-blue-500 uppercase tracking-widest">Delivered Product</th>
                    <th className="px-4 py-4 text-[10px] font-black text-blue-500 uppercase tracking-widest w-28 text-center">Actual Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((group, gi) => {
                    return group.deliveries.map((del, di) => {
                      const isFirst = di === 0;
                      const isSplitRow = group.deliveries.length > 1;
                      const isDiff =
                        group.originalProductId !== del.deliveredProductId ||
                        Number(group.originalQty) !== Number(del.deliveredQty);

                      return (
                        <tr
                          key={`${gi}-${di}`}
                          className={`border-t border-slate-50 transition-colors hover:bg-slate-50/30
                            ${isDiff ? 'bg-amber-50/20' : ''}
                            ${isSplitRow && !isFirst ? 'bg-blue-50/10' : ''}
                          `}
                        >
                          {/* Original product — only on first delivery row */}
                          {isFirst ? (
                            <>
                              <td
                                className="px-6 py-4 font-bold text-slate-700 align-top"
                                rowSpan={group.deliveries.length}
                              >
                                <div className="flex items-center gap-2">
                                  {isSplitRow && (
                                    <span
                                      className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-0.5"
                                      title="Split delivery"
                                    />
                                  )}
                                  {group.originalProductName}
                                </div>
                              </td>
                              <td
                                className="px-4 py-4 font-black text-slate-900 text-center align-top"
                                rowSpan={group.deliveries.length}
                              >
                                {group.originalQty}
                              </td>
                              <td
                                className="px-2 py-4 text-center align-top"
                                rowSpan={group.deliveries.length}
                              >
                                <ArrowRight
                                  size={14}
                                  className={isDiff ? 'text-amber-500' : 'text-slate-200'}
                                />
                              </td>
                            </>
                          ) : null}

                          {/* Delivered product row */}
                          <td className={`px-6 py-3 font-black ${isDiff ? 'text-amber-600' : 'text-blue-600'}`}>
                            <div className="flex items-center gap-2">
                              {isSplitRow && (
                                <span className="text-slate-300 text-xs">↳</span>
                              )}
                              {del.deliveredProductName}
                            </div>
                          </td>
                          <td className={`px-4 py-3 font-black text-center ${isDiff ? 'text-amber-600' : 'text-blue-600'}`}>
                            {del.deliveredQty}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[9px] font-bold text-slate-400 italic">
              * Amber rows indicate discrepancies between billed items and actual delivery. ↳ indicates split delivery rows.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-10 py-6 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="btn-secondary !px-8">Close Audit View</button>
        </div>
      </div>
    </div>
  );
}
