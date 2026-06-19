import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, UserPlus, ShieldCheck, Mail, Lock, Eye, EyeOff, Smartphone } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';

const EMPTY = { name: '', email: '', password: '', mobile: '' };

export default function AgentCredential() {
  const { addToast } = useToast();
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [visiblePass, setVisiblePass] = useState({});

  const fetchAgents = async () => {
    try { setAgents(await api.get('/firm/agents')); }
    catch (e) { addToast(e.message, 'error'); }
  };

  useEffect(() => { fetchAgents(); }, []);

  const openAdd = () => { setForm(EMPTY); setEditId(null); setShowModal(true); };
  const openEdit = (a) => { 
    setForm({ name: a.name, email: a.email, password: '', mobile: a.mobile || '' }); 
    setEditId(a.id); 
    setShowModal(true); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.mobile) return addToast('Mobile number is required', 'error');
    setLoading(true);
    try {
      if (editId) {
        await api.put(`/firm/agents/${editId}`, form);
        addToast('Agent credentials updated');
      } else {
        await api.post('/firm/agents', form);
        addToast('New Agent registered successfully');
      }
      setShowModal(false);
      fetchAgents();
    } catch (err) { 
      const msg = err.response?.data?.error || err.message;
      addToast(msg, 'error'); 
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Permanently revoke this Agent access?')) return;
    try {
      await api.delete(`/firm/agents/${id}`);
      addToast('Agent access revoked');
      fetchAgents();
    } catch (e) { addToast(e.message, 'error'); }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="bg-amber-500 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Agent Operations</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Access & credential authority</p>
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-3 shadow-xl shadow-blue-100 self-start md:self-auto">
          <UserPlus size={20} />
          <span>Register New Agent</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="panel-card flex items-center gap-6 group">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 flex items-center justify-center text-amber-600 transition-transform group-hover:scale-110">
            <ShieldCheck size={32} />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900 leading-none">{agents.length}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Authorized Agents</div>
          </div>
        </div>
      </div>

      <div className="panel-card !p-0 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
           <h3 className="text-lg font-black text-slate-900 tracking-tight">Active Agents</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-8">No</th>
                <th>Identity Name</th>
                <th>System Username</th>
                <th>Mobile</th>
                <th>Security Token</th>
                <th className="text-right pr-8">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a, i) => (
                <tr key={a.id} className="group">
                  <td className="pl-8 text-slate-400 font-bold">{i + 1}</td>
                  <td>
                    <div className="flex items-center gap-3">
                       <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 font-black group-hover:bg-amber-500 group-hover:text-white transition-all">
                          {a.name.charAt(0).toUpperCase()}
                       </div>
                       <span className="font-black text-slate-900">{a.name}</span>
                    </div>
                  </td>
                  <td className="font-bold text-slate-500">{a.email}</td>
                  <td className="font-bold text-slate-500">{a.mobile || '—'}</td>
                  <td>
                    <div className="flex items-center gap-3">
                       <div className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-mono font-bold text-slate-700">
                          {visiblePass[a.id] ? (a.passwordHint || '••••••••') : '••••••••'}
                       </div>
                       <button onClick={() => setVisiblePass(p => ({ ...p, [a.id]: !p[a.id] }))} className="text-slate-300 hover:text-blue-600 transition-colors">
                          {visiblePass[a.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                       </button>
                    </div>
                  </td>
                  <td className="pr-8">
                    <div className="flex items-center justify-end gap-2">
                       <button onClick={() => openEdit(a)} className="w-9 h-9 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-all">
                          <Edit2 size={16} />
                       </button>
                       <button onClick={() => handleDelete(a.id)} className="w-9 h-9 rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-all">
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

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-xl bg-white rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="text-3xl font-black text-slate-900 tracking-tighter mb-8">{editId ? 'Edit Credentials' : 'New Agent Registration'}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="field-label">Full Name</label>
                <input className="input-field" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Agent ID Target" />
              </div>
              <div className="space-y-2">
                <label className="field-label">Mobile Number</label>
                <div className="relative group">
                  <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input className="input-field pl-12" required value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="+91 0000 0000" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="field-label">System Username / Email</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input className="input-field pl-12" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="agent@nexus.com" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="field-label">{editId ? 'Reset Token (Optional)' : 'Initial Token'}</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input type="password" className="input-field pl-12" required={!editId} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-6">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel Operation</button>
                <button type="submit" className="btn-primary px-8 shadow-lg shadow-blue-100 min-w-[150px]" disabled={loading}>
                  {loading ? 'Processing...' : (editId ? 'Update Identity' : 'Authorize Agent')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
