const { test: base, expect } = require("@playwright/test");
const crypto = require("node:crypto");

const test = base.extend({
  crm: async ({ request }, use) => {
    const ids = [];
    const createCustomer = async (overrides = {}) => {
      const response = await request.post("/api/customers", { data: {
        full_name: "Khách thử địa chỉ", phone: `090${crypto.randomInt(1000000, 9999999)}`,
        address: "10 Nhà cũ", province: "Thành phố Hà Nội", district: "Quận Ba Đình", ward: "Phường Đội Cấn",
        channel: "Instagram", account: "@khachcu", ...overrides,
      } });
      expect(response.status()).toBe(201);
      const customer = await response.json();
      ids.push(customer.id);
      return customer;
    };
    const customer = await createCustomer();
    const delivery = { full_name: customer.full_name, phone: customer.phone, address: customer.address,
      province: customer.province, district: customer.district, ward: customer.ward, address_mode: "legacy" };
    const createOrder = async (overrides = {}) => {
      const response = await request.post("/api/orders", { data: {
        customer_id: customer.id, product_name: "Deal địa chỉ QA", price: 100000, ...overrides,
      } });
      expect(response.status()).toBe(201);
      return response.json();
    };
    await use({ customer, delivery, createCustomer, createOrder });
    // All IDs here belong to disposable fixtures on the isolated test server.
    for (const id of ids) await request.delete(`/api/customers/${id}`);
  },
});

const addressOnly = (delivery) => Object.fromEntries(["address", "province", "district", "ward", "address_mode"].map(key => [key, delivery[key]]));
const bootstrap = async (request) => (await request.get("/api/bootstrap")).json();

async function openCreate(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.nav-item[data-view="orders"]').click();
  await page.locator('[data-action="new-order"]').first().click();
  return page.locator("#orderForm");
}

async function chooseCustomer(page, customer) {
  await page.locator('[name="customer_phone"]').fill(customer.phone);
  await page.getByRole("option", { name: new RegExp(customer.full_name) }).click();
  await expect(page.locator('[data-selected-customer]')).toBeVisible();
}

async function fillProduct(form) {
  const row = form.locator(".product-item-row").first();
  await row.locator('[data-action="set-product-mode"][data-mode="custom"]').click();
  await row.locator('[data-field="product_name"]').fill("Sản phẩm QA địa chỉ");
  await row.locator('[data-field="unit_price"]').fill("100000");
}

test("API: địa chỉ riêng độc lập, cập nhật mặc định chỉ khi chọn; phiếu và CSV đúng địa chỉ", async ({ request, crm }) => {
  const first = await crm.createOrder({ delivery: { ...crm.delivery, address: "Văn phòng A" } });
  const second = await crm.createOrder({ delivery: { ...crm.delivery, address: "Văn phòng B", district: "", address_mode: "current" },
    update_customer_address: true, expected_customer_address: addressOnly(crm.delivery) });
  const after = await bootstrap(request);
  expect(after.customers.find(c => c.id === crm.customer.id).address).toBe("Văn phòng B");
  expect(after.orders.find(o => o.id === first.id).delivery.address).toBe("Văn phòng A");
  expect(after.orders.find(o => o.id === second.id).delivery.district).toBe("");
  const receipt = await (await request.get(`/api/receipts/${first.id}`)).text();
  expect(receipt).toContain("Văn phòng A");
  expect(receipt).not.toContain("Văn phòng B");
  const csv = await (await request.get("/api/export/orders.csv")).text();
  expect(csv.split("\n").find(line => line.includes(first.order_code))).toContain("Văn phòng A");
  expect(csv.split("\n").find(line => line.includes(second.order_code))).toContain("Văn phòng B");
  const update = await request.patch(`/api/customers/${crm.customer.id}`, { data: { address: "Nhà C" } });
  expect(update.ok()).toBeTruthy();
  const final = await bootstrap(request);
  expect(final.orders.find(o => o.id === first.id).delivery.address).toBe("Văn phòng A");
  expect(final.orders.find(o => o.id === second.id).delivery.address).toBe("Văn phòng B");
});

