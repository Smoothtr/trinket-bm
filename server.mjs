import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertOrderPatchAllowed,
  authenticateRequest,
  authorizeApiRequest,
} from "./lib/auth.mjs";
import {
  createAccountManager,
  createLocalAuthAdapter,
} from "./lib/account-admin.mjs";
import { getFirebaseServices } from "./lib/firebase-admin.mjs";
import { createStore } from "./lib/store.mjs";

const PORT = Number(process.env.PORT || 4173);
const SERVER_PATH = fileURLToPath(import.meta.url);
const ROOT = path.dirname(SERVER_PATH);
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const IS_VERCEL = process.env.VERCEL === "1";
const STORE_PATH = process.env.TRINKET_STORE_PATH || (IS_VERCEL ? path.join(os.tmpdir(), "trinket-store.json") : path.join(DATA_DIR, "store.json"));
const SEED_PATH = path.join(DATA_DIR, "seed.json");
const dataStore = createStore({ seedPath: SEED_PATH, storePath: STORE_PATH });

function serverAuthRequired() {
  if (process.env.AUTH_DISABLED === "1" && process.env.VERCEL !== "1") return false;
  return process.env.FIREBASE_AUTH_ENABLED === "1" || process.env.VERCEL === "1";
}

function serverFirebaseConfigStatus() {
  const enabled = serverAuthRequired();
  const config = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    appId: process.env.FIREBASE_WEB_APP_ID || "",
  };
  const missing = enabled
    ? Object.entries(config).filter(([, value]) => !value).map(([key]) => key)
    : [];
  const hasVercelOidc = Boolean(
    (process.env.VERCEL === "1" || process.env.VERCEL_OIDC_TOKEN)
      && process.env.GCP_PROJECT_NUMBER
      && process.env.GCP_SERVICE_ACCOUNT_EMAIL
      && process.env.GCP_WORKLOAD_IDENTITY_POOL_ID
      && process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
  );
  const hasAdminCredentials = Boolean(
    hasVercelOidc
      || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      || (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
      || process.env.GOOGLE_APPLICATION_CREDENTIALS
      || process.env.FIRESTORE_EMULATOR_HOST
      || (process.env.VERCEL !== "1" && process.env.FIREBASE_ADMIN_ACCESS_TOKEN),
  );
  if (enabled && !hasAdminCredentials) missing.push("adminCredentials");
  if (enabled && process.env.VERCEL === "1" && process.env.DATA_BACKEND !== "firestore") {
    missing.push("DATA_BACKEND=firestore");
  }
  return { enabled, config, missing };
}

const ORDER_STATUSES = [
  { id: "tu_van", label: "Mới / Tư vấn" },
  { id: "cho_coc", label: "Đã chốt / Chờ cọc" },
  { id: "dat_nguon", label: "Đã cọc / Đặt nguồn hàng" },
  { id: "san_xuat", label: "Đang sản xuất / Gia công" },
  { id: "cho_giao", label: "Hoàn thành SX / Chờ giao" },
  { id: "dang_giao", label: "Đang giao" },
  { id: "hoan_tat", label: "Đã giao / Hoàn tất" },
  { id: "huy_hoan", label: "Hủy / Hoàn" },
];

const PAYMENT_STATUSES = [
  { id: "chua_coc", label: "Chưa cọc" },
  { id: "da_coc", label: "Đã cọc" },
  { id: "du_tien", label: "Đã thanh toán đủ" },
];

const CHANNELS = ["Instagram", "Facebook", "TikTok", "Giới thiệu", "Website", "Khác"];
const PRODUCT_TYPES = ["Ring", "Bracelet", "Necklace", "Earrings", "Charm", "Other"];
const MARKET_PRICE_TTL_MS = 30 * 60 * 1000;
const GOLD_PRICE_URL = "https://giavang.now/api/prices";
const SILVER_PRICE_URL = "https://giabac.phuquygroup.vn/PhuQuyPrice/SilverPricePartial";
const GOLD_KARAT_RATES = [
  { code: "10K", label: "Vàng 10K", purity: 0.417 },
  { code: "14K", label: "Vàng 14K", purity: 0.585 },
  { code: "18K", label: "Vàng 18K", purity: 0.75 },
  { code: "24K", label: "Vàng 24K / 9999", purity: 0.9999 },
];
const EXPENSE_CATEGORIES = ["Marketing", "Vận hành", "Lương", "Thiết bị", "Vận chuyển", "Khác"];
const INVENTORY_RESERVE_STATUSES = new Set(["dat_nguon", "san_xuat", "cho_giao", "dang_giao"]);
const DEFAULT_GOAL_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const DEFAULT_MATERIAL_CATALOG = [
  { id: "mat_gold_10k", name: "Vàng 10K", group: "Vàng", market_key: "gold:10K", default_unit: "chi", default_price: 0, note: "" },
  { id: "mat_gold_14k", name: "Vàng 14K", group: "Vàng", market_key: "gold:14K", default_unit: "chi", default_price: 0, note: "" },
  { id: "mat_gold_18k", name: "Vàng 18K", group: "Vàng", market_key: "gold:18K", default_unit: "chi", default_price: 0, note: "" },
  { id: "mat_gold_24k", name: "Vàng 24K", group: "Vàng", market_key: "gold:24K", default_unit: "chi", default_price: 0, note: "" },
  { id: "mat_silver_925", name: "Bạc 925", group: "Bạc", market_key: "silver:925", default_unit: "g", default_price: 0, note: "" },
  { id: "mat_silver_999", name: "Bạc 999", group: "Bạc", market_key: "silver:999", default_unit: "g", default_price: 0, note: "" },
];

const VTP_STATUS_MAP = {
  pending_pickup: { label: "Đang giao - Chờ lấy hàng", orderStatus: "dang_giao" },
  picked_up: { label: "Đang giao - Đã lấy hàng", orderStatus: "dang_giao" },
  in_transit: { label: "Đang giao - Vận chuyển", orderStatus: "dang_giao" },
  delivering: { label: "Đang giao - Đang phát", orderStatus: "dang_giao" },
  delivered: { label: "Đã giao / Hoàn tất", orderStatus: "hoan_tat" },
  failed: { label: "Hoàn", orderStatus: "huy_hoan" },
  cancelled: { label: "Hủy", orderStatus: "huy_hoan" },
};

const TRACKING_FLOW = ["pending_pickup", "picked_up", "in_transit", "delivering", "delivered"];

async function readStore(actor = null) {
  const data = normalizeData(await dataStore.read());
  Object.defineProperty(data, "__actor", { value: actor, writable: true, configurable: true, enumerable: false });
  return data;
}

