const app = document.querySelector("#app");
const modalHost = document.querySelector("#modalHost");
const toastHost = document.querySelector("#toastHost");
const viewTitle = document.querySelector("#viewTitle");

function closeModal() {
  modalHost.innerHTML = "";
}

function syncModalState() {
  const modal = modalHost.querySelector(".modal");
  document.body.classList.toggle("modal-open", Boolean(modal));
  if (!modal) return;
  const focusTarget = modal.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
  window.setTimeout(() => focusTarget?.focus(), 0);
}

new MutationObserver(syncModalState).observe(modalHost, { childList: true });

const state = {
  data: null,
  view: "dashboard",
  search: "",
  period: "2026-05",
  role: "admin",
  statusFilter: "all",
  quickFilter: "all",
  orderSort: { key: "date_order", dir: "desc" },
  orderView: "table",
  productTab: "catalog",
  dragOrderId: null,
  selected: {
    orders: new Set(),
    products: new Set(),
    customers: new Set(),
    vendors: new Set(),
    shipments: new Set(),
  },
};

let goalEditorDraft = null;

const chartColors = ["#2f6c62", "#7c2638", "#b07b28", "#5b4c8f", "#3f7b53", "#b23a48"];

const STATUS_ICONS = {
  tu_van: "message-circle",
  cho_coc: "circle-dollar-sign",
  dat_nguon: "package",
  san_xuat: "hammer",
  cho_giao: "package-check",
  dang_giao: "truck",
  hoan_tat: "check-circle",
  huy_hoan: "x-circle",
};

const STATUS_COLORS = {
  tu_van: "#5f72c7",
  cho_coc: "#b47b25",
  dat_nguon: "#2f6c62",
  san_xuat: "#7a4f91",
  cho_giao: "#287a59",
  dang_giao: "#2f73b8",
  hoan_tat: "#3f7b53",
  huy_hoan: "#b23a48",
};

const SHIPMENT_STATUSES = [
  { id: "pending_pickup", label: "Đang giao - Chờ lấy hàng" },
  { id: "picked_up", label: "Đang giao - Đã lấy hàng" },
  { id: "in_transit", label: "Đang giao - Vận chuyển" },
  { id: "delivering", label: "Đang giao - Đang phát" },
  { id: "delivered", label: "Đã giao / Hoàn tất" },
  { id: "failed", label: "Hoàn" },
  { id: "cancelled", label: "Hủy" },
];

const KPI_ICONS = {
  revenue: "trending-up",
  cost: "receipt",
  profit: "percent",
  receivable: "hourglass",
};

const ADDRESS_BOOK = {
  "TP. Hồ Chí Minh": {
    "Quận 1": ["Phường Bến Thành", "Phường Đa Kao", "Phường Nguyễn Thái Bình"],
    "Thủ Đức": ["Linh Chiểu", "Hiệp Bình Chánh", "Thảo Điền"],
    "Tân Bình": ["Phường 2", "Phường 4", "Phường 15"],
  },
  "Hà Nội": {
    "Đống Đa": ["Láng Hạ", "Ô Chợ Dừa", "Nam Đồng"],
    "Hoàn Kiếm": ["Hàng Bạc", "Tràng Tiền", "Cửa Đông"],
    "Cầu Giấy": ["Dịch Vọng", "Nghĩa Tân", "Yên Hòa"],
  },
  "Đà Nẵng": {
    "Hải Châu": ["Thạch Thang", "Hải Châu 1", "Phước Ninh"],
    "Sơn Trà": ["An Hải Bắc", "Phước Mỹ", "Mân Thái"],
  },
  "Thừa Thiên Huế": {
    "Huế": ["Phú Hội", "Vĩnh Ninh", "Thuận Thành"],
  },
};

const viewNames = {
  dashboard: "Dashboard",
  orders: "Deal",
  products: "Sản phẩm",
  customers: "Khách hàng",
  vendors: "Nguồn hàng",
  finance: "Tài chính",
  shipping: "Vận chuyển",
  settings: "Cấu hình",
};

const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("vi-VN");

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtMoney(value) {
  return moneyFormatter.format(Number(value || 0)).replace(/^-/, "−");
}

function fmtShortMoney(value) {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);
  let compact;
  if (abs >= 1_000_000_000) compact = `${(amount / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tỷ`;
  else if (abs >= 1_000_000) compact = `${(amount / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  else if (abs >= 1_000) compact = `${(amount / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}k`;
  else compact = fmtNumber(amount);
  return compact.replace(/^-/, "−");
}

function fmtDeltaMoney(value) {
  const amount = Number(value || 0);
  if (!amount) return "0";
  return `${amount > 0 ? "+" : "-"}${fmtShortMoney(Math.abs(amount))}`;
}

function fmtNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function fmtPercent(value) {
  return `${Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function moneyTone(value) {
  return Number(value || 0) < 0 ? "negative" : "";
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN");
}

function formatDateInput(value) {
  if (!value) return "";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

function parseViDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fmtDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN");
}

function fmtMarketTime(value) {
  if (!value) return "-";
  if (/^\d{1,2}:\d{2}/.test(String(value))) return value;
  return fmtDateTime(value);
}

function marketDelta(value) {
  const amount = Number(value || 0);
  if (!amount) return `<span class="market-delta neutral">0</span>`;
  const tone = amount > 0 ? "up" : "down";
  return `<span class="market-delta ${tone}">${amount > 0 ? "▲" : "▼"} ${fmtShortMoney(Math.abs(amount))}</span>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function statusLabel(id) {
  return state.data?.meta.order_statuses.find((status) => status.id === id)?.label || id;
}

function paymentLabel(id) {
  return state.data?.meta.payment_statuses.find((status) => status.id === id)?.label || id;
}

function optionTags(items, selected = "", blankLabel = "") {
  const options = blankLabel ? [`<option value="">${esc(blankLabel)}</option>`] : [];
  return options
    .concat(items.map((item) => {
      const value = typeof item === "object" ? item.id : item;
      const label = typeof item === "object" ? item.label : item;
      return `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
    }))
    .join("");
}

function canSeeFinancials() {
  return ["admin", "accounting"].includes(state.role);
}

