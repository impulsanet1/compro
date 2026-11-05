import { ProviderApiConfig, ProviderOrderSyncResult } from "../types";

const STORAGE_URL_KEY = "impulsanet_provider_api_url";
const STORAGE_API_KEY = "impulsanet_provider_api_key";
const DEFAULT_PROVIDER_URL = "https://mazsocialmarket.com/api/v2";

let runtimeProviderUrl: string | null = null;
let runtimeProviderKey: string | null = null;

export function setCachedProviderCredentials(url?: string | null, key?: string | null) {
  if (url && url.trim()) {
    runtimeProviderUrl = url.trim();
    try {
      localStorage.setItem(STORAGE_URL_KEY, runtimeProviderUrl);
    } catch {
      // Ignore storage errors
    }
  }
  if (key && key.trim()) {
    runtimeProviderKey = key.trim();
    try {
      localStorage.setItem(STORAGE_API_KEY, runtimeProviderKey);
    } catch {
      // Ignore storage errors
    }
  }
}

export function getCachedProviderCredentials(): { providerUrl: string; apiKey: string | null } {
  let storedUrl = runtimeProviderUrl;
  let storedKey = runtimeProviderKey;
  try {
    if (!storedUrl && typeof window !== "undefined") {
      storedUrl = localStorage.getItem(STORAGE_URL_KEY);
    }
    if (!storedKey && typeof window !== "undefined") {
      storedKey = localStorage.getItem(STORAGE_API_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  return {
    providerUrl: (storedUrl && storedUrl.trim()) || DEFAULT_PROVIDER_URL,
    apiKey: (storedKey && storedKey.trim()) || null,
  };
}

function getAuthHeaders(): Record<string, string> {
  const { providerUrl, apiKey } = getCachedProviderCredentials();
  const headers: Record<string, string> = {};
  if (providerUrl) headers["x-provider-api-url"] = providerUrl;
  if (apiKey) headers["x-provider-api-key"] = apiKey;
  return headers;
}

function mapClientSmmStatus(rawStatus?: string): "procesando" | "en_proceso" | "parcial" | "completado" | "cancelado" {
  if (!rawStatus) return "en_proceso";
  const s = rawStatus.toLowerCase().trim();
  if (s.includes("partial") || s.includes("parcial")) return "parcial";
  if (s.includes("processing") || s.includes("procesan") || s === "pending" || s.includes("pendient")) {
    return "procesando";
  }
  if (s.includes("complet") || s.includes("finish") || s.includes("done") || s.includes("success")) {
    return "completado";
  }
  if (s.includes("cancel") || s.includes("refund") || s.includes("fail")) {
    return "cancelado";
  }
  return "en_proceso";
}

async function callSmmProviderDirect(targetUrl: string, params: URLSearchParams): Promise<any> {
  const bodyStr = params.toString();
  const reqInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyStr,
  };

  try {
    const directRes = await fetch(targetUrl, reqInit);
    const text = await directRes.text();
    return JSON.parse(text);
  } catch {
    // Fallback via CORS proxy when running on static hosting where browser blocks cross-origin POST
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const proxyRes = await fetch(proxyUrl, reqInit);
    const proxyText = await proxyRes.text();
    return JSON.parse(proxyText);
  }
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
  const cached = getCachedProviderCredentials();
  try {
    const res = await fetch("/api/provider/config", {
      headers: getAuthHeaders(),
    });
    const text = await res.text();
    if (!text.trim().startsWith("<")) {
      const data = JSON.parse(text);
      if (data && typeof data === "object") {
        if (data.providerUrl) setCachedProviderCredentials(data.providerUrl, null);
        return data;
      }
    }
  } catch {
    // Fallback to cached state below
  }

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
  const cached = getCachedProviderCredentials();
  const targetUrl = (providerUrl && providerUrl.trim()) || cached.providerUrl;
  const targetKey = (apiKey && apiKey.trim()) || cached.apiKey || "";

  if (!targetUrl || !targetKey) {
    return {
      success: false,
      error: "Debes proporcionar la URL de la API y la Clave API para realizar la prueba.",
    };
  }

  try {
    const res = await fetch("/api/provider/test-connection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ providerUrl: targetUrl, apiKey: targetKey }),
    });
    const text = await res.text();
    if (!text.trim().startsWith("<")) {
      return JSON.parse(text);
    }
  } catch {
    // Fallback to direct call below
  }

  try {
    const params = new URLSearchParams();
    params.append("key", targetKey);
    params.append("action", "balance");
    const data = await callSmmProviderDirect(targetUrl, params);
    if (data?.error) {
      return { success: false, error: `Error reportado por el proveedor: "${data.error}"` };
    }
    if (data?.balance !== undefined) {
      return {
        success: true,
        balance: data.balance,
        currency: data.currency || "USD",
        message: `¡Conexión exitosa! Saldo disponible: $${data.balance} ${data.currency || "USD"}`,
      };
    }
    return { success: false, error: "Respuesta inesperada del proveedor." };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error de red al probar conexión con el proveedor.",
    };
  }
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

  setCachedProviderCredentials(cleanUrl, cleanKey);

  try {
    const res = await fetch("/api/provider/save-config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ providerUrl: cleanUrl, apiKey: cleanKey }),
    });
    const text = await res.text();
    if (!text.trim().startsWith("<")) {
      return JSON.parse(text);
    }
  } catch {
    // Fallback to direct test below if backend route returned HTML on static deploy
  }

  const testRes = await testProviderConnection(cleanUrl, cleanKey);
  if (!testRes.success) {
    return {
      success: false,
      error: testRes.error || "No se pudo verificar la clave API con el proveedor.",
    };
  }

  return {
    success: true,
    providerUrl: cleanUrl,
    maskedKey: `••••••••${cleanKey.slice(-4)}`,
    balance: testRes.balance ?? null,
    currency: testRes.currency ?? "USD",
    message: "¡Credenciales verificadas y guardadas exitosamente!",
  };
}

