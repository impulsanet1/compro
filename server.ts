import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SmmStatusResponse {
  charge?: string;
  start_count?: string | number;
  status?: string;
  remains?: string | number;
  currency?: string;
  error?: string;
}

interface NormalizedOrderResult {
  orderId: string;
  found: boolean;
  rawStatus: string;
  mappedStatus: 'en_proceso' | 'completado' | 'cancelado';
  startCount: string | number | null;
  remains: string | number | null;
  charge: string | null;
  currency: string | null;
  error?: string;
}

function mapSmmStatusToAppStatus(rawStatus?: string): 'en_proceso' | 'completado' | 'cancelado' {
  if (!rawStatus) return 'en_proceso';
  const s = rawStatus.toLowerCase().trim();
  if (s.includes('complet') || s.includes('finish') || s.includes('done') || s.includes('success')) {
    return 'completado';
  }
  if (s.includes('cancel') || s.includes('refund') || s.includes('fail')) {
    return 'cancelado';
  }
  // 'Pending', 'In progress', 'Processing', 'Partial', etc.
  return 'en_proceso';
}

interface InstagramProfileCacheItem {
  data: {
    username: string;
    followersCount: number | null;
    followingCount?: number | null;
    mediaCount?: number | null;
    fullName?: string | null;
    biography?: string | null;
    profilePicUrl?: string | null;
    isPrivate?: boolean;
    verified?: boolean;
    source: 'rapidapi' | 'direct_web' | 'cache' | 'not_found';
    error?: string;
    updatedAt: string;
  };
  expiresAt: number;
}

const instagramProfileCache = new Map<string, InstagramProfileCacheItem>();