test("API: profile không đổi khi tạo/sửa deal lỗi, stale address không bị ghi đè", async ({ request, crm }) => {
  const order = await crm.createOrder();
  const body = { delivery: { ...crm.delivery, address: "Không được lưu" }, update_customer_address: true,
    expected_customer_address: addressOnly(crm.delivery), items: [{ quantity: 0, product_mode: "custom" }] };
  const failedCreate = await request.post("/api/orders", { data: { ...body, customer_id: crm.customer.id } });
  expect(failedCreate.status()).toBe(400);
  const failedEdit = await request.patch(`/api/orders/${order.id}`, { data: body });
  expect(failedEdit.status()).toBe(400);
  const unchanged = await bootstrap(request);
  expect(unchanged.customers.find(c => c.id === crm.customer.id).address).toBe(crm.customer.address);
  expect(unchanged.orders.find(o => o.id === order.id).delivery.address).toBe(crm.customer.address);
  await request.patch(`/api/customers/${crm.customer.id}`, { data: { address: "Một nhân viên khác vừa sửa" } });
  const conflict = await request.patch(`/api/orders/${order.id}`, { data: { ...body, items: undefined } });
  expect(conflict.status()).toBe(409);
  expect((await conflict.json()).code).toBe("customer-address-conflict");
});

test("API: trùng số +84 cần chọn khách; khách mới và request đồng thời không nhân đôi", async ({ request, crm }) => {
  const duplicate = await request.post("/api/orders", { data: { customer: { full_name: "Khác tên", phone: `+84${crm.customer.phone.slice(1)}` } } });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).code).toBe("customer-selection-required");
  const other = await crm.createCustomer({ full_name: "Hồ sơ cùng số", phone: crm.customer.phone });
  const selected = await crm.createOrder({ customer_id: other.id });
  expect(selected.customer_id).toBe(other.id);
  const newPhone = `091${crypto.randomInt(1000000, 9999999)}`;
  const payload = { customer: { full_name: "Khách mới đồng thời", phone: newPhone, address: "Nhà mới" }, price: 10000 };
  const responses = await Promise.all([request.post("/api/orders", { data: payload }), request.post("/api/orders", { data: payload })]);
  expect(responses.map(r => r.status()).sort()).toEqual([201, 409]);
  const after = await bootstrap(request);
  const created = after.customers.filter(c => c.phone === newPhone);
  expect(created).toHaveLength(1);
  expect(after.orders.filter(o => o.customer_id === created[0].id)).toHaveLength(1);
  await request.delete(`/api/customers/${created[0].id}`);
});

test("API: thay hồ sơ giữ địa chỉ hiện tại của deal cũ chưa có snapshot", async ({ request }) => {
  const raw = await (await request.get("/api/admin/export")).json();
  const legacy = raw.orders.find(o => !o.delivery);
  expect(legacy).toBeTruthy();
  const customer = raw.customers.find(c => c.id === legacy.customer_id);
  const response = await request.patch(`/api/customers/${customer.id}`, { data: { address: "Thay đổi hồ sơ QA" } });
  expect(response.ok()).toBeTruthy();
  const saved = await (await request.get("/api/admin/export")).json();
  expect(saved.orders.find(o => o.id === legacy.id).delivery.address).toBe(customer.address);
  expect(saved.customers.find(c => c.id === customer.id).address).toBe("Thay đổi hồ sơ QA");
  await request.patch(`/api/customers/${customer.id}`, { data: { address: customer.address } });
});

