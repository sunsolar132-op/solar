import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, User, X, Loader2 } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function PartyDropdown({ value, onChange, category = 'SALE' }) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [parties, setParties] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const animFrameRef = useRef(null);

  // ─── Fetch parties ────────────────────────────────────────────────────────
  const fetchParties = useCallback(async () => {
    if (!user) return;
    setFetching(true);
    try {
      const endpoint = user?.role === 'AGENT' ? '/agent/parties' : '/firm/parties';
      const data = await api.get(`${endpoint}?category=${category}`);
      setParties(data);
    } catch {
      addToast('Directory unreachable', 'error');
    } finally {
      setFetching(false);
    }
  }, [user, category, addToast]);

  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  // ─── Derived state ────────────────────────────────────────────────────────
  const selected = parties.find(p => p.id === value);
  const trimmedSearch = search.trim().toLowerCase();
  const filtered = parties.filter(p =>
    !trimmedSearch || p.name.toLowerCase().includes(trimmedSearch)
  );

  // ─── Highlight matched text ───────────────────────────────────────────────
  const highlight = (text) => {
    if (!trimmedSearch) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(trimmedSearch);
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        <span>{text.slice(0, idx)}</span>
        <span className="bg-blue-100 text-blue-700 rounded px-0.5">{text.slice(idx, idx + trimmedSearch.length)}</span>
        <span>{text.slice(idx + trimmedSearch.length)}</span>
      </>
    );
  };

  // ─── Portal positioning ───────────────────────────────────────────────────
  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  const openDropdown = () => {
    updatePos();
    setOpen(true);
  };

  // Reposition on scroll/resize
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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      const portalEl = document.getElementById('party-dropdown-portal');
      const isInsideTrigger = triggerRef.current?.contains(e.target);
      const isInsidePortal = portalEl?.contains(e.target);
      if (!isInsideTrigger && !isInsidePortal) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {/* Trigger */}
      <div
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={`
          flex items-center justify-between px-5 py-4 rounded-2xl border transition-all cursor-pointer
          ${open
            ? 'border-blue-600 ring-4 ring-blue-50 bg-white shadow-lg shadow-blue-100'
            : 'border-slate-100 bg-white hover:border-slate-200'}
        `}
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selected ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-slate-50 text-slate-400'}`}>
            <User size={20} />
          </div>
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
              {category === 'PURCHASE' ? 'Purchase Vendor' : 'Sale Customer'}
            </div>
            <div className={`text-sm font-black transition-colors ${selected ? 'text-slate-900' : 'text-slate-400 italic'}`}>
              {selected ? selected.name : 'Select Entity...'}
            </div>
          </div>
        </div>
        <div className="text-slate-300">
          {open ? <X size={16} /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
        </div>
      </div>

      {/* Portal Dropdown */}
      {open && createPortal(
        <div
          id="party-dropdown-portal"
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
                placeholder="Search party..."
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
                  : `${parties.length} part${parties.length !== 1 ? 'ies' : 'y'} available`}
              </div>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ flex: '1 1 auto' }}>
            {fetching ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-2xl">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 animate-pulse flex-shrink-0" />
                    <div className="h-3 bg-slate-100 rounded-full animate-pulse" style={{ width: `${50 + i * 15}%` }} />
                  </div>
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div className="p-3">
                {filtered.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { onChange(p.id, p.name); setSearch(''); setOpen(false); }}
                    className={`flex items-center px-4 py-3 rounded-2xl cursor-pointer transition-all group
                      ${p.id === value ? 'bg-blue-50 border border-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 transition-all
                        ${p.id === value
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'}`}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-black text-slate-700 group-hover:text-slate-900 truncate">
                        {highlight(p.name)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Search size={20} className="text-slate-300" />
                </div>
                <div className="text-slate-400 font-bold text-sm mb-1">No entities found</div>
                {trimmedSearch
                  ? <div className="text-slate-300 text-xs">"{search}" not in directory</div>
                  : <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Contact Admin for Access</div>
                }
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