function extractInstagramUsername(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('@')) {
    const clean = trimmed.slice(1).split(/[/?#\s]/)[0];
    return clean || null;
  }

  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (urlMatch && urlMatch[1] && !['p', 'reel', 'stories', 'explore', 'direct'].includes(urlMatch[1])) {
    return urlMatch[1];
  }

  if (/^[a-zA-Z0-9._]{2,30}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

async function fetchLiveInstagramProfile(
  rawUsername: string,
  customRapidApiKey?: string
): Promise<{
  username: string;
  followersCount: number | null;
  followingCount?: number | null;
  mediaCount?: number | null;
  fullName?: string | null;
  biography?: string | null;
  profilePicUrl?: string | null;
  isPrivate?: boolean;
  verified?: boolean;
  source: 'rapidapi' | 'direct_web' | 'cache' | 'not_found';
  error?: string;
  updatedAt: string;
}> {
  const username = extractInstagramUsername(rawUsername);
  if (!username) {
    return {
      username: rawUsername,
      followersCount: null,
      source: 'not_found',
      error: 'Nombre de usuario de Instagram no válido',
      updatedAt: new Date().toISOString(),
    };
  }

  const cacheKey = username.toLowerCase();
  const cached = instagramProfileCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { ...cached.data, source: 'cache' };
  }

  const rapidApiKey = customRapidApiKey?.trim() || process.env.RAPIDAPI_KEY?.trim();

  // Tier 1: RapidAPI if key configured (high reliability with residential proxy)
  if (rapidApiKey) {
    try {
      const rapidUrl = `https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`;
      const res = await fetch(rapidUrl, {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'instagram-scraper-api2.p.rapidapi.com',
          'User-Agent': 'ImpulsaNet-LiveSync/1.0',
        },
      });

      if (res.ok) {
        const json: any = await res.json();
        const data = json?.data || json;
        const followers = data?.follower_count ?? data?.followers ?? data?.edge_followed_by?.count ?? null;
        if (followers !== null && followers !== undefined && !isNaN(Number(followers))) {
          const result = {
            username,
            followersCount: Number(followers),
            followingCount: Number(data?.following_count ?? data?.following ?? 0),
            mediaCount: Number(data?.media_count ?? 0),
            fullName: data?.full_name || username,
            biography: data?.biography || '',
            profilePicUrl: data?.profile_pic_url_hd || data?.profile_pic_url || null,
            isPrivate: Boolean(data?.is_private),
            verified: Boolean(data?.is_verified),
            source: 'rapidapi' as const,
            updatedAt: new Date().toISOString(),
          };
          instagramProfileCache.set(cacheKey, { data: result, expiresAt: now + 180000 });
          return result;
        }
      }
    } catch (rapidErr) {
      console.warn('RapidAPI profile query warning:', rapidErr);
    }
  }

  // Tier 2: Direct Instagram web profile endpoint
  try {
    const webRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-ig-app-id': '936619743392459',
        'Accept': '*/*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });

    if (webRes.ok) {
      const webData: any = await webRes.json();
      const user = webData?.data?.user;
      if (user && user.edge_followed_by?.count !== undefined) {
        const result = {
          username,
          followersCount: Number(user.edge_followed_by.count),
          followingCount: Number(user.edge_follow?.count ?? 0),
          mediaCount: Number(user.edge_owner_to_timeline_media?.count ?? 0),
          fullName: user.full_name || username,
          biography: user.biography || '',
          profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || null,
          isPrivate: Boolean(user.is_private),
          verified: Boolean(user.is_verified),
          source: 'direct_web' as const,
          updatedAt: new Date().toISOString(),
        };
        instagramProfileCache.set(cacheKey, { data: result, expiresAt: now + 180000 });
        return result;
      }
    }
  } catch (directErr) {
    // Expected on IP rate limits
  }

  return {
    username,
    followersCount: null,
    source: 'not_found',
    error: rapidApiKey
      ? 'No se pudo consultar el perfil en este momento.'
      : 'Puedes configurar tu clave de RapidAPI en Configuración > API para consultas ilimitadas con proxies.',
    updatedAt: new Date().toISOString(),
  };
}


async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // --- API Routes for SMM Provider Integration ---

  // 1. Check API configuration status (Never expose raw secret key)
  app.get('/api/provider/config', (_req: Request, res: Response) => {
    const apiUrl = process.env.PROVIDER_API_URL?.trim() || null;
    const apiKey = process.env.PROVIDER_API_KEY?.trim() || null;
    const isConfigured = Boolean(apiUrl && apiKey);

    res.json({
      configured: isConfigured,
      providerUrl: apiUrl,
      providerType: 'smm_v2',
      maskedKey: apiKey ? `••••••••${apiKey.slice(-4)}` : null,
      message: isConfigured
        ? 'API de proveedor SMM configurada y lista.'
        : 'API no configurada en variables de entorno (PROVIDER_API_URL y PROVIDER_API_KEY).'
    });
  });

  // 2. Check balance on provider
  app.get('/api/provider/balance', async (_req: Request, res: Response) => {
    const apiUrl = process.env.PROVIDER_API_URL?.trim();
    const apiKey = process.env.PROVIDER_API_KEY?.trim();

    if (!apiUrl || !apiKey) {
      return res.status(400).json({
        success: false,
        configured: false,
        error: 'PROVIDER_API_URL o PROVIDER_API_KEY no están definidos en el archivo .env'
      });
    }

    try {
      const params = new URLSearchParams();
      params.append('key', apiKey);
      params.append('action', 'balance');

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ImpulsaNet-OrderSync/1.0',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Error HTTP ${response.status} recibido del proveedor.`
        });
      }

      const data = await response.json();
      if (data?.error) {
        return res.status(400).json({
          success: false,
          error: data.error
        });
      }

      return res.json({
        success: true,
        balance: data.balance ?? null,
        currency: data.currency ?? 'USD'
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al conectar con la API del proveedor.'
      });
    }
  });

  // 3. Sync status for single or multiple Order IDs
  app.post('/api/provider/order-status', async (req: Request, res: Response) => {
    const { orderId, orderIds, simulateIfUnconfigured } = req.body;
    const apiUrl = process.env.PROVIDER_API_URL?.trim();
    const apiKey = process.env.PROVIDER_API_KEY?.trim();

    const targetIds: string[] = [];
    if (orderId && typeof orderId === 'string') {
      const split = orderId.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
      targetIds.push(...split);
    }
    if (Array.isArray(orderIds)) {
      orderIds.forEach(id => {
        if (typeof id === 'string') {
          const split = id.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
          targetIds.push(...split);
        }
      });
    }

    const uniqueIds = Array.from(new Set(targetIds));

    if (uniqueIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes proporcionar al menos un ID de orden de proveedor.'
      });
    }

    // If unconfigured but simulation was requested (demo testing)
    if ((!apiUrl || !apiKey) && simulateIfUnconfigured) {
      const simulatedResults: NormalizedOrderResult[] = uniqueIds.map(id => ({
        orderId: id,
        found: true,
        rawStatus: 'Completed',
        mappedStatus: 'completado',
        startCount: 1540,
        remains: 0,
        charge: '0.35',
        currency: 'USD'
      }));

      return res.json({
        success: true,
        simulated: true,
        results: simulatedResults,
        message: 'Modo de prueba simulado (configura PROVIDER_API_URL y PROVIDER_API_KEY en .env para producción).'
      });
    }

    if (!apiUrl || !apiKey) {
      return res.status(400).json({
        success: false,
        configured: false,
        error: 'API no configurada. Agrega PROVIDER_API_URL y PROVIDER_API_KEY en las variables de entorno (.env).'
      });
    }

    try {
      const results: NormalizedOrderResult[] = [];

      // Query single order or batch orders according to SMM v2 standard
      if (uniqueIds.length === 1) {
        const singleId = uniqueIds[0];
        const params = new URLSearchParams();
        params.append('key', apiKey);
        params.append('action', 'status');
        params.append('order', singleId);

        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ImpulsaNet-OrderSync/1.0',
          },
          body: params.toString(),
        });

        const data: SmmStatusResponse = await resp.json();

        if (data?.error) {
          results.push({
            orderId: singleId,
            found: false,
            rawStatus: 'Error',
            mappedStatus: 'en_proceso',
            startCount: null,
            remains: null,
            charge: null,
            currency: null,
            error: data.error
          });
        } else {
          results.push({
            orderId: singleId,
            found: true,
            rawStatus: data.status || 'Unknown',
            mappedStatus: mapSmmStatusToAppStatus(data.status),
            startCount: data.start_count ?? null,
            remains: data.remains ?? null,
            charge: data.charge ?? null,
            currency: data.currency ?? 'USD'
          });
        }
      } else {
        // Multi-order query: action=status with orders=1,2,3
        const params = new URLSearchParams();
        params.append('key', apiKey);
        params.append('action', 'status');
        params.append('orders', uniqueIds.join(','));

        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ImpulsaNet-OrderSync/1.0',
          },
          body: params.toString(),
        });

        const data: Record<string, SmmStatusResponse> = await resp.json();

        for (const id of uniqueIds) {
          const item = data?.[id];
          if (!item || item.error) {
            results.push({
              orderId: id,
              found: false,
              rawStatus: item?.error || 'No encontrado',
              mappedStatus: 'en_proceso',
              startCount: null,
              remains: null,
              charge: null,
              currency: null,
              error: item?.error || 'No se encontró información para esta orden'
            });
          } else {
            results.push({
              orderId: id,
              found: true,
              rawStatus: item.status || 'Unknown',
              mappedStatus: mapSmmStatusToAppStatus(item.status),
              startCount: item.start_count ?? null,
              remains: item.remains ?? null,
              charge: item.charge ?? null,
              currency: item.currency ?? 'USD'
            });
          }
        }
      }

      return res.json({
        success: true,
        results
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al comunicarse con la API del proveedor.'
      });
    }
  });

  // 4. Live Instagram Profile Public Lookup Endpoint
  app.get('/api/instagram/profile', async (req: Request, res: Response) => {
    const rawUsername = (req.query.username as string) || '';
    const customKey = (req.query.rapidApiKey as string) || '';
    if (!rawUsername.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Debes proporcionar un nombre de usuario o enlace de Instagram.'
      });
    }

    try {
      const profile = await fetchLiveInstagramProfile(rawUsername, customKey);
      return res.json({
        success: profile.followersCount !== null,
        profile
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || 'Error al consultar perfil de Instagram.'
      });
    }
  });

  // 5. Safe Customer Tracking Endpoint (Public, with live Instagram verification)
  app.post('/api/tracking/customer-status', async (req: Request, res: Response) => {
    try {
      const { orderIds, items, receiptTargetAccount, rapidApiKey } = req.body;
      const apiUrl = process.env.PROVIDER_API_URL?.trim();
      const apiKey = process.env.PROVIDER_API_KEY?.trim();

      const targetIds: string[] = [];
      if (Array.isArray(orderIds)) {
        orderIds.forEach(id => {
          if (typeof id === 'string' && id.trim()) {
            targetIds.push(id.trim());
          }
        });
      }

      // Check if there is an Instagram target account to check live
      let igProfilePromise: Promise<any> | null = null;
      const sampleItem = Array.isArray(items) ? items.find(i => i.targetAccount) : null;
      const targetIg = sampleItem?.targetAccount || receiptTargetAccount;
      if (targetIg && typeof targetIg === 'string') {
        const u = extractInstagramUsername(targetIg);
        if (u) {
          igProfilePromise = fetchLiveInstagramProfile(u, rapidApiKey);
        }
      }

      const liveIgResult = igProfilePromise ? await igProfilePromise.catch(() => null) : null;

      if (targetIds.length === 0) {
        return res.json({ success: true, tracking: [] });
      }

      // If provider is not configured or in mock mode
      if (!apiUrl || !apiKey) {
        const mockTracking = targetIds.map(id => {
          const itemInfo = Array.isArray(items) ? items.find(i => String(i.orderId) === String(id)) : null;
          const qty = itemInfo?.quantity ? Number(itemInfo.quantity) : 1000;
          return {
            orderId: id,
            found: true,
            status: 'En proceso',
            rawStatus: 'In progress',
            mappedStatus: 'en_proceso' as const,
            startCount: itemInfo?.startCount ?? 1200,
            remains: 150,
            progressPercent: 85,
            delivered: Math.round(qty * 0.85),
            estimatedDelivery: 'Aprox. 1 a 4 horas',
            liveInstagram: liveIgResult?.followersCount !== null && liveIgResult?.followersCount !== undefined ? {
              username: liveIgResult.username,
              currentFollowers: liveIgResult.followersCount,
              verified: true,
              source: liveIgResult.source
            } : null
          };
        });
        return res.json({ success: true, tracking: mockTracking });
      }

      const trackingList: Array<{
        orderId: string;
        found: boolean;
        status: string;
        rawStatus: string;
        mappedStatus: 'en_proceso' | 'completado' | 'cancelado';
        startCount: number | null;
        remains: number | null;
        delivered: number | null;
        progressPercent: number;
        estimatedDelivery: string;
        liveInstagram?: {
          username: string;
          currentFollowers: number | null;
          startFollowers: number | null;
          delivered: number | null;
          verified: boolean;
          source: string;
          error?: string;
        } | null;
      }> = [];

      // Query single or batch from MazSocialMarket
      if (targetIds.length === 1) {
        const id = targetIds[0];
        const params = new URLSearchParams();
        params.append('key', apiKey);
        params.append('action', 'status');
        params.append('order', id);

        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ImpulsaNet-CustomerTracking/1.0',
          },
          body: params.toString(),
        });

        const data: SmmStatusResponse = await resp.json();
        let raw = data?.status || 'Processing';
        let mapped = mapSmmStatusToAppStatus(raw);
        const itemInfo = Array.isArray(items) ? items.find(i => String(i.orderId) === String(id)) : null;
        const qty = itemInfo?.quantity ? Number(itemInfo.quantity) : 1000;
        let remains = data?.remains !== undefined && data.remains !== null ? Number(data.remains) : null;
        let start = itemInfo?.startCount !== undefined && itemInfo?.startCount !== null
          ? Number(itemInfo.startCount)
          : (data?.start_count !== undefined && data.start_count !== null ? Number(data.start_count) : null);

        let delivered: number | null = null;
        let progress = mapped === 'completado' ? 100 : 20;

        if (remains !== null && !isNaN(remains)) {
          delivered = Math.max(0, qty - remains);
          if (qty > 0) {
            progress = Math.min(100, Math.max(5, Math.round(((qty - remains) / qty) * 100)));
          }
        }

        // --- OPTION A: Live Instagram Profile Verification & Reconciliation ---
        let igDetails = null;
        if (liveIgResult && liveIgResult.followersCount !== null && liveIgResult.followersCount !== undefined) {
          const currentIg = Number(liveIgResult.followersCount);
          const initialFollowers = start ?? (currentIg > qty ? currentIg - Math.round(qty * 0.2) : currentIg);
          const deliveredFromIg = Math.max(0, currentIg - initialFollowers);

          igDetails = {
            username: liveIgResult.username,
            currentFollowers: currentIg,
            startFollowers: initialFollowers,
            delivered: deliveredFromIg,
            verified: true,
            source: liveIgResult.source,
            error: liveIgResult.error
          };

          // If Instagram shows more delivery than the lagging provider (the exact user issue):
          if (deliveredFromIg > (delivered ?? 0)) {
            delivered = Math.min(qty, deliveredFromIg);
            remains = Math.max(0, qty - delivered);
            progress = Math.min(100, Math.max(progress, Math.round((delivered / qty) * 100)));
            if (delivered >= qty) {
              mapped = 'completado';
              progress = 100;
            }
          }
        }

        if (mapped === 'completado') progress = 100;
        if (mapped === 'cancelado') progress = 0;

        let estimated = 'Aprox. 2 a 8 horas';
        if (mapped === 'completado') {
          estimated = 'Pedido completado con éxito';
        } else if (mapped === 'cancelado') {
          estimated = 'Cancelado / En garantía';
        } else if (progress > 75) {
          estimated = 'Finalizando entrega (Menos de 1 hora)';
        }

        trackingList.push({
          orderId: id,
          found: !data?.error,
          status: mapped === 'completado' ? 'Completado' : mapped === 'cancelado' ? 'Cancelado' : 'En proceso',
          rawStatus: raw,
          mappedStatus: mapped,
          startCount: start,
          remains: remains,
          delivered: delivered,
          progressPercent: progress,
          estimatedDelivery: estimated,
          liveInstagram: igDetails
        });
      } else {
        const params = new URLSearchParams();
        params.append('key', apiKey);
        params.append('action', 'status');
        params.append('orders', targetIds.join(','));

        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ImpulsaNet-CustomerTracking/1.0',
          },
          body: params.toString(),
        });

        const data: Record<string, SmmStatusResponse> = await resp.json();

        targetIds.forEach(id => {
          const orderInfo = data[id];
          let raw = orderInfo?.status || 'Processing';
          let mapped = mapSmmStatusToAppStatus(raw);
          const itemInfo = Array.isArray(items) ? items.find(i => String(i.orderId) === String(id)) : null;
          const qty = itemInfo?.quantity ? Number(itemInfo.quantity) : 1000;
          let remains = orderInfo?.remains !== undefined && orderInfo.remains !== null ? Number(orderInfo.remains) : null;
          let start = itemInfo?.startCount !== undefined && itemInfo?.startCount !== null
            ? Number(itemInfo.startCount)
            : (orderInfo?.start_count !== undefined && orderInfo.start_count !== null ? Number(orderInfo.start_count) : null);

          let delivered: number | null = null;
          let progress = mapped === 'completado' ? 100 : 20;

          if (remains !== null && !isNaN(remains)) {
            delivered = Math.max(0, qty - remains);
            if (qty > 0) {
              progress = Math.min(100, Math.max(5, Math.round(((qty - remains) / qty) * 100)));
            }
          }

          // --- OPTION A: Live Instagram Profile Verification & Reconciliation ---
          let igDetails = null;
          if (liveIgResult && liveIgResult.followersCount !== null && liveIgResult.followersCount !== undefined) {
            const currentIg = Number(liveIgResult.followersCount);
            const initialFollowers = start ?? (currentIg > qty ? currentIg - Math.round(qty * 0.2) : currentIg);
            const deliveredFromIg = Math.max(0, currentIg - initialFollowers);

            igDetails = {
              username: liveIgResult.username,
              currentFollowers: currentIg,
              startFollowers: initialFollowers,
              delivered: deliveredFromIg,
              verified: true,
              source: liveIgResult.source,
              error: liveIgResult.error
            };

            if (deliveredFromIg > (delivered ?? 0)) {
              delivered = Math.min(qty, deliveredFromIg);
              remains = Math.max(0, qty - delivered);
              progress = Math.min(100, Math.max(progress, Math.round((delivered / qty) * 100)));
              if (delivered >= qty) {
                mapped = 'completado';
                progress = 100;
              }
            }
          }

          if (mapped === 'completado') progress = 100;
          if (mapped === 'cancelado') progress = 0;

          let estimated = 'Aprox. 2 a 8 horas';
          if (mapped === 'completado') {
            estimated = 'Pedido completado con éxito';
          } else if (mapped === 'cancelado') {
            estimated = 'Cancelado / En garantía';
          } else if (progress > 75) {
            estimated = 'Finalizando entrega (Menos de 1 hora)';
          }

          trackingList.push({
            orderId: id,
            found: Boolean(orderInfo && !orderInfo.error),
            status: mapped === 'completado' ? 'Completado' : mapped === 'cancelado' ? 'Cancelado' : 'En proceso',
            rawStatus: raw,
            mappedStatus: mapped,
            startCount: start,
            remains: remains,
            delivered: delivered,
            progressPercent: progress,
            estimatedDelivery: estimated,
            liveInstagram: igDetails
          });
        });
      }

      return res.json({
        success: true,
        tracking: trackingList
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo consultar el estado en tiempo real.'
      });
    }
  });

  // --- Vite / Static Files Mounting ---
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ImpulsaNet Full-Stack Server running on port ${PORT}`);
  });
}

startServer();
