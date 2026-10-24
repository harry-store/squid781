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
  inFilterRange: 'all',        // รายการประวัติด้านล่างตั้งต้น: ทั้งหมด
  inSummaryRange: 'today',      // บล็อคสรุปด้านบนตั้งต้น: วันนี้
  inCustomDate: '',
  outFilterRange: 'all',       // รายการประวัติด้านล่างตั้งต้น: ทั้งหมด
  outSummaryRange: 'today',     // บล็อคสรุปด้านบนตั้งต้น: วันนี้
  outCustomDate: '',
  dashFinRange: 'today',
  dashDailyRange: 'month',
  dashDailyCustomDate: '',
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
  const cached = localStorage.getItem('squid_data_v3');
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

  STATE.stockIn = [];
  STATE.stockOut = [];
  STATE.customers = {};
  STATE.suppliers = {};
}

function saveLocalData() {
  localStorage.setItem('squid_data_v3', JSON.stringify({
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

function getDateKey(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateThai(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit'
  }) + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatDateOnlyThai(dateInput) {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit'
  });
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

function isDateMatchFilter(ts, rangeType, customDate) {
  if (rangeType === 'custom') {
    return getDateKey(ts) === customDate;
  }
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

// ================= UI NOTIFICATIONS & LOADING =================
function showLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('hidden');
}

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
  const datePicker = document.getElementById('inDatePicker');

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
      const range = chip.getAttribute('data-range');
      STATE.inFilterRange = range;
      STATE.inSummaryRange = range;
      STATE.inCustomDate = '';
      datePicker.value = '';
      datePicker.classList.remove('active');
      document.getElementById('inFilterLabel').textContent = chip.textContent;
      renderStockInList();
    });
  });

  // Date picker changed
  datePicker.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      dateChips.forEach(c => c.classList.remove('active'));
      STATE.inFilterRange = 'custom';
      STATE.inSummaryRange = 'custom';
      STATE.inCustomDate = val;
      datePicker.classList.add('active');
      document.getElementById('inFilterLabel').textContent = formatDateOnlyThai(val);
      renderStockInList();
    }
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

/**
 * แสดงรายการประวัติรับเข้า เป็น "รายวัน"
 */
