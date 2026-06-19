import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ShieldAlert, LogIn, RefreshCcw } from 'lucide-react';
import Login from './Login';
import DashboardLayout from './layouts/DashboardLayout';

// Admin Pages
import AccessCredentials from './pages/admin/AccessCredentials';
import WarehouseDashboard from './pages/admin/WarehouseDashboard';
import ProductManagement from './pages/admin/ProductManagement';
import PartyMaster from './pages/admin/PartyMaster';
import BackupRestore from './pages/admin/BackupRestore';

// Firm Pages
import AgentCredential from './pages/firm/AgentCredential';
import EntryForm from './pages/firm/EntryForm';
import StatementPage from './pages/firm/StatementPage';
import LiveStock from './pages/firm/LiveStock';
import ProfileSettings from './pages/firm/ProfileSettings';
import DeliveryManagement from './pages/firm/DeliveryManagement';
import FirmDashboard from './pages/firm/FirmDashboard';
import StockLedger from './pages/firm/StockLedger';

// Agent Pages
import AgentDashboard from './pages/agent/AgentDashboard';
import AgentEntryForm from './pages/agent/AgentEntryForm';
import AgentStatement from './pages/agent/AgentStatement';
import AgentLiveStock from './pages/agent/AgentLiveStock';

/**
 * ── Forbidden component for multi-tab role changes ──
 */
function Forbidden() {
  const { logout } = useAuth();
  return (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50 p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-red-100 rounded-full blur-[100px] -mt-40 -mr-40 opacity-50" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-100 rounded-full blur-[100px] -mb-40 -ml-40 opacity-50" />
      
      <div className="relative z-10 w-full max-w-xl bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 p-12 md:p-16 text-center border border-slate-100">
        <div className="w-24 h-24 bg-red-50 rounded-3xl flex items-center justify-center text-red-500 mx-auto mb-10 shadow-lg shadow-red-100/50">
          <ShieldAlert size={48} strokeWidth={2.5} />
        </div>
        
        <h1 className="text-5xl font-black text-slate-900 tracking-tighter mb-4">Access Restricted</h1>
        <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-8">Security Protocol Level 4 Active</p>
        
        <p className="text-slate-500 font-medium leading-relaxed mb-12 max-w-sm mx-auto">
          Insufficient role permissions detected. This may occur if your session was updated in another browser tab.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button onClick={() => window.location.reload()} className="btn-secondary w-full sm:w-auto flex items-center justify-center gap-3 py-4">
            <RefreshCcw size={18} />
            <span>Sync Session</span>
          </button>
          <Link to="/login" onClick={logout} className="btn-primary w-full sm:w-auto flex items-center justify-center gap-3 py-4 shadow-xl shadow-blue-100">
            <LogIn size={18} />
            <span>Master Reset</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRole }) {
  const { user, loading } = useAuth();
  
  if (loading) return null;
  
  // If no user or no role, redirect to login
  if (!user || !user.role) return <Navigate to="/login" replace />;
  
  // If role mismatch
  if (allowedRole && user.role !== allowedRole) {
    return <Forbidden />;
  }
  
  return children;
}

// Keyed wrappers to force remount when navigating to same route with new edit state
function KeyedEntryForm(props) {
  const location = useLocation();
  return <EntryForm key={location.key} {...props} />;
}

function KeyedAgentEntryForm(props) {
  const location = useLocation();
  return <AgentEntryForm key={location.key} {...props} />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f0f7ff' }}>
       <div className="w-8 h-8 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const rolePath = user?.role ? `/${user.role.toLowerCase()}` : '/login';

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to={rolePath} replace />} />

      {/* ADMIN */}
      <Route path="/admin" element={<ProtectedRoute allowedRole="ADMIN"><DashboardLayout role="ADMIN" /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/credentials" replace />} />
        <Route path="credentials" element={<AccessCredentials />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="parties" element={<PartyMaster />} />
        <Route path="dashboard" element={<WarehouseDashboard />} />
        <Route path="backup" element={<BackupRestore />} />
      </Route>

      {/* FIRM */}
      <Route path="/firm" element={<ProtectedRoute allowedRole="FIRM"><DashboardLayout role="FIRM" /></ProtectedRoute>}>
        <Route index element={<Navigate to="/firm/dashboard" replace />} />
        <Route path="dashboard" element={<FirmDashboard />} />
        <Route path="purchase-entry" element={<KeyedEntryForm type="PURCHASE" />} />
        <Route path="purchase-statement" element={<StatementPage type="PURCHASE" title="Purchase Master" showAgent={false} />} />
        <Route path="sale-entry" element={<KeyedEntryForm type="SALE" />} />
        <Route path="sale-statement" element={<StatementPage type="SALE" title="Sale Master" showAgent={true} />} />
        <Route path="so-entry" element={<KeyedEntryForm type="SO" />} />
        <Route path="so-statement" element={<StatementPage type="SO" title="SO Statement" showAgent={true} />} />
        <Route path="book-entry" element={<KeyedEntryForm type="BOOK" />} />
        <Route path="book-statement" element={<StatementPage type="BOOK" title="Book Statement" showAgent={true} />} />
        <Route path="delivery-management" element={<DeliveryManagement />} />
        <Route path="live-stock" element={<LiveStock />} />
        <Route path="stock-ledger" element={<StockLedger />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="agent-credential" element={<AgentCredential />} />
        <Route path="settings" element={<ProfileSettings />} />
      </Route>

      {/* AGENT */}
      <Route path="/agent" element={<ProtectedRoute allowedRole="AGENT"><DashboardLayout role="AGENT" /></ProtectedRoute>}>
        <Route index element={<Navigate to="/agent/dashboard" replace />} />
        <Route path="dashboard" element={<AgentDashboard />} />
        <Route path="so-entry" element={<KeyedAgentEntryForm type="SO" />} />
        <Route path="so-statement" element={<AgentStatement type="SO" title="SO Statement" />} />
        <Route path="book-entry" element={<KeyedAgentEntryForm type="BOOK" />} />
        <Route path="book-statement" element={<AgentStatement type="BOOK" title="Book Statement" />} />
        <Route path="live-stock" element={<AgentLiveStock />} />
        <Route path="products" element={<ProductManagement />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <AppRoutes />
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}
