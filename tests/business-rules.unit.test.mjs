import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBootstrapPayload,
  calculateOrderQuote,
  getOrderCsv,
  isValidIsoDate,
  normalizeData,
  parseRequestMoney,
  protectOrderItemCosts,
} from "../server.mjs";

function fixtureData() {
  return normalizeData({
    schema_version: 4,
    customers: [{
      id: "cus_test",
      full_name: "Khách CSV",
      phone: "0909123456",
      address: "12 Nguyễn Huệ",
      channel: "Instagram",
      account: "@khachcsv",
      province: "Hồ Chí Minh",
      district: "Quận 1",
      ward: "Bến Nghé",
      note: "",
      created_at: "2026-07-01T00:00:00.000Z",
    }],
    vendors: [{ id: "ven_test", name: "NCC Test" }],
    products: [{
      id: "prd_test",
      sku: "CSV-001",
      name: "Nhẫn CSV",
      type: "Ring",
      default_price: 2_500_000,
      default_cost: 1_000_000,
      status: "active",
    }],
    inventory_movements: [{
      id: "mov_test",
      product_id: "prd_test",
      quantity: 2,
      type: "opening",
      reason: "Tồn đầu kỳ",
      source_type: "manual",
      source_id: "prd_test",
      created_at: "2026-07-01T00:00:00.000Z",
      created_by: "Admin",
    }],
    orders: [{
      id: "ord_test",
      order_code: "TRK-CSV-001",
      customer_id: "cus_test",
      status: "tu_van",
      price: 2_500_000,
      date_order: "2026-07-28",
      due_date: "2026-08-03",
      shipping_cost: 30_000,
      assignee: "Linh",
      request: "Gói quà",
      note: "Khách cần gấp",
      pricing: { profit_rate: 20, tax_rate: 0 },
      items: [{
        id: "itm_test",
        product_id: "prd_test",
        product_mode: "catalog",
        product_sku: "CSV-001",
        product_type: "Ring",
        product_name: "Nhẫn CSV",
        quantity: 2,
        unit_price: 1_250_000,
        unit_cost: 500_000,
        size: "12",
        specs: { material: "Bạc 925", stone: "Zircon", weight: "" },
      }],
    }],
    order_sourcing_lines: [{
      id: "src_test",
      order_id: "ord_test",
      vendor_id: "ven_test",
      material: "Gia công",
      cost: 100_000,
      status: "Dự kiến",
    }],
    payments: [{
      id: "pay_test",
      order_id: "ord_test",
      amount: 500_000,
      type: "coc",
      method: "Chuyển khoản",
      paid_at: "2026-07-28T00:00:00.000Z",
    }],
    shipments: [],
    expenses: [{
      id: "exp_test",
      date: "2026-07-28",
      category: "Vận hành",
      description: "Test",
      amount: 100_000,
    }],
    gold_prices: [],
    market_price_snapshots: [],
    users: [{ uid: "user_test", email: "secret@example.com", role: "admin" }],
    audit_logs: [{ id: "audit_test", action: "update", entity: "order" }],
    settings: {},
  });
}

test("request money validation accepts negative adjustments but rejects non-numeric values", () => {
  assert.equal(parseRequestMoney("2.500.000".replace(/\./g, ""), "Giá deal"), 2_500_000);
  assert.equal(parseRequestMoney(0, "Giá deal"), 0);
  assert.equal(parseRequestMoney(-1, "Giá deal"), -1);
  assert.throws(() => parseRequestMoney("abc", "Giá deal"), /không hợp lệ/i);
  assert.throws(() => parseRequestMoney(0, "Thanh toán", { nonZero: true }), /khác 0/i);
});

test("quote v2 calculates editable tax, shipping and inclusive prices consistently", () => {
  const baseOrder = {
    price: 0,
    quote: {
      version: 2,
      adjustment: 0,
      shipping_fee: 30_000,
      shipping_payer: "customer",
      tax_rate: 10,
      tax_inclusion: "exclusive",
      tax_base: "products",
    },
  };

  const productsOnly = calculateOrderQuote(baseOrder, 2_000_000, 40_000);
  assert.equal(productsOnly.product_price, 2_000_000);
  assert.equal(productsOnly.tax_amount, 200_000);
  assert.equal(productsOnly.invoice_total, 2_230_000);
  assert.equal(productsOnly.net_revenue, 2_030_000);

  const productsAndShipping = calculateOrderQuote({
    ...baseOrder,
    quote: { ...baseOrder.quote, tax_base: "products_shipping" },
  }, 2_000_000, 40_000);
  assert.equal(productsAndShipping.tax_amount, 203_000);
  assert.equal(productsAndShipping.invoice_total, 2_233_000);

  const inclusive = calculateOrderQuote({
    ...baseOrder,
    quote: { ...baseOrder.quote, tax_inclusion: "inclusive" },
  }, 2_000_000, 40_000);
  assert.equal(inclusive.tax_amount, 181_818);
  assert.equal(inclusive.invoice_total, 2_030_000);

  const shopShipping = calculateOrderQuote({
    ...baseOrder,
    quote: { ...baseOrder.quote, shipping_payer: "shop" },
  }, 2_000_000, 40_000);
  assert.equal(shopShipping.shipping_fee, 0);
  assert.equal(shopShipping.invoice_total, 2_200_000);
});

