const { test, expect } = require("@playwright/test");

test.use({ channel: "chrome" });

test("core screens, recommendation fixes, and modals render without client errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
  await expect(page.locator(".kpi-card")).toHaveCount(4);
  await expect(page.locator(".todo-row").first()).toBeVisible();
  await expect(page.locator("[data-action='edit-revenue-targets']").first()).toBeVisible();
  await page.locator("[data-action='edit-revenue-targets']").first().click();
  await expect(page.locator("#revenueTargetForm")).toBeVisible();
  await expect(page.locator(".goal-editor-row")).toHaveCount(1);
  await page.locator("[data-action='add-business-goal']").click();
  await expect(page.locator(".goal-editor-row")).toHaveCount(2);
  await page.locator("#newGoalMonth").fill("2027-12");
  await page.locator("[data-action='add-goal-month']").click();
  await expect(page.locator('[data-target-month="2027-12"]')).toHaveCount(2);
  await page.locator("[aria-label='Đóng']").click();
  const trendTexts = await page.locator(".trend").evaluateAll((nodes) => nodes.map((node) => node.textContent || ""));
  expect(trendTexts.join(" ")).not.toContain("% so kỳ trước");
  await page.locator("#globalSearch").fill("Linh");
  await expect(page.locator(".filter-notice")).toContainText("Đang lọc");
  await page.locator("[data-action='clear-search']").click();
  await expect(page.locator("#globalSearch")).toHaveValue("");

  await page.locator(".nav-item[data-view='orders']").click();
  await expect(page.locator("#statusFilter")).toBeVisible();
  await expect(page.locator("[data-action='edit-orders']").first()).toBeVisible();
  await expect(page.locator("[data-action='delete-orders']").first()).toBeVisible();
  await expect(page.locator(".orders-table-scroll")).toBeVisible();
  await page.locator(".orders-table [data-action='toggle-select']").first().check();
  await expect(page.locator(".bulk-bar")).toContainText("Sửa hàng loạt");
  await page.locator("[data-action='clear-selection'][data-entity='orders']").click();
  await page.locator("[data-action='edit-orders']").first().click();
  await expect(page.locator("#orderEditForm .product-item-row").first()).toBeVisible();
  await expect(page.locator("#orderEditForm .source-line-row").first()).toBeVisible();
  await page.locator("[aria-label='Đóng']").click();

  await page.locator("[data-action='new-order']").click();
  await expect(page.locator("#orderForm")).toBeVisible();
  await expect(page.locator("input[name='due_date']")).toHaveAttribute("placeholder", "dd/mm/yyyy");
  await expect(page.locator("#provinceSelect")).toBeVisible();
  await expect(page.locator(".product-item-row")).toHaveCount(1);
  await expect(page.locator('.product-item-row [data-field="material_id"]')).toBeVisible();
  await expect(page.locator('.product-item-row [data-action="set-product-mode"]')).toHaveCount(2);
  await expect(page.getByText("Tính giá kim loại")).toHaveCount(0);
  await expect(page.locator('[data-pricing-output="item_cost"]')).toBeVisible();
  await page.locator('.product-item-row [data-action="set-product-mode"][data-mode="custom"]').click();
  await expect(page.locator('.product-item-row .custom-only').first()).toBeVisible();
  await expect(page.locator('.product-item-row .catalog-only')).toBeHidden();
  await expect(page.locator('.product-item-row [data-field="unit_cost"]')).toBeVisible();
  await expect(page.locator('.product-item-row [data-field="product_image_file"]')).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  await page.locator('.product-item-row [data-field="product_image_file"]').setInputFiles({
    name: "custom-ring.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZVZsAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.locator('.product-item-row .product-image-preview img')).toHaveAttribute("src", /^blob:/);
  await page.locator('.product-item-row [data-action="remove-order-image"]').click();
  await expect(page.locator('.product-item-row [data-action="remove-order-image"]')).toBeHidden();
  await page.locator('.product-item-row [data-field="unit_cost"]').fill("1000000");
  await page.locator('.product-item-row [data-field="quantity"]').fill("2");
  await expect(page.locator('.product-item-row [data-field="unit_cost"]')).toHaveValue("1.000.000");
  await expect(page.locator('.product-item-row [data-item-cost-output]')).toHaveCount(0);
  await expect(page.getByText("Engine báo giá")).toBeVisible();
  await expect(page.getByText("Bảo hành")).toHaveCount(0);
  await page.locator("[data-action='add-order-item']").click();
  await expect(page.locator(".product-item-row")).toHaveCount(2);
  await page.locator(".product-item-row").last().locator("[data-action='remove-order-item']").click();
  await expect(page.locator(".product-item-row")).toHaveCount(1);
  await page.locator(".source-line-row [data-field='cost']").first().fill("500000");
  await expect(page.locator(".source-line-row [data-field='cost']").first()).toHaveValue("500.000");
  await page.locator("input[name='shipping_cost']").fill("100000");
  await page.locator("input[name='profit_rate']").fill("30");
  await page.locator("input[name='tax_rate']").fill("10");
  await expect(page.locator("[data-pricing-output='item_cost']")).toContainText("2.000.000");
  await expect(page.locator("[data-pricing-output='suggested_price']")).toContainText("3.718.000");
  await page.locator("[data-action='apply-suggested-price']").click();
  await expect(page.locator("input[name='price']")).toHaveValue("3.718.000");
  await page.locator("[aria-label='Đóng']").click();

  await page.locator(".nav-item[data-view='products']").click();
  await expect(page.getByText("Mẫu có sẵn").first()).toBeVisible();
  await expect(page.locator(".product-table tbody tr").first()).toBeVisible();
  await expect(page.locator("[data-action='edit-product']").first()).toBeVisible();
  await expect(page.locator("[data-action='adjust-stock']").first()).toBeVisible();
  await page.locator("[data-action='edit-product']").first().click();
  await expect(page.locator("#productForm")).toBeVisible();
  await expect(page.locator("#productForm [data-field='catalog_product_image_file']")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  await page.locator("#productForm [data-field='catalog_product_image_file']").setInputFiles({
    name: "catalog-product.png",
    mimeType: "image/png",
    buffer: Buffer.from("catalog-product-image"),
  });
  await expect(page.locator("#productForm .product-image-preview img")).toHaveAttribute("src", /^blob:/);
  await page.locator("#productForm [data-action='remove-catalog-product-image']").click();
  await expect(page.locator("#productForm [data-action='remove-catalog-product-image']")).toBeHidden();
  await page.locator("[aria-label='Đóng']").click();
  await page.locator("[data-action='set-product-tab'][data-tab='attributes']").click();
  await expect(page.getByText("Thuộc tính sản phẩm")).toBeVisible();
  await page.locator("[data-action='edit-material']").first().click();
  await expect(page.locator("#materialForm")).toBeVisible();
  await page.locator("[aria-label='Đóng']").click();

  await page.locator(".nav-item[data-view='orders']").click();
  await page.locator("[data-action='open-order']").first().click();
  await expect(page.locator("#paymentForm")).toBeVisible();
  await expect(page.getByText("Sản phẩm trong deal")).toBeVisible();
  await expect(page.getByText("Engine báo giá")).toBeVisible();
  await expect(page.locator("[data-action='edit-orders']").first()).toBeVisible();
  await expect(page.locator("[data-action='create-shipment'], [data-action='sync-shipment']").first()).toBeVisible();
  await page.locator("[aria-label='Đóng']").click();

  await page.locator(".nav-item[data-view='customers']").click();
  await expect(page.locator("[data-action='edit-customers']").first()).toBeVisible();
  await expect(page.locator("[data-action='delete-customers']").first()).toBeVisible();
  await page.locator("[data-action='toggle-select'][data-entity='customers']").first().check();
  await expect(page.locator(".bulk-bar")).toContainText("Sửa hàng loạt");
  await page.locator("[data-action='clear-selection'][data-entity='customers']").click();
  await page.locator("[data-action='open-customer']").first().click();
  await expect(page.getByText("Hồ sơ CRM")).toBeVisible();
  await page.locator("[aria-label='Đóng']").click();

  await page.locator(".nav-item[data-view='vendors']").click();
  await expect(page.locator("[data-action='edit-vendors']").first()).toBeVisible();
  await expect(page.locator("[data-action='delete-vendors']").first()).toBeVisible();
  await page.locator("[data-action='toggle-select'][data-entity='vendors']").first().check();
  await expect(page.locator(".bulk-bar")).toContainText("Sửa hàng loạt");
  await page.locator("[data-action='clear-selection'][data-entity='vendors']").click();
  await page.locator("[data-action='edit-metal-prices']").click();
  await expect(page.locator("#metalPriceForm")).toBeVisible();
  await expect(page.locator(".metal-rule-row").first()).toBeVisible();
  await expect(page.locator('.metal-rule-row [data-field="mode"]').first()).toBeVisible();
  await page.locator('.metal-rule-row [data-field="mode"]').first().selectOption("percent");
  await page.locator('.metal-rule-row [data-field="value"]').first().fill("5");
  await expect(page.locator('.metal-rule-row [data-field="result"]').first()).not.toHaveText("0 ₫");
  await page.locator("[aria-label='Đóng']").click();

  await page.locator(".nav-item[data-view='shipping']").click();
  await expect(page.locator("[data-action='edit-shipments']").first()).toBeVisible();
  await expect(page.locator("[data-action='delete-shipments']").first()).toBeVisible();
  await page.locator("[data-action='toggle-select'][data-entity='shipments']").first().check();
  await expect(page.locator(".bulk-bar")).toContainText("Sửa hàng loạt");
  await page.locator("[data-action='clear-selection'][data-entity='shipments']").click();

  await page.locator(".nav-item[data-view='settings']").click();
  await expect(page.getByText("Audit log")).toBeVisible();
  await expect(page.getByText("Danh mục mẫu sản phẩm")).toHaveCount(0);
  await page.locator("[data-action='set-settings-tab'][data-tab='accounts']").click();
  await expect(page.getByRole("heading", { name: "Quản lý tài khoản" })).toBeVisible();
  await expect(page.locator(".accounts-table tbody tr").first()).toBeVisible();
  await expect(page.locator(".account-badge.role-admin").first()).toContainText("Admin / Chủ");
  await expect(page.locator("[data-action='disable-admin-user']").first()).toBeDisabled();
  await expect(page.locator("[data-action='reset-admin-password']").first()).toBeVisible();
  await page.locator("[data-action='new-admin-user']").first().click();
  await expect(page.locator("#adminUserForm input[name='email']")).toBeVisible();
  await expect(page.locator("#adminUserForm select[name='role'] option")).toHaveCount(4);
  await expect(page.locator("#adminUserForm input[name='password']")).toHaveCount(0);
  await expect(page.locator("#adminUserForm").locator("..")).toContainText("Gg1234");
  await page.locator("[aria-label='Đóng']").click();
  await page.locator("[data-action='set-settings-tab'][data-tab='audit']").click();
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  await page.locator(".nav-item[data-view='finance']").click();
  await expect(page.locator("#expenseForm")).toBeVisible();
  await expect(page.getByText("Tuổi nợ").first()).toBeVisible();
  await expect(page.locator("#expenseForm input[name='date']")).toHaveAttribute("placeholder", "dd/mm/yyyy");
  await expect(page.locator(".kpi-card .lucide-banknote")).toBeVisible();
  await expect(page.getByText("Sao chép lời nhắc").first()).toBeVisible();
  await expect(page.locator("[data-action='edit-expense']").first()).toBeVisible();
  await expect(page.locator("[data-action='delete-expense']").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("custom product editor remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
  await page.locator("#newOrderBtn").click();
  await page.locator('[data-action="set-product-mode"][data-mode="custom"]').click();
  await expect(page.locator('[data-field="unit_cost"]')).toBeVisible();
  await expect(page.locator('[data-item-cost-output]')).toHaveCount(0);
  await expect(page.locator('[data-action="choose-order-image"]')).toBeVisible();
  await page.locator('[data-field="unit_cost"]').fill("25000000");
  await expect(page.locator('[data-field="unit_cost"]')).toHaveValue("25.000.000");
  const overflows = await page.locator(".product-item-row").evaluate((row) => row.scrollWidth > row.clientWidth + 1);
  expect(overflows).toBeFalsy();
});

test("login screen fully covers the app on desktop and mobile", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
    await page.evaluate(() => window.showLogin());
    await expect(page.locator(".auth-screen")).toBeVisible();
    await expect(page.locator(".auth-brand-lockup")).toBeVisible();
    await expect(page.locator("#authLoginForm")).toBeVisible();
    await expect(page.locator("#appShell")).toBeHidden();
    await expect(page.locator(".auth-form-panel")).toContainText("mật khẩu mặc định do Admin / Chủ cung cấp");
    await expect(page.locator(".auth-form-panel")).not.toContainText("Gg1234");
    await expect(page.locator("[data-action='reset-auth-password']")).toHaveCount(0);
    await expect(page.locator("[data-action='open-login-password-change']")).toBeVisible();
    await page.locator("[data-action='open-login-password-change']").click();
    await expect(page.locator("#loginPasswordChangeForm")).toBeVisible();
    await expect(page.locator("#loginPasswordChangeForm input[name='email']")).toHaveAttribute("type", "email");
    await expect(page.locator("#loginPasswordChangeForm input[name='current_password']")).toBeVisible();
    await expect(page.locator("#loginPasswordChangeForm input[name='password']")).toHaveAttribute("minlength", "8");
    await expect(page.locator("#loginPasswordChangeForm input[name='password_confirm']")).toHaveAttribute("minlength", "8");
    await page.locator("[data-action='back-to-login']").click();
    await expect(page.locator("#authLoginForm")).toBeVisible();
    const coverage = await page.locator(".auth-backdrop").evaluate((backdrop) => {
      const rect = backdrop.getBoundingClientRect();
      const style = getComputedStyle(backdrop);
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
      };
    });
    expect(coverage.top).toBe(0);
    expect(coverage.left).toBe(0);
    expect(coverage.width).toBe(viewport.width);
    expect(coverage.height).toBe(viewport.height);
    expect(coverage.backgroundImage.includes("gradient") || coverage.backgroundColor !== "rgba(0, 0, 0, 0)").toBeTruthy();
  }
});

test("HTML ban đầu hiển thị đăng nhập và không để lộ Dashboard trước khi JavaScript chạy", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#authBootScreen")).toBeVisible();
  await expect(page.locator("#authLoginForm")).toBeVisible();
  await expect(page.locator("#appShell")).toBeHidden();

  await context.close();
});

