import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { ProviderApiConfig, ProviderOrderSyncResult } from "../types";

const DEFAULT_PROVIDER_URL = "https://mazsocialmarket.com/api/v2";

let runtimeProviderUrl: string | null = null;
let runtimeProviderKey: string | null = null;
let firestoreFetchPromise: Promise<void> | null = null;

export function setCachedProviderCredentials(url?: string | null, key?: string | null) {
  if (url !== undefined) {
    runtimeProviderUrl = url && url.trim() ? url.trim() : null;
  }
  if (key !== undefined) {
    runtimeProviderKey = key && key.trim() ? key.trim() : null;
  }
}

export function clearCachedProviderCredentials() {
  runtimeProviderUrl = null;
  runtimeProviderKey = null;
}

export function getCachedProviderCredentials(): { providerUrl: string; apiKey: string | null } {
  return {
    providerUrl: (runtimeProviderUrl && runtimeProviderUrl.trim()) || DEFAULT_PROVIDER_URL,
    apiKey: (runtimeProviderKey && runtimeProviderKey.trim()) || null,
  };
}

/**
 * Ensures provider credentials from the private Firestore document `config/provider`
 * are loaded into memory when an authenticated admin session is active.
 */
async function ensureProviderCredentialsLoaded(): Promise<{ providerUrl: string; apiKey: string | null }> {
  const current = getCachedProviderCredentials();
  if (current.apiKey) {
    return current;
  }

  if (!auth.currentUser) {
    return current;
  }

  if (!firestoreFetchPromise) {
    firestoreFetchPromise = (async () => {
      try {
        const providerSnap = await getDoc(doc(db, "config", "provider"));
        if (providerSnap.exists()) {
          const data = providerSnap.data();
          const urlVal = String(data?.providerApiUrl || DEFAULT_PROVIDER_URL).trim();
          const keyVal = String(data?.providerApiKey || "").trim();
          if (keyVal) {
            setCachedProviderCredentials(urlVal, keyVal);
          }
        }
      } catch {
        // Ignore permission or network errors
      } finally {
        firestoreFetchPromise = null;
      }
    })();
  }

  await firestoreFetchPromise;
  return getCachedProviderCredentials();
}

/**
 * Builds Authorization: Bearer <ID token> header using await auth.currentUser.getIdToken().
 * Never sends x-provider-* headers.
 */
async function getAuthHeadersAsync(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
  } catch {
    // Ignore token retrieval error
  }
  return headers;
}

/**
 * Universal backend caller for `/api/*` routes that attaches the Firebase ID token.
 * Works on both local Express dev server (`/api/<route>`) and Vercel Serverless (`/api?__path=<route>`).
 */
export async function callBackendApi<T = any>(
  endpointPath: string,
  init?: RequestInit,
  extraQuery?: Record<string, string>
): Promise<T | null> {
  const cleanPath = endpointPath.replace(/^\/+/, "").replace(/^api\/+/, "");
  const searchParams = new URLSearchParams();
  searchParams.set("__path", cleanPath);
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      if (v !== undefined && v !== null) {
        searchParams.set(k, v);
      }
    }
  }
  const qs = searchParams.toString();

  const candidateUrls: string[] = [
    `/api/${cleanPath}?${qs}`,
    `/api?${qs}`,
  ];

  const authHeaders = await getAuthHeadersAsync();

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...authHeaders,
          ...(init?.headers || {}),
        },
        signal: init?.signal || AbortSignal.timeout(12000),
      });

      const text = await res.text();
      const trimmed = text.trim();

      if ((res.status === 401 || res.status === 403 || res.status === 429) && trimmed && !trimmed.startsWith("<")) {
        try {
          return JSON.parse(trimmed) as T;
        } catch {
          return {
            success: false,
            error:
              res.status === 429
                ? "Demasiadas consultas en poco tiempo. Espera un minuto antes de volver a intentar."
                : res.status === 403
                ? "Acceso denegado: solo el administrador tiene permiso."
                : "No autenticado.",
          } as unknown as T;
        }
      }

      if (res.ok && trimmed && !trimmed.startsWith("<")) {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object") {
          return parsed as T;
        }
      }
    } catch {
      // Try next candidate URL
    }
  }

  return null;
}

