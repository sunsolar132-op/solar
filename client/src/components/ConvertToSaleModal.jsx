import { useState, useEffect, useMemo } from 'react';
import { X, Save, Package, Calendar, Hash, PenTool, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { toDBDate, fromDBDate } from '../utils/dateUtils';
import PartyDropdown from './PartyDropdown';

export default function ConvertToSaleModal({ entry, onClose, onSuccess }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [stockList, setStockList] = useState([]);

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    date: today,
    partyId: entry.partyId || '',
    partyName: entry.partyName || '',
    deliveryDate: entry.deliveryDate ? fromDBDate(entry.deliveryDate) : today,
    remarkVersion: entry.remarkVersion || '',
    remark: entry.remark || '',
  });

  const [items, setItems] = useState(
    entry.items?.map(i => ({ ...i, tempId: i.id || Date.now().toString() + Math.random() })) || []
  );

  useEffect(() => {
    api.get('/firm/livestock').then(setStockList).catch(() => {});
  }, []);

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    if (field === 'qty' || field === 'rate') {
      const qty = parseFloat(newItems[index].qty) || 0;
      const rate = parseFloat(newItems[index].rate) || 0;
      newItems[index].amount = (qty * rate).toFixed(2);
    }
    setItems(newItems);
  };

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      acc.qty += parseFloat(item.qty) || 0;
      acc.amount += parseFloat(item.amount) || 0;
      return acc;
    }, { qty: 0, amount: 0 });
  }, [items]);

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!form.partyId) return addToast('Select a party', 'error');
    if (items.length === 0) return addToast('No products to convert', 'error');
    setLoading(true);
    try {
      await api.post('/firm/convert-to-sale', {
        entryId: entry.id,
        saleData: {
          ...form,
          date: toDBDate(form.date),
          deliveryDate: toDBDate(form.deliveryDate),
          totalQty: totals.qty,
          amount: totals.amount,
          items: items.map(i => ({
            productId: i.productId,
            productName: i.productName,
            qty: parseFloat(i.qty) || 0,
            rate: parseFloat(i.rate) || 0,
            amount: parseFloat(i.amount) || 0
          }))
        },
      });
      addToast('Sale entry created successfully! ✓', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const hasExceedingStock = items.some(item => {
    const stockInfo = stockList.find(s => s.productId === item.productId);
    return stockInfo && parseFloat(item.qty) > stockInfo.physicalStock;
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-10">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-y-auto max-h-[92vh] animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="p-8 pb-0">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-100 shrink-0">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Convert to Sale</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {entry.type} Entry → Sale Transaction
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-700 transition-colors mt-1">
              <X size={26} />
            </button>
          </div>

          {hasExceedingStock && (
            <div className="mb-6 flex items-center gap-2 text-amber-600 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
              <AlertTriangle size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">One or more quantities exceed physical stock</span>
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleConfirm} className="px-8 pb-8 space-y-6">

          {/* Row 1: Date + Reference */}
          <div className="grid grid-cols-2 gap-5">
            <div className="group">
              <label className="field-label">Sale Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={18} />
                <input type="date" className="input-field pl-11" required value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="group">
              <label className="field-label">Third Party Mobile No</label>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={18} />
                <input className="input-field pl-11" value={form.remarkVersion}
                  onChange={e => setForm({ ...form, remarkVersion: e.target.value })} placeholder="10-digit mobile number" />
              </div>
            </div>
          </div>

          {/* Party */}
          <div>
            <label className="field-label">Party Name</label>
            <PartyDropdown
              value={form.partyId}
              onChange={(id, name) => setForm({ ...form, partyId: id, partyName: name })}
              apiBase="/firm"
              category="SALE"
            />
          </div>

          {/* Product List */}
          <div className="space-y-3">
            <label className="field-label">Conversion Products</label>
            <div className="border border-slate-100 rounded-2xl overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[200px]">Product</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-28">Qty</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-28">Rate</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, index) => {
                    const stockInfo = stockList.find(s => s.productId === item.productId);
                    const exceedsStock = stockInfo && parseFloat(item.qty) > stockInfo.physicalStock;
                    return (
                      <tr key={item.tempId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-700">
                          {item.productName}
                          {stockInfo && (
                            <div className="flex gap-2 mt-1">
                              <span className="text-[9px] font-bold text-slate-500">Phy: <span className={exceedsStock ? 'text-amber-500' : 'text-slate-700'}>{stockInfo.physicalStock}</span></span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="any" className={`w-full bg-transparent border rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-500 ${exceedsStock ? 'border-amber-300 text-amber-600' : 'border-slate-200'}`} value={item.qty} onChange={e => handleItemChange(index, 'qty', e.target.value)} required />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="any" className="w-full bg-transparent border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-500" value={item.rate} onChange={e => handleItemChange(index, 'rate', e.target.value)} required />
                        </td>
                        <td className="px-4 py-2 text-xs font-black text-slate-900">
                          ₹{(item.amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50">
                  <tr>
                    <td className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-slate-500">Totals:</td>
                    <td className="px-4 py-3 text-xs font-black text-slate-800">{totals.qty}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-sm font-black text-emerald-600">₹{totals.amount.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Delivery Date */}
          <div className="group">
            <label className="field-label">Delivery Date</label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <input type="date" className="input-field pl-11" value={form.deliveryDate}
                onChange={e => setForm({ ...form, deliveryDate: e.target.value })} />
            </div>
          </div>

          {/* Remark */}
          <div className="group">
            <label className="field-label">Remark / Notes</label>
            <div className="relative">
              <PenTool className="absolute left-4 top-4 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={18} />
              <textarea className="input-field pl-11 min-h-[80px] py-3" value={form.remark}
                onChange={e => setForm({ ...form, remark: e.target.value })} placeholder="Additional notes..." />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-slate-50">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit"
              className="flex items-center gap-3 px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-100 disabled:opacity-50"
              disabled={loading}>
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Save size={16} /><span>Confirm Convert</span></>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
