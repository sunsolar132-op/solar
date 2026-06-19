/**
 * BillPrintUtil.js
 * Generates a clean delivery bill / challan and opens it in a new tab for printing.
 * Fields: Date, Delivery Date, Bill No, Agent, Party Name/Mobile/GST,
 *         Product details (Name, Rate, Amount), Vehicle No, Transport ID, Driver Name, Driver Mobile
 */

import { formatDate } from './dateUtils';
import api from '../api';

/**
 * Fetches outward/transport details then opens the print window.
 * @param {object} entry       - Transaction entry from StatementPage
 * @param {object} firmProfile - Logged-in firm info { name, gst, address, mobile }
 */
export async function printBillAsGSTInvoice(entry, firmProfile = {}) {
  // Fetch transport details from outward_details if delivery is complete
  let transport = { vehicleNo: '', transportId: '', personName: '', mobile: '' };
  if (entry.deliveryStatus === 'Completed') {
    try {
      const rows = await api.get(`/firm/outward-details/${entry.id}`);
      if (rows && rows.length > 0) {
        transport = {
          vehicleNo:   rows[0].vehicle_no    || '',
          transportId: rows[0].transport_id  || '',
          personName:  rows[0].person_name   || '',
          mobile:      rows[0].mobile        || '',
        };
      }
    } catch (_) { /* transport info optional */ }
  }

  const billRef   = entry.soId || entry.billNo || entry.id?.slice(0, 8).toUpperCase();
  const billDate  = formatDate(entry.date);
  const delivDate = formatDate(entry.deliveryDate) || '—';
  const items     = entry.items || [];

  const sellerName = firmProfile.name || 'YOUR COMPANY';
  const sellerGST  = firmProfile.gst  || '';

  const totalAmount = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  // ── number to words ──────────────────────────────────────────────
  function numToWords(n) {
    const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
                'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                'Seventeen','Eighteen','Nineteen'];
    const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    if (n === 0) return 'Zero';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n/10)] + (n % 10 ? ' ' + a[n%10] : '');
    if (n < 1000) return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + numToWords(n%100) : '');
    if (n < 100000) return numToWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + numToWords(n%1000) : '');
    if (n < 10000000) return numToWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + numToWords(n%100000) : '');
    return numToWords(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + numToWords(n%10000000) : '');
  }

  const amountWords = numToWords(Math.round(totalAmount)) + ' Only';

  // ── product rows ─────────────────────────────────────────────────
  const productRowsHTML = items.map((item, idx) => {
    const qtyStr = item.qtyEntered != null && item.unitUsed
      ? `${item.qtyEntered} ${item.unitUsed}`
      : `${item.qty}`;
    return `
    <tr>
      <td class="sno">${idx + 1}</td>
      <td class="desc">${item.productName || '—'}</td>
      <td class="center">${qtyStr}</td>
      <td class="right">₹${Number(item.rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="right amt">₹${Number(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Bill — ${billRef}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:14mm}
    @page{size:A4;margin:10mm}
    @media print{body{padding:0}.no-print{display:none!important}}

    .print-btn{
      position:fixed;top:14px;right:14px;
      background:#1d4ed8;color:#fff;border:none;border-radius:8px;
      padding:10px 22px;font-size:13px;font-weight:bold;cursor:pointer;
      box-shadow:0 4px 14px rgba(29,78,216,.3);
    }
    .print-btn:hover{background:#1e40af}

    /* ── Outer wrapper ── */
    .bill{border:2px solid #111;width:100%}

    /* ── Company header ── */
    .co-header{
      text-align:center;padding:10px 12px 8px;
      border-bottom:2px solid #111;
    }
    .co-name{font-size:20px;font-weight:900;letter-spacing:1px;color:#1a3c8f}
    .co-sub{font-size:11px;color:#555;margin-top:2px}
    .bill-title{
      font-size:13px;font-weight:bold;letter-spacing:2px;
      background:#1a3c8f;color:#fff;padding:5px 0;text-align:center;
    }

    /* ── Info blocks ── */
    .info-row{display:flex;border-bottom:1px solid #ccc}
    .info-block{flex:1;padding:8px 12px;border-right:1px solid #ccc}
    .info-block:last-child{border-right:none}
    .lbl{font-size:9px;font-weight:bold;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:2px}
    .val{font-size:12px;font-weight:bold;color:#111}
    .val-lg{font-size:15px;font-weight:900;color:#1a3c8f}

    /* ── Party section ── */
    .party-section{
      display:flex;border-bottom:1px solid #ccc;
    }
    .party-block{flex:1;padding:10px 12px;border-right:1px solid #ccc}
    .party-block:last-child{border-right:none}
    .party-name{font-size:15px;font-weight:900;color:#111;margin-bottom:4px}
    .party-detail{font-size:11px;color:#444;margin-top:2px}
    .party-detail .lbl{display:inline;font-size:10px}

    /* ── Product table ── */
    .product-section{border-bottom:1px solid #ccc}
    table{width:100%;border-collapse:collapse}
    thead tr{background:#1a3c8f;color:#fff}
    thead th{padding:7px 10px;text-align:left;font-size:11px;font-weight:bold;letter-spacing:.3px}
    thead th.center{text-align:center}
    thead th.right{text-align:right}
    tbody td{padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;vertical-align:top}
    tbody tr:last-child td{border-bottom:none}
    tbody tr:nth-child(even) td{background:#f9f9f9}
    td.sno{width:40px;text-align:center;color:#888;font-weight:bold}
    td.desc{font-weight:bold}
    td.center{text-align:center}
    td.right{text-align:right}
    td.amt{font-weight:900;color:#111}

    /* ── Total bar ── */
    .total-bar{
      display:flex;justify-content:space-between;align-items:center;
      padding:10px 14px;background:#f0f4ff;border-bottom:1px solid #ccc;
    }
    .words{font-size:11px;font-style:italic;color:#555;flex:1}
    .total-amt{font-size:18px;font-weight:900;color:#1a3c8f}

    /* ── Transport row ── */
    .transport-row{
      display:flex;border-bottom:1px solid #ccc;background:#fafafa;
    }
    .transport-block{flex:1;padding:8px 12px;border-right:1px solid #ccc}
    .transport-block:last-child{border-right:none}

    /* ── Footer ── */
    .footer-row{display:flex}
    .footer-left{flex:1;padding:12px;border-right:1px solid #ccc;font-size:10px;color:#555}
    .footer-left ol{padding-left:14px;line-height:1.8}
    .footer-sign{width:220px;padding:12px;text-align:center}
    .sign-box{border-top:1px solid #999;margin-top:40px;padding-top:6px;font-size:10px;color:#555}
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>

  <div class="bill">

    <!-- ══ COMPANY HEADER ══ -->
    <div class="co-header">
      <div class="co-name">${sellerName}</div>
      ${sellerGST ? `<div class="co-sub">GSTIN: ${sellerGST}</div>` : ''}
    </div>
    <div class="bill-title">DELIVERY CHALLAN / TAX INVOICE</div>

    <!-- ══ BILL META ROW ══ -->
    <div class="info-row">
      <div class="info-block">
        <span class="lbl">Bill / Invoice No.</span>
        <div class="val-lg">${billRef}</div>
      </div>
      <div class="info-block">
        <span class="lbl">Bill Date</span>
        <div class="val">${billDate}</div>
      </div>
      <div class="info-block">
        <span class="lbl">Delivery Date</span>
        <div class="val">${delivDate}</div>
      </div>
      <div class="info-block">
        <span class="lbl">Agent Name</span>
        <div class="val">${entry.agentName || 'DIRECT'}</div>
      </div>
      ${entry.deliveryStatus ? `
      <div class="info-block">
        <span class="lbl">Delivery Status</span>
        <div class="val" style="color:${entry.deliveryStatus === 'Completed' ? '#059669' : '#d97706'}">${entry.deliveryStatus}</div>
      </div>` : ''}
    </div>

    <!-- ══ PARTY DETAILS ══ -->
    <div class="party-section">
      <div class="party-block">
        <span class="lbl">Bill To / Party Name</span>
        <div class="party-name">${entry.partyName || '—'}</div>
        <div class="party-detail"><span class="lbl">Mobile No: </span><b>${entry.partyMobile || '—'}</b></div>
        <div class="party-detail"><span class="lbl">GST No: </span><b>${entry.partyGst || '—'}</b></div>
      </div>
      ${entry.remarkVersion ? `
      <div class="party-block" style="max-width:180px">
        <span class="lbl">Third Party Mobile No</span>
        <div class="val">${entry.remarkVersion}</div>
      </div>` : ''}
    </div>

    <!-- ══ PRODUCT TABLE ══ -->
    <div class="product-section">
      <table>
        <thead>
          <tr>
            <th class="center" style="width:40px">S.No</th>
            <th>Product Name</th>
            <th class="center" style="width:70px">Qty</th>
            <th class="right" style="width:110px">Rate (₹)</th>
            <th class="right" style="width:130px">Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${productRowsHTML || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#aaa">No items</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- ══ TOTAL + AMOUNT IN WORDS ══ -->
    <div class="total-bar">
      <div class="words"><b>Amount in Words:</b> ${amountWords}</div>
      <div class="total-amt">Total: ₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
    </div>

    <!-- ══ TRANSPORT / VEHICLE DETAILS ══ -->
    <div style="padding:6px 12px;background:#e8edf8;border-bottom:1px solid #ccc">
      <span style="font-size:10px;font-weight:bold;color:#1a3c8f;text-transform:uppercase;letter-spacing:1px">
        🚛 Transport / Vehicle Details
      </span>
    </div>
    <div class="transport-row">
      <div class="transport-block">
        <span class="lbl">Vehicle No.</span>
        <div class="val">${transport.vehicleNo || '—'}</div>
      </div>
      <div class="transport-block">
        <span class="lbl">Transport ID / LR No.</span>
        <div class="val">${transport.transportId || '—'}</div>
      </div>
      <div class="transport-block">
        <span class="lbl">Driver Name</span>
        <div class="val">${transport.personName || '—'}</div>
      </div>
      <div class="transport-block">
        <span class="lbl">Driver / Vehicle Contact No.</span>
        <div class="val">${transport.mobile || '—'}</div>
      </div>
    </div>

    <!-- ══ FOOTER ══ -->
    <div class="footer-row">
      <div class="footer-left">
        <b>Terms &amp; Conditions:</b>
        <ol>
          <li>E. &amp; O.E.</li>
          <li>All disputes subject to local jurisdiction.</li>
          <li>Goods once sold will not be taken back.</li>
          <li>Payment due as per agreed terms.</li>
        </ol>
      </div>
      <div class="footer-sign">
        <div style="font-size:11px;font-weight:bold">${sellerName}</div>
        <div class="sign-box">Authorised Signatory</div>
      </div>
    </div>

  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    alert('Pop-up blocked! Please allow pop-ups for this site to print bills.');
  }
}
