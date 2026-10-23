/**
 * ระบบสต๊อกปลาหมึก (Squid Inventory Management System)
 * High-performance, offline-first client application
 */

// ⭐ Web App URL ของคุณ (เชื่อมต่อกับ Google Sheet)
const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby_KIXPbaAikCBEW9CEmV6vPSnYQApZY_N0IBalSFP3PB1iyEoDvgjXXVFsPgEWQERE6w/exec';

// ================= APP STATE =================
const STATE = {
  apiUrl: DEFAULT_WEB_APP_URL,
  currentTab: 'tab-stockin',
  inFilterRange: 'today',
  outFilterRange: 'today',
  inSearchQuery: '',
  outSearchQuery: '',
  stockIn: [],
  stockOut: [],
  suppliers: {},
  customers: {},
  defaultPrices: {
    'หมึกหอม': 260,
    'หมึกกระดอง': 220,
    'หมึกกล้วย': 180
  }
};

// ================= STORAGE HELPERS =================
function loadLocalData() {
  // ล้างข้อมูลเก่าหรือข้อมูลทดสอบที่เคยค้างในเบราว์เซอร์
  localStorage.removeItem('squid_data_v1');
  localStorage.removeItem('squid_use_demo');

  const cached = localStorage.getItem('squid_data_v2');
  if (cached) {
    try {
      const data = JSON.parse(cached);
      STATE.stockIn = data.stockIn || [];
      STATE.stockOut = data.stockOut || [];
      STATE.customers = data.customers || {};
      STATE.suppliers = data.suppliers || {};
      return;
    } catch (e) {
      console.error('Failed to parse cache', e);
    }
  }

  // เริ่มต้นว่างเปล่า 100%
  STATE.stockIn = [];
  STATE.stockOut = [];
  STATE.customers = {};
  STATE.suppliers = {};
}

function saveLocalData() {
  localStorage.setItem('squid_data_v2', JSON.stringify({
    stockIn: STATE.stockIn,
    stockOut: STATE.stockOut,
    customers: STATE.customers,
    suppliers: STATE.suppliers
  }));
}

// ================= DATE HELPERS =================
function parseDate(ts) {
  return new Date(ts);
}

