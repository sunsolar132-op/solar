import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, User, Phone, MapPin, Search, ArrowRight, Info, Filter } from 'lucide-react';
import api from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const EMPTY = { name: '', mobile: '', address: '', category: '' };

export default function PartiesMaster() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const [parties, setParties] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const isAgent = user?.role === 'AGENT';
  const apiBase = isAgent ? '/agent' : '/firm';

  const fetchItems = async () => {
    try { 
      const data = await api.get(`${apiBase}/parties`);
      setParties(data); 
    } catch (e) { addToast(e.message, 'error'); }
  };

  useEffect(() => { 
    fetchItems(); 
  }, [user]);

  const openAdd = () => { 
    setForm({ ...EMPTY, category: categoryFilter === 'ALL' ? 'SALE' : categoryFilter }); 
    setEditId(null); 
    setShowModal(true); 
  };

  const openEdit = (p) => { 
    setForm({ 
      name: p.name, 
      mobile: p.mobile || '', 
      address: p.address || '', 
      category: p.category || 'SALE' 
    }); 
    setEditId(p.id); 
    setShowModal(true); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return addToast('Party name is required', 'error');
    if (!form.category) return addToast('Please select Entity Classification (Purchase or Sale)', 'error');
    setLoading(true);
    try {
      if (editId) { 
        await api.put(`${apiBase}/parties/${editId}`, form); 
        addToast('Identity Updated Successfully!'); 
      }
      else { 
        await api.post(`${apiBase}/parties`, form); 
        addToast('New Identity Registered!'); 
      }
      setShowModal(false); 
      fetchItems();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Permanently delete this counterparty identity?')) return;
    try { 
      await api.delete(`${apiBase}/parties/${id}`); 
      addToast('Identity removed.'); 
      fetchItems(); 
    } catch (e) { addToast(e.message, 'error'); }
  };

  const filtered = parties.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          (p.mobile && p.mobile.includes(search));
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Section Heading */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">
              {isAgent ? 'Customer Directory' : 'Identity Directory'}
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              {isAgent ? 'Manage your customer contacts' : 'Global counterparty ledger'}
            </p>
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-3 shadow-xl shadow-blue-100 self-start md:self-auto uppercase tracking-widest text-xs">
          <Plus size={20} />
          <span>{isAgent ? 'Register Customer' : 'Register Identity'}</span>
        </button>
      </div>

      {/* Control Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-2 relative group">
           <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
           <input 
             className="input-field pl-14 py-5 bg-white border-transparent shadow-sm focus:shadow-md transition-all font-bold"
             placeholder="Search by name or contact..."
             value={search}
             onChange={e => setSearch(e.target.value)}
           />
        </div>

        {!isAgent && (
          <div className="bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100 flex gap-1">
            {['ALL', 'PURCHASE', 'SALE'].map(cat => (
              <button 
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${categoryFilter === cat ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="panel-card !py-0 flex items-center gap-4 bg-slate-50 border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm">
            <Filter size={18} />
          </div>
          <div>
             <div className="text-xl font-black text-slate-900 leading-none">{filtered.length}</div>
             <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Found Records</div>
          </div>
        </div>
      </div>

      {/* Data Table Panel */}
      <div className="panel-card overflow-hidden !p-0 border-slate-100/50">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-20 pl-8 text-center">#</th>
                <th>Identity Details</th>
                <th>Contact / Location</th>
                <th>Classification</th>
                <th className="text-right pr-8">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="pl-8 text-center text-slate-400 font-bold">{i + 1}</td>
                  <td>
                    <div className="flex items-center gap-4 py-2">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-sm ${p.category === 'PURCHASE' ? 'bg-amber-50 text-amber-500 group-hover:bg-amber-500' : 'bg-blue-50 text-blue-500 group-hover:bg-blue-600'} group-hover:text-white`}>
                        <User size={22} />
                      </div>
                      <div>
                        <span className="font-black text-slate-900 block leading-tight">{p.name}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter tracking-widest">UID: {p.id.slice(0,8)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 group/info">
                        <Phone size={12} className="text-slate-300 group-hover/info:text-blue-500" />
                        <span className="text-xs font-bold text-slate-600">{p.mobile || '---'}</span>
                      </div>
                      <div className="flex items-center gap-2 group/info">
                        <MapPin size={12} className="text-slate-300 group-hover/info:text-blue-500" />
                        <span className="text-[10px] font-medium text-slate-400 truncate max-w-[200px]">{p.address || 'No address logged'}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${p.category === 'PURCHASE' ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>
                      {p.category || 'SALE'}
                    </div>
                  </td>
                  <td className="pr-8">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openEdit(p)}
                        className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white text-slate-400 hover:text-blue-600 border border-slate-100 hover:border-blue-200 transition-all shadow-sm active:scale-95"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(p.id)}
                        className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white text-slate-400 hover:text-red-500 border border-slate-100 hover:border-red-200 transition-all shadow-sm active:scale-95"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                        <User size={32} />
                      </div>
                      <p className="text-slate-400 font-bold">No identities found in this directory.</p>
                      <button onClick={openAdd} className="text-blue-600 font-black text-xs uppercase tracking-widest hover:underline">Register your first identity</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 px-8 py-6 bg-blue-50/50 rounded-[2rem] border border-blue-100 text-blue-600">
        <Info size={20} className="shrink-0" />
        <span className="text-xs font-black uppercase tracking-[0.15em] leading-relaxed">
          Security Alert: Identities are strictly scoped to the firm ledger. Agents can only view and register identities within the Sale category for their allocated firm.
        </span>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
          
          <div className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl p-10 md:p-14 overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            {/* Modal Header */}
            <div className="flex items-start justify-between mb-12 relative z-10">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
                  {editId ? 'Update Identity' : 'Register Identity'}
                </h2>
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-8 h-1 bg-blue-600 rounded-full" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Entry Verification</span>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all translate-x-4 -translate-y-4">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Category Selection (only for firms) */}
                {!isAgent && (
                  <div className="md:col-span-2 group">
                    <label className="field-label">Entity Classification</label>
                    <div className="flex gap-4">
                      {['PURCHASE', 'SALE'].map(cat => (
                        <label key={cat} className={`flex-1 flex items-center justify-center p-4 rounded-2xl border-2 transition-all cursor-pointer ${form.category === cat ? (cat === 'PURCHASE' ? 'border-amber-600 bg-amber-50 text-amber-600' : 'border-blue-600 bg-blue-50 text-blue-600') : 'border-slate-100 hover:border-slate-200 text-slate-400'}`}>
                          <input 
                            type="radio" 
                            className="hidden" 
                            name="category" 
                            value={cat} 
                            checked={form.category === cat} 
                            onChange={e => setForm({ ...form, category: e.target.value })} 
                          />
                          <span className="text-xs font-black uppercase tracking-widest">{cat} Party</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Name */}
                <div className="md:col-span-2 group">
                  <label className="field-label">Legal Name</label>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input 
                      className="input-field pl-14 font-black text-slate-900" 
                      required 
                      autoFocus
                      value={form.name} 
                      onChange={e => setForm({ ...form, name: e.target.value })} 
                      placeholder="e.g. Acme Corporation" 
                    />
                  </div>
                </div>

                {/* Mobile */}
                <div className="md:col-span-2 group">
                  <label className="field-label">Contact Primary</label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input 
                      className="input-field pl-14 font-bold" 
                      value={form.mobile} 
                      onChange={e => setForm({ ...form, mobile: e.target.value })} 
                      placeholder="+91-0000000000" 
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="md:col-span-2 group">
                  <label className="field-label">Operational Headquarters</label>
                  <div className="relative">
                    <MapPin className="absolute left-5 top-5 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <textarea 
                      className="input-field pl-14 py-4 min-h-[100px] font-bold" 
                      value={form.address} 
                      onChange={e => setForm({ ...form, address: e.target.value })} 
                      placeholder="Street, City, ZIP..." 
                    />
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-5 pt-10 border-t border-slate-50">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary shadow-2xl shadow-blue-200 min-w-[180px] flex items-center justify-center gap-3" disabled={loading}>
                   {loading ? (
                     <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                   ) : (
                     <>
                       <ArrowRight size={18} />
                       <span className="uppercase tracking-widest text-xs">{editId ? 'Apply Updates' : 'Confirm Registration'}</span>
                     </>
                   )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
