/**
 * ระบบสต๊อกปลาหมึก (Squid Inventory Management System)
 * High-performance, offline-first client application
 */

// ⭐ ใส่ Google Apps Script Web App URL ที่นี่ (หรือจะใส่ผ่านปุ่มตั้งค่า ⚙️ บนหน้าเว็บก็ได้)
// เช่น: const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
const DEFAULT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby_KIXPbaAikCBEW9CEmV6vPSnYQApZY_N0IBalSFP3PB1iyEoDvgjXXVFsPgEWQERE6w/exec';

// ================= APP STATE =================
const STATE = {
  apiUrl: localStorage.getItem('squid_api_url') || DEFAULT_WEB_APP_URL || '',
  useDemo: localStorage.getItem('squid_use_demo') !== 'false',
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

// ================= SAMPLE / DEMO DATA =================
function getInitialDemoData() {
  const now = new Date();
  const todayStr = (offsetDays = 0, hour = 9, min = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() - offsetDays);
    d.setHours(hour, min, 0, 0);
    return d.toISOString();
  };

  return {
    stockIn: [
      { id: 'IN-001', timestamp: todayStr(0, 7, 30), supplier: 'ไต๋ดำ มหาชัย', product: 'หมึกหอม', weight: 45.5, price: 210, total: 9555, note: 'ตัวใหญ่ สดมาก' },
      { id: 'IN-002', timestamp: todayStr(0, 8, 15), supplier: 'ไต๋ดำ มหาชัย', product: 'หมึกกล้วย', weight: 60.0, price: 140, total: 8400, note: 'คัดไซส์' },
      { id: 'IN-003', timestamp: todayStr(1, 6, 45), supplier: 'เจ๊พร แพปลาปราณบุรี', product: 'หมึกกระดอง', weight: 80.0, price: 170, total: 13600, note: 'สดจากเรือได' },
      { id: 'IN-004', timestamp: todayStr(3, 8, 0), supplier: 'ลุงเปี๊ยก สัตหีบ', product: 'หมึกหอม', weight: 50.0, price: 215, total: 10750, note: '' }
    ],
    stockOut: [
      { id: 'OUT-001', timestamp: todayStr(0, 10, 30), customer: 'ร้านอาหารริมเล', phone: '081-234-5678', address: 'ซอย 5 หน้าร้าน', product: 'หมึกหอม', weight: 15.0, price: 270, total: 4050, status: 'รอชำระ', paidAt: null },
      { id: 'OUT-002', timestamp: todayStr(0, 11, 40), customer: 'เจ๊หมวย ข้าวต้มปลา', phone: '089-876-5432', address: 'ตลาดสดเทศบาล', product: 'หมึกกล้วย', weight: 20.0, price: 180, total: 3600, status: 'ชำระเงินแล้ว', paidAt: todayStr(0, 12, 0) },
      { id: 'OUT-003', timestamp: todayStr(1, 14, 20), customer: 'ครัวคุณต๋อย ซีฟู้ด', phone: '086-555-1234', address: 'ริมหาดชะอำ', product: 'หมึกกระดอง', weight: 30.0, price: 220, total: 6600, status: 'รอชำระ', paidAt: null },
      { id: 'OUT-004', timestamp: todayStr(2, 16, 0), customer: 'ร้านอาหารริมเล', phone: '081-234-5678', address: 'ซอย 5 หน้าร้าน', product: 'หมึกหอม', weight: 10.0, price: 270, total: 2700, status: 'ชำระเงินแล้ว', paidAt: todayStr(2, 17, 30) }
    ],
    customers: {
      'ร้านอาหารริมเล': { phone: '081-234-5678', address: 'ซอย 5 หน้าร้าน' },
      'เจ๊หมวย ข้าวต้มปลา': { phone: '089-876-5432', address: 'ตลาดสดเทศบาล' },
      'ครัวคุณต๋อย ซีฟู้ด': { phone: '086-555-1234', address: 'ริมหาดชะอำ' }
    },
    suppliers: {
      'ไต๋ดำ มหาชัย': { phone: '082-111-2222', address: 'ท่าเทียบเรือมหาชัย' },
      'เจ๊พร แพปลาปราณบุรี': { phone: '084-333-4444', address: 'ปากน้ำปราณ' },
      'ลุงเปี๊ยก สัตหีบ': { phone: '085-555-6666', address: 'ท่าเรือสัตหีบ' }
    }
  };
}

