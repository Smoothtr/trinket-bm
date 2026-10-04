const { defineConfig } = require("@playwright/test");

const externalBaseURL = process.env.BASE_URL;
const testPort = process.env.TRINKET_TEST_PORT || "4174";
const baseURL = externalBaseURL || `http://127.0.0.1:${testPort}`;
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error("Các test có ghi dữ liệu chỉ được chạy trên localhost.");
}
// Keep legacy test helpers on the same isolated server as Playwright fixtures.
process.env.BASE_URL = baseURL;

module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: "line",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  ...(externalBaseURL ? {} : {
    webServer: {
      command: "node scripts/start-test-server.mjs",
      env: { PORT: testPort },
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  }),
});
