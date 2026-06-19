import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import {
  Package, LogOut, KeyRound, BarChart3, ShoppingCart, FileText,
  TrendingDown, Users, Boxes, ClipboardList, Database,
  BookOpen, LayoutDashboard, ChevronRight, ChevronDown, Menu, X, ArrowLeft, AlertTriangle
} from 'lucide-react';

const NAV = {
  ADMIN: [
    { group: 'Access Management', items: [
      { label: 'Access Credentials', to: '/admin/credentials', icon: <KeyRound size={20} /> },
      { label: 'Party Master', to: '/admin/parties', icon: <Users size={20} /> },
      { label: 'Product Catalog', to: '/admin/products', icon: <Boxes size={20} /> },
      { label: 'Warehouse Dashboard', to: '/admin/dashboard', icon: <BarChart3 size={20} /> },
    ]},
    { group: 'System', items: [
      { label: 'Backup & Restore', to: '/admin/backup', icon: <Database size={20} /> },
    ]},
  ],
  FIRM: [
    { group: 'Inventory Operations', color: 'bg-blue-600', items: [
      { label: 'Dashboard',         to: '/firm/dashboard',         icon: <LayoutDashboard size={20} /> },
      { label: 'Purchase Entry',    to: '/firm/purchase-entry',    icon: <ShoppingCart size={20} /> },
      { label: 'Purchase Statement',to: '/firm/purchase-statement',icon: <FileText size={20} /> },
      { label: 'Sale Entry',        to: '/firm/sale-entry',        icon: <TrendingDown size={20} /> },
      { label: 'Sale Statement',    to: '/firm/sale-statement',    icon: <FileText size={20} /> },
    ]},
    { group: 'Reports & Management', color: 'bg-amber-500', items: [
      { label: 'SO Statement',      to: '/firm/so-statement',      icon: <ClipboardList size={20} /> },
      { label: 'Book Statement',    to: '/firm/book-statement',    icon: <BookOpen size={20} /> },
      { label: 'Delivery Management', to: '/firm/delivery-management', icon: <Package size={20} /> },
      { label: 'Live Stock',        to: '/firm/live-stock',        icon: <Boxes size={20} /> },
      { label: 'Stock Ledger',      to: '/firm/stock-ledger',      icon: <BarChart3 size={20} /> },
    ]},
    { group: 'Detail', color: 'bg-emerald-500', items: [
      { label: 'Product Catalog',   to: '/firm/products',          icon: <Boxes size={20} /> },
      { label: 'Agent Credentials', to: '/firm/agent-credential',  icon: <Users size={20} /> },
      { label: 'Firm Settings',     to: '/firm/settings',          icon: <KeyRound size={20} /> },
    ]},
  ],
  AGENT: [
    { group: 'Inventory Operations', color: 'bg-blue-600', items: [
      { label: 'SO Entry',       to: '/agent/so-entry',       icon: <ShoppingCart size={20} /> },
      { label: 'Book Entry',     to: '/agent/book-entry',     icon: <BookOpen size={20} /> },
    ]},
    { group: 'Reports & Management', color: 'bg-amber-500', items: [
      { label: 'Dashboard',      to: '/agent/dashboard',      icon: <LayoutDashboard size={20} /> },
      { label: 'SO Statement',   to: '/agent/so-statement',   icon: <ClipboardList size={20} /> },
      { label: 'Book Statement', to: '/agent/book-statement', icon: <FileText size={20} /> },
      { label: 'Live Stock',     to: '/agent/live-stock',     icon: <Boxes size={20} /> },
    ]},
    { group: 'Detail', color: 'bg-emerald-500', items: [
      { label: 'Product Catalog', to: '/agent/products',      icon: <Boxes size={20} /> },
    ]},
  ],
};

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  FIRM:  'Warehouse Firm',
  AGENT: 'Operations Agent',
};

