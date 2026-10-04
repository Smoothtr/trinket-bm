const { test, expect } = require("@playwright/test");

test.use({ channel: "chrome" });

const baseUrl = process.env.BASE_URL || "http://localhost:4173";

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectProductFieldsContained(page) {
  const contained = await page.locator(".product-item-row").first().evaluate((row) => {
    const bounds = row.getBoundingClientRect();
    return [...row.querySelectorAll("input, select, textarea, button")]
      .filter((element) => element.offsetParent !== null)
      .every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1;
      });
  });
  expect(contained).toBeTruthy();
}

function collectClientErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("restyle matches the required desktop, tablet and mobile breakpoints", async ({ page, context }) => {
  test.setTimeout(60_000);
  const clientErrors = collectClientErrors(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await expect(page.locator(".brand-logo")).toBeVisible();
  await expectNoPageOverflow(page);
  const dashboardKpiColors = await page.locator(".kpi-card").evaluateAll((cards) => Object.fromEntries(cards.map((card) => [card.querySelector(".kpi-top span")?.textContent?.trim(), getComputedStyle(card.querySelector(":scope > strong")).color])));
  expect(dashboardKpiColors["Lợi nhuận gộp"]).toBe("rgb(47, 108, 79)");
  expect(dashboardKpiColors["Tiền chờ thu"]).toBe("rgb(143, 29, 38)");
  await page.screenshot({ path: "test-results/restyle-dashboard-1440x900.png" });

  await page.locator(".nav-item[data-view='orders']").click();
  await expect(page.locator(".orders-table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Tổng thanh toán" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Đã thu" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Thao tác" })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-deals-1440x900.png" });

  const orderId = await page.locator(".orders-table tbody tr[data-order-id]").first().getAttribute("data-order-id");
  await page.locator("[data-action='set-order-view'][data-mode='kanban']").click();
  await expect(page.locator(".kanban-column").first()).toBeVisible();
  await page.screenshot({ path: "test-results/restyle-kanban-1440x900.png" });

  await page.locator("[data-action='new-order']").first().click();
  await expect(page.locator("#orderForm")).toBeVisible();
  await expect(page.locator(".editor-section")).toHaveCount(7);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-deal-modal-1440x900.png" });
  await page.locator(".modal [aria-label='Đóng']").click();

  await page.locator(".deal-card[data-order-id]").first().click();
  await expect(page.locator(".detail-layout")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-deal-detail-1440x900.png" });
  await page.locator(".modal [aria-label='Đóng']").click();

  for (const view of ["products", "customers", "vendors", "finance", "shipping", "settings"]) {
    await page.locator(`.nav-item[data-view='${view}']`).click();
    await expect(page.locator("#app")).not.toBeEmpty();
    await expectNoPageOverflow(page);
  }

  const receiptPage = await context.newPage();
  const receiptErrors = collectClientErrors(receiptPage);
  await receiptPage.setViewportSize({ width: 1024, height: 900 });
  await receiptPage.goto(`${baseUrl}/api/receipts/${orderId}?lang=vi`, { waitUntil: "networkidle" });
  await expect(receiptPage.locator(".sheet")).toBeVisible();
  await expect(receiptPage.locator('[data-receipt-line="tax"]')).toBeVisible();
  await expect(receiptPage.locator('[data-receipt-line="shipping"]')).toBeVisible();
  await expect(receiptPage.locator(".actions button")).toBeInViewport();
  await receiptPage.screenshot({ path: "test-results/restyle-receipt-visible-action.png" });
  await receiptPage.screenshot({ path: "test-results/restyle-receipt-a4.png", fullPage: true });
  await receiptPage.emulateMedia({ media: "print" });
  await expect(receiptPage.locator(".actions")).toBeHidden();
  await receiptPage.emulateMedia({ media: "screen" });
  await receiptPage.setViewportSize({ width: 390, height: 844 });
  await expect(receiptPage.locator(".actions button")).toBeInViewport();
  await expectNoPageOverflow(receiptPage);
  await receiptPage.screenshot({ path: "test-results/restyle-receipt-mobile-action-390x844.png" });
  expect(receiptErrors).toEqual([]);
  await receiptPage.close();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".nav-item[data-view='dashboard']").click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-tablet-1024x768.png" });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".nav-item[data-view='dashboard']").click();
  await expect(page.locator(".sidebar")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-tablet-768x1024.png" });
  await page.locator(".nav-item[data-view='orders']").click();
  await page.locator("[data-action='new-order']").first().click();
  await page.locator(".product-item-row").first().scrollIntoViewIfNeeded();
  await expectProductFieldsContained(page);
  await page.screenshot({ path: "test-results/restyle-deal-product-768x1024.png" });
  await page.locator(".modal [aria-label='Đóng']").click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".nav-item[data-view='dashboard']").click();
  await expect(page.locator(".mobile-more-nav")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-dashboard-390x844.png" });

  await page.locator(".nav-item[data-view='orders']").click();
  await page.locator("[data-action='set-order-view'][data-mode='table']").click();
  await expect(page.locator(".orders-table tbody tr").first()).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-deals-390x844.png" });

  await page.locator("[data-action='new-order']").first().click();
  await expect(page.locator("#orderForm")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-deal-modal-390x844.png" });
  await page.locator(".mobile-section-jump").nth(2).click();
  await page.locator(".product-item-row").first().scrollIntoViewIfNeeded();
  await expectProductFieldsContained(page);
  await page.screenshot({ path: "test-results/restyle-deal-product-390x844.png" });

  expect(clientErrors).toEqual([]);
});

test("mobile audit: compact shell, card tables and usable deal editor", async ({ page }) => {
  const clientErrors = collectClientErrors(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const topbarHeight = await page.locator(".topbar").evaluate((element) => Math.round(element.getBoundingClientRect().height));
  expect(topbarHeight).toBeLessThanOrEqual(66);
  const firstTwoKpiTops = await page.locator(".kpi-card").evaluateAll((cards) => cards.slice(0, 2).map((card) => Math.round(card.getBoundingClientRect().top)));
  expect(firstTwoKpiTops[0]).toBe(firstTwoKpiTops[1]);
  await expectNoPageOverflow(page);

  await page.locator("[data-action='toggle-mobile-search']").click();
  await expect(page.locator("#globalSearch")).toBeVisible();
  await expect(page.locator("#globalSearch")).toBeFocused();
  await page.locator("[data-action='toggle-mobile-search']").click();

  for (const view of ["products", "customers", "finance"]) {
    if (view === "finance") {
      await page.locator(".mobile-more-nav > summary").click();
      await page.locator(".mobile-more-menu [data-view='finance']").click();
    } else {
      await page.locator(`.nav-item[data-view='${view}']`).click();
    }
    await expect(page.locator(".stack-table").first()).toBeVisible();
    const tableFits = await page.locator(".stack-table").first().evaluate((table) => table.scrollWidth <= table.clientWidth + 1);
    expect(tableFits).toBeTruthy();
    await expectNoPageOverflow(page);
  }

  await page.locator(".nav-item[data-view='orders']").click();
  await page.locator("[data-action='set-order-view'][data-mode='table']").click();
  const customerCellLayout = await page.locator(".orders-table td[data-label='Khách']").first().evaluate((cell) => {
    const cellRect = cell.getBoundingClientRect();
    const detailRect = cell.querySelector(".small")?.getBoundingClientRect();
    return { cellLeft: cellRect.left, detailLeft: detailRect?.left || 0 };
  });
  expect(customerCellLayout.detailLeft - customerCellLayout.cellLeft).toBeGreaterThan(98);

  await page.locator("[data-action='new-order']").first().click();
  await expect(page.locator(".mobile-section-nav")).toBeVisible();
  await expect(page.locator(".editor-section").nth(2)).toHaveClass(/is-mobile-collapsed/);
  await page.locator(".mobile-section-jump").nth(2).click();
  await expect(page.locator(".product-item-row").first()).toBeVisible();
  const inputFontSize = await page.locator("#orderForm input:not([type='hidden'])").first().evaluate((input) => getComputedStyle(input).fontSize);
  expect(inputFontSize).toBe("16px");
  const smallestJumpTarget = await page.locator(".mobile-section-jump").evaluateAll((buttons) => Math.min(...buttons.map((button) => button.getBoundingClientRect().height)));
  expect(smallestJumpTarget).toBeGreaterThanOrEqual(44);
  await expectProductFieldsContained(page);
  await page.locator(".modal [aria-label='Đóng']").click();

  await page.locator("[data-action='set-order-view'][data-mode='kanban']").click();
  await expect(page.locator(".kanban-mobile-tabs")).toBeVisible();
  await expect(page.locator(".mobile-card-status").first()).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/mobile-audit-kanban-375x812.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".topbar .mobile-overflow")).toHaveCount(0);
  await page.locator(".mobile-more-nav > summary").click();
  await expect(page.locator(".mobile-more-menu")).toBeVisible();
  await expect(page.locator(".mobile-more-menu [data-view='finance']")).toBeVisible();
  const moreMenuPosition = await page.locator(".mobile-more-menu").evaluate((menu) => {
    const menuRect = menu.getBoundingClientRect();
    const summaryRect = menu.closest("details").querySelector("summary").getBoundingClientRect();
    return { menuBottom: menuRect.bottom, summaryTop: summaryRect.top };
  });
  expect(moreMenuPosition.menuBottom).toBeLessThanOrEqual(moreMenuPosition.summaryTop);
  await page.screenshot({ path: "test-results/mobile-audit-more-menu-390x844.png" });
  await page.locator(".mobile-more-nav > summary").click();
  await page.locator("[data-action='toggle-mobile-filters']").click();
  await expect(page.locator(".topbar.is-filter-open .top-actions")).toBeVisible();
  const filterPanel = await page.locator(".topbar.is-filter-open .top-actions").evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, width: rect.width };
  });
  expect(filterPanel.top).toBeGreaterThanOrEqual(60);
  expect(filterPanel.bottom).toBeLessThanOrEqual(844);
  expect(filterPanel.width).toBeGreaterThan(300);
  await page.screenshot({ path: "test-results/mobile-audit-filter-390x844.png" });
  await expectNoPageOverflow(page);
  expect(clientErrors).toEqual([]);
});