test("API: vận đơn lưu địa chỉ deal và khóa sửa sau khi tạo", async ({ request, crm }) => {
  const order = await crm.createOrder({ delivery: { ...crm.delivery, address: "Giao tới văn phòng", province: "Đà Nẵng" } });
  const quote = await request.post("/api/shipments/quote", { data: { order_id: order.id, province: "Hà Nội", weight: 320 } });
  const created = await request.post("/api/shipments/create", { data: { order_id: order.id, weight: 320 } });
  expect(created.status()).toBe(201);
  const shipment = await created.json();
  expect(shipment.delivery.address).toBe("Giao tới văn phòng");
  expect(shipment.delivery.province).toBe("Đà Nẵng");
  expect(shipment.fee).toBe((await quote.json()).fee);
  const patch = await request.patch(`/api/orders/${order.id}`, { data: { delivery: { ...order.delivery, address: "Khác" } } });
  expect(patch.status()).toBe(409);
  expect((await patch.json()).code).toBe("shipment-address-locked");
  expect((await request.patch(`/api/orders/${order.id}`, { data: { note: "Ghi chú vẫn sửa được" } })).ok()).toBeTruthy();
});

test("UI: chọn bằng bàn phím, tự điền, lưu địa chỉ riêng và không thêm khách trùng", async ({ page, request, crm }) => {
  const form = await openCreate(page);
  const phone = form.locator('[name="customer_phone"]');
  await phone.fill(`+84${crm.customer.phone.slice(1)}`);
  await expect(page.getByRole("option", { name: new RegExp(crm.customer.full_name) })).toBeVisible();
  await phone.press("ArrowDown");
  await phone.press("Enter");
  await expect(form.locator('[name="customer_full_name"]')).toHaveValue(crm.customer.full_name);
  await expect(form.locator('[name="customer_address"]')).toHaveValue(crm.customer.address);
  await expect(form.locator('[name="update_customer_address"]')).not.toBeChecked();
  await form.locator('[name="customer_address"]').fill("Văn phòng UI");
  await fillProduct(form);
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-action="save-order"]').click();
  await expect(form).toHaveCount(0);
  const after = await bootstrap(request);
  expect(after.customers.filter(c => c.phone === crm.customer.phone)).toHaveLength(1);
  expect(after.customers.find(c => c.id === crm.customer.id).address).toBe(crm.customer.address);
  const saved = after.orders.find(o => o.customer_id === crm.customer.id);
  expect(saved.delivery.address).toBe("Văn phòng UI");
  await page.locator(`[data-action="open-order"][data-order-id="${saved.id}"]`).first().click();
  await expect(page.locator(".order-delivery-detail")).toContainText("Văn phòng UI");
});

test("UI mobile: khách trùng số chọn đúng ID, đổi khách hỏi trước; hủy không ghi", async ({ page, request, crm }) => {
  const other = await crm.createCustomer({ full_name: "Khách trùng số B", phone: crm.customer.phone, address: "Nhà B" });
  await page.setViewportSize({ width: 375, height: 812 });
  const before = await (await request.get("/api/admin/export")).json();
  const form = await openCreate(page);
  await form.locator('[name="customer_phone"]').fill(crm.customer.phone);
  await expect(page.locator("#orderCustomerSuggestions [role=option]")).toHaveCount(2);
  await page.getByRole("option", { name: /Khách trùng số B/ }).click();
  await expect(form.locator('[name="customer_id"]')).toHaveValue(other.id);
  await form.locator('[name="customer_address"]').fill("Địa chỉ đang nhập");
  await form.locator('[data-change-customer]').click();
  await form.locator('[name="customer_phone"]').fill(crm.customer.phone);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("option", { name: new RegExp(crm.customer.full_name) }).click();
  await expect(form.locator('[name="customer_address"]')).toHaveValue("Địa chỉ đang nhập");
  const bounds = await page.locator(".modal").evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth }));
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  await page.screenshot({ path: "test-results/customer-delivery-mobile.png", fullPage: true });
  await page.locator('.modal [aria-label="Đóng"]').click();
  const after = await (await request.get("/api/admin/export")).json();
  expect(after.customers).toEqual(before.customers);
  expect(after.orders).toEqual(before.orders);
});

