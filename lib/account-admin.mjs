import crypto from "node:crypto";

const ACCOUNT_ROLES = ["admin", "sale", "ops", "accounting"];
const ACCOUNT_STATUSES = ["active", "disabled"];
const ROLE_LABELS = {
  admin: "Admin / Chủ",
  sale: "Sale",
  ops: "Vận hành / Kho",
  accounting: "Kế toán",
};

function httpError(statusCode, message, code = "") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, parsed);
}

function validateRole(role) {
  const value = normalizeText(role);
  if (!ACCOUNT_ROLES.includes(value)) {
    throw httpError(400, "Vai trò không hợp lệ.", "invalid-role");
  }
  return value;
}

function validateStatus(status, fallback = "active") {
  const value = normalizeText(status || fallback);
  if (!ACCOUNT_STATUSES.includes(value)) {
    throw httpError(400, "Trạng thái tài khoản không hợp lệ.", "invalid-status");
  }
  return value;
}

function validateCreatePayload(body = {}) {
  const displayName = normalizeText(body.display_name ?? body.displayName ?? body.name);
  const email = normalizeEmail(body.email);
  const phone = normalizeText(body.phone);
  const role = validateRole(body.role);
  const status = validateStatus(body.status);
  if (!displayName) throw httpError(400, "Họ và tên là bắt buộc.", "missing-display-name");
  if (displayName.length > 120) throw httpError(400, "Họ và tên không được vượt quá 120 ký tự.", "display-name-too-long");
  if (!isValidEmail(email)) throw httpError(400, "Email đăng nhập không đúng định dạng.", "invalid-email");
  if (email.length > 320) throw httpError(400, "Email đăng nhập quá dài.", "email-too-long");
  if (phone.length > 40) throw httpError(400, "Số điện thoại không được vượt quá 40 ký tự.", "phone-too-long");
  return { displayName, email, phone, role, status };
}

function authError(error, fallback = "Không thể cập nhật tài khoản Firebase.") {
  if (error?.statusCode) return error;
  const code = String(error?.code || error?.errorInfo?.code || "");
  if (["auth/email-already-exists", "auth/email-already-in-use"].includes(code)) {
    return httpError(409, "Email này đã được sử dụng.", "email-exists");
  }
  if (code === "auth/user-not-found") return httpError(404, "Không tìm thấy tài khoản.", "user-not-found");
  if (code === "auth/invalid-email") return httpError(400, "Email đăng nhập không đúng định dạng.", "invalid-email");
  if (["auth/insufficient-permission", "auth/insufficient-permissions"].includes(code)) {
    return httpError(503, "Firebase Admin chưa được cấp quyền quản lý tài khoản.", "firebase-permission");
  }
  const result = httpError(500, fallback, code || "firebase-error");
  result.cause = error;
  return result;
}

function isUserNotFound(error) {
  return String(error?.code || error?.errorInfo?.code || "") === "auth/user-not-found";
}

function profileUid(profile) {
  return normalizeText(profile?.uid || profile?.firebaseUid || profile?.firebase_uid);
}

function findProfile(data, uid) {
  return (data.users || []).find((profile) => profileUid(profile) === uid) || null;
}

function findProfileByEmail(data, email) {
  const normalized = normalizeEmail(email);
  return (data.users || []).find((profile) => normalizeEmail(profile.email) === normalized) || null;
}

function profileRole(profile) {
  const value = normalizeText(profile?.role);
  return ACCOUNT_ROLES.includes(value) ? value : "";
}

function recordRole(record, profile = null) {
  const value = normalizeText(record?.customClaims?.role);
  if (ACCOUNT_ROLES.includes(value)) return value;
  if (record && Object.prototype.hasOwnProperty.call(record, "customClaims")) return "";
  return profileRole(profile);
}

function profileStatus(profile) {
  if (profile?.status === "disabled" || profile?.active === false) return "disabled";
  return "active";
}

