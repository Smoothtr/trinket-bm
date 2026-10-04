import customerPhone from "../public/customer-phone.js";

const { normalizePhone } = customerPhone;
const ADDRESS_FIELDS = ["address", "province", "district", "ward", "address_mode"];
const DELIVERY_FIELDS = ["full_name", "phone", ...ADDRESS_FIELDS];

function customerError(message, statusCode = 400, code = "invalid-customer") {
  return Object.assign(new Error(message), { statusCode, code });
}

function deliveryFromCustomer(customer = {}) {
  return Object.fromEntries(DELIVERY_FIELDS.map((key) => [key,
    key === "address_mode" ? customer.address_mode || (customer.province && !customer.district ? "current" : "legacy")
      : String(customer[key] || ""),
  ]));
}

function orderDelivery(order, data) {
  return order.delivery ? { ...order.delivery }
    : deliveryFromCustomer(data.customers.find((customer) => customer.id === order.customer_id));
}

function validateDelivery(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw customerError("Địa chỉ giao hàng không hợp lệ.");
  const result = {};
  for (const key of DELIVERY_FIELDS) {
    if (typeof value[key] !== "string" || value[key].length > (key === "address" ? 500 : 150)) {
      throw customerError("Thông tin giao hàng không hợp lệ hoặc quá dài.");
    }
    result[key] = value[key].trim();
  }
  if (!["current", "legacy"].includes(result.address_mode)) throw customerError("Cấu trúc địa chỉ không hợp lệ.");
  if (result.address_mode === "current" && result.district) throw customerError("Địa chỉ 2 cấp không có quận/huyện.");
  // Legacy records may have incomplete addresses. Preserve these until explicitly edited.
  return result;
}

function hasShipment(order, data) {
  return Boolean(order.shipment_id || data.shipments.some((shipment) => shipment.order_id === order.id));
}

function sameDelivery(a, b) {
  return DELIVERY_FIELDS.every((key) => String(a[key] || "") === String(b[key] || ""));
}

function resolveOrderCustomer(data, body) {
  if (body.customer_id) {
    const selected = data.customers.find((customer) => customer.id === body.customer_id);
    if (!selected) throw customerError("Khách đã chọn không còn tồn tại. Vui lòng chọn lại.", 409, "customer-missing");
    return selected;
  }
  const phone = normalizePhone(body.customer?.phone);
  if (typeof body.customer?.full_name !== "string" || !body.customer.full_name.trim() || !/^\+?\d{6,15}$/.test(phone)) {
    throw customerError("Vui lòng nhập tên và số điện thoại khách hợp lệ.");
  }
  if (data.customers.some((customer) => normalizePhone(customer.phone) === phone)) {
    throw customerError("Số điện thoại đã có trong danh sách khách. Hãy chọn khách cũ trước khi lưu.", 409, "customer-selection-required");
  }
  return null;
}

function preserveCustomerDeliveries(data, customerId) {
  const preserved = [];
  for (const order of data.orders.filter((item) => item.customer_id === customerId && !item.delivery)) {
    order.delivery = orderDelivery(order, data);
    preserved.push(order.id);
  }
  return preserved;
}

function applyCustomerPatch(data, customer, patch) {
  const changed = DELIVERY_FIELDS.some((key) => Object.hasOwn(patch, key) && String(customer[key] || "") !== String(patch[key] || ""));
  const preserved = changed ? preserveCustomerDeliveries(data, customer.id) : [];
  Object.assign(customer, patch);
  return preserved;
}

function prepareOrderDelivery(data, body, customer, order = null) {
  if (body.update_customer_address !== undefined && typeof body.update_customer_address !== "boolean") {
    throw customerError("Lựa chọn cập nhật hồ sơ không hợp lệ.");
  }
  if (body.update_customer_address && (!body.expected_customer_address
    || ADDRESS_FIELDS.some((key) => String(body.expected_customer_address[key] || "") !== deliveryFromCustomer(customer)[key]))) {
    throw customerError("Địa chỉ hồ sơ đã thay đổi hoặc chưa được xác nhận. Vui lòng chọn lại khách trước khi cập nhật hồ sơ.", 409, "customer-address-conflict");
  }
  const previous = order ? orderDelivery(order, data) : deliveryFromCustomer(customer);
  const customerChanged = order && order.customer_id !== customer.id;
  const delivery = body.delivery !== undefined ? validateDelivery(body.delivery)
    : customerChanged ? deliveryFromCustomer(customer) : previous;
  if (order && hasShipment(order, data) && (customerChanged || !sameDelivery(previous, delivery))) {
    throw customerError("Deal đã có vận đơn. Cần xử lý vận đơn trước khi đổi khách hoặc địa chỉ giao hàng.", 409, "shipment-address-locked");
  }
  return delivery;
}

export {
  ADDRESS_FIELDS, DELIVERY_FIELDS, normalizePhone, deliveryFromCustomer, orderDelivery,
  validateDelivery, hasShipment, sameDelivery, resolveOrderCustomer, preserveCustomerDeliveries,
  applyCustomerPatch, prepareOrderDelivery,
};
