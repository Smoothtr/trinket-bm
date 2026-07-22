(function exposeMoneyUtility(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TrinketMoney = api;
})(typeof window !== "undefined" ? window : globalThis, function createMoneyUtility() {
  const integerFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

  function parseMoneyInput(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
    const raw = String(value).trim();
    if (!raw) return null;
    const negative = raw.startsWith("-") || raw.startsWith("−");
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    const amount = Number(digits);
    if (!Number.isSafeInteger(amount)) return null;
    return negative ? -amount : amount;
  }

  function formatMoneyInput(value) {
    const amount = parseMoneyInput(value);
    if (amount === null) return "";
    return integerFormatter.format(amount).replace(/^-/, "−");
  }

  function caretAfterDigits(formatted, digitCount) {
    if (digitCount <= 0) return formatted.startsWith("−") ? 1 : 0;
    let seen = 0;
    for (let index = 0; index < formatted.length; index += 1) {
      if (/\d/.test(formatted[index])) seen += 1;
      if (seen === digitCount) return index + 1;
    }
    return formatted.length;
  }

  function formatMoneyInputElement(input) {
    const cursor = input.selectionStart ?? String(input.value || "").length;
    const digitsBeforeCursor = (String(input.value || "").slice(0, cursor).match(/\d/g) || []).length;
    const formatted = formatMoneyInput(input.value);
    input.value = formatted;
    const parsed = parseMoneyInput(formatted);
    input.dataset.moneyValue = parsed === null ? "" : String(parsed);
    if (document.activeElement === input && typeof input.setSelectionRange === "function") {
      const nextCursor = caretAfterDigits(formatted, digitsBeforeCursor);
      input.setSelectionRange(nextCursor, nextCursor);
    }
    return parsed;
  }

  function bindMoneyInput(input) {
    if (!input || input.dataset.moneyBound === "true") return input;
    input.dataset.moneyBound = "true";
    input.addEventListener("input", () => formatMoneyInputElement(input));
    input.addEventListener("blur", () => formatMoneyInputElement(input));
    formatMoneyInputElement(input);
    return input;
  }

  function bindMoneyInputs(root = document) {
    root.querySelectorAll("[data-money-input]").forEach(bindMoneyInput);
  }

  function readMoneyInput(input, fallback = 0) {
    const amount = parseMoneyInput(input?.value);
    return amount === null ? fallback : amount;
  }

  function setMoneyInputValue(input, value) {
    if (!input) return;
    const formatted = formatMoneyInput(value);
    input.value = formatted;
    const parsed = parseMoneyInput(formatted);
    input.dataset.moneyValue = parsed === null ? "" : String(parsed);
  }

  return {
    bindMoneyInput,
    bindMoneyInputs,
    formatMoneyInput,
    formatMoneyInputElement,
    parseMoneyInput,
    readMoneyInput,
    setMoneyInputValue,
  };
});