function renderStockInList() {
  const container = document.getElementById('inListContainer');
  const banner = document.getElementById('inSupplierSearchBanner');

  // 1. คำนวณบล็อคสรุปด้านบน (เริ่มต้นคือคำนวณของ "วันนี้")
  const summaryItems = STATE.stockIn.filter(item => {
    return isDateMatchFilter(item.timestamp, STATE.inSummaryRange, STATE.inCustomDate);
  });

  let totalWeight = 0;
  let totalCost = 0;
  summaryItems.forEach(item => {
    totalWeight += Number(item.weight || 0);
    totalCost += Number(item.total || 0);
  });

  document.getElementById('inTotalWeight').innerHTML = `${formatWeight(totalWeight)} <small>กก.</small>`;
  document.getElementById('inTotalCost').textContent = formatCurrency(totalCost);
  document.getElementById('inTotalCount').innerHTML = `${summaryItems.length} <small>รายการ</small>`;

  // 2. กรองรายการประวัติด้านล่าง (เริ่มต้นคือดึง "ทุกวันย้อนหลังทั้งหมด")
  const filtered = STATE.stockIn.filter(item => {
    const matchRange = isDateMatchFilter(item.timestamp, STATE.inFilterRange, STATE.inCustomDate);
    const matchSearch = !STATE.inSearchQuery || (item.supplier && item.supplier.toLowerCase().includes(STATE.inSearchQuery));
    return matchRange && matchSearch;
  });

  // แบนเนอร์ค้นหาซัพพลายเออร์ตรง
  if (STATE.inSearchQuery) {
    const matchedSup = Object.keys(STATE.suppliers).find(s => s.toLowerCase().includes(STATE.inSearchQuery)) ||
                       (STATE.stockIn.find(r => r.supplier && r.supplier.toLowerCase().includes(STATE.inSearchQuery))?.supplier);
    if (matchedSup) {
      banner.style.display = 'flex';
      banner.innerHTML = `
        <div>
          <strong style="color:var(--primary); font-size:1.05rem;">⚓ ซัพพลายเออร์: ${escapeHtml(matchedSup)}</strong>
          <div style="font-size:0.85rem; color:var(--text-muted);">แตะที่นี่เพื่อดูประวัติและยอดส่งสะสมทั้งหมดของซัพนี้</div>
        </div>
        <span style="font-size:1.2rem; color:var(--primary);">❯</span>
      `;
      banner.onclick = () => openSupplierDetail(matchedSup);
    } else {
      banner.style.display = 'none';
    }
  } else {
    banner.style.display = 'none';
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📥</div>
        <p>ไม่พบรายการรับเข้าตามเงื่อนไขที่เลือก</p>
      </div>`;
    return;
  }

  // จัดกลุ่มเป็น "รายวัน" (Group by Date Key: YYYY-MM-DD)
  const dateGroups = {};
  filtered.forEach(item => {
    const dateKey = getDateKey(item.timestamp);
    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = {
        dateKey,
        dateFormatted: formatDateOnlyThai(item.timestamp),
        items: [],
        totalWeight: 0,
        totalCost: 0,
        products: { 'หมึกหอม': 0, 'หมึกกระดอง': 0, 'หมึกกล้วย': 0 }
      };
    }
    dateGroups[dateKey].items.push(item);
    dateGroups[dateKey].totalWeight += Number(item.weight || 0);
    dateGroups[dateKey].totalCost += Number(item.total || 0);
    if (dateGroups[dateKey].products[item.product] !== undefined) {
      dateGroups[dateKey].products[item.product] += Number(item.weight || 0);
    }
  });

  // เรียงวันล่าสุดไว้บนสุด
  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

  container.innerHTML = sortedDates.map(dateKey => {
    const group = dateGroups[dateKey];
    return `
      <div class="date-group-card" onclick="openDateInDetail('${dateKey}')">
        <div class="date-group-header">
          <div class="date-group-title">
            📅 วันที่ ${group.dateFormatted}
          </div>
          <span class="date-group-badge">${group.items.length} บิล</span>
        </div>

        <div class="date-products-summary">
          <div class="product-pill">
            <span>หมึกหอม:</span> <strong>${formatWeight(group.products['หมึกหอม'])} กก.</strong>
          </div>
          <div class="product-pill">
            <span>หมึกกระดอง:</span> <strong>${formatWeight(group.products['หมึกกระดอง'])} กก.</strong>
          </div>
          <div class="product-pill">
            <span>หมึกกล้วย:</span> <strong>${formatWeight(group.products['หมึกกล้วย'])} กก.</strong>
          </div>
        </div>

        <div class="date-group-footer">
          <span class="date-footer-weight">รวม: ${formatWeight(group.totalWeight)} กก.</span>
          <span class="date-footer-amt text-danger">รวมเป็นเงิน: ${formatCurrency(group.totalCost)}</span>
        </div>

        <div class="date-hint-text">
          แตะเพื่อดูรายละเอียดบิลและซัพพลายเออร์ &rsaquo;
        </div>
      </div>
    `;
  }).join('');
}

/**
 * เปิด Modal ดูรายละเอียดรับเข้าของวันนั้นๆ
 */
function openDateInDetail(dateKey) {
  const items = STATE.stockIn.filter(r => getDateKey(r.timestamp) === dateKey);
  if (items.length === 0) return;

  const dateFormatted = formatDateOnlyThai(items[0].timestamp);
  document.getElementById('dateInDetailTitle').textContent = `📥 รับเข้า วันที่ ${dateFormatted}`;

  let totalWeight = 0;
  let totalCost = 0;
  items.forEach(r => {
    totalWeight += Number(r.weight || 0);
    totalCost += Number(r.total || 0);
  });

  const content = document.getElementById('dateInDetailContent');
  content.innerHTML = `
    <div class="detail-summary-box">
      <div>
        <div class="detail-item-label">น้ำหนักรับเข้าทั้งหมด</div>
        <div class="detail-item-val">${formatWeight(totalWeight)} กก.</div>
      </div>
      <div>
        <div class="detail-item-label">ยอดจ่ายรวมของวัน</div>
        <div class="detail-item-val text-danger">${formatCurrency(totalCost)}</div>
      </div>
    </div>

    <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom: 6px;">
      💡 แตะที่ชื่อซัพพลายเออร์ เพื่อดูประวัติและยอดรวมสะสมของซัพนั้นๆ
    </p>

    <div style="max-height: 340px; overflow-y: auto;">
      <table class="detail-table">
        <thead>
          <tr>
            <th>ซัพพลายเออร์</th>
            <th>สินค้า</th>
            <th>จำนวน</th>
            <th>ราคา/กก.</th>
            <th>รวมเงิน</th>
            <th>เวลา</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td>
                <button class="supplier-link-btn" onclick="openSupplierDetail('${escapeHtml(r.supplier)}')">
                  ⚓ ${escapeHtml(r.supplier)}
                </button>
              </td>
              <td><strong>${escapeHtml(r.product)}</strong></td>
              <td>${formatWeight(r.weight)} กก.</td>
              <td>฿${r.price}</td>
              <td class="text-danger font-bold">${formatCurrency(r.total)}</td>
              <td style="font-size:0.8rem; color:var(--text-muted);">${formatDateThai(r.timestamp).split(' ')[1] || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  openModal('modalDateInDetail');
}

/**
 * เปิดดูประวัติรวมของซัพพลายเออร์รายนั้นๆ
 */
function openSupplierDetail(supplierName) {
  document.getElementById('supDetailTitle').textContent = `⚓ ซัพพลายเออร์: ${supplierName}`;
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
        <div class="detail-item-label">ส่งมอบสะสมทั้งหมด</div>
        <div class="detail-item-val">${formatWeight(totalWeight)} กก.</div>
      </div>
      <div>
        <div class="detail-item-label">ยอดจ่ายสะสมทั้งหมด</div>
        <div class="detail-item-val text-danger">${formatCurrency(totalCost)}</div>
      </div>
    </div>

    <h4 style="font-size:1rem; margin-bottom: 8px;">ประวัติการรับเข้าทั้งหมด (${supplierRecords.length} บิล)</h4>
    <div style="max-height: 280px; overflow-y: auto;">
      <table class="detail-table">
        <thead>
          <tr>
            <th>วันที่</th>
            <th>สินค้า</th>
            <th>จำนวน</th>
            <th>ราคา/กก.</th>
            <th>รวม</th>
          </tr>
        </thead>
        <tbody>
          ${supplierRecords.map(r => `
            <tr>
              <td>${formatDateOnlyThai(r.timestamp)}</td>
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
  const datePicker = document.getElementById('outDatePicker');

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
      const range = chip.getAttribute('data-range');
      STATE.outFilterRange = range;
      STATE.outSummaryRange = range;
      STATE.outCustomDate = '';
      datePicker.value = '';
      datePicker.classList.remove('active');
      document.getElementById('outFilterLabel').textContent = chip.textContent;
      renderStockOutList();
    });
  });

  datePicker.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      dateChips.forEach(c => c.classList.remove('active'));
      STATE.outFilterRange = 'custom';
      STATE.outSummaryRange = 'custom';
      STATE.outCustomDate = val;
      datePicker.classList.add('active');
      document.getElementById('outFilterLabel').textContent = formatDateOnlyThai(val);
      renderStockOutList();
    }
  });

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

/**
 * แสดงรายการประวัติขายออก เป็น "รายวัน"
 */
function renderStockOutList() {
  const container = document.getElementById('outListContainer');

  // 1. คำนวณบล็อคสรุปด้านบน (เริ่มต้นคือคำนวณของ "วันนี้")
  const summaryItems = STATE.stockOut.filter(item => {
    return isDateMatchFilter(item.timestamp, STATE.outSummaryRange, STATE.outCustomDate);
  });

  let totalWeight = 0;
  let totalAmount = 0;
  let unpaidAmount = 0;

  summaryItems.forEach(item => {
    totalWeight += Number(item.weight || 0);
    totalAmount += Number(item.total || 0);
    if (item.status === 'รอชำระ') {
      unpaidAmount += Number(item.total || 0);
    }
  });

  document.getElementById('outTotalWeight').innerHTML = `${formatWeight(totalWeight)} <small>กก.</small>`;
  document.getElementById('outTotalAmount').textContent = formatCurrency(totalAmount);
  document.getElementById('outUnpaidAmount').textContent = formatCurrency(unpaidAmount);

  // 2. กรองรายการประวัติด้านล่าง (เริ่มต้นคือดึง "ทุกวันย้อนหลังทั้งหมด")
  const filtered = STATE.stockOut.filter(item => {
    const matchRange = isDateMatchFilter(item.timestamp, STATE.outFilterRange, STATE.outCustomDate);
    const matchSearch = !STATE.outSearchQuery || (item.customer && item.customer.toLowerCase().includes(STATE.outSearchQuery));
    return matchRange && matchSearch;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📤</div>
        <p>ไม่พบรายการขายตามเงื่อนไขที่เลือก</p>
      </div>`;
    return;
  }

  // จัดกลุ่มเป็นรายวัน
  const dateGroups = {};
  filtered.forEach(item => {
    const dateKey = getDateKey(item.timestamp);
    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = {
        dateKey,
        dateFormatted: formatDateOnlyThai(item.timestamp),
        items: [],
        totalWeight: 0,
        totalAmount: 0,
        unpaidAmount: 0,
        products: { 'หมึกหอม': 0, 'หมึกกระดอง': 0, 'หมึกกล้วย': 0 }
      };
    }
    dateGroups[dateKey].items.push(item);
    dateGroups[dateKey].totalWeight += Number(item.weight || 0);
    dateGroups[dateKey].totalAmount += Number(item.total || 0);
    if (item.status === 'รอชำระ') {
      dateGroups[dateKey].unpaidAmount += Number(item.total || 0);
    }
    if (dateGroups[dateKey].products[item.product] !== undefined) {
      dateGroups[dateKey].products[item.product] += Number(item.weight || 0);
    }
  });

  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));

  container.innerHTML = sortedDates.map(dateKey => {
    const group = dateGroups[dateKey];
    return `
      <div class="date-group-card" onclick="openDateOutDetail('${dateKey}')">
        <div class="date-group-header">
          <div class="date-group-title">
            📅 วันที่ ${group.dateFormatted}
          </div>
          <span class="date-group-badge">${group.items.length} รายการ</span>
        </div>

        <div class="date-products-summary">
          <div class="product-pill">
            <span>หมึกหอม:</span> <strong>${formatWeight(group.products['หมึกหอม'])} กก.</strong>
          </div>
          <div class="product-pill">
            <span>หมึกกระดอง:</span> <strong>${formatWeight(group.products['หมึกกระดอง'])} กก.</strong>
          </div>
          <div class="product-pill">
            <span>หมึกกล้วย:</span> <strong>${formatWeight(group.products['หมึกกล้วย'])} กก.</strong>
          </div>
        </div>

        <div class="date-group-footer">
          <span class="date-footer-weight">รวม: ${formatWeight(group.totalWeight)} กก.</span>
          <span class="date-footer-amt text-success">ยอดขาย: ${formatCurrency(group.totalAmount)}</span>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; padding: 0 4px;">
          <span>${group.unpaidAmount > 0 ? `<span class="badge warning-badge">รอชำระ ${formatCurrency(group.unpaidAmount)}</span>` : '<span class="badge" style="background:#dcfce7; color:#15803d;">ชำระครบแล้ว</span>'}</span>
          <span class="date-hint-text">แตะเพื่อดูรายละเอียดบิล &rsaquo;</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * เปิด Modal ดูรายละเอียดขายออกของวันนั้นๆ
 */
function openDateOutDetail(dateKey) {
  const items = STATE.stockOut.filter(r => getDateKey(r.timestamp) === dateKey);
  if (items.length === 0) return;

  const dateFormatted = formatDateOnlyThai(items[0].timestamp);
  document.getElementById('dateOutDetailTitle').textContent = `📤 การขาย วันที่ ${dateFormatted}`;

  let totalWeight = 0;
  let totalAmount = 0;
  let unpaidAmount = 0;
  items.forEach(r => {
    totalWeight += Number(r.weight || 0);
    totalAmount += Number(r.total || 0);
    if (r.status === 'รอชำระ') unpaidAmount += Number(r.total || 0);
  });

  const content = document.getElementById('dateOutDetailContent');
  content.innerHTML = `
    <div class="detail-summary-box">
      <div>
        <div class="detail-item-label">น้ำหนักขายรวม</div>
        <div class="detail-item-val">${formatWeight(totalWeight)} กก.</div>
      </div>
      <div>
        <div class="detail-item-label">ยอดขายรวม</div>
        <div class="detail-item-val text-success">${formatCurrency(totalAmount)}</div>
      </div>
      <div>
        <div class="detail-item-label">รอชำระ</div>
        <div class="detail-item-val text-warning">${formatCurrency(unpaidAmount)}</div>
      </div>
      <div>
        <div class="detail-item-label">จำนวนบิล</div>
        <div class="detail-item-val">${items.length} รายการ</div>
      </div>
    </div>

    <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom: 6px;">
      💡 แตะที่รายการเพื่อดูข้อมูลที่อยู่/เบอร์โทร หรือปรับสถานะชำระเงิน
    </p>

    <div style="max-height: 340px; overflow-y: auto;">
      <table class="detail-table">
        <thead>
          <tr>
            <th>ลูกค้า</th>
            <th>สินค้า</th>
            <th>จำนวน</th>
            <th>ราคา/กก.</th>
            <th>ยอดรวม</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr style="cursor:pointer;" onclick="openSaleDetail('${r.id}')">
              <td><strong>👤 ${escapeHtml(r.customer)}</strong></td>
              <td>${escapeHtml(r.product)}</td>
              <td>${formatWeight(r.weight)} กก.</td>
              <td>฿${r.price}</td>
              <td class="text-success font-bold">${formatCurrency(r.total)}</td>
              <td>
                <span class="status-badge ${r.status === 'ชำระเงินแล้ว' ? 'paid' : 'unpaid'}">
                  ${r.status === 'ชำระเงินแล้ว' ? 'ชำระแล้ว' : 'รอชำระ'}
                </span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  openModal('modalDateOutDetail');
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
        <div style="font-size:1rem; font-weight:600;">${item.phone || '-'}</div>
      </div>
      <div>
        <div class="detail-item-label">ที่อยู่ / จัดส่ง</div>
        <div style="font-size:1rem;">${escapeHtml(item.address || '-')}</div>
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
      ${item.paidAt ? `<div style="font-size:0.82rem; color:var(--text-muted); margin-top:4px; text-align:right;">ชำระเมื่อ: ${formatDateThai(item.paidAt)}</div>` : ''}
    </div>
  `;

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
  closeModal('modalDateOutDetail');
  showToast(`อัปเดตสถานะเป็น "${newStatus}" แล้ว`);
  renderStockOutList();
  renderDashboard();
}

// ================= TAB 3: แดชบอร์ด (Dashboard) =================
function initDashboardEvents() {
  // สรุปการเงิน วันนี้ / เดือนนี้ toggle
  const finBtns = document.querySelectorAll('#dashFinFilters .chip');
  finBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      finBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.dashFinRange = btn.getAttribute('data-finrange');
      renderDashboardFinancials();
    });
  });

  // สรุปยอดขายรายวัน filters
  const dailyBtns = document.querySelectorAll('#dashDailyRangeFilters .chip');
  const dailyPicker = document.getElementById('dashDailyDatePicker');

  dailyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dailyBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      STATE.dashDailyRange = btn.getAttribute('data-range');
      STATE.dashDailyCustomDate = '';
      dailyPicker.value = '';
      renderDailySalesSummary();
    });
  });

  dailyPicker.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      dailyBtns.forEach(b => b.classList.remove('active'));
      STATE.dashDailyRange = 'custom';
      STATE.dashDailyCustomDate = val;
      renderDailySalesSummary();
    }
  });
}

function renderDashboard() {
  // 1. สต๊อกคงเหลือปัจจุบัน (กระชับ แถวเดียว ไม่เอา icon)
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
  document.getElementById('dashStockKradong').innerHTML = `${formatWeight(kradongRemain)} <small>กก.</small>`;
  document.getElementById('dashStockKluay').innerHTML = `${formatWeight(kluayRemain)} <small>กก.</small>`;

  // 2. สรุปการเงิน (วันนี้ / เดือนนี้)
  renderDashboardFinancials();

  // 3. รายการลูกค้าที่ยังไม่ชำระ (เหมือนเดิม)
  renderDashboardUnpaidList();

  // 4. สรุปยอดขายรายวัน (ใหม่)
  renderDailySalesSummary();
}

function renderDashboardFinancials() {
  const isToday = STATE.dashFinRange === 'today';
  const labelSuffix = isToday ? 'วันนี้' : 'เดือนนี้';

  document.getElementById('dashFinExpenseLabel').textContent = `ค่าใช้จ่าย${labelSuffix}`;
  document.getElementById('dashFinProfitLabel').textContent = `กำไร${labelSuffix} (เฉพาะที่ชำระแล้ว)`;
  document.getElementById('dashFinRevenueLabel').textContent = `ยอดขายชำระแล้ว${labelSuffix}`;

  const { start, end } = getFilterRangeBounds(isToday ? 'today' : 'month');

  let expense = 0;
  STATE.stockIn.forEach(r => {
    const t = new Date(r.timestamp);
    if (t >= start && t <= end) {
      expense += Number(r.total || 0);
    }
  });

  let paidRevenue = 0;
  STATE.stockOut.forEach(r => {
    const t = new Date(r.timestamp);
    if (t >= start && t <= end && r.status === 'ชำระเงินแล้ว') {
      paidRevenue += Number(r.total || 0);
    }
  });

  const profit = paidRevenue - expense;

  document.getElementById('dashFinExpense').textContent = formatCurrency(expense);
  document.getElementById('dashFinRevenue').textContent = formatCurrency(paidRevenue);

  const profitEl = document.getElementById('dashFinProfit');
  profitEl.textContent = formatCurrency(profit);
  profitEl.className = 'fin-val ' + (profit >= 0 ? 'text-success' : 'text-danger');
}

function renderDashboardUnpaidList() {
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
        <span class="unpaid-name">👤 ${escapeHtml(r.customer)}</span>
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

/**
 * บล็อคใหม่: สรุปยอดขายรายวัน (ค่าใช้จ่ายรับเข้า, ขายได้ชำระแล้ว, กำไร)
 */
function renderDailySalesSummary() {
  const container = document.getElementById('dashDailySummaryList');
  if (!container) return;

  // รวบรวมวันที่ทั้งหมดที่มีในระบบ
  const allDates = new Set();
  STATE.stockIn.forEach(r => { if (r.timestamp) allDates.add(getDateKey(r.timestamp)); });
  STATE.stockOut.forEach(r => { if (r.timestamp) allDates.add(getDateKey(r.timestamp)); });

  // กรองวันที่ตามตัวเลือก
  let filteredDates = Array.from(allDates);
  if (STATE.dashDailyRange === 'custom') {
    filteredDates = filteredDates.filter(d => d === STATE.dashDailyCustomDate);
  } else if (STATE.dashDailyRange === 'month') {
    const { start, end } = getFilterRangeBounds('month');
    filteredDates = filteredDates.filter(d => {
      const dt = new Date(d);
      return dt >= start && dt <= end;
    });
  }

  // เรียงวันล่าสุดไว้บนสุด
  filteredDates.sort((a, b) => b.localeCompare(a));

  if (filteredDates.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 20px; color:var(--text-muted); font-size:0.95rem;">
        ไม่มีข้อมูลสรุปยอดขายในช่วงเวลาที่เลือก
      </div>`;
    return;
  }

  container.innerHTML = filteredDates.map(dateKey => {
    let dayExpense = 0;
    STATE.stockIn.forEach(r => {
      if (getDateKey(r.timestamp) === dateKey) {
        dayExpense += Number(r.total || 0);
      }
    });

    let dayPaidSales = 0;
    STATE.stockOut.forEach(r => {
      if (getDateKey(r.timestamp) === dateKey && r.status === 'ชำระเงินแล้ว') {
        dayPaidSales += Number(r.total || 0);
      }
    });

    const dayProfit = dayPaidSales - dayExpense;

    return `
      <div class="daily-summary-item">
        <div class="daily-sum-date">
          📅 ${formatDateOnlyThai(dateKey)}
        </div>
        <div class="daily-sum-stats">
          <span class="daily-stat-badge">
            <span style="color:var(--text-muted);">รับเข้า:</span>
            <strong class="text-danger">${formatCurrency(dayExpense)}</strong>
          </span>
          <span class="daily-stat-badge">
            <span style="color:var(--text-muted);">ขายได้(ชำระแล้ว):</span>
            <strong class="text-success">${formatCurrency(dayPaidSales)}</strong>
          </span>
          <span class="daily-stat-badge">
            <span style="color:var(--text-muted);">กำไร:</span>
            <strong class="${dayProfit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(dayProfit)}</strong>
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// ================= MODAL HELPERS =================
function initModals() {
  document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) {
      const modalId = closeBtn.getAttribute('data-close');
      closeModal(modalId);
    }
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
      fetchDataFromGoogle(true);
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
async function fetchDataFromGoogle(isManual = false) {
  if (!STATE.apiUrl) return;
  
  showLoadingOverlay();

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
      hideLoadingOverlay();
      if (isManual) showToast('รีเฟรชข้อมูลจาก Google Sheet สำเร็จ!');
    } else {
      throw new Error(data.message || 'Fetch failed');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    hideLoadingOverlay();
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
  initDashboardEvents();
  initRefreshButton();

  // เรนเดอร์หน้าจอเริ่มต้น
  renderStockInList();
  renderStockOutList();
  renderDashboard();

  // ดึงข้อมูลจริงจาก Google Sheet ทันที พร้อมแสดง Loading กลางจอ
  fetchDataFromGoogle();
});
