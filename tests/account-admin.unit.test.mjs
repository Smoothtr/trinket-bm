import assert from "node:assert/strict";
import test from "node:test";
import {
  createAccountManager,
  normalizeEmail,
  sendFirebasePasswordResetEmail,
  validateCreatePayload,
} from "../lib/account-admin.mjs";

class FakeAuth {
  constructor(users = []) {
    this.users = new Map(users.map((user) => [user.uid, {
      disabled: false,
      customClaims: {},
      metadata: { creationTime: "2026-01-01T00:00:00.000Z", lastSignInTime: null },
      ...user,
    }]));
    this.deleted = [];
    this.revoked = [];
    this.createdPayloads = [];
  }

  notFound() {
    const error = new Error("User not found");
    error.code = "auth/user-not-found";
    return error;
  }

  async listUsers() {
    return { users: [...this.users.values()] };
  }

  async getUser(uid) {
    const user = this.users.get(uid);
    if (!user) throw this.notFound();
    return { ...user, customClaims: { ...(user.customClaims || {}) } };
  }

  async getUserByEmail(email) {
    const normalized = normalizeEmail(email);
    const user = [...this.users.values()].find((item) => normalizeEmail(item.email) === normalized);
    if (!user) throw this.notFound();
    return { ...user, customClaims: { ...(user.customClaims || {}) } };
  }

  async createUser(payload) {
    this.createdPayloads.push({ ...payload });
    if ([...this.users.values()].some((item) => normalizeEmail(item.email) === normalizeEmail(payload.email))) {
      const error = new Error("Email exists");
      error.code = "auth/email-already-exists";
      throw error;
    }
    const user = {
      uid: `uid-${this.users.size + 1}`,
      email: payload.email,
      displayName: payload.displayName,
      disabled: Boolean(payload.disabled),
      customClaims: {},
      metadata: { creationTime: "2026-07-23T00:00:00.000Z", lastSignInTime: null },
    };
    this.users.set(user.uid, user);
    return { ...user };
  }

  async updateUser(uid, payload) {
    const user = this.users.get(uid);
    if (!user) throw this.notFound();
    Object.assign(user, payload);
    return { ...user };
  }

  async setCustomUserClaims(uid, claims) {
    const user = this.users.get(uid);
    if (!user) throw this.notFound();
    user.customClaims = { ...claims };
  }

  async revokeRefreshTokens(uid) {
    this.revoked.push(uid);
  }

  async deleteUser(uid) {
    this.deleted.push(uid);
    this.users.delete(uid);
  }
}

function actor(uid = "admin-1") {
  return { uid, email: `${uid}@trinket.test`, name: "Admin", role: "admin" };
}

function state(users = []) {
  return { users: [...users], audit_logs: [] };
}

function manager(auth, { persist, sendPasswordEmail } = {}) {
  return createAccountManager({
    auth,
    persist: persist || (async () => {}),
    sendPasswordEmail: sendPasswordEmail || (async () => {}),
  });
}

function firebaseUser(uid, email, role, disabled = false) {
  return {
    uid,
    email,
    displayName: uid,
    disabled,
    customClaims: { role },
  };
}

test("payload tạo tài khoản chuẩn hóa email và chỉ nhận bốn role hiện có", () => {
  const payload = validateCreatePayload({
    display_name: "  Nguyễn An  ",
    email: "  AN@EXAMPLE.COM ",
    phone: " 0909  ",
    role: "sale",
  });
  assert.deepEqual(payload, {
    displayName: "Nguyễn An",
    email: "an@example.com",
    phone: "0909",
    role: "sale",
    status: "active",
  });
  assert.throws(() => validateCreatePayload({
    display_name: "An",
    email: "an@example.com",
    role: "manager",
  }), (error) => error.statusCode === 400);
  assert.throws(() => validateCreatePayload({
    display_name: "An",
    email: "khong-hop-le",
    role: "sale",
  }), (error) => error.statusCode === 400);
});

test("Admin tạo tài khoản Sale không tạo hay trả mật khẩu và ghi đủ audit", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const data = state();
  const emails = [];
  const result = await manager(auth, {
    sendPasswordEmail: async (email) => emails.push(email),
  }).create(data, actor(), {
    display_name: "  Nhân viên Sale ",
    email: " SALE@EXAMPLE.COM ",
    phone: "0909000000",
    role: "sale",
  });

  assert.equal(result.invitation_sent, true);
  assert.equal(result.user.role, "sale");
  assert.equal(result.user.email, "sale@example.com");
  assert.equal(Object.hasOwn(result.user, "password"), false);
  assert.equal(Object.hasOwn(auth.createdPayloads[0], "password"), false);
  assert.deepEqual(auth.users.get(result.user.uid).customClaims, { role: "sale" });
  assert.deepEqual(emails, ["sale@example.com"]);
  assert.equal(data.users[0].status, "active");
  assert.equal(data.users[0].invitation_status, "sent");
  assert.deepEqual(data.audit_logs.map((log) => log.action), ["user.password_link_sent", "user.create"]);
  assert.equal(data.audit_logs.some((log) => Object.keys(log.changes).some((key) => /password|token/i.test(key))), false);
});

test("Admin tạo thành công tài khoản Vận hành/Kho và Kế toán", async () => {
  for (const role of ["ops", "accounting"]) {
    const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
    const data = state();
    const result = await manager(auth).create(data, actor(), {
      display_name: role === "ops" ? "Nhân viên Kho" : "Nhân viên Kế toán",
      email: `${role}@example.com`,
      role,
    });
    assert.equal(result.user.role, role);
    assert.equal(auth.users.get(result.user.uid).customClaims.role, role);
    assert.equal(data.users[0].role, role);
  }
});