test("màn hình bắt buộc đổi mật khẩu che toàn bộ ứng dụng", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
  await page.evaluate(() => window.showRequiredPasswordChange());
  await expect(page.locator("#requiredPasswordChangeForm")).toBeVisible();
  await expect(page.locator("#appShell")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Đặt mật khẩu mới" })).toBeVisible();
  await expect(page.locator("#requiredPasswordChangeForm input[name='password']")).toHaveAttribute("minlength", "8");
  const coverage = await page.locator(".auth-backdrop").evaluate((backdrop) => {
    const rect = backdrop.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  });
  expect(coverage).toEqual({ top: 0, left: 0, width: 390, height: 844 });
});

test("quản lý tài khoản responsive và không tràn ngang trên mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
  await page.locator(".nav-item[data-view='settings']").click();
  await page.locator("[data-action='set-settings-tab'][data-tab='accounts']").click();
  await expect(page.locator(".accounts-table tbody tr").first()).toBeVisible();
  const overflows = await page.locator(".account-panel").evaluate((panel) => panel.scrollWidth > panel.clientWidth + 1);
  expect(overflows).toBeFalsy();
  await page.locator("[data-action='new-admin-user']").first().click();
  await expect(page.locator("#adminUserForm")).toBeVisible();
  const modalFits = await page.locator("#adminUserForm").evaluate((form) => form.scrollWidth <= form.clientWidth + 1);
  expect(modalFits).toBeTruthy();
});

test("vai trò không phải Admin không nhìn thấy Quản lý tài khoản", async ({ page }) => {
  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
  await page.locator("#roleFilter").selectOption("sale");
  await page.locator(".nav-item[data-view='settings']").click();
  await expect(page.locator("[data-action='set-settings-tab'][data-tab='accounts']")).toHaveCount(0);
});
