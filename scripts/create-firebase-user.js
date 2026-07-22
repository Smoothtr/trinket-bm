const crypto = require("crypto");
const { getFirebaseServices } = require("../lib/firebase-admin");
const { ROLES } = require("../lib/auth");

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main() {
  const email = argument("email").trim().toLowerCase();
  const role = argument("role", "sale").trim();
  const name = argument("name", email.split("@")[0] || "Nhân viên").trim();
  if (!email) throw new Error("Thiếu --email=...");
  if (!ROLES.includes(role)) throw new Error(`Role phải là một trong: ${ROLES.join(", ")}`);

  const { auth, firestore } = getFirebaseServices();
  let user;
  let created = false;
  let generatedPassword = "";
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    generatedPassword = process.env.FIREBASE_USER_PASSWORD || argument("password") || crypto.randomBytes(12).toString("base64url");
    user = await auth.createUser({ email, password: generatedPassword, displayName: name, emailVerified: false });
    created = true;
  }

  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role });
  await firestore.collection("staff_users").doc(user.uid).set({
    uid: user.uid,
    email,
    name,
    role,
    active: !user.disabled,
    updated_at: new Date().toISOString(),
    ...(created ? { created_at: new Date().toISOString() } : {}),
  }, { merge: true });

  console.log(JSON.stringify({ uid: user.uid, email, name, role, created }, null, 2));
  if (generatedPassword && !hasFlag("no-print-password")) {
    console.log(`Mật khẩu tạm (chỉ hiển thị lần này): ${generatedPassword}`);
  }
  if (generatedPassword && hasFlag("no-print-password")) {
    console.log("Mật khẩu tạm đã được tạo nhưng không in ra. Dùng 'Quên mật khẩu' trên màn hình đăng nhập để đặt mật khẩu mới.");
  }
  if (!created) console.log("Người dùng cần đăng nhập lại hoặc refresh ID token để nhận role mới.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
