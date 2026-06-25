import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Eye, EyeOff, Building2, ShieldCheck, Mail, Phone, Lock } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';

const EMPTY = { name: '', email: '', password: '', mobile: '', deliveryCapacity: '' };

export default function AccessCredentials() {
  const { addToast } = useToast();
  const [firms, setFirms] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [visiblePass, setVisiblePass] = useState({});

  const loadFirms = async () => {
    setLoading(true);
    try { setFirms(await api.get('/admin/firms')); }
    catch (e) { addToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadFirms(); }, []);

  const openAdd = () => { setForm(EMPTY); setEditId(null); setShowModal(true); };
  const openEdit = (f) => { 
    setForm({ 
      name: f.name, 
      email: f.email, 
      mobile: f.mobile, 
      deliveryCapacity: f.deliveryCapacity || '', 
      password: '' 
    }); 
    setEditId(f.id); 
    setShowModal(true); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editId) { 
        await api.put(`/admin/firms/${editId}`, form); 
        addToast('Firm Profile Updated!'); 
      }
      else { 
        await api.post('/admin/firms', form); 
        addToast('New Firm Profile Created!'); 
      }
      setShowModal(false); 
      loadFirms();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this firm profile?')) return;
    try { 
      await api.delete(`/admin/firms/${id}`); 
      addToast('Firm profile deleted.'); 
      loadFirms(); 
    } catch (e) { addToast(e.message, 'error'); }
  };

  const togglePass = (id) => {
    setVisiblePass(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* Section Heading */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="bg-blue-600 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Access Credentials</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Administrative Directory Management</p>
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-3 shadow-xl shadow-blue-100 self-start md:self-auto">
          <Plus size={20} />
          <span>Register New Firm</span>
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="panel-card flex items-center gap-6 group hover:border-blue-200 transition-colors">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
            <Building2 size={32} />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 leading-none">{firms.length}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Active Firms</div>
          </div>
        </div>
      </div>

      {/* Data Table Panel */}
      <div className="panel-card overflow-hidden !p-0">
        <div className="px-8 py-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
           <h3 className="text-lg font-black text-slate-900 tracking-tight">Firm Directory</h3>
           <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Real-time Data</div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-20 pl-8">No</th>
                <th>Firm Identity</th>
                <th>Access Email</th>
                <th>Security Token</th>
                <th>Capacity</th>
                <th>Contact</th>
                <th className="text-right pr-8">Management</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1,2,3].map(n => (
                  <tr key={n}>
                    <td className="pl-8"><div className="h-4 w-6 bg-slate-100 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-40 bg-slate-100 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-48 bg-slate-100 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-24 bg-slate-100 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-20 bg-slate-100 rounded animate-pulse" /></td>
                    <td><div className="h-4 w-28 bg-slate-100 rounded animate-pulse" /></td>
                    <td className="pr-8"><div className="h-8 w-20 bg-slate-100 rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))
              ) : firms.map((f, i) => (
                <tr key={f.id} className="group">
                  <td className="pl-8 text-slate-400 font-bold">{i + 1}</td>
                  <td>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                        <Building2 size={18} />
                      </div>
                      <span className="font-black text-slate-900">{f.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 text-slate-500 font-bold">
                      <Mail size={14} className="text-slate-300" />
                      {f.email}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 bg-slate-100 rounded-lg font-mono text-xs text-slate-600 font-bold">
                        {visiblePass[f.id] ? (f.passwordHint || '••••••••') : '••••••••'}
                      </div>
                      <button 
                        onClick={() => togglePass(f.id)}
                        className="text-slate-300 hover:text-blue-600 transition-colors"
                      >
                        {visiblePass[f.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </td>
                   <td>
                    <div className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-xs font-black">
                      {f.deliveryCapacity || 0} Qty/Day
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 text-slate-500 font-bold">
                      <Phone size={14} className="text-slate-300" />
                      {f.mobile}
                    </div>
                  </td>
                  <td className="pr-8">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={() => openEdit(f)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDelete(f.id)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all shadow-sm"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modern High-Fidelity Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
          
          <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            {/* Modal Header */}
            <div className="flex items-start justify-between mb-10">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
                  {editId ? 'Modify Firm Profile' : 'New Operational Entity'}
                </h2>
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-8 h-1 bg-blue-600 rounded-full" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Administrative Protocol</span>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Firm Name */}
                <div className="md:col-span-2">
                  <label className="field-label">Legal Entity Name</label>
                  <div className="relative group">
                    <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input 
                      className="input-field pl-12" 
                      required 
                      value={form.name} 
                      onChange={e => setForm({ ...form, name: e.target.value })} 
                      placeholder="e.g. Global Logistics Inc." 
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label className="field-label">System Access Email</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input 
                      type="email" 
                      className="input-field pl-12" 
                      required 
                      value={form.email} 
                      onChange={e => setForm({ ...form, email: e.target.value })} 
                      placeholder="admin@firm.com" 
                    />
                  </div>
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="field-label">Contact Mobile</label>
                  <div className="relative group">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input 
                      className="input-field pl-12" 
                      required 
                      value={form.mobile} 
                      onChange={e => setForm({ ...form, mobile: e.target.value })} 
                      placeholder="+91 00000 00000" 
                    />
                  </div>
                </div>

                {/* Delivery Capacity */}
                <div>
                  <label className="field-label">Daily Delivery Capacity</label>
                  <div className="relative group">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <input 
                      type="number"
                      className="input-field pl-12" 
                      required 
                      value={form.deliveryCapacity} 
                      onChange={e => setForm({ ...form, deliveryCapacity: e.target.value })} 
                      placeholder="e.g. 1000" 
                    />
                  </div>
                </div>

                {/* Password Fields */}
                <div className="md:col-span-2">
                  <label className="field-label">{editId ? 'Reset Security Token (Optional)' : 'System Password'}</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input 
                      type="password" 
                      className="input-field pl-12" 
                      required={!editId} 
                      value={form.password} 
                      onChange={e => setForm({ ...form, password: e.target.value })} 
                      placeholder="••••••••••••" 
                    />
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-50">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                  Cancel Operation
                </button>
                <button type="submit" className="btn-primary shadow-xl shadow-blue-100 flex items-center gap-3" disabled={saving}>
                  {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {editId ? 'Commit Changes' : 'Execute Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
