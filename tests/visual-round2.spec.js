const { test, expect } = require("@playwright/test");

test.use({ channel: "chrome" });

async function expectNoPageOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("round 2 desktop layouts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/round2-dashboard-desktop.png", fullPage: true });

  await page.locator("[data-action='edit-revenue-targets']").first().click();
  await expect(page.locator("#revenueTargetForm")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/round2-goals-desktop.png" });
  await page.locator("[aria-label='Đóng']").click();

  await page.locator(".nav-item[data-view='orders']").click();
  await page.locator("[data-action='new-order']").first().click();
  await expect(page.locator("#orderForm")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/round2-deal-desktop.png" });
  await page.locator(".product-mode-switch").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/round2-deal-engine-desktop.png" });
  await page.locator('.product-item-row [data-action="set-product-mode"][data-mode="custom"]').first().click();
  await page.screenshot({ path: "test-results/round2-deal-custom-desktop.png" });
  await page.locator("[aria-label='Đóng']").click();
  await page.locator(".nav-item[data-view='products']").click();
  await expect(page.locator(".product-table")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/product-catalog-desktop.png" });
  await page.locator(".nav-item[data-view='vendors']").click();
  await page.locator("[data-action='edit-metal-prices']").click();
  await expect(page.locator("#metalPriceForm")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/round2-metal-rules-desktop.png" });
});

test("round 2 mobile layouts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.BASE_URL || "http://localhost:4173", { waitUntil: "networkidle" });
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/round2-dashboard-mobile.png", fullPage: true });

  await page.locator("[data-action='edit-revenue-targets']").first().click();
  await expect(page.locator("#revenueTargetForm")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/round2-goals-mobile.png" });
  await page.locator("[aria-label='Đóng']").click();

  await page.locator(".nav-item[data-view='orders']").click();
  await page.locator("[data-action='new-order']").first().click();
  await expect(page.locator("#orderForm")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/round2-deal-mobile.png" });
  await page.locator(".product-mode-switch").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/round2-deal-engine-mobile.png" });
  await page.locator('.product-item-row [data-action="set-product-mode"][data-mode="custom"]').first().click();
  await page.screenshot({ path: "test-results/round2-deal-custom-mobile.png" });
  await page.locator("[aria-label='Đóng']").click();
  await page.locator(".nav-item[data-view='products']").click();
  await expect(page.locator(".product-table")).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: "test-results/product-catalog-mobile.png" });
});