test("Sale may set custom item cost while catalog cost remains server-controlled", () => {
  const data = fixtureData();
  const catalogItem = data.orders[0].items[0];
  const protectedCatalog = protectOrderItemCosts(
    [{ ...catalogItem, unit_cost: -999_000 }],
    data.orders[0],
    data,
    "sale",
  );
  assert.equal(protectedCatalog[0].unit_cost, 500_000);

  const protectedCustom = protectOrderItemCosts(
    [{
      ...catalogItem,
      id: "itm_custom",
      product_id: "",
      product_mode: "custom",
      unit_cost: -250_000,
    }],
    data.orders[0],
    data,
    "sale",
  );
  assert.equal(protectedCustom[0].unit_cost, -250_000);
});

test("calendar validation rejects impossible dates", () => {
  assert.equal(isValidIsoDate("2026-02-28"), true);
  assert.equal(isValidIsoDate("2024-02-29"), true);
  assert.equal(isValidIsoDate("2026-02-29"), false);
  assert.equal(isValidIsoDate("2026-02-31"), false);
  assert.equal(isValidIsoDate("2026-13-01"), false);
});

test("bootstrap payload removes financial data outside each role boundary", () => {
  const data = fixtureData();
  const admin = buildBootstrapPayload(data, "admin");
  assert.equal(admin.users, undefined);
  assert.equal(admin.audit_logs.length, 1);
  assert.equal(admin.orders[0].profit, 1_400_000);
  assert.equal(admin.orders[0].invoice_total, 2_530_000);
  assert.equal(admin.orders[0].balance_due, 2_030_000);

  const sale = buildBootstrapPayload(data, "sale");
  assert.deepEqual(sale.audit_logs, []);
  assert.deepEqual(sale.expenses, []);
  assert.deepEqual(sale.inventory_movements, []);
  assert.deepEqual(sale.order_sourcing_lines, []);
  assert.deepEqual(sale.gold_prices, []);
  assert.deepEqual(sale.market_price_snapshots, []);
  assert.equal(sale.market_price_cache, undefined);
  assert.equal(sale.settings.material_catalog[0].default_price, undefined);
  assert.equal(sale.products[0].default_cost, undefined);
  assert.equal(sale.orders[0].total_cost, undefined);
  assert.equal(sale.orders[0].profit, undefined);
  assert.equal(sale.orders[0].items[0].unit_cost, undefined);
  assert.deepEqual(sale.orders[0].sourcing_lines, []);

  const customData = fixtureData();
  customData.orders[0].items[0].product_id = "";
  customData.orders[0].items[0].product_mode = "custom";
  customData.orders[0].items[0].unit_cost = -250_000;
  assert.equal(buildBootstrapPayload(customData, "sale").orders[0].items[0].unit_cost, -250_000);

  const ops = buildBootstrapPayload(data, "ops");
  assert.equal(ops.orders[0].total_cost, 1_130_000);
  assert.equal(ops.orders[0].profit, undefined);
  assert.deepEqual(ops.expenses, []);
  assert.deepEqual(ops.audit_logs, []);

  const accounting = buildBootstrapPayload(data, "accounting");
  assert.equal(accounting.orders[0].profit, 1_400_000);
  assert.equal(accounting.expenses.length, 1);
  assert.deepEqual(accounting.inventory_movements, []);
  assert.deepEqual(accounting.audit_logs, []);
});

test("deal CSV contains the requested CRM and product detail columns", () => {
  const csv = getOrderCsv(fixtureData(), "admin");
  for (const header of [
    "Mã đơn",
    "Khách",
    "SĐT",
    "Địa chỉ",
    "Kênh",
    "Account",
    "Trạng thái",
    "Người phụ trách",
    "Ngày đặt",
    "Due date",
    "Số lượng SP",
    "Sản phẩm chi tiết",
    "Size",
    "Chất liệu",
    "Đá / charm",
    "Yêu cầu",
    "Ghi chú",
  ]) {
    assert.ok(csv.includes(header), `Missing CSV header: ${header}`);
  }
  for (const value of [
    "12 Nguyễn Huệ",
    "Instagram",
    "@khachcsv",
    "Linh",
    "28/07/2026",
    "Nhẫn CSV x2",
    "Bạc 925",
    "Zircon",
    "Gói quà",
    "Khách cần gấp",
  ]) {
    assert.ok(csv.includes(value), `Missing CSV value: ${value}`);
  }
});
