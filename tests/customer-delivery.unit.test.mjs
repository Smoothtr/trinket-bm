import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import customerPhone from "../public/customer-phone.js";
import {
  ADDRESS_FIELDS, normalizePhone, deliveryFromCustomer, orderDelivery, resolveOrderCustomer,
  applyCustomerPatch, prepareOrderDelivery, validateDelivery,
} from "../lib/customer-delivery.mjs";
import { assertOrderPatchAllowed } from "../lib/auth.mjs";
import { createStore } from "../lib/store.mjs";

function fixture() {
  return {
    customers: [{ id: "c1", full_name: "Khách cũ", phone: "0909 123 456", address: "Nhà cũ", province: "Hà Nội", district: "Ba Đình", ward: "Đội Cấn", channel: "Instagram" }],
    orders: [{ id: "o1", customer_id: "c1" }, { id: "o2", customer_id: "c1" }],
    shipments: [],
  };
}

test("SĐT Việt Nam được chuẩn hóa, số quốc tế không bị đổi quốc gia", () => {
  for (const phone of ["0909 123 456", "+84 909-123-456", "84909123456", "0084909123456", "(0909).123.456"]) assert.equal(normalizePhone(phone), "0909123456");
  assert.equal(normalizePhone("+1 (415) 555-2671"), "+14155552671");
  assert.notEqual(normalizePhone("+84 123"), "0123");
});

test("gợi ý cần 3 chữ số, giới hạn 5 và ưu tiên khớp hoàn toàn", () => {
  const customers = Array.from({ length: 8 }, (_, index) => ({ id: String(index), full_name: `Khách ${index}`, phone: `0909123456${index}` }));
  customers.push({ id: "exact", full_name: "Z", phone: "+84909123456" });
  assert.deepEqual(customerPhone.findCustomers(customers, "09"), []);
  assert.equal(customerPhone.findCustomers(customers, "090").length, 5);
  assert.equal(customerPhone.findCustomers(customers, "0909123456")[0].id, "exact");
});

test("trùng SĐT cần chọn ID rõ ràng, không tự chọn hoặc gộp khách", () => {
  const data = fixture();
  data.customers.push({ ...data.customers[0], id: "c2" });
  assert.throws(() => resolveOrderCustomer(data, { customer: { full_name: "Khác", phone: "+84909123456" } }), { code: "customer-selection-required" });
  assert.equal(resolveOrderCustomer(data, { customer_id: "c2" }).id, "c2");
  assert.throws(() => resolveOrderCustomer(data, { customer_id: "deleted" }), { code: "customer-missing" });
});

test("đọc deal cũ không ghi dữ liệu, đổi hồ sơ giữ địa chỉ cũ cho mọi deal liên quan", () => {
  const data = fixture();
  const previous = orderDelivery(data.orders[0], data);
  assert.equal(data.orders[0].delivery, undefined);
  assert.deepEqual(applyCustomerPatch(data, data.customers[0], { note: "Chỉ ghi chú", channel: "Khác" }), []);
  assert.equal(data.orders[0].delivery, undefined);
  const preserved = applyCustomerPatch(data, data.customers[0], { address: "Nhà mới", full_name: "Tên mới" });
  assert.deepEqual(preserved, ["o1", "o2"]);
  for (const order of data.orders) assert.deepEqual(order.delivery, previous);
  assert.equal(data.customers[0].address, "Nhà mới");
  data.orders[0].delivery.address = "Văn phòng";
  applyCustomerPatch(data, data.customers[0], { address: "Nhà lần ba" });
  assert.equal(data.orders[0].delivery.address, "Văn phòng");
  assert.equal(data.orders[1].delivery.address, "Nhà cũ");
});

test("đổi địa chỉ deal độc lập và bắt buộc xác nhận phiên bản địa chỉ hồ sơ", () => {
  const data = fixture();
  const customer = data.customers[0];
  const delivery = { ...deliveryFromCustomer(customer), address: "Văn phòng" };
  assert.equal(prepareOrderDelivery(data, { delivery }, customer, data.orders[0]).address, "Văn phòng");
  assert.equal(customer.address, "Nhà cũ");
  const expected = Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, deliveryFromCustomer(customer)[key]]));
  assert.equal(prepareOrderDelivery(data, { delivery, update_customer_address: true, expected_customer_address: expected }, customer).address, "Văn phòng");
  customer.address = "Địa chỉ do nhân viên khác sửa";
  assert.throws(() => prepareOrderDelivery(data, { delivery, update_customer_address: true, expected_customer_address: expected }, customer), { code: "customer-address-conflict" });
});

test("địa chỉ 2 cấp không giữ quận/huyện; dữ liệu quá dài hoặc thiếu cấu trúc bị chặn", () => {
  const current = { ...deliveryFromCustomer(fixture().customers[0]), address_mode: "current", district: "" };
  assert.equal(validateDelivery(current).address_mode, "current");
  assert.throws(() => validateDelivery({ ...current, district: "Ba Đình" }), { statusCode: 400 });
  assert.throws(() => validateDelivery({ address: "abc" }), { statusCode: 400 });
  assert.throws(() => validateDelivery({ ...current, address: "a".repeat(501) }), { statusCode: 400 });
});

test("vận đơn khóa đổi khách/địa chỉ nhưng vẫn cho phép lưu dữ liệu deal khác", () => {
  const data = fixture();
  data.shipments.push({ id: "s1", order_id: "o1" });
  const customer = data.customers[0];
  const delivery = orderDelivery(data.orders[0], data);
  assert.deepEqual(prepareOrderDelivery(data, { delivery }, customer, data.orders[0]), delivery);
  assert.throws(() => prepareOrderDelivery(data, { delivery: { ...delivery, address: "Nơi khác" } }, customer, data.orders[0]), { code: "shipment-address-locked" });
  assert.throws(() => prepareOrderDelivery(data, {}, { ...customer, id: "c2" }, data.orders[0]), { code: "shipment-address-locked" });
  assert.throws(() => assertOrderPatchAllowed({ role: "ops" }, { delivery }), { statusCode: 403 });
  assert.throws(() => assertOrderPatchAllowed({ role: "ops" }, { update_customer_address: true }), { statusCode: 403 });
});

test("ghi JSON từ phiên cũ bị từ chối, không mất thay đổi của nhân viên khác", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trinket-store-conflict-"));
  const seedPath = path.join(directory, "seed.json");
  const storePath = path.join(directory, "store.json");
  fs.writeFileSync(seedPath, JSON.stringify(fixture()));
  const store = createStore({ seedPath, storePath });
  const first = await store.read();
  const stale = await store.read();
  first.customers[0].address = "Lưu trước";
  await store.write(first);
  stale.customers[0].address = "Ghi đè từ phiên cũ";
  await assert.rejects(store.write(stale), { statusCode: 409 });
  assert.equal((await store.read()).customers[0].address, "Lưu trước");
  // Delete only the two fixture files created by this test, never user data.
  fs.unlinkSync(storePath);
  fs.unlinkSync(seedPath);
  fs.rmdirSync(directory);
});
