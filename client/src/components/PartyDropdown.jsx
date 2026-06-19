import { useState, useEffect } from 'react';
import { Search, User, X } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function PartyDropdown({ value, onChange, category = 'SALE' }) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [parties, setParties] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const fetchParties = async () => {
    try {
      const endpoint = user?.role === 'AGENT' ? '/agent/parties' : '/firm/parties';
      // Pass category to server to fetch filtered data
      const data = await api.get(`${endpoint}?category=${category}`);
      setParties(data);
    } catch {
      addToast('Directory unreachable', 'error');
    }
  };

  useEffect(() => {
    if (user) fetchParties();
  }, [user, category]); // Refetch if category changes

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const selected = parties.find(p => p.id === value);
  
  const filtered = parties.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <div 
        onClick={() => setOpen(!open)}
        className={`
          flex items-center justify-between px-5 py-4 rounded-2xl border transition-all cursor-pointer
          ${open ? 'border-blue-600 ring-4 ring-blue-50 bg-white shadow-lg shadow-blue-100' : 'border-slate-100 bg-white hover:border-slate-200'}
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

      {open && (
        <div className="absolute top-full left-0 right-0 z-[100] mt-3 bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="p-6 border-b border-slate-50 bg-slate-50/50">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                autoFocus
                className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border border-slate-100 outline-none focus:border-blue-600 text-sm font-bold shadow-sm"
                placeholder="Search directory..."
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
                  className="flex items-center p-4 rounded-2xl hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all text-xs font-black">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-black text-slate-700 group-hover:text-slate-900 block leading-none">{p.name}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center">
                <div className="text-slate-300 font-bold text-sm italic">No assigned entities found</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Contact Admin for Access</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