function formatDateThai(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: '2-digit'
  }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function getFilterRangeBounds(rangeType) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (rangeType === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (rangeType === 'week') {
    // นับวันจันทร์-อาทิตย์
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1) - day;
    start.setDate(now.getDate() + diffToMon);
    start.setHours(0, 0, 0, 0);
    
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (rangeType === 'month') {
    // นับวันที่ 1 ของเดือน
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (rangeType === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  } else {
    return { start: new Date(0), end: new Date(2100, 0, 1) };
  }

  return { start, end };
}

function isDateInRange(ts, rangeType) {
  if (rangeType === 'all') return true;
  const target = new Date(ts);
  const { start, end } = getFilterRangeBounds(rangeType);
  return target >= start && target <= end;
}

function formatCurrency(num) {
  return '฿' + Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatWeight(num) {
  return Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

// ================= UI NOTIFICATIONS =================
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

// ================= NAVIGATION =================
function initNavigation() {
  const navBtns = document.querySelectorAll('.bottom-nav .nav-item');
  const panels = document.querySelectorAll('.tab-panel');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab === STATE.currentTab) return;

      navBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
      STATE.currentTab = targetTab;

      renderCurrentTab();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ================= TAB 1: รับเข้า (Stock In) =================
function initStockInEvents() {
  const searchInput = document.getElementById('inSearchSupplier');
  const clearBtn = document.getElementById('inClearSearch');

  searchInput.addEventListener('input', (e) => {
    STATE.inSearchQuery = e.target.value.trim().toLowerCase();
    clearBtn.classList.toggle('visible', !!STATE.inSearchQuery);
    renderStockInList();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    STATE.inSearchQuery = '';
    clearBtn.classList.remove('visible');
    renderStockInList();
  });

  const dateChips = document.querySelectorAll('#inDateFilters .chip');
  dateChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dateChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      STATE.inFilterRange = chip.getAttribute('data-range');
      document.getElementById('inFilterLabel').textContent = chip.textContent;
      renderStockInList();
    });
  });

  // Open Add Modal
  document.getElementById('btnOpenAddIn').addEventListener('click', () => {
    document.getElementById('formAddIn').reset();
    document.getElementById('inCalcTotal').textContent = '฿0.00';
    hideSupplierSuggestions();
    openModal('modalAddIn');
    setTimeout(() => {
      const inp = document.getElementById('inSupplierInput');
      inp.focus();
      renderSupplierSuggestions('');
    }, 150);
  });

  // Custom Autocomplete for Supplier
  initSupplierAutocomplete();

  const weightInput = document.getElementById('inWeightInput');
  const priceInput = document.getElementById('inPriceInput');
  const totalDisplay = document.getElementById('inCalcTotal');

  const calcTotal = () => {
    const w = parseFloat(weightInput.value) || 0;
    const p = parseFloat(priceInput.value) || 0;
    totalDisplay.textContent = formatCurrency(w * p);
  };

  weightInput.addEventListener('input', calcTotal);
  priceInput.addEventListener('input', calcTotal);

  // Form Submit: ใส่ชื่อซัพใหม่ได้ทันที หรือเลือกจากที่มีอยู่
  document.getElementById('formAddIn').addEventListener('submit', async (e) => {
    e.preventDefault();
    const supplier = document.getElementById('inSupplierInput').value.trim();
    const product = document.getElementById('inProductSelect').value;
    const weight = parseFloat(weightInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const note = document.getElementById('inNoteInput').value.trim();
    const total = weight * price;

    if (!supplier || weight <= 0 || price <= 0) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    const newRecord = {
      id: 'IN-' + Date.now().toString(36).toUpperCase(),
      timestamp: new Date().toISOString(),
      supplier,
      product,
      weight,
      price,
      total,
      note
    };

    STATE.stockIn.unshift(newRecord);
    if (!STATE.suppliers[supplier]) {
      STATE.suppliers[supplier] = { name: supplier };
    }
    saveLocalData();

    syncStockInToApi(newRecord);

    closeModal('modalAddIn');
    showToast(`บันทึกรับเข้า ${product} สำเร็จ!`);
    renderStockInList();
    renderDashboard();
  });
}

function initSupplierAutocomplete() {
  const input = document.getElementById('inSupplierInput');
  const dropdown = document.getElementById('inSupplierSuggestions');

  input.addEventListener('input', () => {
    renderSupplierSuggestions(input.value.trim());
  });

  input.addEventListener('focus', () => {
    renderSupplierSuggestions(input.value.trim());
  });

  // Close dropdown when clicked outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#inSupplierInput') && !e.target.closest('#inSupplierSuggestions')) {
      hideSupplierSuggestions();
    }
  });
}

function renderSupplierSuggestions(query) {
  const dropdown = document.getElementById('inSupplierSuggestions');
  const input = document.getElementById('inSupplierInput');
  if (!dropdown) return;

  // รวบรวมรายชื่อซัพพลายเออร์ทั้งหมด
  const names = new Set();
  Object.keys(STATE.suppliers).forEach(n => names.add(n));
  STATE.stockIn.forEach(r => { if (r.supplier) names.add(r.supplier); });

  const q = query.toLowerCase();
  const matched = Array.from(names).filter(n => !q || n.toLowerCase().includes(q));

  if (matched.length === 0) {
    hideSupplierSuggestions();
    return;
  }

  dropdown.innerHTML = matched.slice(0, 8).map(name => `
    <div class="suggestion-item" data-val="${escapeHtml(name)}">
      <span class="suggestion-title">⚓ ${escapeHtml(name)}</span>
      <span class="suggestion-sub">แตะเพื่อเลือกชื่อนี้</span>
    </div>
  `).join('');

  dropdown.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      input.value = item.getAttribute('data-val');
      hideSupplierSuggestions();
    });
  });

  dropdown.classList.add('show');
}

