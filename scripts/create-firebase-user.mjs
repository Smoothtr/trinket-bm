import { createBootstrapPassword, sendFirebasePasswordResetEmail } from "../lib/account-admin.mjs";
import { ROLES } from "../lib/auth.mjs";
import { getFirebaseServices } from "../lib/firebase-admin.mjs";

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
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
  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({
      email,
      displayName: name,
      emailVerified: false,
      password: createBootstrapPassword(),
      disabled: false,
    });
    created = true;
  }

  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), role });
  const now = new Date().toISOString();
  const collectionName = `${process.env.FIRESTORE_COLLECTION_PREFIX || ""}users`;
  await firestore.collection(collectionName).doc(user.uid).set({
    uid: user.uid,
    firebaseUid: user.uid,
    email,
    display_name: name,
    phone: "",
    role,
    status: user.disabled ? "disabled" : "active",
    active: !user.disabled,
    created_by: "firebase:create-user",
    updated_at: now,
    invitation_status: "pending",
    ...(created ? { created_at: now, password_credential_created: true } : {}),
  }, { merge: true });

  let passwordEmailSent = false;
  let passwordEmailError = "";
  try {
    await sendFirebasePasswordResetEmail(email);
    passwordEmailSent = true;
    await firestore.collection(collectionName).doc(user.uid).set({
      invitation_status: "sent",
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    passwordEmailError = error.message || String(error);
    await firestore.collection(collectionName).doc(user.uid).set({
      invitation_status: "failed",
      updated_at: new Date().toISOString(),
    }, { merge: true });
  }

  console.log(JSON.stringify({
    uid: user.uid,
    email,
    name,
    role,
    created,
    passwordEmailSent,
    ...(passwordEmailError ? { warning: passwordEmailError } : {}),
  }, null, 2));
  if (!created) {
    await auth.revokeRefreshTokens(user.uid);
    console.log("Role đã được cập nhật và phiên cũ đã bị thu hồi.");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