export interface ProviderSyncResponse {
  success: boolean;
  configured?: boolean;
  simulated?: boolean;
  results?: ProviderOrderSyncResult[];
  error?: string;
  message?: string;
}

export interface ProviderBalanceResponse {
  success: boolean;
  configured?: boolean;
  balance?: string | number;
  currency?: string;
  error?: string;
}

export async function fetchProviderConfig(): Promise<ProviderApiConfig> {
  await ensureProviderCredentialsLoaded();
  const data = await callBackendApi<ProviderApiConfig & { error?: string }>("provider/config");
  if (data && typeof data === "object" && "configured" in data) {
    if (data.providerUrl) setCachedProviderCredentials(data.providerUrl, undefined);
    return data;
  }

  const cached = getCachedProviderCredentials();
  const isConfigured = Boolean(cached.providerUrl && cached.apiKey);
  return {
    configured: isConfigured,
    providerUrl: cached.providerUrl,
    providerType: "smm_v2",
    maskedKey: cached.apiKey ? `••••••••${cached.apiKey.slice(-4)}` : null,
    message: isConfigured
      ? "API de proveedor SMM configurada y lista."
      : "API no configurada. Ingresa tu clave API en Configuración > Integración API.",
  };
}

export interface TestProviderResponse {
  success: boolean;
  balance?: string | number;
  currency?: string;
  message?: string;
  error?: string;
}

export interface SaveProviderResponse {
  success: boolean;
  providerUrl?: string;
  maskedKey?: string;
  balance?: string | number;
  currency?: string;
  message?: string;
  error?: string;
}

export async function testProviderConnection(providerUrl?: string, apiKey?: string): Promise<TestProviderResponse> {
  const cached = await ensureProviderCredentialsLoaded();
  const targetUrl = (providerUrl && providerUrl.trim()) || cached.providerUrl;
  const targetKey = (apiKey && apiKey.trim()) || cached.apiKey || "";

  if (!targetUrl || !targetKey) {
    return {
      success: false,
      error: "Debes proporcionar la URL de la API y la Clave API para realizar la prueba.",
    };
  }

  const backendData = await callBackendApi<TestProviderResponse>("provider/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerUrl: targetUrl, apiKey: targetKey }),
  });

  if (backendData && typeof backendData.success === "boolean") {
    return backendData;
  }

  return {
    success: false,
    error: "No se pudo contactar con el servidor /api para probar la conexión.",
  };
}

export async function saveProviderConfig(providerUrl: string, apiKey: string): Promise<SaveProviderResponse> {
  const cleanUrl = (providerUrl || DEFAULT_PROVIDER_URL).trim();
  const cleanKey = (apiKey || "").trim();

  if (!cleanUrl || !cleanKey) {
    return {
      success: false,
      error: "La URL de la API y la Clave de API son requeridas.",
    };
  }

  const backendData = await callBackendApi<SaveProviderResponse>("provider/save-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerUrl: cleanUrl, apiKey: cleanKey }),
  });

  if (backendData && typeof backendData.success === "boolean") {
    if (backendData.success) {
      setCachedProviderCredentials(cleanUrl, cleanKey);
    }
    return backendData;
  }

  return {
    success: false,
    error: "No se pudo contactar con el servidor /api para verificar las credenciales.",
  };
}

export async function fetchProviderBalance(): Promise<ProviderBalanceResponse> {
  await ensureProviderCredentialsLoaded();
  const backendData = await callBackendApi<ProviderBalanceResponse>("provider/balance");
  if (backendData && typeof backendData.success === "boolean") {
    return backendData;
  }

  return {
    success: false,
    error: "No se pudo consultar el saldo del proveedor a través de /api.",
  };
}