export default function DashboardLayout({ role }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showBackupReminder, setShowBackupReminder] = useState(false);

  const groups = NAV[role] || [];

  // Admin-only: check auto-backup status + trigger first-open backup
  useEffect(() => {
    if (role !== 'ADMIN') return;
    // Trigger first-open-of-day auto backup
    api.post('/admin/backup/check-first-open', {}).catch(() => {});
    // Show reminder if auto-backup is disabled (once per session)
    const dismissed = sessionStorage.getItem('backup_reminder_dismissed');
    if (!dismissed) {
      api.get('/admin/backup/settings')
        .then(s => { if (!s.autoBackupEnabled) setShowBackupReminder(true); })
        .catch(() => {});
    }
  }, [role]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const NavItem = ({ item }) => (
    <NavLink
      to={item.to}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) => `
        flex items-center gap-4 px-5 py-3.5 my-1 transition-all duration-300 group
        rounded-pill-lg font-bold text-[0.93rem]
        ${isActive 
          ? 'bg-blue-600 text-white shadow-md shadow-blue-200 translate-x-1' 
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}
      `}
    >
      <span className={`${isCollapsed ? 'mx-auto' : ''}`}>{item.icon}</span>
      {!isCollapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!isCollapsed && <ChevronRight size={14} className="opacity-0 group-hover:opacity-40" />}
    </NavLink>
  );

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden font-sans">
      {/* Auto-backup reminder popup */}
      {showBackupReminder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-amber-100">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">Auto-Backup is Off</h3>
                <p className="text-xs text-amber-600 font-bold uppercase tracking-widest">Data Protection Warning</p>
              </div>
            </div>
            <p className="text-sm text-slate-500 font-medium mb-6">
              Automatic backups are currently disabled. Your data is not being backed up automatically. Enable auto-backup to protect your data.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { sessionStorage.setItem('backup_reminder_dismissed', '1'); setShowBackupReminder(false); }}
                className="btn-secondary flex-1"
              >
                Remind Later
              </button>
              <button
                onClick={() => { setShowBackupReminder(false); navigate('/admin/backup'); }}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Database size={16} /> Enable Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" 
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-100 
          transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none
          ${isCollapsed ? 'w-24' : 'w-72'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          lg:relative
        `}
      >
        {/* Collapse Toggle (Desktop) */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-10 bg-white border border-slate-100 rounded-full p-1 shadow-sm text-slate-400 hover:text-blue-600 hidden lg:block"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ArrowLeft size={14} />}
        </button>

        {/* Logo Section */}
        <div className={`p-8 mb-6 ${isCollapsed ? 'flex justify-center' : ''}`}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 shrink-0">
              <Package size={26} />
            </div>
            {!isCollapsed && (
              <div>
                <h1 className="text-xl font-black text-slate-900 leading-tight tracking-tighter uppercase whitespace-nowrap">Warehouse</h1>
                <div className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 leading-none mt-1">Industrial SPA</div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Container */}
        <nav className="flex-1 px-4 overflow-y-auto overflow-x-hidden space-y-8 scrollbar-hide">
          {groups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2">
              {!isCollapsed && (
                <div 
                  className="flex items-center justify-between px-4 py-2 cursor-pointer group"
                  onClick={() => toggleGroup(group.group)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-6 rounded-full ${group.color || 'bg-blue-600'}`} />
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{group.group}</span>
                  </div>
                  {expandedGroups[group.group] ? <ChevronDown size={14} className="text-slate-300" /> : <ChevronRight size={14} className="text-slate-300" />}
                </div>
              )}
              
              <div className={`space-y-1 ${!isCollapsed && expandedGroups[group.group] === false ? 'hidden' : 'block'}`}>
                {group.items.map((item, iIdx) => (
                  <NavItem key={iIdx} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 mt-auto border-t border-slate-50">
          {!isCollapsed && (
            <div className="bg-slate-50 rounded-2xl p-4 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center font-black text-blue-600 border border-slate-100 shrink-0">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-black text-slate-900 truncate">{user?.name}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{ROLE_LABELS[role]}</div>
              </div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className={`
              flex items-center gap-4 w-full px-5 py-4 text-red-500 font-black
              rounded-2xl transition-all duration-300 hover:bg-red-50
              ${isCollapsed ? 'justify-center p-0 h-14' : ''}
            `}
          >
            <LogOut size={20} />
            {!isCollapsed && <span className="text-xs uppercase tracking-[0.2em]">Logout System</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Mobile Menu Button (Floating) */}
        <button 
          onClick={() => setMobileOpen(true)}
          className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl z-50 flex items-center justify-center"
        >
          <Menu size={24} />
        </button>

        {/* Content Wrapper */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-10">
          <div className="w-full mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
