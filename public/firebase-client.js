(function bootstrapTrinketFirebase(global) {
  const SDK_VERSION = "12.16.0";
  const SDK_ROOT = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  let runtime = null;
  let authModule = null;
  let storageModule = null;

  async function loadConfiguration() {
    const response = await fetch("/api/firebase-config", { headers: { Accept: "application/json" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Không tải được cấu hình Firebase.");
    return payload;
  }

  async function initialize() {
    if (runtime) return runtime;
    const configuration = await loadConfiguration();
    if (!configuration.enabled) {
      runtime = {
        enabled: false,
        user: { uid: "local-admin", email: "local@trinket.test", displayName: "Local Admin" },
        role: "admin",
        mustChangePassword: false,
      };
      return runtime;
    }

    const [appModule, loadedAuthModule, loadedStorageModule] = await Promise.all([
      import(`${SDK_ROOT}/firebase-app.js`),
      import(`${SDK_ROOT}/firebase-auth.js`),
      import(`${SDK_ROOT}/firebase-storage.js`),
    ]);
    authModule = loadedAuthModule;
    storageModule = loadedStorageModule;
    const firebaseApp = appModule.initializeApp(configuration.config);
    const auth = loadedAuthModule.getAuth(firebaseApp);
    await loadedAuthModule.setPersistence(auth, loadedAuthModule.browserLocalPersistence);
    const storage = loadedStorageModule.getStorage(firebaseApp);
    const user = await new Promise((resolve) => {
      const unsubscribe = loadedAuthModule.onAuthStateChanged(auth, (currentUser) => {
        unsubscribe();
        resolve(currentUser);
      });
    });

    let role = "";
    let mustChangePassword = false;
    if (user) {
      const tokenResult = await user.getIdTokenResult();
      role = String(tokenResult.claims.role || "");
      mustChangePassword = Boolean(tokenResult.claims.mustChangePassword);
    }
    runtime = { enabled: true, firebaseApp, auth, storage, user, role, mustChangePassword };
    return runtime;
  }

  async function refreshSession(force = false) {
    const current = await initialize();
    if (!current.enabled) return current;
    const user = current.auth.currentUser;
    current.user = user;
    current.role = "";
    current.mustChangePassword = false;
    if (user) {
      const tokenResult = await user.getIdTokenResult(force);
      current.role = String(tokenResult.claims.role || "");
      current.mustChangePassword = Boolean(tokenResult.claims.mustChangePassword);
    }
    return current;
  }

  async function authHeaders() {
    const current = await refreshSession();
    if (!current.enabled) return {};
    if (!current.user) throw new Error("Bạn cần đăng nhập để tiếp tục.");
    return { Authorization: `Bearer ${await current.user.getIdToken()}` };
  }

  async function signIn(email, password) {
    const current = await initialize();
    if (!current.enabled) return current;
    await authModule.signInWithEmailAndPassword(current.auth, email, password);
    return refreshSession(true);
  }

  async function signOut() {
    const current = await initialize();
    if (current.enabled) await authModule.signOut(current.auth);
    return refreshSession();
  }

  async function uploadProductImage(file, path, onProgress = () => {}) {
    const current = await refreshSession();
    if (!current.enabled || !current.user) throw new Error("Bạn cần đăng nhập để tải ảnh.");
    const reference = storageModule.ref(current.storage, path);
    const task = storageModule.uploadBytesResumable(reference, file, {
      contentType: file.type,
      customMetadata: { uploadedBy: current.user.uid },
    });
    return new Promise((resolve, reject) => {
      task.on("state_changed", (snapshot) => {
        const progress = snapshot.totalBytes ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
        onProgress(progress);
      }, reject, () => resolve({
        storage_path: task.snapshot.ref.fullPath,
        content_type: file.type,
        size: file.size,
        original_name: file.name,
      }));
    });
  }

  async function deleteProductImage(path) {
    if (!path) return;
    const current = await refreshSession();
    if (!current.enabled || !current.user) throw new Error("Bạn cần đăng nhập để xóa ảnh.");
    await storageModule.deleteObject(storageModule.ref(current.storage, path));
  }

  async function productImageUrl(path) {
    if (!path) return "";
    const current = await refreshSession();
    if (!current.enabled || !current.user) return "";
    return storageModule.getDownloadURL(storageModule.ref(current.storage, path));
  }

  global.TrinketFirebase = {
    authHeaders,
    deleteProductImage,
    initialize,
    productImageUrl,
    refreshSession,
    signIn,
    signOut,
    uploadProductImage,
  };
})(window);
