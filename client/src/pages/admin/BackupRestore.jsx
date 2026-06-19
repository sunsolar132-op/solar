import { useState, useEffect, useRef } from 'react';
import {
  Database, CheckCircle2, Download, Upload, Clock, ToggleLeft, ToggleRight,
  History, AlertTriangle, RefreshCcw, CloudUpload, HardDrive, ShieldAlert,
  X, FileJson, LogIn, Unplug
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function triggerDownload(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Google Icon SVG ──────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

// ─── Restore Confirm Modal ────────────────────────────────────────────────────
function RestoreModal({ onConfirm, onCancel, loading }) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 border border-red-100">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Restore Database</h2>
            <p className="text-xs font-bold text-red-500 uppercase tracking-widest mt-1">Irreversible Action</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 space-y-2">
          <p className="text-sm font-bold text-red-800 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            All current database data will be permanently deleted and replaced with the backup.
          </p>
          <p className="text-sm font-bold text-red-800 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            You will be automatically logged out after restore completes.
          </p>
        </div>
        <div className="mb-6">
          <label className="field-label mb-2 block">
            Type <span className="text-red-600 font-black">RESTORE</span> to confirm
          </label>
          <input
            className="input-field font-black tracking-widest"
            value={typed}
            onChange={e => setTyped(e.target.value.toUpperCase())}
            placeholder="RESTORE"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <X size={16} /> Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== 'RESTORE' || loading}
            className="btn-danger flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Database size={16} />}
            {loading ? 'Restoring…' : 'Restore Now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BackupRestore() {
  const { addToast } = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [settings, setSettings] = useState(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [frequency, setFrequency] = useState('DAILY');
  const [dailyTime, setDailyTime] = useState('23:00');
  const [savingSettings, setSavingSettings] = useState(false);

  const [backingUp, setBackingUp] = useState(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [restoreSource, setRestoreSource] = useState(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef();

  useEffect(() => { loadSettings(); loadHistory(); }, []);

  // Listen for Google OAuth popup result
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        addToast(`Google account connected: ${e.data.email} ✓`, 'success');
        setConnectingGoogle(false);
        loadSettings();
      } else if (e.data?.type === 'GOOGLE_AUTH_ERROR') {
        addToast(`Google auth failed: ${e.data.reason || 'Unknown error'}`, 'error');
        setConnectingGoogle(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  async function loadSettings() {
    setLoadingSettings(true);
    try {
      const s = await api.get('/admin/backup/settings');
      setSettings(s);
      setAutoEnabled(s.autoBackupEnabled);
      setFrequency(s.frequency || 'DAILY');
      setDailyTime(s.dailyTime || '23:00');
    } catch (e) { addToast(e.message, 'error'); }
    finally { setLoadingSettings(false); }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try { setHistory(await api.get('/admin/backup/history')); }
    catch (e) { addToast(e.message, 'error'); }
    finally { setLoadingHistory(false); }
  }

  // Open Google OAuth popup
  async function connectGoogle() {
    setConnectingGoogle(true);
    try {
      const { url } = await api.get('/admin/backup/google-auth-url');
      const popup = window.open(url, 'google_oauth', 'width=520,height=620,left=200,top=100');
      if (!popup) {
        addToast('Popup blocked! Please allow popups for this site.', 'error');
        setConnectingGoogle(false);
      }
      // Result handled by postMessage listener above
    } catch (e) {
      addToast(e.message, 'error');
      setConnectingGoogle(false);
    }
  }

  async function disconnectGoogle() {
    setDisconnecting(true);
    try {
      await api.post('/admin/backup/disconnect-google', {});
      addToast('Google account disconnected', 'info');
      loadSettings();
    } catch (e) { addToast(e.message, 'error'); }
    finally { setDisconnecting(false); }
  }

  async function saveAutoSettings() {
    setSavingSettings(true);
    try {
      await api.post('/admin/backup/settings', { autoBackupEnabled: autoEnabled, frequency, dailyTime });
      addToast('Auto-backup settings saved', 'success');
      loadSettings();
    } catch (e) { addToast(e.message, 'error'); }
    finally { setSavingSettings(false); }
  }

  async function runManualBackup() {
    setBackingUp(true);
    try {
      const r = await api.post('/admin/backup/run', {});
      triggerDownload(r.data, r.filename);
      addToast('Backup completed successfully ✓', 'success');
      loadSettings(); loadHistory();
    } catch (e) { addToast(e.message, 'error'); }
    finally { setBackingUp(false); }
  }

  async function reDownload(id, createdAt, type) {
    try {
      const data = await api.get(`/admin/backup/download/${id}`);
      triggerDownload(data, `WMS_Backup_${new Date(createdAt).toISOString().replace(/[:.]/g, '-')}_${type}.json`);
    } catch (e) { addToast(e.message, 'error'); }
  }

  async function prepareRestoreFromHistory(id, label) {
    try {
      const data = await api.get(`/admin/backup/download/${id}`);
      setRestoreSource({ data, label });
      setShowRestoreModal(true);
    } catch (e) { addToast(e.message, 'error'); }
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.tables) throw new Error('Invalid format');
        setRestoreSource({ data: parsed, label: file.name });
        setShowRestoreModal(true);
      } catch { addToast('Invalid backup file. Please select a valid WMS backup JSON.', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function doRestore() {
    if (!restoreSource) return;
    setRestoring(true);
    try {
      await api.post('/admin/backup/restore', { data: restoreSource.data });
      addToast('Restore successful! Logging you out…', 'success');
      setShowRestoreModal(false);
      setTimeout(() => { logout(); navigate('/login'); }, 2000);
    } catch (e) { addToast(e.message, 'error'); }
    finally { setRestoring(false); }
  }

  if (loadingSettings) return (
    <div className="flex items-center justify-center py-40">
      <div className="w-8 h-8 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {showRestoreModal && (
        <RestoreModal
          loading={restoring}
          onConfirm={doRestore}
          onCancel={() => { setShowRestoreModal(false); setRestoreSource(null); }}
        />
      )}

      {/* Header */}
      <div className="flex items-start gap-5">
        <div className="bg-violet-600 rounded-full w-1.5 h-12 mt-1" />
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Backup &amp; Restore</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
            Data protection &amp; recovery management
          </p>
        </div>
      </div>

      {/* ── Google Drive Connection ── */}
      <div className="panel-card space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
            <CloudUpload size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Google Drive Connection</h2>
            <p className="text-xs text-slate-400 font-bold">Connect your Google account to enable Drive backups</p>
          </div>
          {settings?.isVerified && (
            <span className="ml-auto flex items-center gap-2 bg-green-50 text-green-700 text-xs font-black px-3 py-1.5 rounded-full border border-green-200">
              <CheckCircle2 size={14} /> Connected
            </span>
          )}
        </div>

        {settings?.isVerified ? (
          /* Connected state */
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-4 bg-green-50 rounded-2xl p-4 flex-1">
              <div className="w-10 h-10 rounded-full bg-white border border-green-200 flex items-center justify-center shrink-0">
                <GoogleIcon />
              </div>
              <div>
                <p className="font-black text-slate-900 text-sm">{settings.googleEmail}</p>
                <p className="text-xs text-green-600 font-bold mt-0.5">Verified — backups will upload here</p>
              </div>
            </div>
            <button
              onClick={disconnectGoogle}
              disabled={disconnecting}
              className="btn-secondary flex items-center gap-2 shrink-0 text-red-500 hover:bg-red-50 border-red-100"
            >
              {disconnecting
                ? <div className="w-4 h-4 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                : <Unplug size={16} />}
              Disconnect
            </button>
          </div>
        ) : (
          /* Not connected state */
          <div className="flex flex-col items-start gap-4">
            {!settings?.googleConfigured && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  Add <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and{' '}
                  <code className="bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> to{' '}
                  <code className="bg-amber-100 px-1 rounded">server/.env</code> to enable Google OAuth.
                </p>
              </div>
            )}
            <button
              onClick={connectGoogle}
              disabled={connectingGoogle || !settings?.googleConfigured}
              className="flex items-center gap-3 bg-white border-2 border-slate-200 hover:border-blue-300 hover:shadow-md rounded-2xl px-6 py-3.5 font-black text-slate-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectingGoogle
                ? <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                : <GoogleIcon />}
              <span>{connectingGoogle ? 'Opening Google…' : 'Continue with Google'}</span>
            </button>
            <p className="text-xs text-slate-400 font-bold">
              A Google sign-in popup will open. Select your account to connect.
            </p>
          </div>
        )}
      </div>

      {/* ── Manual Backup ── */}
      <div className="panel-card space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
            <HardDrive size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Manual Backup</h2>
            <p className="text-xs text-slate-400 font-bold">Export full database and download instantly</p>
          </div>
          {settings?.lastBackupAt && (
            <span className="ml-auto flex items-center gap-2 text-xs text-slate-400 font-bold">
              <Clock size={13} /> Last: {fmt(settings.lastBackupAt)}
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <button
            onClick={runManualBackup}
            disabled={backingUp}
            className="btn-primary flex items-center gap-3 px-8 py-4 disabled:opacity-60 shadow-lg shadow-blue-100"
          >
            {backingUp
              ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Database size={20} />}
            <span className="text-sm font-black">{backingUp ? 'Creating Backup…' : 'Take Backup Now'}</span>
          </button>
          <p className="text-xs text-slate-400 font-bold leading-relaxed">
            Exports all data as JSON, downloads to your device &amp; saves to WMS_Backups/ folder.
          </p>
        </div>
      </div>

      {/* ── Auto Backup Settings ── */}
      <div className="panel-card space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
            <Clock size={20} />
          </div>
          <h2 className="text-lg font-black text-slate-900">Auto Backup Settings</h2>
          <button onClick={() => setAutoEnabled(v => !v)} className="ml-auto flex items-center gap-2">
            {autoEnabled
              ? <ToggleRight size={36} className="text-blue-600" />
              : <ToggleLeft size={36} className="text-slate-300" />}
            <span className={`text-xs font-black uppercase tracking-widest ${autoEnabled ? 'text-blue-600' : 'text-slate-400'}`}>
              {autoEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </button>
        </div>

        <div className={`space-y-6 transition-opacity ${autoEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div>
            <label className="field-label mb-3 block">Backup Frequency</label>
            <div className="flex flex-wrap gap-3">
              {[
                { val: 'DAILY', label: 'Daily (at set time)' },
                { val: 'FIRST_OPEN', label: 'First open of day' },
                { val: 'BOTH', label: 'Both' },
              ].map(opt => (
                <button key={opt.val} onClick={() => setFrequency(opt.val)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-black border-2 transition-all ${
                    frequency === opt.val
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100'
                      : 'bg-white text-slate-500 border-slate-100 hover:border-blue-200'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {(frequency === 'DAILY' || frequency === 'BOTH') && (
            <div>
              <label className="field-label mb-2 block">Daily Backup Time</label>
              <input type="time" className="input-field w-44" value={dailyTime} onChange={e => setDailyTime(e.target.value)} />
            </div>
          )}
        </div>

        <button onClick={saveAutoSettings} disabled={savingSettings}
          className="btn-primary flex items-center gap-2 px-6 disabled:opacity-60">
          {savingSettings && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          Save Settings
        </button>
      </div>

      {/* ── Backup History ── */}
      <div className="panel-card !p-0 overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <History size={18} className="text-slate-400" />
            <h2 className="text-lg font-black text-slate-900">Backup History</h2>
          </div>
          <button onClick={loadHistory} className="btn-secondary flex items-center gap-2 py-2 px-4">
            <RefreshCcw size={14} className={loadingHistory ? 'animate-spin' : ''} />
            <span className="text-[10px] font-black uppercase tracking-widest">Refresh</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="pl-8">Date &amp; Time</th>
                <th>Type</th>
                <th>Size</th>
                <th>Status</th>
                <th>Location</th>
                <th className="pr-8 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <div className="w-6 h-6 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin mx-auto" />
                </td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={6} className="py-16 text-center">
                  <Database size={36} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold text-slate-400">No backups yet</p>
                  <p className="text-xs text-slate-300 mt-1">Take your first backup above</p>
                </td></tr>
              ) : history.map(row => (
                <tr key={row.id} className="group">
                  <td className="pl-8">
                    <div className="flex items-center gap-2">
                      <FileJson size={14} className="text-slate-300 shrink-0" />
                      <span className="font-bold text-sm text-slate-700">{fmt(row.createdAt)}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                      row.type === 'AUTO' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      {row.type === 'AUTO' ? <Clock size={10} className="mr-1" /> : <HardDrive size={10} className="mr-1" />}
                      {row.type}
                    </span>
                  </td>
                  <td className="font-bold text-slate-600 text-sm">{row.sizeLabel}</td>
                  <td>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-green-50 text-green-700">
                      <CheckCircle2 size={10} /> {row.status}
                    </span>
                  </td>
                  <td><span className="text-xs text-slate-400 font-mono truncate max-w-[160px] block">{row.driveLink || '—'}</span></td>
                  <td className="pr-8">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => reDownload(row.id, row.createdAt, row.type)} title="Re-download"
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-100 hover:text-blue-600 flex items-center justify-center transition-all text-slate-500">
                        <Download size={14} />
                      </button>
                      <button onClick={() => prepareRestoreFromHistory(row.id, fmt(row.createdAt))} title="Restore"
                        className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-all text-slate-500">
                        <Upload size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Restore from Local File ── */}
      <div className="panel-card space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-50 pb-5">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
            <LogIn size={20} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900">Restore from Local File</h2>
            <p className="text-xs text-slate-400 font-bold">Upload a WMS backup JSON to restore the database</p>
          </div>
        </div>
        <div
          className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center hover:border-blue-300 transition-colors cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="font-black text-slate-600 text-sm">Click to select backup file</p>
          <p className="text-xs text-slate-400 mt-1">Accepts .json WMS backup files only</p>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileSelect} />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-amber-800 flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            Restoring will permanently overwrite all current data and force a re-login.
          </p>
        </div>
      </div>
    </div>
  );
}
