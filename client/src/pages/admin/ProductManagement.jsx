import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Box, Tag, Layers, Hash, Search, ArrowRight, Info, IndianRupee, Upload, Download, FileSpreadsheet, Power, PowerOff } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';

const EMPTY = { 
  name: '', 
  unit: '', 
  alternateUnit: '', 
  conversionFactor: '1.0', 
  lastSellingPrice: '', 
  ctnPrice: '', 
  openingStockQty: '' 
};

export default function ProductManagement() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [units, setUnits] = useState([]);
  const [showUnitsModal, setShowUnitsModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [customUnit, setCustomUnit] = useState('');
  const [customAltUnit, setCustomAltUnit] = useState('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [importAnalysis, setImportAnalysis] = useState(null); 
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('valid');
  const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });

  const editingProduct = editId ? products.find(p => p.id === editId) : null;
  const isReferenced = editingProduct?.isReferenced || false;

  const showOpeningStock = user?.role === 'FIRM' || user?.role === 'AGENT';

  const fetchItems = async () => {
    try { 
      const data = await api.get('/products');
      setProducts(data); 
    } catch (e) { addToast(e.message, 'error'); }
  };

  const fetchUnits = async () => {
    try {
      const data = await api.get('/units');
      setUnits(data);
    } catch (e) { addToast(e.message, 'error'); }
  };

  useEffect(() => { 
    fetchItems(); 
    fetchUnits();
  }, []);

  const openAdd = () => { 
    setForm(EMPTY); 
    setCustomUnit('');
    setCustomAltUnit('');
    setEditId(null); 
    setShowModal(true); 
  };
  const openEdit = (p) => { 
    setForm({ 
      name: p.name, 
      unit: p.unit || '', 
      alternateUnit: p.alternateUnit || '',
      conversionFactor: p.conversionFactor ?? '1.0',
      lastSellingPrice: p.lastSellingPrice ?? '', 
      ctnPrice: p.ctnPrice ?? '',
      openingStockQty: p.openingStockQty ?? ''
    }); 
    setCustomUnit('');
    setCustomAltUnit('');
    setEditId(p.id); 
    setShowModal(true); 
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return addToast('Product name is required', 'error');
    if (!form.unit.trim()) return addToast('Standard unit is required', 'error');

    let selectedUnit = form.unit;
    if (selectedUnit === 'ADD_NEW') {
      if (!customUnit.trim()) return addToast('Please enter the custom standard unit name', 'error');
      selectedUnit = customUnit.trim().toUpperCase();
      try {
        await api.post('/units', { name: selectedUnit });
        await fetchUnits();
      } catch (err) {
        if (!err.message.includes('already exists')) {
          return addToast(`Failed to register custom unit: ${err.message}`, 'error');
        }
      }
    }

    let selectedAltUnit = form.alternateUnit;
    if (selectedAltUnit === 'ADD_NEW') {
      if (!customAltUnit.trim()) return addToast('Please enter the custom alternate unit name', 'error');
      selectedAltUnit = customAltUnit.trim().toUpperCase();
      try {
        await api.post('/units', { name: selectedAltUnit });
        await fetchUnits();
      } catch (err) {
        if (!err.message.includes('already exists')) {
          return addToast(`Failed to register custom alternate unit: ${err.message}`, 'error');
        }
      }
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name,
        unit: selectedUnit,
        alternateUnit: selectedAltUnit || null,
        conversionFactor: selectedAltUnit ? parseFloat(form.conversionFactor) || 1.0 : 1.0,
        lastSellingPrice: form.lastSellingPrice !== '' && form.lastSellingPrice != null
          ? parseFloat(form.lastSellingPrice)
          : null,
        ctnPrice: form.ctnPrice !== '' && form.ctnPrice != null
          ? parseFloat(form.ctnPrice)
          : null,
        openingStockQty: form.openingStockQty !== '' && form.openingStockQty != null
          ? parseFloat(form.openingStockQty)
          : 0
      };
      if (editId) { 
        await api.put(`/products/${editId}`, payload); 
        addToast('Product Updated Successfully!'); 
      }
      else { 
        await api.post('/products', payload); 
        addToast('New Product Registered!'); 
      }
      setShowModal(false); 
      fetchItems();
    } catch (err) { addToast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    const p = products.find(x => x.id === id);
    if (p?.isReferenced) {
      setAlertModal({
        show: true,
        title: 'Delete Blocked',
        message: `The product "${p.name}" cannot be deleted because it is used in existing transactions. Deleting it would corrupt historical sales, purchase, and stock ledger records.`
      });
      return;
    }
    if (!confirm('Permanently delete this product from the global catalog?')) return;
    try { 
      await api.delete(`/products/${id}`); 
      addToast('Product removed.'); 
      fetchItems(); 
    } catch (e) { addToast(e.message, 'error'); }
  };

  const handleStatusToggle = async (product) => {
    const nextStatus = product.isActive === false;
    try {
      await api.put(`/products/${product.id}/status`, { isActive: nextStatus });
      addToast(`${product.name} marked ${nextStatus ? 'active' : 'deactive'}.`);
      fetchItems();
    } catch (e) {
      addToast(e.message, 'error');
    }
  };

  const downloadSampleExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Product Name*', 'Standard Unit*', 'Alternate Unit', 'Conversion Factor', 'Last Selling Price', 'CTN Price', 'Opening Stock Qty'],
      ['Example Product A', 'KG', 'GRM', '1000', '150', '2000', '50'],
      ['Example Product B', 'PCS', '', '', '25', '', '100'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'product_catalog_template.xlsx');
  };

  const analyzeFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        
        const valid = [], duplicateDB = [], duplicateExcel = [], missingFields = [];
        const seenNames = new Set();
        const dbNames = new Set(products.map(p => p.name.toLowerCase().trim()));
        
        rows.forEach((row, idx) => {
          const hasValues = Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
          if (!hasValues) return;

          const rawName = row['Product Name*'] || row['Product Name'] || '';
          const name = String(rawName).trim();
          const rawUnit = row['Standard Unit*'] || row['Standard Unit'] || '';
          const unit = String(rawUnit).trim();
          const alternateUnit = String(row['Alternate Unit'] || '').trim();
          const conversionFactor = row['Conversion Factor'] !== undefined && row['Conversion Factor'] !== null ? String(row['Conversion Factor']).trim() : '';
          const lastSellingPrice = row['Last Selling Price'] !== undefined && row['Last Selling Price'] !== null ? String(row['Last Selling Price']).trim() : '';
          const ctnPrice = row['CTN Price'] !== undefined && row['CTN Price'] !== null ? String(row['CTN Price']).trim() : '';
          const openingStockQty = row['Opening Stock Qty'] !== undefined && row['Opening Stock Qty'] !== null ? String(row['Opening Stock Qty']).trim() : '';
          
          if (!name || !unit) {
            missingFields.push({ 
              name, 
              unit, 
              alternateUnit, 
              conversionFactor, 
              lastSellingPrice, 
              ctnPrice, 
              openingStockQty, 
              _rowIdx: idx + 2, 
              reason: 'Missing Product Name or Standard Unit' 
            });
            return;
          }
          
          const lowerName = name.toLowerCase();
          if (seenNames.has(lowerName)) {
            duplicateExcel.push({ 
              name, 
              unit, 
              alternateUnit, 
              conversionFactor, 
              lastSellingPrice, 
              ctnPrice, 
              openingStockQty, 
              _rowIdx: idx + 2, 
              reason: 'Duplicate name in the upload file' 
            });
            return;
          }
          seenNames.add(lowerName);
          
          if (dbNames.has(lowerName)) {
            duplicateDB.push({ 
              name, 
              unit, 
              alternateUnit, 
              conversionFactor, 
              lastSellingPrice, 
              ctnPrice, 
              openingStockQty, 
              _rowIdx: idx + 2, 
              reason: 'Product name already exists in database' 
            });
            return;
          }
          
          valid.push({
            name,
            unit,
            alternateUnit,
            conversionFactor,
            lastSellingPrice,
            ctnPrice,
            openingStockQty,
            _rowIdx: idx + 2
          });
        });
        
        setImportAnalysis({ valid, duplicateDB, duplicateExcel, missingFields });
        setSelectedRows(new Set(valid.map((_, i) => i))); 
        setActiveTab('valid');
      } catch (err) {
        addToast(`Failed to parse file: ${err.message}`, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmImport = async () => {
    const toImport = importAnalysis.valid.filter((_, i) => selectedRows.has(i));
    if (toImport.length === 0) return addToast('No products selected for import', 'error');
    
    setImportLoading(true);
    try {
      const res = await api.post('/products/bulk', { products: toImport });
      const imported = res.results.filter(r => r.status === 'imported').length;
      const skipped = res.results.filter(r => r.status === 'skipped').length;
      
      addToast(`${imported} product(s) imported successfully! ${skipped > 0 ? `(${skipped} skipped)` : ''}`);
      setShowImportModal(false);
      setImportAnalysis(null);
      setSelectedRows(new Set());
      fetchItems();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setImportLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      analyzeFile(file);
    } else {
      addToast('Please upload an Excel file (.xlsx or .xls)', 'error');
    }
  };

  const toggleRow = (idx) => {
    const next = new Set(selectedRows);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedRows(next);
  };

  const toggleAll = () => {
    if (selectedRows.size === importAnalysis.valid.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(importAnalysis.valid.map((_, i) => i)));
    }
  };

  const activeCount = products.filter(p => p.isActive !== false).length;
  const inactiveCount = products.length - activeCount;
  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && p.isActive !== false) ||
      (statusFilter === 'DEACTIVE' && p.isActive === false);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Section Heading */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="bg-blue-600 rounded-full w-1.5 h-12 mt-1" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Product Catalog</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">Global inventory definition center</p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-start md:self-auto">
          <button onClick={() => setShowUnitsModal(true)} className="btn-secondary flex items-center gap-3">
            <Tag size={20} />
            <span>Unit Master</span>
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn-secondary flex items-center gap-3 border-blue-200 text-blue-600 hover:bg-blue-50/50">
            <FileSpreadsheet size={20} />
            <span>Import Catalog</span>
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-3 shadow-xl shadow-blue-100">
            <Plus size={20} />
            <span>Register Material</span>
          </button>
        </div>
      </div>

      {/* Control Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 relative group">
           <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
           <input 
             className="input-field pl-14 py-5 bg-white border-transparent shadow-sm focus:shadow-md transition-all font-bold"
             placeholder="Search by name..."
             value={search}
             onChange={e => setSearch(e.target.value)}
           />
        </div>
        <div className="panel-card !py-0 flex items-center gap-4 bg-slate-50 border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-blue-600 shadow-sm">
            <Layers size={18} />
          </div>
          <div>
             <div className="text-xl font-black text-slate-900 leading-none">{products.length}</div>
             <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Total Items</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-2 w-fit">
        {[
          { key: 'ALL', label: 'All', count: products.length },
          { key: 'ACTIVE', label: 'Active', count: activeCount },
          { key: 'DEACTIVE', label: 'Deactive', count: inactiveCount },
        ].map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => setStatusFilter(option.key)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              statusFilter === option.key
                ? 'bg-white text-blue-600 shadow-sm border border-blue-100'
                : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            {option.label} ({option.count})
          </button>
        ))}
      </div>

      {/* Data Table Panel */}
      <div className="panel-card overflow-hidden !p-0 border-slate-100/50">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-20 pl-8 text-center">ID</th>
                <th>Material Details</th>
                <th>Status</th>
                <th>Standard Unit</th>
                <th>Alternate Unit & Conversion</th>
                <th>Last Selling Price</th>
                <th>CTN Price</th>
                {showOpeningStock && <th>Opening Stock Qty</th>}
                <th className="text-right pr-8">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="pl-8 text-center text-slate-400 font-bold">{i + 1}</td>
                  <td>
                    <div className="flex items-center gap-4 py-2">
                      <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                        <Box size={22} />
                      </div>
                      <div>
                        <span className="font-black text-slate-900 block leading-tight">{p.name}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">System ID: {p.id.slice(0,8)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                      p.isActive === false
                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {p.isActive === false ? 'Deactive' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                       <Tag size={14} className="text-slate-300" />
                       <span className="font-black text-slate-700 uppercase translate-y-[1px]">{p.unit || '---'}</span>
                    </div>
                  </td>
                  <td>
                    {p.alternateUnit ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <Tag size={14} className="text-blue-400" />
                          <span className="font-black text-blue-600 uppercase translate-y-[1px]">{p.alternateUnit}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">1 {p.alternateUnit} = {p.conversionFactor} {p.unit}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold text-xs">---</span>
                    )}
                  </td>
                  <td>
                    {p.lastSellingPrice != null && p.lastSellingPrice !== '' ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-lg bg-amber-50 flex items-center justify-center">
                          <IndianRupee size={11} className="text-amber-500" />
                        </div>
                        <span className="font-black text-amber-600">{parseFloat(p.lastSellingPrice).toLocaleString()}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold text-xs">---</span>
                    )}
                  </td>
                  <td>
                    {p.ctnPrice != null && p.ctnPrice !== '' ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-lg bg-purple-50 flex items-center justify-center">
                          <IndianRupee size={11} className="text-purple-500" />
                        </div>
                        <span className="font-black text-purple-600">{parseFloat(p.ctnPrice).toLocaleString()}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold text-xs">---</span>
                    )}
                  </td>
                  {showOpeningStock && (
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-slate-700">{p.openingStockQty != null ? Number(p.openingStockQty).toLocaleString() : 0}</span>
                      </div>
                    </td>
                  )}
                  <td className="pr-8">
                    <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStatusToggle(p)}
                        title={p.isActive === false ? 'Activate product' : 'Deactivate product'}
                        className={`w-10 h-10 flex items-center justify-center rounded-2xl bg-white border transition-all shadow-sm active:scale-95 ${
                          p.isActive === false
                            ? 'text-slate-400 hover:text-emerald-600 border-slate-100 hover:border-emerald-200'
                            : 'text-slate-400 hover:text-amber-600 border-slate-100 hover:border-amber-200'
                        }`}
                      >
                        {p.isActive === false ? <Power size={16} /> : <PowerOff size={16} />}
                      </button>
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
                  <td colSpan={showOpeningStock ? 9 : 8} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                        <Box size={32} />
                      </div>
                      <p className="text-slate-400 font-bold">No materials found in the catalog.</p>
                      <button onClick={openAdd} className="text-blue-600 font-black text-xs uppercase tracking-widest hover:underline">Register your first item</button>
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
          Critical Protocol: This is a global catalog. Changes made here are reflected across all warehouses, agents, and operational ledgers immediately.
        </span>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowModal(false)} />
          
          <div className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl p-10 md:p-14 overflow-hidden animate-in zoom-in-95 fade-in duration-300">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-16 -mt-16 blur-2xl" />

            {/* Modal Header */}
            <div className="flex items-start justify-between mb-12 relative z-10">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">
                  {editId ? 'Update Material' : 'Define Material'}
                </h2>
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-8 h-1 bg-blue-600 rounded-full" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Catalog Specification</span>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all translate-x-4 -translate-y-4">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
              {isReferenced && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-200 text-amber-800 animate-in fade-in duration-300">
                  <Info size={20} className="shrink-0 text-amber-600 mt-0.5" />
                  <span className="text-xs font-bold leading-relaxed">
                    This product is used in existing transactions. Unit and conversion settings cannot be changed to protect historical records.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Product Name */}
                <div className="md:col-span-2 group">
                  <label className="field-label">Legal Material Identity</label>
                  <div className="relative">
                    <Box className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={20} />
                    <input 
                      className="input-field pl-14 font-black text-slate-900" 
                      required 
                      autoFocus
                      value={form.name} 
                      onChange={e => setForm({ ...form, name: e.target.value })} 
                      placeholder="e.g. MS Angle 40x40x5" 
                    />
                  </div>
                </div>

                {/* Base Unit of Measure */}
                <div className="group">
                  <label className="field-label">Base Unit (Standard)</label>
                  <div className="relative">
                    <Tag className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <select 
                      className="input-field pl-14 font-bold font-black text-slate-900" 
                      required
                      value={form.unit} 
                      onChange={e => setForm({ ...form, unit: e.target.value })} 
                      disabled={isReferenced}
                    >
                      <option value="">Select Standard Unit...</option>
                      {units.map(u => (
                        <option key={u.name} value={u.name}>{u.name}</option>
                      ))}
                      <option value="ADD_NEW" className="text-blue-600 font-bold">+ Add Custom Unit...</option>
                    </select>
                  </div>
                  {form.unit === 'ADD_NEW' && (
                    <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
                      <input 
                        type="text"
                        className="input-field pl-5 font-black uppercase text-blue-600 border-blue-200 bg-blue-50/20 placeholder:text-blue-300"
                        placeholder="Enter New Standard Unit (e.g. GRM)"
                        required
                        value={customUnit}
                        onChange={e => setCustomUnit(e.target.value.toUpperCase())}
                      />
                    </div>
                  )}
                </div>

                {/* Alternate Unit Select */}
                <div className="group">
                  <label className="field-label">Alternate Unit (Optional)</label>
                  <div className="relative">
                    <Tag className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                    <select 
                      className="input-field pl-14 font-bold font-black text-slate-900" 
                      value={form.alternateUnit} 
                      onChange={e => setForm({ ...form, alternateUnit: e.target.value })} 
                      disabled={isReferenced}
                    >
                      <option value="">None (Standard Unit only)</option>
                      {units.filter(u => u.name !== form.unit && u.name !== customUnit).map(u => (
                        <option key={u.name} value={u.name}>{u.name}</option>
                      ))}
                      <option value="ADD_NEW" className="text-blue-600 font-bold">+ Add Custom Unit...</option>
                    </select>
                  </div>
                  {form.alternateUnit === 'ADD_NEW' && (
                    <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
                      <input 
                        type="text"
                        className="input-field pl-5 font-black uppercase text-blue-600 border-blue-200 bg-blue-50/20 placeholder:text-blue-300"
                        placeholder="Enter New Alternate Unit (e.g. GRM)"
                        required
                        value={customAltUnit}
                        onChange={e => setCustomAltUnit(e.target.value.toUpperCase())}
                      />
                    </div>
                  )}
                </div>

                {/* Conversion Factor */}
                {(form.alternateUnit) && (
                  <div className="md:col-span-2 group bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col md:flex-row items-center gap-4">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest shrink-0">Conversion Rule:</span>
                    <div className="flex items-center gap-3 font-black text-slate-700">
                      <span>1</span>
                      <span className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 text-xs uppercase font-bold">
                        {form.alternateUnit === 'ADD_NEW' ? (customAltUnit || 'NEW_UNIT') : form.alternateUnit}
                      </span>
                      <span>=</span>
                      <input 
                        type="number"
                        step="any"
                        min="0.0001"
                        className="input-field !py-2 !px-4 w-28 text-center font-bold text-slate-900 border-slate-200 focus:border-blue-500" 
                        required
                        value={form.conversionFactor} 
                        onChange={e => setForm({ ...form, conversionFactor: e.target.value })} 
                        placeholder="e.g. 5"
                        disabled={isReferenced}
                      />
                      <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs uppercase font-bold">
                        {form.unit === 'ADD_NEW' ? (customUnit || 'NEW_UNIT') : (form.unit || '(Standard)')}
                      </span>
                    </div>
                  </div>
                )}


                {/* Last Selling Price */}
                <div className="group">
                  <label className="field-label">Last Selling Price (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-amber-500 transition-colors" size={18} />
                    <input 
                      type="number"
                      step="any"
                      min="0"
                      className="input-field pl-14 font-bold text-amber-600 placeholder:text-slate-300"
                      value={form.lastSellingPrice}
                      onChange={e => setForm({ ...form, lastSellingPrice: e.target.value })}
                      placeholder="e.g. 540"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-wider mt-2 px-1">Reference only — does not auto-fill rate</p>
                </div>

                {/* CTN Price */}
                <div className="group">
                  <label className="field-label">CTN Price (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-purple-500 transition-colors" size={18} />
                    <input 
                      type="number"
                      step="any"
                      min="0"
                      className="input-field pl-14 font-bold text-purple-600 placeholder:text-slate-300"
                      value={form.ctnPrice}
                      onChange={e => setForm({ ...form, ctnPrice: e.target.value })}
                      placeholder="e.g. 6500"
                    />
                  </div>
                  <p className="text-[10px] font-bold text-purple-500/70 uppercase tracking-wider mt-2 px-1">Carton / box price per unit</p>
                </div>

                {/* Opening Stock Qty (only for FIRM or AGENT) */}
                {showOpeningStock && (
                  <div className="group">
                    <label className="field-label">Opening Stock Qty (In Standard Unit)</label>
                    <div className="relative">
                      <Hash className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                      <input 
                        type="number"
                        step="any"
                        className="input-field pl-14 font-bold placeholder:text-slate-300"
                        value={form.openingStockQty}
                        onChange={e => setForm({ ...form, openingStockQty: e.target.value })}
                        placeholder="e.g. 100 (Blank = 0)"
                      />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2 px-1">Initial stock level for your firm</p>
                  </div>
                )}
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
                       <span className="uppercase tracking-widest text-xs">{editId ? 'Commit Changes' : 'Execute Register'}</span>
                     </>
                   )}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unit Master Modal */}
      {showUnitsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setShowUnitsModal(false)} />
          
          <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Unit Master List</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Manage global system units</p>
              </div>
              <button onClick={() => setShowUnitsModal(false)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all">
                <X size={20} />
              </button>
            </div>

            {/* Add Unit Form */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newUnitName.trim()) return;
              try {
                await api.post('/units', { name: newUnitName.trim() });
                addToast('Unit added successfully!');
                setNewUnitName('');
                fetchUnits();
              } catch (err) { addToast(err.message, 'error'); }
            }} className="flex items-center gap-3 mb-8">
              <input 
                className="input-field font-bold uppercase" 
                placeholder="e.g. MTR, KGS, PCS" 
                required
                value={newUnitName}
                onChange={e => setNewUnitName(e.target.value)}
              />
              <button type="submit" className="btn-primary !py-3.5 !px-6 shrink-0 font-bold uppercase tracking-wider text-xs">
                Add Unit
              </button>
            </form>

            {/* List of Units */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {units.map(u => (
                <div key={u.name} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/70 rounded-2xl border border-slate-100 transition-colors">
                  <span className="font-black text-slate-800 uppercase tracking-wider">{u.name}</span>
                  <button 
                    onClick={async () => {
                      if (!confirm(`Delete unit "${u.name}"?`)) return;
                      try {
                        await api.delete(`/units/${encodeURIComponent(u.name)}`);
                        addToast('Unit removed successfully.');
                        fetchUnits();
                      } catch (err) { addToast(err.message, 'error'); }
                    }}
                    className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-slate-400 hover:text-red-500 border border-slate-200/60 shadow-sm active:scale-95 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {units.length === 0 && (
                <div className="py-8 text-center text-slate-400 font-bold text-sm">No units in master list.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertModal.show && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 sm:p-10 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setAlertModal({ show: false, title: '', message: '' })} />
          <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
                <Info size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tighter">{alertModal.title}</h3>
                <p className="text-sm font-bold text-slate-600 mt-2 leading-relaxed">{alertModal.message}</p>
              </div>
            </div>
            <div className="flex justify-end mt-8">
              <button
                onClick={() => setAlertModal({ show: false, title: '', message: '' })}
                className="btn-primary !py-3 !px-6 text-xs uppercase tracking-widest font-black"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => {
            if (!importLoading) {
              setShowImportModal(false);
              setImportAnalysis(null);
            }
          }} />
          
          <div className="relative w-full max-w-5xl bg-white rounded-[3rem] shadow-2xl p-10 md:p-12 overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 fade-in duration-300 animate-in fade-in duration-300">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-16 -mt-16 blur-2xl" />

            {/* Modal Header */}
            <div className="flex items-start justify-between mb-8 relative z-10 shrink-0">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Import Product Catalog</h2>
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-8 h-1 bg-blue-600 rounded-full" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Excel Integration Wizard</span>
                </div>
              </div>
              <button 
                onClick={() => {
                  if (!importLoading) {
                    setShowImportModal(false);
                    setImportAnalysis(null);
                  }
                }} 
                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all translate-x-4 -translate-y-4"
                disabled={importLoading}
              >
                <X size={24} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="relative z-10 overflow-y-auto flex-1 pr-1">
              {!importAnalysis ? (
                /* Upload Step */
                <div className="space-y-8 py-4 animate-in fade-in duration-200">
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-3xl p-12 bg-slate-50/50 hover:bg-blue-50/10 transition-all text-center group cursor-pointer"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('excel-file-input').click()}
                  >
                    <input 
                      type="file" 
                      id="excel-file-input" 
                      className="hidden" 
                      accept=".xlsx, .xls"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) analyzeFile(file);
                      }}
                    />
                    <div className="w-20 h-20 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 mb-6">
                      <Upload size={36} />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Select your Product spreadsheet</h3>
                    <p className="text-sm font-bold text-slate-400 mt-2 max-w-sm">
                      Drag and drop your Excel template here, or click to browse files from your computer. Only .xlsx and .xls are supported.
                    </p>
                  </div>

                  <div className="panel-card bg-slate-50 border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 p-8">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <FileSpreadsheet size={22} />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 leading-tight">Need the Excel Template?</h4>
                        <p className="text-xs font-bold text-slate-400 mt-1">Download our pre-formatted spreadsheet to fill out your product details with correct columns.</p>
                      </div>
                    </div>
                    <button 
                      onClick={downloadSampleExcel} 
                      className="btn-secondary flex items-center gap-3 shrink-0"
                    >
                      <Download size={18} />
                      <span>Download Sample Template</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Analysis & Select Step */
                <div className="space-y-6 animate-in fade-in duration-200">
                  {/* Tabs */}
                  <div className="flex border-b border-slate-100 gap-1 pb-1">
                    {[
                      { key: 'valid', label: 'Valid / Ready to Import', count: importAnalysis.valid.length },
                      { key: 'dupDB', label: 'Already in Catalog', count: importAnalysis.duplicateDB.length },
                      { key: 'dupExcel', label: 'Duplicate in File', count: importAnalysis.duplicateExcel.length },
                      { key: 'missing', label: 'Missing Info', count: importAnalysis.missingFields.length }
                    ].map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setActiveTab(t.key)}
                        className={`px-4 py-3 rounded-t-2xl font-black text-xs uppercase tracking-wider transition-all border-b-2 ${activeTab === t.key ? 'border-blue-600 text-blue-600 bg-slate-50/50' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        {t.label} ({t.count})
                      </button>
                    ))}
                  </div>

                  {/* Tab Contents */}
                  <div className="border border-slate-100 rounded-3xl overflow-hidden bg-white max-h-[40vh] overflow-y-auto">
                    {activeTab === 'valid' && (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 font-black text-[11px] text-slate-500 uppercase tracking-widest sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-4 text-center w-16">
                              <input 
                                type="checkbox"
                                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                checked={importAnalysis.valid.length > 0 && selectedRows.size === importAnalysis.valid.length}
                                onChange={toggleAll}
                              />
                            </th>
                            <th className="px-6 py-4">Row</th>
                            <th className="px-6 py-4">Product Name</th>
                            <th className="px-6 py-4">Std Unit</th>
                            <th className="px-6 py-4">Alt Unit</th>
                            <th className="px-6 py-4 text-center">Factor</th>
                            <th className="px-6 py-4 text-right">LSP (₹)</th>
                            <th className="px-6 py-4 text-right">CTN Price (₹)</th>
                            {showOpeningStock && <th className="px-6 py-4 text-right">Opening Stock</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                          {importAnalysis.valid.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-3 text-center">
                                <input 
                                  type="checkbox"
                                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                                  checked={selectedRows.has(idx)}
                                  onChange={() => toggleRow(idx)}
                                />
                              </td>
                              <td className="px-6 py-3 text-slate-400">#{item._rowIdx}</td>
                              <td className="px-6 py-3 text-slate-900 font-black">{item.name}</td>
                              <td className="px-6 py-3 uppercase">{item.unit}</td>
                              <td className="px-6 py-3 uppercase text-blue-600">{item.alternateUnit || '---'}</td>
                              <td className="px-6 py-3 text-center">{item.conversionFactor || '---'}</td>
                              <td className="px-6 py-3 text-right">{item.lastSellingPrice ? parseFloat(item.lastSellingPrice).toLocaleString() : '---'}</td>
                              <td className="px-6 py-3 text-right">{item.ctnPrice ? parseFloat(item.ctnPrice).toLocaleString() : '---'}</td>
                              {showOpeningStock && <td className="px-6 py-3 text-right">{item.openingStockQty || '0'}</td>}
                            </tr>
                          ))}
                          {importAnalysis.valid.length === 0 && (
                            <tr>
                              <td colSpan={showOpeningStock ? 9 : 8} className="py-12 text-center text-slate-400">No valid products ready for import.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}

                    {activeTab === 'dupDB' && (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 font-black text-[11px] text-slate-500 uppercase tracking-widest sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-4">Row</th>
                            <th className="px-6 py-4">Product Name</th>
                            <th className="px-6 py-4">Std Unit</th>
                            <th className="px-6 py-4">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                          {importAnalysis.duplicateDB.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-3 text-slate-400">#{item._rowIdx}</td>
                              <td className="px-6 py-3 text-slate-900 font-black">{item.name}</td>
                              <td className="px-6 py-3 uppercase">{item.unit}</td>
                              <td className="px-6 py-3">
                                <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-black">
                                  {item.reason}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {importAnalysis.duplicateDB.length === 0 && (
                            <tr>
                              <td colSpan="4" className="py-12 text-center text-slate-400">No duplicates found in catalog database.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}

                    {activeTab === 'dupExcel' && (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 font-black text-[11px] text-slate-500 uppercase tracking-widest sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-4">Row</th>
                            <th className="px-6 py-4">Product Name</th>
                            <th className="px-6 py-4">Std Unit</th>
                            <th className="px-6 py-4">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                          {importAnalysis.duplicateExcel.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-3 text-slate-400">#{item._rowIdx}</td>
                              <td className="px-6 py-3 text-slate-900 font-black">{item.name}</td>
                              <td className="px-6 py-3 uppercase">{item.unit}</td>
                              <td className="px-6 py-3">
                                <span className="px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-black">
                                  {item.reason}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {importAnalysis.duplicateExcel.length === 0 && (
                            <tr>
                              <td colSpan="4" className="py-12 text-center text-slate-400">No duplicate names inside the Excel file.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}

                    {activeTab === 'missing' && (
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 font-black text-[11px] text-slate-500 uppercase tracking-widest sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-4">Row</th>
                            <th className="px-6 py-4">Product Name</th>
                            <th className="px-6 py-4">Std Unit</th>
                            <th className="px-6 py-4">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                          {importAnalysis.missingFields.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-3 text-slate-400">#{item._rowIdx}</td>
                              <td className="px-6 py-3 text-slate-900 font-black">{item.name || '(Blank)'}</td>
                              <td className="px-6 py-3 uppercase">{item.unit || '(Blank)'}</td>
                              <td className="px-6 py-3">
                                <span className="px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-black">
                                  {item.reason}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {importAnalysis.missingFields.length === 0 && (
                            <tr>
                              <td colSpan="4" className="py-12 text-center text-slate-400">No missing fields found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {activeTab === 'valid' && (
                    <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-400 px-2 animate-in fade-in">
                      <div>
                        Selected: <span className="text-blue-600 font-black text-sm">{selectedRows.size}</span> of {importAnalysis.valid.length}
                      </div>
                      <div className="flex gap-4">
                        <button type="button" onClick={() => setSelectedRows(new Set(importAnalysis.valid.map((_, i) => i)))} className="text-blue-600 hover:underline">Select All</button>
                        <button type="button" onClick={() => setSelectedRows(new Set())} className="text-slate-500 hover:underline">Deselect All</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-8 border-t border-slate-50 mt-auto shrink-0 relative z-10">
              {importAnalysis ? (
                <button 
                  type="button" 
                  onClick={() => setImportAnalysis(null)} 
                  className="btn-secondary"
                  disabled={importLoading}
                >
                  Upload Different File
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowImportModal(false);
                    setImportAnalysis(null);
                  }} 
                  className="btn-secondary"
                  disabled={importLoading}
                >
                  Close
                </button>
                {importAnalysis && (
                  <button 
                    onClick={handleConfirmImport} 
                    className="btn-primary shadow-2xl shadow-blue-200 min-w-[200px] flex items-center justify-center gap-3" 
                    disabled={importLoading || selectedRows.size === 0}
                  >
                     {importLoading ? (
                       <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                     ) : (
                       <>
                         <ArrowRight size={18} />
                         <span className="uppercase tracking-widest text-xs">Confirm Import ({selectedRows.size})</span>
                       </>
                     )}
                   </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
