import { useState, useEffect } from 'react';
import { 
  Users, Plus, Search, Edit2, Trash2, ShieldCheck, 
  UserCheck, X, Check, Save, Smartphone, Hash,
  Building2, User
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';

export default function PartyMaster() {
  const { addToast } = useToast();
  const [parties, setParties] = useState([]);
  const [firms, setFirms] = useState([]);
  const [allAgents, setAllAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL'); // 'ALL' | 'SALE' | 'PURCHASE'
  
  // Form State
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', gstNumber: '', mobile: '', category: 'SALE' });
  const [saving, setSaving] = useState(false);

  // Access Control State
  const [accessTarget, setAccessTarget] = useState(null); // { id, name, type: 'FIRM' | 'AGENT' }
  const [selectedAccess, setSelectedAccess] = useState([]); // Array of IDs
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [isSavingAccess, setIsSavingAccess] = useState(false);
  const [accessSearch, setAccessSearch] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pData, fData, aData] = await Promise.all([
        api.get('/admin/parties'),
        api.get('/admin/firms'),
        api.get('/admin/all-agents')
      ]);
      setParties(pData);
      setFirms(fData);
      setAllAgents(aData);
    } catch {
      addToast('System link failure', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveParty = async (e) => {
    e.preventDefault();
    const trimmedName = formData.name.trim();
    if (!trimmedName) return addToast('Identity label required', 'warning');
    
    // Front-end Pre-emptive Duplicate Verification
    const nameConflict = parties.find(p => 
      p.id !== formData.id && p.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameConflict) {
      return addToast('An entity with this name is already registered', 'error');
    }

    const trimmedGst = formData.gstNumber?.trim();
    if (trimmedGst) {
      const gstConflict = parties.find(p => 
        p.id !== formData.id && p.gstNumber && p.gstNumber.trim().toLowerCase() === trimmedGst.toLowerCase()
      );
      if (gstConflict) {
        return addToast(`GST Number is already registered under party "${gstConflict.name}"`, 'error');
      }
    }
    
    setSaving(true);
    try {
      if (formData.id) {
        const updatedParty = await api.put(`/admin/parties/${formData.id}`, formData);
        setParties(parties.map(p => p.id === updatedParty.id ? updatedParty : p));
        addToast('Registry updated');
      } else {
        const newParty = await api.post('/admin/parties', formData);
        setParties([newParty, ...parties]);
        addToast('New entity registered');
      }
      setShowForm(false);
      setFormData({ id: null, name: '', gstNumber: '', mobile: '', category: 'SALE' });
      fetchData();
    } catch (err) {
      addToast(err.message || 'Protocol rejected', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Erase this entity from central registry?')) return;
    try {
      await api.delete(`/admin/parties/${id}`);
      setParties(parties.filter(p => p.id !== id));
      addToast('Identity purged');
    } catch {
      addToast('Deactivation failed', 'error');
    }
  };

  const openAccessModal = async (party, type) => {
    // Prevent opening if already loading access data
    if (isLoadingAccess) return;
    setSelectedAccess([]);
    setAccessSearch('');
    setAccessTarget({ ...party, type });
    setIsLoadingAccess(true);
    try {
      const endpoint = type === 'FIRM' ? `/admin/parties/${party.id}/firms` : `/admin/parties/${party.id}/agents`;
      const currentAccess = await api.get(endpoint);
      setSelectedAccess(currentAccess);
    } catch {
      addToast('Access fetch failed', 'error');
      setAccessTarget(null);
    } finally {
      setIsLoadingAccess(false);
    }
  };

  const handleSaveAccess = async () => {
    if (!accessTarget || isSavingAccess) return;
    setIsSavingAccess(true);
    try {
      const endpoint = accessTarget.type === 'FIRM' ? `/admin/parties/${accessTarget.id}/firms` : `/admin/parties/${accessTarget.id}/agents`;
      const payload = accessTarget.type === 'FIRM' ? { firmIds: selectedAccess } : { agentIds: selectedAccess };
      await api.put(endpoint, payload);
      addToast('Access protocols synchronized');
      setAccessTarget(null);
      setSelectedAccess([]);
    } catch {
      addToast('Sync failure', 'error');
    } finally {
      setIsSavingAccess(false);
    }
  };

  const filteredParties = parties.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
      (p.gstNumber || '').toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'ALL' || (p.category || 'SALE') === categoryFilter;
    return matchSearch && matchCategory;
  });

  const saleCount = parties.filter(p => (p.category || 'SALE') === 'SALE').length;
  const purchaseCount = parties.filter(p => p.category === 'PURCHASE').length;

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <Users size={24} />
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Party Master</h1>
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] pl-15">Central Identity Registry & Access Control</p>
        </div>

        <button 
          onClick={() => { setFormData({ id: null, name: '', gstNumber: '', mobile: '', category: 'SALE' }); setShowForm(true); }}
          className="flex items-center justify-center gap-3 px-8 py-4 bg-slate-900 text-white rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl shadow-slate-200"
        >
          <Plus size={18} />
          <span>Register New Entity</span>
        </button>
      </div>

      {/* Search & Filter Buttons */}
      <div className="flex flex-col lg:flex-row gap-6 items-center">
        {/* Search Bar */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input 
            className="w-full pl-16 pr-8 py-5 bg-white rounded-[2.5rem] border border-slate-100 outline-none focus:border-blue-600 text-sm font-bold shadow-sm transition-all"
            placeholder="Filter entities by name, GST, or mobile..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Sale / Purchase Filter Buttons */}
        <div className="flex gap-3 shrink-0">
          <button
            onClick={() => setCategoryFilter('ALL')}
            className={`flex items-center justify-center h-[60px] gap-2 px-6 rounded-[2rem] font-black text-sm tracking-wide border transition-all ${
              categoryFilter === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xl shadow-slate-200'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            All &nbsp;<span className="bg-black/20 px-2.5 py-1 rounded-full text-[11px] font-bold">{parties.length}</span>
          </button>
          <button
            onClick={() => setCategoryFilter('SALE')}
            className={`flex items-center justify-center h-[60px] gap-2 px-6 rounded-[2rem] font-black text-sm tracking-wide border transition-all ${
              categoryFilter === 'SALE'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xl shadow-emerald-100'
                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-200 hover:text-emerald-700'
            }`}
          >
            Sale &nbsp;<span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${ categoryFilter === 'SALE' ? 'bg-black/20' : 'bg-emerald-100 text-emerald-700'}`}>{saleCount}</span>
          </button>
          <button
            onClick={() => setCategoryFilter('PURCHASE')}
            className={`flex items-center justify-center h-[60px] gap-2 px-6 rounded-[2rem] font-black text-sm tracking-wide border transition-all ${
              categoryFilter === 'PURCHASE'
                ? 'bg-amber-500 text-white border-amber-500 shadow-xl shadow-amber-100'
                : 'bg-white text-slate-600 border-slate-200 hover:border-amber-200 hover:text-amber-700'
            }`}
          >
            Purchase &nbsp;<span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${ categoryFilter === 'PURCHASE' ? 'bg-black/20' : 'bg-amber-100 text-amber-700'}`}>{purchaseCount}</span>
          </button>
        </div>
      </div>

      {/* List Header */}
      <div className="hidden lg:grid grid-cols-12 gap-4 px-10 py-4 bg-slate-900 text-white rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-slate-200 mb-4">
        <div className="col-span-4">Entity Identity</div>
        <div className="col-span-2">GST Identification</div>
        <div className="col-span-2">Mobile Reference</div>
        <div className="col-span-4 text-right">Access Authorization</div>
      </div>

      {/* List Entries */}
      <div className="space-y-3">
        {loading ? (
          [1,2,3,4,5].map(n => <div key={n} className="h-20 bg-slate-50 rounded-3xl animate-pulse" />)
        ) : filteredParties.map(p => (
          <div key={p.id} className="group bg-white rounded-3xl p-6 lg:px-10 border border-slate-100 hover:border-blue-100 hover:shadow-xl hover:shadow-blue-50/50 transition-all duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              
              {/* Identity */}
              <div className="lg:col-span-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 font-black text-lg shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900 truncate group-hover:text-blue-600 transition-colors">{p.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest ${p.category === 'PURCHASE' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {p.category || 'SALE'}
                    </span>
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Registered ID</span>
                  </div>
                </div>
              </div>

              {/* GST */}
              <div className="lg:col-span-2">
                <div className="lg:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">GST Number</div>
                <div className="flex items-center gap-2">
                  <Hash size={14} className="text-slate-200 group-hover:text-blue-200 transition-colors" />
                  <span className="text-xs font-black text-slate-600">{p.gstNumber || 'Unregistered'}</span>
                </div>
              </div>

              {/* Mobile */}
              <div className="lg:col-span-2">
                <div className="lg:hidden text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Mobile Reference</div>
                <div className="flex items-center gap-2">
                  <Smartphone size={14} className="text-slate-200 group-hover:text-blue-200 transition-colors" />
                  <span className="text-xs font-black text-slate-600">{p.mobile || '—'}</span>
                </div>
              </div>

              {/* Access & Actions */}
              <div className="lg:col-span-4 flex items-center justify-end gap-2 lg:gap-4">
                <div className="flex gap-2 mr-2 lg:mr-4 border-r border-slate-50 pr-2 lg:pr-4">
                  <button 
                    onClick={() => openAccessModal(p, 'FIRM')}
                    disabled={isLoadingAccess}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:border-blue-100 transition-all group/btn disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Firm Access"
                  >
                    <ShieldCheck size={16} className="text-slate-300 group-hover/btn:text-blue-600" />
                    <span className="hidden sm:inline text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover/btn:text-blue-600">Firms</span>
                  </button>
                  <button 
                    onClick={() => openAccessModal(p, 'AGENT')}
                    disabled={isLoadingAccess}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-amber-50 hover:border-amber-100 transition-all group/btn disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Agent Access"
                  >
                    <UserCheck size={16} className="text-slate-300 group-hover/btn:text-amber-600" />
                    <span className="hidden sm:inline text-[9px] font-black text-slate-400 uppercase tracking-widest group-hover/btn:text-amber-600">Agents</span>
                  </button>
                </div>

                <div className="flex gap-1">
                  <button onClick={() => { 
                    setFormData({
                      id: p.id,
                      name: p.name,
                      gstNumber: p.gstNumber,
                      mobile: p.mobile,
                      category: p.category || 'SALE'
                    }); 
                    setShowForm(true); 
                  }} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 hover:bg-red-500 hover:text-white transition-all shadow-sm">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

            </div>
          </div>
        ))}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-sm bg-slate-900/40 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Registry Entry</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Configure Central Identity</p>
              </div>
              <button onClick={() => setShowForm(false)} className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
            </div>
            
            <form onSubmit={handleSaveParty} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, category: 'SALE'})}
                  className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${formData.category === 'SALE' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                >
                  Sale Customer
                </button>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, category: 'PURCHASE'})}
                  className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${formData.category === 'PURCHASE' ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                >
                  Purchase Vendor
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Full Identity Name</label>
                <input 
                  autoFocus
                  className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:border-blue-600 text-sm font-bold transition-all"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Acme Corporation Pvt Ltd"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">GST Number</label>
                  <div className="relative flex items-center">
                    <input 
                      className="w-full pl-6 pr-24 py-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:border-blue-600 text-sm font-bold transition-all"
                      value={formData.gstNumber}
                      onChange={e => setFormData({...formData, gstNumber: e.target.value})}
                      placeholder="24AAAAA0000A1Z5"
                    />
                    <a 
                      href="https://services.gst.gov.in/services/searchtp" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="absolute right-3 px-3 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-1"
                    >
                      Verify ↗
                    </a>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">Mobile Number</label>
                  <input 
                    className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:border-blue-600 text-sm font-bold transition-all"
                    value={formData.mobile}
                    onChange={e => setFormData({...formData, mobile: e.target.value})}
                    placeholder="+91 9876543210"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={saving}
                  className="flex-1 py-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
                >
                  {saving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Save size={18} />}
                  <span>Authorize & Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Access Modal */}
      {accessTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-sm bg-slate-900/40 animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
            <div className="p-10 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg ${accessTarget.type === 'FIRM' ? 'bg-blue-600' : 'bg-amber-500'}`}>
                  {accessTarget.type === 'FIRM' ? <Building2 size={24} /> : <User size={24} />}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tighter">{accessTarget.type === 'FIRM' ? 'Firm Access' : 'Agent Access'}</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Assign "{accessTarget.name}" Visibility</p>
                </div>
              </div>
              <button onClick={() => setAccessTarget(null)} className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
            </div>

            {/* Search inside modal */}
            <div className="px-10 pt-6 shrink-0">
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                <input
                  className="w-full pl-12 pr-5 py-3.5 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:border-blue-400 text-sm font-bold transition-all"
                  placeholder={accessTarget.type === 'FIRM' ? 'Search firms...' : 'Search agents...'}
                  value={accessSearch}
                  onChange={e => setAccessSearch(e.target.value)}
                />
              </div>
            </div>
            
            <div className="p-10 overflow-y-auto scrollbar-hide space-y-3">
              {isLoadingAccess ? (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-10 h-10 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fetching Access Data...</p>
                </div>
              ) : accessTarget.type === 'FIRM' ? (
                firms
                  .filter(f => f.name.toLowerCase().includes(accessSearch.toLowerCase()) || (f.email || '').toLowerCase().includes(accessSearch.toLowerCase()))
                  .map(f => {
                  const isSelected = selectedAccess.includes(f.id);
                  return (
                    <div 
                      key={f.id}
                      onClick={() => setSelectedAccess(prev => isSelected ? prev.filter(id => id !== f.id) : [...prev, f.id])}
                      className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all cursor-pointer group ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white' : 'bg-white text-slate-300'}`}>
                          <Building2 size={18} />
                        </div>
                        <div>
                          <div className={`text-sm font-black ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>{f.name}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{f.email}</div>
                        </div>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border border-slate-100'}`}>
                        {isSelected && <Check size={16} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })
              ) : (
                allAgents
                  .filter(a => a.name.toLowerCase().includes(accessSearch.toLowerCase()) || (a.firmName || '').toLowerCase().includes(accessSearch.toLowerCase()) || (a.email || '').toLowerCase().includes(accessSearch.toLowerCase()))
                  .map(a => {
                  const isSelected = selectedAccess.includes(a.id);
                  return (
                    <div 
                      key={a.id}
                      onClick={() => setSelectedAccess(prev => isSelected ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                      className={`flex items-center justify-between p-6 rounded-[2rem] border transition-all cursor-pointer group ${isSelected ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isSelected ? 'bg-amber-500 text-white' : 'bg-white text-slate-300'}`}>
                          <User size={18} />
                        </div>
                        <div>
                          <div className={`text-sm font-black ${isSelected ? 'text-amber-900' : 'text-slate-700'}`}>{a.name}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{a.firmName} — {a.email}</div>
                        </div>
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' : 'bg-white border border-slate-100'}`}>
                        {isSelected && <Check size={16} strokeWidth={3} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-10 bg-slate-50 border-t border-slate-100 shrink-0">
              <button 
                onClick={handleSaveAccess}
                disabled={isSavingAccess || isLoadingAccess}
                className={`w-full py-5 rounded-3xl font-black text-xs uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed ${accessTarget.type === 'FIRM' ? 'bg-blue-600 text-white shadow-blue-100 hover:bg-blue-700' : 'bg-amber-500 text-white shadow-amber-100 hover:bg-amber-600'}`}
              >
                {isSavingAccess
                  ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Save size={18} />}
                <span>{isSavingAccess ? 'Saving...' : 'Save Access Matrix'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