// ================= STORAGE HELPERS =================
function loadLocalData() {
  const cached = localStorage.getItem('squid_data_v1');
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

  // Fallback to demo data
  const demo = getInitialDemoData();
  STATE.stockIn = demo.stockIn;
  STATE.stockOut = demo.stockOut;
  STATE.customers = demo.customers;
  STATE.suppliers = demo.suppliers;
  saveLocalData();
}

function saveLocalData() {
  localStorage.setItem('squid_data_v1', JSON.stringify({
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
    // Week calculation: Monday to Sunday (ตามที่ผู้ใช้กำหนด: นับวันจันทร์-อาทิตย์)
    const day = now.getDay(); // 0 is Sun, 1 is Mon...
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
    // 'all'
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

      // Refresh view when switching tabs
      renderCurrentTab();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

// ================= TAB 1: รับเข้า (Stock In) =================
function initStockInEvents() {
  // Search input
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

  // Date filters
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
    populateSupplierDatalist();
    document.getElementById('formAddIn').reset();
    document.getElementById('inCalcTotal').textContent = '฿0.00';
    openModal('modalAddIn');
    setTimeout(() => document.getElementById('inSupplierInput').focus(), 150);
  });

  // Auto total calculation on input
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

  // Form Submit
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

    // Save locally
    STATE.stockIn.unshift(newRecord);
    if (!STATE.suppliers[supplier]) {
      STATE.suppliers[supplier] = { name: supplier };
    }
    saveLocalData();

    // Sync API in background
    syncStockInToApi(newRecord);

    closeModal('modalAddIn');
    showToast(`บันทึกรับเข้า ${product} สำเร็จ!`);
    renderStockInList();
    renderDashboard();
  });
}

function renderStockInList() {
  const container = document.getElementById('inListContainer');
  const filtered = STATE.stockIn.filter(item => {
    const matchRange = isDateInRange(item.timestamp, STATE.inFilterRange);
    const matchSearch = !STATE.inSearchQuery || item.supplier.toLowerCase().includes(STATE.inSearchQuery);
    return matchRange && matchSearch;
  });

  // Update Summary Box
  let totalWeight = 0;
  let totalCost = 0;
  filtered.forEach(item => {
    totalWeight += Number(item.weight || 0);
    totalCost += Number(item.total || 0);
  });

  document.getElementById('inTotalWeight').innerHTML = `${formatWeight(totalWeight)} <small>กก.</small>`;
  document.getElementById('inTotalCost').textContent = formatCurrency(totalCost);
  document.getElementById('inTotalCount').innerHTML = `${filtered.length} <small>รายการ</small>`;

  // Render cards
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📥</div>
        <p>ไม่พบรายการรับเข้าในช่วงเวลาหรือคำค้นหานี้</p>
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
        <span>${item.note ? '📝 ' + escapeHtml(item.note) : 'แตะเพื่อดูสรุปซัพพลายเออร์นี้'}</span>
        <span style="color: var(--primary); font-weight: 500;">ดูประวัติซัพนี้ &rsaquo;</span>
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

    <h4 style="font-size:0.9rem; margin-bottom: 8px;">ประวัติการรับเข้าจากซัพนี้ (${supplierRecords.length} บิล)</h4>
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

  // Date filters
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

  // Auto fill Customer Phone & Address when customer selected
  const custInput = document.getElementById('outCustomerInput');
  custInput.addEventListener('input', () => {
    const name = custInput.value.trim();
    if (STATE.customers[name]) {
      const c = STATE.customers[name];
      if (c.phone) document.getElementById('outCustomerPhone').value = c.phone;
      if (c.address) document.getElementById('outCustomerAddress').value = c.address;
    }
  });

  // Suggest default selling price based on selected squid
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
    populateCustomerDatalist();
    document.getElementById('formAddOut').reset();
    productSelect.dispatchEvent(new Event('change'));
    document.getElementById('outCalcTotal').textContent = '฿0.00';
    openModal('modalAddOut');
    setTimeout(() => document.getElementById('outCustomerInput').focus(), 150);
  });

  // Submit Stock Out
  document.getElementById('formAddOut').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customer = custInput.value.trim();
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
      status: 'รอชำระ', // บันทึกอัตโนมัติ สถานะคือ รอชำระ
      paidAt: null
    };

    // Save locally
    STATE.stockOut.unshift(newRecord);
    STATE.customers[customer] = { phone, address };
    saveLocalData();

    // Sync API in background
    syncStockOutToApi(newRecord);

    closeModal('modalAddOut');
    showToast(`บันทึกขายให้ ${customer} เรียบร้อย (รอชำระ)`);
    renderStockOutList();
    renderDashboard();
  });
}