function safeAccount(record, profile = null) {
  const uid = normalizeText(record?.uid || profileUid(profile));
  const role = recordRole(record, profile);
  const disabled = Boolean(record?.disabled ?? (profileStatus(profile) === "disabled"));
  return {
    uid,
    display_name: normalizeText(profile?.display_name || profile?.displayName || profile?.name || record?.displayName),
    email: normalizeEmail(record?.email || profile?.email),
    phone: normalizeText(profile?.phone),
    role,
    role_label: ROLE_LABELS[role] || "Chưa gán quyền",
    status: disabled ? "disabled" : "active",
    created_at: profile?.created_at || record?.metadata?.creationTime || null,
    updated_at: profile?.updated_at || null,
    last_login_at: record?.metadata?.lastSignInTime || profile?.last_login_at || null,
    created_by: profile?.created_by || "",
    invitation_status: profile?.invitation_status || "",
  };
}

function upsertProfile(data, account, values = {}) {
  data.users = Array.isArray(data.users) ? data.users : [];
  const index = data.users.findIndex((profile) => profileUid(profile) === account.uid);
  const previous = index >= 0 ? data.users[index] : {};
  const now = new Date().toISOString();
  const profile = {
    ...previous,
    uid: account.uid,
    firebaseUid: account.uid,
    display_name: normalizeText(values.displayName ?? account.display_name ?? previous.display_name ?? previous.name),
    email: normalizeEmail(account.email || previous.email),
    phone: normalizeText(values.phone ?? previous.phone),
    role: validateRole(values.role ?? account.role),
    status: validateStatus(values.status ?? account.status),
    active: (values.status ?? account.status) !== "disabled",
    created_by: values.createdBy ?? previous.created_by ?? "",
    created_at: previous.created_at || values.createdAt || account.created_at || now,
    updated_at: now,
    last_login_at: account.last_login_at || previous.last_login_at || null,
    invitation_status: values.invitationStatus ?? previous.invitation_status ?? "",
  };
  delete profile.id;
  delete profile.name;
  if (index >= 0) data.users[index] = profile;
  else data.users.push(profile);
  return profile;
}

