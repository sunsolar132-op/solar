import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Save, Info, X, Calendar, Hash, PenTool, ArrowRight, Plus, Trash2 } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import ProductDropdown from '../../components/ProductDropdown';
import PartyDropdown from '../../components/PartyDropdown';
import { genSoId, toDBDate, fromDBDate } from '../../utils/dateUtils';

export default function AgentEntryForm({ type: initialType, isModal, onSuccess, onClose }) {
  const { addToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  const editEntry = location.state?.editEntry;

  const [form, setForm] = useState({
    date: editEntry?.date ? fromDBDate(editEntry.date) : today,
    partyId: editEntry?.partyId || '',
    partyName: editEntry?.partyName || '',
    remarkVersion: editEntry?.remarkVersion || '',
    remark: editEntry?.remark || '',
    deliveryDate: editEntry?.deliveryDate ? fromDBDate(editEntry.deliveryDate) : today,
    soId: editEntry?.soId || editEntry?.poId || genSoId(),
    billNo: editEntry?.billNo || '',
    id: editEntry?.id || null
  });

  const [items, setItems] = useState(
    editEntry?.items?.length > 0
      ? editEntry.items.map(i => ({ 
          ...i, 
          tempId: i.id,
          qty: i.qtyEntered != null ? i.qtyEntered : i.qty,
          unit: i.unitUsed || ''
        }))
      : [{ tempId: Date.now().toString(), productId: '', productName: '', qty: '', unit: '', rate: '', amount: '' }]
  );

  const [stockList, setStockList] = useState([]);
  const [productList, setProductList] = useState([]);
  const [deliveryInfo, setDeliveryInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/agent/livestock'),
      api.get('/products')
    ]).then(([stock, prods]) => {
      setStockList(stock);
      setProductList(prods);
    }).catch(() => { });
  }, []);

  const fetchDeliveryInfo = async (date) => {
    if (!date) { setDeliveryInfo(null); return; }
    try {
      const info = await api.get(`/agent/delivery-info?date=${date}`);
      setDeliveryInfo(info);
    } catch { setDeliveryInfo(null); }
  };

  useEffect(() => {
    if (form.deliveryDate) fetchDeliveryInfo(form.deliveryDate);
  }, [form.deliveryDate]);

  useEffect(() => {
    if (!editEntry) {
      setForm(f => ({ ...f, soId: genSoId() }));
    }
  }, [initialType, editEntry]);

  const handlePartyChange = (id, name) => setForm(f => ({ ...f, partyId: id, partyName: name }));

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

  const handleProductSelect = (index, id, name) => {
    const newItems = [...items];
    newItems[index].productId = id;
    newItems[index].productName = name;

    const product = productList.find(p => p.id === id);
    if (product) {
      newItems[index].unit = product.unit || '';
    }
    setItems(newItems);
  };

  const addItem = () => setItems([...items, { tempId: Date.now().toString(), productId: '', productName: '', qty: '', unit: '', rate: '', amount: '' }]);
  const removeItem = (index) => setItems(items.filter((_, i) => i !== index));

  const totals = useMemo(() => {
    return items.reduce((acc, item) => {
      const product = productList.find(p => p.id === item.productId);
      const isAlternate = product && product.alternateUnit === item.unit;
      const factor = isAlternate ? parseFloat(product.conversionFactor) || 1.0 : 1.0;
      
      const qtyEntered = parseFloat(item.qty) || 0;
      const qtyInStandardUnit = qtyEntered * factor;

      acc.qty += qtyInStandardUnit;
      acc.amount += parseFloat(item.amount) || 0;
      return acc;
    }, { qty: 0, amount: 0 });
  }, [items, productList]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.partyId) return addToast('Select a party', 'error');
    const validItems = items.filter(i => i.productId);
    if (validItems.length === 0) return addToast('Select at least one product', 'error');

    setLoading(true);
    try {
      const data = {
        ...form,
        date: toDBDate(form.date),
        deliveryDate: toDBDate(form.deliveryDate),
        totalQty: totals.qty,
        amount: totals.amount,
        type: initialType,
        items: validItems.map(i => {
          const product = productList.find(p => p.id === i.productId);
          const isAlternate = product && product.alternateUnit === i.unit;
          const factor = isAlternate ? parseFloat(product.conversionFactor) || 1.0 : 1.0;
          
          const qtyEntered = parseFloat(i.qty) || 0;
          const qtyInStandardUnit = qtyEntered * factor;

          return {
            productId: i.productId,
            productName: i.productName,
            qty: qtyInStandardUnit,
            rate: parseFloat(i.rate) || 0,
            amount: parseFloat(i.amount) || 0,
            qtyEntered: qtyEntered,
            unitUsed: i.unit || product?.unit || '',
            qtyInStandardUnit: qtyInStandardUnit
          };
        })
      };

      if (form.id) {
        await api.put(`/agent/entries/${form.id}`, data);
        addToast('Entry updated successfully!');
      } else {
        const endpoint = initialType === 'SO' ? '/agent/so' : '/agent/book';
        await api.post(endpoint, data);
        addToast(`${initialType} entry saved successfully!`);
      }

      if (onSuccess) onSuccess();
      if (isModal && onClose) onClose();
      else {
        setForm({
          date: today, partyId: '', partyName: '', remarkVersion: '',
          remark: '', deliveryDate: today, soId: genSoId(), billNo: ''
        });
        setItems([{ tempId: Date.now().toString(), productId: '', productName: '', qty: '', unit: '', rate: '', amount: '' }]);
      }
    } catch (err) { addToast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const title = initialType.charAt(0) + initialType.slice(1).toLowerCase();

  const formContent = (
    <div className="space-y-10">
      {!isModal && (
        <div className="flex items-start gap-5">
          <div className="bg-amber-500 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">{title} Entry</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Agent-tier {initialType} registration</p>
          </div>
        </div>
      )}

      <div className={`${isModal ? '' : 'panel-card'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Date */}
            <div className="group">
              <label className="field-label">Transaction Date</label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                <input type="date" className="input-field pl-12" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            {/* Third Party Mobile No */}
            <div className="group">
              <label className="field-label">Third Party Mobile No</label>
              <div className="relative">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                <input className="input-field pl-12" value={form.remarkVersion} onChange={e => setForm({ ...form, remarkVersion: e.target.value })} placeholder="10-digit mobile number" />
              </div>
            </div>

            {/* Party */}
            <div className="md:col-span-2">
              <label className="field-label">Party Name</label>
              <PartyDropdown
                value={form.partyId}
                onChange={handlePartyChange}
              />
            </div>

            {/* Product Items Table */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <label className="field-label mb-0">Products List</label>
                <button type="button" onClick={addItem} className="text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                  <Plus size={14} /> Add Product
                </button>
              </div>

              <div className="border border-slate-100 rounded-2xl overflow-x-auto">
                <table className="w-full text-left min-w-[850px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest w-12 text-center">#</th>
                      <th className="px-4 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest min-w-[250px]">Product Selection</th>
                      <th className="px-4 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest w-48">Quantity</th>
                      <th className="px-4 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest w-32">Rate (₹)</th>
                      <th className="px-4 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest w-36 text-center">Amount</th>
                      <th className="px-4 py-4 text-[11px] font-black text-slate-500 uppercase tracking-widest w-16 text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, index) => {
                      const stockInfo = stockList.find(s => s.productId === item.productId);
                      const product = productList.find(p => p.id === item.productId);
                      const isAlternate = product && product.alternateUnit === item.unit;
                      const factor = isAlternate ? parseFloat(product.conversionFactor) || 1.0 : 1.0;

                      return (
                        <tr key={item.tempId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2 text-xs font-bold text-slate-400 text-center">{index + 1}</td>
                          <td className="px-4 py-3">
                            <ProductDropdown
                              value={item.productId}
                              onChange={(id, name) => handleProductSelect(index, id, name)}
                              stockInfo={stockInfo}
                              lastSellingPrice={product?.lastSellingPrice}
                              ctnPrice={product?.ctnPrice}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 min-w-[170px]">
                                <input 
                                  type="number" 
                                  step="any" 
                                  className="w-24 bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 transition-all" 
                                  value={item.qty} 
                                  onChange={e => handleItemChange(index, 'qty', e.target.value)} 
                                  placeholder="0" 
                                />
                                <select
                                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-2 py-2 text-xs font-black text-slate-700 outline-none focus:border-blue-500 transition-all uppercase"
                                  value={item.unit}
                                  onChange={e => handleItemChange(index, 'unit', e.target.value)}
                                >
                                  {product ? (
                                    <>
                                      <option value={product.unit}>{product.unit}</option>
                                      {product.alternateUnit && (
                                        <option value={product.alternateUnit}>{product.alternateUnit}</option>
                                      )}
                                    </>
                                  ) : (
                                    <option value="">Unit</option>
                                  )}
                                </select>
                              </div>
                              {product && product.alternateUnit && item.unit === product.alternateUnit && item.qty && (
                                <span className="text-[10px] font-bold text-blue-500/80 px-1">
                                  = {(parseFloat(item.qty || 0) * factor).toLocaleString()} {product.unit}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <input type="number" step="any" className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50/50 transition-all" value={item.rate} onChange={e => handleItemChange(index, 'rate', e.target.value)} placeholder="0" />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-black text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 inline-block min-w-[80px]">
                              ₹{parseFloat(item.amount || 0).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" disabled={items.length === 1}>
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50/80 border-t border-slate-100">
                    <tr>
                      <td colSpan="2" className="px-6 py-4 text-right text-xs font-black uppercase tracking-widest text-slate-600">Totals (Std Units):</td>
                      <td className="px-4 py-4 text-sm font-black text-slate-900">{totals.qty.toLocaleString()}</td>
                      <td className="px-4 py-4"></td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-base font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 shadow-sm">
                          ₹{totals.amount.toLocaleString()}
                        </span>
                      </td>
                      <td colSpan="1"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="group">
                <label className="field-label">SO Serial</label>
                <div className="input-field bg-slate-50 border-slate-200 text-slate-900 font-black flex items-center justify-between py-4 shadow-inner">
                  <span className="text-lg">{form.soId}  (Total: ₹{totals.amount.toLocaleString()})</span>
                  <ArrowRight size={20} className="text-blue-500" />
                </div>
              </div>

              <div className="group">
                <label className="field-label">Delivery Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                  <input
                    type="date"
                    className="input-field pl-12"
                    required
                    value={form.deliveryDate}
                    onChange={e => setForm({ ...form, deliveryDate: e.target.value })}
                  />
                </div>
                {deliveryInfo && (
                  <div className="mt-3 flex flex-wrap gap-4 px-4 py-2 bg-blue-50/50 rounded-xl border border-blue-100/50">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest uppercase">Capacity:</span>
                      <span className="text-xs font-black text-slate-700">{deliveryInfo.capacity}</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest uppercase">Used:</span>
                      <span className="text-xs font-black text-blue-600">{deliveryInfo.used}</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest uppercase">Available:</span>
                      <span className={`text-xs font-black ${deliveryInfo.available <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {deliveryInfo.available}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Remark */}
            <div className="md:col-span-2 group">
              <label className="field-label">Remark / Notes</label>
              <div className="relative">
                <PenTool className="absolute left-4 top-4 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                <textarea className="input-field pl-12 min-h-[100px] py-4" value={form.remark} onChange={e => setForm({ ...form, remark: e.target.value })} placeholder="Add notes or context..." />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-5 pt-8 border-t border-slate-50">
            {isModal ? (
              <button type="button" className="btn-secondary" onClick={onClose}>Discard</button>
            ) : form.id ? (
              <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
            ) : null}
            <button type="submit" className="btn-primary flex items-center gap-3 shadow-xl shadow-blue-100 min-w-[200px] justify-center" disabled={loading}>
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={18} />
                  <span className="uppercase tracking-widest text-xs">
                    {form.id ? 'Update' : 'Save'} {initialType}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose} />
        <div className="relative w-full max-w-5xl bg-white rounded-[2.5rem] shadow-2xl p-10 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-300">
          <button onClick={onClose} className="absolute top-8 right-8 text-slate-300 hover:text-slate-900 transition-colors">
            <X size={28} />
          </button>
          {formContent}
        </div>
      </div>
    );
  }

  return formContent;
}
