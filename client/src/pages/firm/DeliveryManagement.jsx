import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { Search, Calendar, Package, Clock, CheckCircle2, TrendingUp, Boxes, Filter, X, ArrowUpDown, MoreHorizontal, Truck, Download, ChevronDown, ChevronUp, FileText, User } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDate, fromDBDate, toDBDate } from '../../utils/dateUtils';
import BillDetailsModal from '../../components/BillDetailsModal';
import MarkCompleteModal from '../../components/MarkCompleteModal';
import OutwardDetailsModal from '../../components/OutwardDetailsModal';

export default function DeliveryManagement() {
  const [entries, setEntries] = useState([]);
  const [capacityInfo, setCapacityInfo] = useState({ capacity: 0, used: 0, available: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Pending');
  const [filterMode, setFilterMode] = useState('ALL'); // ALL, PENDING, COMPLETED
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', search: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'deliveryDate', direction: 'DESC' });
  const { addToast } = useToast();
  const firmProfileRef = useRef(null);

  const [viewBill, setViewBill] = useState(null);
  const [markCompleteEntry, setMarkCompleteEntry] = useState(null);
  const [viewOutwardEntry, setViewOutwardEntry] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [layoutMode, setLayoutMode] = useState('PARTY'); // PARTY, PRODUCT
  const [challanLoading, setChallanLoading] = useState(null); // tracks entry.id being generated

  const toggleRow = (id) => setExpandedRow(prev => prev === id ? null : id);

  // ── Challan PDF Generator ────────────────────────────────────────────────
  const generateChallan = async (entry) => {
    try {
      setChallanLoading(entry.id);

      // 1. Fetch firm profile (cached)
      if (!firmProfileRef.current) {
        firmProfileRef.current = await api.get('/firm/profile');
      }
      const firm = firmProfileRef.current;

      // 2. Determine products to print
      let products = [];
      let transport = { vehicleNo: '', personName: '' };

      if (entry.deliveryStatus === 'Completed') {
        // For completed: fetch actual outward details
        const outwardRows = await api.get(`/firm/outward-details/${entry.id}`);
        // Deduplicate by delivered_product_id and unit_used (sum qty if split deliveries)
        const prodMap = {};
        for (const row of outwardRows) {
          const key = `${row.delivered_product_id}_${row.unit_used || ''}`;
          if (!prodMap[key]) {
            prodMap[key] = {
              name: row.delivered_product_name || row.delivered_product_id,
              qty: 0,
              unit: row.unit_used || '',
            };
          }
          prodMap[key].qty += Number(row.qty_entered != null ? row.qty_entered : row.delivered_qty || 0);
        }
        products = Object.values(prodMap);
        if (outwardRows[0]) {
          transport.vehicleNo  = outwardRows[0].vehicle_no  || '';
          transport.personName = outwardRows[0].person_name || '';
        }
      } else {
        // For pending: use bill items
        products = (entry.items || []).map(i => ({
          name: i.productName || '',
          qty: i.qtyEntered != null ? i.qtyEntered : i.qty || 0,
          unit: i.unitUsed || '',
        }));
      }

      // 3. Build PDF
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const margin = 15;

      // ── Header border ───────────────────────────────────────────────────
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.4);
      doc.rect(margin, 10, pageW - margin * 2, 40);

      // Firm Name (right side, large)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(20, 20, 20);
      doc.text(firm.name || '', pageW - margin, 20, { align: 'right' });

      // GST, Address, Mobile below firm name
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      let firmY = 27;
      if (firm.gst) {
        doc.text(`GST No: ${firm.gst}`, pageW - margin, firmY, { align: 'right' });
        firmY += 5;
      }
      if (firm.address) {
        const addrLines = doc.splitTextToSize(firm.address, 90);
        doc.text(addrLines, pageW - margin, firmY, { align: 'right' });
        firmY += addrLines.length * 4.5;
      }
      if (firm.mobile) {
        doc.text(`Mobile: ${firm.mobile}`, pageW - margin, firmY, { align: 'right' });
      }

      // DELIVERY CHALLAN title (left side)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 120);
      doc.text('DELIVERY CHALLAN', margin + 2, 20);

      // ── Middle section ──────────────────────────────────────────────────
      const midY = 55;
      // Left: Party info
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('To:', margin + 2, midY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(20, 20, 20);
      doc.text(entry.partyName || '—', margin + 2, midY + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      let partyY = midY + 12;
      if (entry.partyGst) {
        doc.text(`GST: ${entry.partyGst}`, margin + 2, partyY);
        partyY += 5;
      }
      if (entry.partyMobile) {
        doc.text(`Mobile: ${entry.partyMobile}`, margin + 2, partyY);
        partyY += 5;
      }

      // Right: Challan meta
      const challanNo = entry.billNo || entry.soId || '—';
      const challanDate = entry.deliveryDate
        ? formatDate(entry.deliveryDate)
        : entry.date
        ? formatDate(entry.date)
        : '—';

      const metaX = pageW / 2 + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);

      const metaRows = [
        ['Challan No:', challanNo],
        ['Date:', challanDate],
        ...(transport.vehicleNo ? [['Vehicle No:', transport.vehicleNo]] : []),
        ...(transport.personName ? [['Transport:', transport.personName]] : []),
        ...(entry.remarkVersion ? [['3rd Party Mob:', entry.remarkVersion]] : []),
      ];
      let mY = midY;
      for (const [label, val] of metaRows) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(80, 80, 80);
        doc.text(label, metaX, mY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(20, 20, 20);
        doc.text(val, metaX + 30, mY);
        mY += 6;
      }

      // ── Product Table ────────────────────────────────────────────────────
      const tableStartY = Math.max(partyY, mY) + 8;
      const tableRows = products.map((p, idx) => [
        idx + 1,
        p.name,
        p.qty,
        p.unit || '',
      ]);

      const totalQty = products.reduce((sum, p) => sum + Number(p.qty || 0), 0);
      tableRows.push(['', 'Sub-Total', totalQty, '']);

      autoTable(doc, {
        startY: tableStartY,
        margin: { left: margin, right: margin },
        head: [['No.', 'Product Description', 'Qty', 'Unit']],
        body: tableRows,
        styles: { fontSize: 8, cellPadding: 3, textColor: [30, 30, 30] },
        headStyles: { fillColor: [40, 40, 120], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 20, halign: 'center' },
        },
        didParseCell(data) {
          // Bold sub-total row
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [245, 245, 255];
          }
        },
        theme: 'grid',
      });

      // ── Narration (below table, before signature) ────────────────────────
      let postTableY = doc.lastAutoTable.finalY + 8;
      if (entry.remark) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(80, 80, 80);
        doc.text('Narration:', margin, postTableY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        const remarkLines = doc.splitTextToSize(entry.remark, pageW - margin * 2 - 20);
        doc.text(remarkLines, margin + 20, postTableY);
        postTableY += remarkLines.length * 4.5 + 4;
      }

      // ── Signature section ────────────────────────────────────────────────
      const sigY = postTableY + 10;
      doc.setDrawColor(180, 180, 180);
      doc.line(margin, sigY, margin + 60, sigY);
      doc.line(pageW - margin - 60, sigY, pageW - margin, sigY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("Receiver's Signature", margin, sigY + 5);
      doc.text('Authorised Signature', pageW - margin - 60, sigY + 5);

      // ── Save ─────────────────────────────────────────────────────────────
      const filename = `Challan_${challanNo || entry.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);

    } catch (err) {
      addToast('Failed to generate challan: ' + err.message, 'error');
    } finally {
      setChallanLoading(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.get('/firm/entries');
      // Show Sale, SO, Book — but exclude SO/Book entries that have been converted (they now appear as SALE)
      const deliveryTypes = ['SALE', 'SO', 'BOOK'];
      setEntries(data.filter(e => deliveryTypes.includes(e.type) && e.status !== 'Converted'));

      const today = new Date().toISOString().split('T')[0];
      const cap = await api.get(`/firm/delivery-info?date=${today}`);
      setCapacityInfo(cap);
    } catch (err) { addToast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'ASC' ? 'DESC' : 'ASC'
    }));
  };

  const filteredAndSorted = useMemo(() => {
    let result = entries.filter(e => {
      const matchTab = activeTab === 'Pending' ? e.deliveryStatus !== 'Completed' : e.deliveryStatus === 'Completed';
      const matchFilterMode = filterMode === 'ALL' || (filterMode === 'PENDING' && e.deliveryStatus !== 'Completed') || (filterMode === 'COMPLETED' && e.deliveryStatus === 'Completed');
      
      const search = filters.search.toLowerCase();
      const itemSearchMatch = e.items?.some(i => i.productName?.toLowerCase().includes(search) || i.remark?.toLowerCase().includes(search));
      const matchSearch = !search || itemSearchMatch || [e.partyName, e.billNo, e.soId, e.type, e.agentName].some(v => v?.toLowerCase().includes(search));
      
      const isoDate = fromDBDate(e.deliveryDate);
      const matchFrom = !filters.dateFrom || isoDate >= filters.dateFrom;
      const matchTo = !filters.dateTo || isoDate <= filters.dateTo;
      
      return matchTab && matchFilterMode && matchSearch && matchFrom && matchTo;
    });

    if (layoutMode === 'PRODUCT') {
      result = result.flatMap(e => (e.items || []).map(item => ({ ...e, item })));
    }

    result.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === 'productName' && layoutMode === 'PRODUCT') {
        valA = a.item?.productName || '';
        valB = b.item?.productName || '';
      } else if (sortConfig.key === 'qty' && layoutMode === 'PRODUCT') {
        valA = Number(a.item?.qty) || 0;
        valB = Number(b.item?.qty) || 0;
      } else {
        valA = valA || '';
        valB = valB || '';
      }
      
      if (sortConfig.key === 'deliveryDate') {
         valA = fromDBDate(valA);
         valB = fromDBDate(valB);
      }
      
      if (valA < valB) return sortConfig.direction === 'ASC' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'ASC' ? 1 : -1;
      return 0;
    });

    return result;
  }, [entries, activeTab, filterMode, filters, sortConfig, layoutMode]);

  const stats = useMemo(() => {
    const today = toDBDate(new Date().toISOString().split('T')[0]);
    const todayEntries = entries.filter(e => e.deliveryDate === today);
    return {
      total: todayEntries.length,
      pending: todayEntries.filter(e => e.deliveryStatus !== 'Completed').length,
      completed: todayEntries.filter(e => e.deliveryStatus === 'Completed').length
    };
  }, [entries]);

  const handleExport = () => {
    const rows = [];
    filteredAndSorted.forEach((e) => {
      const billNo = e.soId || e.poId || e.billNo || '—';
      const agent = e.agentName || 'DIRECT';

      if (layoutMode === 'PARTY') {
        const items = e.items || [];
        if (items.length === 0) {
          rows.push({
            'Delivery Date': formatDate(e.deliveryDate),
            'Type': e.type || '',
            'Bill / Order No': billNo,
            'Party Name': e.partyName || '',
            'Agent': agent,
            '3rd Party Mobile': e.remarkVersion || '',
            'Narration': e.remark || '',
            'Product': '—',
            'Qty': e.totalQty || 0,
            'Delivery Status': e.deliveryStatus || 'Pending',
          });
        } else {
          items.forEach((item, idx) => {
            rows.push({
              'Delivery Date': idx === 0 ? formatDate(e.deliveryDate) : '',
              'Type': idx === 0 ? (e.type || '') : '',
              'Bill / Order No': idx === 0 ? billNo : '',
              'Party Name': idx === 0 ? (e.partyName || '') : '',
              'Agent': idx === 0 ? agent : '',
              '3rd Party Mobile': idx === 0 ? (e.remarkVersion || '') : '',
              'Narration': idx === 0 ? (e.remark || '') : '',
              'Product': item.productName || '—',
              'Qty': item.qty || 0,
              'Delivery Status': idx === 0 ? (e.deliveryStatus || 'Pending') : '',
            });
          });
        }
      } else {
        rows.push({
          'Delivery Date': formatDate(e.deliveryDate),
          'Type': e.type || '',
          'Bill / Order No': billNo,
          'Party Name': e.partyName || '',
          'Agent': agent,
          '3rd Party Mobile': e.remarkVersion || '',
          'Narration': e.remark || '',
          'Product': e.item?.productName || '—',
          'Qty': e.item?.qty || 0,
          'Delivery Status': e.deliveryStatus || 'Pending',
        });
      }
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-width columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2,
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Delivery Product-Wise');
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Delivery_ProductWise_${today}.xlsx`);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="rounded-full w-1.5 h-12 mt-1 bg-blue-600" />
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Delivery Management</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              Orchestrate warehouse logistics and fulfillment
            </p>
          </div>
        </div>

        {/* Capacity Indicator */}
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center gap-8 px-10">
           <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Today's Capacity</span>
              <div className="flex items-center gap-3">
                 <div className="text-2xl font-black text-slate-900">{capacityInfo.available.toLocaleString()} <span className="text-xs text-slate-400 font-bold uppercase tracking-tighter">Available</span></div>
                 <div className="w-px h-6 bg-slate-100" />
                 <div className="text-sm font-bold text-blue-600">{capacityInfo.used.toLocaleString()} <span className="text-[10px] uppercase">Used</span></div>
              </div>
           </div>
           <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <TrendingUp size={24} />
           </div>
        </div>
      </div>

      {/* Summary Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <button 
           onClick={() => { setActiveTab('Pending'); setFilterMode('ALL'); }}
           className={`p-8 rounded-[2.5rem] border-2 transition-all text-left flex items-center justify-between group ${filterMode === 'ALL' ? 'bg-white border-blue-600 shadow-xl shadow-blue-50' : 'bg-white border-slate-50 hover:border-slate-200'}`}
         >
            <div>
               <div className="text-4xl font-black text-slate-900">{stats.total}</div>
               <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Today's Total Workload</div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
               <Package size={28} />
            </div>
         </button>
         <button 
           onClick={() => { setActiveTab('Pending'); setFilterMode('PENDING'); }}
           className={`p-8 rounded-[2.5rem] border-2 transition-all text-left flex items-center justify-between group ${filterMode === 'PENDING' ? 'bg-white border-amber-500 shadow-xl shadow-amber-50' : 'bg-white border-slate-50 hover:border-slate-200'}`}
         >
            <div>
               <div className="text-4xl font-black text-amber-500">{stats.pending}</div>
               <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Awaiting Completion</div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-500 transition-colors">
               <Clock size={28} />
            </div>
         </button>
         <button 
           onClick={() => { setActiveTab('Completed'); setFilterMode('COMPLETED'); }}
           className={`p-8 rounded-[2.5rem] border-2 transition-all text-left flex items-center justify-between group ${filterMode === 'COMPLETED' ? 'bg-white border-emerald-500 shadow-xl shadow-emerald-50' : 'bg-white border-slate-50 hover:border-slate-200'}`}
         >
            <div>
               <div className="text-4xl font-black text-emerald-500">{stats.completed}</div>
               <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Successfully Delivered</div>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
               <CheckCircle2 size={28} />
            </div>
         </button>
      </div>

      {/* Filter & Tab Section */}
      <div className="panel-card !p-8 space-y-8">
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-4">
               <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 w-fit">
                 {['Pending', 'Completed'].map(tab => (
                   <button 
                     key={tab}
                     onClick={() => setActiveTab(tab)}
                     className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                   >
                     {tab} Entries
                   </button>
                 ))}
               </div>

               <div className="bg-slate-100 p-1.5 rounded-2xl flex gap-1 w-fit">
                 <button
                   className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${layoutMode === 'PARTY' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                   onClick={() => setLayoutMode('PARTY')}
                 >
                   Party Wise
                 </button>
                 <button
                   className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${layoutMode === 'PRODUCT' ? 'bg-white text-slate-900 shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                   onClick={() => setLayoutMode('PRODUCT')}
                 >
                   Product Wise
                 </button>
               </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 flex-1 lg:justify-end">
               <div className="relative group flex-1 max-w-md">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-600 transition-colors" size={18} />
                 <input 
                   className="input-field !pl-12 !py-3 font-bold" 
                   placeholder="Search Party, Bill No, Type..." 
                   value={filters.search}
                   onChange={e => setFilters({...filters, search: e.target.value})}
                 />
               </div>
               <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
                  <input type="date" className="bg-transparent border-none outline-none text-xs font-bold px-2 text-slate-600" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} />
                  <span className="text-slate-300">→</span>
                  <input type="date" className="bg-transparent border-none outline-none text-xs font-bold px-2 text-slate-600" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} />
               </div>
               <button 
                 onClick={() => setFilters({ dateFrom: '', dateTo: '', search: '' })}
                 className="p-3 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl transition-colors"
               >
                 <X size={20} />
               </button>
               <button
                 onClick={handleExport}
                 className="btn-secondary flex items-center gap-2 px-5 py-3"
               >
                 <Download size={16} />
                 <span className="text-[10px] font-black uppercase tracking-widest">Export</span>
               </button>
            </div>
          </div>

         {/* Data Table */}
         <div className="overflow-x-auto -mx-8">
            <table className="w-full border-collapse">
               <thead>
                 <tr className="border-y border-slate-50">
                    <th onClick={() => handleSort('deliveryDate')} className="pl-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors">
                       <div className="flex items-center gap-2">Delivery Date <ArrowUpDown size={12} /></div>
                    </th>
                    <th onClick={() => handleSort('type')} className="py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors text-center">
                       <div className="flex items-center justify-center gap-2">Type <ArrowUpDown size={12} /></div>
                    </th>
                    <th className="py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bill / Order No</th>
                    <th className="py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Party Name</th>
                    {layoutMode === 'PRODUCT' && (
                      <th onClick={() => handleSort('productName')} className="py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors">
                         <div className="flex items-center gap-2">Product Description <ArrowUpDown size={12} /></div>
                      </th>
                    )}
                    <th className="py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Agent</th>
                    <th onClick={() => handleSort(layoutMode === 'PARTY' ? 'totalQty' : 'qty')} className="py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer hover:text-blue-600 transition-colors">
                       <div className="flex items-center justify-center gap-2">{layoutMode === 'PARTY' ? 'Total Qty' : 'Qty'} <ArrowUpDown size={12} /></div>
                    </th>
                    <th className="py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                    <th className="pr-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-50">
                  {loading ? (
                    <tr>
                      <td colSpan={layoutMode === 'PARTY' ? 8 : 9} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4">
                           <div className="w-10 h-10 border-4 border-blue-50 border-t-blue-600 rounded-full animate-spin" />
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Synchronizing Registry...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAndSorted.length === 0 ? (
                    <tr>
                      <td colSpan={layoutMode === 'PARTY' ? 8 : 9} className="py-24 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-30">
                           <div className="w-16 h-16 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400">
                              <Filter size={32} />
                           </div>
                           <span className="text-sm font-bold text-slate-400 italic">No entries found for current filters.</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredAndSorted.map((e, index) => {
                    const isExpanded = expandedRow === e.id;
                    const hasItems = (e.items || []).length > 0;
                    if (layoutMode === 'PARTY') {
                      return (
                        <Fragment key={e.id}>
                          <tr
                            className={`group hover:bg-slate-50/50 transition-all cursor-pointer ${isExpanded ? 'bg-blue-50/30' : ''}`}
                            onClick={() => hasItems && toggleRow(e.id)}
                          >
                            <td className="pl-10 py-5 font-black text-slate-900">{formatDate(e.deliveryDate)}</td>
                            <td className="py-5 text-center">
                              <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                e.type === 'SALE' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                e.type === 'SO' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                'bg-emerald-50 text-emerald-600 border-emerald-100'
                              }`}>
                                {e.type}
                              </span>
                            </td>
                            <td className="py-5 font-mono text-xs font-black text-slate-400 group-hover:text-blue-600 transition-colors">{e.soId || e.poId || e.billNo || '—'}</td>
                            <td className="py-5 font-bold text-slate-900">{e.partyName}</td>
                            <td className="py-5 text-slate-600 font-bold">
                               <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-tight">
                                 <User size={12} className="shrink-0" />
                                 {e.agentName || 'DIRECT'}
                                </span>
                            </td>
                            <td className="py-5 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <span className="font-black text-slate-900">{e.totalQty.toLocaleString()}</span>
                                {hasItems && (
                                  <span className="text-slate-300">
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-5 text-center">
                              {e.deliveryStatus === 'Completed' ? (
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                                  <CheckCircle2 size={12} /> Delivered
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-100">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
                                </span>
                              )}
                            </td>
                            <td className="pr-10 py-5 text-right" onClick={evt => evt.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => generateChallan(e)}
                                  disabled={challanLoading === e.id}
                                  title="Download Delivery Challan"
                                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center transition-all disabled:opacity-40"
                                >
                                  {challanLoading === e.id
                                    ? <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                    : <FileText size={16} />}
                                </button>
                                {e.deliveryStatus !== 'Completed' ? (
                                  <button
                                    onClick={() => setMarkCompleteEntry(e)}
                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:scale-105 transition-all"
                                  >
                                    Mark Complete
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setViewOutwardEntry(e)}
                                    className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-all"
                                  >
                                    <Truck size={18} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expandable product list */}
                          {isExpanded && hasItems && (
                            <tr key={`${e.id}-products`}>
                              <td colSpan={8} className="!p-0 bg-blue-50/20">
                                <div className="pl-10 pr-6 py-4 border-t border-blue-100/50">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                        <th className="pb-2 pl-2 w-10">#</th>
                                        <th className="pb-2">Product</th>
                                        <th className="pb-2 text-center w-24">Qty</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50">
                                      {e.items.map((item, idx) => (
                                        <tr key={item.id || idx} className="text-sm">
                                          <td className="py-2 pl-2 text-slate-400 font-bold">#{idx + 1}</td>
                                          <td className="py-2 font-bold text-slate-800">{item.productName}</td>
                                          <td className="py-2 text-center font-black text-slate-900">{item.qty}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {/* Narration footer */}
                                  {(e.remark || e.remarkVersion) && (
                                    <div className="mt-3 pt-3 border-t border-blue-100/50 flex flex-wrap gap-5">
                                      {e.remarkVersion && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">3rd Party Mob:</span>
                                          <span className="text-xs font-bold text-slate-700">{e.remarkVersion}</span>
                                        </div>
                                      )}
                                      {e.remark && (
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">Narration:</span>
                                          <span className="text-xs font-bold text-slate-600 italic">{e.remark}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    } else {
                      return (
                        <tr
                          key={`${e.id}-${e.item?.id || index}`}
                          className="group hover:bg-slate-50/50 transition-all"
                        >
                          <td className="pl-10 py-5 font-black text-slate-900">{formatDate(e.deliveryDate)}</td>
                          <td className="py-5 text-center">
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                              e.type === 'SALE' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                              e.type === 'SO' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                              'bg-emerald-50 text-emerald-600 border-emerald-100'
                            }`}>
                              {e.type}
                            </span>
                          </td>
                          <td className="py-5 font-mono text-xs font-black text-slate-400 group-hover:text-blue-600 transition-colors">{e.soId || e.poId || e.billNo || '—'}</td>
                          <td className="py-5 font-bold text-slate-900">{e.partyName}</td>
                          <td className="py-5 font-black text-blue-600">{e.item?.productName || '—'}</td>
                          <td className="py-5 text-slate-600 font-bold">
                             <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-tight">
                               <User size={12} className="shrink-0" />
                               {e.agentName || 'DIRECT'}
                             </span>
                          </td>
                          <td className="py-5 text-center font-black text-slate-900">
                            {e.item?.qty ?? '—'}
                          </td>
                          <td className="py-5 text-center">
                            {e.deliveryStatus === 'Completed' ? (
                              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-emerald-100">
                                <CheckCircle2 size={12} /> Delivered
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase tracking-widest border border-amber-100">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="pr-10 py-5 text-right" onClick={evt => evt.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => generateChallan(e)}
                                disabled={challanLoading === e.id}
                                title="Download Delivery Challan"
                                className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 flex items-center justify-center transition-all disabled:opacity-40"
                              >
                                {challanLoading === e.id
                                  ? <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                  : <FileText size={16} />}
                              </button>
                              {e.deliveryStatus !== 'Completed' ? (
                                <button
                                  onClick={() => setMarkCompleteEntry(e)}
                                  className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:scale-105 transition-all"
                                >
                                  Mark Complete
                                </button>
                              ) : (
                                <button
                                  onClick={() => setViewOutwardEntry(e)}
                                  className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-all"
                                >
                                  <Truck size={18} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                       );
                     }
                   })}
               </tbody>
            </table>
         </div>
      </div>

      {/* Modals */}
      {viewBill && (
        <BillDetailsModal
          entry={viewBill}
          onClose={() => setViewBill(null)}
        />
      )}

      {markCompleteEntry && (
        <MarkCompleteModal
          entry={markCompleteEntry}
          onClose={() => setMarkCompleteEntry(null)}
          onSuccess={() => { setMarkCompleteEntry(null); fetchData(); }}
        />
      )}

      {viewOutwardEntry && (
        <OutwardDetailsModal
          entry={viewOutwardEntry}
          onClose={() => setViewOutwardEntry(null)}
        />
      )}
    </div>
  );
}
