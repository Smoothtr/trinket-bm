const { defineConfig } = require("@playwright/test");

const baseURL = process.env.BASE_URL || "http://127.0.0.1:4173";

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
  ...(process.env.BASE_URL ? {} : {
    webServer: {
      command: "node scripts/start-test-server.mjs",
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  }),
});
