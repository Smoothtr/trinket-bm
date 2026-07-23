import assert from "node:assert/strict";
import test from "node:test";
import {
  createAccountManager,
  DEFAULT_ACCOUNT_PASSWORD,
  normalizeEmail,
  validateCreatePayload,
  validateNewPassword,
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
  return {
    uid,
    email: `${uid}@trinket.test`,
    name: "Admin",
    role: "admin",
    authenticatedAt: Date.now(),
    local: false,
  };
}

function state(users = []) {
  return { users: [...users], audit_logs: [] };
}

function manager(auth, { persist } = {}) {
  return createAccountManager({
    auth,
    persist: persist || (async () => {}),
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

test("Admin tạo tài khoản Sale bằng mật khẩu mặc định và bắt buộc đổi lần đầu", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const data = state();
  const result = await manager(auth).create(data, actor(), {
    display_name: "  Nhân viên Sale ",
    email: " SALE@EXAMPLE.COM ",
    phone: "0909000000",
    role: "sale",
  });

  assert.equal(result.default_password_applied, true);
  assert.equal(result.user.role, "sale");
  assert.equal(result.user.email, "sale@example.com");
  assert.equal(Object.hasOwn(result.user, "password"), false);
  assert.equal(auth.createdPayloads[0].password, DEFAULT_ACCOUNT_PASSWORD);
  assert.deepEqual(auth.users.get(result.user.uid).customClaims, { role: "sale", mustChangePassword: true });
  assert.equal(data.users[0].status, "active");
  assert.equal(data.users[0].invitation_status, "default_password");
  assert.equal(data.users[0].password_credential_created, true);
  assert.equal(data.users[0].must_change_password, true);
  assert.deepEqual(data.audit_logs.map((log) => log.action), ["user.create"]);
  assert.equal(data.audit_logs.some((log) => Object.keys(log.changes).some((key) => /password|token/i.test(key))), false);
  assert.equal(JSON.stringify(result).includes(auth.createdPayloads[0].password), false);
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

test("tạo tài khoản không phụ thuộc dịch vụ email", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const data = state();
  const result = await manager(auth).create(data, actor(), {
    display_name: "Kế toán",
    email: "accounting@example.com",
    role: "accounting",
  });
  assert.equal(result.default_password_applied, true);
  assert.equal(data.users[0].invitation_status, "default_password");
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

test("Admin xóa tài khoản nhân viên khỏi Firebase và hồ sơ nhưng giữ dữ liệu nghiệp vụ", async () => {
  const auth = new FakeAuth([
    firebaseUser("admin-1", "owner@example.com", "admin"),
    firebaseUser("sale-1", "sale@example.com", "sale"),
  ]);
  const data = state([
    { uid: "admin-1", email: "owner@example.com", display_name: "Chủ shop", role: "admin", status: "active" },
    { uid: "sale-1", email: "sale@example.com", display_name: "Lan Sale", role: "sale", status: "active" },
  ]);
  data.orders = [{ id: "order-1", created_by: "sale-1" }];

  const result = await manager(auth).remove(data, actor(), "sale-1");

  assert.deepEqual(result, { ok: true });
  assert.equal(auth.users.has("sale-1"), false);
  assert.deepEqual(auth.deleted, ["sale-1"]);
  assert.ok(auth.revoked.includes("sale-1"));
  assert.equal(data.users.some((profile) => profile.uid === "sale-1"), false);
  assert.deepEqual(data.orders, [{ id: "order-1", created_by: "sale-1" }]);
  assert.deepEqual(data.audit_logs.map((log) => log.action), ["user.delete"]);
  assert.equal(data.audit_logs[0].changes.target_email, "sale@example.com");
});

test("không thể tự xóa hoặc xóa Admin hoạt động cuối cùng", async () => {
  const auth = new FakeAuth([firebaseUser("admin-1", "owner@example.com", "admin")]);
  const service = manager(auth);

  await assert.rejects(
    service.remove(state(), actor(), "admin-1"),
    (error) => error.statusCode === 409 && error.code === "cannot-delete-self",
  );
  await assert.rejects(
    service.remove(state(), actor("admin-2"), "admin-1"),
    (error) => error.statusCode === 409 && error.code === "last-admin",
  );
  assert.equal(auth.users.has("admin-1"), true);
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

test("Admin reset mật khẩu về mặc định, bật cờ bắt buộc đổi và thu hồi phiên cũ", async () => {
  const auth = new FakeAuth([
    firebaseUser("admin-1", "owner@example.com", "admin"),
    firebaseUser("sale-1", "sale@example.com", "sale"),
  ]);
  const data = state([{
    uid: "sale-1",
    firebaseUid: "sale-1",
    email: "sale@example.com",
    display_name: "Sale",
    role: "sale",
    status: "active",
    invitation_status: "accepted",
    must_change_password: false,
  }]);

  const result = await manager(auth).resetPassword(data, actor(), "sale-1");

  assert.deepEqual(result, { ok: true, self_reset: false });
  assert.equal(auth.users.get("sale-1").password, DEFAULT_ACCOUNT_PASSWORD);
  assert.equal(auth.users.get("sale-1").customClaims.mustChangePassword, true);
  assert.equal(data.users[0].password_credential_created, true);
  assert.equal(data.users[0].must_change_password, true);
  assert.ok(auth.revoked.includes("sale-1"));
  assert.deepEqual(data.audit_logs.map((log) => log.action), ["user.password_reset"]);
  assert.equal(JSON.stringify(data.audit_logs).includes(DEFAULT_ACCOUNT_PASSWORD), false);
});

test("người dùng bắt buộc đổi mật khẩu có thể đặt mật khẩu mới và cờ được gỡ bỏ", async () => {
  const auth = new FakeAuth([{
    ...firebaseUser("sale-1", "sale@example.com", "sale"),
    customClaims: { role: "sale", mustChangePassword: true },
  }]);
  const data = state([{
    uid: "sale-1",
    firebaseUid: "sale-1",
    email: "sale@example.com",
    display_name: "Sale",
    role: "sale",
    status: "active",
    must_change_password: true,
  }]);
  const currentActor = { ...actor("sale-1"), role: "sale", mustChangePassword: true };

  const result = await manager(auth).changeOwnPassword(data, currentActor, { password: "MatKhauMoi2026" });

  assert.deepEqual(result, { ok: true });
  assert.equal(auth.users.get("sale-1").password, "MatKhauMoi2026");
  assert.deepEqual(auth.users.get("sale-1").customClaims, { role: "sale", mustChangePassword: false });
  assert.equal(data.users[0].must_change_password, false);
  assert.equal(data.users[0].invitation_status, "accepted");
  assert.equal(JSON.stringify(data.audit_logs).includes("MatKhauMoi2026"), false);
  assert.throws(() => validateNewPassword(DEFAULT_ACCOUNT_PASSWORD), (error) => error.code === "default-password-reused");
  assert.throws(() => validateNewPassword("matkhaumoi"), (error) => error.code === "weak-password");
});

test("người dùng đã hoạt động có thể chủ động đổi mật khẩu sau khi đăng nhập lại", async () => {
  const auth = new FakeAuth([firebaseUser("sale-1", "sale@example.com", "sale")]);
  const data = state([{
    uid: "sale-1",
    firebaseUid: "sale-1",
    email: "sale@example.com",
    display_name: "Sale",
    role: "sale",
    status: "active",
    must_change_password: false,
  }]);
  const currentActor = { ...actor("sale-1"), role: "sale", mustChangePassword: false };

  await manager(auth).changeOwnPassword(data, currentActor, { password: "MatKhauMoi2027" });

  assert.equal(auth.users.get("sale-1").password, "MatKhauMoi2027");
  assert.deepEqual(auth.users.get("sale-1").customClaims, { role: "sale", mustChangePassword: false });
  assert.ok(auth.revoked.includes("sale-1"));
  assert.deepEqual(data.audit_logs.map((log) => log.action), ["user.password_changed"]);
  assert.equal(JSON.stringify(data.audit_logs).includes("MatKhauMoi2027"), false);
});

test("đổi mật khẩu chủ động yêu cầu phiên đăng nhập mới trong vòng 5 phút", async () => {
  const auth = new FakeAuth([firebaseUser("sale-1", "sale@example.com", "sale")]);
  const currentActor = {
    ...actor("sale-1"),
    role: "sale",
    authenticatedAt: Date.now() - (6 * 60 * 1000),
  };

  await assert.rejects(
    manager(auth).changeOwnPassword(state(), currentActor, { password: "MatKhauMoi2027" }),
    (error) => error.statusCode === 401 && error.code === "recent-login-required",
  );
  assert.equal(auth.users.get("sale-1").password, undefined);
});