function hideSupplierSuggestions() {
  const dropdown = document.getElementById('inSupplierSuggestions');
  if (dropdown) dropdown.classList.remove('show');
}

function renderStockInList() {
  const container = document.getElementById('inListContainer');
  const filtered = STATE.stockIn.filter(item => {
    const matchRange = isDateInRange(item.timestamp, STATE.inFilterRange);
    const matchSearch = !STATE.inSearchQuery || (item.supplier && item.supplier.toLowerCase().includes(STATE.inSearchQuery));
    return matchRange && matchSearch;
  });

  let totalWeight = 0;
  let totalCost = 0;
  filtered.forEach(item => {
    totalWeight += Number(item.weight || 0);
    totalCost += Number(item.total || 0);
  });

  document.getElementById('inTotalWeight').innerHTML = `${formatWeight(totalWeight)} <small>กก.</small>`;
  document.getElementById('inTotalCost').textContent = formatCurrency(totalCost);
  document.getElementById('inTotalCount').innerHTML = `${filtered.length} <small>รายการ</small>`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📥</div>
        <p>ยังไม่มีรายการรับเข้าในช่วงเวลานี้</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="record-card" onclick="openSupplierDetail('${escapeHtml(item.supplier)}')">
      <div class="record-header">
        <div class="record-title-wrap">
          <span class="record-title">⚓ ${escapeHtml(item.supplier)}</span>
        </div>
        <span class="record-time">${formatDateThai(item.timestamp)}</span>
      </div>
      <div class="record-body">
        <div>
          <span class="record-product">${escapeHtml(item.product)}</span>
          <div class="record-calc">${formatWeight(item.weight)} กก. × ฿${item.price}/กก.</div>
        </div>
        <span class="record-amount text-danger">${formatCurrency(item.total)}</span>
      </div>
      <div class="record-footer">
        <span>${item.note ? '📝 ' + escapeHtml(item.note) : 'แตะเพื่อดูสรุปยอดซัพนี้'}</span>
        <span style="color: var(--primary); font-weight: 600;">ดูประวัติซัพนี้ &rsaquo;</span>
      </div>
    </div>
  `).join('');
}

function openSupplierDetail(supplierName) {
  document.getElementById('supDetailTitle').textContent = `รายละเอียด: ${supplierName}`;
  const supplierRecords = STATE.stockIn.filter(r => r.supplier === supplierName);

  let totalWeight = 0;
  let totalCost = 0;
  supplierRecords.forEach(r => {
    totalWeight += Number(r.weight || 0);
    totalCost += Number(r.total || 0);
  });

  const content = document.getElementById('supDetailContent');
  content.innerHTML = `
    <div class="detail-summary-box">
      <div>
        <div class="detail-item-label">ส่งมอบทั้งหมด</div>
        <div class="detail-item-val">${formatWeight(totalWeight)} กก.</div>
      </div>
      <div>
        <div class="detail-item-label">ยอดจ่ายสะสม</div>
        <div class="detail-item-val text-danger">${formatCurrency(totalCost)}</div>
      </div>
    </div>

    <h4 style="font-size:1rem; margin-bottom: 8px;">ประวัติการรับเข้าจากซัพนี้ (${supplierRecords.length} บิล)</h4>
    <div style="max-height: 250px; overflow-y: auto;">
      <table class="detail-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>สินค้า</th>
            <th>จำนวน</th>
            <th>ราคา</th>
            <th>รวม</th>
          </tr>
        </thead>
        <tbody>
          ${supplierRecords.map(r => `
            <tr>
              <td>${formatDateThai(r.timestamp)}</td>
              <td><strong>${escapeHtml(r.product)}</strong></td>
              <td>${formatWeight(r.weight)} กก.</td>
              <td>฿${r.price}</td>
              <td class="text-danger font-bold">${formatCurrency(r.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  openModal('modalSupplierDetail');
}

// ================= TAB 2: ขายออก (Stock Out) =================
function initStockOutEvents() {
  const searchInput = document.getElementById('outSearchCustomer');
  const clearBtn = document.getElementById('outClearSearch');

  searchInput.addEventListener('input', (e) => {
    STATE.outSearchQuery = e.target.value.trim().toLowerCase();
    clearBtn.classList.toggle('visible', !!STATE.outSearchQuery);
    renderStockOutList();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    STATE.outSearchQuery = '';
    clearBtn.classList.remove('visible');
    renderStockOutList();
  });

  const dateChips = document.querySelectorAll('#outDateFilters .chip');
  dateChips.forEach(chip => {
    chip.addEventListener('click', () => {
      dateChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      STATE.outFilterRange = chip.getAttribute('data-range');
      document.getElementById('outFilterLabel').textContent = chip.textContent;
      renderStockOutList();
    });
  });

  // Custom Autocomplete for Customer
  initCustomerAutocomplete();

  const productSelect = document.getElementById('outProductSelect');
  const priceInput = document.getElementById('outPriceInput');
  const weightInput = document.getElementById('outWeightInput');
  const totalDisplay = document.getElementById('outCalcTotal');

  productSelect.addEventListener('change', () => {
    const p = productSelect.value;
    if (STATE.defaultPrices[p]) {
      priceInput.value = STATE.defaultPrices[p];
    }
    calcTotalOut();
  });

  const calcTotalOut = () => {
    const w = parseFloat(weightInput.value) || 0;
    const p = parseFloat(priceInput.value) || 0;
    totalDisplay.textContent = formatCurrency(w * p);
  };

  weightInput.addEventListener('input', calcTotalOut);
  priceInput.addEventListener('input', calcTotalOut);

  // Open Add Modal
  document.getElementById('btnOpenAddOut').addEventListener('click', () => {
    document.getElementById('formAddOut').reset();
    productSelect.dispatchEvent(new Event('change'));
    document.getElementById('outCalcTotal').textContent = '฿0.00';
    hideCustomerSuggestions();
    openModal('modalAddOut');
    setTimeout(() => {
      const inp = document.getElementById('outCustomerInput');
      inp.focus();
      renderCustomerSuggestions('');
    }, 150);
  });

  // Submit Stock Out
  document.getElementById('formAddOut').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customer = document.getElementById('outCustomerInput').value.trim();
    const phone = document.getElementById('outCustomerPhone').value.trim();
    const address = document.getElementById('outCustomerAddress').value.trim();
    const product = productSelect.value;
    const weight = parseFloat(weightInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    const total = weight * price;

    if (!customer || weight <= 0 || price <= 0) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    const newRecord = {
      id: 'OUT-' + Date.now().toString(36).toUpperCase(),
      timestamp: new Date().toISOString(),
      customer,
      phone,
      address,
      product,
      weight,
      price,
      total,
      status: 'รอชำระ',
      paidAt: null
    };

    STATE.stockOut.unshift(newRecord);
    STATE.customers[customer] = { phone, address };
    saveLocalData();

    syncStockOutToApi(newRecord);

    closeModal('modalAddOut');
    showToast(`บันทึกขายให้ "${customer}" สำเร็จ (รอชำระ)`);
    renderStockOutList();
    renderDashboard();
  });
}

function initCustomerAutocomplete() {
  const input = document.getElementById('outCustomerInput');
  const dropdown = document.getElementById('outCustomerSuggestions');
  const phoneInput = document.getElementById('outCustomerPhone');
  const addressInput = document.getElementById('outCustomerAddress');

  input.addEventListener('input', () => {
    renderCustomerSuggestions(input.value.trim());
  });

  input.addEventListener('focus', () => {
    renderCustomerSuggestions(input.value.trim());
  });

  // Close when clicked outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#outCustomerInput') && !e.target.closest('#outCustomerSuggestions')) {
      hideCustomerSuggestions();
    }
  });
}

function renderCustomerSuggestions(query) {
  const dropdown = document.getElementById('outCustomerSuggestions');
  const input = document.getElementById('outCustomerInput');
  const phoneInput = document.getElementById('outCustomerPhone');
  const addressInput = document.getElementById('outCustomerAddress');
  if (!dropdown) return;

  // รวบรวมรายชื่อลูกค้าพร้อมข้อมูลติดต่อ
  const customerMap = {};
  Object.keys(STATE.customers).forEach(n => {
    customerMap[n] = STATE.customers[n] || {};
  });
  STATE.stockOut.forEach(r => {
    if (r.customer && !customerMap[r.customer]) {
      customerMap[r.customer] = { phone: r.phone || '', address: r.address || '' };
    }
  });

  const q = query.toLowerCase();
  const matched = Object.keys(customerMap).filter(n => !q || n.toLowerCase().includes(q));

  if (matched.length === 0) {
    hideCustomerSuggestions();
    return;
  }

  dropdown.innerHTML = matched.slice(0, 8).map(name => {
    const c = customerMap[name] || {};
    const subText = [c.phone ? '📞 ' + c.phone : '', c.address ? '📍 ' + c.address : ''].filter(Boolean).join(' • ') || 'แตะเพื่อเลือกและดึงข้อมูล';
    return `
      <div class="suggestion-item" data-name="${escapeHtml(name)}" data-phone="${escapeHtml(c.phone || '')}" data-address="${escapeHtml(c.address || '')}">
        <span class="suggestion-title">👤 ${escapeHtml(name)}</span>
        <span class="suggestion-sub">${subText}</span>
      </div>
    `;
  }).join('');

  dropdown.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('click', () => {
      input.value = item.getAttribute('data-name');
      const p = item.getAttribute('data-phone');
      const a = item.getAttribute('data-address');
      if (p) phoneInput.value = p;
      if (a) addressInput.value = a;
      hideCustomerSuggestions();
    });
  });

  dropdown.classList.add('show');
}

function hideCustomerSuggestions() {
  const dropdown = document.getElementById('outCustomerSuggestions');
  if (dropdown) dropdown.classList.remove('show');
}

function renderStockOutList() {
  const container = document.getElementById('outListContainer');
  const filtered = STATE.stockOut.filter(item => {
    const matchRange = isDateInRange(item.timestamp, STATE.outFilterRange);
    const matchSearch = !STATE.outSearchQuery || (item.customer && item.customer.toLowerCase().includes(STATE.outSearchQuery));
    return matchRange && matchSearch;
  });

  let totalWeight = 0;
  let totalAmount = 0;
  let unpaidAmount = 0;

  filtered.forEach(item => {
    totalWeight += Number(item.weight || 0);
    totalAmount += Number(item.total || 0);
    if (item.status === 'รอชำระ') {
      unpaidAmount += Number(item.total || 0);
    }
  });

  document.getElementById('outTotalWeight').innerHTML = `${formatWeight(totalWeight)} <small>กก.</small>`;
  document.getElementById('outTotalAmount').textContent = formatCurrency(totalAmount);
  document.getElementById('outUnpaidAmount').textContent = formatCurrency(unpaidAmount);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📤</div>
        <p>ยังไม่มีรายการขายในช่วงเวลานี้</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="record-card" onclick="openSaleDetail('${item.id}')">
      <div class="record-header">
        <div class="record-title-wrap">
          <span class="record-title">👤 ${escapeHtml(item.customer)}</span>
        </div>
        <span class="status-badge ${item.status === 'ชำระเงินแล้ว' ? 'paid' : 'unpaid'}">
          ${item.status === 'ชำระเงินแล้ว' ? '✓ ชำระแล้ว' : '⏳ รอชำระ'}
        </span>
      </div>
      <div class="record-body">
        <div>
          <span class="record-product">${escapeHtml(item.product)}</span>
          <div class="record-calc">${formatWeight(item.weight)} กก. × ฿${item.price}/กก.</div>
        </div>
        <span class="record-amount text-success">${formatCurrency(item.total)}</span>
      </div>
      <div class="record-footer">
        <span>🕒 ${formatDateThai(item.timestamp)}</span>
        <span style="color: var(--primary); font-weight: 600;">คลิกเพื่อดู & ปรับสถานะ &rsaquo;</span>
      </div>
    </div>
  `).join('');
}

function openSaleDetail(saleId) {
  const item = STATE.stockOut.find(s => s.id === saleId);
  if (!item) return;

  const content = document.getElementById('saleDetailContent');
  content.innerHTML = `
    <div class="detail-summary-box">
      <div>
        <div class="detail-item-label">ลูกค้า</div>
        <div class="detail-item-val">${escapeHtml(item.customer)}</div>
      </div>
      <div>
        <div class="detail-item-label">ยอดเรียกเก็บ</div>
        <div class="detail-item-val text-success">${formatCurrency(item.total)}</div>
      </div>
      <div>
        <div class="detail-item-label">เบอร์โทร</div>
        <div style="font-size:0.95rem; font-weight:600;">${item.phone || '-'}</div>
      </div>
      <div>
        <div class="detail-item-label">ที่อยู่ / จัดส่ง</div>
        <div style="font-size:0.95rem;">${escapeHtml(item.address || '-')}</div>
      </div>
    </div>

    <div style="background:#f8fafc; padding:14px; border-radius:10px; border:1px solid var(--border); font-size:0.95rem; line-height:1.7;">
      <div style="display:flex; justify-content:space-between;">
        <span>สินค้าที่ซื้อ:</span>
        <strong>${escapeHtml(item.product)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>น้ำหนัก:</span>
        <span>${formatWeight(item.weight)} กก.</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>ราคาต่อ กก.:</span>
        <span>฿${item.price}</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>เวลาที่บันทึก:</span>
        <span>${formatDateThai(item.timestamp)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
        <span>สถานะการชำระ:</span>
        <span class="status-badge ${item.status === 'ชำระเงินแล้ว' ? 'paid' : 'unpaid'}">
          ${item.status === 'ชำระเงินแล้ว' ? '✓ ชำระเงินแล้ว' : '⏳ รอชำระ'}
        </span>
      </div>
      ${item.paidAt ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px; text-align:right;">ชำระเมื่อ: ${formatDateThai(item.paidAt)}</div>` : ''}
    </div>
  `;

  // ปุ่มปิด และ ปรับสถานะ (กดปิดได้แน่นอน 100%)
  const actions = document.getElementById('saleDetailActions');
  if (item.status === 'รอชำระ') {
    actions.innerHTML = `
      <button type="button" class="btn btn-outline" data-close="modalSaleDetail" onclick="closeModal('modalSaleDetail')">ปิด</button>
      <button type="button" class="btn btn-success" onclick="updatePaymentStatus('${item.id}', 'ชำระเงินแล้ว')">
        ✓ ปรับเป็นชำระเงินแล้ว
      </button>
    `;
  } else {
    actions.innerHTML = `
      <button type="button" class="btn btn-outline" data-close="modalSaleDetail" onclick="closeModal('modalSaleDetail')">ปิด</button>
      <button type="button" class="btn btn-outline" style="color:var(--warning)" onclick="updatePaymentStatus('${item.id}', 'รอชำระ')">
        เปลี่ยนกลับเป็นรอชำระ
      </button>
    `;
  }

  openModal('modalSaleDetail');
}

function updatePaymentStatus(saleId, newStatus) {
  const item = STATE.stockOut.find(s => s.id === saleId);
  if (!item) return;

  item.status = newStatus;
  item.paidAt = newStatus === 'ชำระเงินแล้ว' ? new Date().toISOString() : null;
  saveLocalData();

  syncStatusToApi(saleId, newStatus);

  closeModal('modalSaleDetail');
  showToast(`อัปเดตสถานะเป็น "${newStatus}" แล้ว`);
  renderStockOutList();
  renderDashboard();
}

// ================= TAB 3: แดชบอร์ด (Dashboard) =================
function renderDashboard() {
  const stockMap = {
    'หมึกหอม': { in: 0, out: 0 },
    'หมึกกระดอง': { in: 0, out: 0 },
    'หมึกกล้วย': { in: 0, out: 0 }
  };

  STATE.stockIn.forEach(r => {
    if (stockMap[r.product]) {
      stockMap[r.product].in += Number(r.weight || 0);
    }
  });

  STATE.stockOut.forEach(r => {
    if (stockMap[r.product]) {
      stockMap[r.product].out += Number(r.weight || 0);
    }
  });

  const homRemain = stockMap['หมึกหอม'].in - stockMap['หมึกหอม'].out;
  const kradongRemain = stockMap['หมึกกระดอง'].in - stockMap['หมึกกระดอง'].out;
  const kluayRemain = stockMap['หมึกกล้วย'].in - stockMap['หมึกกล้วย'].out;

  document.getElementById('dashStockHom').innerHTML = `${formatWeight(homRemain)} <small>กก.</small>`;
  document.getElementById('dashInHom').textContent = formatWeight(stockMap['หมึกหอม'].in);
  document.getElementById('dashOutHom').textContent = formatWeight(stockMap['หมึกหอม'].out);

  document.getElementById('dashStockKradong').innerHTML = `${formatWeight(kradongRemain)} <small>กก.</small>`;
  document.getElementById('dashInKradong').textContent = formatWeight(stockMap['หมึกกระดอง'].in);
  document.getElementById('dashOutKradong').textContent = formatWeight(stockMap['หมึกกระดอง'].out);

  document.getElementById('dashStockKluay').innerHTML = `${formatWeight(kluayRemain)} <small>กก.</small>`;
  document.getElementById('dashInKluay').textContent = formatWeight(stockMap['หมึกกล้วย'].in);
  document.getElementById('dashOutKluay').textContent = formatWeight(stockMap['หมึกกล้วย'].out);

  // สรุปการเงินเดือนนี้ (นับตั้งแต่วันที่ 1 ของเดือน)
  const { start: monthStart, end: monthEnd } = getFilterRangeBounds('month');
  
  let monthExpense = 0;
  STATE.stockIn.forEach(r => {
    const t = new Date(r.timestamp);
    if (t >= monthStart && t <= monthEnd) {
      monthExpense += Number(r.total || 0);
    }
  });

  let monthPaidRevenue = 0;
  STATE.stockOut.forEach(r => {
    const t = new Date(r.timestamp);
    if (t >= monthStart && t <= monthEnd && r.status === 'ชำระเงินแล้ว') {
      monthPaidRevenue += Number(r.total || 0);
    }
  });

  const monthProfit = monthPaidRevenue - monthExpense;

  document.getElementById('dashMonthExpense').textContent = formatCurrency(monthExpense);
  document.getElementById('dashMonthPaidRevenue').textContent = formatCurrency(monthPaidRevenue);
  
  const profitEl = document.getElementById('dashMonthProfit');
  profitEl.textContent = formatCurrency(monthProfit);
  profitEl.className = 'fin-val ' + (monthProfit >= 0 ? 'text-success' : 'text-danger');

  // รายการลูกค้าที่ยังไม่ชำระ
  const unpaidListEl = document.getElementById('dashUnpaidList');
  const unpaidRecords = STATE.stockOut.filter(r => r.status === 'รอชำระ');
  
  document.getElementById('dashUnpaidSummaryBadge').textContent = `${unpaidRecords.length} รายการ`;

  if (unpaidRecords.length === 0) {
    unpaidListEl.innerHTML = `
      <div style="text-align:center; padding: 20px; color:var(--text-muted); font-size:1rem;">
        🎉 ไม่มีรายการค้างชำระ
      </div>`;
    return;
  }

  unpaidListEl.innerHTML = unpaidRecords.map(r => `
    <div class="unpaid-row">
      <div class="unpaid-info-wrap">
        <span class="unpaid-name">${escapeHtml(r.customer)}</span>
        <span class="unpaid-detail">${escapeHtml(r.product)} ${formatWeight(r.weight)} กก. • ${formatDateThai(r.timestamp)}</span>
      </div>
      <div class="unpaid-action-wrap">
        <span class="unpaid-amt">${formatCurrency(r.total)}</span>
        <button class="btn btn-sm btn-success" onclick="updatePaymentStatus('${r.id}', 'ชำระเงินแล้ว')">
          รับชำระ
        </button>
      </div>
    </div>
  `).join('');
}

// ================= MODAL HELPERS =================
function initModals() {
  // Global Event Delegation for all close buttons
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const modalId = closeBtn.getAttribute('data-close');
      closeModal(modalId);
    }
  });

  // Click outside to close modal
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });
}

function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('open');
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('open');
}

// ================= REFRESH & GOOGLE SHEET SYNC =================
function initRefreshButton() {
  const refreshBtn = document.getElementById('btnRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchDataFromGoogle();
    });
  }
}

function updateConnectionBadge() {
  const badge = document.getElementById('connectionStatus');
  if (!badge) return;
  badge.textContent = '🟢 พร้อมใช้งาน (Google Sheet)';
  badge.style.color = '#10b981';
}

// API Integration Helpers
async function fetchDataFromGoogle() {
  if (!STATE.apiUrl) return;
  const badge = document.getElementById('connectionStatus');
  if (badge) {
    badge.textContent = '🔄 กำลังดึงข้อมูล...';
    badge.style.color = 'var(--primary)';
  }

  try {
    const res = await fetch(`${STATE.apiUrl}?action=getData&_=${Date.now()}`);
    const data = await res.json();
    if (data.status === 'success') {
      STATE.stockIn = Array.isArray(data.stockIn) ? data.stockIn : [];
      STATE.stockOut = Array.isArray(data.stockOut) ? data.stockOut : [];
      STATE.customers = data.customers || {};
      STATE.suppliers = data.suppliers || {};
      saveLocalData();
      renderCurrentTab();
      updateConnectionBadge();
      showToast('ดึงข้อมูลจาก Google Sheet สำเร็จ!');
    } else {
      throw new Error(data.message || 'Fetch failed');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    if (badge) {
      badge.textContent = '⚠️ ใช้ข้อมูลในเครื่อง (ออฟไลน์)';
      badge.style.color = '#f59e0b';
    }
    showToast('ดึงข้อมูลไม่สำเร็จ กำลังใช้ข้อมูลในเครื่อง');
  }
}

async function syncStockInToApi(record) {
  if (!STATE.apiUrl) return;
  try {
    await fetch(STATE.apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addStockIn', record })
    });
  } catch (e) {
    console.error('Failed to sync stock in to API:', e);
  }
}

async function syncStockOutToApi(record) {
  if (!STATE.apiUrl) return;
  try {
    await fetch(STATE.apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addStockOut', record })
    });
  } catch (e) {
    console.error('Failed to sync stock out to API:', e);
  }
}

async function syncStatusToApi(id, newStatus) {
  if (!STATE.apiUrl) return;
  try {
    await fetch(STATE.apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'updatePaymentStatus', id, status: newStatus })
    });
  } catch (e) {
    console.error('Failed to sync status update:', e);
  }
}

// ================= RENDER DISPATCHER =================
function renderCurrentTab() {
  if (STATE.currentTab === 'tab-stockin') {
    renderStockInList();
  } else if (STATE.currentTab === 'tab-stockout') {
    renderStockOutList();
  } else if (STATE.currentTab === 'tab-dashboard') {
    renderDashboard();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ================= APP INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
  loadLocalData();
  initNavigation();
  initModals();
  initStockInEvents();
  initStockOutEvents();
  initRefreshButton();
  updateConnectionBadge();

  renderStockInList();
  renderStockOutList();
  renderDashboard();

  // ดึงข้อมูลจริงจาก Google Sheet ทันทีที่เปิดหน้าเว็บ
  fetchDataFromGoogle();
});
