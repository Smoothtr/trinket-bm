const test = require("node:test");
const assert = require("node:assert/strict");
const { formatMoneyInput, parseMoneyInput } = require("../public/money.js");

test("formats Vietnamese thousands separators", () => {
  assert.equal(formatMoneyInput(1850000), "1.850.000");
  assert.equal(formatMoneyInput("25000000"), "25.000.000");
  assert.equal(formatMoneyInput("1.649.500"), "1.649.500");
  assert.equal(formatMoneyInput(0), "0");
  assert.equal(formatMoneyInput(null), "");
});

test("parses formatted values back to integers", () => {
  assert.equal(parseMoneyInput("1.850.000"), 1850000);
  assert.equal(parseMoneyInput("25.000.000 đ"), 25000000);
  assert.equal(parseMoneyInput(""), null);
  assert.equal(parseMoneyInput(null), null);
});
