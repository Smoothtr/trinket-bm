import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOrderPatchAllowed,
  authorizeApiRequest,
  firebaseConfigStatus,
  isAuthRequired,
} from "../lib/auth.mjs";

function request(role, method = "GET") {
  return { method, user: { uid: `user-${role}`, role } };
}

function statusCode(fn) {
  try {
    fn();
    return 200;
  } catch (error) {
    return error.statusCode;
  }
}

test("local development keeps the existing no-login workflow", () => {
  const previous = { VERCEL: process.env.VERCEL, FIREBASE_AUTH_ENABLED: process.env.FIREBASE_AUTH_ENABLED, AUTH_DISABLED: process.env.AUTH_DISABLED };
  delete process.env.VERCEL;
  delete process.env.FIREBASE_AUTH_ENABLED;
  delete process.env.AUTH_DISABLED;
  assert.equal(isAuthRequired(), false);
  Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
});

test("Vercel cannot disable authentication with AUTH_DISABLED", () => {
  const previous = { VERCEL: process.env.VERCEL, AUTH_DISABLED: process.env.AUTH_DISABLED };
  process.env.VERCEL = "1";
  process.env.AUTH_DISABLED = "1";
  assert.equal(isAuthRequired(), true);
  Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
});

test("production configuration requires Firestore", () => {
  const previous = {
    VERCEL: process.env.VERCEL,
    DATA_BACKEND: process.env.DATA_BACKEND,
    FIREBASE_AUTH_ENABLED: process.env.FIREBASE_AUTH_ENABLED,
  };
  process.env.VERCEL = "1";
  process.env.FIREBASE_AUTH_ENABLED = "1";
  delete process.env.DATA_BACKEND;
  assert.ok(firebaseConfigStatus().missing.includes("DATA_BACKEND=firestore"));
  Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
});

test("Vercel accepts request-scoped OIDC without an environment token", () => {
  const keys = [
    "VERCEL",
    "VERCEL_OIDC_TOKEN",
    "FIREBASE_AUTH_ENABLED",
    "DATA_BACKEND",
    "FIREBASE_WEB_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_STORAGE_BUCKET",
    "FIREBASE_WEB_APP_ID",
    "GCP_PROJECT_NUMBER",
    "GCP_SERVICE_ACCOUNT_EMAIL",
    "GCP_WORKLOAD_IDENTITY_POOL_ID",
    "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.VERCEL = "1";
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.FIREBASE_AUTH_ENABLED = "1";
    process.env.DATA_BACKEND = "firestore";
    process.env.FIREBASE_WEB_API_KEY = "test-api-key";
    process.env.FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
    process.env.FIREBASE_PROJECT_ID = "test-project";
    process.env.FIREBASE_STORAGE_BUCKET = "test.firebasestorage.app";
    process.env.FIREBASE_WEB_APP_ID = "1:test:web:test";
    process.env.GCP_PROJECT_NUMBER = "123456789";
    process.env.GCP_SERVICE_ACCOUNT_EMAIL = "vercel@test-project.iam.gserviceaccount.com";
    process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel";
    process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";

    assert.deepEqual(firebaseConfigStatus().missing, []);
  } finally {
    Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  }
});

test("all assigned roles may read bootstrap, but only admin may export raw data", () => {
  for (const role of ["admin", "sale", "ops", "accounting"]) {
    assert.equal(statusCode(() => authorizeApiRequest(request(role), "/api/bootstrap")), 200);
  }
  assert.equal(statusCode(() => authorizeApiRequest(request("sale"), "/api/admin/export")), 403);
  assert.equal(statusCode(() => authorizeApiRequest(request("admin"), "/api/admin/export")), 200);
});

test("write permissions match the four existing roles", () => {
  assert.equal(statusCode(() => authorizeApiRequest(request("sale", "POST"), "/api/orders")), 200);
  assert.equal(statusCode(() => authorizeApiRequest(request("sale", "POST"), "/api/expenses")), 403);
  assert.equal(statusCode(() => authorizeApiRequest(request("accounting", "POST"), "/api/expenses")), 200);
  assert.equal(statusCode(() => authorizeApiRequest(request("accounting", "POST"), "/api/products")), 403);
  assert.equal(statusCode(() => authorizeApiRequest(request("ops", "POST"), "/api/products")), 200);
  assert.equal(statusCode(() => authorizeApiRequest(request("ops", "POST"), "/api/shipments/create")), 200);
  assert.equal(statusCode(() => authorizeApiRequest(request("sale", "POST"), "/api/shipments/create")), 403);
});

test("ops may update order progress but not commercial fields", () => {
  assert.doesNotThrow(() => assertOrderPatchAllowed(request("ops").user, { status: "san_xuat", shipping_cost: 30000 }));
  assert.equal(statusCode(() => assertOrderPatchAllowed(request("ops").user, { price: 2500000 })), 403);
  assert.doesNotThrow(() => assertOrderPatchAllowed(request("admin").user, { price: 2500000 }));
});
