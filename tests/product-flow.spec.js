const { test, expect } = require("@playwright/test");

test("ready-made and custom deal flows preserve cost snapshots and inventory", async ({ request }) => {
  const baseUrl = process.env.BASE_URL || "http://localhost:4173";
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  let productId = "";
  const orderIds = [];

  const call = (path, options = {}) => request.fetch(`${baseUrl}${path}`, options);

  try {
    const bootstrapResponse = await call("/api/bootstrap");
    expect(bootstrapResponse.ok()).toBeTruthy();
    const bootstrap = await bootstrapResponse.json();
    const customerId = bootstrap.customers[0]?.id;
    expect(customerId).toBeTruthy();

    const productResponse = await call("/api/products", {
      method: "POST",
      data: {
        sku: `PW-${suffix}`,
        name: "Playwright ready-made product",
        type: "Ring",
        default_price: 750000,
        default_cost: 200000,
        status: "active",
        track_inventory: true,
        low_stock_threshold: 1,
        initial_stock: 5,
      },
    });
    expect(productResponse.status()).toBe(201);
    const product = await productResponse.json();
    productId = product.id;
    expect(product.on_hand).toBe(5);
    expect(product.available).toBe(5);

    const readyOrderResponse = await call("/api/orders", {
      method: "POST",
      data: {
        customer_id: customerId,
        status: "dat_nguon",
        date_order: "2026-07-17",
        due_date: "2026-07-31",
        price: 1500000,
        items: [{
          product_id: productId,
          product_mode: "catalog",
          product_sku: product.sku,
          product_type: product.type,
          product_name: product.name,
          quantity: 2,
          unit_price: 750000,
          unit_cost: 200000,
        }],
      },
    });
    expect(readyOrderResponse.status()).toBe(201);
    const readyOrder = await readyOrderResponse.json();
    orderIds.push(readyOrder.id);
    expect(readyOrder.item_cost).toBe(400000);
    expect(readyOrder.items[0].unit_cost).toBe(200000);

    let current = await (await call("/api/bootstrap")).json();
    let currentProduct = current.products.find((item) => item.id === productId);
    expect(currentProduct.on_hand).toBe(5);
    expect(currentProduct.reserved).toBe(2);
    expect(currentProduct.available).toBe(3);

    const completedResponse = await call(`/api/orders/${readyOrder.id}`, {
      method: "PATCH",
      data: { status: "hoan_tat" },
    });
    expect(completedResponse.ok()).toBeTruthy();
    current = await (await call("/api/bootstrap")).json();
    currentProduct = current.products.find((item) => item.id === productId);
    expect(currentProduct.on_hand).toBe(3);
    expect(currentProduct.reserved).toBe(0);
    expect(currentProduct.available).toBe(3);

    const canceledResponse = await call(`/api/orders/${readyOrder.id}`, {
      method: "PATCH",
      data: { status: "huy_hoan" },
    });
    expect(canceledResponse.ok()).toBeTruthy();
    current = await (await call("/api/bootstrap")).json();
    currentProduct = current.products.find((item) => item.id === productId);
    expect(currentProduct.on_hand).toBe(5);
    expect(currentProduct.reserved).toBe(0);

    const customOrderResponse = await call("/api/orders", {
      method: "POST",
      data: {
        customer_id: customerId,
        status: "tu_van",
        date_order: "2026-07-17",
        due_date: "2026-08-07",
        price: 980000,
        items: [{
          product_id: "",
          product_mode: "custom",
          product_type: "Bracelet",
          product_name: "Playwright custom product",
          quantity: 1,
          unit_price: 980000,
          unit_cost: 0,
          specs: { material: "Bạc 925", stone: "Zircon", weight: "" },
        }],
        sourcing_lines: [{ material: "Bạc 925 và gia công", cost: 320000 }],
      },
    });
    expect(customOrderResponse.status()).toBe(201);
    const customOrder = await customOrderResponse.json();
    orderIds.push(customOrder.id);
    expect(customOrder.items[0].product_mode).toBe("custom");
    expect(customOrder.items[0].product_id).toBe("");
    expect(customOrder.item_cost).toBe(0);
    expect(customOrder.source_cost).toBe(320000);

    current = await (await call("/api/bootstrap")).json();
    currentProduct = current.products.find((item) => item.id === productId);
    expect(currentProduct.on_hand).toBe(5);
    expect(currentProduct.reserved).toBe(0);
  } finally {
    for (const orderId of orderIds.reverse()) {
      await call(`/api/orders/${orderId}`, { method: "DELETE" });
    }
    if (productId) await call(`/api/products/${productId}`, { method: "DELETE" });
  }
});
