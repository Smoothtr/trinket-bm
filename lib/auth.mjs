import { getFirebaseServices, hasAdminConfiguration } from "./firebase-admin.mjs";

const ROLES = ["admin", "sale", "ops", "accounting"];
const AUTHENTICATED_ROLES = new Set(ROLES);

function isAuthRequired() {
  if (process.env.AUTH_DISABLED === "1" && process.env.VERCEL !== "1") return false;
  return process.env.FIREBASE_AUTH_ENABLED === "1" || process.env.VERCEL === "1";
}

function firebaseWebConfig() {
  return {
    apiKey: process.env.FIREBASE_WEB_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    appId: process.env.FIREBASE_WEB_APP_ID || "",
  };
}

function firebaseConfigStatus() {
  const enabled = isAuthRequired();
  const config = firebaseWebConfig();
  const missing = enabled
    ? Object.entries(config).filter(([, value]) => !value).map(([key]) => key)
    : [];
  if (enabled && !hasAdminConfiguration()) missing.push("adminCredentials");
  if (enabled && process.env.VERCEL === "1" && process.env.DATA_BACKEND !== "firestore") {
    missing.push("DATA_BACKEND=firestore");
  }
  return { enabled, config, missing };
}

async function authenticateRequest(req) {
  if (!isAuthRequired()) {
    return {
      uid: "local-admin",
      email: "local@trinket.test",
      name: "Local Admin",
      role: "admin",
      local: true,
    };
  }

  const status = firebaseConfigStatus();
  if (status.missing.length) {
    const error = new Error(`Firebase chưa được cấu hình đầy đủ: ${status.missing.join(", ")}`);
    error.statusCode = 503;
    throw error;
  }

  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error("Bạn cần đăng nhập để tiếp tục.");
    error.statusCode = 401;
    throw error;
  }

  let decoded;
  try {
    decoded = await getFirebaseServices().auth.verifyIdToken(match[1], true);
  } catch (cause) {
    const error = new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
    error.statusCode = 401;
    error.cause = cause;
    throw error;
  }

  const role = String(decoded.role || "");
  if (!AUTHENTICATED_ROLES.has(role)) {
    const error = new Error("Tài khoản chưa được gán quyền truy cập Trinket.");
    error.statusCode = 403;
    throw error;
  }

  return {
    uid: decoded.uid,
    email: decoded.email || "",
    name: decoded.name || decoded.email || decoded.uid,
    role,
    local: false,
  };
}

function requireRoles(user, allowed) {
  if (allowed.includes(user.role)) return;
  const error = new Error("Bạn không có quyền thực hiện thao tác này.");
  error.statusCode = 403;
  throw error;
}

function authorizeApiRequest(req, pathname) {
  const user = req.user;
  const method = req.method || "GET";
  if (pathname.startsWith("/api/admin/")) {
    requireRoles(user, ["admin"]);
    return;
  }
  if (method === "GET" || method === "HEAD") {
    requireRoles(user, ROLES);
    return;
  }

  if (pathname === "/api/settings") {
    requireRoles(user, ["admin"]);
    return;
  }

  if (pathname === "/api/materials" || pathname.startsWith("/api/materials/")
    || pathname === "/api/products" || pathname.startsWith("/api/products/")
    || pathname === "/api/inventory/adjustments"
    || pathname === "/api/vendors" || pathname.startsWith("/api/vendors/")) {
    requireRoles(user, ["admin", "ops"]);
    return;
  }

  if (pathname === "/api/expenses" || pathname.startsWith("/api/expenses/")) {
    requireRoles(user, ["admin", "accounting"]);
    return;
  }

  if (pathname === "/api/payments") {
    requireRoles(user, ["admin", "accounting", "sale"]);
    return;
  }

  if (pathname.startsWith("/api/payments/")) {
    requireRoles(user, ["admin", "accounting"]);
    return;
  }

  if (pathname === "/api/customers" || pathname.startsWith("/api/customers/")) {
    if (method === "DELETE") requireRoles(user, ["admin"]);
    else requireRoles(user, ["admin", "sale"]);
    return;
  }

  if (pathname === "/api/orders") {
    requireRoles(user, ["admin", "sale"]);
    return;
  }

  if (/^\/api\/orders\/[^/]+$/.test(pathname)) {
    if (method === "DELETE") requireRoles(user, ["admin"]);
    else requireRoles(user, ["admin", "sale", "ops"]);
    return;
  }

  if (pathname.startsWith("/api/shipments")) {
    requireRoles(user, ["admin", "ops"]);
    return;
  }

  requireRoles(user, ["admin"]);
}

function assertOrderPatchAllowed(user, body) {
  if (user.role !== "ops") return;
  const allowed = new Set(["status", "shipping_cost"]);
  const forbidden = Object.keys(body || {}).filter((key) => !allowed.has(key));
  if (!forbidden.length) return;
  const error = new Error("Vận hành chỉ được cập nhật trạng thái và phí giao của deal.");
  error.statusCode = 403;
  throw error;
}

export {
  ROLES,
  assertOrderPatchAllowed,
  authenticateRequest,
  authorizeApiRequest,
  firebaseConfigStatus,
  isAuthRequired,
};
