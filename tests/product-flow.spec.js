const { test, expect } = require("@playwright/test");

test("ready-made and custom deal flows preserve cost snapshots and inventory", async ({ request }) => {
  const baseUrl = process.env.BASE_URL || "http://localhost:4173";
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const requestedProductId = `prd_${suffix}`;
  let productId = "";
  const orderIds = [];

  const call = (path, options = {}) => request.fetch(`${baseUrl}${path}`, options);

  try {
    const bootstrapResponse = await call("/api/bootstrap");
    expect(bootstrapResponse.ok()).toBeTruthy();
    const bootstrap = await bootstrapResponse.json();
    const customerId = bootstrap.customers[0]?.id;
    expect(customerId).toBeTruthy();

    const invalidImageResponse = await call("/api/orders", {
      method: "POST",
      data: {
        id: `ord_bad_${suffix}`,
        customer_id: customerId,
        items: [{
          id: `itm_bad_${suffix}`,
          product_mode: "custom",
          product_name: "Invalid image path",
          quantity: 1,
          unit_price: 100000,
          unit_cost: 50000,
          image: {
            storage_path: "deal-items/wrong/order/image.png",
            original_name: "image.png",
            content_type: "image/png",
            size: 1024,
          },
        }],
      },
    });
    expect(invalidImageResponse.status()).toBe(400);

    const invalidCatalogImageResponse = await call("/api/products", {
      method: "POST",
      data: {
        id: requestedProductId,
        sku: `PW-BAD-${suffix}`,
        name: "Invalid catalog image path",
        image: {
          storage_path: `deal-items/${requestedProductId}/cover.webp`,
          original_name: "cover.webp",
          content_type: "image/webp",
          size: 2048,
        },
      },
    });
    expect(invalidCatalogImageResponse.status()).toBe(400);

    const productResponse = await call("/api/products", {
      method: "POST",
      data: {
        id: requestedProductId,
        sku: `PW-${suffix}`,
        name: "Playwright ready-made product",
        type: "Ring",
        default_price: 750000,
        default_cost: 200000,
        status: "active",
        track_inventory: true,
        low_stock_threshold: 1,
        initial_stock: 5,
        image: {
          storage_path: `product-images/${requestedProductId}/cover.webp`,
          original_name: "cover.webp",
          content_type: "image/webp",
          size: 2048,
        },
      },
    });
    expect(productResponse.status()).toBe(201);
    const product = await productResponse.json();
    productId = product.id;
    expect(product.id).toBe(requestedProductId);
    expect(product.image.storage_path).toBe(`product-images/${requestedProductId}/cover.webp`);
    expect(product.on_hand).toBe(5);
    expect(product.available).toBe(5);

    const removedCatalogImageResponse = await call(`/api/products/${productId}`, {
      method: "PATCH",
      data: { image: null },
    });
    expect(removedCatalogImageResponse.ok()).toBeTruthy();
    expect((await removedCatalogImageResponse.json()).image).toBeNull();

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
        id: `ord_${suffix}`,
        customer_id: customerId,
        status: "tu_van",
        date_order: "2026-07-17",
        due_date: "2026-08-07",
        price: 3718000,
        shipping_cost: 100000,
        pricing: { profit_rate: 30, tax_rate: 10 },
        items: [{
          id: `itm_${suffix}`,
          product_id: "",
          product_mode: "custom",
          product_type: "Bracelet",
          product_name: "Playwright custom product",
          quantity: 2,
          unit_price: 1859000,
          unit_cost: 1000000,
          image: {
            storage_path: `deal-items/ord_${suffix}/itm_${suffix}/cover.webp`,
            original_name: "cover.webp",
            content_type: "image/webp",
            size: 2048,
          },
          specs: { material: "Bạc 925", stone: "Zircon", weight: "" },
        }],
        sourcing_lines: [{ material: "Bạc 925 và gia công", cost: 500000 }],
      },
    });
    expect(customOrderResponse.status()).toBe(201);
    const customOrder = await customOrderResponse.json();
    orderIds.push(customOrder.id);
    expect(customOrder.items[0].product_mode).toBe("custom");
    expect(customOrder.items[0].product_id).toBe("");
    expect(customOrder.item_cost).toBe(2000000);
    expect(customOrder.source_cost).toBe(500000);
    expect(customOrder.total_cost).toBe(2600000);
    expect(customOrder.pricing.profit_amount).toBe(780000);
    expect(customOrder.pricing.tax_amount).toBe(338000);
    expect(customOrder.pricing.suggested_price).toBe(3718000);
    expect(customOrder.items[0].image.storage_path).toBe(`deal-items/ord_${suffix}/itm_${suffix}/cover.webp`);

    const updatedCustomResponse = await call(`/api/orders/${customOrder.id}`, {
      method: "PATCH",
      data: {
        items: [{
          ...customOrder.items[0],
          unit_cost: 1100000,
          image: null,
        }],
      },
    });
    expect(updatedCustomResponse.ok()).toBeTruthy();
    const updatedCustom = await updatedCustomResponse.json();
    expect(updatedCustom.item_cost).toBe(2200000);
    expect(updatedCustom.items[0].image).toBeNull();

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