test("email trùng ở Firebase hoặc hồ sơ bị từ chối bằng 409", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const service = manager(auth);
  await assert.rejects(service.create(state(), actor(), {
    display_name: "Trùng",
    email: "OWNER@example.com",
    role: "sale",
  }), (error) => error.statusCode === 409);
  await assert.rejects(service.create(state([{ uid: "legacy", email: "db@example.com", role: "sale" }]), actor(), {
    display_name: "Trùng DB",
    email: "DB@example.com",
    role: "ops",
  }), (error) => error.statusCode === 409);
});

test("tạo hồ sơ thất bại sẽ rollback Firebase Auth user", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const data = state();
  await assert.rejects(manager(auth, {
    persist: async () => { throw new Error("Firestore unavailable"); },
  }).create(data, actor(), {
    display_name: "Kho",
    email: "ops@example.com",
    role: "ops",
  }), (error) => error.statusCode === 500 && error.code === "profile-write-failed");
  assert.deepEqual(auth.deleted, ["uid-2"]);
  assert.equal(auth.users.has("uid-2"), false);
});

test("gửi email lỗi vẫn giữ tài khoản và đánh dấu gửi thất bại", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const data = state();
  const result = await manager(auth, {
    sendPasswordEmail: async () => { throw new Error("Email provider unavailable"); },
  }).create(data, actor(), {
    display_name: "Kế toán",
    email: "accounting@example.com",
    role: "accounting",
  });
  assert.equal(result.invitation_sent, false);
  assert.match(result.warning, /chưa gửi được email/i);
  assert.equal(data.users[0].invitation_status, "failed");
  assert.equal(auth.users.has(result.user.uid), true);
});

test("không thể tự khóa, khóa Admin cuối cùng hoặc hạ quyền Admin cuối cùng", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const data = state();
  const service = manager(auth);
  await assert.rejects(service.setDisabled(data, actor(), "admin-1", true), (error) => error.code === "cannot-disable-self");
  await assert.rejects(service.update(data, actor(), "admin-1", { role: "sale" }), (error) => error.code === "last-admin");

  const otherActor = actor("admin-2");
  await assert.rejects(service.setDisabled(data, otherActor, "admin-1", true), (error) => error.code === "last-admin");
});

test("khi còn Admin khác có thể đổi role và khóa; phiên cũ bị thu hồi", async () => {
  const auth = new FakeAuth([
    firebaseUser("admin-1", "one@example.com", "admin"),
    firebaseUser("admin-2", "two@example.com", "admin"),
  ]);
  const data = state();
  const service = manager(auth);
  const updated = await service.update(data, actor("admin-2"), "admin-1", {
    display_name: "Sale mới",
    phone: "0901",
    role: "sale",
  });
  assert.equal(updated.user.role, "sale");
  assert.equal(auth.users.get("admin-1").customClaims.role, "sale");
  assert.ok(auth.revoked.includes("admin-1"));
  assert.ok(data.audit_logs.some((log) => log.action === "user.role_change"));

  await service.setDisabled(data, actor("admin-2"), "admin-1", true);
  assert.equal(auth.users.get("admin-1").disabled, true);
  assert.ok(data.audit_logs.some((log) => log.action === "user.disable"));
  await service.setDisabled(data, actor("admin-2"), "admin-1", false);
  assert.equal(auth.users.get("admin-1").disabled, false);
  assert.ok(data.audit_logs.some((log) => log.action === "user.enable"));
});

test("danh sách hỗ trợ tìm kiếm, lọc và phân trang, không trả trường nhạy cảm", async () => {
  const auth = new FakeAuth([
    firebaseUser("admin-1", "owner@example.com", "admin"),
    firebaseUser("sale-1", "sale@example.com", "sale"),
    firebaseUser("ops-1", "ops@example.com", "ops", true),
  ]);
  const data = state([
    { uid: "admin-1", email: "owner@example.com", display_name: "Chủ shop", role: "admin", status: "active" },
    { uid: "sale-1", email: "sale@example.com", display_name: "Lan Sale", role: "sale", status: "active" },
    { uid: "ops-1", email: "ops@example.com", display_name: "Minh Kho", role: "ops", status: "disabled" },
  ]);
  const result = await manager(auth).list(data, { q: "minh", role: "ops", status: "disabled", page_size: 1 });
  assert.equal(result.pagination.total, 1);
  assert.equal(result.users[0].uid, "ops-1");
  assert.equal(Object.hasOwn(result.users[0], "customClaims"), false);
  assert.equal(JSON.stringify(result).includes("passwordHash"), false);
});

test("email đặt mật khẩu dùng Firebase sendOobCode và không trả link nhạy cảm", async () => {
  let request;
  const result = await sendFirebasePasswordResetEmail(" SALE@EXAMPLE.COM ", {
    apiKey: "public-web-key",
    continueUrl: "https://trinket-bm.gg99.vn/",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        async json() { return { email: "sale@example.com" }; },
      };
    },
  });
  assert.match(request.url, /accounts:sendOobCode/);
  assert.deepEqual(request.body, {
    requestType: "PASSWORD_RESET",
    email: "sale@example.com",
    continueUrl: "https://trinket-bm.gg99.vn/",
  });
  assert.equal(request.options.headers["X-Firebase-Locale"], "vi");
  assert.deepEqual(result, { email: "sale@example.com" });
  assert.equal(Object.hasOwn(result, "link"), false);
});
