import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Package, X, Edit2, Plus, Loader2 } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

// ─── Module-level product cache ─────────────────────────────────────────────
// Shared across ALL ProductDropdown instances on the page.
// This means only 1 network request ever fires, and every row
// gets the same data instantly after the first fetch.
let _cachedProducts = null;       // null = not fetched yet, [] = fetched but empty
let _fetchPromise   = null;       // in-flight promise de-duplication
let _listeners      = [];         // callbacks to notify when cache updates

function subscribeToProducts(cb) {
  _listeners.push(cb);
  return () => { _listeners = _listeners.filter(l => l !== cb); };
}
function notifyListeners(products) {
  _listeners.forEach(cb => cb(products));
}

async function loadProducts() {
  if (_cachedProducts !== null) return _cachedProducts;
  if (_fetchPromise) return _fetchPromise;           // reuse in-flight request

  _fetchPromise = api.get('/products')
    .then(data => {
      const active = data.filter(p => p.isActive !== false);
      _cachedProducts = active;
      notifyListeners(active);
      return active;
    })
    .catch(err => {
      _fetchPromise = null;                          // allow retry on next open
      throw err;
    })
    .finally(() => { _fetchPromise = null; });

  return _fetchPromise;
}

// Force a fresh fetch (called after adding a new product)
function invalidateProductCache() {
  _cachedProducts = null;
  _fetchPromise   = null;
}

// ─── Unique ID counter so multiple open dropdowns don't collide ──────────────
let _dropdownCounter = 0;