function appendAudit(data, actor, action, target, changes = {}) {
  data.audit_logs = Array.isArray(data.audit_logs) ? data.audit_logs : [];
  data.audit_logs.unshift({
    id: `log_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    action,
    entity: "user",
    entity_id: target.uid,
    user: actor?.email || actor?.name || actor?.uid || "system",
    user_uid: actor?.uid || "",
    user_role: actor?.role || "",
    changes: {
      target_uid: target.uid,
      target_email: target.email,
      ...changes,
    },
    created_at: new Date().toISOString(),
  });
  data.audit_logs = data.audit_logs.slice(0, 500);
}

async function listAuthUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...(page.users || []));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function existingAuthUser(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (isUserNotFound(error)) return null;
    throw authError(error, "Không thể kiểm tra email trong Firebase Authentication.");
  }
}

async function activeAdminCount(auth, data) {
  const records = await listAuthUsers(auth);
  return records.filter((record) => !record.disabled && recordRole(record, findProfile(data, record.uid)) === "admin").length;
}

async function rollbackAuth(auth, before, { claims = true, displayName = true, disabled = true } = {}) {
  const updates = {};
  if (displayName) updates.displayName = before.displayName || null;
  if (disabled) updates.disabled = Boolean(before.disabled);
  if (Object.keys(updates).length) await auth.updateUser(before.uid, updates);
  if (claims) await auth.setCustomUserClaims(before.uid, before.customClaims || {});
  await auth.revokeRefreshTokens(before.uid);
}

async function tryRollbackAuth(auth, before, options) {
  try {
    await rollbackAuth(auth, before, options);
    return true;
  } catch (error) {
    return false;
  }
}

function createAccountManager({
  auth,
  persist,
  sendPasswordEmail,
}) {
  if (!auth || typeof persist !== "function") throw new Error("Thiếu adapter quản lý tài khoản.");

  async function list(data, query = {}) {
    let records;
    try {
      records = await listAuthUsers(auth);
    } catch (error) {
      throw authError(error, "Không thể tải danh sách tài khoản Firebase.");
    }
    const accounts = records
      .map((record) => safeAccount(record, findProfile(data, record.uid)))
      .filter((account) => account.uid && account.email);
    const search = normalizeText(query.q).toLocaleLowerCase("vi");
    const role = normalizeText(query.role);
    const status = normalizeText(query.status);
    const filtered = accounts
      .filter((account) => !search
        || account.display_name.toLocaleLowerCase("vi").includes(search)
        || account.email.includes(search))
      .filter((account) => !role || role === "all" || account.role === role)
      .filter((account) => !status || status === "all" || account.status === status)
      .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
    const pageSize = positiveInteger(query.page_size, 10, 100);
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, positiveInteger(query.page, 1));
    return {
      users: filtered.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, page_size: pageSize, total, pages },
      roles: ACCOUNT_ROLES.map((id) => ({ id, label: ROLE_LABELS[id] })),
    };
  }

  async function create(data, actor, body = {}) {
    const input = validateCreatePayload(body);
    if (findProfileByEmail(data, input.email) || await existingAuthUser(auth, input.email)) {
      throw httpError(409, "Email này đã được sử dụng.", "email-exists");
    }

    let record;
    try {
      record = await auth.createUser({
        email: input.email,
        emailVerified: false,
        displayName: input.displayName,
        disabled: input.status === "disabled",
      });
      await auth.setCustomUserClaims(record.uid, { ...(record.customClaims || {}), role: input.role });
    } catch (error) {
      let rolledBack = true;
      if (record?.uid) {
        try {
          await auth.deleteUser(record.uid);
        } catch (rollbackError) {
          rolledBack = false;
        }
      }
      if (!rolledBack) {
        throw httpError(500, "Tạo Firebase user chưa hoàn tất và rollback thất bại; cần kiểm tra tài khoản trong Firebase Console.", "auth-rollback-failed");
      }
      throw authError(error, "Không thể tạo tài khoản Firebase.");
    }

    const account = safeAccount({ ...record, customClaims: { ...(record.customClaims || {}), role: input.role } });
    account.display_name = input.displayName;
    account.phone = input.phone;
    account.role = input.role;
    account.role_label = ROLE_LABELS[input.role];
    account.status = input.status;
    const profile = upsertProfile(data, account, {
      displayName: input.displayName,
      phone: input.phone,
      role: input.role,
      status: input.status,
      createdBy: actor.uid,
      invitationStatus: "pending",
    });
    appendAudit(data, actor, "user.create", account, {
      role_old: null,
      role_new: input.role,
      status_old: null,
      status_new: input.status,
      result: "success",
    });

    try {
      await persist(data, actor);
    } catch (error) {
      let rolledBack = false;
      try {
        await auth.deleteUser(record.uid);
        rolledBack = true;
      } catch (rollbackError) {
        // The explicit message below tells the operator that recovery is required.
      }
      throw httpError(
        500,
        rolledBack
          ? "Không thể lưu hồ sơ tài khoản; Firebase user đã được rollback."
          : "Không thể lưu hồ sơ và rollback Firebase user thất bại; cần kiểm tra tài khoản trong Firebase Console.",
        rolledBack ? "profile-write-failed" : "auth-rollback-failed",
      );
    }

    let invitationSent = false;
    let warning = "";
    if (input.status === "disabled") {
      warning = "Tài khoản đã được tạo ở trạng thái khóa nên chưa gửi email thiết lập mật khẩu.";
    } else {
      try {
        if (typeof sendPasswordEmail !== "function") throw new Error("Chưa cấu hình dịch vụ gửi email.");
        await sendPasswordEmail(input.email);
        invitationSent = true;
      } catch (error) {
        profile.invitation_status = "failed";
        profile.updated_at = new Date().toISOString();
        warning = "Tài khoản đã được tạo nhưng chưa gửi được email thiết lập mật khẩu.";
        await persist(data, actor).catch(() => {});
      }
      if (invitationSent) {
        profile.invitation_status = "sent";
        profile.updated_at = new Date().toISOString();
        appendAudit(data, actor, "user.password_link_sent", account, { result: "success" });
        try {
          await persist(data, actor);
        } catch (error) {
          warning = "Tài khoản và email thiết lập mật khẩu đã được tạo, nhưng chưa cập nhật được trạng thái gửi trong Audit log.";
        }
      }
    }

    return {
      user: { ...account, invitation_status: profile.invitation_status },
      invitation_sent: invitationSent,
      warning,
    };
  }

  async function update(data, actor, uid, body = {}) {
    let beforeRecord;
    try {
      beforeRecord = await auth.getUser(uid);
    } catch (error) {
      throw authError(error, "Không thể tải tài khoản cần chỉnh sửa.");
    }
    const profile = findProfile(data, uid);
    const before = safeAccount(beforeRecord, profile);
    const displayName = Object.prototype.hasOwnProperty.call(body, "display_name")
      ? normalizeText(body.display_name)
      : before.display_name;
    const phone = Object.prototype.hasOwnProperty.call(body, "phone") ? normalizeText(body.phone) : before.phone;
    const role = Object.prototype.hasOwnProperty.call(body, "role") ? validateRole(body.role) : before.role;
    if (!displayName) throw httpError(400, "Họ và tên là bắt buộc.", "missing-display-name");
    if (displayName.length > 120) throw httpError(400, "Họ và tên không được vượt quá 120 ký tự.", "display-name-too-long");
    if (phone.length > 40) throw httpError(400, "Số điện thoại không được vượt quá 40 ký tự.", "phone-too-long");
    if (!ACCOUNT_ROLES.includes(role)) throw httpError(400, "Tài khoản chưa có role hợp lệ; hãy chọn một vai trò.", "invalid-role");
    if (Object.prototype.hasOwnProperty.call(body, "email") && normalizeEmail(body.email) !== before.email) {
      throw httpError(400, "Email đăng nhập đang được khóa để tránh mất đồng bộ Firebase Authentication.", "email-immutable");
    }

    const roleChanged = role !== before.role;
    if (roleChanged && before.role === "admin" && before.status === "active") {
      let count;
      try {
        count = await activeAdminCount(auth, data);
      } catch (error) {
        throw authError(error, "Không thể xác minh Admin hoạt động cuối cùng.");
      }
      if (count <= 1) throw httpError(409, "Không thể hạ quyền Admin cuối cùng của hệ thống.", "last-admin");
    }

    let firebaseChanged = false;
    try {
      if (displayName !== before.display_name) {
        await auth.updateUser(uid, { displayName });
        firebaseChanged = true;
      }
      if (roleChanged) {
        await auth.setCustomUserClaims(uid, { ...(beforeRecord.customClaims || {}), role });
        firebaseChanged = true;
        await auth.revokeRefreshTokens(uid);
      }
    } catch (error) {
      if (firebaseChanged) {
        const rolledBack = await tryRollbackAuth(auth, beforeRecord);
        if (!rolledBack) {
          throw httpError(500, "Cập nhật Firebase thất bại và không thể rollback hoàn toàn; cần kiểm tra tài khoản trong Firebase Console.", "auth-rollback-failed");
        }
      }
      throw authError(error);
    }

    const account = { ...before, display_name: displayName, phone, role, role_label: ROLE_LABELS[role] };
    upsertProfile(data, account, { displayName, phone, role, status: before.status });
    if (displayName !== before.display_name || phone !== before.phone) {
      appendAudit(data, actor, "user.update", account, {
        display_name_old: before.display_name,
        display_name_new: displayName,
        phone_old: before.phone,
        phone_new: phone,
        result: "success",
      });
    }
    if (roleChanged) {
      appendAudit(data, actor, "user.role_change", account, {
        role_old: before.role,
        role_new: role,
        status_old: before.status,
        status_new: before.status,
        result: "success",
      });
    }

    try {
      await persist(data, actor);
    } catch (error) {
      const rolledBack = await tryRollbackAuth(auth, beforeRecord);
      throw httpError(
        500,
        rolledBack
          ? "Không thể lưu hồ sơ; thay đổi Firebase đã được rollback."
          : "Không thể lưu hồ sơ và rollback Firebase thất bại; cần kiểm tra tài khoản trong Firebase Console.",
        rolledBack ? "profile-write-failed" : "auth-rollback-failed",
      );
    }
    return { user: account, self_role_changed: roleChanged && actor.uid === uid };
  }

  async function setDisabled(data, actor, uid, disabled) {
    let beforeRecord;
    try {
      beforeRecord = await auth.getUser(uid);
    } catch (error) {
      throw authError(error, "Không thể tải tài khoản cần cập nhật.");
    }
    const before = safeAccount(beforeRecord, findProfile(data, uid));
    const nextStatus = disabled ? "disabled" : "active";
    if (!ACCOUNT_ROLES.includes(before.role)) {
      throw httpError(409, "Tài khoản chưa có role hợp lệ; hãy gán vai trò trước.", "invalid-role");
    }
    if (disabled && actor.uid === uid) {
      throw httpError(409, "Bạn không thể tự khóa chính tài khoản đang đăng nhập.", "cannot-disable-self");
    }
    if (disabled && before.role === "admin" && before.status === "active") {
      let count;
      try {
        count = await activeAdminCount(auth, data);
      } catch (error) {
        throw authError(error, "Không thể xác minh Admin hoạt động cuối cùng.");
      }
      if (count <= 1) throw httpError(409, "Không thể khóa Admin cuối cùng của hệ thống.", "last-admin");
    }
    if (before.status === nextStatus) return { user: before, unchanged: true };

    let firebaseChanged = false;
    try {
      await auth.updateUser(uid, { disabled });
      firebaseChanged = true;
      await auth.revokeRefreshTokens(uid);
    } catch (error) {
      if (firebaseChanged) {
        const rolledBack = await tryRollbackAuth(auth, beforeRecord);
        if (!rolledBack) {
          throw httpError(500, "Cập nhật trạng thái Firebase thất bại và không thể rollback hoàn toàn; cần kiểm tra Firebase Console.", "auth-rollback-failed");
        }
      }
      throw authError(error);
    }
    const account = { ...before, status: nextStatus };
    upsertProfile(data, account, { role: before.role, status: nextStatus });
    appendAudit(data, actor, disabled ? "user.disable" : "user.enable", account, {
      role_old: before.role,
      role_new: before.role,
      status_old: before.status,
      status_new: nextStatus,
      result: "success",
    });
    try {
      await persist(data, actor);
    } catch (error) {
      const rolledBack = await tryRollbackAuth(auth, beforeRecord);
      throw httpError(
        500,
        rolledBack
          ? "Không thể lưu trạng thái; thay đổi Firebase đã được rollback."
          : "Không thể lưu trạng thái và rollback Firebase thất bại; cần kiểm tra tài khoản trong Firebase Console.",
        rolledBack ? "profile-write-failed" : "auth-rollback-failed",
      );
    }
    return { user: account };
  }

  async function sendPasswordLink(data, actor, uid) {
    let record;
    try {
      record = await auth.getUser(uid);
    } catch (error) {
      throw authError(error, "Không thể tải tài khoản.");
    }
    const account = safeAccount(record, findProfile(data, uid));
    if (!account.email) throw httpError(400, "Tài khoản chưa có email đăng nhập.", "missing-email");
    if (!ACCOUNT_ROLES.includes(account.role)) {
      throw httpError(409, "Tài khoản chưa có role hợp lệ; hãy gán vai trò trước.", "invalid-role");
    }
    if (account.status === "disabled") {
      throw httpError(409, "Hãy mở khóa tài khoản trước khi gửi email đặt mật khẩu.", "user-disabled");
    }
    if (typeof sendPasswordEmail !== "function") {
      throw httpError(503, "Chưa cấu hình dịch vụ gửi email đặt mật khẩu.", "email-not-configured");
    }
    try {
      await sendPasswordEmail(account.email);
    } catch (error) {
      const message = String(error?.message || "");
      throw httpError(502, message || "Firebase chưa gửi được email đặt mật khẩu.", "password-email-failed");
    }
    const profile = upsertProfile(data, account, {
      role: account.role,
      status: account.status,
      invitationStatus: "sent",
    });
    profile.invitation_status = "sent";
    appendAudit(data, actor, "user.password_link_sent", account, { result: "success" });
    try {
      await persist(data, actor);
      return { ok: true };
    } catch (error) {
      return { ok: true, warning: "Email đã được gửi nhưng chưa ghi được Audit log." };
    }
  }

  return {
    create,
    list,
    sendPasswordLink,
    setDisabled,
    update,
  };
}

async function sendFirebasePasswordResetEmail(email, {
  apiKey = process.env.FIREBASE_WEB_API_KEY || "",
  continueUrl = process.env.AUTH_PASSWORD_RESET_CONTINUE_URL || process.env.APP_BASE_URL || "https://trinket-bm.gg99.vn/",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw httpError(503, "Thiếu FIREBASE_WEB_API_KEY để gửi email đặt mật khẩu.", "missing-api-key");
  const body = { requestType: "PASSWORD_RESET", email: normalizeEmail(email) };
  if (continueUrl) body.continueUrl = continueUrl;
  const response = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Firebase-Locale": "vi",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(payload?.error?.message || "");
    const messages = {
      EMAIL_NOT_FOUND: "Không tìm thấy tài khoản Firebase tương ứng với email.",
      INVALID_EMAIL: "Email đăng nhập không đúng định dạng.",
      OPERATION_NOT_ALLOWED: "Đăng nhập Email/Mật khẩu chưa được bật trong Firebase Authentication.",
      TOO_MANY_ATTEMPTS_TRY_LATER: "Firebase tạm giới hạn gửi email. Vui lòng thử lại sau.",
    };
    throw httpError(response.status >= 500 ? 502 : 400, messages[code] || "Firebase chưa gửi được email đặt mật khẩu.", code);
  }
  return { email: normalizeEmail(payload.email || email) };
}

function createLocalAuthAdapter(data, actor) {
  function records() {
    const profiles = (data.users || [])
      .filter((profile) => profileUid(profile) && normalizeEmail(profile.email))
      .map((profile) => ({
        uid: profileUid(profile),
        email: normalizeEmail(profile.email),
        displayName: normalizeText(profile.display_name || profile.name),
        disabled: profileStatus(profile) === "disabled",
        customClaims: profileRole(profile) ? { role: profileRole(profile) } : {},
        metadata: { creationTime: profile.created_at || null, lastSignInTime: profile.last_login_at || null },
      }));
    if (!profiles.some((record) => record.uid === actor.uid)) {
      profiles.unshift({
        uid: actor.uid,
        email: actor.email,
        displayName: actor.name,
        disabled: false,
        customClaims: { role: "admin" },
        metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() },
      });
    }
    return profiles;
  }
  function notFound() {
    const error = new Error("User not found");
    error.code = "auth/user-not-found";
    return error;
  }
  return {
    async listUsers() {
      return { users: records() };
    },
    async getUser(uid) {
      const record = records().find((item) => item.uid === uid);
      if (!record) throw notFound();
      return record;
    },
    async getUserByEmail(email) {
      const record = records().find((item) => item.email === normalizeEmail(email));
      if (!record) throw notFound();
      return record;
    },
    async createUser(values) {
      return {
        uid: `local_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        email: values.email,
        displayName: values.displayName,
        disabled: Boolean(values.disabled),
        customClaims: {},
        metadata: { creationTime: new Date().toISOString(), lastSignInTime: null },
      };
    },
    async updateUser(uid, values) {
      const record = await this.getUser(uid);
      return { ...record, ...values };
    },
    async setCustomUserClaims() {},
    async revokeRefreshTokens() {},
    async deleteUser() {},
  };
}

export {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  ROLE_LABELS,
  createAccountManager,
  createLocalAuthAdapter,
  normalizeEmail,
  sendFirebasePasswordResetEmail,
  validateCreatePayload,
};
