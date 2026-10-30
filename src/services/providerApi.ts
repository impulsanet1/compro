import { ProviderApiConfig, ProviderOrderSyncResult } from "../types";

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
  try {
    const res = await fetch("/api/provider/config");
    if (!res.ok) {
      return {
        configured: false,
        providerUrl: null,
        providerType: "smm_v2",
        maskedKey: null,
        message: "No se pudo obtener la configuración del servidor."
      };
    }
    return await res.json();
  } catch (err: any) {
    return {
      configured: false,
      providerUrl: null,
      providerType: "smm_v2",
      maskedKey: null,
      message: err.message || "Error al conectar con el servidor."
    };
  }
}

export async function fetchProviderBalance(): Promise<ProviderBalanceResponse> {
  try {
    const res = await fetch("/api/provider/balance");
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error de red al consultar saldo del proveedor."
    };
  }
}

export async function syncOrderWithProvider(
  orderIdOrIds: string | string[],
  simulateIfUnconfigured = false
): Promise<ProviderSyncResponse> {
  try {
    const payload = Array.isArray(orderIdOrIds)
      ? { orderIds: orderIdOrIds, simulateIfUnconfigured }
      : { orderId: orderIdOrIds, simulateIfUnconfigured };

    const res = await fetch("/api/provider/order-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error de red al sincronizar con el proveedor."
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
    source: 'rapidapi' | 'direct_web' | 'cache' | 'simulated' | 'not_found';
    error?: string;
    updatedAt: string;
  };
  error?: string;
}

export async function fetchInstagramProfile(usernameOrUrl: string): Promise<InstagramProfileResponse> {
  try {
    const res = await fetch(`/api/instagram/profile?username=${encodeURIComponent(usernameOrUrl)}`);
    const data = await res.json();
    return data;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Error al consultar perfil de Instagram en vivo."
    };
  }
}