// ─── Component ────────────────────────────────────────────────────────────────
export default function ProductDropdown({ value, onChange, stockInfo }) {
  const { addToast } = useToast();
  const { user }     = useAuth();

  // Stable portal ID per instance — prevents id collisions between rows
  const portalId = useRef(`product-portal-${++_dropdownCounter}`).current;

  const [products,  setProducts]  = useState(() => _cachedProducts ?? []);
  const [search,    setSearch]    = useState('');
  const [open,      setOpen]      = useState(false);
  const [fetching,  setFetching]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

  const triggerRef    = useRef(null);
  const searchInputRef= useRef(null);
  const animFrameRef  = useRef(null);
  const mountedRef    = useRef(true);

  // Keep mountedRef in sync with unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Subscribe to module-level cache updates (so every row auto-updates)
  useEffect(() => {
    return subscribeToProducts(updated => {
      if (mountedRef.current) setProducts(updated);
    });
  }, []);

  // ─── Fetch on first open ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    // Focus search box
    setTimeout(() => searchInputRef.current?.focus(), 50);

    // If already cached, nothing to do
    if (_cachedProducts !== null) {
      setProducts(_cachedProducts);
      return;
    }

    setFetching(true);
    loadProducts()
      .then(data => { if (mountedRef.current) setProducts(data); })
      .catch(() => { if (mountedRef.current) addToast('Catalog unreachable', 'error'); })
      .finally(() => { if (mountedRef.current) setFetching(false); });
  }, [open]); // intentionally no addToast dep — stable enough

  // ─── Quick register new product ──────────────────────────────────────────
  const handleQuickRegister = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const newProduct = await api.post('/products', {
        name: search.trim(),
        unit: 'Unit',
      });
      addToast('New material registered');
      // Invalidate shared cache so other dropdowns also get the new product
      invalidateProductCache();
      const updated = [...products, newProduct];
      _cachedProducts = updated;
      notifyListeners(updated);
      setProducts(updated);
      onChange(newProduct.id, newProduct.name);
      setSearch('');
      setOpen(false);
    } catch {
      addToast('Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Redirect to product catalog ─────────────────────────────────────────
  const handleRedirect = (e) => {
    e.stopPropagation();
    const roleBase = user?.role?.toLowerCase();
    if (!roleBase) return addToast('Authentication identity expired', 'error');
    window.location.href = `/${roleBase}/products`;
  };

  // ─── Derived state ────────────────────────────────────────────────────────
  const selected = useMemo(() => products.find(p => p.id === value), [products, value]);

  const trimmedSearch = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    // Build list: always include selected product even if it was deactivated
    const base = selected
      ? [selected, ...products.filter(p => p.id !== value)]
      : products;

    if (!trimmedSearch) return base;
    return base.filter(p => p.name.toLowerCase().includes(trimmedSearch));
  }, [products, selected, value, trimmedSearch]);

  // ─── Portal positioning ───────────────────────────────────────────────────
  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    }
  }, []);

  const openDropdown = () => { updatePos(); setOpen(true); };

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(updatePos);
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize, true);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize, true);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [open, updatePos]);

  // ─── Close on outside click (uses per-instance portalId) ─────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const portalEl = document.getElementById(portalId);
      if (!triggerRef.current?.contains(e.target) && !portalEl?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, portalId]);

  // ─── Highlight matched text ───────────────────────────────────────────────
  const highlight = (text) => {
    if (!trimmedSearch) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(trimmedSearch);
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <span className="bg-blue-100 text-blue-700 rounded px-0.5">
          {text.slice(idx, idx + trimmedSearch.length)}
        </span>
        <span>{text.slice(idx + trimmedSearch.length)}</span>
      </>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {/* Trigger */}
      <div
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`
          flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all cursor-pointer
          ${open
            ? 'border-blue-600 ring-4 ring-blue-50 bg-white shadow-lg shadow-blue-100'
            : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-md hover:shadow-blue-50'}
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

      {/* Stock Info */}
      {selected && stockInfo && (
        <div className="flex flex-wrap gap-2 mt-2 px-1">
          <div className="bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1.5 border border-slate-200">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Physical</span>
            <span className="text-xs font-black text-slate-900">{stockInfo.physicalStock.toLocaleString()}</span>
          </div>
          <div className="bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1.5 border border-slate-200">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Estimate</span>
            <span className={`text-xs font-black ${stockInfo.estimateStock < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {stockInfo.estimateStock.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Portal Dropdown */}
      {open && createPortal(
        <div
          id={portalId}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            maxHeight: `calc(100vh - ${dropdownPos.top}px - 16px)`,
            display: 'flex',
            flexDirection: 'column',
          }}
          className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
        >
          {/* Search Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
            <div className="relative">
              {fetching
                ? <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" size={18} />
                : <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              }
              <input
                ref={searchInputRef}
                type="text"
                className="w-full pl-12 pr-10 py-3 bg-white rounded-2xl border border-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 text-sm font-semibold text-slate-800 placeholder-slate-400 shadow-sm transition-all"
                placeholder="Search product..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setOpen(false); }
                  if (e.key === 'Enter' && filtered.length === 1) {
                    onChange(filtered[0].id, filtered[0].name);
                    setSearch('');
                    setOpen(false);
                  }
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {/* Result count */}
            {!fetching && (
              <div className="mt-2 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {trimmedSearch
                  ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${search}"`
                  : `${products.length} product${products.length !== 1 ? 's' : ''} in catalog`}
              </div>
            )}
          </div>

          {/* Product List */}
          <div className="overflow-y-auto" style={{ flex: '1 1 auto' }}>
            {fetching ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-2xl">
                    <div className="w-2 h-2 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-3 bg-slate-100 rounded-full animate-pulse" style={{ width: `${50 + i * 12}%` }} />
                  </div>
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div className="p-3">
                {filtered.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { onChange(p.id, p.name); setSearch(''); setOpen(false); }}
                    className={`flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer transition-all group
                      ${p.id === value ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${p.id === value ? 'bg-blue-600' : 'bg-slate-200 group-hover:bg-blue-500'}`} />
                      <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900 truncate">
                        {highlight(p.name)}
                      </span>
                    </div>
                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-2 flex-shrink-0">{p.unit}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Search size={20} className="text-slate-300" />
                </div>
                <div className="text-slate-400 font-bold text-sm mb-1">No products found</div>
                <div className="text-slate-300 text-xs mb-5">"{search}" is not in the catalog</div>
                {search.trim() && (
                  <button
                    onClick={handleQuickRegister}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-60"
                  >
                    {loading
                      ? <Loader2 size={16} className="animate-spin" />
                      : <><Plus size={16} /><span>Add "{search}"</span></>
                    }
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
            <button
              onClick={handleRedirect}
              className="w-full py-3 flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm"
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