test("UI: cập nhật địa chỉ 2 cấp có chọn, lỗi lưu giữ form và không đổi hồ sơ", async ({ page, request, crm }) => {
  const form = await openCreate(page);
  await chooseCustomer(page, crm.customer);
  await form.locator('[name="customer_address"]').fill("Địa chỉ mới 2 cấp");
  await form.locator('[data-address-mode-toggle]').check();
  await form.locator('[name="update_customer_address"]').check();
  await expect(form.locator('[data-delivery-scope]')).toContainText("địa chỉ mặc định");
  await fillProduct(form);
  await page.route("**/api/orders", route => route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Lỗi thử nghiệm" }) }) : route.continue());
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-action="save-order"]').click();
  await expect(page.locator("#toastHost")).toContainText("Lỗi thử nghiệm");
  await expect(form).toBeVisible();
  await expect(form.locator('[name="customer_address"]')).toHaveValue("Địa chỉ mới 2 cấp");
  expect((await bootstrap(request)).customers.find(c => c.id === crm.customer.id).address).toBe(crm.customer.address);
  await page.unroute("**/api/orders");
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-action="save-order"]').click();
  await expect(form).toHaveCount(0);
  const after = await bootstrap(request);
  const customer = after.customers.find(c => c.id === crm.customer.id);
  expect(customer.address).toBe("Địa chỉ mới 2 cấp");
  expect(customer.address_mode).toBe("current");
  expect(customer.district).toBe("");
});

test("UI: deal có vận đơn khóa địa chỉ và giữ giá trị địa chỉ chưa có trong danh mục", async ({ page, crm }) => {
  const oldAddress = { ...crm.delivery, province: "Tỉnh lưu cũ", district: "Huyện lưu cũ", ward: "Xã lưu cũ" };
  const order = await crm.createOrder({ delivery: oldAddress });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.nav-item[data-view="orders"]').click();
  await page.locator(`[data-action="edit-orders"][data-id="${order.id}"]`).click();
  const form = page.locator("#orderEditForm");
  await expect(form.locator('[name="customer_province"]')).toHaveValue("Tỉnh lưu cũ");
  await expect(form.locator('[name="customer_district"]')).toHaveValue("Huyện lưu cũ");
  await expect(form.locator('[name="customer_ward"]')).toHaveValue("Xã lưu cũ");
  await page.locator('[data-action="save-order-edit"]').click();
  await expect(form).toHaveCount(0);
  const response = await page.request.post("/api/shipments/create", { data: { order_id: order.id } });
  expect(response.status()).toBe(201);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(`[data-action="edit-orders"][data-id="${order.id}"]`).click();
  await expect(form.locator('[name="customer_address"]')).toBeDisabled();
  await expect(form.locator('[data-change-customer]')).toBeDisabled();
  await expect(form.locator('[data-delivery-scope]')).toContainText("đã có vận đơn");
});

test("UI: sửa hồ sơ sang địa chỉ 2 cấp giữ nguyên địa chỉ các deal trước", async ({ page, request, crm }) => {
  const order = await crm.createOrder();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.nav-item[data-view="customers"]').click();
  await page.locator(`[data-action="edit-customers"][data-id="${crm.customer.id}"]`).click();
  const form = page.locator("#customerEditForm");
  await form.locator('[name="address"]').fill("Nhà mới từ hồ sơ khách");
  await form.locator('[data-address-mode-toggle]').check();
  await page.locator('[data-action="save-customer-edit"]').click();
  await expect(form).toHaveCount(0);
  const after = await bootstrap(request);
  expect(after.customers.find(c => c.id === crm.customer.id).address_mode).toBe("current");
  expect(after.customers.find(c => c.id === crm.customer.id).district).toBe("");
  expect(after.orders.find(o => o.id === order.id).delivery.address).toBe(crm.customer.address);
});

