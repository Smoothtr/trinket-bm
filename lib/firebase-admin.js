const { applicationDefault, cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

let cachedServices = null;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    let decoded = raw.trim();
    if (!decoded.startsWith("{")) decoded = Buffer.from(decoded, "base64").toString("utf8");
    const account = JSON.parse(decoded);
    if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, "\n");
    return account;
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function hasAdminConfiguration() {
  const hasVercelOidc = Boolean(
    process.env.VERCEL_OIDC_TOKEN
      && process.env.GCP_PROJECT_NUMBER
      && process.env.GCP_SERVICE_ACCOUNT_EMAIL
      && process.env.GCP_WORKLOAD_IDENTITY_POOL_ID
      && process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID,
  );
  return Boolean(
    hasVercelOidc
      || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      || (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
      || process.env.GOOGLE_APPLICATION_CREDENTIALS
      || process.env.FIRESTORE_EMULATOR_HOST
      || (process.env.VERCEL !== "1" && process.env.FIREBASE_ADMIN_ACCESS_TOKEN),
  );
}

function vercelOidcCredentials(projectId) {
  const subjectToken = process.env.VERCEL_OIDC_TOKEN;
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  if (!subjectToken || !projectNumber || !serviceAccountEmail || !poolId || !providerId) return null;

  const { getVercelOidcToken } = require("@vercel/oidc");
  const { ExternalAccountClient } = require("google-auth-library");
  const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: {
      async getSubjectToken() {
        return getVercelOidcToken();
      },
    },
  });
  if (!authClient) throw new Error("Không thể khởi tạo Google Workload Identity cho Vercel.");

  return {
    credential: {
      async getAccessToken() {
        const token = await authClient.getAccessToken();
        return { access_token: token.token, expires_in: 3600 };
      },
    },
    googleAuth: {
      async getClient() {
        return authClient;
      },
      async getProjectId() {
        return projectId;
      },
      async getUniverseDomain() {
        return "googleapis.com";
      },
    },
  };
}

function temporaryAccessTokenCredential() {
  const accessToken = process.env.FIREBASE_ADMIN_ACCESS_TOKEN;
  if (!accessToken || process.env.VERCEL === "1") return null;
  return {
    async getAccessToken() {
      return { access_token: accessToken, expires_in: 3600 };
    },
  };
}

function temporaryGoogleAuth(projectId) {
  const accessToken = process.env.FIREBASE_ADMIN_ACCESS_TOKEN;
  if (!accessToken || process.env.VERCEL === "1") return null;
  return {
    async getClient() {
      return {
        async getRequestHeaders() {
          return new Headers({ Authorization: `Bearer ${accessToken}` });
        },
      };
    },
    async getProjectId() {
      return projectId;
    },
    async getUniverseDomain() {
      return "googleapis.com";
    },
  };
}

function getFirebaseServices() {
  if (cachedServices) return cachedServices;

  const serviceAccount = parseServiceAccount();
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || serviceAccount?.project_id;
  if (!projectId) throw new Error("Thiếu FIREBASE_PROJECT_ID cho Firebase Admin.");
  const accessTokenCredential = temporaryAccessTokenCredential();
  const vercelOidc = vercelOidcCredentials(projectId);

  let app = getApps()[0];
  if (!app) {
    const options = {
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    };
    if (vercelOidc) options.credential = vercelOidc.credential;
    else if (accessTokenCredential) options.credential = accessTokenCredential;
    else if (serviceAccount) options.credential = cert(serviceAccount);
    else options.credential = applicationDefault();
    app = initializeApp(options);
  }

  const googleAuth = vercelOidc?.googleAuth || temporaryGoogleAuth(projectId);
  const firestore = googleAuth
    ? new (require("@google-cloud/firestore").Firestore)({ projectId, auth: googleAuth })
    : getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });
  cachedServices = {
    app,
    auth: getAuth(app),
    firestore,
    storage: googleAuth ? null : getStorage(app),
  };
  return cachedServices;
}

module.exports = {
  getFirebaseServices,
  hasAdminConfiguration,
};
