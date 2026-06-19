import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, Package, X, Edit2, Plus } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function ProductDropdown({ value, onChange, stockInfo, lastSellingPrice, ctnPrice }) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);

  const fetchProducts = async () => {
    try {
      const data = await api.get('/products');
      setProducts(data.filter(p => p.isActive !== false || p.id === value));
    } catch (err) {
      addToast('Catalog unreachable', 'error');
    }
  };

  useEffect(() => {
    if (open) {
      fetchProducts();
      setSearch('');
    }
  }, [open]);

  const handleQuickRegister = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const newProduct = await api.post('/products', {
        name: search.trim(),
        unit: 'Unit' // Default unit
      });
      addToast('New material registered');
      setProducts(prev => [...prev, newProduct]);
      onChange(newProduct.id, newProduct.name);
      setOpen(false);
    } catch (err) {
      addToast('Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRedirect = (e) => {
    e.stopPropagation();
    const roleBase = user?.role?.toLowerCase();
    if (!roleBase) return addToast('Authentication identity expired', 'error');
    window.location.href = `/${roleBase}/products`;
  };

  const selected = products.find(p => p.id === value);
  const filtered = products.filter(p =>
    (p.isActive !== false || p.id === value) &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        // Check if click is inside the portal dropdown
        const portalEl = document.getElementById('product-dropdown-portal');
        if (portalEl && portalEl.contains(e.target)) return;
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`
          flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all cursor-pointer
          ${open ? 'border-blue-600 ring-4 ring-blue-50 bg-white shadow-lg shadow-blue-100' : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md hover:shadow-blue-50'}
        `}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${selected ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-slate-100 text-slate-500'}`}>
            <Package size={16} />
          </div>
          <div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Product Item</div>
            <div className={`text-sm font-bold transition-colors ${selected ? 'text-slate-900' : 'text-slate-400 italic'}`}>
              {selected ? selected.name : 'Select Product...'}
            </div>
          </div>
        </div>
        <div className="text-slate-300">
          {open ? <X size={16} /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
        </div>
      </div>

      {/* Stock Info shown below trigger when a product is selected */}
      {selected && stockInfo && (
        <div className="flex flex-wrap gap-2 mt-2 px-1">
          <div className="bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1.5 border border-slate-200">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Physical</span>
            <span className="text-xs font-black text-slate-900">{stockInfo.physicalStock.toLocaleString()}</span>
          </div>
          <div className="bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1.5 border border-slate-200">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Estimate</span>
            <span className={`text-xs font-black ${stockInfo.estimateStock < 0 ? 'text-red-600' : 'text-green-600'}`}>{stockInfo.estimateStock.toLocaleString()}</span>
          </div>
        </div>
      )}


      {open && createPortal(
        <div
          id="product-dropdown-portal"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
          className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="p-6 border-b border-slate-50 bg-slate-50/50">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                autoFocus
                className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-slate-100 outline-none focus:border-blue-600 text-sm font-bold shadow-sm"
                placeholder="Lookup in catalog..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto p-4 scrollbar-hide">
            {filtered.length > 0 ? (
              filtered.map(p => (
                <div
                  key={p.id}
                  onClick={() => { onChange(p.id, p.name); setOpen(false); }}
                  className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-200 group-hover:bg-blue-600 transition-colors" />
                    <span className="text-sm font-black text-slate-700 group-hover:text-slate-900">{p.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{p.unit}</span>
                </div>
              ))
            ) : (
              <div className="p-6 text-center">
                <div className="text-slate-300 mb-6 font-bold text-sm italic">No specifications found</div>
                {search.trim() && (
                  <button
                    onClick={handleQuickRegister}
                    disabled={loading}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Plus size={16} />
                        <span>Add "{search}"</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-2">
            <button
              onClick={handleRedirect}
              className="flex-1 py-4 flex items-center justify-center gap-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"
            >
              <Edit2 size={14} />
              <span>Catalog Registry</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
