const { test, expect } = require("@playwright/test");

test("financial APIs accept negative adjustments while calendar validation stays strict", async ({ request }) => {
  const baseUrl = process.env.BASE_URL || "http://localhost:4173";
  const bootstrap = await (await request.get(`${baseUrl}/api/bootstrap`)).json();
  const order = bootstrap.orders[0];
  expect(order).toBeTruthy();

  const negativePrice = await request.patch(`${baseUrl}/api/orders/${order.id}`, { data: { price: -1 } });
  expect(negativePrice.status()).toBe(200);

  const invalidDate = await request.patch(`${baseUrl}/api/orders/${order.id}`, { data: { due_date: "2026-02-31" } });
  expect(invalidDate.status()).toBe(400);

  const negativePayment = await request.post(`${baseUrl}/api/payments`, {
    data: { order_id: order.id, amount: -100_000, type: "coc" },
  });
  expect(negativePayment.status()).toBe(201);
  const negativePaymentBody = await negativePayment.json();

  const zeroPayment = await request.post(`${baseUrl}/api/payments`, {
    data: { order_id: order.id, amount: 0, type: "coc" },
  });
  expect(zeroPayment.status()).toBe(400);

  const negativeExpense = await request.post(`${baseUrl}/api/expenses`, {
    data: { date: "2026-07-28", category: "Khác", description: "Điều chỉnh âm", amount: -100_000 },
  });
  expect(negativeExpense.status()).toBe(201);
  const negativeExpenseBody = await negativeExpense.json();

  const after = await (await request.get(`${baseUrl}/api/bootstrap`)).json();
  expect(after.orders.find((item) => item.id === order.id).price).toBe(-1);
  expect(after.orders.find((item) => item.id === order.id).payments.some((payment) => payment.amount === -100_000)).toBeTruthy();
  expect(after.expenses.some((expense) => expense.amount === -100_000)).toBeTruthy();

  expect((await request.patch(`${baseUrl}/api/orders/${order.id}`, { data: { price: order.price } })).ok()).toBeTruthy();
  expect((await request.delete(`${baseUrl}/api/payments/${negativePaymentBody.id}`)).ok()).toBeTruthy();
  expect((await request.delete(`${baseUrl}/api/expenses/${negativeExpenseBody.id}`)).ok()).toBeTruthy();
});

test("deal CSV exports CRM, assignment and product specification fields", async ({ request }) => {
  const baseUrl = process.env.BASE_URL || "http://localhost:4173";
  const response = await request.get(`${baseUrl}/api/export/orders.csv`);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("text/csv");
  const csv = await response.text();

  for (const header of [
    "Địa chỉ",
    "Kênh",
    "Account",
    "Người phụ trách",
    "Ngày đặt",
    "Số lượng SP",
    "Size",
    "Chất liệu",
    "Đá / charm",
  ]) {
    expect(csv).toContain(header);
  }
  expect(csv).toContain("Nguyễn Minh Anh");
  expect(csv).toContain("Instagram");
});

test("receipt print view omits browser hints and browser header-footer margins", async ({ request }) => {
  const baseUrl = process.env.BASE_URL || "http://localhost:4173";
  const logoResponse = await request.get(`${baseUrl}/trinket-logo.png`);
  expect(logoResponse.status()).toBe(200);
  expect(logoResponse.headers()["content-type"]).toContain("image/png");
  expect((await logoResponse.body()).length).toBeGreaterThan(10_000);

  const bootstrap = await (await request.get(`${baseUrl}/api/bootstrap`)).json();
  const order = bootstrap.orders[0];
  expect(order).toBeTruthy();

  const response = await request.get(`${baseUrl}/api/receipts/${order.id}?lang=en`);
  expect(response.status()).toBe(200);
  const receiptHtml = await response.text();

  expect(receiptHtml).not.toContain("This is a browser print view");
  expect(receiptHtml).not.toContain('class="note"');
  expect(receiptHtml).not.toContain('<div class="logo">Trinket</div>');
  expect(receiptHtml).toContain('<img class="logo" src="data:image/png;base64,');
  expect(receiptHtml).toContain('alt="Trinket"');
  expect(receiptHtml).toContain('data-receipt-line="shipping"');
  expect(receiptHtml).toContain('data-receipt-line="tax"');
  expect(receiptHtml).toContain("@page { size: A4; margin: 0; }");
  expect(receiptHtml).toContain("min-height: 297mm");
});

test("quote v2 keeps product totals, shipping, tax, invoice and receivable in sync", async ({ request }) => {
  const baseUrl = process.env.BASE_URL || "http://localhost:4173";
  const bootstrap = await (await request.get(`${baseUrl}/api/bootstrap`)).json();
  const customer = bootstrap.customers[0];
  expect(customer).toBeTruthy();

  const createdResponse = await request.post(`${baseUrl}/api/orders`, {
    data: {
      customer_id: customer.id,
      status: "tu_van",
      items: [{
        id: `itm_quote_${Date.now()}`,
        product_mode: "custom",
        product_name: "Sản phẩm kiểm thử báo giá",
        product_type: "Other",
        quantity: 2,
        unit_price: 1_000_000,
        unit_cost: 400_000,
      }],
      quote: {
        version: 2,
        adjustment: -100_000,
        shipping_fee: 30_000,
        shipping_payer: "customer",
        tax_rate: 10,
        tax_inclusion: "exclusive",
        tax_base: "products",
      },
      shipping_cost: 40_000,
      pricing: { profit_rate: 30 },
    },
  });
  expect(createdResponse.status()).toBe(201);
  const order = await createdResponse.json();

  try {
    expect(order.item_subtotal).toBe(2_000_000);
    expect(order.price_adjustment).toBe(-100_000);
    expect(order.price).toBe(1_900_000);
    expect(order.shipping_fee).toBe(30_000);
    expect(order.tax_amount).toBe(190_000);
    expect(order.invoice_total).toBe(2_120_000);
    expect(order.balance_due).toBe(2_120_000);

    const inclusiveResponse = await request.patch(`${baseUrl}/api/orders/${order.id}`, {
      data: {
        quote: {
          ...order.quote,
          version: 2,
          tax_inclusion: "inclusive",
          tax_base: "products_shipping",
        },
      },
    });
    expect(inclusiveResponse.ok()).toBeTruthy();
    const inclusiveOrder = await inclusiveResponse.json();
    expect(inclusiveOrder.tax_amount).toBe(175_455);
    expect(inclusiveOrder.invoice_total).toBe(1_930_000);

    const receipt = await (await request.get(`${baseUrl}/api/receipts/${order.id}?lang=vi`)).text();
    expect(receipt).toContain("Thuế đã gồm trong giá");
    expect(receipt).toContain("1.930.000");
  } finally {
    await request.delete(`${baseUrl}/api/orders/${order.id}`);
  }
});
