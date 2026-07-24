import assert from "node:assert/strict";
import test from "node:test";
import { addIsoDays, businessDateIso, getMarketPrices } from "../server.mjs";

test("ngày nghiệp vụ luôn theo múi giờ Hồ Chí Minh", () => {
  assert.equal(businessDateIso(new Date("2026-07-23T18:30:00.000Z")), "2026-07-24");
  assert.equal(businessDateIso(new Date("2026-07-24T16:59:59.000Z")), "2026-07-24");
  assert.equal(businessDateIso(new Date("2026-07-24T17:00:00.000Z")), "2026-07-25");
  assert.equal(addIsoDays("2026-07-31", 3), "2026-08-03");
});

test("đọc bootstrap không tự gọi nguồn giá thị trường", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Không được gọi nguồn ngoài khi chỉ đọc cache");
  };

  try {
    const data = {
      settings: { metal_price_rules: {} },
      gold_prices: [],
      market_price_cache: {
        payload: {
          status: "live",
          fetchedAt: "2026-07-01T00:00:00.000Z",
          sourceLabel: "Đã lưu",
          errors: [],
          gold: { karats: [], references: [] },
          silver: { purities: [], references: [] },
        },
      },
    };
    const result = await getMarketPrices(data);
    assert.equal(fetchCalls, 0);
    assert.equal(result.changed, false);
    assert.equal(result.payload.status, "cached");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("dữ liệu giá dự phòng chưa có cache không giả thời điểm cập nhật", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Không được gọi mạng trong bootstrap");
  };

  try {
    const { payload, changed } = await getMarketPrices({
      gold_prices: [{ karat: "14k", cost: 8_000_000, price: 8_350_000 }],
      settings: {},
    });

    assert.equal(fetchCalls, 0);
    assert.equal(changed, false);
    assert.equal(payload.status, "fallback");
    assert.equal(payload.fetchedAt, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