function canSeeCosts() {
  return ["admin", "accounting", "ops"].includes(state.role);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

async function loadData() {
  state.data = await api("/api/bootstrap");
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  toastHost.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function isInPeriod(dateValue) {
  if (state.period === "all") return true;
  if (!dateValue) return false;
  const date = String(dateValue).slice(0, 10);
  if (state.period.includes("-Q")) {
    const [year, quarterRaw] = state.period.split("-Q");
    const month = Number(date.slice(5, 7));
    const quarter = Math.ceil(month / 3);
    return date.startsWith(year) && String(quarter) === quarterRaw;
  }
  return date.startsWith(state.period);
}

function orderMatchesSearch(order) {
  const needle = state.search.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    order.order_code,
    order.product_type,
    order.product_name,
    order.product_summary,
    ...(order.items || []).flatMap((item) => [item.product_id, item.product_name, item.note, item.specs?.stone]),
    order.customer?.full_name,
    order.customer?.phone,
    order.customer?.account,
    order.customer?.channel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function filteredOrders({ ignoreStatus = false } = {}) {
  return state.data.orders
    .filter((order) => isInPeriod(order.date_order) || isInPeriod(order.payment_date))
    .filter(orderMatchesSearch)
    .filter((order) => ignoreStatus || state.statusFilter === "all" || order.status === state.statusFilter)
    .filter((order) => state.quickFilter === "all" || (state.quickFilter === "overdue" && order.overdue) || (state.quickFilter === "receivable" && order.balance_due > 0))
    .sort((a, b) => {
      const dir = state.orderSort.dir === "asc" ? 1 : -1;
      const key = state.orderSort.key;
      const av = a[key] ?? "";
      const bv = b[key] ?? "";
      if (typeof av === "number" || typeof bv === "number") return (Number(av || 0) - Number(bv || 0)) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
}

function periodExpenses() {
  return state.data.expenses.filter((expense) => isInPeriod(expense.date));
}

function sum(list, getter) {
  return list.reduce((total, item) => total + Number(getter(item) || 0), 0);
}

function groupBy(list, keyGetter, valueGetter = () => 1) {
  return list.reduce((acc, item) => {
    const key = keyGetter(item) || "Khác";
    acc[key] = (acc[key] || 0) + Number(valueGetter(item) || 0);
    return acc;
  }, {});
}

function sortedEntries(record) {
  return Object.entries(record).sort((a, b) => b[1] - a[1]);
}

function receivableRows(orders = state.data.orders) {
  return orders
    .filter((order) => order.balance_due > 0 && order.status !== "huy_hoan")
    .map((order) => {
      const baseDate = order.payment_date || order.date_order;
      const age = baseDate ? Math.max(0, Math.floor((Date.now() - new Date(`${baseDate}T00:00:00`).getTime()) / 86400000)) : 0;
      return { ...order, debt_age: age };
    })
    .sort((a, b) => b.debt_age - a.debt_age);
}

function todoItems(baseOrders = state.data.orders.filter((order) => order.status !== "huy_hoan")) {
  const orders = baseOrders.filter((order) => order.status !== "huy_hoan");
  const orderIds = new Set(orders.map((order) => order.id));
  const staleShipments = state.data.shipments.filter((shipment) => {
    if (["delivered", "failed", "cancelled"].includes(shipment.status)) return false;
    if (!orderIds.has(shipment.order_id)) return false;
    const last = shipment.status_history?.at(-1)?.at || shipment.created_at;
    return Date.now() - new Date(last).getTime() > 36 * 60 * 60 * 1000;
  });
  return [
    ...orders.filter((order) => order.overdue).map((order) => ({
      tone: "danger",
      label: "Quá hạn",
      text: `${order.order_code} · ${order.customer?.full_name || ""}`,
      meta: `Due ${fmtDate(order.due_date)}`,
      icon: "triangle-alert",
      metaIcon: "calendar-clock",
      status: order.status,
      orderId: order.id,
    })),
    ...orders.filter((order) => order.payment_status === "chua_coc").map((order) => ({
      tone: "warning",
      label: "Chưa cọc",
      text: `${order.order_code} · ${order.product_name}`,
      meta: fmtMoney(order.price),
      icon: STATUS_ICONS[order.status],
      metaIcon: "circle-dollar-sign",
      status: order.status,
      orderId: order.id,
    })),
    ...receivableRows(orders).slice(0, 4).map((order) => ({
      tone: order.debt_age > 14 ? "danger" : "warning",
      label: "Công nợ",
      text: `${order.customer?.full_name || ""} còn ${fmtMoney(order.balance_due)}`,
      meta: `${order.debt_age} ngày`,
      icon: order.debt_age > 14 ? "triangle-alert" : STATUS_ICONS[order.status],
      metaIcon: "clock-3",
      status: order.status,
      orderId: order.id,
    })),
    ...staleShipments.map((shipment) => ({
      tone: "warning",
      label: "Vận đơn treo",
      text: shipment.tracking_code,
      meta: shipment.status_label,
      icon: "truck",
      metaIcon: "route",
      status: "dang_giao",
      orderId: shipment.order_id,
    })),
  ].slice(0, 8);
}

function searchSummary(count, label) {
  if (!state.search.trim()) return "";
  return `<span class="tag">Tìm "${esc(state.search.trim())}" · ${fmtNumber(count)} ${esc(label)}</span>`;
}

function searchNotice(count, label) {
  const keyword = state.search.trim();
  if (!keyword) return "";
  return `
    <div class="filter-notice">
      <span><strong>Đang lọc:</strong> “${esc(keyword)}” · ${fmtNumber(count)} ${esc(label)}</span>
      <button class="ghost" data-action="clear-search" aria-label="Xóa tìm kiếm"><i data-lucide="x"></i><span>Xóa</span></button>
    </div>
  `;
}

function emptyState(icon, title, detail = "", action = "") {
  return `
    <div class="empty compact">
      <i data-lucide="${esc(icon)}"></i>
      <strong>${esc(title)}</strong>
      ${detail ? `<span>${esc(detail)}</span>` : ""}
      ${action}
    </div>
  `;
}

function selectedIds(entity) {
  return [...(state.selected[entity] || new Set())];
}

function isSelected(entity, id) {
  return state.selected[entity]?.has(id);
}

function clearSelection(entity) {
  if (state.selected[entity]) state.selected[entity].clear();
}

function rowSelect(entity, id, label) {
  return `<input class="row-select" type="checkbox" data-action="toggle-select" data-entity="${esc(entity)}" data-id="${esc(id)}" aria-label="Chọn ${esc(label)}" ${isSelected(entity, id) ? "checked" : ""}>`;
}

function selectAllBox(entity, ids) {
  const selected = selectedIds(entity);
  const allVisibleSelected = ids.length > 0 && ids.every((id) => state.selected[entity]?.has(id));
  return `<input class="row-select" type="checkbox" data-action="toggle-select-all" data-entity="${esc(entity)}" data-ids="${esc(ids.join(","))}" aria-label="Chọn tất cả" ${allVisibleSelected ? "checked" : ""} ${ids.length ? "" : "disabled"}>`;
}

function rowActions(entity, id, label) {
  return `
    <div class="row-actions">
      <button class="ghost" data-action="edit-${esc(entity)}" data-id="${esc(id)}" aria-label="Sửa ${esc(label)}" title="Sửa"><i data-lucide="pen-line"></i></button>
      <button class="ghost danger-link" data-action="delete-${esc(entity)}" data-id="${esc(id)}" aria-label="Xóa ${esc(label)}" title="Xóa"><i data-lucide="trash-2"></i></button>
    </div>
  `;
}

function bulkBar(entity, label) {
  const count = selectedIds(entity).length;
  if (!count) return "";
  return `
    <section class="bulk-bar">
      <span><strong>${fmtNumber(count)}</strong> ${esc(label)} đã chọn</span>
      <div class="toolbar-right">
        <button class="button" data-action="bulk-edit" data-entity="${esc(entity)}"><i data-lucide="pen-line"></i><span>Sửa hàng loạt</span></button>
        <button class="danger" data-action="bulk-delete" data-entity="${esc(entity)}"><i data-lucide="trash-2"></i><span>Xóa hàng loạt</span></button>
        <button class="ghost" data-action="clear-selection" data-entity="${esc(entity)}"><i data-lucide="x"></i><span>Bỏ chọn</span></button>
      </div>
    </section>
  `;
}

function kpiCard(label, value, note = "", tone = "", options = {}) {
  const icon = options.icon || "circle";
  const trend = options.trend;
  const trendText = trend?.label || "";
  const trendClass = trend?.sentiment || trend?.direction || (trend?.value >= 0 ? "up" : "down");
  const actionAttrs = options.action ? ` role="button" tabindex="0" data-action="${esc(options.action)}" ${options.view ? `data-view="${esc(options.view)}"` : ""} ${options.filter ? `data-filter="${esc(options.filter)}"` : ""}` : "";
  return `
    <article class="kpi-card ${options.action ? "is-clickable" : ""}"${actionAttrs}>
      <div class="kpi-top">
        <span>${esc(label)}</span>
        <i data-lucide="${esc(icon)}"></i>
      </div>
      <strong class="${tone}">${esc(value)}</strong>
      <em>${esc(note)}</em>
      ${trend ? `<small class="trend ${trendClass}">${esc(trendText)}</small>` : ""}
    </article>
  `;
}

function statusPill(status) {
  return `<span class="status-pill status-${esc(status)}"><i data-lucide="${esc(STATUS_ICONS[status] || "circle")}"></i>${esc(statusLabel(status))}</span>`;
}

function donutChart(entries) {
  const total = entries.reduce((value, [, amount]) => value + amount, 0);
  if (!total) return emptyState("pie-chart", "Chưa có dữ liệu trong kỳ", "Thử chọn kỳ khác hoặc tạo deal mới.");
  let cursor = 0;
  const stops = entries
    .map(([, amount], index) => {
      const start = cursor;
      const end = cursor + (amount / total) * 100;
      cursor = end;
      const color = chartColors[index % chartColors.length];
      return `${color} ${start}% ${end}%`;
    })
    .join(", ");
  return `
    <div class="donut-layout">
      <div class="donut" style="background: conic-gradient(${stops});"></div>
      <div class="legend">
        ${entries
          .map(([label, amount], index) => {
            const percent = Math.round((amount / total) * 1000) / 10;
            return `
              <div class="legend-row" title="${esc(label)}: ${fmtNumber(amount)} đơn · ${fmtPercent(percent)}">
                <span class="swatch" style="background:${chartColors[index % chartColors.length]}"></span>
                <span>${esc(label)}</span>
                <strong>${fmtNumber(amount)} · ${fmtPercent(percent)}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function barChart(entries, formatter = fmtMoney) {
  const max = Math.max(1, ...entries.map(([, value]) => value));
  const total = entries.reduce((value, [, amount]) => value + amount, 0);
  if (!entries.length) return emptyState("bar-chart-3", "Chưa có dữ liệu trong kỳ", "Khi có dữ liệu, biểu đồ sẽ tự cập nhật.");
  return `
    <div class="bar-list">
      ${entries
        .map(([label, value], index) => {
          const width = Math.max(3, Math.round((value / max) * 100));
          const percent = total ? Math.round((value / total) * 1000) / 10 : 0;
          return `
            <div class="bar-row" title="${esc(label)}: ${esc(formatter(value))} · ${fmtPercent(percent)}">
              <span>${esc(label)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${chartColors[index % chartColors.length]}"></div></div>
              <strong class="money">${esc(formatter(value))}<small>${fmtPercent(percent)}</small></strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function lineChart(series) {
  const width = Math.max(720, series.length * 90);
  const height = 240;
  const pad = 28;
  const scaleMax = Math.max(1, ...series.flatMap((point) => [point.revenue, point.profit, point.target || 0]));
  const xStep = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
  const points = (key) =>
    series
      .map((point, index) => {
        const x = pad + index * xStep;
        const y = height - pad - (point[key] / scaleMax) * (height - pad * 2);
        return `${x},${y}`;
      })
      .join(" ");
  const latestTarget = series.at(-1)?.target || 0;
  return `
    <div class="line-chart-scroll"><svg class="line-chart" style="min-width:${width}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="Doanh thu và lợi nhuận theo tháng">
      ${[0, 0.25, 0.5, 0.75, 1]
        .map((ratio) => {
          const y = height - pad - ratio * (height - pad * 2);
          return `<line x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}" stroke="#ebece6" /><text x="4" y="${y + 4}" font-size="11" fill="#6e6a61">${fmtShortMoney(scaleMax * ratio)}</text>`;
        })
        .join("")}
      <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="#dedbd2" />
      <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="#dedbd2" />
      <polyline points="${points("target")}" fill="none" stroke="#b07b28" stroke-width="2" stroke-dasharray="6 6" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${points("revenue")}" fill="none" stroke="#2f6c62" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points="${points("profit")}" fill="none" stroke="#7c2638" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${series
        .map((point, index) => {
          const x = pad + index * xStep;
          const revenueY = height - pad - (point.revenue / scaleMax) * (height - pad * 2);
          return `<circle cx="${x}" cy="${revenueY}" r="4" fill="#2f6c62"><title>Doanh thu T${point.label}: ${fmtMoney(point.revenue)}</title></circle>`;
        })
        .join("")}
      ${series
        .map((point, index) => {
          const x = pad + index * xStep;
          return `<text x="${x}" y="${height - 6}" text-anchor="middle" font-size="12" fill="#6e6a61">T${esc(point.label)}</text>`;
        })
        .join("")}
    </svg></div>
    <div class="legend-row"><span class="swatch" style="background:#2f6c62"></span><span>Doanh thu</span><strong></strong></div>
    <div class="legend-row"><span class="swatch" style="background:#7c2638"></span><span>Lợi nhuận</span><strong></strong></div>
    <div class="legend-row"><span class="swatch dashed" style="background:#b07b28"></span><span>Mục tiêu tự đặt</span><strong>${fmtMoney(latestTarget)}</strong></div>
  `;
}

function renderTodoPanel(orders) {
  const items = todoItems(orders);
  return `
    <article class="panel">
      <div class="panel-header">
        <h2>Việc cần làm</h2>
        <span class="tag">${items.length} mục</span>
      </div>
      <div class="panel-body">
        ${
          items.length
            ? items
                .map(
                  (item) => `
            <button class="todo-row ${esc(item.tone)}" data-action="open-order" data-order-id="${esc(item.orderId)}">
              <span class="todo-icon"><i data-lucide="${esc(item.icon || STATUS_ICONS[item.status] || "circle-alert")}"></i></span>
              <span><strong class="todo-label">${esc(item.label)}</strong><br><small>${esc(item.text)}</small></span>
              <em class="todo-meta"><i data-lucide="${esc(item.metaIcon || "info")}"></i>${esc(item.meta)}</em>
            </button>
          `,
                )
                .join("")
            : `<div class="empty compact">Không có cảnh báo trong kỳ này</div>`
        }
      </div>
    </article>
  `;
}

function renderReceivableList(rows) {
  if (!rows.length) return `<div class="empty compact">Không còn khoản phải thu</div>`;
  return rows
    .map(
      (order) => `
        <button class="metric-row action-row" data-action="open-order" data-order-id="${esc(order.id)}">
          <span><strong>${esc(order.customer?.full_name || "")}</strong><br><small>${esc(order.order_code)} · ${order.debt_age} ngày</small></span>
          <strong>${fmtMoney(order.balance_due)}</strong>
        </button>
      `,
    )
    .join("");
}

function pipelineChart(orders) {
  const entries = state.data.meta.order_statuses.map((status) => {
    const items = orders.filter((order) => order.status === status.id);
    return [status.label, sum(items, (order) => order.price), items.length, status.id];
  });
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return `
    <div class="bar-list compact-bars">
      ${entries
        .map(([label, value, count, status], index) => {
          const width = Math.max(3, Math.round((value / max) * 100));
          return `
            <button class="bar-row action-row" title="${esc(label)}: ${fmtMoney(value)} · ${count} deal" data-action="filter-status" data-status-id="${esc(status)}">
              <span>${statusPill(status)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${chartColors[index % chartColors.length]}"></div></div>
              <strong class="money">${fmtShortMoney(value)}<small>${count} deal</small></strong>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function agingChart(rows) {
  const buckets = [
    ["0-7 ngày", (age) => age <= 7],
    ["8-15 ngày", (age) => age >= 8 && age <= 15],
    ["16-30 ngày", (age) => age >= 16 && age <= 30],
    [">30 ngày", (age) => age > 30],
  ].map(([label, test]) => [label, sum(rows.filter((order) => test(order.debt_age)), (order) => order.balance_due)]);
  return barChart(buckets, fmtShortMoney);
}

function marginChart(orders) {
  const byType = Object.entries(
    orders.reduce((acc, order) => {
      const key = order.product_type || "Khác";
      if (!acc[key]) acc[key] = { revenue: 0, profit: 0 };
      acc[key].revenue += Number(order.price || 0);
      acc[key].profit += Number(order.profit || 0);
      return acc;
    }, {}),
  )
    .map(([label, item]) => [label, item.revenue, item.profit, item.revenue ? Math.round((item.profit / item.revenue) * 1000) / 10 : 0])
    .sort((a, b) => b[2] - a[2]);
  if (!byType.length) return emptyState("percent", "Chưa có dữ liệu biên lợi nhuận", "Hãy chọn kỳ khác hoặc tạo đơn mới.");
  const max = Math.max(1, ...byType.map(([, revenue]) => revenue));
  return `
    <div class="bar-list">
      ${byType
        .map(([label, revenue, profit, margin], index) => `
          <div class="bar-row" title="${esc(label)}: doanh thu ${fmtMoney(revenue)}, lãi ${fmtMoney(profit)}, biên ${fmtPercent(margin)}">
            <span>${esc(label)}</span>
            <div class="dual-bar">
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.round((revenue / max) * 100))}%;background:#2f6c62"></div></div>
              <div class="bar-track slim"><div class="bar-fill" style="width:${Math.max(3, Math.round((Math.max(profit, 0) / max) * 100))}%;background:${chartColors[(index + 1) % chartColors.length]}"></div></div>
            </div>
            <strong class="money ${moneyTone(profit)}">${fmtPercent(margin)}<small>${fmtShortMoney(profit)}</small></strong>
          </div>
        `)
        .join("")}
    </div>
  `;
}

const GOAL_METRICS = [
  { id: "revenue", label: "Doanh thu", format: fmtMoney },
  { id: "profit", label: "Lợi nhuận", format: fmtMoney },
  { id: "orders", label: "Số deal", format: fmtNumber },
  { id: "aov", label: "Giá trị đơn TB", format: fmtMoney },
];

function goalMetric(metric) {
  return GOAL_METRICS.find((item) => item.id === metric) || GOAL_METRICS[0];
}

function goalActual(goal, orders) {
  const revenue = sum(orders, (order) => order.price);
  if (goal.metric === "profit") return sum(orders, (order) => order.profit);
  if (goal.metric === "orders") return orders.length;
  if (goal.metric === "aov") return orders.length ? revenue / orders.length : 0;
  return revenue;
}

function goalMonthsInPeriod(months) {
  if (state.period === "all") return months;
  if (state.period.includes("-Q")) {
    const [year, quarterRaw] = state.period.split("-Q");
    const start = (Number(quarterRaw) - 1) * 3 + 1;
    return months.filter((month) => month.startsWith(`${year}-`) && Number(month.slice(5)) >= start && Number(month.slice(5)) < start + 3);
  }
  return months.filter((month) => month === state.period);
}

function goalTarget(goal, months) {
  const values = goalMonthsInPeriod(months).map((month) => Number(goal.targets?.[month] || 0));
  if (!values.length) return 0;
  const total = values.reduce((result, value) => result + value, 0);
  return goal.metric === "aov" ? total / values.length : total;
}

function renderGoalProgress(orders) {
  const settings = state.data.settings || {};
  const goals = settings.business_goals || [];
  const months = settings.goal_months || [];
  if (!goals.length) return "";
  return `
    <section class="panel goal-progress-panel">
      <div class="panel-header">
        <div><h2>Tiến độ mục tiêu</h2><p class="small muted">Theo kỳ đang chọn; số liệu thực tế lấy từ deal, mục tiêu do shop cấu hình.</p></div>
        <button class="ghost" data-action="edit-revenue-targets" title="Cấu hình mục tiêu"><i data-lucide="settings-2"></i><span>Cấu hình</span></button>
      </div>
      <div class="panel-body goal-progress-grid">
        ${goals.map((goal) => {
          const metric = goalMetric(goal.metric);
          const actual = goalActual(goal, orders);
          const target = goalTarget(goal, months);
          const progress = target > 0 ? Math.max(0, Math.round((actual / target) * 100)) : 0;
          return `<article class="goal-progress-item" style="--goal-color:${esc(goal.color || chartColors[0])}">
            <div class="goal-progress-heading"><span>${esc(goal.name)}</span><strong>${target ? `${fmtNumber(progress)}%` : "Chưa đặt"}</strong></div>
            <div class="goal-progress-values"><strong>${metric.format(actual)}</strong><span>/ ${target ? metric.format(target) : "-"}</span></div>
            <div class="goal-progress-track"><span style="width:${Math.min(progress, 100)}%"></span></div>
            <small>${esc(metric.label)}${progress > 100 ? ` · vượt ${fmtNumber(progress - 100)}%` : ""}</small>
          </article>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderDashboard() {
  const orders = filteredOrders({ ignoreStatus: true }).filter((order) => order.status !== "huy_hoan");
  const expenses = periodExpenses();
  const revenue = sum(orders, (order) => order.price);
  const cogs = sum(orders, (order) => order.total_cost);
  const profit = revenue - cogs;
  const opEx = sum(expenses, (expense) => expense.amount);
  const netProfit = profit - opEx;
  const receivable = sum(orders, (order) => order.balance_due);
  const aov = orders.length ? revenue / orders.length : 0;
  const margin = revenue ? Math.round((profit / revenue) * 1000) / 10 : 0;
  const productCounts = sortedEntries(groupBy(orders, (order) => order.product_type));
  const revenueByType = sortedEntries(groupBy(orders, (order) => order.product_type, (order) => order.price));
  const expenseByCategory = sortedEntries(groupBy(expenses, (expense) => expense.category, (expense) => expense.amount));
  const monthlySeries = buildMonthlySeries();
  const previous = previousMonthPeriod(state.period);
  const previousStats = previous ? periodStats(previous, { applySearch: true }) : null;
  const debtRows = receivableRows(orders);

  return `
    <div class="stack">
      ${searchNotice(orders.length, "deal trong dashboard")}
      <section class="kpi-grid">
        ${kpiCard("Tổng doanh thu", fmtMoney(revenue), `${fmtNumber(orders.length)} đơn trong kỳ`, "", { icon: KPI_ICONS.revenue, trend: previousStats && trendFor(revenue, previousStats.revenue, "positive"), action: "switch-view", view: "orders" })}
        ${canSeeCosts() ? kpiCard("Tổng chi phí", fmtMoney(cogs), "Giá vốn + phí ship", "", { icon: KPI_ICONS.cost, trend: previousStats && trendFor(cogs, previousStats.cogs, "risk"), action: "switch-view", view: "vendors" }) : kpiCard("Tổng chi phí", "Ẩn theo quyền", "Chọn Admin/Kế toán để xem", "", { icon: KPI_ICONS.cost })}
        ${canSeeFinancials() ? kpiCard("Lợi nhuận gộp", fmtMoney(profit), `Biên ${fmtPercent(margin)}`, moneyTone(profit), { icon: KPI_ICONS.profit, trend: previousStats && trendFor(profit, previousStats.profit, "positive"), action: "switch-view", view: "finance" }) : kpiCard("Lợi nhuận gộp", "Ẩn theo quyền", "Trường nhạy cảm", "", { icon: KPI_ICONS.profit })}
        ${kpiCard("Tiền chờ thu", fmtMoney(receivable), `AOV ${fmtMoney(aov)}`, "", { icon: KPI_ICONS.receivable, trend: previousStats && trendFor(receivable, previousStats.receivable, "risk"), action: "switch-view", view: "finance", filter: "receivable" })}
      </section>

      ${renderGoalProgress(orders)}

      <section class="grid-2">
        ${renderTodoPanel(orders)}
        <article class="panel">
          <div class="panel-header"><h2>Công nợ phải thu</h2><span class="tag">${fmtMoney(receivable)}</span></div>
          <div class="panel-body">${renderReceivableList(debtRows.slice(0, 5))}</div>
        </article>
      </section>

      <section class="grid-2">
        <article class="panel charts">
          <div class="panel-header"><h2>Đơn theo loại sản phẩm</h2><span class="tag">${esc(state.period)}</span></div>
          <div class="panel-body">${donutChart(productCounts)}</div>
        </article>
        <article class="panel charts">
          <div class="panel-header"><h2>Doanh thu theo loại sản phẩm</h2><span class="tag">VNĐ</span></div>
          <div class="panel-body">${barChart(revenueByType, fmtShortMoney)}</div>
        </article>
      </section>

      <section class="grid-2">
        <article class="panel charts">
          <div class="panel-header">
            <h2>Doanh thu theo tháng</h2>
            <div class="toolbar-right">
              <span class="tag">Mục tiêu tự đặt</span>
              <button class="ghost" data-action="edit-revenue-targets" title="Sửa mục tiêu doanh thu"><i data-lucide="target"></i><span>Sửa mục tiêu</span></button>
            </div>
          </div>
          <div class="panel-body">${lineChart(monthlySeries)}</div>
        </article>
        <article class="panel charts">
          <div class="panel-header"><h2>Chi phí theo nhóm</h2><span class="tag">Lãi/lỗ</span></div>
          <div class="panel-body">
            ${barChart(expenseByCategory, fmtMoney)}
            <div class="metric-row"><span>Lợi nhuận thuần</span><strong class="${netProfit < 0 ? "negative" : ""}">${canSeeFinancials() ? fmtMoney(netProfit) : "Ẩn theo quyền"}</strong></div>
            ${netProfit < 0 && canSeeFinancials() ? `<p class="small warning-text">Chi phí vận hành đang lớn hơn lãi gộp trong kỳ lọc, cần kiểm tra nhóm chi phí cao nhất.</p>` : ""}
          </div>
        </article>
      </section>

      <section class="grid-3">
        <article class="panel charts">
          <div class="panel-header"><h2>Phễu pipeline</h2><span class="tag">Deal + giá trị</span></div>
          <div class="panel-body">${pipelineChart(orders)}</div>
        </article>
        <article class="panel charts">
          <div class="panel-header"><h2>Tuổi nợ công nợ</h2><span class="tag">Tuổi nợ</span></div>
          <div class="panel-body">${agingChart(debtRows)}</div>
        </article>
        <article class="panel charts">
          <div class="panel-header"><h2>Biên lợi nhuận theo loại</h2><span class="tag">DT vs Lợi nhuận</span></div>
          <div class="panel-body">${canSeeFinancials() ? marginChart(orders) : emptyState("lock", "Ẩn theo quyền", "Chọn Admin/Kế toán để xem biên lợi nhuận.")}</div>
        </article>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Bảng đơn trên dashboard</h2>
          <div class="toolbar-right">
            <a class="button" href="/api/export/orders.csv?role=${esc(state.role)}"><i data-lucide="download"></i><span>CSV</span></a>
          </div>
        </div>
        <div class="table-wrap">${ordersTable(orders.slice(0, 8))}</div>
      </section>
    </div>
  `;
}

function buildMonthlySeries() {
  const settings = state.data.settings || {};
  const months = settings.goal_months?.length ? settings.goal_months : ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const revenueGoal = (settings.business_goals || []).find((goal) => goal.metric === "revenue");
  const targets = revenueGoal?.targets || settings.monthly_revenue_targets || {};
  const defaultTarget = revenueGoal ? 0 : Number(settings.default_monthly_revenue_target || 0);
  return months.map((month) => {
    const monthOrders = state.data.orders.filter((order) => String(order.date_order).startsWith(month) && order.status !== "huy_hoan");
    return {
      month,
      label: `${month.slice(5)}/${month.slice(2, 4)}`,
      revenue: sum(monthOrders, (order) => order.price),
      profit: sum(monthOrders, (order) => order.profit),
      target: Number(targets[month] ?? defaultTarget),
    };
  });
}

function previousMonthPeriod(period) {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function periodStats(period, options = {}) {
  const orders = state.data.orders
    .filter((order) => order.status !== "huy_hoan" && (period === "all" || String(order.date_order).startsWith(period) || String(order.payment_date || "").startsWith(period)))
    .filter((order) => !options.applySearch || orderMatchesSearch(order));
  const expenses = state.data.expenses.filter((expense) => period === "all" || String(expense.date).startsWith(period));
  const revenue = sum(orders, (order) => order.price);
  const cogs = sum(orders, (order) => order.total_cost);
  const profit = revenue - cogs;
  const receivable = sum(orders, (order) => order.balance_due);
  return { revenue, cogs, profit, receivable, expenses: sum(expenses, (expense) => expense.amount) };
}

function trendFor(current, previous, semantic = "positive") {
  if (previous === null || previous === undefined) return null;
  const diff = Number(current || 0) - Number(previous || 0);
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const isRiskMetric = semantic === "risk";
  const sentiment = direction === "flat" ? "flat" : isRiskMetric === (diff > 0) ? "bad" : "good";
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "•";
  return { value: diff, direction, sentiment, label: `${arrow} ${fmtDeltaMoney(diff)} so kỳ trước` };
}

function sortHeader(label, key, className = "") {
  const active = state.orderSort.key === key;
  const icon = active ? (state.orderSort.dir === "asc" ? "arrow-up" : "arrow-down") : "chevrons-up-down";
  return `<th class="${className} ${active ? "is-sorted" : ""}"><button class="th-sort ${active ? "is-active" : ""}" data-action="sort-orders" data-sort-key="${esc(key)}" aria-sort="${active ? (state.orderSort.dir === "asc" ? "ascending" : "descending") : "none"}">${esc(label)} <i data-lucide="${icon}"></i></button></th>`;
}

function ordersTable(orders) {
  if (!orders.length) return emptyState("inbox", "Không có đơn phù hợp bộ lọc", "Thử đổi kỳ, trạng thái hoặc từ khóa tìm kiếm.", `<button class="button" data-action="new-order"><i data-lucide="plus"></i><span>Tạo deal</span></button>`);
  const orderIds = orders.map((order) => order.id);
  return `
    <table class="orders-table">
      <thead>
        <tr>
          <th class="select-col">${selectAllBox("orders", orderIds)}</th>
          ${sortHeader("Mã đơn", "order_code")}
          <th>Khách</th>
          <th>Sản phẩm</th>
          <th>Trạng thái</th>
          ${sortHeader("Due date", "due_date")}
          ${sortHeader("Doanh thu", "price", "money")}
          ${sortHeader("Giá vốn", "total_cost", "money")}
          ${sortHeader("Lãi", "profit", "money")}
          ${sortHeader("Còn thu", "balance_due", "money")}
        </tr>
      </thead>
      <tbody>
        ${orders
          .map(
            (order) => `
          <tr data-action="open-order" data-order-id="${esc(order.id)}">
            <td data-label="Chọn" class="select-col">${rowSelect("orders", order.id, order.order_code)}</td>
            <td data-label="Mã đơn" class="order-code-cell"><strong>${esc(order.order_code)}</strong><br><span class="small muted">${fmtDate(order.date_order)}</span>${rowActions("orders", order.id, order.order_code)}</td>
            <td data-label="Khách">${esc(order.customer?.full_name || "")}<br><span class="small muted">${esc(order.customer?.phone || "")}</span></td>
            <td data-label="Sản phẩm">${esc(order.product_summary || order.product_name)}<br><span class="small muted">${fmtNumber(order.product_count || 1)} sản phẩm</span></td>
            <td data-label="Trạng thái">${statusPill(order.status)}</td>
            <td data-label="Due date" class="${order.overdue ? "overdue" : ""}">${fmtDate(order.due_date)}<br><span class="small muted">${order.days_since_order} ngày</span></td>
            <td data-label="Doanh thu" class="money">${fmtMoney(order.price)}</td>
            <td data-label="Giá vốn" class="money">${canSeeCosts() ? (order.total_cost ? fmtMoney(order.total_cost) : `<span class="muted">—</span>`) : "Ẩn"}</td>
            <td data-label="Lãi" class="money ${moneyTone(order.profit)}">${canSeeFinancials() ? fmtMoney(order.profit) : "Ẩn"}</td>
            <td data-label="Còn thu" class="money">${fmtMoney(order.balance_due)}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderOrders() {
  const orders = filteredOrders();
  const statusOptions = [
    `<option value="all">Tất cả trạng thái</option>`,
    ...state.data.meta.order_statuses.map((status) => `<option value="${esc(status.id)}" ${state.statusFilter === status.id ? "selected" : ""}>${esc(status.label)}</option>`),
  ].join("");

  return `
    <div class="stack">
      <section class="toolbar">
        <div class="toolbar-left">
          <select id="statusFilter">${statusOptions}</select>
          <select id="quickFilter" aria-label="Lọc nhanh">
            <option value="all" ${state.quickFilter === "all" ? "selected" : ""}>Tất cả</option>
            <option value="overdue" ${state.quickFilter === "overdue" ? "selected" : ""}>Quá hạn</option>
            <option value="receivable" ${state.quickFilter === "receivable" ? "selected" : ""}>Còn thu</option>
          </select>
          <button class="button ${state.orderView === "table" ? "is-active" : ""}" data-action="set-order-view" data-mode="table"><i data-lucide="table-2"></i><span>Bảng</span></button>
          <button class="button ${state.orderView === "kanban" ? "is-active" : ""}" data-action="set-order-view" data-mode="kanban"><i data-lucide="columns-3"></i><span>Kanban</span></button>
          ${searchSummary(orders.length, "deal")}
        </div>
        <div class="toolbar-right">
          <a class="button" href="/api/export/orders.csv?role=${esc(state.role)}"><i data-lucide="download"></i><span>Export CSV</span></a>
          <button class="primary" data-action="new-order"><i data-lucide="plus"></i><span>Tạo deal</span></button>
        </div>
      </section>
      ${bulkBar("orders", "deal")}
      ${
        state.orderView === "kanban"
          ? `<section class="kanban">${renderKanban(orders)}</section>`
          : `<section class="panel"><div class="table-wrap orders-table-scroll">${ordersTable(orders)}</div></section>`
      }
    </div>
  `;
}

function renderKanban(orders) {
  return state.data.meta.order_statuses
    .map((status) => {
      const items = orders.filter((order) => order.status === status.id);
      return `
        <div class="kanban-column" data-status-id="${esc(status.id)}" style="--status-color:${esc(STATUS_COLORS[status.id] || "#2f6c62")}">
          <div class="kanban-title">
            <span class="kanban-status"><i data-lucide="${esc(STATUS_ICONS[status.id] || "circle")}"></i>${esc(status.label)}</span>
            <span class="tag">${items.length}</span>
          </div>
          ${items
            .map(
              (order) => `
            <article class="deal-card" draggable="true" data-action="open-order" data-order-id="${esc(order.id)}" style="--status-color:${esc(STATUS_COLORS[order.status] || "#2f6c62")}">
              <div class="deal-card-top">
                <strong>${esc(order.order_code)} · ${esc(order.product_summary || order.product_name)}</strong>
                <i class="drag-handle" data-lucide="grip-vertical" aria-hidden="true"></i>
              </div>
              <span class="muted">${esc(order.customer?.full_name || "")}</span>
              <span>${fmtMoney(order.price)}${order.balance_due > 0 ? ` · Còn thu ${fmtMoney(order.balance_due)}` : ""}</span>
              <span class="muted">Phụ trách: ${esc(order.assignee || "Chưa gán")}</span>
              <span class="${order.overdue ? "overdue" : "muted"}">Due ${fmtDate(order.due_date)}</span>
              <div class="deal-card-actions">
                <button class="ghost" data-action="edit-orders" data-id="${esc(order.id)}"><i data-lucide="pen-line"></i><span>Sửa</span></button>
                <button class="ghost danger-link" data-action="delete-orders" data-id="${esc(order.id)}"><i data-lucide="trash-2"></i><span>Xóa</span></button>
              </div>
            </article>
          `,
            )
            .join("")}
        </div>
      `;
    })
    .join("");
}

function renderCustomers() {
  const customers = state.data.customers
    .filter((customer) => {
      const needle = state.search.trim().toLowerCase();
      if (!needle) return true;
      return [customer.full_name, customer.phone, customer.account, customer.channel].join(" ").toLowerCase().includes(needle);
    })
    .sort((a, b) => b.total_spend - a.total_spend);
  const customerIds = customers.map((customer) => customer.id);

  return `
    <div class="stack">
      <section class="kpi-grid">
        ${kpiCard("Tổng khách", fmtNumber(customers.length), "CRM cơ bản")}
        ${kpiCard("Khách VIP", fmtNumber(customers.filter((c) => c.segment === "VIP").length), "Theo tổng chi tiêu")}
        ${kpiCard("Khách quay lại", fmtNumber(customers.filter((c) => c.segment === "Quay lại").length), "Có hơn 1 đơn")}
        ${kpiCard("Top kênh", topChannel(customers), "Theo hồ sơ khách")}
      </section>
      ${bulkBar("customers", "khách")}
      <section class="panel">
        <div class="panel-header"><h2>Danh sách khách hàng</h2>${searchSummary(customers.length, "khách")}<span class="tag">Gợi ý trùng theo SĐT khi tạo deal</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th class="select-col">${selectAllBox("customers", customerIds)}</th><th>Khách</th><th>Kênh</th><th>Địa chỉ</th><th>Phân khúc</th><th>Đơn</th><th class="money">Tổng chi tiêu</th><th>Lần mua gần nhất</th><th>Thao tác</th></tr></thead>
            <tbody>
              ${customers
                .map(
                  (customer) => `
                <tr data-action="open-customer" data-customer-id="${esc(customer.id)}">
                  <td class="select-col">${rowSelect("customers", customer.id, customer.full_name)}</td>
                  <td><strong>${esc(customer.full_name)}</strong><br><span class="small muted">${esc(customer.phone)} · ${esc(customer.account || "-")}</span></td>
                  <td>${esc(customer.channel)}</td>
                  <td>${esc([customer.ward, customer.district, customer.province].filter(Boolean).join(", "))}</td>
                  <td><span class="tag">${esc(customer.segment)}</span></td>
                  <td>${fmtNumber(customer.order_count)}</td>
                  <td class="money">${fmtMoney(customer.total_spend)}</td>
                  <td>${fmtDate(customer.last_order_at)}</td>
                  <td>${rowActions("customers", customer.id, customer.full_name)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function topChannel(customers) {
  const channels = sortedEntries(groupBy(customers, (customer) => customer.channel));
  return channels[0]?.[0] || "-";
}

function renderMarketPrices() {
  const market = state.data.market_prices;
  if (!market) {
    return `<div class="empty compact">Chưa có dữ liệu giá kim loại.</div>`;
  }
  const statusText = {
    live: "Realtime",
    cached: "Cache",
    partial: "Một phần",
    fallback: "Dự phòng",
  }[market.status] || market.status;
  const goldRows = (market.gold?.karats || [])
    .map(
      (item) => `
      <div class="market-row">
        <span><strong>${esc(item.code)}</strong><small>${esc(item.basis || item.source || "")}${item.adjusted && item.market_sell ? ` · gốc ${fmtMoney(item.market_sell)}` : ""}</small></span>
        <span class="market-value"><strong>${fmtMoney(item.sell)}</strong>${item.adjusted ? `<small class="manual-price-label">${esc(metalRuleSummary(item.price_rule))}</small>` : ""}</span>
      </div>
    `,
    )
    .join("");
  const silverRows = (market.silver?.purities || [])
    .map(
      (item) => `
      <div class="market-row">
        <span><strong>${esc(item.label)}</strong><small>${esc(item.basis || item.source || "")}${item.adjusted && item.market_sell ? ` · gốc ${fmtMoney(item.market_sell)}` : ""}</small></span>
        <span class="market-value"><strong>${fmtMoney(item.sell)}</strong>${item.adjusted ? `<small class="manual-price-label">${esc(metalRuleSummary(item.price_rule))}</small>` : ""}</span>
      </div>
    `,
    )
    .join("");
  const referenceRows = (market.gold?.references || [])
    .slice(0, 4)
    .map(
      (item) => `
      <div class="market-ref-row">
        <span>${esc(item.label)}</span>
        <strong>${fmtShortMoney(item.sell)}</strong>
        ${marketDelta(item.changeSell)}
      </div>
    `,
    )
    .join("");
  const silverRef = (market.silver?.references || [])[0];
  return `
    <div class="market-price-card">
      <div class="market-toolbar">
        <div>
          <span class="tag">${esc(statusText)}</span>
          <p class="small muted">Nguồn: ${esc(market.sourceLabel || "N/A")} · cập nhật ${fmtMarketTime(market.sourceUpdatedAt || market.fetchedAt)}</p>
        </div>
        <div class="toolbar-right">
          <button class="ghost" data-action="edit-metal-prices" title="Điều chỉnh giá nhập kim loại"><i data-lucide="pen-line"></i><span>Điều chỉnh giá</span></button>
          <button class="ghost" data-action="refresh-market-prices" title="Cập nhật giá thị trường"><i data-lucide="refresh-cw"></i><span>Cập nhật thị trường</span></button>
        </div>
      </div>
      <div class="market-grid">
        <div>
          <h3>Giá vàng theo tuổi</h3>
          ${goldRows || `<p class="small muted">Chưa có giá vàng.</p>`}
        </div>
        <div>
          <h3>Giá bạc</h3>
          ${silverRows || `<p class="small muted">Chưa có giá bạc.</p>`}
          ${silverRef ? `<p class="small muted">Bạc 999 Phú Quý: mua ${fmtMoney(silverRef.buy)} · bán ${fmtMoney(silverRef.sell)}</p>` : ""}
        </div>
      </div>
      <div class="market-reference">
        <h3>Tham chiếu thị trường</h3>
        ${referenceRows || `<p class="small muted">Không có dữ liệu tham chiếu.</p>`}
      </div>
      ${(market.errors || []).length ? `<p class="small warning-text">Một số nguồn lỗi: ${esc(market.errors.join("; "))}. Hệ thống đang dùng dữ liệu gần nhất nếu có.</p>` : ""}
    </div>
  `;
}

function renderVendors() {
  const needle = state.search.trim().toLowerCase();
  const vendorStats = state.data.vendors
    .map((vendor) => {
      const lines = state.data.order_sourcing_lines.filter((line) => line.vendor_id === vendor.id);
      const orderIds = new Set(lines.map((line) => line.order_id));
      return {
        ...vendor,
        cost: sum(lines, (line) => line.cost),
        order_count: orderIds.size,
      };
    })
    .filter((vendor) => !needle || [vendor.name, vendor.type, vendor.contact, vendor.phone, vendor.note].join(" ").toLowerCase().includes(needle));
  const vendorIds = vendorStats.map((vendor) => vendor.id);

  return `
    <div class="stack">
      <section class="grid-2">
        <article class="panel">
          <div class="panel-header"><h2>Chi phí theo vendor</h2><span class="tag">Nguồn hàng</span></div>
          <div class="panel-body">${barChart(vendorStats.map((vendor) => [vendor.name, vendor.cost]), fmtMoney)}</div>
        </article>
        <article class="panel">
          <div class="panel-header"><h2>Giá kim loại</h2><span class="tag">${state.data.market_prices?.adjustedPriceCount ? `${state.data.market_prices.adjustedPriceCount} quy tắc` : "Realtime"}</span></div>
          <div class="panel-body">${renderMarketPrices()}</div>
        </article>
      </section>
      ${bulkBar("vendors", "NCC")}
      <section class="panel">
        <div class="panel-header"><h2>Danh bạ nhà cung cấp</h2>${searchSummary(vendorStats.length, "NCC")}<button class="button" data-action="new-vendor"><i data-lucide="plus"></i><span>Thêm NCC</span></button></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th class="select-col">${selectAllBox("vendors", vendorIds)}</th><th>Tên</th><th>Loại</th><th>Liên hệ</th><th>Ghi chú</th><th>Đơn liên quan</th><th class="money">Tổng chi phí</th><th>Thao tác</th></tr></thead>
            <tbody>
              ${vendorStats
                .map(
                  (vendor) => `
                <tr>
                  <td class="select-col">${rowSelect("vendors", vendor.id, vendor.name)}</td>
                  <td><strong>${esc(vendor.name)}</strong><br><span class="small muted">${esc(vendor.address)}</span></td>
                  <td>${esc(vendor.type)}</td>
                  <td>${esc(vendor.contact)}<br><span class="small muted">${esc(vendor.phone)}</span></td>
                  <td>${esc(vendor.note)}</td>
                  <td>${fmtNumber(vendor.order_count)}</td>
                  <td class="money">${canSeeCosts() ? fmtMoney(vendor.cost) : "Ẩn"}</td>
                  <td>${rowActions("vendors", vendor.id, vendor.name)}</td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderFinance() {
  const orders = filteredOrders({ ignoreStatus: true }).filter((order) => order.status !== "huy_hoan");
  const expenses = periodExpenses();
  const revenue = sum(orders, (order) => order.price);
  const cogs = sum(orders, (order) => order.total_cost);
  const gross = revenue - cogs;
  const opex = sum(expenses, (expense) => expense.amount);
  const net = gross - opex;
  const receivable = sum(orders, (order) => order.balance_due);
  const debts = receivableRows(orders);

  return `
    <div class="stack">
      <section class="kpi-grid">
        ${kpiCard("Doanh thu", fmtMoney(revenue), "Theo kỳ lọc", "", { icon: "banknote" })}
        ${canSeeCosts() ? kpiCard("Giá vốn", fmtMoney(cogs), "Nguồn hàng + ship", "", { icon: "receipt" }) : kpiCard("Giá vốn", "Ẩn theo quyền", "", "", { icon: "receipt" })}
        ${canSeeFinancials() ? kpiCard("Lợi nhuận thuần", fmtMoney(net), `Chi phí vận hành ${fmtMoney(opex)}`, moneyTone(net), { icon: "piggy-bank" }) : kpiCard("Lợi nhuận thuần", "Ẩn theo quyền", "", "", { icon: "piggy-bank" })}
        ${kpiCard("Công nợ/COD treo", fmtMoney(receivable), "Còn phải thu", "", { icon: "clock-3" })}
      </section>
      <section class="grid-2">
        <article class="panel">
          <div class="panel-header"><h2>Lãi/lỗ theo kỳ</h2><span class="tag">${esc(state.period)}</span></div>
          <div class="panel-body">
            <div class="metric-row"><span>Doanh thu</span><strong>${fmtMoney(revenue)}</strong></div>
            <div class="metric-row"><span>Giá vốn</span><strong>${canSeeCosts() ? fmtMoney(cogs) : "Ẩn"}</strong></div>
            <div class="metric-row"><span>Lợi nhuận gộp</span><strong class="${moneyTone(gross)}">${canSeeFinancials() ? fmtMoney(gross) : "Ẩn"}</strong></div>
            <div class="metric-row"><span>Chi phí vận hành</span><strong>${fmtMoney(opex)}</strong></div>
            <div class="metric-row"><span>Lợi nhuận thuần</span><strong class="${moneyTone(net)}">${canSeeFinancials() ? fmtMoney(net) : "Ẩn"}</strong></div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-header"><h2>Thêm chi phí</h2><span class="tag">Chi phí</span></div>
          <div class="panel-body">
            <form id="expenseForm" class="form-grid">
              <div class="field"><label>Ngày</label><input name="date" class="date-text" inputmode="numeric" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="dd/mm/yyyy" value="${formatDateInput(new Date().toISOString().slice(0, 10))}"></div>
              <div class="field"><label>Nhóm</label><select name="category">${state.data.meta.expense_categories.map((item) => `<option>${esc(item)}</option>`).join("")}</select></div>
              <div class="field full"><label>Diễn giải</label><input name="description" placeholder="Ví dụ: Instagram ads tháng 6"></div>
              <div class="field"><label>Số tiền</label><input name="amount" type="number" min="0" step="1000" placeholder="0"></div>
              <div class="field"><label>&nbsp;</label><button class="primary" type="submit"><i data-lucide="plus"></i><span>Ghi nhận</span></button></div>
            </form>
          </div>
        </article>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Công nợ phải thu</h2><span class="tag">Tuổi nợ · ${fmtMoney(receivable)}</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Khách</th><th>Đơn</th><th>Trạng thái</th><th>Tuổi nợ</th><th class="money">Còn thu</th><th>Nhắc thu</th></tr></thead>
            <tbody>
              ${
                debts.length
                  ? debts
                      .map(
                        (order) => `
                  <tr data-action="open-order" data-order-id="${esc(order.id)}">
                    <td><strong>${esc(order.customer?.full_name || "")}</strong><br><span class="small muted">${esc(order.customer?.phone || "")}</span></td>
                    <td>${esc(order.order_code)}<br><span class="small muted">${fmtDate(order.date_order)}</span></td>
                    <td>${statusPill(order.status)}</td>
                    <td class="${order.debt_age > 14 ? "overdue" : ""}">${order.debt_age} ngày</td>
                    <td class="money">${fmtMoney(order.balance_due)}</td>
                    <td><button class="button" data-action="copy-reminder" data-order-id="${esc(order.id)}" title="Sao chép nội dung nhắc thu công nợ"><i data-lucide="message-circle"></i><span>Sao chép lời nhắc</span></button></td>
                  </tr>
                `,
                      )
                      .join("")
                  : `<tr><td colspan="6" class="muted">Không có công nợ trong kỳ lọc.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Chi phí vận hành</h2><span class="tag">${fmtMoney(opex)}</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Ngày</th><th>Nhóm</th><th>Diễn giải</th><th class="money">Số tiền</th><th>Thao tác</th></tr></thead>
            <tbody>${expenses
              .map(
                (expense) => `<tr class="expense-row"><td>${fmtDate(expense.date)}</td><td>${esc(expense.category)}</td><td>${esc(expense.description)}</td><td class="money">${fmtMoney(expense.amount)}</td><td><div class="row-actions"><button class="ghost" data-action="edit-expense" data-expense-id="${esc(expense.id)}" aria-label="Sửa chi phí" title="Sửa chi phí"><i data-lucide="pen-line"></i></button><button class="ghost danger-link" data-action="delete-expense" data-expense-id="${esc(expense.id)}" aria-label="Xóa chi phí" title="Xóa chi phí"><i data-lucide="trash-2"></i></button></div></td></tr>`,
              )
              .join("") || `<tr><td colspan="5" class="muted">Chưa có chi phí trong kỳ lọc.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderShipping() {
  const needle = state.search.trim().toLowerCase();
  const readyOrders = state.data.orders.filter((order) => order.status === "cho_giao" && !order.shipment);
  const shipments = state.data.shipments
    .map((shipment) => ({ ...shipment, order: state.data.orders.find((order) => order.id === shipment.order_id) }))
    .filter((shipment) => {
      if (!needle) return true;
      return [shipment.tracking_code, shipment.status_label, shipment.order?.order_code, shipment.order?.customer?.full_name, shipment.order?.customer?.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const shipmentIds = shipments.map((shipment) => shipment.id);

  return `
    <div class="stack">
      <section class="grid-2">
        <article class="panel">
          <div class="panel-header"><h2>Đơn chờ giao</h2><span class="tag">${readyOrders.length} đơn</span></div>
          <div class="panel-body">
            ${
              readyOrders.length
                ? readyOrders
                    .map(
                      (order) => `
              <div class="metric-row">
                <span><strong>${esc(order.order_code)}</strong><br><span class="small muted">${esc(order.customer?.full_name)} · ${esc(order.customer?.province || "")}</span></span>
                <button class="primary" data-action="create-shipment" data-order-id="${esc(order.id)}"><i data-lucide="truck"></i><span>Tạo vận đơn</span></button>
              </div>
            `,
                    )
                    .join("")
                : `<div class="empty">Không có đơn đang chờ giao</div>`
            }
          </div>
        </article>
        <article class="panel">
          <div class="panel-header"><h2>Viettel Post Adapter</h2><span class="tag">API demo</span></div>
          <div class="panel-body">
            <div class="metric-row"><span>Tính cước</span><strong>POST /api/shipments/quote</strong></div>
            <div class="metric-row"><span>Tạo vận đơn</span><strong>POST /api/shipments/create</strong></div>
            <div class="metric-row"><span>Webhook</span><strong>POST /api/viettelpost/webhook</strong></div>
            <div class="metric-row"><span>Tracking</span><strong>Có history theo mốc thời gian</strong></div>
          </div>
        </article>
      </section>
      ${bulkBar("shipments", "vận đơn")}
      <section class="panel">
        <div class="panel-header"><h2>Vận đơn</h2>${searchSummary(shipments.length, "vận đơn")}<span class="tag">Theo dõi tự động</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th class="select-col">${selectAllBox("shipments", shipmentIds)}</th><th>Mã vận đơn</th><th>Đơn</th><th>Khách</th><th>Trạng thái</th><th>Dự kiến giao</th><th class="money">Cước</th><th>Thao tác</th></tr></thead>
            <tbody>
              ${shipments
                .map(
                  (shipment) => `
                <tr>
                  <td class="select-col">${rowSelect("shipments", shipment.id, shipment.tracking_code)}</td>
                  <td><strong>${esc(shipment.tracking_code)}</strong><br><span class="small muted">${esc(shipment.service_code)}</span></td>
                  <td>${esc(shipment.order?.order_code || "")}</td>
                  <td>${esc(shipment.order?.customer?.full_name || "")}</td>
                  <td><span class="tag">${esc(shipment.status_label || shipment.status)}</span></td>
                  <td>${fmtDate(shipment.expected_delivery)}</td>
                  <td class="money">${fmtMoney(shipment.fee)}</td>
                  <td>
                    <div class="row-actions always-visible">
                      <button class="button" data-action="sync-shipment" data-shipment-id="${esc(shipment.id)}"><i data-lucide="refresh-cw"></i><span>Sync</span></button>
                      <button class="ghost" data-action="edit-shipments" data-id="${esc(shipment.id)}" aria-label="Sửa vận đơn" title="Sửa vận đơn"><i data-lucide="pen-line"></i></button>
                      <button class="ghost danger-link" data-action="delete-shipments" data-id="${esc(shipment.id)}" aria-label="Xóa vận đơn" title="Xóa vận đơn"><i data-lucide="trash-2"></i></button>
                    </div>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function productStockTag(product) {
  if (!product.track_inventory) return `<span class="tag">Không theo dõi</span>`;
  if (product.stock_state === "out") return `<span class="tag stock-out">Hết hàng</span>`;
  if (product.stock_state === "low") return `<span class="tag stock-low">Sắp hết</span>`;
  return `<span class="tag stock-ok">Còn hàng</span>`;
}

function renderProductCatalog() {
  const needle = state.search.trim().toLowerCase();
  const products = (state.data.products || []).filter((product) => !needle || [product.sku, product.name, product.type, product.note].join(" ").toLowerCase().includes(needle));
  const productIds = products.map((product) => product.id);
  return `
    ${bulkBar("products", "sản phẩm")}
    <section class="panel">
      <div class="panel-header">
        <div><h2>Mẫu có sẵn</h2><p class="small muted">Danh mục duy nhất dùng trong Deal. Sửa tại đây chỉ áp dụng cho lần chọn tiếp theo.</p></div>
        <button class="primary" data-action="new-product"><i data-lucide="plus"></i><span>Thêm sản phẩm</span></button>
      </div>
      <div class="table-wrap">
        <table class="product-table">
          <thead><tr><th class="select-col">${selectAllBox("products", productIds)}</th><th>Sản phẩm</th><th>Loại / chất liệu</th><th class="money">Giá bán</th><th class="money">Giá vốn</th><th>Tồn kho</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>${products.map((product) => {
            const material = (state.data.settings?.material_catalog || []).find((item) => item.id === product.material_id);
            return `<tr>
              <td class="select-col">${rowSelect("products", product.id, product.name)}</td>
              <td><strong>${esc(product.name)}</strong><br><span class="small muted">${esc(product.sku)}</span></td>
              <td>${esc(product.type)}<br><span class="small muted">${esc(material?.name || "Chưa gán chất liệu")}</span></td>
              <td class="money">${fmtMoney(product.default_price)}</td>
              <td class="money">${canSeeCosts() ? fmtMoney(product.default_cost) : "Ẩn"}</td>
              <td>${product.track_inventory ? `<strong>${fmtNumber(product.available)}</strong> khả dụng<br><span class="small muted">Tồn ${fmtNumber(product.on_hand)} · Giữ ${fmtNumber(product.reserved)}</span>` : `<span class="muted">Không theo dõi</span>`}</td>
              <td>${productStockTag(product)}${product.status === "inactive" ? `<br><span class="small muted">Ngừng bán</span>` : ""}</td>
              <td><div class="row-actions always-visible"><button class="ghost" data-action="adjust-stock" data-product-id="${esc(product.id)}" title="Điều chỉnh tồn"><i data-lucide="package-plus"></i></button><button class="ghost" data-action="edit-product" data-product-id="${esc(product.id)}" title="Sửa sản phẩm"><i data-lucide="pen-line"></i></button><button class="ghost danger-link" data-action="delete-product" data-product-id="${esc(product.id)}" title="Xóa hoặc ngừng bán"><i data-lucide="archive"></i></button></div></td>
            </tr>`;
          }).join("") || `<tr><td colspan="8">${emptyState("package-open", "Chưa có sản phẩm", "Thêm mẫu có sẵn để Sale chọn khi tạo Deal.", `<button class="primary" data-action="new-product"><i data-lucide="plus"></i><span>Thêm sản phẩm</span></button>`)}</td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderProductAttributes() {
  const materials = state.data.settings?.material_catalog || [];
  return `
    <section class="panel">
      <div class="panel-header"><div><h2>Thuộc tính sản phẩm</h2><p class="small muted">Chất liệu được khai báo một lần và dùng cho cả mẫu có sẵn lẫn mẫu tùy chỉnh.</p></div><button class="button" data-action="new-material"><i data-lucide="plus"></i><span>Thêm chất liệu</span></button></div>
      <div class="table-wrap"><table><thead><tr><th>Chất liệu</th><th>Nhóm</th><th>Nguồn tham khảo</th><th>Đơn vị</th><th>Ghi chú</th><th>Thao tác</th></tr></thead><tbody>
        ${materials.map((material) => `<tr><td><strong>${esc(material.name)}</strong></td><td>${esc(material.group)}</td><td>${material.market_key ? `<span class="tag">${esc(material.market_key)}</span>` : "Không liên kết"}</td><td>${material.default_unit === "chi" ? "chỉ" : "gram"}</td><td>${esc(material.note || "-")}</td><td><div class="row-actions always-visible"><button class="ghost" data-action="edit-material" data-material-id="${esc(material.id)}" title="Sửa chất liệu"><i data-lucide="pen-line"></i></button><button class="ghost danger-link" data-action="delete-material" data-material-id="${esc(material.id)}" title="Xóa chất liệu"><i data-lucide="trash-2"></i></button></div></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Chưa có chất liệu.</td></tr>`}
      </tbody></table></div>
    </section>`;
}

function renderInventoryMovements() {
  const movements = state.data.inventory_movements || [];
  return `<section class="panel"><div class="panel-header"><div><h2>Biến động tồn kho</h2><p class="small muted">Lịch sử nhập, xuất bán và điều chỉnh. Mọi thay đổi tồn đều có lý do.</p></div><span class="tag">${fmtNumber(movements.length)} giao dịch</span></div><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Sản phẩm</th><th>Loại</th><th>Số lượng</th><th>Lý do</th><th>Người thực hiện</th></tr></thead><tbody>${movements.map((movement) => `<tr><td>${fmtDateTime(movement.created_at)}</td><td><strong>${esc(movement.product?.name || "-")}</strong><br><span class="small muted">${esc(movement.product?.sku || "")}</span></td><td>${esc({ opening: "Tồn đầu kỳ", receipt: "Nhập kho", sale: "Xuất bán", adjustment: "Điều chỉnh" }[movement.type] || movement.type)}</td><td class="${movement.quantity < 0 ? "negative" : "positive"}"><strong>${movement.quantity > 0 ? "+" : ""}${fmtNumber(movement.quantity)}</strong></td><td>${esc(movement.reason)}</td><td>${esc(movement.created_by)}</td></tr>`).join("") || `<tr><td colspan="6">${emptyState("history", "Chưa có biến động tồn", "Điều chỉnh tồn ở một sản phẩm để bắt đầu ghi nhận lịch sử.")}</td></tr>`}</tbody></table></div></section>`;
}

function renderProducts() {
  const products = state.data.products || [];
  const tracked = products.filter((product) => product.track_inventory);
  const lowStock = tracked.filter((product) => ["low", "out"].includes(product.stock_state));
  return `<div class="stack">
    <section class="kpi-grid product-kpis">
      ${kpiCard("Mẫu đang bán", fmtNumber(products.filter((product) => product.status === "active").length), `${fmtNumber(products.length)} mẫu trong danh mục`, "", { icon: "package-open" })}
      ${kpiCard("Có theo dõi tồn", fmtNumber(tracked.length), "Không bắt buộc với mẫu đặt làm", "", { icon: "boxes" })}
      ${kpiCard("Sắp hết / hết", fmtNumber(lowStock.length), "Theo ngưỡng từng sản phẩm", lowStock.length ? "negative" : "", { icon: "triangle-alert" })}
      ${kpiCard("Đang giữ", fmtNumber(sum(tracked, (product) => product.reserved)), "Deal đã cọc / đang xử lý", "", { icon: "package-check" })}
    </section>
    <section class="product-tabs" aria-label="Các khu vực quản lý sản phẩm">
      <button class="button ${state.productTab === "catalog" ? "is-active" : ""}" data-action="set-product-tab" data-tab="catalog"><i data-lucide="list"></i><span>Mẫu có sẵn</span></button>
      <button class="button ${state.productTab === "attributes" ? "is-active" : ""}" data-action="set-product-tab" data-tab="attributes"><i data-lucide="tags"></i><span>Thuộc tính</span></button>
      <button class="button ${state.productTab === "movements" ? "is-active" : ""}" data-action="set-product-tab" data-tab="movements"><i data-lucide="history"></i><span>Biến động tồn</span></button>
    </section>
    ${state.productTab === "attributes" ? renderProductAttributes() : state.productTab === "movements" ? renderInventoryMovements() : renderProductCatalog()}
  </div>`;
}

function renderSettings() {
  return `
    <div class="stack">
      <section class="grid-2">
        <article class="panel">
          <div class="panel-header"><h2>Phân quyền</h2><span class="tag">RBAC</span></div>
          <div class="panel-body">
            <div class="metric-row"><span>Admin / Chủ</span><strong>Toàn quyền</strong></div>
            <div class="metric-row"><span>Sale</span><strong>Ẩn giá vốn & lợi nhuận</strong></div>
            <div class="metric-row"><span>Vận hành / Kho</span><strong>Xem nguồn hàng, tạo vận đơn</strong></div>
            <div class="metric-row"><span>Kế toán</span><strong>Thanh toán, lãi/lỗ, chi phí</strong></div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-header"><h2>Thông tin cần cấu hình thật</h2><span class="tag">Viettel Post</span></div>
          <div class="panel-body">
            <div class="metric-row"><span>Token/API account</span><strong>Chưa cấu hình</strong></div>
            <div class="metric-row"><span>Kho gửi mặc định</span><strong>Chưa cấu hình</strong></div>
            <div class="metric-row"><span>Danh mục tỉnh/huyện/xã</span><strong>Cache định kỳ</strong></div>
            <div class="metric-row"><span>Queue/Cron tracking</span><strong>30-60 phút</strong></div>
          </div>
        </article>
      </section>
      <section class="panel">
        <div class="panel-header"><h2>Audit log</h2><span class="tag">${state.data.audit_logs.length} bản ghi</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Thời gian</th><th>User</th><th>Hành động</th><th>Entity</th><th>ID</th></tr></thead>
            <tbody>
              ${state.data.audit_logs
                .slice(0, 30)
                .map((log) => `<tr><td>${fmtDateTime(log.created_at)}</td><td>${esc(log.user)}</td><td>${esc(log.action)}</td><td>${esc(log.entity)}</td><td>${esc(log.entity_id)}</td></tr>`)
                .join("") || `<tr><td colspan="5" class="muted">Chưa có thao tác phát sinh trong store hiện tại.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function render() {
  if (!state.data) {
    app.innerHTML = `
      <div class="skeleton-page" aria-label="Đang tải dữ liệu">
        <div class="skeleton-row"><span></span><span></span><span></span><span></span></div>
        <div class="skeleton-panel"></div>
        <div class="skeleton-panel"></div>
      </div>
    `;
    return;
  }
  viewTitle.textContent = viewNames[state.view];
  const globalSearch = document.querySelector("#globalSearch");
  if (globalSearch && globalSearch.value !== state.search) globalSearch.value = state.search;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === state.view);
  });

  const renderers = {
    dashboard: renderDashboard,
    orders: renderOrders,
    products: renderProducts,
    customers: renderCustomers,
    vendors: renderVendors,
    finance: renderFinance,
    shipping: renderShipping,
    settings: renderSettings,
  };
  app.innerHTML = renderers[state.view]();
  refreshIcons();
}

function productCatalogOptions(selectedId = "") {
  return [
    `<option value="">Chọn sản phẩm</option>`,
    ...(state.data.products || []).filter((product) => product.status === "active" || product.id === selectedId).map((product) => `<option value="${esc(product.id)}" ${product.id === selectedId ? "selected" : ""}>${esc(product.name)} · ${esc(product.sku)}${product.track_inventory ? ` · còn ${fmtNumber(product.available)}` : ""}</option>`),
  ].join("");
}

function materialCatalogOptions(selectedId = "") {
  return [
    `<option value="">Chọn chất liệu</option>`,
    ...(state.data.settings?.material_catalog || []).map((material) => `<option value="${esc(material.id)}" ${material.id === selectedId ? "selected" : ""}>${esc(material.group)} · ${esc(material.name)}</option>`),
  ].join("");
}

function materialMarketRow(material) {
  if (!material?.market_key) return null;
  const [group, code] = material.market_key.split(":");
  const rows = group === "gold" ? state.data.market_prices?.gold?.karats : state.data.market_prices?.silver?.purities;
  return (rows || []).find((row) => String(row.code).toUpperCase() === String(code).toUpperCase()) || null;
}

function convertMaterialPrice(material, unit) {
  const marketRow = materialMarketRow(material);
  if (marketRow) {
    const marketPrice = Number(marketRow.sell || 0);
    if (material.market_key.startsWith("gold:")) return unit === "chi" ? marketPrice : marketPrice / 3.75;
    return unit === "chi" ? marketPrice / 10 : marketPrice / 37.5;
  }
  const defaultPrice = Number(material?.default_price || 0);
  if (!material || material.default_unit === unit) return defaultPrice;
  return material.default_unit === "chi" ? defaultPrice / 3.75 : defaultPrice * 3.75;
}

function syncMaterialPricingRow(row) {
  if (!row) return 0;
  const material = (state.data.settings?.material_catalog || []).find((item) => item.id === row.querySelector('[data-field="material_id"]')?.value);
  const mode = row.querySelector('[data-field="metal_mode"]')?.value || "none";
  const unitInput = row.querySelector('[data-field="metal_unit"]');
  const weightInput = row.querySelector('[data-field="metal_weight"]');
  const priceInput = row.querySelector('[data-field="metal_unit_price"]');
  const output = row.querySelector('[data-metal-output="material_cost"]');
  if (unitInput && !unitInput.value) unitInput.value = material?.default_unit || "g";
  if (priceInput && mode === "profile") priceInput.value = String(Math.round(convertMaterialPrice(material, unitInput?.value || "g")));
  if (priceInput) priceInput.readOnly = mode !== "manual";
  if (weightInput) weightInput.disabled = mode === "none";
  if (unitInput) unitInput.disabled = mode === "none";
  const quantity = Math.max(1, Number(row.querySelector('[data-field="quantity"]')?.value || 1));
  const cost = mode === "none" ? 0 : Math.round(Number(weightInput?.value || 0) * Number(priceInput?.value || 0) * quantity);
  if (output) {
    output.dataset.value = String(cost);
    output.textContent = fmtMoney(cost);
  }
  row.classList.toggle("metal-pricing-disabled", mode === "none");
  return cost;
}

function defaultOrderItem() {
  const product = state.data.products?.find((item) => item.status === "active");
  const material = (state.data.settings?.material_catalog || []).find((item) => item.id === product?.material_id);
  return {
    id: "",
    product_mode: product ? "catalog" : "custom",
    product_id: product?.id || "",
    product_type: product?.type || "Other",
    product_name: product?.name || "",
    note: "",
    quantity: 1,
    unit_price: Number(product?.default_price || 0),
    unit_cost: Number(product?.default_cost || 0),
    size: product?.default_size || "",
    material_id: material?.id || "",
    metal_pricing: { mode: "none", unit: "g", weight: 0, unit_price: 0, material_cost: 0 },
    specs: { material: material?.name || "", stone: product?.default_stone || "", weight: "" },
  };
}

function productItemEditorRow(item, index) {
  const specs = item.specs || {};
  const productMode = item.product_mode === "custom" || !item.product_id ? "custom" : "catalog";
  const material = (state.data.settings?.material_catalog || []).find((entry) => entry.id === item.material_id)
    || (state.data.settings?.material_catalog || []).find((entry) => entry.name === specs.material);
  const catalogProduct = (state.data.products || []).find((entry) => entry.id === item.product_id);
  const metalPricing = item.metal_pricing || { mode: "none", unit: material?.default_unit || "g", weight: 0, unit_price: 0, material_cost: 0 };
  return `
    <article class="editor-item product-item-row mode-${productMode}" data-item-id="${esc(item.id || "")}" data-unit-cost="${Number(item.unit_cost || 0)}" data-metal-pricing="${esc(JSON.stringify(metalPricing))}" data-legacy-weight="${esc(specs.weight || "")}">
      <div class="editor-item-header">
        <strong>Sản phẩm ${index + 1}</strong>
        <button class="ghost danger-link icon-only" type="button" data-action="remove-order-item" title="Xóa sản phẩm" aria-label="Xóa sản phẩm"><i data-lucide="trash-2"></i></button>
      </div>
      <div class="product-mode-switch" role="group" aria-label="Loại sản phẩm trong Deal">
        <input type="hidden" data-field="product_mode" value="${productMode}">
        <button class="button ${productMode === "catalog" ? "is-active" : ""}" type="button" data-action="set-product-mode" data-mode="catalog"><i data-lucide="package-check"></i><span>Mẫu có sẵn</span></button>
        <button class="button ${productMode === "custom" ? "is-active" : ""}" type="button" data-action="set-product-mode" data-mode="custom"><i data-lucide="wand-sparkles"></i><span>Mẫu tùy chỉnh</span></button>
      </div>
      <div class="product-editor-grid">
        <div class="field product-id-field catalog-only"><label>Chọn sản phẩm</label><select data-field="product_id">${productCatalogOptions(item.product_id)}</select><span class="small muted" data-stock-note>${catalogProduct?.track_inventory ? `Khả dụng ${fmtNumber(catalogProduct.available)} sản phẩm` : "Không theo dõi tồn kho"}</span></div>
        <div class="field custom-only"><label>Loại sản phẩm</label><select data-field="product_type">${optionTags(state.data.meta.product_types, item.product_type || "Other")}</select></div>
        <div class="field product-name-field"><label>Tên / kiểu dáng</label><input data-field="product_name" value="${esc(item.product_name || "")}" required placeholder="Tên mẫu hoặc kiểu dáng" ${productMode === "catalog" ? "readonly" : ""}></div>
        <div class="field compact-field"><label>Số lượng</label><input data-field="quantity" type="number" min="1" step="1" value="${Number(item.quantity || 1)}"></div>
        <div class="field money-field"><label>Đơn giá</label><input data-field="unit_price" type="number" min="0" step="1000" value="${Number(item.unit_price || 0)}"></div>
      </div>
      <div class="product-spec-grid">
        <div class="field"><label>Chất liệu</label><select data-field="material_id">${materialCatalogOptions(material?.id || item.material_id || "")}</select></div>
        <div class="field"><label>Size</label><input data-field="size" value="${esc(item.size || "")}" placeholder="12 / 42cm"></div>
        <div class="field"><label>Đá / charm</label><input data-field="stone" value="${esc(specs.stone || "")}" placeholder="Zircon trắng, ngọc trai..."></div>
      </div>
      <div class="field"><label>Ghi chú yêu cầu sản phẩm</label><textarea data-field="note" rows="2" placeholder="Loại đá, màu, khắc tên, chỉnh thiết kế...">${esc(item.note || "")}</textarea></div>
    </article>
  `;
}

function sourceLineEditorRow(line = {}, index = 0) {
  const vendors = state.data.vendors.map((vendor) => ({ id: vendor.id, label: vendor.name }));
  const statuses = [...new Set(["Dự kiến", "Đã đặt", "Đã nhận", "Đang gia công", "Hoàn tất", line.status].filter(Boolean))];
  return `
    <div class="source-line source-line-row" data-line-id="${esc(line.id || "")}">
      <select data-field="vendor_id" aria-label="Nhà cung cấp">${optionTags(vendors, line.vendor_id, "Chọn NCC")}</select>
      <input data-field="material" value="${esc(line.material || "")}" placeholder="Vật liệu / dịch vụ ${index + 1}">
      <input data-field="cost" type="number" min="0" step="1000" value="${Number(line.cost || 0)}" placeholder="Chi phí">
      <select data-field="status" aria-label="Trạng thái nguồn hàng">${optionTags(statuses, line.status || "Dự kiến")}</select>
      <button class="ghost danger-link icon-only" type="button" data-action="remove-source-line" title="Xóa dòng chi phí" aria-label="Xóa dòng chi phí"><i data-lucide="trash-2"></i></button>
    </div>
  `;
}

function orderCommercialEditor(order = null) {
  const items = order?.items?.length ? order.items : [defaultOrderItem()];
  const sourceLines = order?.sourcing_lines?.length ? order.sourcing_lines : [{}];
  const profitRate = order ? Number(order.pricing?.profit_rate ?? 0) : 30;
  const taxRate = order ? Number(order.pricing?.tax_rate ?? 0) : 0;
  const price = Number(order?.price ?? items.reduce((total, item) => total + Number(item.unit_price || 0) * Number(item.quantity || 1), 0));
  return `
    <section class="editor-section field full">
      <div class="editor-section-header">
        <div><h3>Sản phẩm trong deal</h3><p class="small muted">Chọn mẫu có sẵn hoặc nhập một mẫu tùy chỉnh theo yêu cầu khách.</p></div>
        <button class="button" type="button" data-action="add-order-item"><i data-lucide="plus"></i><span>Thêm sản phẩm</span></button>
      </div>
      <div class="product-items-list">${items.map(productItemEditorRow).join("")}</div>
    </section>
    <section class="editor-section field full">
      <div class="editor-section-header">
        <div><h3>Nguồn hàng / chi phí đầu vào</h3><p class="small muted">Dùng cho mẫu tùy chỉnh hoặc phụ phí gia công, vật liệu và dịch vụ.</p></div>
        <button class="button" type="button" data-action="add-source-line"><i data-lucide="plus"></i><span>Thêm chi phí</span></button>
      </div>
      <div class="source-lines">${sourceLines.map(sourceLineEditorRow).join("")}</div>
    </section>
    <section class="editor-section field full pricing-engine">
      <div class="editor-section-header"><div><h3>Engine báo giá</h3><p class="small muted">Giá đề xuất = (giá vốn + lãi trên giá vốn) + thuế.</p></div><span class="tag">Tự tính</span></div>
      <div class="pricing-grid">
        <div class="field"><label>Giá vốn mẫu có sẵn</label><output data-pricing-output="item_cost">${fmtMoney(order?.item_cost || 0)}</output></div>
        <div class="field"><label>Chi phí nguồn hàng</label><output data-pricing-output="source_cost">${fmtMoney(order?.source_cost || 0)}</output></div>
        ${Number(order?.material_cost || 0) > 0 ? `<div class="field"><label>Chi phí lịch sử Deal cũ</label><output data-pricing-output="legacy_cost">${fmtMoney(order.material_cost)}</output></div>` : ""}
        <div class="field"><label>Phí giao dự kiến</label><input name="shipping_cost" type="number" min="0" step="1000" value="${Number(order?.shipping_cost || 0)}"></div>
        <div class="field"><label>Lãi trên giá vốn (%)</label><input name="profit_rate" type="number" min="0" step="0.1" value="${profitRate}"></div>
        <div class="field"><label>Thuế (%)</label><input name="tax_rate" type="number" min="0" step="0.1" value="${taxRate}"></div>
        <div class="field"><label>Tiền lãi dự kiến</label><output data-pricing-output="profit_amount">${fmtMoney(order?.pricing?.profit_amount || 0)}</output></div>
        <div class="field"><label>Tiền thuế</label><output data-pricing-output="tax_amount">${fmtMoney(order?.pricing?.tax_amount || 0)}</output></div>
        <div class="field quote-output"><label>Giá đề xuất</label><output data-pricing-output="suggested_price">${fmtMoney(order?.pricing?.suggested_price || 0)}</output></div>
        <div class="field quote-price"><label>Giá báo khách</label><input name="price" required type="number" min="0" step="1000" value="${price}"></div>
      </div>
      <div class="editor-section-actions"><span class="small muted" data-pricing-output="item_subtotal">Tổng đơn giá sản phẩm: ${fmtMoney(price)}</span><button class="button" type="button" data-action="apply-suggested-price"><i data-lucide="calculator"></i><span>Áp dụng giá đề xuất</span></button></div>
    </section>
  `;
}

function orderFormTemplate(order = null) {
  const isEdit = Boolean(order);
  const channelOptions = optionTags(state.data.meta.channels, order?.customer?.channel || "");
  const statusOptions = optionTags(state.data.meta.order_statuses, order?.status || "tu_van");
  const provinceOptions = Object.keys(ADDRESS_BOOK).map((province) => `<option value="${esc(province)}">${esc(province)}</option>`).join("");
  const firstProvince = Object.keys(ADDRESS_BOOK)[0];
  const districtOptions = Object.keys(ADDRESS_BOOK[firstProvince]).map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("");
  const firstDistrict = Object.keys(ADDRESS_BOOK[firstProvince])[0];
  const wardOptions = ADDRESS_BOOK[firstProvince][firstDistrict].map((ward) => `<option value="${esc(ward)}">${esc(ward)}</option>`).join("");
  return `
    <form id="${isEdit ? "orderEditForm" : "orderForm"}" class="form-grid order-editor-form">
      ${isEdit ? `
        <input type="hidden" name="id" value="${esc(order.id)}">
        <div class="field full"><label>Khách</label><select name="customer_id">${optionTags(state.data.customers.map((customer) => ({ id: customer.id, label: `${customer.full_name} · ${customer.phone}` })), order.customer_id)}</select></div>
      ` : `
        <div class="field"><label>Tên khách</label><input name="customer_full_name" required placeholder="Nguyễn Minh Anh"></div>
        <div class="field"><label>Số điện thoại</label><input name="customer_phone" required placeholder="090..."></div>
        <div class="field"><label>Kênh</label><select name="customer_channel">${channelOptions}</select></div>
        <div class="field"><label>Account</label><input name="customer_account" placeholder="@instagram"></div>
        <div class="field full"><label>Địa chỉ giao hàng</label><input name="customer_address" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh"></div>
        <div class="field"><label>Tỉnh/TP</label><select name="customer_province" id="provinceSelect">${provinceOptions}</select></div>
        <div class="field"><label>Quận/Huyện</label><select name="customer_district" id="districtSelect">${districtOptions}</select></div>
        <div class="field"><label>Phường/Xã</label><select name="customer_ward" id="wardSelect">${wardOptions}</select></div>
      `}
      <div class="field"><label>Trạng thái</label><select name="status">${statusOptions}</select></div>
      <div class="field"><label>Người phụ trách</label><input name="assignee" value="${esc(order?.assignee || "")}" placeholder="Linh"></div>
      <div class="field"><label>Ngày đặt</label><input name="date_order" class="date-text" inputmode="numeric" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="dd/mm/yyyy" value="${formatDateInput(order?.date_order || new Date().toISOString().slice(0, 10))}"></div>
      <div class="field"><label>Due date</label><input name="due_date" class="date-text" inputmode="numeric" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="dd/mm/yyyy" value="${formatDateInput(order?.due_date || "")}"></div>
      ${orderCommercialEditor(order)}
      ${isEdit ? "" : `
        <section class="editor-section field full payment-initial-section">
          <div class="editor-section-header"><div><h3>Cọc / thanh toán ban đầu</h3><p class="small muted">Thông tin thanh toán được quản lý tách riêng và có thể sửa sau trong chi tiết deal.</p></div></div>
          <div class="payment-editor-grid">
            <div class="field"><label>Đặt cọc</label><input name="deposit_amount" type="number" min="0" step="1000" placeholder="0"></div>
            <div class="field"><label>Phương thức cọc</label><select name="deposit_method"><option>Chuyển khoản</option><option>Tiền mặt</option><option>COD</option><option>Ví</option></select></div>
          </div>
        </section>
      `}
      <div class="field full"><label>Yêu cầu chung của deal</label><textarea name="request" placeholder="Gói quà, thời gian cần nhận...">${esc(order?.request || "")}</textarea></div>
      <div class="field full"><label>Ghi chú nội bộ</label><textarea name="note">${esc(order?.note || "")}</textarea></div>
    </form>
  `;
}

function collectOrderItems(form) {
  return [...form.querySelectorAll(".product-item-row")].map((row) => {
    const productMode = row.querySelector('[data-field="product_mode"]')?.value || "custom";
    const productId = productMode === "catalog" ? row.querySelector('[data-field="product_id"]')?.value || "" : "";
    const product = state.data.products.find((item) => item.id === productId);
    const materialId = row.querySelector('[data-field="material_id"]')?.value || "";
    const material = (state.data.settings?.material_catalog || []).find((item) => item.id === materialId);
    const quantity = Math.max(1, Number(row.querySelector('[data-field="quantity"]')?.value || 1));
    let legacyMetalPricing = { mode: "none", unit: material?.default_unit || "g", weight: 0, unit_price: 0, material_cost: 0 };
    try { legacyMetalPricing = JSON.parse(row.dataset.metalPricing || "{}"); } catch (error) { /* Preserve a safe zero-cost fallback. */ }
    return {
      id: row.dataset.itemId || "",
      product_mode: productMode,
      product_id: productId,
      product_sku: product?.sku || "",
      product_type: product?.type || row.querySelector('[data-field="product_type"]')?.value || "Other",
      product_name: row.querySelector('[data-field="product_name"]')?.value.trim() || product?.name || "Sản phẩm",
      quantity,
      unit_price: Number(row.querySelector('[data-field="unit_price"]')?.value || 0),
      unit_cost: productMode === "catalog" ? Number(row.dataset.unitCost || 0) : 0,
      size: row.querySelector('[data-field="size"]')?.value.trim() || "",
      note: row.querySelector('[data-field="note"]')?.value.trim() || "",
      material_id: materialId,
      metal_pricing: legacyMetalPricing,
      specs: {
        material: material?.name || "",
        stone: row.querySelector('[data-field="stone"]')?.value.trim() || "",
        weight: row.dataset.legacyWeight || "",
      },
    };
  });
}

function collectSourceLines(form) {
  return [...form.querySelectorAll(".source-line-row")].map((row) => ({
    id: row.dataset.lineId || "",
    vendor_id: row.querySelector('[data-field="vendor_id"]')?.value || "",
    material: row.querySelector('[data-field="material"]')?.value.trim() || "",
    cost: Number(row.querySelector('[data-field="cost"]')?.value || 0),
    status: row.querySelector('[data-field="status"]')?.value || "Dự kiến",
  }));
}

function setPricingOutput(form, key, value, prefix = "") {
  const output = form.querySelector(`[data-pricing-output="${key}"]`);
  if (!output) return;
  output.dataset.value = String(value);
  output.textContent = prefix || fmtMoney(value);
}

function refreshOrderPricing(form = document.querySelector(".order-editor-form")) {
  if (!form) return;
  const items = collectOrderItems(form);
  const itemCost = items.reduce((total, item) => total + Number(item.unit_cost || 0) * item.quantity, 0);
  const sourceCost = collectSourceLines(form).reduce((total, line) => total + Number(line.cost || 0), 0);
  const legacyCost = items.reduce((total, item) => total + Number(item.metal_pricing?.material_cost || 0), 0);
  const shippingCost = Number(form.elements.shipping_cost?.value || 0);
  const baseCost = itemCost + sourceCost + legacyCost + shippingCost;
  const profitRate = Number(form.elements.profit_rate?.value || 0);
  const taxRate = Number(form.elements.tax_rate?.value || 0);
  const profitAmount = Math.round((baseCost * profitRate) / 100 / 1000) * 1000;
  const beforeTax = baseCost + profitAmount;
  const taxAmount = Math.round((beforeTax * taxRate) / 100 / 1000) * 1000;
  const itemSubtotal = items.reduce((total, item) => total + item.unit_price * item.quantity, 0);
  const suggestedPrice = baseCost > 0 ? beforeTax + taxAmount : itemSubtotal;
  setPricingOutput(form, "item_cost", itemCost);
  setPricingOutput(form, "source_cost", sourceCost);
  setPricingOutput(form, "legacy_cost", legacyCost);
  setPricingOutput(form, "profit_amount", profitAmount);
  setPricingOutput(form, "tax_amount", taxAmount);
  setPricingOutput(form, "suggested_price", suggestedPrice);
  setPricingOutput(form, "item_subtotal", itemSubtotal, `Tổng đơn giá sản phẩm: ${fmtMoney(itemSubtotal)}`);
}

function syncProductRowFromCatalog(row) {
  const productId = row.querySelector('[data-field="product_id"]')?.value || "";
  const product = state.data.products.find((item) => item.id === productId);
  if (!product) return;
  const nameInput = row.querySelector('[data-field="product_name"]');
  const priceInput = row.querySelector('[data-field="unit_price"]');
  const typeInput = row.querySelector('[data-field="product_type"]');
  const materialInput = row.querySelector('[data-field="material_id"]');
  const sizeInput = row.querySelector('[data-field="size"]');
  const stoneInput = row.querySelector('[data-field="stone"]');
  const stockNote = row.querySelector("[data-stock-note]");
  if (nameInput) nameInput.value = product.name;
  if (priceInput) priceInput.value = Number(product.default_price || 0);
  if (typeInput) typeInput.value = product.type || "Other";
  if (materialInput) materialInput.value = product.material_id || "";
  if (sizeInput) sizeInput.value = product.default_size || "";
  if (stoneInput) stoneInput.value = product.default_stone || "";
  if (stockNote) stockNote.textContent = product.track_inventory ? `Khả dụng ${fmtNumber(product.available)} sản phẩm` : "Không theo dõi tồn kho";
  row.dataset.unitCost = String(Number(product.default_cost || 0));
}

function syncProductModeRow(row, mode, { hydrateCatalog = true } = {}) {
  if (!row) return;
  const nextMode = mode === "catalog" ? "catalog" : "custom";
  row.querySelector('[data-field="product_mode"]').value = nextMode;
  row.classList.toggle("mode-catalog", nextMode === "catalog");
  row.classList.toggle("mode-custom", nextMode === "custom");
  row.querySelectorAll('[data-action="set-product-mode"]').forEach((button) => button.classList.toggle("is-active", button.dataset.mode === nextMode));
  const productSelect = row.querySelector('[data-field="product_id"]');
  const typeSelect = row.querySelector('[data-field="product_type"]');
  const nameInput = row.querySelector('[data-field="product_name"]');
  if (productSelect) productSelect.disabled = nextMode === "custom";
  if (typeSelect) typeSelect.disabled = nextMode === "catalog";
  if (nameInput) nameInput.readOnly = nextMode === "catalog";
  if (nextMode === "catalog") {
    if (productSelect && !productSelect.value) productSelect.value = state.data.products.find((product) => product.status === "active")?.id || "";
    if (hydrateCatalog) syncProductRowFromCatalog(row);
  } else {
    row.dataset.unitCost = "0";
  }
}

function addOrderItemRow() {
  const form = document.querySelector(".order-editor-form");
  const list = form?.querySelector(".product-items-list");
  if (!list) return;
  const index = list.querySelectorAll(".product-item-row").length;
  list.insertAdjacentHTML("beforeend", productItemEditorRow(defaultOrderItem(), index));
  syncProductModeRow(list.lastElementChild, list.lastElementChild.querySelector('[data-field="product_mode"]')?.value);
  refreshOrderPricing(form);
  refreshIcons();
}

function removeOrderItemRow(button) {
  const form = button.closest(".order-editor-form");
  const rows = form?.querySelectorAll(".product-item-row") || [];
  if (rows.length <= 1) {
    toast("Deal cần ít nhất một sản phẩm");
    return;
  }
  button.closest(".product-item-row")?.remove();
  [...form.querySelectorAll(".product-item-row")].forEach((row, index) => {
    const title = row.querySelector(".editor-item-header strong");
    if (title) title.textContent = `Sản phẩm ${index + 1}`;
  });
  refreshOrderPricing(form);
}

function addSourceLineRow() {
  const form = document.querySelector(".order-editor-form");
  const list = form?.querySelector(".source-lines");
  if (!list) return;
  const index = list.querySelectorAll(".source-line-row").length;
  list.insertAdjacentHTML("beforeend", sourceLineEditorRow({}, index));
  refreshOrderPricing(form);
  refreshIcons();
}

function removeSourceLineRow(button) {
  const form = button.closest(".order-editor-form");
  const rows = form?.querySelectorAll(".source-line-row") || [];
  if (rows.length <= 1) {
    rows[0]?.querySelectorAll("input").forEach((input) => { input.value = input.type === "number" ? "0" : ""; });
  } else {
    button.closest(".source-line-row")?.remove();
  }
  refreshOrderPricing(form);
}

function applySuggestedPrice() {
  const form = document.querySelector(".order-editor-form");
  const output = form?.querySelector('[data-pricing-output="suggested_price"]');
  if (!form || !output) return;
  form.elements.price.value = Number(output.dataset.value || 0);
  toast("Đã áp dụng giá đề xuất");
}

function bindAddressSelectors(provinceSelector = "#provinceSelect", districtSelector = "#districtSelect", wardSelector = "#wardSelect") {
  const provinceSelect = document.querySelector(provinceSelector);
  const districtSelect = document.querySelector(districtSelector);
  const wardSelect = document.querySelector(wardSelector);
  if (!provinceSelect || !districtSelect || !wardSelect) return;

  const refreshDistricts = () => {
    const districts = Object.keys(ADDRESS_BOOK[provinceSelect.value] || {});
    const currentDistrict = districtSelect.value;
    districtSelect.innerHTML = districts.map((district) => `<option value="${esc(district)}">${esc(district)}</option>`).join("");
    if (districts.includes(currentDistrict)) districtSelect.value = currentDistrict;
    refreshWards();
  };
  const refreshWards = () => {
    const wards = ADDRESS_BOOK[provinceSelect.value]?.[districtSelect.value] || [];
    const currentWard = wardSelect.value;
    wardSelect.innerHTML = wards.map((ward) => `<option value="${esc(ward)}">${esc(ward)}</option>`).join("");
    if (wards.includes(currentWard)) wardSelect.value = currentWard;
  };

  provinceSelect.addEventListener("change", refreshDistricts);
  districtSelect.addEventListener("change", refreshWards);
}

function openOrderForm() {
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="Tạo deal mới">
        <div class="modal-header">
          <div><h2>Tạo deal mới</h2><p class="muted small">Nếu số điện thoại đã tồn tại, hệ thống tự gắn vào hồ sơ khách cũ.</p></div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">${orderFormTemplate()}</div>
        <div class="modal-footer">
          <button class="button" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-order"><i data-lucide="save"></i><span>Lưu deal</span></button>
        </div>
      </section>
    </div>
  `;
  bindAddressSelectors();
  document.querySelectorAll("#orderForm .product-item-row").forEach((row) => syncProductModeRow(row, row.querySelector('[data-field="product_mode"]')?.value, { hydrateCatalog: false }));
  refreshOrderPricing(document.querySelector("#orderForm"));
  refreshIcons();
}

function openCustomerDetail(customerId) {
  const customer = state.data.customers.find((item) => item.id === customerId);
  if (!customer) return;
  const orders = state.data.orders
    .filter((order) => order.customer_id === customerId)
    .sort((a, b) => String(b.date_order).localeCompare(String(a.date_order)));
  const receivable = sum(orders, (order) => order.balance_due);
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="Hồ sơ khách hàng">
        <div class="modal-header">
          <div>
            <h2>${esc(customer.full_name)}</h2>
            <p class="muted small">${esc(customer.phone)} · ${esc(customer.channel)} · ${esc(customer.account || "-")}</p>
          </div>
          <div class="row-actions always-visible">
            <button class="ghost" data-action="edit-customers" data-id="${esc(customer.id)}" title="Sửa khách"><i data-lucide="pen-line"></i></button>
            <button class="ghost danger-link" data-action="delete-customers" data-id="${esc(customer.id)}" title="Xóa khách"><i data-lucide="trash-2"></i></button>
            <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
          </div>
        </div>
        <div class="modal-body">
          <div class="detail-layout">
            <div class="stack">
              <section class="kpi-grid">
                ${kpiCard("Tổng chi tiêu", fmtMoney(customer.total_spend), `${fmtNumber(customer.order_count)} đơn`)}
                ${kpiCard("Công nợ", fmtMoney(receivable), "Còn phải thu")}
                ${kpiCard("Phân khúc", customer.segment, "Theo chi tiêu & số đơn")}
                ${kpiCard("Lần mua gần nhất", fmtDate(customer.last_order_at), customer.channel)}
              </section>
              <section class="panel">
                <div class="panel-header"><h3>Lịch sử đơn</h3><span class="tag">${orders.length} đơn</span></div>
                <div class="table-wrap">
                  <table>
                    <thead><tr><th>Mã đơn</th><th>Sản phẩm</th><th>Trạng thái</th><th class="money">Giá trị</th><th class="money">Còn thu</th></tr></thead>
                    <tbody>
                      ${orders
                        .map(
                          (order) => `
                        <tr data-action="open-order" data-order-id="${esc(order.id)}">
                          <td>${esc(order.order_code)}<br><span class="small muted">${fmtDate(order.date_order)}</span></td>
                          <td>${esc(order.product_name)}<br><span class="small muted">${esc(order.product_type)} ${esc(order.size || "")}</span></td>
                          <td>${statusPill(order.status)}</td>
                          <td class="money">${fmtMoney(order.price)}</td>
                          <td class="money">${fmtMoney(order.balance_due)}</td>
                        </tr>
                      `,
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <aside class="stack">
              <section class="panel">
                <div class="panel-header"><h3>Hồ sơ CRM</h3></div>
                <div class="panel-body">
                  <div class="metric-row"><span>Địa chỉ</span><strong>${esc(customer.address || "-")}</strong></div>
                  <div class="metric-row"><span>Khu vực</span><strong>${esc([customer.ward, customer.district, customer.province].filter(Boolean).join(", ") || "-")}</strong></div>
                  <div class="metric-row"><span>Ghi chú / size</span><strong>${esc(customer.note || "Chưa có")}</strong></div>
                </div>
              </section>
              <section class="panel">
                <div class="panel-header"><h3>Gợi ý chăm sóc</h3></div>
                <div class="panel-body">
                  <div class="metric-row"><span>Khách lâu chưa mua</span><strong>${customer.last_order_at && Date.now() - new Date(`${customer.last_order_at}T00:00:00`).getTime() > 45 * 86400000 ? "Có" : "Không"}</strong></div>
                  <div class="metric-row"><span>Ưu tiên upsell</span><strong>${customer.segment === "VIP" || customer.segment === "Quay lại" ? "Cao" : "Theo dõi"}</strong></div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  `;
  refreshIcons();
}

function customerAddressFields(customer) {
  const firstProvince = Object.keys(ADDRESS_BOOK)[0];
  const province = customer.province && ADDRESS_BOOK[customer.province] ? customer.province : firstProvince;
  const districts = Object.keys(ADDRESS_BOOK[province] || {});
  const district = customer.district && districts.includes(customer.district) ? customer.district : districts[0];
  const wards = ADDRESS_BOOK[province]?.[district] || [];
  const ward = customer.ward && wards.includes(customer.ward) ? customer.ward : wards[0];
  return `
    <div class="field"><label>Tỉnh/TP</label><select name="province" id="customerProvinceSelect">${optionTags(Object.keys(ADDRESS_BOOK), province)}</select></div>
    <div class="field"><label>Quận/Huyện</label><select name="district" id="customerDistrictSelect">${optionTags(districts, district)}</select></div>
    <div class="field"><label>Phường/Xã</label><select name="ward" id="customerWardSelect">${optionTags(wards, ward)}</select></div>
  `;
}

function openCustomerEditor(customerId) {
  const customer = state.data.customers.find((item) => item.id === customerId);
  if (!customer) return;
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="Sửa khách hàng">
        <div class="modal-header">
          <div><h2>Sửa khách hàng</h2><p class="muted small">${esc(customer.full_name)} · ${esc(customer.phone)}</p></div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <form id="customerEditForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(customer.id)}">
            <div class="field"><label>Tên khách</label><input name="full_name" value="${esc(customer.full_name)}" required></div>
            <div class="field"><label>Số điện thoại</label><input name="phone" value="${esc(customer.phone)}" required></div>
            <div class="field"><label>Kênh</label><select name="channel">${optionTags(state.data.meta.channels, customer.channel)}</select></div>
            <div class="field"><label>Account</label><input name="account" value="${esc(customer.account || "")}"></div>
            <div class="field full"><label>Địa chỉ</label><input name="address" value="${esc(customer.address || "")}"></div>
            ${customerAddressFields(customer)}
            <div class="field full"><label>Ghi chú</label><textarea name="note">${esc(customer.note || "")}</textarea></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="button" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-customer-edit"><i data-lucide="save"></i><span>Lưu khách</span></button>
        </div>
      </section>
    </div>
  `;
  bindAddressSelectors("#customerProvinceSelect", "#customerDistrictSelect", "#customerWardSelect");
  refreshIcons();
}

async function saveCustomerEditFromForm() {
  const form = document.querySelector("#customerEditForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const customerId = data.get("id");
  await api(`/api/customers/${customerId}`, {
    method: "PATCH",
    body: Object.fromEntries(data.entries()),
  });
  closeModal();
  await loadData();
  toast("Đã cập nhật khách hàng");
  render();
}

async function deleteCustomer(customerId) {
  const customer = state.data.customers.find((item) => item.id === customerId);
  if (!customer) return;
  const orderCount = state.data.orders.filter((order) => order.customer_id === customerId).length;
  const suffix = orderCount ? ` Khách này có ${orderCount} deal; các deal/payment/vận đơn liên quan cũng sẽ bị xóa.` : "";
  if (!window.confirm(`Xóa khách ${customer.full_name}?${suffix}`)) return;
  await api(`/api/customers/${customerId}`, { method: "DELETE" });
  clearSelection("customers");
  closeModal();
  await loadData();
  toast("Đã xóa khách hàng");
  render();
}

async function saveOrderFromForm() {
  const form = document.querySelector("#orderForm");
  if (!form.reportValidity()) return;
  if (!window.confirm("Tạo deal mới với thông tin hiện tại?")) return;
  const data = new FormData(form);
  const items = collectOrderItems(form);
  const sourcingLines = collectSourceLines(form);
  const createdOrder = await api("/api/orders", {
    method: "POST",
    body: {
      customer: {
        full_name: data.get("customer_full_name"),
        phone: data.get("customer_phone"),
        channel: data.get("customer_channel"),
        account: data.get("customer_account"),
        address: data.get("customer_address"),
        province: data.get("customer_province"),
        district: data.get("customer_district"),
        ward: data.get("customer_ward"),
      },
      status: data.get("status"),
      items,
      price: Number(data.get("price") || 0),
      date_order: parseViDate(data.get("date_order")),
      due_date: parseViDate(data.get("due_date")),
      assignee: data.get("assignee"),
      request: data.get("request"),
      note: data.get("note"),
      shipping_cost: Number(data.get("shipping_cost") || 0),
      pricing: {
        profit_rate: Number(data.get("profit_rate") || 0),
        tax_rate: Number(data.get("tax_rate") || 0),
      },
      sourcing_lines: sourcingLines,
    },
  });
  const depositAmount = Number(data.get("deposit_amount") || 0);
  if (depositAmount > 0) {
    await api("/api/payments", {
      method: "POST",
      body: {
        order_id: createdOrder.id,
        amount: depositAmount,
        type: depositAmount >= Number(data.get("price") || 0) ? "thanh_toan_du" : "coc",
        method: data.get("deposit_method"),
      },
    });
  }
  closeModal();
  await loadData();
  toast("Đã tạo deal mới");
  state.view = "orders";
  render();
}

function openOrderEditor(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="Sửa deal">
        <div class="modal-header">
          <div><h2>Sửa deal</h2><p class="muted small">${esc(order.order_code)} · ${esc(order.product_name)}</p></div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">${orderFormTemplate(order)}</div>
        <div class="modal-footer">
          <button class="button" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-order-edit"><i data-lucide="save"></i><span>Lưu deal</span></button>
        </div>
      </section>
    </div>
  `;
  document.querySelectorAll("#orderEditForm .product-item-row").forEach((row) => syncProductModeRow(row, row.querySelector('[data-field="product_mode"]')?.value, { hydrateCatalog: false }));
  refreshOrderPricing(document.querySelector("#orderEditForm"));
  refreshIcons();
}

async function saveOrderEditFromForm() {
  const form = document.querySelector("#orderEditForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const orderId = data.get("id");
  await api(`/api/orders/${orderId}`, {
    method: "PATCH",
    body: {
      customer_id: data.get("customer_id"),
      status: data.get("status"),
      items: collectOrderItems(form),
      price: Number(data.get("price") || 0),
      date_order: parseViDate(data.get("date_order")),
      due_date: parseViDate(data.get("due_date")),
      assignee: data.get("assignee"),
      request: data.get("request"),
      note: data.get("note"),
      shipping_cost: Number(data.get("shipping_cost") || 0),
      pricing: {
        profit_rate: Number(data.get("profit_rate") || 0),
        tax_rate: Number(data.get("tax_rate") || 0),
      },
      sourcing_lines: collectSourceLines(form),
    },
  });
  closeModal();
  await loadData();
  toast("Đã cập nhật deal");
  render();
}

async function deleteOrder(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  if (!window.confirm(`Xóa deal ${order.order_code}? Payment, nguồn hàng và vận đơn của deal này cũng sẽ bị xóa.`)) return;
  await api(`/api/orders/${orderId}`, { method: "DELETE" });
  clearSelection("orders");
  closeModal();
  await loadData();
  toast("Đã xóa deal");
  render();
}

function openOrderDetail(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  const sourceRows = order.sourcing_lines
    .map(
      (line) => `
    <tr>
      <td>${esc(line.vendor?.name || "-")}</td>
      <td>${esc(line.material)}</td>
      <td>${esc(line.status)}</td>
      <td class="money">${canSeeCosts() ? fmtMoney(line.cost) : "Ẩn"}</td>
    </tr>
  `,
    )
    .join("");
  const paymentRows = order.payments
    .map((payment) => `<tr><td>${fmtDateTime(payment.paid_at)}</td><td>${esc(payment.method)}</td><td>${esc(payment.type)}</td><td class="money">${fmtMoney(payment.amount)}</td><td><div class="row-actions always-visible"><button class="ghost" data-action="edit-payment" data-payment-id="${esc(payment.id)}" title="Sửa thanh toán"><i data-lucide="pen-line"></i></button><button class="ghost danger-link" data-action="delete-payment" data-payment-id="${esc(payment.id)}" title="Xóa thanh toán"><i data-lucide="trash-2"></i></button></div></td></tr>`)
    .join("");
  const productRows = (order.items || []).map((item) => {
    const catalog = state.data.products.find((product) => product.id === item.product_id);
    const specs = [item.specs?.material, item.size ? `Size ${item.size}` : "", item.specs?.stone, item.specs?.weight].filter(Boolean).join(" · ");
    return `<tr><td><strong>${esc(catalog?.sku || "Tùy chỉnh")}</strong><br><span class="small muted">${item.product_mode === "custom" ? "Mẫu tùy chỉnh" : "Mẫu có sẵn"}</span></td><td>${esc(item.product_name)}${item.note ? `<br><span class="small muted">${esc(item.note)}</span>` : ""}</td><td>${esc(specs || "-")}</td><td>${fmtNumber(item.quantity)}</td><td class="money">${fmtMoney(item.unit_price * item.quantity)}</td></tr>`;
  }).join("");
  const shipmentHistory = order.shipment?.status_history
    ?.map(
      (item) => `
    <div class="timeline-item">
      <span class="timeline-dot"></span>
      <span><strong>${esc(item.label)}</strong><br><span class="small muted">${fmtDateTime(item.at)}</span></span>
    </div>
  `,
    )
    .join("");

  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="Chi tiết đơn">
        <div class="modal-header">
          <div>
            <h2>${esc(order.order_code)} · ${esc(order.product_summary || order.product_name)}</h2>
            <p class="muted small">${esc(order.customer?.full_name || "")} · ${esc(order.customer?.phone || "")}</p>
          </div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <div class="detail-layout">
            <div class="stack">
              <section class="panel">
                <div class="panel-header"><h3>Thông tin deal</h3>${statusPill(order.status)}</div>
                <div class="panel-body">
                  <div class="grid-2">
                    <div class="metric-row"><span>Giá bán</span><strong>${fmtMoney(order.price)}</strong></div>
                    <div class="metric-row"><span>Đã thu</span><strong>${fmtMoney(order.paid_amount)}</strong></div>
                    <div class="metric-row"><span>Giá vốn</span><strong>${canSeeCosts() ? fmtMoney(order.total_cost) : "Ẩn"}</strong></div>
                    <div class="metric-row"><span>Lợi nhuận</span><strong class="${moneyTone(order.profit)}">${canSeeFinancials() ? fmtMoney(order.profit) : "Ẩn"}</strong></div>
                    <div class="metric-row"><span>Ngày đặt</span><strong>${fmtDate(order.date_order)}</strong></div>
                    <div class="metric-row"><span>Due date</span><strong class="${order.overdue ? "overdue" : ""}">${fmtDate(order.due_date)}</strong></div>
                  </div>
                  <p class="muted">${esc(order.request || order.note || "")}</p>
                </div>
              </section>
              <section class="panel">
                <div class="panel-header">
                  <h3>Sản phẩm trong deal</h3>
                  <button class="ghost" data-action="edit-orders" data-id="${esc(order.id)}"><i data-lucide="pen-line"></i><span>Sửa sản phẩm</span></button>
                </div>
                <div class="table-wrap"><table><thead><tr><th>Mã mẫu</th><th>Sản phẩm / ghi chú</th><th>Thông số</th><th>SL</th><th class="money">Thành tiền</th></tr></thead><tbody>${productRows}</tbody></table></div>
              </section>
              <section class="panel">
                <div class="panel-header"><h3>Nguồn hàng</h3><div class="toolbar-right"><span class="tag">${order.sourcing_lines.length} dòng</span><button class="ghost" data-action="edit-orders" data-id="${esc(order.id)}"><i data-lucide="pen-line"></i><span>Sửa chi phí</span></button></div></div>
                <div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Vật liệu</th><th>Trạng thái</th><th class="money">Chi phí</th></tr></thead><tbody>${sourceRows}</tbody></table></div>
              </section>
              <section class="panel">
                <div class="panel-header"><h3>Engine báo giá</h3><button class="ghost" data-action="edit-orders" data-id="${esc(order.id)}"><i data-lucide="pen-line"></i><span>Sửa công thức</span></button></div>
                <div class="panel-body grid-2">
                  <div class="metric-row"><span>Giá vốn mẫu có sẵn</span><strong>${fmtMoney(order.item_cost)}</strong></div>
                  <div class="metric-row"><span>Nguồn hàng / gia công</span><strong>${fmtMoney(order.source_cost)}</strong></div>
                  ${order.material_cost > 0 ? `<div class="metric-row"><span>Chi phí lịch sử Deal cũ</span><strong>${fmtMoney(order.material_cost)}</strong></div>` : ""}
                  <div class="metric-row"><span>Phí giao</span><strong>${fmtMoney(order.shipping_cost)}</strong></div>
                  <div class="metric-row"><span>Tổng giá vốn</span><strong>${fmtMoney(order.total_cost)}</strong></div>
                  <div class="metric-row"><span>Lãi trên giá vốn</span><strong>${fmtPercent(order.pricing?.profit_rate)}</strong></div>
                  <div class="metric-row"><span>Thuế</span><strong>${fmtPercent(order.pricing?.tax_rate)}</strong></div>
                  <div class="metric-row"><span>Giá đề xuất</span><strong>${fmtMoney(order.pricing?.suggested_price)}</strong></div>
                  <div class="metric-row"><span>Giá đã báo</span><strong>${fmtMoney(order.price)}</strong></div>
                  <div class="metric-row"><span>Lãi thực tế</span><strong class="${moneyTone(order.profit)}">${fmtMoney(order.profit)}</strong></div>
                </div>
              </section>
              <section class="panel">
                <div class="panel-header"><h3>Thanh toán</h3><span class="tag">Còn thu ${fmtMoney(order.balance_due)}</span></div>
                <div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Phương thức</th><th>Loại</th><th class="money">Số tiền</th><th>Thao tác</th></tr></thead><tbody>${paymentRows || `<tr><td colspan="5" class="muted">Chưa có thanh toán.</td></tr>`}</tbody></table></div>
                <div class="panel-body">
                  ${paymentRows ? "" : emptyState("wallet", "Chưa có thanh toán", "Ghi nhận cọc hoặc thanh toán còn lại ngay tại form bên dưới.", `<button class="button" data-action="focus-payment"><i data-lucide="plus"></i><span>Thêm thanh toán</span></button>`)}
                  <form id="paymentForm" class="form-grid">
                    <input type="hidden" name="order_id" value="${esc(order.id)}">
                    <div class="field"><label>Số tiền</label><input name="amount" type="number" min="0" step="1000" value="${Math.max(0, order.balance_due)}"></div>
                    <div class="field"><label>Loại</label><select name="type"><option value="coc">Cọc</option><option value="thanh_toan_con_lai">Thanh toán còn lại</option><option value="thanh_toan_du">Thanh toán đủ</option><option value="hoan_tien">Hoàn tiền</option></select></div>
                    <div class="field"><label>Phương thức</label><select name="method"><option>Chuyển khoản</option><option>Tiền mặt</option><option>COD</option><option>Ví</option></select></div>
                    <div class="field"><label>&nbsp;</label><button class="primary" type="submit"><i data-lucide="wallet"></i><span>Ghi nhận</span></button></div>
                  </form>
                </div>
              </section>
            </div>
            <aside class="stack">
              <section class="panel">
                <div class="panel-header"><h3>Thao tác</h3></div>
                <div class="panel-body stack">
                  <button class="button" data-action="edit-orders" data-id="${esc(order.id)}"><i data-lucide="pen-line"></i><span>Sửa deal</span></button>
                  <button class="button danger-soft" data-action="delete-orders" data-id="${esc(order.id)}"><i data-lucide="trash-2"></i><span>Xóa deal</span></button>
                  <select id="detailStatus">${state.data.meta.order_statuses.map((status) => `<option value="${esc(status.id)}" ${status.id === order.status ? "selected" : ""}>${esc(status.label)}</option>`).join("")}</select>
                  <button class="button" data-action="update-order-status" data-order-id="${esc(order.id)}"><i data-lucide="refresh-cw"></i><span>Cập nhật trạng thái</span></button>
                  <button class="button" data-action="print-receipt" data-order-id="${esc(order.id)}" data-lang="vi"><i data-lucide="receipt-text"></i><span>Hóa đơn VN</span></button>
                  <button class="button" data-action="print-receipt" data-order-id="${esc(order.id)}" data-lang="en"><i data-lucide="receipt"></i><span>Receipt EN</span></button>
                  <p class="muted small">Hóa đơn đang là trang in HTML, dùng Print để lưu PDF từ trình duyệt.</p>
                  ${
                    order.shipment
                      ? `<button class="button" data-action="sync-shipment" data-shipment-id="${esc(order.shipment.id)}"><i data-lucide="truck"></i><span>Sync tracking</span></button>`
                      : `<button class="primary" data-action="create-shipment" data-order-id="${esc(order.id)}"><i data-lucide="truck"></i><span>Tạo vận đơn VTP</span></button>`
                  }
                </div>
              </section>
              <section class="panel">
                <div class="panel-header"><h3>Vận chuyển</h3><span class="tag">${esc(order.shipment?.carrier || "Chưa tạo")}</span></div>
                <div class="panel-body">
                  ${
                    order.shipment
                      ? `
                        <div class="metric-row"><span>Mã vận đơn</span><strong>${esc(order.shipment.tracking_code)}</strong></div>
                        <div class="metric-row"><span>Cước</span><strong>${fmtMoney(order.shipment.fee)}</strong></div>
                        <div class="metric-row"><span>COD</span><strong>${fmtMoney(order.shipment.cod_amount)}</strong></div>
                        <div class="timeline">${shipmentHistory}</div>
                      `
                      : emptyState("truck", "Đơn chưa có vận đơn", "Tạo vận đơn mock Viettel Post để demo phí ship, COD và tracking.", `<button class="primary" data-action="create-shipment" data-order-id="${esc(order.id)}"><i data-lucide="truck"></i><span>Tạo vận đơn</span></button>`)
                  }
                </div>
              </section>
            </aside>
          </div>
        </div>
      </section>
    </div>
  `;
  refreshIcons();
}

function openSpecsEditor(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  const specs = order.product_specs || {};
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Nhập thông số trang sức">
        <div class="modal-header">
          <div>
            <h2>Thông số trang sức</h2>
            <p class="muted small">${esc(order.order_code)} · ${esc(order.product_name)}</p>
          </div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <form id="specsForm" class="form-grid">
            <input type="hidden" name="order_id" value="${esc(order.id)}">
            <div class="field"><label>Chất liệu</label><input name="material" value="${esc(specs.material || "")}" placeholder="VD: Bạc 925, vàng 10K"></div>
            <div class="field"><label>Đá / charm</label><input name="stone" value="${esc(specs.stone || "")}" placeholder="VD: Pearl, zircon, charm chữ"></div>
            <div class="field"><label>Trọng lượng</label><input name="weight" value="${esc(specs.weight || "")}" placeholder="VD: 3.2g"></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="button" data-action="open-order" data-order-id="${esc(order.id)}">Quay lại đơn</button>
          <button class="primary" data-action="save-specs"><i data-lucide="save"></i><span>Lưu thông số</span></button>
        </div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveSpecsFromForm() {
  const form = document.querySelector("#specsForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const orderId = data.get("order_id");
  await api(`/api/orders/${orderId}`, {
    method: "PATCH",
    body: {
      product_specs: {
        material: data.get("material"),
        stone: data.get("stone"),
        weight: data.get("weight"),
      },
    },
  });
  await loadData();
  toast("Đã lưu thông số trang sức");
  render();
  openOrderDetail(orderId);
}

function openVendorForm() {
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="Thêm nhà cung cấp">
        <div class="modal-header"><h2>Thêm nhà cung cấp</h2><button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button></div>
        <div class="modal-body">
          <form id="vendorForm" class="form-grid">
            <div class="field"><label>Tên</label><input name="name" required></div>
            <div class="field"><label>Loại</label><select name="type"><option>Đá quý</option><option>Vàng-bạc</option><option>Gia công</option><option>Mạ</option><option>Khác</option></select></div>
            <div class="field"><label>Liên hệ</label><input name="contact"></div>
            <div class="field"><label>SĐT</label><input name="phone"></div>
            <div class="field full"><label>Địa chỉ</label><input name="address"></div>
            <div class="field full"><label>Ghi chú</label><textarea name="note"></textarea></div>
          </form>
        </div>
        <div class="modal-footer"><button class="button" data-action="close-modal">Hủy</button><button class="primary" data-action="save-vendor"><i data-lucide="save"></i><span>Lưu NCC</span></button></div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveVendorFromForm() {
  const form = document.querySelector("#vendorForm");
  if (!form.reportValidity()) return;
  const body = Object.fromEntries(new FormData(form).entries());
  await api("/api/vendors", { method: "POST", body });
  closeModal();
  await loadData();
  toast("Đã thêm nhà cung cấp");
  render();
}

function openVendorEditor(vendorId) {
  const vendor = state.data.vendors.find((item) => item.id === vendorId);
  if (!vendor) return;
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Sửa nhà cung cấp">
        <div class="modal-header">
          <div><h2>Sửa nhà cung cấp</h2><p class="muted small">${esc(vendor.name)} · ${esc(vendor.phone || "")}</p></div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <form id="vendorEditForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(vendor.id)}">
            <div class="field"><label>Tên</label><input name="name" value="${esc(vendor.name)}" required></div>
            <div class="field"><label>Loại</label><select name="type">${optionTags(["Đá quý", "Vàng-bạc", "Gia công", "Mạ", "Khác"], vendor.type)}</select></div>
            <div class="field"><label>Liên hệ</label><input name="contact" value="${esc(vendor.contact || "")}"></div>
            <div class="field"><label>SĐT</label><input name="phone" value="${esc(vendor.phone || "")}"></div>
            <div class="field full"><label>Địa chỉ</label><input name="address" value="${esc(vendor.address || "")}"></div>
            <div class="field full"><label>Ghi chú</label><textarea name="note">${esc(vendor.note || "")}</textarea></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="button" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-vendor-edit"><i data-lucide="save"></i><span>Lưu NCC</span></button>
        </div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveVendorEditFromForm() {
  const form = document.querySelector("#vendorEditForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const vendorId = data.get("id");
  await api(`/api/vendors/${vendorId}`, { method: "PATCH", body: Object.fromEntries(data.entries()) });
  closeModal();
  await loadData();
  toast("Đã cập nhật nhà cung cấp");
  render();
}

async function deleteVendor(vendorId) {
  const vendor = state.data.vendors.find((item) => item.id === vendorId);
  if (!vendor) return;
  const lineCount = state.data.order_sourcing_lines.filter((line) => line.vendor_id === vendorId).length;
  const suffix = lineCount ? ` ${lineCount} dòng nguồn hàng sẽ được giữ lại nhưng gỡ liên kết NCC.` : "";
  if (!window.confirm(`Xóa NCC ${vendor.name}?${suffix}`)) return;
  await api(`/api/vendors/${vendorId}`, { method: "DELETE" });
  clearSelection("vendors");
  closeModal();
  await loadData();
  toast("Đã xóa nhà cung cấp");
  render();
}

function materialMarketOptions(selected = "") {
  const market = state.data.market_prices || {};
  return optionTags([
    { id: "", label: "Không liên kết · dùng giá cơ sở riêng" },
    ...(market.gold?.karats || []).map((row) => ({ id: `gold:${String(row.code).toUpperCase()}`, label: `Vàng · ${row.label || row.code}` })),
    ...(market.silver?.purities || []).map((row) => ({ id: `silver:${String(row.code).toUpperCase()}`, label: `Bạc · ${row.label || row.code}` })),
  ], selected);
}

function openMaterialEditor(materialId = "") {
  const material = (state.data.settings?.material_catalog || []).find((item) => item.id === materialId) || {
    id: "", name: "", group: "Khác", market_key: "", default_unit: "g", default_price: 0, note: "",
  };
  const editing = Boolean(materialId);
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="${editing ? "Sửa" : "Thêm"} chất liệu">
        <div class="modal-header"><div><h2>${editing ? "Sửa" : "Thêm"} chất liệu</h2><p class="small muted">Chất liệu sau khi lưu sẽ xuất hiện trong dropdown của từng sản phẩm trong Deal.</p></div><button class="ghost" data-action="close-modal" aria-label="Đóng"><i data-lucide="x"></i></button></div>
        <div class="modal-body">
          <form id="materialForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(material.id)}">
            <div class="field"><label>Tên chất liệu</label><input name="name" value="${esc(material.name)}" required placeholder="Bạc 950"></div>
            <div class="field"><label>Nhóm</label><input name="group" value="${esc(material.group)}" required placeholder="Vàng / Bạc / Đá / Khác"></div>
            <div class="field full"><label>Liên kết nguồn giá</label><select name="market_key">${materialMarketOptions(material.market_key)}</select></div>
            <div class="field"><label>Đơn vị mặc định</label><select name="default_unit"><option value="g" ${material.default_unit === "g" ? "selected" : ""}>gram</option><option value="chi" ${material.default_unit === "chi" ? "selected" : ""}>chỉ</option></select></div>
            <div class="field"><label>Giá cơ sở riêng / đơn vị</label><input name="default_price" type="number" min="0" step="100" value="${Number(material.default_price || 0)}"></div>
            <div class="field full"><label>Ghi chú</label><textarea name="note">${esc(material.note || "")}</textarea></div>
          </form>
        </div>
        <div class="modal-footer"><button class="button" data-action="close-modal">Hủy</button><button class="primary" data-action="save-material"><i data-lucide="save"></i><span>Lưu chất liệu</span></button></div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveMaterialFromForm() {
  const form = document.querySelector("#materialForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const materialId = data.get("id");
  await api(materialId ? `/api/materials/${materialId}` : "/api/materials", {
    method: materialId ? "PATCH" : "POST",
    body: {
      name: data.get("name"),
      group: data.get("group"),
      market_key: data.get("market_key"),
      default_unit: data.get("default_unit"),
      default_price: Number(data.get("default_price") || 0),
      note: data.get("note"),
    },
  });
  closeModal();
  await loadData();
  toast(materialId ? "Đã cập nhật chất liệu" : "Đã thêm chất liệu");
  render();
}

async function deleteMaterial(materialId) {
  const material = (state.data.settings?.material_catalog || []).find((item) => item.id === materialId);
  if (!material || !window.confirm(`Xóa chất liệu ${material.name}? Deal cũ vẫn giữ snapshot tên và giá đã dùng.`)) return;
  await api(`/api/materials/${materialId}`, { method: "DELETE" });
  await loadData();
  toast("Đã xóa chất liệu");
  render();
}

function openProductEditor(productId = "") {
  const product = state.data.products.find((item) => item.id === productId) || { sku: "", name: "", type: "Ring", material_id: "", default_size: "", default_stone: "", default_price: 0, default_cost: 0, status: "active", track_inventory: false, low_stock_threshold: 1, note: "" };
  const editing = Boolean(productId);
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="${editing ? "Sửa" : "Thêm"} mẫu sản phẩm">
        <div class="modal-header"><div><h2>${editing ? "Sửa" : "Thêm"} sản phẩm có sẵn</h2><p class="small muted">Thông tin này sẽ được sao chép vào Deal khi Sale chọn sản phẩm.</p></div><button class="ghost" data-action="close-modal" aria-label="Đóng"><i data-lucide="x"></i></button></div>
        <div class="modal-body">
          <form id="productForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(productId)}">
            <div class="field"><label>SKU / mã sản phẩm</label><input name="sku" value="${esc(product.sku)}" required placeholder="TR-RING-001"></div>
            <div class="field"><label>Loại</label><select name="type">${optionTags(state.data.meta.product_types, product.type)}</select></div>
            <div class="field full"><label>Tên sản phẩm</label><input name="name" value="${esc(product.name)}" required placeholder="Nhẫn twist 4 chấu"></div>
            <div class="field"><label>Chất liệu</label><select name="material_id">${materialCatalogOptions(product.material_id)}</select></div>
            <div class="field"><label>Trạng thái bán</label><select name="status"><option value="active" ${product.status === "active" ? "selected" : ""}>Đang bán</option><option value="inactive" ${product.status === "inactive" ? "selected" : ""}>Ngừng bán</option></select></div>
            <div class="field"><label>Size mặc định</label><input name="default_size" value="${esc(product.default_size || "")}" placeholder="12 / 42cm"></div>
            <div class="field"><label>Đá / charm mặc định</label><input name="default_stone" value="${esc(product.default_stone || "")}" placeholder="Zircon trắng..."></div>
            <div class="field"><label>Giá bán mặc định</label><input name="default_price" type="number" min="0" step="1000" value="${Number(product.default_price || 0)}"></div>
            <div class="field"><label>Giá vốn mặc định</label><input name="default_cost" type="number" min="0" step="1000" value="${Number(product.default_cost || 0)}"></div>
            <div class="field full inventory-toggle"><label class="check-control"><input name="track_inventory" type="checkbox" ${product.track_inventory ? "checked" : ""}><span>Theo dõi tồn kho cho sản phẩm này</span></label></div>
            ${editing ? `<div class="field"><label>Tồn hiện tại</label><output class="field-output">${fmtNumber(product.on_hand)} sản phẩm</output></div>` : `<div class="field"><label>Tồn đầu kỳ</label><input name="initial_stock" type="number" min="0" step="1" value="0"></div>`}
            <div class="field"><label>Cảnh báo khi tồn còn</label><input name="low_stock_threshold" type="number" min="0" step="1" value="${Number(product.low_stock_threshold || 0)}"></div>
            <div class="field full"><label>Ghi chú</label><textarea name="note">${esc(product.note || "")}</textarea></div>
          </form>
        </div>
        <div class="modal-footer"><button class="button" data-action="close-modal">Hủy</button><button class="primary" data-action="save-product"><i data-lucide="save"></i><span>Lưu mẫu</span></button></div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveProductFromForm() {
  const form = document.querySelector("#productForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const productId = data.get("id");
  const body = {
    sku: data.get("sku"),
    type: data.get("type"),
    name: data.get("name"),
    default_price: Number(data.get("default_price") || 0),
    default_cost: Number(data.get("default_cost") || 0),
    material_id: data.get("material_id"),
    default_size: data.get("default_size"),
    default_stone: data.get("default_stone"),
    status: data.get("status"),
    track_inventory: data.get("track_inventory") === "on",
    low_stock_threshold: Number(data.get("low_stock_threshold") || 0),
    initial_stock: Number(data.get("initial_stock") || 0),
    note: data.get("note"),
  };
  await api(productId ? `/api/products/${productId}` : "/api/products", { method: productId ? "PATCH" : "POST", body });
  closeModal();
  await loadData();
  toast(productId ? "Đã cập nhật mẫu sản phẩm" : "Đã thêm mẫu sản phẩm");
  render();
}

async function deleteProduct(productId) {
  const product = state.data.products.find((item) => item.id === productId);
  if (!product || !window.confirm(`${product.order_count ? "Ngừng bán" : "Xóa"} sản phẩm ${product.name}? Deal cũ luôn giữ snapshot đã bán.`)) return;
  const result = await api(`/api/products/${productId}`, { method: "DELETE" });
  await loadData();
  toast(result.archived ? "Sản phẩm đã được chuyển sang ngừng bán" : "Đã xóa sản phẩm");
  render();
}

function openStockAdjustment(productId) {
  const product = state.data.products.find((item) => item.id === productId);
  if (!product) return;
  modalHost.innerHTML = `<div class="modal-backdrop" data-action="close-modal"><section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Điều chỉnh tồn kho"><div class="modal-header"><div><h2>Điều chỉnh tồn kho</h2><p class="small muted">${esc(product.name)} · hiện có ${fmtNumber(product.on_hand)}, đang giữ ${fmtNumber(product.reserved)}</p></div><button class="ghost" data-action="close-modal" aria-label="Đóng"><i data-lucide="x"></i></button></div><div class="modal-body"><form id="stockAdjustmentForm" class="form-grid"><input type="hidden" name="product_id" value="${esc(product.id)}"><div class="field"><label>Loại biến động</label><select name="type"><option value="receipt">Nhập thêm</option><option value="adjustment">Điều chỉnh tăng/giảm</option></select></div><div class="field"><label>Số lượng thay đổi</label><input name="quantity" type="number" step="1" required placeholder="VD: 5 hoặc -2"></div><div class="field full"><label>Lý do</label><input name="reason" required placeholder="Nhập hàng mới, kiểm kê, hư hỏng..."></div></form></div><div class="modal-footer"><button class="button" data-action="close-modal">Hủy</button><button class="primary" data-action="save-stock-adjustment"><i data-lucide="save"></i><span>Lưu biến động</span></button></div></section></div>`;
  refreshIcons();
}

async function saveStockAdjustment() {
  const form = document.querySelector("#stockAdjustmentForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  await api("/api/inventory/adjustments", { method: "POST", body: { product_id: data.get("product_id"), type: data.get("type"), quantity: Number(data.get("quantity")), reason: data.get("reason") } });
  closeModal();
  await loadData();
  toast("Đã cập nhật tồn kho");
  render();
}

const METAL_RULE_MODES = [
  { id: "market", label: "Theo thị trường" },
  { id: "percent", label: "Thị trường ± %" },
  { id: "add", label: "Thị trường ± số tiền" },
  { id: "manual", label: "Giá cố định" },
];

function metalRuleSummary(rule = {}) {
  if (rule.mode === "percent") return `${Number(rule.value || 0) >= 0 ? "+" : ""}${fmtNumber(rule.value)}%`;
  if (rule.mode === "add") return `${Number(rule.value || 0) >= 0 ? "+" : ""}${fmtMoney(rule.value)}`;
  if (rule.mode === "manual") return "Cố định";
  return "Thị trường";
}

function metalRuleResult(marketValue, mode, value) {
  if (mode === "percent") return Math.round((marketValue * (1 + value / 100)) / 1000) * 1000;
  if (mode === "add") return Math.max(0, marketValue + value);
  if (mode === "manual") return Math.max(0, value);
  return marketValue;
}

function syncMetalRuleRow(row) {
  if (!row) return;
  const mode = row.querySelector('[data-field="mode"]')?.value || "market";
  const valueInput = row.querySelector('[data-field="value"]');
  const marketValue = Number(row.dataset.marketValue || 0);
  if (valueInput) {
    valueInput.disabled = mode === "market";
    valueInput.step = mode === "percent" ? "0.1" : "1000";
    valueInput.placeholder = mode === "percent" ? "VD: 3 hoặc -2" : "Nhập số tiền";
  }
  const result = metalRuleResult(marketValue, mode, Number(valueInput?.value || 0));
  const output = row.querySelector('[data-field="result"]');
  if (output) output.textContent = fmtMoney(result);
  row.classList.toggle("is-adjusted", mode !== "market");
}

function openMetalPriceEditor() {
  const market = state.data.market_prices || {};
  const rules = state.data.settings?.metal_price_rules || {};
  const groups = [
    ["gold", "Vàng", market.gold?.karats || []],
    ["silver", "Bạc", market.silver?.purities || []],
  ];
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="Cấu hình giá kim loại">
        <div class="modal-header"><div><h2>Engine giá kim loại</h2><p class="small muted">Mỗi tuổi kim loại có thể bám thị trường, cộng/trừ phần trăm, cộng/trừ số tiền hoặc dùng giá cố định.</p></div><button class="ghost" data-action="close-modal" aria-label="Đóng"><i data-lucide="x"></i></button></div>
        <div class="modal-body">
          <form id="metalPriceForm" class="stack">
            ${groups.map(([group, label, rows]) => `
              <section class="editor-section">
                <div class="editor-section-header"><h3>${label}</h3><span class="tag">${rows.length} mức giá</span></div>
                <div class="metal-rule-list">
                  ${rows.map((row) => {
                    const key = `${group}:${String(row.code).toUpperCase()}`;
                    const rule = rules[key] || row.price_rule || { mode: "market", value: 0 };
                    const marketValue = Number(row.market_sell || row.sell || 0);
                    return `<div class="metal-rule-row" data-price-key="${esc(key)}" data-market-value="${marketValue}"><div><strong>${esc(row.label || row.code)}</strong><span class="small muted">Thị trường ${fmtMoney(marketValue)}</span></div><select data-field="mode" aria-label="Quy tắc ${esc(row.label || row.code)}">${optionTags(METAL_RULE_MODES, rule.mode)}</select><input data-field="value" type="number" value="${Number(rule.value || 0)}" aria-label="Giá trị điều chỉnh ${esc(row.label || row.code)}"><output data-field="result">${fmtMoney(metalRuleResult(marketValue, rule.mode, Number(rule.value || 0)))}</output></div>`;
                  }).join("")}
                </div>
              </section>
            `).join("")}
          </form>
        </div>
        <div class="modal-footer"><button class="button" data-action="close-modal">Hủy</button><button class="primary" data-action="save-metal-prices"><i data-lucide="save"></i><span>Lưu cấu hình giá</span></button></div>
      </section>
    </div>
  `;
  document.querySelectorAll(".metal-rule-row").forEach(syncMetalRuleRow);
  refreshIcons();
}

async function saveMetalPricesFromForm() {
  const form = document.querySelector("#metalPriceForm");
  if (!form) return;
  const rules = {};
  form.querySelectorAll(".metal-rule-row").forEach((row) => {
    rules[row.dataset.priceKey] = {
      mode: row.querySelector('[data-field="mode"]')?.value || "market",
      value: Number(row.querySelector('[data-field="value"]')?.value || 0),
    };
  });
  await api("/api/settings", { method: "PATCH", body: { metal_price_rules: rules } });
  closeModal();
  await loadData();
  toast("Đã lưu engine giá kim loại");
  render();
}

function nextGoalMonth(months) {
  const latest = months.at(-1) || new Date().toISOString().slice(0, 7);
  const [year, month] = latest.split("-").map(Number);
  const date = new Date(year, month, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function syncGoalEditorDraft() {
  const form = document.querySelector("#revenueTargetForm");
  if (!form || !goalEditorDraft) return;
  goalEditorDraft.goals = [...form.querySelectorAll(".goal-editor-row")].map((row) => ({
    id: row.dataset.goalId,
    name: row.querySelector('[data-field="goal_name"]')?.value.trim() || "Mục tiêu",
    metric: row.querySelector('[data-field="goal_metric"]')?.value || "revenue",
    color: row.querySelector('[data-field="goal_color"]')?.value || chartColors[0],
    targets: Object.fromEntries(goalEditorDraft.months.map((month) => [month, Number(row.querySelector(`[data-target-month="${month}"]`)?.value || 0)])),
  }));
}

function renderRevenueTargetEditor() {
  const draft = goalEditorDraft;
  if (!draft) return;
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal goal-editor-modal" role="dialog" aria-modal="true" aria-label="Cấu hình mục tiêu kinh doanh">
        <div class="modal-header"><div><h2>Mục tiêu kinh doanh</h2><p class="small muted">Tạo nhiều loại mục tiêu, chọn cách đo và đặt giá trị độc lập cho từng tháng.</p></div><button class="ghost" data-action="close-modal" aria-label="Đóng"><i data-lucide="x"></i></button></div>
        <div class="modal-body">
          <div class="goal-editor-toolbar">
            <div class="field"><label>Tháng mới</label><input id="newGoalMonth" type="month" value="${esc(nextGoalMonth(draft.months))}"></div>
            <button class="button" type="button" data-action="add-goal-month"><i data-lucide="calendar-plus"></i><span>Thêm tháng</span></button>
            <button class="button" type="button" data-action="add-business-goal"><i data-lucide="plus"></i><span>Thêm mục tiêu</span></button>
          </div>
          <form id="revenueTargetForm">
            <div class="goal-matrix-wrap">
              <table class="goal-matrix">
                <thead><tr><th class="goal-name-col">Mục tiêu</th><th class="goal-metric-col">Chỉ số đo</th>${draft.months.map((month) => `<th><span>Tháng ${month.slice(5)}/${month.slice(0, 4)}</span><button class="ghost danger-link icon-only" type="button" data-action="delete-goal-month" data-month="${esc(month)}" title="Xóa tháng" aria-label="Xóa tháng ${esc(month)}"><i data-lucide="x"></i></button></th>`).join("")}<th class="goal-action-col">Xóa</th></tr></thead>
                <tbody>
                  ${draft.goals.map((goal) => `<tr class="goal-editor-row" data-goal-id="${esc(goal.id)}">
                    <td><div class="goal-name-input"><input data-field="goal_color" type="color" value="${esc(goal.color || chartColors[0])}" aria-label="Màu mục tiêu"><input data-field="goal_name" value="${esc(goal.name)}" required></div></td>
                    <td><select data-field="goal_metric">${optionTags(GOAL_METRICS, goal.metric)}</select></td>
                    ${draft.months.map((month) => `<td><input data-target-month="${esc(month)}" type="number" min="0" step="1000" value="${Number(goal.targets?.[month] || 0)}" aria-label="${esc(goal.name)} tháng ${esc(month)}"></td>`).join("")}
                    <td><button class="ghost danger-link icon-only" type="button" data-action="delete-business-goal" data-goal-id="${esc(goal.id)}" title="Xóa mục tiêu" aria-label="Xóa mục tiêu"><i data-lucide="trash-2"></i></button></td>
                  </tr>`).join("")}
                </tbody>
              </table>
            </div>
          </form>
        </div>
        <div class="modal-footer"><button class="button" data-action="close-modal">Hủy</button><button class="primary" data-action="save-revenue-targets"><i data-lucide="save"></i><span>Lưu mục tiêu</span></button></div>
      </section>
    </div>
  `;
  refreshIcons();
}

function openRevenueTargetEditor() {
  const settings = state.data.settings || {};
  goalEditorDraft = {
    months: [...(settings.goal_months || buildMonthlySeries().map((point) => point.month))],
    goals: JSON.parse(JSON.stringify(settings.business_goals || [{ id: "goal_revenue", name: "Doanh thu", metric: "revenue", color: chartColors[1], targets: settings.monthly_revenue_targets || {} }])),
  };
  renderRevenueTargetEditor();
}

function addGoalMonth() {
  syncGoalEditorDraft();
  const month = document.querySelector("#newGoalMonth")?.value;
  if (!month || goalEditorDraft.months.includes(month)) {
    toast(month ? "Tháng này đã có trong bảng" : "Chọn tháng cần thêm");
    return;
  }
  goalEditorDraft.months.push(month);
  goalEditorDraft.months.sort();
  goalEditorDraft.goals.forEach((goal) => { goal.targets[month] = 0; });
  renderRevenueTargetEditor();
}

function deleteGoalMonth(month) {
  if (goalEditorDraft.months.length <= 1) {
    toast("Cần giữ ít nhất một tháng");
    return;
  }
  syncGoalEditorDraft();
  goalEditorDraft.months = goalEditorDraft.months.filter((item) => item !== month);
  goalEditorDraft.goals.forEach((goal) => { delete goal.targets[month]; });
  renderRevenueTargetEditor();
}

function addBusinessGoal() {
  syncGoalEditorDraft();
  const index = goalEditorDraft.goals.length;
  goalEditorDraft.goals.push({ id: `goal_${Date.now().toString(36)}`, name: `Mục tiêu ${index + 1}`, metric: "revenue", color: chartColors[index % chartColors.length], targets: Object.fromEntries(goalEditorDraft.months.map((month) => [month, 0])) });
  renderRevenueTargetEditor();
}

function deleteBusinessGoal(goalId) {
  if (goalEditorDraft.goals.length <= 1) {
    toast("Cần giữ ít nhất một mục tiêu");
    return;
  }
  syncGoalEditorDraft();
  goalEditorDraft.goals = goalEditorDraft.goals.filter((goal) => goal.id !== goalId);
  renderRevenueTargetEditor();
}

async function saveRevenueTargetsFromForm() {
  const form = document.querySelector("#revenueTargetForm");
  if (!form?.reportValidity()) return;
  syncGoalEditorDraft();
  const revenueGoal = goalEditorDraft.goals.find((goal) => goal.metric === "revenue");
  await api("/api/settings", {
    method: "PATCH",
    body: {
      goal_months: goalEditorDraft.months,
      business_goals: goalEditorDraft.goals,
      monthly_revenue_targets: revenueGoal?.targets || {},
    },
  });
  goalEditorDraft = null;
  closeModal();
  await loadData();
  toast("Đã cập nhật mục tiêu kinh doanh");
  render();
}

async function refreshMarketPrices() {
  toast("Đang cập nhật giá vàng/bạc...");
  const payload = await api("/api/market-prices?refresh=1");
  state.data.market_prices = payload;
  toast(payload.status === "fallback" ? "Không lấy được nguồn live, đang dùng giá dự phòng" : "Đã cập nhật giá kim loại");
  render();
}

async function createShipment(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  const cod = order.balance_due || 0;
  if (!window.confirm(`Tạo vận đơn Viettel Post mock cho ${order.order_code} với COD ${fmtMoney(cod)}?`)) return;
  await api("/api/shipments/create", {
    method: "POST",
    body: {
      order_id: orderId,
      weight: 320,
      dimensions: "12x10x6",
      cod_amount: cod,
      service_code: "VCN",
    },
  });
  await loadData();
  toast("Đã tạo vận đơn Viettel Post");
  render();
  if (modalHost.innerHTML) openOrderDetail(orderId);
}

async function syncShipment(shipmentId) {
  const shipment = await api(`/api/shipments/${shipmentId}/tracking-sync`, { method: "POST", body: {} });
  await loadData();
  toast(`Đã đồng bộ: ${shipment.status_label}`);
  render();
  const shipmentAfter = state.data.shipments.find((item) => item.id === shipmentId);
  if (modalHost.innerHTML && shipmentAfter) openOrderDetail(shipmentAfter.order_id);
}

function openShipmentEditor(shipmentId) {
  const shipment = state.data.shipments.find((item) => item.id === shipmentId);
  if (!shipment) return;
  const order = state.data.orders.find((item) => item.id === shipment.order_id);
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Sửa vận đơn">
        <div class="modal-header">
          <div><h2>Sửa vận đơn</h2><p class="muted small">${esc(shipment.tracking_code)} · ${esc(order?.order_code || "")}</p></div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <form id="shipmentEditForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(shipment.id)}">
            <div class="field"><label>Mã vận đơn</label><input name="tracking_code" value="${esc(shipment.tracking_code)}" required></div>
            <div class="field"><label>Đơn vị</label><input name="carrier" value="${esc(shipment.carrier || "Viettel Post")}"></div>
            <div class="field"><label>Dịch vụ</label><input name="service_code" value="${esc(shipment.service_code || "")}"></div>
            <div class="field"><label>Trạng thái</label><select name="status">${optionTags(SHIPMENT_STATUSES, shipment.status)}</select></div>
            <div class="field full"><label>Nhãn trạng thái</label><input name="status_label" value="${esc(shipment.status_label || "")}"></div>
            <div class="field"><label>Dự kiến giao</label><input name="expected_delivery" class="date-text" inputmode="numeric" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="dd/mm/yyyy" value="${formatDateInput(shipment.expected_delivery)}"></div>
            <div class="field"><label>Cước</label><input name="fee" type="number" min="0" step="1000" value="${Number(shipment.fee || 0)}"></div>
            <div class="field"><label>COD</label><input name="cod_amount" type="number" min="0" step="1000" value="${Number(shipment.cod_amount || 0)}"></div>
            <div class="field"><label>Khối lượng gram</label><input name="weight" type="number" min="0" step="1" value="${Number(shipment.weight || 0)}"></div>
            <div class="field"><label>Kích thước</label><input name="dimensions" value="${esc(shipment.dimensions || "")}"></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="button" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-shipment-edit"><i data-lucide="save"></i><span>Lưu vận đơn</span></button>
        </div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveShipmentEditFromForm() {
  const form = document.querySelector("#shipmentEditForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const shipmentId = data.get("id");
  await api(`/api/shipments/${shipmentId}`, {
    method: "PATCH",
    body: {
      tracking_code: data.get("tracking_code"),
      carrier: data.get("carrier"),
      service_code: data.get("service_code"),
      status: data.get("status"),
      status_label: data.get("status_label"),
      expected_delivery: parseViDate(data.get("expected_delivery")),
      fee: Number(data.get("fee") || 0),
      cod_amount: Number(data.get("cod_amount") || 0),
      weight: Number(data.get("weight") || 0),
      dimensions: data.get("dimensions"),
    },
  });
  closeModal();
  await loadData();
  toast("Đã cập nhật vận đơn");
  render();
}

async function deleteShipment(shipmentId) {
  const shipment = state.data.shipments.find((item) => item.id === shipmentId);
  if (!shipment) return;
  if (!window.confirm(`Xóa vận đơn ${shipment.tracking_code}? Deal liên quan sẽ được gỡ vận đơn.`)) return;
  await api(`/api/shipments/${shipmentId}`, { method: "DELETE" });
  clearSelection("shipments");
  closeModal();
  await loadData();
  toast("Đã xóa vận đơn");
  render();
}

async function updateOrderStatus(orderId) {
  const status = document.querySelector("#detailStatus")?.value;
  if (!status) return;
  const order = state.data.orders.find((item) => item.id === orderId);
  const nextLabel = statusLabel(status);
  if (order?.status === status) {
    toast("Trạng thái chưa thay đổi");
    return;
  }
  if (!window.confirm(`Cập nhật trạng thái ${order?.order_code || "đơn"} thành "${nextLabel}"?`)) return;
  await api(`/api/orders/${orderId}`, { method: "PATCH", body: { status } });
  await loadData();
  toast("Đã cập nhật trạng thái đơn");
  render();
  openOrderDetail(orderId);
}

async function copyReminder(orderId) {
  const order = state.data.orders.find((item) => item.id === orderId);
  if (!order) return;
  const message = `Trinket nhắc nhẹ đơn ${order.order_code}: phần còn lại cần thanh toán là ${fmtMoney(order.balance_due)}. Khi bạn tiện, mình xác nhận giúp Trinket nhé.`;
  await navigator.clipboard?.writeText(message);
  toast("Đã copy nội dung nhắc thu");
}

async function submitPayment(event) {
  event.preventDefault();
  const form = event.target;
  const body = Object.fromEntries(new FormData(form).entries());
  body.amount = Number(body.amount || 0);
  await api("/api/payments", { method: "POST", body });
  await loadData();
  toast("Đã ghi nhận thanh toán");
  render();
  openOrderDetail(body.order_id);
}

function openPaymentEditor(paymentId) {
  const payment = state.data.orders.flatMap((order) => order.payments || []).find((item) => item.id === paymentId);
  if (!payment) return;
  const order = state.data.orders.find((item) => item.id === payment.order_id);
  const paidAt = payment.paid_at ? new Date(payment.paid_at).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Sửa thanh toán">
        <div class="modal-header"><div><h2>Sửa thanh toán</h2><p class="small muted">${esc(order?.order_code || "")} · ${esc(order?.customer?.full_name || "")}</p></div><button class="ghost" data-action="close-modal" aria-label="Đóng"><i data-lucide="x"></i></button></div>
        <div class="modal-body">
          <form id="paymentEditForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(payment.id)}"><input type="hidden" name="order_id" value="${esc(payment.order_id)}">
            <div class="field"><label>Số tiền</label><input name="amount" type="number" min="0" step="1000" value="${Number(payment.amount || 0)}" required></div>
            <div class="field"><label>Loại</label><select name="type">${optionTags([{ id: "coc", label: "Cọc" }, { id: "thanh_toan_con_lai", label: "Thanh toán còn lại" }, { id: "thanh_toan_du", label: "Thanh toán đủ" }, { id: "hoan_tien", label: "Hoàn tiền" }], payment.type)}</select></div>
            <div class="field"><label>Phương thức</label><select name="method">${optionTags(["Chuyển khoản", "Tiền mặt", "COD", "Ví"], payment.method)}</select></div>
            <div class="field"><label>Thời gian</label><input name="paid_at" type="datetime-local" value="${esc(paidAt)}"></div>
          </form>
        </div>
        <div class="modal-footer"><button class="button" data-action="open-order" data-order-id="${esc(payment.order_id)}">Quay lại deal</button><button class="primary" data-action="save-payment-edit"><i data-lucide="save"></i><span>Lưu thanh toán</span></button></div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function savePaymentEditFromForm() {
  const form = document.querySelector("#paymentEditForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const paymentId = data.get("id");
  const orderId = data.get("order_id");
  await api(`/api/payments/${paymentId}`, {
    method: "PATCH",
    body: {
      amount: Number(data.get("amount") || 0),
      type: data.get("type"),
      method: data.get("method"),
      paid_at: data.get("paid_at") ? new Date(data.get("paid_at")).toISOString() : new Date().toISOString(),
    },
  });
  await loadData();
  toast("Đã cập nhật thanh toán");
  render();
  openOrderDetail(orderId);
}

async function deletePayment(paymentId) {
  const payment = state.data.orders.flatMap((order) => order.payments || []).find((item) => item.id === paymentId);
  if (!payment || !window.confirm(`Xóa giao dịch ${fmtMoney(payment.amount)}? Công nợ deal sẽ được tính lại.`)) return;
  await api(`/api/payments/${paymentId}`, { method: "DELETE" });
  await loadData();
  toast("Đã xóa thanh toán");
  render();
  openOrderDetail(payment.order_id);
}

async function submitExpense(event) {
  event.preventDefault();
  const form = event.target;
  const body = Object.fromEntries(new FormData(form).entries());
  body.amount = Number(body.amount || 0);
  body.date = parseViDate(body.date) || body.date;
  await api("/api/expenses", { method: "POST", body });
  await loadData();
  toast("Đã ghi nhận chi phí");
  render();
}

function openExpenseEditor(expenseId) {
  const expense = state.data.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  const categoryOptions = state.data.meta.expense_categories.map((item) => `<option ${item === expense.category ? "selected" : ""}>${esc(item)}</option>`).join("");
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Sửa chi phí">
        <div class="modal-header">
          <div><h2>Sửa chi phí</h2><p class="muted small">${esc(expense.description || expense.category)}</p></div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <form id="expenseEditForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(expense.id)}">
            <div class="field"><label>Ngày</label><input name="date" class="date-text" inputmode="numeric" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="dd/mm/yyyy" value="${formatDateInput(expense.date)}"></div>
            <div class="field"><label>Nhóm</label><select name="category">${categoryOptions}</select></div>
            <div class="field full"><label>Diễn giải</label><input name="description" value="${esc(expense.description)}"></div>
            <div class="field"><label>Số tiền</label><input name="amount" type="number" min="0" step="1000" value="${Number(expense.amount || 0)}"></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="button" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-expense"><i data-lucide="save"></i><span>Lưu chi phí</span></button>
        </div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveExpenseFromForm() {
  const form = document.querySelector("#expenseEditForm");
  if (!form?.reportValidity()) return;
  const body = Object.fromEntries(new FormData(form).entries());
  const expenseId = body.id;
  delete body.id;
  body.amount = Number(body.amount || 0);
  body.date = parseViDate(body.date) || body.date;
  await api(`/api/expenses/${expenseId}`, { method: "PATCH", body });
  closeModal();
  await loadData();
  toast("Đã cập nhật chi phí");
  render();
}

async function deleteExpense(expenseId) {
  const expense = state.data.expenses.find((item) => item.id === expenseId);
  if (!expense) return;
  if (!window.confirm(`Xóa chi phí "${expense.description || expense.category}"?`)) return;
  await api(`/api/expenses/${expenseId}`, { method: "DELETE" });
  await loadData();
  toast("Đã xóa chi phí");
  render();
}

function entityBasePath(entity) {
  return {
    orders: "/api/orders",
    products: "/api/products",
    customers: "/api/customers",
    vendors: "/api/vendors",
    shipments: "/api/shipments",
  }[entity];
}

function entityLabel(entity) {
  return {
    orders: "deal",
    products: "sản phẩm",
    customers: "khách hàng",
    vendors: "nhà cung cấp",
    shipments: "vận đơn",
  }[entity] || "bản ghi";
}

function bulkEditFields(entity) {
  if (entity === "orders") {
    return `
      <div class="field"><label>Trạng thái</label><select name="status">${optionTags(state.data.meta.order_statuses, "", "Giữ nguyên")}</select></div>
      <div class="field"><label>Thanh toán</label><select name="payment_status">${optionTags(state.data.meta.payment_statuses, "", "Giữ nguyên")}</select></div>
      <div class="field"><label>Người phụ trách</label><input name="assignee" placeholder="Bỏ trống để giữ nguyên"></div>
      <div class="field"><label>Due date</label><input name="due_date" class="date-text" inputmode="numeric" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="dd/mm/yyyy"></div>
      <div class="field full"><label>Ghi chú nội bộ</label><textarea name="note" placeholder="Bỏ trống để giữ nguyên"></textarea></div>
    `;
  }
  if (entity === "customers") {
    return `
      <div class="field"><label>Kênh</label><select name="channel">${optionTags(state.data.meta.channels, "", "Giữ nguyên")}</select></div>
      <div class="field full"><label>Ghi chú</label><textarea name="note" placeholder="Bỏ trống để giữ nguyên"></textarea></div>
    `;
  }
  if (entity === "products") {
    return `
      <div class="field"><label>Trạng thái</label><select name="status"><option value="">Giữ nguyên</option><option value="active">Đang bán</option><option value="inactive">Ngừng bán</option></select></div>
      <div class="field"><label>Loại sản phẩm</label><select name="type">${optionTags(state.data.meta.product_types, "", "Giữ nguyên")}</select></div>
      <div class="field full"><label>Chất liệu</label><select name="material_id">${materialCatalogOptions("").replace("Chọn chất liệu", "Giữ nguyên")}</select></div>
    `;
  }
  if (entity === "vendors") {
    return `
      <div class="field"><label>Loại</label><select name="type">${optionTags(["Đá quý", "Vàng-bạc", "Gia công", "Mạ", "Khác"], "", "Giữ nguyên")}</select></div>
      <div class="field full"><label>Ghi chú</label><textarea name="note" placeholder="Bỏ trống để giữ nguyên"></textarea></div>
    `;
  }
  if (entity === "shipments") {
    return `
      <div class="field"><label>Trạng thái</label><select name="status">${optionTags(SHIPMENT_STATUSES, "", "Giữ nguyên")}</select></div>
      <div class="field"><label>Dự kiến giao</label><input name="expected_delivery" class="date-text" inputmode="numeric" pattern="\\d{1,2}/\\d{1,2}/\\d{4}" placeholder="dd/mm/yyyy"></div>
      <div class="field full"><label>Nhãn trạng thái</label><input name="status_label" placeholder="Bỏ trống để dùng nhãn tự động"></div>
    `;
  }
  return "";
}

function openBulkEditor(entity) {
  const ids = selectedIds(entity);
  if (!ids.length) return toast("Chưa chọn dòng nào");
  modalHost.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Sửa hàng loạt">
        <div class="modal-header">
          <div><h2>Sửa hàng loạt</h2><p class="muted small">${fmtNumber(ids.length)} ${entityLabel(entity)} đã chọn</p></div>
          <button class="ghost" data-action="close-modal" aria-label="Đóng" title="Đóng"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <form id="bulkEditForm" class="form-grid">
            <input type="hidden" name="entity" value="${esc(entity)}">
            ${bulkEditFields(entity)}
          </form>
          <p class="small muted">Chỉ các trường có nhập/chọn giá trị mới được cập nhật.</p>
        </div>
        <div class="modal-footer">
          <button class="button" data-action="close-modal">Hủy</button>
          <button class="primary" data-action="save-bulk-edit"><i data-lucide="save"></i><span>Lưu hàng loạt</span></button>
        </div>
      </section>
    </div>
  `;
  refreshIcons();
}

async function saveBulkEditFromForm() {
  const form = document.querySelector("#bulkEditForm");
  if (!form?.reportValidity()) return;
  const data = new FormData(form);
  const entity = data.get("entity");
  const ids = selectedIds(entity);
  const body = {};
  for (const [key, value] of data.entries()) {
    if (key === "entity" || value === "") continue;
    body[key] = ["due_date", "expected_delivery"].includes(key) ? parseViDate(value) : value;
  }
  if (!Object.keys(body).length) return toast("Chưa có trường nào để cập nhật");
  const basePath = entityBasePath(entity);
  await Promise.all(ids.map((id) => api(`${basePath}/${id}`, { method: "PATCH", body })));
  clearSelection(entity);
  closeModal();
  await loadData();
  toast(`Đã cập nhật ${fmtNumber(ids.length)} ${entityLabel(entity)}`);
  render();
}

async function bulkDelete(entity) {
  const ids = selectedIds(entity);
  if (!ids.length) return toast("Chưa chọn dòng nào");
  const extra = entity === "customers" ? " Khách bị xóa sẽ xóa kèm toàn bộ deal/payment/vận đơn liên quan." : entity === "orders" ? " Deal bị xóa sẽ xóa kèm payment/source line/vận đơn liên quan." : "";
  if (!window.confirm(`Xóa ${fmtNumber(ids.length)} ${entityLabel(entity)} đã chọn?${extra}`)) return;
  const basePath = entityBasePath(entity);
  await Promise.all(ids.map((id) => api(`${basePath}/${id}`, { method: "DELETE" })));
  clearSelection(entity);
  closeModal();
  await loadData();
  toast(`Đã xóa ${fmtNumber(ids.length)} ${entityLabel(entity)}`);
  render();
}

function bindShell() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  document.querySelector("#globalSearch").addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  document.querySelector("#periodFilter").addEventListener("change", (event) => {
    state.period = event.target.value;
    render();
  });

  document.querySelector("#roleFilter").addEventListener("change", (event) => {
    state.role = event.target.value;
    render();
  });

  document.querySelector("#newOrderBtn").addEventListener("click", openOrderForm);

  app.addEventListener("change", (event) => {
    if (event.target.id === "statusFilter") {
      state.statusFilter = event.target.value;
      render();
    }
    if (event.target.id === "quickFilter") {
      state.quickFilter = event.target.value;
      render();
    }
  });

  app.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    const target = event.target.closest("[data-action]");
    if (!target) return;
    event.preventDefault();
    target.click();
  });

  document.addEventListener("keydown", (event) => {
    const modal = modalHost.querySelector(".modal");
    if (!modal) return;
    if (event.key === "Escape") {
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((item) => !item.disabled && item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  app.addEventListener("submit", async (event) => {
    if (event.target.id === "expenseForm") {
      try {
        await submitExpense(event);
      } catch (error) {
        toast(error.message);
      }
    }
  });

  app.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".deal-card");
    if (!card) return;
    state.dragOrderId = card.dataset.orderId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.dragOrderId);
  });

  app.addEventListener("dragover", (event) => {
    const column = event.target.closest(".kanban-column");
    if (!column || !state.dragOrderId) return;
    event.preventDefault();
    column.classList.add("is-drop-target");
  });

  app.addEventListener("dragleave", (event) => {
    const column = event.target.closest(".kanban-column");
    if (column) column.classList.remove("is-drop-target");
  });

  app.addEventListener("dragend", () => {
    state.dragOrderId = null;
    document.querySelectorAll(".kanban-column.is-drop-target").forEach((column) => column.classList.remove("is-drop-target"));
  });

  app.addEventListener("drop", async (event) => {
    const column = event.target.closest(".kanban-column");
    if (!column || !state.dragOrderId) return;
    event.preventDefault();
    column.classList.remove("is-drop-target");
    const orderId = state.dragOrderId;
    state.dragOrderId = null;
    const nextStatus = column.dataset.statusId;
    const order = state.data.orders.find((item) => item.id === orderId);
    if (!order || order.status === nextStatus) return;
    if (!window.confirm(`Chuyển ${order.order_code} sang "${statusLabel(nextStatus)}"?`)) return;
    try {
      await api(`/api/orders/${orderId}`, { method: "PATCH", body: { status: nextStatus } });
      await loadData();
      toast(`Đã chuyển ${order.order_code} sang ${statusLabel(nextStatus)}`);
      render();
    } catch (error) {
      toast(error.message);
    }
  });

  modalHost.addEventListener("input", (event) => {
    const form = event.target.closest(".order-editor-form");
    if (form) refreshOrderPricing(form);
    if (event.target.closest(".metal-rule-row")) syncMetalRuleRow(event.target.closest(".metal-rule-row"));
  });

  modalHost.addEventListener("change", (event) => {
    const form = event.target.closest(".order-editor-form");
    if (form) {
      if (event.target.matches('[data-field="product_id"]')) syncProductRowFromCatalog(event.target.closest(".product-item-row"));
      refreshOrderPricing(form);
    }
    if (event.target.closest(".metal-rule-row")) syncMetalRuleRow(event.target.closest(".metal-rule-row"));
  });

  modalHost.addEventListener("submit", async (event) => {
    if (event.target.id === "paymentForm") {
      try {
        await submitPayment(event);
      } catch (error) {
        toast(error.message);
      }
    }
  });

  document.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    try {
      if (action === "close-modal") {
        if (actionTarget.classList.contains("modal-backdrop") && event.target !== actionTarget) return;
        closeModal();
      }
      if (action === "clear-search") {
        state.search = "";
        render();
        document.querySelector("#globalSearch")?.focus();
      }
      if (action === "toggle-select") {
        const entity = actionTarget.dataset.entity;
        const id = actionTarget.dataset.id;
        if (state.selected[entity]?.has(id)) state.selected[entity].delete(id);
        else state.selected[entity]?.add(id);
        render();
      }
      if (action === "toggle-select-all") {
        const entity = actionTarget.dataset.entity;
        const ids = (actionTarget.dataset.ids || "").split(",").filter(Boolean);
        const allSelected = ids.length > 0 && ids.every((id) => state.selected[entity]?.has(id));
        ids.forEach((id) => {
          if (allSelected) state.selected[entity]?.delete(id);
          else state.selected[entity]?.add(id);
        });
        render();
      }
      if (action === "clear-selection") {
        clearSelection(actionTarget.dataset.entity);
        render();
      }
      if (action === "bulk-edit") openBulkEditor(actionTarget.dataset.entity);
      if (action === "bulk-delete") await bulkDelete(actionTarget.dataset.entity);
      if (action === "new-order") openOrderForm();
      if (action === "add-order-item") addOrderItemRow();
      if (action === "set-product-mode") {
        const row = actionTarget.closest(".product-item-row");
        syncProductModeRow(row, actionTarget.dataset.mode);
        refreshOrderPricing(row?.closest(".order-editor-form"));
      }
      if (action === "remove-order-item") removeOrderItemRow(actionTarget);
      if (action === "add-source-line") addSourceLineRow();
      if (action === "remove-source-line") removeSourceLineRow(actionTarget);
      if (action === "apply-suggested-price") applySuggestedPrice();
      if (action === "save-order") await saveOrderFromForm();
      if (action === "edit-orders") openOrderEditor(actionTarget.dataset.id);
      if (action === "save-order-edit") await saveOrderEditFromForm();
      if (action === "delete-orders") await deleteOrder(actionTarget.dataset.id);
      if (action === "open-order") openOrderDetail(actionTarget.dataset.orderId);
      if (action === "edit-customers") openCustomerEditor(actionTarget.dataset.id);
      if (action === "save-customer-edit") await saveCustomerEditFromForm();
      if (action === "delete-customers") await deleteCustomer(actionTarget.dataset.id);
      if (action === "open-customer") openCustomerDetail(actionTarget.dataset.customerId);
      if (action === "switch-view") {
        state.view = actionTarget.dataset.view || "dashboard";
        if (actionTarget.dataset.filter === "receivable") state.quickFilter = "receivable";
        render();
      }
      if (action === "filter-status") {
        state.view = "orders";
        state.statusFilter = actionTarget.dataset.statusId;
        state.quickFilter = "all";
        state.orderView = "table";
        render();
      }
      if (action === "sort-orders") {
        const key = actionTarget.dataset.sortKey;
        state.orderSort = {
          key,
          dir: state.orderSort.key === key && state.orderSort.dir === "desc" ? "asc" : "desc",
        };
        render();
      }
      if (action === "set-order-view") {
        state.orderView = actionTarget.dataset.mode;
        render();
      }
      if (action === "create-shipment") await createShipment(actionTarget.dataset.orderId);
      if (action === "sync-shipment") await syncShipment(actionTarget.dataset.shipmentId);
      if (action === "update-order-status") await updateOrderStatus(actionTarget.dataset.orderId);
      if (action === "copy-reminder") await copyReminder(actionTarget.dataset.orderId);
      if (action === "focus-payment") {
        document.querySelector("#paymentForm input[name='amount']")?.focus();
      }
      if (action === "edit-payment") openPaymentEditor(actionTarget.dataset.paymentId);
      if (action === "save-payment-edit") await savePaymentEditFromForm();
      if (action === "delete-payment") await deletePayment(actionTarget.dataset.paymentId);
      if (action === "print-receipt") {
        toast("Đang mở trang in. Chọn Print để lưu PDF từ trình duyệt.");
        window.open(`/api/receipts/${actionTarget.dataset.orderId}?lang=${actionTarget.dataset.lang}`, "_blank", "noopener");
      }
      if (action === "edit-specs") openSpecsEditor(actionTarget.dataset.orderId);
      if (action === "save-specs") await saveSpecsFromForm();
      if (action === "edit-expense") openExpenseEditor(actionTarget.dataset.expenseId);
      if (action === "save-expense") await saveExpenseFromForm();
      if (action === "delete-expense") await deleteExpense(actionTarget.dataset.expenseId);
      if (action === "new-vendor") openVendorForm();
      if (action === "save-vendor") await saveVendorFromForm();
      if (action === "edit-vendors") openVendorEditor(actionTarget.dataset.id);
      if (action === "save-vendor-edit") await saveVendorEditFromForm();
      if (action === "delete-vendors") await deleteVendor(actionTarget.dataset.id);
      if (action === "new-material") openMaterialEditor();
      if (action === "edit-material") openMaterialEditor(actionTarget.dataset.materialId);
      if (action === "save-material") await saveMaterialFromForm();
      if (action === "delete-material") await deleteMaterial(actionTarget.dataset.materialId);
      if (action === "set-product-tab") {
        state.productTab = actionTarget.dataset.tab || "catalog";
        render();
      }
      if (action === "new-product") openProductEditor();
      if (action === "edit-product") openProductEditor(actionTarget.dataset.productId);
      if (action === "save-product") await saveProductFromForm();
      if (action === "delete-product") await deleteProduct(actionTarget.dataset.productId);
      if (action === "adjust-stock") openStockAdjustment(actionTarget.dataset.productId);
      if (action === "save-stock-adjustment") await saveStockAdjustment();
      if (action === "edit-shipments") openShipmentEditor(actionTarget.dataset.id);
      if (action === "save-shipment-edit") await saveShipmentEditFromForm();
      if (action === "delete-shipments") await deleteShipment(actionTarget.dataset.id);
      if (action === "save-bulk-edit") await saveBulkEditFromForm();
      if (action === "edit-metal-prices") openMetalPriceEditor();
      if (action === "save-metal-prices") await saveMetalPricesFromForm();
      if (action === "edit-revenue-targets") openRevenueTargetEditor();
      if (action === "add-goal-month") addGoalMonth();
      if (action === "delete-goal-month") deleteGoalMonth(actionTarget.dataset.month);
      if (action === "add-business-goal") addBusinessGoal();
      if (action === "delete-business-goal") deleteBusinessGoal(actionTarget.dataset.goalId);
      if (action === "save-revenue-targets") await saveRevenueTargetsFromForm();
      if (action === "refresh-market-prices") await refreshMarketPrices();
    } catch (error) {
      toast(error.message);
    }
  });
}

async function init() {
  bindShell();
  try {
    await loadData();
    render();
  } catch (error) {
    app.innerHTML = `<div class="empty">Không tải được dữ liệu: ${esc(error.message)}</div>`;
  }
}

init();