function renderStockOutList() {
  const container = document.getElementById('outListContainer');
  const filtered = STATE.stockOut.filter(item => {
    const matchRange = isDateInRange(item.timestamp, STATE.outFilterRange);
    const matchSearch = !STATE.outSearchQuery || item.customer.toLowerCase().includes(STATE.outSearchQuery);
    return matchRange && matchSearch;
  });

  // Summary box calculations
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

  // Render cards
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📤</div>
        <p>ไม่พบรายการขายในช่วงเวลาหรือคำค้นหานี้</p>
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
        <span style="color: var(--primary); font-weight: 500;">คลิกเพื่อดู & ปรับสถานะ &rsaquo;</span>
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
        <div>${item.phone || '-'}</div>
      </div>
      <div>
        <div class="detail-item-label">ที่อยู่ / จัดส่ง</div>
        <div>${escapeHtml(item.address || '-')}</div>
      </div>
    </div>

    <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid var(--border); font-size:0.85rem;">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span>สินค้าที่ซื้อ:</span>
        <strong>${escapeHtml(item.product)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span>น้ำหนัก:</span>
        <span>${formatWeight(item.weight)} กก.</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span>ราคาต่อ กก.:</span>
        <span>฿${item.price}</span>
      </div>
      <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
        <span>เวลาที่บันทึก:</span>
        <span>${formatDateThai(item.timestamp)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
        <span>สถานะการชำระ:</span>
        <span class="status-badge ${item.status === 'ชำระเงินแล้ว' ? 'paid' : 'unpaid'}">
          ${item.status === 'ชำระเงินแล้ว' ? '✓ ชำระเงินแล้ว' : '⏳ รอชำระ'}
        </span>
      </div>
      ${item.paidAt ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; text-align:right;">ชำระเมื่อ: ${formatDateThai(item.paidAt)}</div>` : ''}
    </div>
  `;

  const actions = document.getElementById('saleDetailActions');
  if (item.status === 'รอชำระ') {
    actions.innerHTML = `
      <button type="button" class="btn btn-outline" data-close="modalSaleDetail">ปิด</button>
      <button type="button" class="btn btn-success" onclick="updatePaymentStatus('${item.id}', 'ชำระเงินแล้ว')">
        ✓ เปลี่ยนเป็นชำระเงินแล้ว
      </button>
    `;
  } else {
    actions.innerHTML = `
      <button type="button" class="btn btn-outline" data-close="modalSaleDetail">ปิด</button>
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

  // Sync to API
  syncStatusToApi(saleId, newStatus);

  closeModal('modalSaleDetail');
  showToast(`อัปเดตสถานะเป็น "${newStatus}" แล้ว`);
  renderStockOutList();
  renderDashboard();
}

// ================= TAB 3: แดชบอร์ด (Dashboard) =================
function renderDashboard() {
  // 1. Current Stock Calculation (All time In minus All time Out)
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

  // Render Squid Stocks
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

  // 2. Month Financials: นับตั้งแต่วันที่ 1 ของเดือนปัจจุบัน
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

  // 3. Unpaid Customers List
  const unpaidListEl = document.getElementById('dashUnpaidList');
  const unpaidRecords = STATE.stockOut.filter(r => r.status === 'รอชำระ');
  
  document.getElementById('dashUnpaidSummaryBadge').textContent = `${unpaidRecords.length} รายการ`;

  if (unpaidRecords.length === 0) {
    unpaidListEl.innerHTML = `
      <div style="text-align:center; padding: 20px; color:var(--success); font-size:0.9rem;">
        🎉 ยอดเยี่ยม! ไม่มีรายการค้างชำระในขณะนี้
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
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      closeModal(modalId);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });
}

function openModal(modalId) {
  document.getElementById(modalId).classList.add('open');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('open');
}

function populateSupplierDatalist() {
  const datalist = document.getElementById('supplierList');
  const uniqueNames = new Set(Object.keys(STATE.suppliers));
  STATE.stockIn.forEach(r => uniqueNames.add(r.supplier));
  
  datalist.innerHTML = Array.from(uniqueNames).map(name => 
    `<option value="${escapeHtml(name)}">`
  ).join('');
}

function populateCustomerDatalist() {
  const datalist = document.getElementById('customerList');
  const uniqueNames = new Set(Object.keys(STATE.customers));
  STATE.stockOut.forEach(r => uniqueNames.add(r.customer));

  datalist.innerHTML = Array.from(uniqueNames).map(name => 
    `<option value="${escapeHtml(name)}">`
  ).join('');
}

// ================= SETTINGS & GOOGLE SHEET SYNC =================
function initSettings() {
  const modal = 'modalSettings';
  const urlInput = document.getElementById('settingApiUrl');
  const demoSwitch = document.getElementById('settingUseDemo');

  document.getElementById('btnSettings').addEventListener('click', () => {
    urlInput.value = STATE.apiUrl;
    demoSwitch.checked = STATE.useDemo;
    openModal(modal);
  });

  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    STATE.apiUrl = urlInput.value.trim();
    STATE.useDemo = demoSwitch.checked;
    localStorage.setItem('squid_api_url', STATE.apiUrl);
    localStorage.setItem('squid_use_demo', STATE.useDemo ? 'true' : 'false');
    updateConnectionBadge();
    closeModal(modal);
    showToast('บันทึกการตั้งค่าแล้ว');
    if (STATE.apiUrl) {
      fetchDataFromGoogle();
    }
  });

  document.getElementById('btnResetDemo').addEventListener('click', () => {
    if (confirm('คุณต้องการรีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นหรือไม่?')) {
      localStorage.removeItem('squid_data_v1');
      loadLocalData();
      renderCurrentTab();
      closeModal(modal);
      showToast('รีเซ็ตข้อมูลตัวอย่างแล้ว');
    }
  });

  document.getElementById('btnRefresh').addEventListener('click', () => {
    if (STATE.apiUrl) {
      fetchDataFromGoogle();
    } else {
      showToast('ข้อมูลอัปเดตล่าสุดแล้ว (โหมดออฟไลน์)');
      renderCurrentTab();
    }
  });
}

function updateConnectionBadge() {
  const badge = document.getElementById('connectionStatus');
  if (STATE.apiUrl) {
    badge.textContent = '🟢 เชื่อมต่อ Google Sheet แล้ว';
    badge.style.color = '#10b981';
  } else {
    badge.textContent = '● โหมดทดลอง (ออฟไลน์)';
    badge.style.color = 'var(--text-muted)';
  }
}

// API Integration Helpers
async function fetchDataFromGoogle() {
  if (!STATE.apiUrl) return;
  const badge = document.getElementById('connectionStatus');
  badge.textContent = '🔄 กำลังดึงข้อมูล...';

  try {
    const res = await fetch(`${STATE.apiUrl}?action=getData&_=${Date.now()}`);
    const data = await res.json();
    if (data.status === 'success') {
      if (Array.isArray(data.stockIn)) STATE.stockIn = data.stockIn;
      if (Array.isArray(data.stockOut)) STATE.stockOut = data.stockOut;
      if (data.customers) STATE.customers = data.customers;
      if (data.suppliers) STATE.suppliers = data.suppliers;
      saveLocalData();
      renderCurrentTab();
      badge.textContent = '🟢 เชื่อมต่อ Google Sheet แล้ว';
      badge.style.color = '#10b981';
      showToast('ดึงข้อมูลจาก Google Sheet สำเร็จ!');
    } else {
      throw new Error(data.message || 'Fetch failed');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    badge.textContent = '⚠️ ซิงค์ล้มเหลว (ใช้ข้อมูลในเครื่อง)';
    badge.style.color = '#f59e0b';
    showToast('ไม่สามารถดึงข้อมูลจาก Sheet ได้ กำลังใช้ข้อมูลในเครื่อง');
  }
}

async function syncStockInToApi(record) {
  if (!STATE.apiUrl) return;
  try {
    await fetch(STATE.apiUrl, {
      method: 'POST',
      mode: 'no-cors', // Standard Google Apps Script cross-origin invocation
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
  initSettings();
  updateConnectionBadge();

  // Initial render
  renderStockInList();
  renderStockOutList();
  renderDashboard();

  // If API URL is configured, pull latest data from Google Sheet
  if (STATE.apiUrl) {
    fetchDataFromGoogle();
  }
});