test("UI: khách được tạo đồng thời hiện gợi ý sau xung đột và giữ nội dung form", async ({ page, request, crm }) => {
  const form = await openCreate(page);
  const phone = `093${crypto.randomInt(1000000, 9999999)}`;
  await form.locator('[name="customer_phone"]').fill(phone);
  await form.locator('[name="customer_full_name"]').fill("Khách mới qua UI");
  await form.locator('[name="customer_address"]').fill("Nhà khách mới qua UI");
  await fillProduct(form);
  await expect(page.locator('[data-customer-lookup-status]')).toContainText("Chưa tìm thấy");
  // A second person creates this customer after the form was opened.
  const concurrent = await crm.createCustomer({ full_name: "Khách mới qua UI", phone });
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-action="save-order"]').click();
  await expect(page.locator("#toastHost")).toContainText("Số điện thoại đã có");
  await expect(form.locator('[name="customer_address"]')).toHaveValue("Nhà khách mới qua UI");
  expect((await bootstrap(request)).orders.filter(o => o.customer_id === concurrent.id)).toHaveLength(0);
  // The refreshed suggestion is now available without losing the rest of the deal.
  await form.locator('[name="customer_phone"]').focus();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("option", { name: /Khách mới qua UI/ }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-action="save-order"]').click();
  await expect(form).toHaveCount(0);
  const after = await bootstrap(request);
  expect(after.customers.filter(c => c.phone === phone)).toHaveLength(1);
  expect(after.orders.filter(o => o.customer_id === concurrent.id)).toHaveLength(1);
});

test("UI: tạo khách mới cùng deal lưu đúng địa chỉ", async ({ page, request }) => {
  const phone = `092${crypto.randomInt(1000000, 9999999)}`;
  try {
    const form = await openCreate(page);
    await form.locator('[name="customer_phone"]').fill(phone);
    await form.locator('[name="customer_full_name"]').fill("Khách hoàn toàn mới QA");
    await form.locator('[name="customer_address"]').fill("Địa chỉ khách mới QA");
    await fillProduct(form);
    page.once("dialog", dialog => dialog.accept());
    await page.locator('[data-action="save-order"]').click();
    await expect(form).toHaveCount(0);
    const after = await bootstrap(request);
    const customers = after.customers.filter(c => c.phone === phone);
    expect(customers).toHaveLength(1);
    const orders = after.orders.filter(o => o.customer_id === customers[0].id);
    expect(orders).toHaveLength(1);
    expect(orders[0].delivery.address).toBe("Địa chỉ khách mới QA");
  } finally {
    const after = await bootstrap(request);
    for (const customer of after.customers.filter(c => c.phone === phone)) {
      await request.delete(`/api/customers/${customer.id}`);
    }
  }
});

test("UI: sửa và xóa hàng loạt vẫn lưu đủ từng khách sau khi bật kiểm tra xung đột", async ({ page, request, crm }) => {
  const other = await crm.createCustomer({ full_name: "Khách QA hàng loạt" });
  const ids = [crm.customer.id, other.id];
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator('.nav-item[data-view="customers"]').click();
  for (const id of ids) await page.locator(`[data-action="toggle-select"][data-id="${id}"]`).check();
  await page.locator('[data-action="bulk-edit"]').click();
  await page.locator('#bulkEditForm [name="note"]').fill("Ghi chú QA hàng loạt");
  await page.locator('[data-action="save-bulk-edit"]').click();
  await expect(page.locator("#bulkEditForm")).toHaveCount(0);
  const after = await bootstrap(request);
  for (const id of ids) expect(after.customers.find(c => c.id === id).note).toBe("Ghi chú QA hàng loạt");
  for (const id of ids) await page.locator(`[data-action="toggle-select"][data-id="${id}"]`).check();
  page.once("dialog", dialog => dialog.accept());
  await page.locator('[data-action="bulk-delete"]').click();
  await expect(page.locator(`[data-action="toggle-select"][data-id="${other.id}"]`)).toHaveCount(0);
  const final = await bootstrap(request);
  expect(final.customers.filter(c => ids.includes(c.id))).toHaveLength(0);
  expect(final.customers.length).toBe(after.customers.length - 2);
});