async function writeStore(data, actor = null) {
  return dataStore.write(data, actor);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function html(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function text(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function money(value) {
  return Number(value || 0);
}

const ORDER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ORDER_IMAGE_SIZE = 5 * 1024 * 1024;

function validClientId(value, prefix) {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,80}$`).test(String(value || ""));
}

function normalizeOrderItemImage(image, orderId, itemId) {
  if (!image || typeof image !== "object") return null;
  const storagePath = String(image.storage_path || "").trim();
  const contentType = String(image.content_type || "").toLowerCase();
  const size = Math.max(0, Number(image.size || 0));
  const expectedPrefix = `deal-items/${orderId}/${itemId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..")) return null;
  if (!ORDER_IMAGE_TYPES.has(contentType) || !Number.isFinite(size) || size <= 0 || size > MAX_ORDER_IMAGE_SIZE) return null;
  return {
    storage_path: storagePath,
    original_name: String(image.original_name || "image").slice(0, 255),
    content_type: contentType,
    size,
    uploaded_at: image.uploaded_at || new Date().toISOString(),
  };
}

function normalizeCatalogProductImage(image, productId) {
  if (!image || typeof image !== "object") return null;
  const storagePath = String(image.storage_path || "").trim();
  const contentType = String(image.content_type || "").toLowerCase();
  const size = Math.max(0, Number(image.size || 0));
  const expectedPrefix = `product-images/${productId}/`;
  const fileName = storagePath.slice(expectedPrefix.length);
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes("..") || !fileName || fileName.includes("/")) return null;
  if (!ORDER_IMAGE_TYPES.has(contentType) || !Number.isFinite(size) || size <= 0 || size > MAX_ORDER_IMAGE_SIZE) return null;
  return {
    storage_path: storagePath,
    original_name: String(image.original_name || "image").slice(0, 255),
    content_type: contentType,
    size,
    uploaded_at: image.uploaded_at || new Date().toISOString(),
  };
}

function prepareIncomingOrderItems(items, orderId) {
  const seen = new Set();
  return items.map((item) => {
    const itemId = item.id || id("itm");
    if (!validClientId(itemId, "itm")) throw new Error("Invalid product item ID");
    if (seen.has(itemId)) throw new Error("Duplicate product item ID");
    seen.add(itemId);
    if (item.image && !normalizeOrderItemImage(item.image, orderId, itemId)) {
      throw new Error("Invalid product image metadata");
    }
    return { ...item, id: itemId };
  });
}

function normalizeProduct(product, index = 0) {
  const fallbackId = `prd_${String(index + 1).padStart(3, "0")}`;
  const productId = product?.id || fallbackId;
  return {
    ...product,
    id: productId,
    sku: product?.sku || String(productId).replace(/^prd_/, "").replace(/_/g, "-").toUpperCase(),
    type: product?.type || "Other",
    name: product?.name || "Mẫu chưa đặt tên",
    default_price: money(product?.default_price),
    default_cost: money(product?.default_cost),
    material_id: product?.material_id || "",
    default_size: product?.default_size || "",
    default_stone: product?.default_stone || "",
    status: product?.status === "inactive" ? "inactive" : "active",
    track_inventory: Boolean(product?.track_inventory),
    low_stock_threshold: Math.max(0, Number(product?.low_stock_threshold || 0)),
    note: product?.note || "",
    image: normalizeCatalogProductImage(product?.image, productId),
  };
}

function normalizeMaterial(material, index = 0) {
  const unit = ["g", "chi"].includes(material?.default_unit) ? material.default_unit : "g";
  return {
    id: material?.id || `mat_${String(index + 1).padStart(3, "0")}`,
    name: String(material?.name || "Chất liệu chưa đặt tên").trim(),
    group: String(material?.group || "Khác").trim(),
    market_key: String(material?.market_key || "").trim(),
    default_unit: unit,
    default_price: Math.max(0, money(material?.default_price)),
    note: String(material?.note || "").trim(),
  };
}

function normalizeMetalRule(rule) {
  const mode = ["market", "percent", "add", "manual"].includes(rule?.mode) ? rule.mode : "market";
  return { mode, value: Number(rule?.value || 0) };
}

function normalizeBusinessGoal(goal, index = 0) {
  const metrics = ["revenue", "profit", "orders", "aov"];
  const targets = Object.fromEntries(
    Object.entries(goal?.targets || {})
      .filter(([month]) => /^\d{4}-\d{2}$/.test(month))
      .map(([month, value]) => [month, Math.max(0, money(value))]),
  );
  return {
    id: goal?.id || `goal_${String(index + 1).padStart(2, "0")}`,
    name: String(goal?.name || `Mục tiêu ${index + 1}`).trim(),
    metric: metrics.includes(goal?.metric) ? goal.metric : "revenue",
    color: String(goal?.color || chartColor(index)).trim(),
    targets,
  };
}

function chartColor(index) {
  return ["#7c2638", "#2f6c62", "#b07b28", "#5b4c8f", "#3f7b53", "#b23a48"][index % 6];
}

function numericWeight(value) {
  if (typeof value === "number") return Math.max(0, value);
  const match = String(value || "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Math.max(0, Number(match[0])) : 0;
}

function normalizeOrderItems(order, data) {
  const catalog = data.products || [];
  const materials = data.settings?.material_catalog || [];
  const legacyProduct = catalog.find((product) => product.id === order.product_id || product.name === order.product_name);
  const rawItems = Array.isArray(order.items) && order.items.length
    ? order.items
    : [
        {
          id: `itm_${order.id || "legacy"}_1`,
          product_id: legacyProduct?.id || order.product_id || "",
          product_type: order.product_type || legacyProduct?.type || "Other",
          product_name: order.product_name || legacyProduct?.name || "Sản phẩm",
          note: order.request || "",
          quantity: 1,
          unit_price: money(order.price),
          size: order.size || "",
          specs: {
            material: order.product_specs?.material || "",
            stone: order.product_specs?.stone || "",
            weight: order.product_specs?.weight || "",
          },
        },
      ];

  return rawItems.map((item, index) => {
    const itemId = item.id || `itm_${order.id || "new"}_${index + 1}`;
    const product = catalog.find((entry) => entry.id === item.product_id);
    const material = materials.find((entry) => entry.id === item.material_id)
      || materials.find((entry) => entry.name === item.specs?.material);
    const rawMetalPricing = item.metal_pricing || {};
    const metalMode = ["none", "profile", "manual"].includes(rawMetalPricing.mode) ? rawMetalPricing.mode : "none";
    const metalUnit = ["g", "chi"].includes(rawMetalPricing.unit) ? rawMetalPricing.unit : material?.default_unit || "g";
    const quantity = Math.max(1, Number(item.quantity || 1));
    const metalWeight = numericWeight(rawMetalPricing.weight);
    const metalUnitPrice = Math.max(0, money(rawMetalPricing.unit_price));
    const materialCost = metalMode === "none" ? 0 : Math.round(metalUnitPrice * metalWeight * quantity);
    const productMode = item.product_mode === "custom" || (!item.product_id && item.product_mode !== "catalog") ? "custom" : "catalog";
    return {
      id: itemId,
      product_id: item.product_id || "",
      product_mode: productMode,
      product_sku: item.product_sku || product?.sku || "",
      product_type: item.product_type || product?.type || "Other",
      product_name: item.product_name || product?.name || "Sản phẩm",
      note: item.note || "",
      quantity,
      unit_price: money(item.unit_price),
      unit_cost: Math.max(0, money(item.unit_cost)),
      size: item.size || "",
      material_id: material?.id || item.material_id || "",
      metal_pricing: {
        mode: metalMode,
        unit: metalUnit,
        weight: metalWeight,
        unit_price: metalUnitPrice,
        material_cost: materialCost,
      },
      image: normalizeOrderItemImage(item.image, order.id, itemId),
      specs: {
        material: item.specs?.material || material?.name || "",
        stone: item.specs?.stone || "",
        weight: item.specs?.weight || (metalWeight ? `${metalWeight} ${metalUnit === "chi" ? "chỉ" : "g"}` : ""),
      },
    };
  });
}

function normalizeData(data) {
  data.products = (data.products || []).map(normalizeProduct);
  data.inventory_movements = (data.inventory_movements || []).map((movement, index) => ({
    id: movement.id || `mov_${String(index + 1).padStart(4, "0")}`,
    product_id: movement.product_id || "",
    quantity: Number(movement.quantity || 0),
    type: movement.type || "adjustment",
    reason: movement.reason || "Điều chỉnh tồn kho",
    source_type: movement.source_type || "manual",
    source_id: movement.source_id || "",
    created_at: movement.created_at || new Date().toISOString(),
    created_by: movement.created_by || "Admin / Chủ",
  }));
  data.orders = data.orders || [];
  data.order_sourcing_lines = data.order_sourcing_lines || [];
  data.payments = data.payments || [];
  data.shipments = data.shipments || [];
  data.expenses = data.expenses || [];
  data.users = data.users || [];
  data.audit_logs = data.audit_logs || [];
  data.settings = {
    default_monthly_revenue_target: 12_500_000,
    monthly_revenue_targets: {},
    metal_price_overrides: {},
    metal_price_rules: {},
    ...(data.settings || {}),
  };
  data.settings.monthly_revenue_targets = data.settings.monthly_revenue_targets || {};
  data.settings.metal_price_overrides = data.settings.metal_price_overrides || {};
  const legacyTarget = Math.max(0, money(data.settings.default_monthly_revenue_target));
  const legacyMonthlyTargets = data.settings.monthly_revenue_targets || {};
  const defaultGoal = {
    id: "goal_revenue",
    name: "Doanh thu",
    metric: "revenue",
    color: "#7c2638",
    targets: Object.fromEntries(DEFAULT_GOAL_MONTHS.map((month) => [month, Math.max(0, money(legacyMonthlyTargets[month] ?? legacyTarget))])),
  };
  data.settings.business_goals = (Array.isArray(data.settings.business_goals) && data.settings.business_goals.length
    ? data.settings.business_goals
    : [defaultGoal]).map(normalizeBusinessGoal);
  const goalMonths = new Set(Array.isArray(data.settings.goal_months) ? data.settings.goal_months : DEFAULT_GOAL_MONTHS);
  data.settings.business_goals.forEach((goal) => Object.keys(goal.targets).forEach((month) => goalMonths.add(month)));
  data.settings.goal_months = [...goalMonths].filter((month) => /^\d{4}-\d{2}$/.test(month)).sort();
  const legacyRules = Object.fromEntries(
    Object.entries(data.settings.metal_price_overrides).map(([key, value]) => [key, { mode: "manual", value: money(value) }]),
  );
  data.settings.metal_price_rules = Object.fromEntries(
    Object.entries({ ...legacyRules, ...(data.settings.metal_price_rules || {}) }).map(([key, rule]) => [String(key), normalizeMetalRule(rule)]),
  );
  data.settings.material_catalog = (Array.isArray(data.settings.material_catalog)
    ? data.settings.material_catalog
    : DEFAULT_MATERIAL_CATALOG).map(normalizeMaterial);
  data.orders.forEach((order) => {
    order.items = normalizeOrderItems(order, data);
    order.pricing = {
      ...(order.pricing || {}),
      profit_rate: Number(order.pricing?.profit_rate || 0),
      tax_rate: Number(order.pricing?.tax_rate || 0),
    };
  });
  return data;
}

function groupedOrderProductQuantities(order) {
  return normalizeOrderItems(order, { products: [], settings: { material_catalog: [] } })
    .filter((item) => item.product_mode === "catalog" && item.product_id)
    .reduce((result, item) => {
      result[item.product_id] = (result[item.product_id] || 0) + Number(item.quantity || 0);
      return result;
    }, {});
}

function inventoryBalance(productId, data, { excludeOrderId = "" } = {}) {
  const onHand = (data.inventory_movements || [])
    .filter((movement) => movement.product_id === productId && (!excludeOrderId || movement.source_id !== excludeOrderId))
    .reduce((total, movement) => total + Number(movement.quantity || 0), 0);
  const reserved = (data.orders || [])
    .filter((order) => order.id !== excludeOrderId && INVENTORY_RESERVE_STATUSES.has(order.status))
    .reduce((total, order) => total + Number(groupedOrderProductQuantities(order)[productId] || 0), 0);
  return { on_hand: onHand, reserved, available: onHand - reserved };
}

function decorateProduct(product, data) {
  const balance = inventoryBalance(product.id, data);
  const orderCount = (data.orders || []).filter((order) => (order.items || []).some((item) => item.product_id === product.id)).length;
  return {
    ...product,
    ...balance,
    order_count: orderCount,
    stock_state: !product.track_inventory ? "not_tracked" : balance.available <= 0 ? "out" : balance.available <= product.low_stock_threshold ? "low" : "ok",
  };
}

function validateOrderInventory(order, data) {
  if (![...INVENTORY_RESERVE_STATUSES, "hoan_tat"].includes(order.status)) return;
  const quantities = groupedOrderProductQuantities(order);
  Object.entries(quantities).forEach(([productId, quantity]) => {
    const product = findById(data.products, productId);
    if (!product?.track_inventory) return;
    const balance = inventoryBalance(productId, data, { excludeOrderId: order.id });
    if (quantity > balance.available) {
      throw new Error(`${product.name} chỉ còn ${balance.available} sản phẩm khả dụng`);
    }
  });
}

function syncOrderInventoryMovements(order, data, { applyCompleted = true } = {}) {
  data.inventory_movements = (data.inventory_movements || []).filter(
    (movement) => !(movement.source_type === "order" && movement.source_id === order.id),
  );
  if (order.status !== "hoan_tat" || !applyCompleted) return;
  Object.entries(groupedOrderProductQuantities(order)).forEach(([productId, quantity]) => {
    const product = findById(data.products, productId);
    if (!product?.track_inventory || quantity <= 0) return;
    data.inventory_movements.unshift({
      id: id("mov"),
      product_id: productId,
      quantity: -quantity,
      type: "sale",
      reason: `Xuất bán ${order.order_code}`,
      source_type: "order",
      source_id: order.id,
      created_at: new Date().toISOString(),
      created_by: "Hệ thống",
    });
  });
}

function removeOrderCascade(data, orderId) {
  const index = data.orders.findIndex((order) => order.id === orderId);
  if (index === -1) return null;
  const [order] = data.orders.splice(index, 1);
  data.payments = (data.payments || []).filter((payment) => payment.order_id !== orderId);
  data.order_sourcing_lines = (data.order_sourcing_lines || []).filter((line) => line.order_id !== orderId);
  data.shipments = (data.shipments || []).filter((shipment) => shipment.order_id !== orderId && shipment.id !== order.shipment_id);
  data.inventory_movements = (data.inventory_movements || []).filter((movement) => movement.source_id !== orderId);
  return order;
}

function syncOrderPaymentStatus(order, data) {
  if (!order) return;
  const decorated = decorateOrder(order, data);
  order.payment_status = decorated.balance_due <= 0 ? "du_tien" : decorated.paid_amount > 0 ? "da_coc" : "chua_coc";
  const latestPayment = (data.payments || [])
    .filter((payment) => payment.order_id === order.id)
    .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))[0];
  order.payment_date = latestPayment?.paid_at ? String(latestPayment.paid_at).slice(0, 10) : "";
  order.updated_at = new Date().toISOString();
}

function roundTo(value, step = 1000) {
  return Math.round(Number(value || 0) / step) * step;
}

function parseNumber(value) {
  return Number(String(value || "").replace(/[^\d.-]/g, "")) || 0;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "TrinketBusinessManager/0.1 (+price-cache)",
        Accept: options.accept || "*/*",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackMarketPrices(data, errors = []) {
  const goldFallbacks = (data.gold_prices || []).map((item) => ({
    code: String(item.karat || "").toUpperCase(),
    label: `Vàng ${String(item.karat || "").toUpperCase()}`,
    purity: GOLD_KARAT_RATES.find((rate) => rate.code.toLowerCase() === String(item.karat || "").toLowerCase())?.purity || null,
    buy: money(item.cost),
    sell: money(item.price),
    unit: "VND/chỉ",
    source: "Static fallback",
  }));
  return {
    status: "fallback",
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt: data.market_price_cache?.payload?.sourceUpdatedAt || null,
    sourceLabel: "Last known/static",
    cacheTtlMinutes: MARKET_PRICE_TTL_MS / 60000,
    errors,
    gold: {
      source: "Static fallback",
      unit: "VND/chỉ",
      references: [],
      karats: goldFallbacks,
    },
    silver: {
      source: "Static fallback",
      unit: "VND/lượng",
      references: [
        { code: "SILVER_999", label: "Bạc 999", buy: 2164000, sell: 2655000, changeBuy: 0, changeSell: 0, unit: "VND/lượng" },
      ],
      purities: [
        { code: "999", label: "Bạc 999", purity: 0.999, buy: 2164000, sell: 2655000, unit: "VND/lượng", source: "Static fallback" },
        { code: "925", label: "Bạc 925", purity: 0.925, buy: roundTo(2164000 * 0.925), sell: roundTo(2655000 * 0.925), unit: "VND/lượng", source: "Static fallback" },
      ],
    },
  };
}

function applyMetalPriceOverrides(payload, data) {
  const rules = data.settings?.metal_price_rules || {};
  const result = JSON.parse(JSON.stringify(payload));
  let applied = 0;
  [
    ["gold", result.gold?.karats || []],
    ["silver", result.silver?.purities || []],
  ].forEach(([group, rows]) => {
    rows.forEach((row) => {
      const key = `${group}:${String(row.code || "").toUpperCase()}`;
      const marketSell = money(row.market_sell || row.sell);
      const rule = normalizeMetalRule(rules[key]);
      let effectiveSell = marketSell;
      if (rule.mode === "percent") effectiveSell = roundTo(marketSell * (1 + rule.value / 100));
      if (rule.mode === "add") effectiveSell = Math.max(0, marketSell + rule.value);
      if (rule.mode === "manual") effectiveSell = Math.max(0, rule.value);
      row.market_sell = marketSell;
      row.sell = effectiveSell;
      row.price_rule = rule;
      row.adjusted = rule.mode !== "market";
      row.manual = rule.mode === "manual";
      if (row.adjusted) {
        row.source = "Cấu hình giá nội bộ";
        row.basis = {
          percent: `Thị trường ${rule.value >= 0 ? "+" : ""}${rule.value}%`,
          add: `Thị trường ${rule.value >= 0 ? "+" : ""}${fmtRuleMoney(rule.value)}`,
          manual: "Giá cố định nội bộ",
        }[rule.mode];
        applied += 1;
      }
    });
  });
  result.hasManualOverrides = applied > 0;
  result.manualOverrideCount = applied;
  result.adjustedPriceCount = applied;
  return result;
}

function fmtRuleMoney(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("vi-VN")} đ`;
}

function normalizeGoldPrices(payload) {
  const prices = payload?.prices || {};
  const references = [
    ["SJL1L10", "SJC 9999"],
    ["SJ9999", "SJC Ring 9999"],
    ["BT9999NTT", "Bao Tin 9999"],
    ["PQHN24NTT", "PNJ 24K"],
    ["DOHNL", "DOJI Hà Nội"],
    ["DOHCML", "DOJI HCM"],
  ]
    .map(([code, label]) => {
      const item = prices[code];
      if (!item) return null;
      return {
        code,
        label: item.name || label,
        buy: money(item.buy),
        sell: money(item.sell),
        changeBuy: money(item.change_buy),
        changeSell: money(item.change_sell),
        currency: item.currency || "VND",
        unit: code === "XAUUSD" ? "USD/oz" : "VND/lượng",
      };
    })
    .filter(Boolean);

  const basis = prices.SJ9999 || prices.SJL1L10 || references[0] || {};
  const basisBuy = money(basis.buy);
  const basisSell = money(basis.sell || basis.buy);
  const karats = GOLD_KARAT_RATES.map((rate) => ({
    ...rate,
    buy: roundTo((basisBuy / 10) * rate.purity),
    sell: roundTo((basisSell / 10) * rate.purity),
    unit: "VND/chỉ",
    source: basis.name || "SJC Ring",
    basis: "Giá 9999 / 10 x tuổi vàng",
  }));

  return {
    source: "giavang.now",
    unit: "VND/lượng",
    references,
    karats,
    sourceUpdatedAt: [payload?.time, payload?.date].filter(Boolean).join(" "),
  };
}

function parseSilverRows(htmlText) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(htmlText || ""))) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&#218;/g, "Ú")
        .replace(/&#221;/g, "Ý")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (cells.length < 4) continue;
    const [label, unit, buyRaw, sellRaw] = cells;
    const buy = parseNumber(buyRaw);
    const sell = parseNumber(sellRaw);
    if (!label || !buy) continue;
    rows.push({
      code: label.toUpperCase().includes("999") ? "SILVER_999" : "SILVER_OTHER",
      label,
      buy,
      sell,
      changeBuy: 0,
      changeSell: 0,
      unit: unit || "VND/lượng",
    });
  }
  return rows;
}

function normalizeSilverPrices(htmlText) {
  const references = parseSilverRows(htmlText);
  const main = references.find((row) => row.label.toUpperCase().includes("999 1 L")) || references.find((row) => row.code === "SILVER_999") || references[0];
  if (!main) throw new Error("Không đọc được bảng giá bạc Phú Quý");
  const purities = [
    { code: "999", label: "Bạc 999", purity: 0.999, buy: main.buy, sell: main.sell || 0, unit: main.unit, source: "Phú Quý" },
    { code: "925", label: "Bạc 925", purity: 0.925, buy: roundTo(main.buy * 0.925), sell: roundTo((main.sell || main.buy) * 0.925), unit: main.unit, source: "Phú Quý", basis: "Bạc 999 x 92.5%" },
  ];
  return {
    source: "Phú Quý",
    unit: main.unit,
    references,
    purities,
  };
}

async function fetchMarketPrices(data) {
  const errors = [];
  const [goldResult, silverResult] = await Promise.allSettled([
    fetchWithTimeout(GOLD_PRICE_URL, { accept: "application/json", timeoutMs: 8000 }).then((res) => res.json()),
    fetchWithTimeout(SILVER_PRICE_URL, { accept: "text/html", timeoutMs: 8000 }).then((res) => res.text()),
  ]);

  let gold = null;
  let silver = null;
  let sourceUpdatedAt = null;
  if (goldResult.status === "fulfilled") {
    try {
      gold = normalizeGoldPrices(goldResult.value);
      sourceUpdatedAt = gold.sourceUpdatedAt;
    } catch (error) {
      errors.push(`Gold parse: ${error.message}`);
    }
  } else {
    errors.push(`Gold fetch: ${goldResult.reason?.message || goldResult.reason}`);
  }

  if (silverResult.status === "fulfilled") {
    try {
      silver = normalizeSilverPrices(silverResult.value);
    } catch (error) {
      errors.push(`Silver parse: ${error.message}`);
    }
  } else {
    errors.push(`Silver fetch: ${silverResult.reason?.message || silverResult.reason}`);
  }

  const fallback = data.market_price_cache?.payload || fallbackMarketPrices(data, errors);
  const payload = {
    ...fallback,
    status: errors.length ? (gold || silver ? "partial" : "fallback") : "live",
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt,
    sourceLabel: [gold?.source, silver?.source].filter(Boolean).join(" + ") || fallback.sourceLabel,
    cacheTtlMinutes: MARKET_PRICE_TTL_MS / 60000,
    errors,
    gold: gold || fallback.gold,
    silver: silver || fallback.silver,
  };
  return payload;
}

async function getMarketPrices(data, { force = false } = {}) {
  const cache = data.market_price_cache?.payload;
  const fetchedAt = cache?.fetchedAt ? new Date(cache.fetchedAt).getTime() : 0;
  const fresh = cache && Date.now() - fetchedAt < MARKET_PRICE_TTL_MS;
  if (!force && fresh) {
    return {
      payload: applyMetalPriceOverrides({
        ...cache,
        status: cache.status === "live" ? "cached" : cache.status,
        cacheAgeMinutes: Math.max(0, Math.round((Date.now() - fetchedAt) / 60000)),
      }, data),
      changed: false,
    };
  }

  const payload = await fetchMarketPrices(data);
  data.market_price_cache = {
    fetched_at: new Date().toISOString(),
    payload,
  };
  data.market_price_snapshots = [
    { id: id("mps"), fetched_at: data.market_price_cache.fetched_at, status: payload.status, payload },
    ...(data.market_price_snapshots || []),
  ].slice(0, 120);
  return { payload: applyMetalPriceOverrides(payload, data), changed: true };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function orderSequence(data) {
  return data.orders.reduce((max, order) => {
    const match = String(order.order_code || "").match(/(\d+)$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0) + 1;
}

function makeOrderCode(data) {
  const year = new Date().getFullYear();
  return `TRK-${year}-${String(orderSequence(data)).padStart(4, "0")}`;
}

function audit(data, action, entity, entityId, changes, user = null) {
  const actor = user || data.__actor;
  data.audit_logs.unshift({
    id: id("log"),
    action,
    entity,
    entity_id: entityId,
    user: actor?.email || actor?.name || actor || "system",
    user_uid: actor?.uid || "",
    user_role: actor?.role || "",
    changes,
    created_at: new Date().toISOString(),
  });
  data.audit_logs = data.audit_logs.slice(0, 500);
}

function findById(list, entityId) {
  return list.find((item) => item.id === entityId);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function customerSpend(customerId, data) {
  return data.orders
    .filter((order) => order.customer_id === customerId && order.status !== "huy_hoan")
    .reduce((sum, order) => sum + money(order.price), 0);
}

function decorateCustomer(customer, data) {
  const orders = data.orders.filter((order) => order.customer_id === customer.id);
  const totalSpend = customerSpend(customer.id, data);
  const lastOrder = orders
    .map((order) => order.date_order)
    .filter(Boolean)
    .sort()
    .pop();
  return {
    ...customer,
    order_count: orders.length,
    total_spend: totalSpend,
    last_order_at: lastOrder || null,
    segment: totalSpend >= 20000000 ? "VIP" : orders.length > 1 ? "Quay lại" : "Mới",
  };
}

function decorateOrder(order, data) {
  const sourceLines = data.order_sourcing_lines.filter((line) => line.order_id === order.id);
  const payments = data.payments.filter((payment) => payment.order_id === order.id);
  const shipment = data.shipments.find((item) => item.id === order.shipment_id || item.order_id === order.id) || null;
  const customer = findById(data.customers, order.customer_id) || null;
  const items = normalizeOrderItems(order, data);
  const itemCost = items.reduce((sum, item) => sum + money(item.unit_cost) * Number(item.quantity || 1), 0);
  const sourceCost = sourceLines.reduce((sum, line) => sum + money(line.cost), 0);
  const materialCost = items.reduce((sum, item) => sum + money(item.metal_pricing?.material_cost), 0);
  const shippingCost = money(order.shipping_cost || (shipment && shipment.fee));
  const totalCost = itemCost + sourceCost + materialCost + shippingCost;
  const itemSubtotal = items.reduce((sum, item) => sum + money(item.unit_price) * Number(item.quantity || 1), 0);
  const profitRate = Number(order.pricing?.profit_rate || 0);
  const taxRate = Number(order.pricing?.tax_rate || 0);
  const pricingProfit = roundTo(totalCost * (profitRate / 100));
  const priceBeforeTax = totalCost + pricingProfit;
  const pricingTax = roundTo(priceBeforeTax * (taxRate / 100));
  const suggestedPrice = totalCost > 0 ? priceBeforeTax + pricingTax : itemSubtotal;
  const paidAmount = payments.reduce((sum, payment) => {
    return sum + (payment.type === "hoan_tien" ? -money(payment.amount) : money(payment.amount));
  }, 0);
  const dateOrder = order.date_order ? new Date(`${order.date_order}T00:00:00`) : null;
  const daysSinceOrder = dateOrder ? Math.max(0, Math.floor((Date.now() - dateOrder.getTime()) / 86400000)) : 0;
  const due = order.due_date ? new Date(`${order.due_date}T23:59:59`) : null;
  return {
    ...order,
    items,
    product_name: order.product_name || items[0]?.product_name || "Sản phẩm",
    product_type: order.product_type || items[0]?.product_type || "Other",
    product_summary: `${items[0]?.product_name || "Sản phẩm"}${items.length > 1 ? ` +${items.length - 1} mẫu` : ""}`,
    product_count: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0),
    item_subtotal: itemSubtotal,
    customer,
    sourcing_lines: sourceLines.map((line) => ({
      ...line,
      vendor: findById(data.vendors, line.vendor_id) || null,
    })),
    payments,
    shipment,
    item_cost: itemCost,
    source_cost: sourceCost,
    material_cost: materialCost,
    shipping_cost: shippingCost,
    total_cost: totalCost,
    profit: money(order.price) - totalCost,
    pricing: {
      profit_rate: profitRate,
      tax_rate: taxRate,
      profit_amount: pricingProfit,
      price_before_tax: priceBeforeTax,
      tax_amount: pricingTax,
      suggested_price: suggestedPrice,
    },
    paid_amount: paidAmount,
    balance_due: Math.max(0, money(order.price) - paidAmount),
    days_since_order: daysSinceOrder,
    payment_month: order.payment_date ? order.payment_date.slice(0, 7) : null,
    overdue: due ? due.getTime() < Date.now() && !["hoan_tat", "huy_hoan"].includes(order.status) : false,
  };
}

function decoratedData(data) {
  const orders = data.orders.map((order) => decorateOrder(order, data));
  const customers = data.customers.map((customer) => decorateCustomer(customer, data));
  const products = data.products.map((product) => decorateProduct(product, data));
  const inventoryMovements = (data.inventory_movements || []).map((movement) => ({
    ...movement,
    product: products.find((product) => product.id === movement.product_id) || null,
    order: orders.find((order) => order.id === movement.source_id) || null,
  }));
  return {
    ...data,
    products,
    customers,
    orders,
    inventory_movements: inventoryMovements,
    meta: {
      order_statuses: ORDER_STATUSES,
      payment_statuses: PAYMENT_STATUSES,
      channels: CHANNELS,
      product_types: PRODUCT_TYPES,
      expense_categories: EXPENSE_CATEGORIES,
      vtp_status_map: VTP_STATUS_MAP,
    },
  };
}

function parsePath(url) {
  const parsed = new URL(url, `http://localhost:${PORT}`);
  return {
    pathname: parsed.pathname.replace(/\/+$/, "") || "/",
    searchParams: parsed.searchParams,
  };
}

function safeStaticPath(pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.normalize(path.join(PUBLIC_DIR, target));
  if (!resolved.startsWith(PUBLIC_DIR)) return null;
  return resolved;
}

function serveStatic(req, res, pathname) {
  const filePath = safeStaticPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(PUBLIC_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    text(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function csvEscape(value) {
  const raw = String(value ?? "");
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
}

function getOrderCsv(data, role = "admin") {
  const canSeeCosts = ["admin", "accounting", "ops"].includes(role);
  const canSeeFinancials = ["admin", "accounting"].includes(role);
  const rows = [
    ["Mã đơn", "Khách", "SĐT", "Trạng thái", "Sản phẩm", "Doanh thu", "Giá vốn", "Lợi nhuận", "Đã thu", "Còn thu"],
  ];
  decoratedData(data).orders.forEach((order) => {
    rows.push([
      order.order_code,
      order.customer?.full_name || "",
      order.customer?.phone || "",
      ORDER_STATUSES.find((status) => status.id === order.status)?.label || order.status,
      order.product_summary || `${order.product_type} - ${order.product_name}`,
      order.price,
      canSeeCosts ? order.total_cost : "Ẩn theo quyền",
      canSeeFinancials ? order.profit : "Ẩn theo quyền",
      order.paid_amount,
      order.balance_due,
    ]);
  });
  return toCsv(rows);
}

function quoteShipment(payload) {
  const weight = Math.max(100, Number(payload.weight || 300));
  const cod = Number(payload.cod_amount || 0);
  const provinceSeed = String(payload.province || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const zoneFee = 8000 + (provinceSeed % 5) * 3000;
  const fee = Math.round(18000 + zoneFee + weight * 9 + cod * 0.004);
  return {
    service_code: payload.service_code || "VCN",
    service_name: payload.service_code === "VTK" ? "Tiết kiệm" : "Chuyển phát nhanh",
    fee,
    expected_delivery: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
  };
}

function renderReceipt(order, lang) {
  const isEn = lang === "en";
  const items = (order.items || []).map((item) => ({
    quantity: Number(item.quantity || 1),
    name: item.product_name,
    description: [
      item.product_sku ? `ID ${item.product_sku}` : item.product_type,
      item.size ? `Size ${item.size}` : "",
      item.specs?.material,
      item.specs?.stone,
      item.note,
    ].filter(Boolean).join(" · "),
    unit_price: money(item.unit_price),
  }));
  const labels = isEn
    ? {
        title: "Receipt",
        date: "Date",
        customer: "Customer",
        tel: "Tel",
        address: "Address",
        item: "Item",
        qty: "Qty",
        total: "Total",
        ship: "Shipping fee",
        subtotal: "Subtotal",
        thanks: "Thanks for letting us add a little sparkle to your story.",
        note: "This is a browser print view. Use Print to save it as PDF.",
        print: "Print / Save PDF",
      }
    : {
        title: "Hóa đơn",
        date: "Ngày",
        customer: "Khách hàng",
        tel: "SĐT",
        address: "Địa chỉ",
        item: "Hạng mục",
        qty: "SL",
        total: "Thành tiền",
        ship: "Phí ship",
        subtotal: "Tổng cộng",
        thanks: "Cảm ơn bạn đã để Trinket thêm một chút lấp lánh vào câu chuyện của mình.",
        note: "Đây là trang in của trình duyệt. Dùng In để lưu thành PDF.",
        print: "In / Lưu PDF",
      };

  const fmt = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
  return `<!doctype html>
<html lang="${isEn ? "en" : "vi"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${labels.title} ${order.order_code}</title>
  <style>
    body { margin: 0; background: #f4f5f2; color: #24211d; font: 14px/1.5 Inter, Arial, sans-serif; }
    .sheet { width: min(820px, calc(100% - 32px)); margin: 32px auto; background: #fff; border: 1px solid #dedbd2; padding: 48px; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 1px solid #dedbd2; padding-bottom: 24px; }
    h1 { margin: 0; font-size: 34px; letter-spacing: 0; }
    .logo { font-size: 28px; font-weight: 750; color: #7c2638; }
    .muted { color: #706c64; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 28px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { padding: 12px 10px; border-bottom: 1px solid #e6e2d8; text-align: left; vertical-align: top; }
    th { color: #706c64; font-size: 12px; text-transform: uppercase; }
    .money, th.money { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; width: min(360px, 100%); margin-top: 22px; }
    .line { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #eee9de; }
    .grand { font-size: 18px; font-weight: 750; color: #7c2638; }
    .thanks { margin-top: 40px; font-size: 16px; color: #3f5145; }
    .note { margin-top: 10px; color: #706c64; font-size: 12px; }
    .actions { width: min(820px, calc(100% - 32px)); margin: 0 auto 32px; text-align: right; }
    button { background: #24211d; color: #fff; border: 0; border-radius: 6px; padding: 10px 14px; cursor: pointer; }
    @media print { body { background: #fff; } .sheet { margin: 0; width: auto; border: 0; } .actions { display: none; } }
    @media (max-width: 640px) { .sheet { padding: 28px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="sheet">
    <section class="brand">
      <div>
        <div class="logo">Trinket</div>
        <p class="muted">${order.order_code}</p>
      </div>
      <div>
        <h1>${labels.title}</h1>
        <p class="muted">${labels.date}: ${new Date().toLocaleDateString("vi-VN")}</p>
      </div>
    </section>
    <section class="grid">
      <div><strong>${labels.customer}</strong><br>${order.customer?.full_name || ""}</div>
      <div><strong>${labels.tel}</strong><br>${order.customer?.phone || ""}</div>
      <div style="grid-column: 1 / -1"><strong>${labels.address}</strong><br>${order.customer?.address || ""}</div>
    </section>
    <table>
      <thead><tr><th>${labels.item}</th><th>${labels.qty}</th><th class="money">${labels.total}</th></tr></thead>
      <tbody>
        ${items
          .map(
            (item) => `<tr><td><strong>${item.name}</strong><br><span class="muted">${item.description}</span></td><td>${item.quantity}</td><td class="money">${fmt.format(item.unit_price * item.quantity)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <section class="totals">
      <div class="line"><span>${labels.total}</span><strong>${fmt.format(order.price)}</strong></div>
      <div class="line"><span>${labels.ship}</span><strong>${fmt.format(order.shipping_cost)}</strong></div>
      <div class="line grand"><span>${labels.subtotal}</span><strong>${fmt.format(order.price + order.shipping_cost)}</strong></div>
    </section>
    <p class="thanks">${labels.thanks}</p>
    <p class="note">${labels.note}</p>
  </main>
  <div class="actions"><button onclick="window.print()">${labels.print}</button></div>
</body>
</html>`;
}

async function routeApi(req, res, pathname, searchParams) {
  const data = await readStore(req.user);

  if (req.method === "GET" && pathname === "/api/bootstrap") {
    const marketPrices = await getMarketPrices(data);
    if (marketPrices.changed) await writeStore(data, req.user);
    const payload = decoratedData(data);
    delete payload.users;
    json(res, 200, { ...payload, market_prices: marketPrices.payload });
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/export") {
    json(res, 200, data);
    return;
  }

  const accountManager = () => createAccountManager({
    auth: req.user.local ? createLocalAuthAdapter(data, req.user) : getFirebaseServices().auth,
    persist: writeStore,
  });

  if (req.method === "POST" && pathname === "/api/auth/change-password") {
    const result = await accountManager().changeOwnPassword(data, req.user, await readBody(req));
    json(res, 200, result);
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/users") {
    const result = await accountManager().list(data, {
      q: searchParams.get("q") || "",
      role: searchParams.get("role") || "",
      status: searchParams.get("status") || "",
      page: searchParams.get("page") || "1",
      page_size: searchParams.get("page_size") || "10",
    });
    json(res, 200, result);
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/users") {
    const result = await accountManager().create(data, req.user, await readBody(req));
    json(res, 201, result);
    return;
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (req.method === "DELETE" && adminUserMatch) {
    const result = await accountManager().remove(data, req.user, decodeURIComponent(adminUserMatch[1]));
    json(res, 200, result);
    return;
  }
  if (req.method === "PATCH" && adminUserMatch) {
    const result = await accountManager().update(data, req.user, decodeURIComponent(adminUserMatch[1]), await readBody(req));
    json(res, 200, result);
    return;
  }

  const accountStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/(disable|enable)$/);
  if (req.method === "POST" && accountStatusMatch) {
    const result = await accountManager().setDisabled(
      data,
      req.user,
      decodeURIComponent(accountStatusMatch[1]),
      accountStatusMatch[2] === "disable",
    );
    json(res, 200, result);
    return;
  }

  const passwordResetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (req.method === "POST" && passwordResetMatch) {
    const result = await accountManager().resetPassword(data, req.user, decodeURIComponent(passwordResetMatch[1]));
    json(res, 200, result);
    return;
  }

  if (req.method === "GET" && pathname === "/api/market-prices") {
    const marketPrices = await getMarketPrices(data, { force: searchParams.get("refresh") === "1" });
    if (marketPrices.changed) {
      audit(data, "sync", "market_prices", "latest", {
        status: marketPrices.payload.status,
        sources: marketPrices.payload.sourceLabel,
        errors: marketPrices.payload.errors || [],
      });
      await writeStore(data, req.user);
    }
    json(res, 200, marketPrices.payload);
    return;
  }

  if (req.method === "GET" && pathname === "/api/export/orders.csv") {
    const body = getOrderCsv(data, req.user.role);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="trinket-orders.csv"',
    });
    res.end(body);
    return;
  }

  const receiptMatch = pathname.match(/^\/api\/receipts\/([^/]+)$/);
  if (req.method === "GET" && receiptMatch) {
    const order = decoratedData(data).orders.find((item) => item.id === receiptMatch[1]);
    if (!order) return json(res, 404, { error: "Order not found" });
    html(res, 200, renderReceipt(order, searchParams.get("lang") === "en" ? "en" : "vi"));
    return;
  }

  if (req.method === "PATCH" && pathname === "/api/settings") {
    const body = await readBody(req);
    const before = JSON.parse(JSON.stringify(data.settings || {}));
    if (Object.prototype.hasOwnProperty.call(body, "default_monthly_revenue_target")) {
      data.settings.default_monthly_revenue_target = Math.max(0, money(body.default_monthly_revenue_target));
    }
    if (body.monthly_revenue_targets && typeof body.monthly_revenue_targets === "object") {
      data.settings.monthly_revenue_targets = Object.fromEntries(
        Object.entries(body.monthly_revenue_targets)
          .filter(([month]) => /^\d{4}-\d{2}$/.test(month))
          .map(([month, value]) => [month, Math.max(0, money(value))]),
      );
    }
    if (body.metal_price_overrides && typeof body.metal_price_overrides === "object") {
      data.settings.metal_price_overrides = Object.fromEntries(
        Object.entries(body.metal_price_overrides)
          .map(([key, value]) => [String(key), Math.max(0, money(value))])
          .filter(([, value]) => value > 0),
      );
      data.settings.metal_price_rules = Object.fromEntries(
        Object.entries(data.settings.metal_price_overrides).map(([key, value]) => [key, { mode: "manual", value }]),
      );
    }
    if (Array.isArray(body.goal_months)) {
      data.settings.goal_months = [...new Set(body.goal_months.map(String).filter((month) => /^\d{4}-\d{2}$/.test(month)))].sort();
    }
    if (Array.isArray(body.business_goals) && body.business_goals.length) {
      data.settings.business_goals = body.business_goals.map((goal, index) => normalizeBusinessGoal({
        ...goal,
        id: goal.id || id("goal"),
      }, index));
      data.settings.business_goals.forEach((goal) => Object.keys(goal.targets).forEach((month) => {
        if (!data.settings.goal_months.includes(month)) data.settings.goal_months.push(month);
      }));
      data.settings.goal_months.sort();
    }
    if (body.metal_price_rules && typeof body.metal_price_rules === "object") {
      data.settings.metal_price_rules = Object.fromEntries(
        Object.entries(body.metal_price_rules).map(([key, rule]) => [String(key), normalizeMetalRule(rule)]),
      );
      data.settings.metal_price_overrides = Object.fromEntries(
        Object.entries(data.settings.metal_price_rules)
          .filter(([, rule]) => rule.mode === "manual" && rule.value > 0)
          .map(([key, rule]) => [key, rule.value]),
      );
    }
    audit(data, "update", "settings", "business", { before, after: data.settings });
    await writeStore(data, req.user);
    json(res, 200, data.settings);
    return;
  }

  if (req.method === "POST" && pathname === "/api/materials") {
    const body = await readBody(req);
    if (!String(body.name || "").trim()) return json(res, 400, { error: "Tên chất liệu là bắt buộc" });
    const material = normalizeMaterial({ ...body, id: id("mat") }, data.settings.material_catalog.length);
    data.settings.material_catalog.push(material);
    audit(data, "create", "material", material.id, material);
    await writeStore(data, req.user);
    json(res, 201, material);
    return;
  }

  const materialMatch = pathname.match(/^\/api\/materials\/([^/]+)$/);
  if (materialMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const index = data.settings.material_catalog.findIndex((material) => material.id === materialMatch[1]);
    if (index === -1) return json(res, 404, { error: "Material not found" });
    const before = { ...data.settings.material_catalog[index] };
    const material = normalizeMaterial({ ...before, ...body, id: before.id }, index);
    if (!material.name) return json(res, 400, { error: "Tên chất liệu là bắt buộc" });
    data.settings.material_catalog[index] = material;
    data.orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (item.material_id === material.id) item.specs = { ...(item.specs || {}), material: material.name };
      });
    });
    audit(data, "update", "material", material.id, { before, after: material });
    await writeStore(data, req.user);
    json(res, 200, material);
    return;
  }

  if (materialMatch && req.method === "DELETE") {
    const index = data.settings.material_catalog.findIndex((material) => material.id === materialMatch[1]);
    if (index === -1) return json(res, 404, { error: "Material not found" });
    const [removed] = data.settings.material_catalog.splice(index, 1);
    let detachedItems = 0;
    data.products.forEach((product) => {
      if (product.material_id === removed.id) product.material_id = "";
    });
    data.orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (item.material_id !== removed.id) return;
        item.material_id = "";
        if (item.metal_pricing?.mode === "profile") item.metal_pricing.mode = "manual";
        detachedItems += 1;
      });
    });
    audit(data, "delete", "material", removed.id, { material: removed, detachedItems });
    await writeStore(data, req.user);
    json(res, 200, { ok: true, detachedItems });
    return;
  }

  if (req.method === "POST" && pathname === "/api/products") {
    const body = await readBody(req);
    const sku = String(body.sku || "").trim();
    if (!sku) return json(res, 400, { error: "Mã mẫu là bắt buộc" });
    if (data.products.some((product) => String(product.sku).toLowerCase() === sku.toLowerCase())) {
      return json(res, 409, { error: "Mã mẫu đã tồn tại" });
    }
    const productId = validClientId(body.id, "prd") ? body.id : id("prd");
    if (data.products.some((product) => product.id === productId)) {
      return json(res, 409, { error: "Product ID already exists" });
    }
    const productImage = normalizeCatalogProductImage(body.image, productId);
    if (body.image && !productImage) return json(res, 400, { error: "Invalid catalog product image metadata" });
    const product = normalizeProduct({
      id: productId,
      sku,
      type: body.type,
      name: body.name,
      default_price: body.default_price,
      default_cost: body.default_cost,
      material_id: body.material_id,
      default_size: body.default_size,
      default_stone: body.default_stone,
      status: body.status,
      track_inventory: body.track_inventory,
      low_stock_threshold: body.low_stock_threshold,
      note: body.note,
      image: productImage,
    });
    data.products.push(product);
    const initialStock = Math.max(0, Number(body.initial_stock || 0));
    if (product.track_inventory && initialStock > 0) {
      data.inventory_movements.unshift({
        id: id("mov"),
        product_id: product.id,
        quantity: initialStock,
        type: "opening",
        reason: "Tồn đầu kỳ",
        source_type: "manual",
        source_id: product.id,
        created_at: new Date().toISOString(),
        created_by: "Admin / Chủ",
      });
    }
    audit(data, "create", "product", product.id, product);
    await writeStore(data, req.user);
    json(res, 201, decorateProduct(product, data));
    return;
  }

  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const product = findById(data.products, productMatch[1]);
    if (!product) return json(res, 404, { error: "Product not found" });
    const sku = String(body.sku ?? product.sku).trim();
    if (!sku) return json(res, 400, { error: "Mã mẫu là bắt buộc" });
    if (data.products.some((item) => item.id !== product.id && String(item.sku).toLowerCase() === sku.toLowerCase())) {
      return json(res, 409, { error: "Mã mẫu đã tồn tại" });
    }
    const before = { ...product };
    ["type", "name", "note", "material_id", "default_size", "default_stone", "status"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) product[field] = body[field] || "";
    });
    if (Object.prototype.hasOwnProperty.call(body, "image")) {
      const productImage = normalizeCatalogProductImage(body.image, product.id);
      if (body.image && !productImage) return json(res, 400, { error: "Invalid catalog product image metadata" });
      product.image = productImage;
    }
    product.sku = sku;
    if (Object.prototype.hasOwnProperty.call(body, "default_price")) product.default_price = money(body.default_price);
    if (Object.prototype.hasOwnProperty.call(body, "default_cost")) product.default_cost = money(body.default_cost);
    if (Object.prototype.hasOwnProperty.call(body, "track_inventory")) product.track_inventory = Boolean(body.track_inventory);
    if (Object.prototype.hasOwnProperty.call(body, "low_stock_threshold")) product.low_stock_threshold = Math.max(0, Number(body.low_stock_threshold || 0));
    audit(data, "update", "product", product.id, { before, after: product });
    await writeStore(data, req.user);
    json(res, 200, decorateProduct(product, data));
    return;
  }

  if (productMatch && req.method === "DELETE") {
    const index = data.products.findIndex((product) => product.id === productMatch[1]);
    if (index === -1) return json(res, 404, { error: "Product not found" });
    const product = data.products[index];
    const referenced = data.orders.some((order) => (order.items || []).some((item) => item.product_id === product.id));
    if (referenced) {
      const before = { ...product };
      product.status = "inactive";
      audit(data, "archive", "product", product.id, { before, after: product });
      await writeStore(data, req.user);
      json(res, 200, { ok: true, archived: true });
      return;
    }
    const [removed] = data.products.splice(index, 1);
    data.inventory_movements = (data.inventory_movements || []).filter((movement) => movement.product_id !== removed.id);
    audit(data, "delete", "product", removed.id, { product: removed });
    await writeStore(data, req.user);
    json(res, 200, { ok: true, archived: false });
    return;
  }

  if (req.method === "POST" && pathname === "/api/inventory/adjustments") {
    const body = await readBody(req);
    const product = findById(data.products, body.product_id);
    if (!product) return json(res, 404, { error: "Product not found" });
    const quantity = Number(body.quantity || 0);
    if (!Number.isFinite(quantity) || quantity === 0) return json(res, 400, { error: "Số lượng điều chỉnh phải khác 0" });
    const balance = inventoryBalance(product.id, data);
    if (balance.on_hand + quantity < balance.reserved) {
      return json(res, 409, { error: `Không thể giảm dưới ${balance.reserved} sản phẩm đang được giữ` });
    }
    product.track_inventory = true;
    const movement = {
      id: id("mov"),
      product_id: product.id,
      quantity,
      type: body.type || (quantity > 0 ? "receipt" : "adjustment"),
      reason: String(body.reason || "Điều chỉnh tồn kho").trim(),
      source_type: "manual",
      source_id: "",
      created_at: new Date().toISOString(),
      created_by: "Admin / Chủ",
    };
    data.inventory_movements.unshift(movement);
    audit(data, "adjust", "inventory", product.id, movement);
    await writeStore(data, req.user);
    json(res, 201, { movement, product: decorateProduct(product, data) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/customers") {
    const body = await readBody(req);
    const customer = {
      id: id("cus"),
      full_name: body.full_name || "Khách mới",
      phone: body.phone || "",
      address: body.address || "",
      channel: body.channel || "Khác",
      account: body.account || "",
      province: body.province || "",
      district: body.district || "",
      ward: body.ward || "",
      note: body.note || "",
      created_at: new Date().toISOString(),
    };
    data.customers.push(customer);
    audit(data, "create", "customer", customer.id, customer);
    await writeStore(data, req.user);
    json(res, 201, decorateCustomer(customer, data));
    return;
  }

  const customerMatch = pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const customer = findById(data.customers, customerMatch[1]);
    if (!customer) return json(res, 404, { error: "Customer not found" });
    const before = { ...customer };
    ["full_name", "phone", "address", "channel", "account", "province", "district", "ward", "note"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) customer[field] = body[field] || "";
    });
    audit(data, "update", "customer", customer.id, { before, after: customer });
    await writeStore(data, req.user);
    json(res, 200, decorateCustomer(customer, data));
    return;
  }

  if (customerMatch && req.method === "DELETE") {
    const index = data.customers.findIndex((customer) => customer.id === customerMatch[1]);
    if (index === -1) return json(res, 404, { error: "Customer not found" });
    const [removed] = data.customers.splice(index, 1);
    const removedOrders = data.orders.filter((order) => order.customer_id === removed.id).map((order) => order.id);
    removedOrders.forEach((orderId) => removeOrderCascade(data, orderId));
    audit(data, "delete", "customer", removed.id, { customer: removed, removedOrders });
    await writeStore(data, req.user);
    json(res, 200, { ok: true, removedOrders });
    return;
  }

  if (req.method === "POST" && pathname === "/api/vendors") {
    const body = await readBody(req);
    const vendor = {
      id: id("ven"),
      name: body.name || "Nhà cung cấp mới",
      type: body.type || "Khác",
      contact: body.contact || "",
      phone: body.phone || "",
      address: body.address || "",
      note: body.note || "",
    };
    data.vendors.push(vendor);
    audit(data, "create", "vendor", vendor.id, vendor);
    await writeStore(data, req.user);
    json(res, 201, vendor);
    return;
  }

  const vendorMatch = pathname.match(/^\/api\/vendors\/([^/]+)$/);
  if (vendorMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const vendor = findById(data.vendors, vendorMatch[1]);
    if (!vendor) return json(res, 404, { error: "Vendor not found" });
    const before = { ...vendor };
    ["name", "type", "contact", "phone", "address", "note"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) vendor[field] = body[field] || "";
    });
    audit(data, "update", "vendor", vendor.id, { before, after: vendor });
    await writeStore(data, req.user);
    json(res, 200, vendor);
    return;
  }

  if (vendorMatch && req.method === "DELETE") {
    const index = data.vendors.findIndex((vendor) => vendor.id === vendorMatch[1]);
    if (index === -1) return json(res, 404, { error: "Vendor not found" });
    const [removed] = data.vendors.splice(index, 1);
    let detachedLines = 0;
    (data.order_sourcing_lines || []).forEach((line) => {
      if (line.vendor_id === removed.id) {
        line.vendor_id = "";
        detachedLines += 1;
      }
    });
    audit(data, "delete", "vendor", removed.id, { vendor: removed, detachedLines });
    await writeStore(data, req.user);
    json(res, 200, { ok: true, detachedLines });
    return;
  }

  if (req.method === "POST" && pathname === "/api/expenses") {
    const body = await readBody(req);
    const expense = {
      id: id("exp"),
      date: body.date || todayIso(),
      category: body.category || "Khác",
      description: body.description || "",
      amount: money(body.amount),
      attachment: body.attachment || "",
    };
    data.expenses.push(expense);
    audit(data, "create", "expense", expense.id, expense);
    await writeStore(data, req.user);
    json(res, 201, expense);
    return;
  }

  const expenseMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
  if (expenseMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const expense = findById(data.expenses, expenseMatch[1]);
    if (!expense) return json(res, 404, { error: "Expense not found" });
    const before = { ...expense };
    ["date", "category", "description", "attachment"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) expense[field] = body[field] || "";
    });
    if (Object.prototype.hasOwnProperty.call(body, "amount")) expense.amount = money(body.amount);
    audit(data, "update", "expense", expense.id, { before, after: expense });
    await writeStore(data, req.user);
    json(res, 200, expense);
    return;
  }

  if (expenseMatch && req.method === "DELETE") {
    const index = data.expenses.findIndex((expense) => expense.id === expenseMatch[1]);
    if (index === -1) return json(res, 404, { error: "Expense not found" });
    const [removed] = data.expenses.splice(index, 1);
    audit(data, "delete", "expense", removed.id, removed);
    await writeStore(data, req.user);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/payments") {
    const body = await readBody(req);
    const order = findById(data.orders, body.order_id);
    if (!order) return json(res, 404, { error: "Order not found" });
    const payment = {
      id: id("pay"),
      order_id: body.order_id,
      amount: money(body.amount),
      type: body.type || "thanh_toan_con_lai",
      method: body.method || "Chuyển khoản",
      paid_at: body.paid_at || new Date().toISOString(),
    };
    data.payments.push(payment);
    syncOrderPaymentStatus(order, data);
    audit(data, "create", "payment", payment.id, payment);
    await writeStore(data, req.user);
    json(res, 201, payment);
    return;
  }

  const paymentMatch = pathname.match(/^\/api\/payments\/([^/]+)$/);
  if (paymentMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const payment = findById(data.payments, paymentMatch[1]);
    if (!payment) return json(res, 404, { error: "Payment not found" });
    const before = { ...payment };
    ["type", "method", "paid_at"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) payment[field] = body[field] || "";
    });
    if (Object.prototype.hasOwnProperty.call(body, "amount")) payment.amount = money(body.amount);
    const order = findById(data.orders, payment.order_id);
    syncOrderPaymentStatus(order, data);
    audit(data, "update", "payment", payment.id, { before, after: payment });
    await writeStore(data, req.user);
    json(res, 200, payment);
    return;
  }

  if (paymentMatch && req.method === "DELETE") {
    const index = data.payments.findIndex((payment) => payment.id === paymentMatch[1]);
    if (index === -1) return json(res, 404, { error: "Payment not found" });
    const [removed] = data.payments.splice(index, 1);
    const order = findById(data.orders, removed.order_id);
    syncOrderPaymentStatus(order, data);
    audit(data, "delete", "payment", removed.id, removed);
    await writeStore(data, req.user);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    const body = await readBody(req);
    let customerId = body.customer_id;
    if (!customerId && body.customer) {
      const phone = normalizePhone(body.customer.phone);
      const existing = data.customers.find((customer) => normalizePhone(customer.phone) === phone && phone);
      if (existing) {
        customerId = existing.id;
      } else {
        const customer = {
          id: id("cus"),
          full_name: body.customer.full_name || "Khách mới",
          phone: body.customer.phone || "",
          address: body.customer.address || "",
          channel: body.customer.channel || "Khác",
          account: body.customer.account || "",
          province: body.customer.province || "",
          district: body.customer.district || "",
          ward: body.customer.ward || "",
          note: body.customer.note || "",
          created_at: new Date().toISOString(),
        };
        data.customers.push(customer);
        customerId = customer.id;
        audit(data, "create", "customer", customer.id, customer);
      }
    }
    if (!customerId || !findById(data.customers, customerId)) {
      return json(res, 400, { error: "A valid customer is required" });
    }
    const requestedOrderId = String(body.id || "").trim();
    if (requestedOrderId && !validClientId(requestedOrderId, "ord")) {
      return json(res, 400, { error: "Invalid order ID" });
    }
    if (requestedOrderId && findById(data.orders, requestedOrderId)) {
      return json(res, 409, { error: "Order ID already exists" });
    }
    const orderId = requestedOrderId || id("ord");
    const rawItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : [{
          product_id: body.product_id || "",
          product_type: body.product_type || "Ring",
          product_name: body.product_name || "",
          note: body.request || "",
          quantity: 1,
          unit_price: money(body.price),
          size: body.size || "",
          specs: body.product_specs || {},
        }];
    let preparedItems;
    try {
      preparedItems = prepareIncomingOrderItems(rawItems, orderId);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    const items = normalizeOrderItems({ id: orderId, items: preparedItems }, data);
    const firstItem = items[0];
    const itemSubtotal = items.reduce((sum, item) => sum + money(item.unit_price) * Number(item.quantity || 1), 0);
    const order = {
      id: orderId,
      order_code: makeOrderCode(data),
      customer_id: customerId,
      status: body.status || "tu_van",
      product_id: firstItem.product_id,
      product_type: firstItem.product_type,
      product_name: firstItem.product_name,
      size: firstItem.size,
      items,
      price: Object.prototype.hasOwnProperty.call(body, "price") ? money(body.price) : itemSubtotal,
      request: body.request || "",
      date_order: body.date_order || todayIso(),
      due_date: body.due_date || "",
      payment_date: body.payment_date || "",
      payment_status: body.payment_status || "chua_coc",
      shipping_cost: money(body.shipping_cost),
      shipment_id: null,
      assignee: body.assignee || "Sale",
      product_specs: firstItem.specs || {},
      pricing: {
        profit_rate: Number(body.pricing?.profit_rate || 0),
        tax_rate: Number(body.pricing?.tax_rate || 0),
      },
      attachments: [],
      note: body.note || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      validateOrderInventory(order, data);
    } catch (error) {
      return json(res, 409, { error: error.message });
    }
    data.orders.push(order);
    syncOrderInventoryMovements(order, data);
    (body.sourcing_lines || [])
      .filter((line) => line.vendor_id || line.material || Number(line.cost) > 0)
      .forEach((line) => {
        data.order_sourcing_lines.push({
          id: id("src"),
          order_id: order.id,
          vendor_id: line.vendor_id || data.vendors[0]?.id || "",
          material: line.material || "",
          cost: money(line.cost),
          gold_karat: line.gold_karat || "",
          weight: Number(line.weight || 0),
          status: line.status || "Đã đặt",
        });
      });
    audit(data, "create", "order", order.id, order);
    await writeStore(data, req.user);
    json(res, 201, decorateOrder(order, data));
    return;
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && req.method === "PATCH") {
    const body = await readBody(req);
    assertOrderPatchAllowed(req.user, body);
    const order = findById(data.orders, orderMatch[1]);
    if (!order) return json(res, 404, { error: "Order not found" });
    if (body.customer_id && !findById(data.customers, body.customer_id)) return json(res, 400, { error: "Customer not found" });
    const allowed = [
      "status",
      "customer_id",
      "product_type",
      "product_name",
      "size",
      "price",
      "request",
      "date_order",
      "due_date",
      "payment_date",
      "payment_status",
      "shipping_cost",
      "assignee",
      "product_specs",
      "note",
    ];
    const before = JSON.parse(JSON.stringify(order));
    const hadInventoryMovement = data.inventory_movements.some((movement) => movement.source_type === "order" && movement.source_id === order.id);
    const sourceLinesBefore = data.order_sourcing_lines.filter((line) => line.order_id === order.id);
    allowed.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        order[field] = ["price", "shipping_cost"].includes(field) ? money(body[field]) : body[field];
      }
    });
    if (Array.isArray(body.items) && body.items.length) {
      let preparedItems;
      try {
        preparedItems = prepareIncomingOrderItems(body.items, order.id);
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
      order.items = normalizeOrderItems({ ...order, items: preparedItems }, data);
      const firstItem = order.items[0];
      order.product_id = firstItem.product_id;
      order.product_type = firstItem.product_type;
      order.product_name = firstItem.product_name;
      order.size = firstItem.size;
      order.product_specs = firstItem.specs;
    }
    if (body.pricing && typeof body.pricing === "object") {
      order.pricing = {
        profit_rate: Number(body.pricing.profit_rate || 0),
        tax_rate: Number(body.pricing.tax_rate || 0),
      };
    }
    const preserveLegacyCompleted = before.status === "hoan_tat" && order.status === "hoan_tat" && !hadInventoryMovement;
    if (!preserveLegacyCompleted) {
      try {
        validateOrderInventory(order, data);
      } catch (error) {
        const orderIndex = data.orders.findIndex((item) => item.id === order.id);
        data.orders[orderIndex] = before;
        return json(res, 409, { error: error.message });
      }
    }
    if (Array.isArray(body.sourcing_lines)) {
      const existingIds = new Set(sourceLinesBefore.map((line) => line.id));
      const nextLines = body.sourcing_lines
        .filter((line) => line.vendor_id || line.material || money(line.cost) > 0)
        .map((line) => ({
          id: line.id && existingIds.has(line.id) ? line.id : id("src"),
          order_id: order.id,
          vendor_id: line.vendor_id || "",
          material: line.material || "",
          cost: money(line.cost),
          gold_karat: line.gold_karat || "",
          weight: Number(line.weight || 0),
          status: line.status || "Đã đặt",
        }));
      data.order_sourcing_lines = data.order_sourcing_lines.filter((line) => line.order_id !== order.id).concat(nextLines);
    }
    syncOrderInventoryMovements(order, data, { applyCompleted: !preserveLegacyCompleted });
    order.updated_at = new Date().toISOString();
    audit(data, "update", "order", order.id, {
      before,
      after: order,
      sourcing_before: sourceLinesBefore,
      sourcing_after: data.order_sourcing_lines.filter((line) => line.order_id === order.id),
    });
    await writeStore(data, req.user);
    json(res, 200, decorateOrder(order, data));
    return;
  }

  if (orderMatch && req.method === "DELETE") {
    const removed = removeOrderCascade(data, orderMatch[1]);
    if (!removed) return json(res, 404, { error: "Order not found" });
    audit(data, "delete", "order", removed.id, removed);
    await writeStore(data, req.user);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/shipments/quote") {
    const body = await readBody(req);
    json(res, 200, quoteShipment(body));
    return;
  }

  if (req.method === "POST" && pathname === "/api/shipments/create") {
    const body = await readBody(req);
    const order = findById(data.orders, body.order_id);
    if (!order) return json(res, 404, { error: "Order not found" });
    const customer = findById(data.customers, order.customer_id) || {};
    const quote = quoteShipment({ ...body, province: customer.province });
    const shipment = {
      id: id("shp"),
      order_id: order.id,
      carrier: "Viettel Post",
      tracking_code: `VTP${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`,
      service_code: quote.service_code,
      cod_amount: money(body.cod_amount || decorateOrder(order, data).balance_due),
      weight: Number(body.weight || 300),
      dimensions: body.dimensions || "12x10x6",
      fee: quote.fee,
      status: "pending_pickup",
      status_label: VTP_STATUS_MAP.pending_pickup.label,
      status_history: [{ status: "pending_pickup", label: VTP_STATUS_MAP.pending_pickup.label, at: new Date().toISOString() }],
      expected_delivery: quote.expected_delivery,
      label_url: `/api/receipts/${order.id}?lang=vi`,
      raw_response: { adapter: "mock-viettelpost", quote },
      created_at: new Date().toISOString(),
    };
    data.shipments.push(shipment);
    order.shipment_id = shipment.id;
    order.status = "dang_giao";
    order.shipping_cost = quote.fee;
    order.updated_at = new Date().toISOString();
    audit(data, "create", "shipment", shipment.id, shipment);
    await writeStore(data, req.user);
    json(res, 201, shipment);
    return;
  }

  const shipmentMatch = pathname.match(/^\/api\/shipments\/([^/]+)$/);
  if (shipmentMatch && req.method === "PATCH") {
    const body = await readBody(req);
    const shipment = findById(data.shipments, shipmentMatch[1]);
    if (!shipment) return json(res, 404, { error: "Shipment not found" });
    const before = { ...shipment };
    ["carrier", "tracking_code", "service_code", "dimensions", "status_label", "expected_delivery"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) shipment[field] = body[field] || "";
    });
    ["cod_amount", "weight", "fee"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body, field)) shipment[field] = money(body[field]);
    });
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      shipment.status = body.status || shipment.status;
      const mapped = VTP_STATUS_MAP[shipment.status];
      if (mapped && !body.status_label) shipment.status_label = mapped.label;
      shipment.status_history = shipment.status_history || [];
      shipment.status_history.push({ status: shipment.status, label: shipment.status_label, at: new Date().toISOString() });
      const order = findById(data.orders, shipment.order_id);
      if (order && mapped) {
        order.status = mapped.orderStatus;
        order.updated_at = new Date().toISOString();
      }
    }
    audit(data, "update", "shipment", shipment.id, { before, after: shipment });
    await writeStore(data, req.user);
    json(res, 200, shipment);
    return;
  }

  if (shipmentMatch && req.method === "DELETE") {
    const index = data.shipments.findIndex((shipment) => shipment.id === shipmentMatch[1]);
    if (index === -1) return json(res, 404, { error: "Shipment not found" });
    const [removed] = data.shipments.splice(index, 1);
    const order = findById(data.orders, removed.order_id);
    if (order && order.shipment_id === removed.id) {
      order.shipment_id = null;
      if (order.status === "dang_giao") order.status = "cho_giao";
      order.updated_at = new Date().toISOString();
    }
    audit(data, "delete", "shipment", removed.id, removed);
    await writeStore(data, req.user);
    json(res, 200, { ok: true });
    return;
  }

  const shipmentSyncMatch = pathname.match(/^\/api\/shipments\/([^/]+)\/tracking-sync$/);
  if (req.method === "POST" && shipmentSyncMatch) {
    const shipment = findById(data.shipments, shipmentSyncMatch[1]);
    if (!shipment) return json(res, 404, { error: "Shipment not found" });
    const currentIndex = Math.max(0, TRACKING_FLOW.indexOf(shipment.status));
    const nextStatus = TRACKING_FLOW[Math.min(currentIndex + 1, TRACKING_FLOW.length - 1)];
    shipment.status = nextStatus;
    shipment.status_label = VTP_STATUS_MAP[nextStatus].label;
    shipment.status_history.push({
      status: nextStatus,
      label: VTP_STATUS_MAP[nextStatus].label,
      at: new Date().toISOString(),
    });
    const order = findById(data.orders, shipment.order_id);
    if (order) {
      order.status = VTP_STATUS_MAP[nextStatus].orderStatus;
      order.updated_at = new Date().toISOString();
    }
    audit(data, "sync", "shipment", shipment.id, { status: nextStatus });
    await writeStore(data, req.user);
    json(res, 200, shipment);
    return;
  }

  if (req.method === "POST" && pathname === "/api/viettelpost/webhook") {
    const webhookSecret = process.env.VTP_WEBHOOK_SECRET || "";
    const providedSecret = String(req.headers["x-webhook-secret"] || "");
    if (IS_VERCEL && !webhookSecret) return json(res, 503, { error: "VTP_WEBHOOK_SECRET chưa được cấu hình" });
    if (webhookSecret) {
      const expected = Buffer.from(webhookSecret);
      const actual = Buffer.from(providedSecret);
      if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
        return json(res, 401, { error: "Webhook secret không hợp lệ" });
      }
    }
    const body = await readBody(req);
    const shipment = data.shipments.find((item) => item.tracking_code === body.tracking_code);
    if (!shipment) return json(res, 404, { error: "Shipment not found" });
    const mapped = VTP_STATUS_MAP[body.status] || VTP_STATUS_MAP.in_transit;
    shipment.status = body.status;
    shipment.status_label = mapped.label;
    shipment.status_history.push({ status: body.status, label: mapped.label, at: new Date().toISOString() });
    const order = findById(data.orders, shipment.order_id);
    if (order) order.status = mapped.orderStatus;
    audit(data, "webhook", "shipment", shipment.id, body);
    await writeStore(data, req.user);
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { error: "API route not found" });
}

async function handleRequest(req, res) {
  try {
    const { pathname, searchParams } = parsePath(req.url);
    if (pathname.startsWith("/api/")) {
      if (req.method === "GET" && pathname === "/api/firebase-config") {
        const status = serverFirebaseConfigStatus();
        if (status.enabled && status.missing.length) {
          json(res, 503, { enabled: true, error: "Firebase chưa được cấu hình đầy đủ: " + status.missing.join(", ") });
          return;
        }
        json(res, 200, { enabled: status.enabled, config: status.enabled ? status.config : null });
        return;
      }
      if (req.method === "GET" && pathname === "/api/health") {
        json(res, 200, { ok: true, auth: serverAuthRequired() ? "firebase" : "local", data: dataStore.backend });
        return;
      }
      if (req.method === "POST" && pathname === "/api/viettelpost/webhook") {
        req.user = { uid: "viettelpost-webhook", email: "", name: "Viettel Post", role: "system" };
      } else {
        req.user = await authenticateRequest(req);
        authorizeApiRequest(req, pathname);
      }
      if (req.method === "GET" && pathname === "/api/me") {
        json(res, 200, req.user);
        return;
      }
      await routeApi(req, res, pathname, searchParams);
      return;
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    if (statusCode >= 500) console.error(error);
    json(res, statusCode, { error: error.message || "Internal server error" });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SERVER_PATH) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Trinket Business Manager running at http://localhost:${PORT} (${dataStore.backend})`);
  });
}

export { normalizeData };
export default handleRequest;