export async function syncOrderWithProvider(
  orderIdOrIds: string | string[],
  simulateIfUnconfigured = false
): Promise<ProviderSyncResponse> {
  await ensureProviderCredentialsLoaded();
  const payload = Array.isArray(orderIdOrIds)
    ? {
        orderIds: orderIdOrIds,
        simulateIfUnconfigured,
      }
    : {
        orderId: orderIdOrIds,
        simulateIfUnconfigured,
      };

  const backendData = await callBackendApi<ProviderSyncResponse>("provider/order-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (backendData && typeof backendData.success === "boolean") {
    return backendData;
  }

  return {
    success: false,
    error: "No se pudo sincronizar el estado de la orden con el servidor /api.",
  };
}

export interface InstagramProfileResponse {
  success: boolean;
  profile?: {
    username: string;
    followersCount: number | null;
    followingCount?: number | null;
    mediaCount?: number | null;
    fullName?: string | null;
    biography?: string | null;
    profilePicUrl?: string | null;
    isPrivate?: boolean;
    verified?: boolean;
    source: "rapidapi" | "direct_web" | "cache" | "simulated" | "not_found";
    error?: string;
    updatedAt: string;
  };
  error?: string;
}

export async function fetchInstagramProfile(usernameOrUrl: string): Promise<InstagramProfileResponse> {
  const data = await callBackendApi<InstagramProfileResponse>("instagram/profile", undefined, {
    username: usernameOrUrl,
  });
  if (data && typeof data === "object") {
    return data;
  }
  return {
    success: false,
    error: "Servicio de perfil temporalmente no disponible.",
  };
}

export interface ApiSystemAuditResult {
  checkedAt: string;
  backendServerOnline: boolean;
  providerConfigured: boolean;
  providerReachable: boolean;
  providerUrl: string;
  maskedKey: string | null;
  balance: string | number | null;
  currency: string;
  latencyMs: number;
  message: string;
}

/**
 * Performs an end-to-end health and connectivity audit of the backend proxy and MazSocialMarket SMM API.
 */
export async function auditProviderApiHealth(): Promise<ApiSystemAuditResult> {
  const startMs = Date.now();
  await ensureProviderCredentialsLoaded();

  const healthJson = await callBackendApi<{ server?: string }>("health", {
    signal: AbortSignal.timeout(6000),
  });
  const backendServerOnline = Boolean(healthJson?.server === "online");

  const cfg = await fetchProviderConfig();
  if (!cfg.configured) {
    return {
      checkedAt: new Date().toISOString(),
      backendServerOnline,
      providerConfigured: false,
      providerReachable: false,
      providerUrl: cfg.providerUrl || DEFAULT_PROVIDER_URL,
      maskedKey: null,
      balance: null,
      currency: "USD",
      latencyMs: Date.now() - startMs,
      message: "La clave API de MazSocialMarket aún no está configurada.",
    };
  }

  const bal = await fetchProviderBalance();
  const latencyMs = Date.now() - startMs;

  if (bal.success) {
    return {
      checkedAt: new Date().toISOString(),
      backendServerOnline,
      providerConfigured: true,
      providerReachable: true,
      providerUrl: cfg.providerUrl || DEFAULT_PROVIDER_URL,
      maskedKey: cfg.maskedKey,
      balance: bal.balance ?? null,
      currency: bal.currency || "USD",
      latencyMs,
      message: `API de MazSocialMarket operativa (${latencyMs} ms). Saldo: $${bal.balance ?? "0.00"} ${bal.currency || "USD"}.`,
    };
  }

  return {
    checkedAt: new Date().toISOString(),
    backendServerOnline,
    providerConfigured: true,
    providerReachable: false,
    providerUrl: cfg.providerUrl || DEFAULT_PROVIDER_URL,
    maskedKey: cfg.maskedKey,
    balance: null,
    currency: "USD",
    latencyMs,
    message: bal.error || "Error al conectar con MazSocialMarket API.",
  };
}