test("finance, vendor and shipping KPI cards match the visual specification", async ({ page }) => {
  const clientErrors = collectClientErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.locator(".nav-item[data-view='vendors']").click();
  await expect(page.locator(".vendor-kpis .kpi-card")).toHaveCount(4);
  await expect(page.locator(".vendor-kpis")).toContainText("Nhà cung cấp");
  await expect(page.locator(".vendor-kpis")).toContainText("Tổng chi phí nguồn hàng");
  await expect(page.locator(".vendor-kpis")).toContainText("Đơn liên quan");
  await expect(page.locator(".vendor-kpis")).toContainText("Chi phí bình quân");
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-vendor-kpis-1440x900.png" });

  await page.locator(".nav-item[data-view='finance']").click();
  const financeStyles = await page.locator(".kpi-card").evaluateAll((cards) => Object.fromEntries(cards.map((card) => {
    const value = card.querySelector(":scope > strong");
    return [card.querySelector(".kpi-top span")?.textContent?.trim(), { color: getComputedStyle(value).color, className: value.className }];
  })));
  expect(["positive", "negative"]).toContain(financeStyles["Lợi nhuận thuần"].className);
  expect(financeStyles["Lợi nhuận thuần"].color).toBe(financeStyles["Lợi nhuận thuần"].className === "positive" ? "rgb(47, 108, 79)" : "rgb(179, 38, 30)");
  expect(financeStyles["Công nợ/COD treo"].color).toBe("rgb(143, 29, 38)");
  await expect(page.locator(".receivables-table td.risk").first()).toHaveCSS("color", "rgb(143, 29, 38)");
  await page.screenshot({ path: "test-results/restyle-finance-kpis-1440x900.png" });

  await page.locator(".nav-item[data-view='shipping']").click();
  await expect(page.locator(".shipping-kpis .kpi-card")).toHaveCount(4);
  await expect(page.locator(".shipping-kpis")).toContainText("Vận đơn đang chạy");
  await expect(page.locator(".shipping-kpis")).toContainText("Đơn chờ giao");
  await expect(page.locator(".shipping-kpis")).toContainText("Phí vận chuyển thực tế");
  await expect(page.locator(".shipping-kpis")).toContainText("COD đang treo");
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-shipping-kpis-1440x900.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  const firstTwoShippingKpiTops = await page.locator(".shipping-kpis .kpi-card").evaluateAll((cards) => cards.slice(0, 2).map((card) => Math.round(card.getBoundingClientRect().top)));
  expect(firstTwoShippingKpiTops[0]).toBe(firstTwoShippingKpiTops[1]);
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/restyle-shipping-kpis-390x844.png" });
  expect(clientErrors).toEqual([]);
});