export async function fetchProviderBalance(): Promise<ProviderBalanceResponse> {
  const cached = getCachedProviderCredentials();
  try {
    const res = await fetch("/api/provider/balance", {
      headers: getAuthHeaders(),
    });
    const text = await res.text();
    if (!text.trim().startsWith("<")) {
      return JSON.parse(text);
    }
  } catch {
    // Fallback to direct balance check below
  }

  if (!cached.apiKey) {
    return {
      success: false,
      configured: false,
      error: "Clave API de MazSocialMarket no configurada. Agrégala en Configuración > Integración API.",
    };
  }

  try {
    const params = new URLSearchParams();
    params.append("key", cached.apiKey);
    params.append("action", "balance");
    const data = await callSmmProviderDirect(cached.providerUrl, params);
    if (data?.error) {
      return { success: false, error: data.error };
    }
    return {
      success: true,
      balance: data.balance ?? null,
      currency: data.currency ?? "USD",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error de red al consultar saldo del proveedor.",
    };
  }
}

export async function syncOrderWithProvider(
  orderIdOrIds: string | string[],
  simulateIfUnconfigured = false
): Promise<ProviderSyncResponse> {
  const cached = getCachedProviderCredentials();
  const payload = Array.isArray(orderIdOrIds)
    ? {
        orderIds: orderIdOrIds,
        simulateIfUnconfigured,
        providerUrl: cached.providerUrl,
        apiKey: cached.apiKey || undefined,
      }
    : {
        orderId: orderIdOrIds,
        simulateIfUnconfigured,
        providerUrl: cached.providerUrl,
        apiKey: cached.apiKey || undefined,
      };

  try {
    const res = await fetch("/api/provider/order-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!text.trim().startsWith("<")) {
      const data = JSON.parse(text);
      return data;
    }
  } catch {
    // Fallback to direct SMM provider call if server returned HTML or was unreachable
  }

  // Extract clean unique order IDs
  const rawList = Array.isArray(orderIdOrIds) ? orderIdOrIds : [orderIdOrIds];
  const uniqueIds = Array.from(
    new Set(
      rawList
        .flatMap((id) => String(id || "").split(/[\s,]+/))
        .map((s) => s.replace(/^#/, "").trim())
        .filter(Boolean)
    )
  );

  if (uniqueIds.length === 0) {
    return {
      success: false,
      error: "Debes proporcionar al menos un ID de orden de proveedor.",
    };
  }

  if (!cached.apiKey) {
    return {
      success: false,
      configured: false,
      error: "La clave API de MazSocialMarket no está configurada. Ingrésala aquí abajo o en Configuración > Integración API.",
    };
  }

  try {
    const results: ProviderOrderSyncResult[] = [];
    if (uniqueIds.length === 1) {
      const singleId = uniqueIds[0];
      const params = new URLSearchParams();
      params.append("key", cached.apiKey);
      params.append("action", "status");
      params.append("order", singleId);

      const data = await callSmmProviderDirect(cached.providerUrl, params);
      if (data?.error) {
        results.push({
          orderId: singleId,
          found: false,
          rawStatus: "Error",
          mappedStatus: "en_proceso",
          startCount: null,
          remains: null,
          charge: null,
          currency: null,
          error: data.error,
        });
      } else {
        results.push({
          orderId: singleId,
          found: true,
          rawStatus: data.status || "Unknown",
          mappedStatus: mapClientSmmStatus(data.status),
          startCount: data.start_count ?? null,
          remains: data.remains ?? null,
          charge: data.charge ?? null,
          currency: data.currency ?? "USD",
        });
      }
    } else {
      const params = new URLSearchParams();
      params.append("key", cached.apiKey);
      params.append("action", "status");
      params.append("orders", uniqueIds.join(","));

      const data = await callSmmProviderDirect(cached.providerUrl, params);
      if (data && typeof data === "object" && data.error && !Array.isArray(data)) {
        for (const id of uniqueIds) {
          results.push({
            orderId: id,
            found: false,
            rawStatus: "Error",
            mappedStatus: "en_proceso",
            startCount: null,
            remains: null,
            charge: null,
            currency: null,
            error: data.error,
          });
        }
      } else {
        for (const id of uniqueIds) {
          const item = data?.[id];
          if (!item || item.error) {
            results.push({
              orderId: id,
              found: false,
              rawStatus: item?.error || "No encontrado",
              mappedStatus: "en_proceso",
              startCount: null,
              remains: null,
              charge: null,
              currency: null,
              error: item?.error || "No se encontró información para esta orden",
            });
          } else {
            results.push({
              orderId: id,
              found: true,
              rawStatus: item.status || "Unknown",
              mappedStatus: mapClientSmmStatus(item.status),
              startCount: item.start_count ?? null,
              remains: item.remains ?? null,
              charge: item.charge ?? null,
              currency: item.currency ?? "USD",
            });
          }
        }
      }
    }

    return {
      success: true,
      results,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error de red al sincronizar con el proveedor.",
    };
  }
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
  try {
    const res = await fetch(`/api/instagram/profile?username=${encodeURIComponent(usernameOrUrl)}`);
    const text = await res.text();
    if (!text.trim().startsWith("<")) {
      return JSON.parse(text);
    }
    return {
      success: false,
      error: "Servicio de perfil temporalmente no disponible.",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error al consultar perfil de Instagram en vivo.",
    };
  }
}
