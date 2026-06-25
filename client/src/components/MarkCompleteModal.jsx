import { createElement, useState, useEffect, useMemo } from 'react';
import { X, Truck, CheckCircle2, ChevronRight, ArrowLeft, User, Phone, Hash, Info, AlertCircle, Plus, Trash2 } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';

function uid() {
  return Math.random().toString(36).substr(2, 9);
}

export default function MarkCompleteModal({ entry, onClose, onSuccess, editMode = false }) {
  const [step, setStep] = useState(1);
  const [transport, setTransport] = useState({
    vehicleNo: '',
    transportId: '',
    personName: '',
    mobile: ''
  });

  // deliveryMap: { [originalProductId]: [ { rowId, deliveredProductId, deliveredProductName, deliveredQty, unit } ] }
  const [deliveryMap, setDeliveryMap] = useState({});
  const [allProducts, setAllProducts] = useState([]);
  const { addToast } = useToast();
  const entryItems = useMemo(() => Array.isArray(entry?.items) ? entry.items : [], [entry]);

  useEffect(() => {
    let cancelled = false;

    const buildDefaultMap = () => {
      const initial = {};
      entryItems.forEach(it => {
        initial[it.productId] = [{
          rowId: uid(),
          deliveredProductId: it.productId,
          deliveredProductName: it.productName,
          deliveredQty: it.qtyEntered != null ? it.qtyEntered : it.qty,
          unit: it.unitUsed || '',
        }];
      });
      return initial;
    };

    async function loadInitialData() {
      try {
        const products = await api.get('/products');
        if (cancelled) return;
        setAllProducts(Array.isArray(products) ? products : []);

        if (editMode && entry.deliveryStatus === 'Completed') {
          const outwardRows = await api.get(`/firm/outward-details/${entry.id}`);
          if (cancelled) return;
          if (outwardRows.length > 0) {
            const initial = {};
            outwardRows.forEach((row) => {
              const originalProductId = row.original_product_id;
              if (!initial[originalProductId]) initial[originalProductId] = [];
              initial[originalProductId].push({
                rowId: uid(),
                originalProductName: row.original_product_name || '',
                originalQty: row.original_qty ?? 0,
                deliveredProductId: row.delivered_product_id,
                deliveredProductName: row.delivered_product_name,
                deliveredQty: row.qty_entered ?? row.delivered_qty,
                unit: row.unit_used || '',
              });
            });
            setDeliveryMap(initial);
            const first = outwardRows[0];
            setTransport({
              vehicleNo: first.vehicle_no || '',
              transportId: first.transport_id || '',
              personName: first.person_name || '',
              mobile: first.mobile || '',
            });
            return;
          }
        }

        setDeliveryMap(buildDefaultMap());
      } catch (err) {
        addToast(err.message, 'error');
        if (!cancelled) setDeliveryMap(buildDefaultMap());
      }
    }

    loadInitialData();
    return () => { cancelled = true; };
  }, [entry, editMode, addToast, entryItems]);

  // ── Delivery row helpers ──────────────────────────────────────────────────
  const addRow = (originalProductId) => {
    const billItem = entryItems.find(i => i.productId === originalProductId);
    setDeliveryMap(prev => ({
      ...prev,
      [originalProductId]: [
        ...(prev[originalProductId] || []),
        {
          rowId: uid(),
          deliveredProductId: originalProductId,
          deliveredProductName: billItem?.productName || '',
          deliveredQty: '',
          unit: billItem?.unitUsed || '',
        }
      ]
    }));
  };

  const removeRow = (originalProductId, rowId) => {
    setDeliveryMap(prev => ({
      ...prev,
      [originalProductId]: (prev[originalProductId] || []).filter(r => r.rowId !== rowId)
    }));
  };

  const updateRow = (originalProductId, rowId, field, value) => {
    setDeliveryMap(prev => ({
      ...prev,
      [originalProductId]: (prev[originalProductId] || []).map(r =>
        r.rowId === rowId ? { ...r, [field]: value } : r
      )
    }));
  };

  const handleProductChange = (originalProductId, rowId, newProductId) => {
    const product = allProducts.find(p => p.id === newProductId);
    setDeliveryMap(prev => ({
      ...prev,
      [originalProductId]: (prev[originalProductId] || []).map(r =>
        r.rowId === rowId
          ? { ...r, deliveredProductId: newProductId, deliveredProductName: product?.name || '', unit: product?.unit || '' }
          : r
      )
    }));
  };

  const selectableProducts = (selectedProductId) => {
    const selected = allProducts.find(p => p.id === selectedProductId);
    const active = allProducts.filter(p => p.isActive !== false);
    return selected && selected.isActive === false
      ? [selected, ...active.filter(p => p.id !== selected.id)]
      : active;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    // Flatten deliveryMap into verificationItems array
    const verificationItems = [];
    for (const [originalProductId, rows] of Object.entries(deliveryMap)) {
      const billItem = entryItems.find(i => i.productId === originalProductId);
      const firstRow = rows[0] || {};
      for (const row of rows) {
        const product = allProducts.find(p => p.id === row.deliveredProductId);
        verificationItems.push({
          originalProductId,
          originalProductName: billItem?.productName || firstRow.originalProductName || '',
          originalQty: billItem?.qty ?? firstRow.originalQty ?? 0,
          deliveredProductId: row.deliveredProductId,
          deliveredProductName: row.deliveredProductName,
          deliveredQty: Number(row.deliveredQty) || 0,
          deliveredQtyEntered: Number(row.deliveredQty) || 0,
          deliveredUnitUsed: row.unit || product?.unit || '',
        });
      }
    }

    try {
      if (editMode) {
        await api.put(`/firm/outward-details/${entry.id}`, {
          transportDetails: transport,
          verificationItems,
        });
      } else {
        await api.post('/firm/mark-complete', {
          billId: entry.id,
          transportDetails: transport,
          verificationItems,
        });
      }
      addToast(editMode ? 'Outward details updated successfully' : 'Delivery marked as complete successfully', 'success');
      onSuccess();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Progress Header */}
        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all ${step === 1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-110' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-100'}`}>
                {step > 1 ? <CheckCircle2 size={20} /> : '1'}
              </div>
              <div className="flex flex-col">
                <span className={`text-[10px] font-black uppercase tracking-widest ${step === 1 ? 'text-blue-600' : 'text-slate-400'}`}>Step One</span>
                <span className="text-sm font-black text-slate-900">{editMode ? 'Edit Transport' : 'Transport Details'}</span>
              </div>
            </div>
            <ChevronRight size={20} className="text-slate-200" />
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all ${step === 2 ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 scale-110' : 'bg-slate-100 text-slate-400'}`}>
                2
              </div>
              <div className="flex flex-col">
                <span className={`text-[10px] font-black uppercase tracking-widest ${step === 2 ? 'text-blue-600' : 'text-slate-400'}`}>Step Two</span>
                <span className="text-sm font-black text-slate-900">Product Verification</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-12">
          {step === 1 ? (
            /* ── STEP 1: Transport Details ─────────────────────────────── */
            <div className="max-w-2xl mx-auto space-y-10 animate-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Logistics Information</h3>
                <p className="text-slate-400 font-bold">Provide transport details for bill <span className="text-blue-600">#{entry.billNo || entry.soId || entry.poId}</span></p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[
                  { icon: Hash,  label: 'Vehicle Number',      key: 'vehicleNo',    placeholder: 'e.g. MH 12 AB 1234', upper: true },
                  { icon: Info,  label: 'Transport ID / LR No',key: 'transportId',  placeholder: 'Enter tracking reference' },
                  { icon: User,  label: 'Driver / Person Name',key: 'personName',   placeholder: 'Full name' },
                  { icon: Phone, label: 'Driver Mobile No',    key: 'mobile',       placeholder: '10-digit number' },
                ].map(({ icon: Icon, label, key, placeholder, upper }) => (
                  <div key={key} className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{label}</label>
                    <div className="relative group">
                      {createElement(Icon, {
                        className: 'absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors',
                        size: 20,
                      })}
                      <input
                        className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl pl-14 pr-6 py-4 font-black text-slate-900 transition-all outline-none"
                        placeholder={placeholder}
                        value={transport[key]}
                        onChange={e => setTransport({ ...transport, [key]: upper ? e.target.value.toUpperCase() : e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── STEP 2: Product Verification (one-to-many) ────────────── */
            <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">Final Verification</h3>
                  <p className="text-slate-400 font-bold mt-1 italic">Each billed product can be split into multiple delivered items</p>
                </div>
                <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
                  <AlertCircle size={18} />
                  <span className="text-[11px] font-black uppercase tracking-wider">Discrepancy Check Active</span>
                </div>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-3 px-4">
                  <div className="w-1.5 h-5 bg-slate-200 rounded-full" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Original Bill Items</span>
                </div>
                <div className="flex items-center gap-3 px-4">
                  <div className="w-1.5 h-5 bg-blue-600 rounded-full" />
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Actual Delivered</span>
                </div>
              </div>

              {/* One row-group per bill item */}
              <div className="space-y-4">
                {entryItems.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-amber-100 bg-amber-50 text-amber-700 font-bold text-sm">
                    No bill items were found for this entry. Reopen the entry after refreshing data, or edit the bill items first.
                  </div>
                ) : entryItems.map((billItem) => {
                  const rows = deliveryMap[billItem.productId] || [];
                  return (
                    <div
                      key={billItem.productId}
                      className="grid grid-cols-2 gap-0 border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm"
                    >
                      {/* LEFT — original bill item (read-only), spans all delivery rows */}
                      <div className="flex items-start justify-between p-6 bg-slate-50 border-r border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-slate-900">{billItem.productName}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Bill Item</span>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-xl font-black text-slate-900">
                            {billItem.qtyEntered != null && billItem.unitUsed 
                              ? `${billItem.qtyEntered} ${billItem.unitUsed}`
                              : billItem.qty}
                          </div>
                          {billItem.qtyEntered != null && billItem.qty !== billItem.qtyEntered && (
                            <div className="text-[10px] font-bold text-slate-400 uppercase">
                              ({billItem.qty} STD)
                            </div>
                          )}
                          <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Billed Qty</div>
                        </div>
                      </div>

                      {/* RIGHT — delivery rows (editable, stacked) */}
                      <div className="flex flex-col divide-y divide-slate-50 bg-white">
                        {rows.map((row) => {
                          const product = allProducts.find(p => p.id === row.deliveredProductId);
                          const isAlternate = product && product.alternateUnit === row.unit;
                          const factor = isAlternate ? parseFloat(product.conversionFactor) || 1.0 : 1.0;

                          return (
                            <div key={row.rowId} className="flex flex-col p-4 gap-2">
                              <div className="flex items-center gap-3">
                                {/* Product select */}
                                <div className="flex-1 bg-slate-50 rounded-xl border-2 border-transparent focus-within:border-blue-500 transition-all">
                                  <select
                                    className="w-full bg-transparent font-black text-slate-900 outline-none h-11 px-3 text-sm"
                                    value={row.deliveredProductId}
                                    onChange={e => handleProductChange(billItem.productId, row.rowId, e.target.value)}
                                  >
                                    {selectableProducts(row.deliveredProductId).map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* Qty input & Unit select */}
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    className="w-20 bg-blue-50 rounded-xl h-11 px-3 font-black text-blue-600 outline-none focus:ring-2 focus:ring-blue-500 text-center"
                                    value={row.deliveredQty}
                                    onChange={e => updateRow(billItem.productId, row.rowId, 'deliveredQty', e.target.value)}
                                    placeholder="Qty"
                                  />
                                  <select
                                    className="bg-slate-50 border border-slate-200 rounded-xl h-11 px-2 text-xs font-black text-slate-700 outline-none focus:border-blue-500 transition-all uppercase"
                                    value={row.unit || (product?.unit || '')}
                                    onChange={e => updateRow(billItem.productId, row.rowId, 'unit', e.target.value)}
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

                                {/* Delete button — hidden when only 1 row */}
                                {rows.length > 1 ? (
                                  <button
                                    onClick={() => removeRow(billItem.productId, row.rowId)}
                                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all flex-shrink-0"
                                    title="Remove this row"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                ) : (
                                  <div className="w-9 flex-shrink-0" /> /* spacer */
                                )}
                              </div>

                              {product && product.alternateUnit && row.unit === product.alternateUnit && row.deliveredQty && (
                                <span className="text-[10px] font-bold text-blue-500/80 px-2 block leading-none">
                                  = {(parseFloat(row.deliveredQty || 0) * factor).toLocaleString()} {product.unit} (Standard Unit Conversion)
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {/* + Add Row button */}
                        <button
                          onClick={() => addRow(billItem.productId)}
                          className="flex items-center gap-2 px-5 py-3 text-[11px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-50 transition-colors w-full"
                        >
                          <Plus size={13} strokeWidth={3} />
                          Add Row
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-10 py-8 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          {step === 1 ? (
            <div className="flex items-center gap-2 text-slate-400 italic text-xs font-bold">
              <Info size={14} />
              <span>Vehicle No and Driver Name are required to proceed</span>
            </div>
          ) : (
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white border border-slate-100 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 transition-all"
            >
              <ArrowLeft size={16} />
              Back to Transport
            </button>
          )}

          <div className="flex items-center gap-4">
            <button onClick={onClose} className="btn-secondary !px-8">Cancel</button>
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                disabled={!transport.vehicleNo || !transport.personName}
                className="flex items-center gap-3 px-10 py-4 rounded-2xl bg-blue-600 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-100 hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                Continue to Verification
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-3 px-10 py-4 rounded-2xl bg-emerald-500 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-100 hover:scale-105 transition-all"
              >
                Confirm & Complete Delivery
                <CheckCircle2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
