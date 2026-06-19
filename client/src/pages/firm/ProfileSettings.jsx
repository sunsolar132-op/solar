import { useState, useEffect } from 'react';
import { ShieldCheck, Save, Building2, Mail, Phone } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';

export default function ProfileSettings() {
  const { addToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const data = await api.get('/firm/profile');
      setProfile(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      console.log('Firm UI: Updating profile settings', { deliveryCapacity: profile.deliveryCapacity });
      await api.put('/firm/profile', { deliveryCapacity: profile.deliveryCapacity });
      addToast('Delivery capacity updated successfully!');
    } catch (err) {
      console.error('Firm UI: Update FAILED', err.message);
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div className="flex items-start gap-5">
        <div className="bg-amber-500 rounded-full w-1.5 h-12 mt-1" />
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Firm Settings</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Manage your warehouse logistics & profile</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Info Card (Read Only) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="panel-card bg-slate-900 text-white border-none shadow-2xl shadow-slate-200">
            <div className="w-16 h-16 rounded-3xl bg-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
              <Building2 size={32} />
            </div>
            <h3 className="text-xl font-black tracking-tight mb-1">{profile?.name}</h3>
            <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-6">Registered Warehouse Entity</p>
            
            <div className="space-y-4 pt-6 border-t border-white/10">
              <div className="flex items-center gap-3">
                <Mail size={16} className="text-slate-500" />
                <span className="text-sm font-bold text-slate-300">{profile?.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone size={16} className="text-slate-500" />
                <span className="text-sm font-bold text-slate-300">{profile?.mobile}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Form */}
        <div className="lg:col-span-2">
          <div className="panel-card">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Logistics Configuration</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Define your operational limits</p>
              </div>

              <div className="grid grid-cols-1 gap-8 pt-4">
                <div className="group">
                  <label className="field-label">Daily Delivery Capacity (Qty/Day)</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input 
                      type="number" 
                      className="input-field pl-12 font-black text-blue-600" 
                      value={profile?.deliveryCapacity || ''} 
                      onChange={e => setProfile({ ...profile, deliveryCapacity: e.target.value })}
                      placeholder="e.g. 1000"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 ml-1">
                    This limit is used to provide warnings on all entry forms for selected delivery dates.
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-50 flex justify-end">
                <button 
                  type="submit" 
                  disabled={saving}
                  className="btn-primary flex items-center gap-3 shadow-xl shadow-blue-100 px-10"
                >
                  {saving ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : <Save size={20} />}
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
