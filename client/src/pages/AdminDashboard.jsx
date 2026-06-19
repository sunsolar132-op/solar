import { useState } from 'react';
import { Building2, Edit2, Trash2, PlusCircle, CheckCircle } from 'lucide-react';

export default function AdminDashboard() {
  const [firms, setFirms] = useState([
    { id: '1', name: 'Surat Warehouse', email: 'surat@firm.com', mobile: '9988776655', password: '***' }
  ]);
  
  const [formData, setFormData] = useState({ name: '', email: '', mobile: '', password: '' });
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setFirms([...firms, { id: Date.now().toString(), ...formData }]);
    setFormData({ name: '', email: '', mobile: '', password: '' });
    
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div>
      {showToast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', 
          background: 'var(--success)', color: 'white',
          padding: '12px 24px', borderRadius: '8px',
          display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
          zIndex: 100, animation: 'fadeIn 0.3s ease'
        }}>
          <CheckCircle size={20} /> Firm Created Successfully
        </div>
      )}

      <div className="glass-card" style={{ marginBottom: '32px' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <Building2 size={24} color="var(--accent-primary)" />
          Create New Firm
        </h3>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Firm / Warehouse Name</label>
            <input type="text" className="glass-input" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Email ID (Login ID)</label>
            <input type="email" className="glass-input" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Password</label>
            <input type="password" className="glass-input" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} required />
          </div>
          <div className="input-group" style={{ marginBottom: 0 }}>
            <label className="input-label">Mobile Number</label>
            <input type="text" className="glass-input" value={formData.mobile} onChange={(e) => setFormData({...formData, mobile: e.target.value})} required />
          </div>
          <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button type="submit" className="btn btn-primary">
              <PlusCircle size={18} /> Add Firm
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card table-container">
        <h3 style={{ marginBottom: '24px' }}>Existing Firms</h3>
        <table className="glass-table">
          <thead>
            <tr>
              <th>Firm Name</th>
              <th>Login ID (Email)</th>
              <th>Mobile</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {firms.map(firm => (
              <tr key={firm.id}>
                <td style={{ fontWeight: 500 }}>{firm.name}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{firm.email}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{firm.mobile}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-outline" style={{ padding: '6px 12px', marginRight: '8px' }}>
                    <Edit2 size={16} /> Edit
                  </button>
                  <button className="btn btn-danger" style={{ padding: '6px 12px' }}>
                    <Trash2 size={16} /> Delete
                  </button>
                </td>
              </tr>
            ))}
            {firms.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '32px' }}>
                  <p>No firms added yet.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
