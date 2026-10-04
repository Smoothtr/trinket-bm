(function (root) {
  function normalizePhone(value) {
    const phone = String(value || "").trim().replace(/[\s().-]/g, "");
    const vietnam = phone.match(/^(?:\+84|0084|84)([1-9]\d{8,9})$/);
    return vietnam ? `0${vietnam[1]}` : phone;
  }

  function findCustomers(customers, query, limit = 5) {
    const phone = normalizePhone(query);
    if (phone.replace(/\D/g, "").length < 3) return [];
    return customers.filter((customer) => normalizePhone(customer.phone).includes(phone))
      .sort((a, b) => Number(normalizePhone(b.phone) === phone) - Number(normalizePhone(a.phone) === phone)
        || String(a.full_name).localeCompare(String(b.full_name), "vi"))
      .slice(0, limit);
  }

  const api = { normalizePhone, findCustomers };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TrinketCustomers = api;
})(typeof window === "undefined" ? globalThis : window);
