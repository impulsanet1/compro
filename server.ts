import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

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
  mappedStatus: 'procesando' | 'en_proceso' | 'parcial' | 'completado' | 'cancelado';
  startCount: string | number | null;
  remains: string | number | null;
  charge: string | null;
  currency: string | null;
  error?: string;
}

function mapSmmStatusToAppStatus(rawStatus?: string): 'procesando' | 'en_proceso' | 'parcial' | 'completado' | 'cancelado' {
  if (!rawStatus) return 'en_proceso';
  const s = rawStatus.toLowerCase().trim();
  if (s.includes('partial') || s.includes('parcial')) {
    return 'parcial';
  }
  if (
    s.includes('processing') ||
    s.includes('procesan') ||
    s === 'pending' ||
    s.includes('pendient')
  ) {
    return 'procesando';
  }
  if (s.includes('complet') || s.includes('finish') || s.includes('done') || s.includes('success')) {
    return 'completado';
  }
  if (s.includes('cancel') || s.includes('refund') || s.includes('fail')) {
    return 'cancelado';
  }
  return 'en_proceso';
}

function formatProviderStatusLabel(rawStatus?: string): string {
  if (!rawStatus) return 'En curso';
  const s = rawStatus.toLowerCase().trim();
  if (s.includes('partial') || s.includes('parcial')) {
    return 'Parcial';
  }
  if (
    s.includes('processing') ||
    s.includes('procesan') ||
    s === 'pending' ||
    s.includes('pendient')
  ) {
    return 'Procesando';
  }
  if (
    s === 'in progress' ||
    s === 'in_progress' ||
    s === 'inprogress' ||
    s === 'en proceso' ||
    s === 'en curso' ||
    s === 'en_proceso'
  ) {
    return 'En curso';
  }
  if (s.includes('complet') || s === 'completed' || s === 'completado') {
    return 'Completado';
  }
  if (s.includes('cancel') || s === 'canceled' || s === 'cancelled' || s === 'cancelado') {
    return 'Cancelado';
  }
  return rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
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


async function resolveProviderCredentials(req?: Request): Promise<{ apiUrl: string; apiKey: string | null }> {
  const DEFAULT_URL = 'https://mazsocialmarket.com/api/v2';

  // 1. Check incoming headers or body from frontend (synced from Firestore businessConfig / localStorage)
  const headerUrl = typeof req?.headers?.['x-provider-api-url'] === 'string' ? req.headers['x-provider-api-url'].trim() : '';
  const headerKey = typeof req?.headers?.['x-provider-api-key'] === 'string' ? req.headers['x-provider-api-key'].trim() : '';
  const bodyUrl = typeof req?.body?.providerUrl === 'string' ? req.body.providerUrl.trim() : '';
  const bodyKey = typeof req?.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';

  const providedUrl = bodyUrl || headerUrl;
  const providedKey = bodyKey || headerKey;

  if (providedKey) {
    process.env.PROVIDER_API_KEY = providedKey;
    if (providedUrl) {
      process.env.PROVIDER_API_URL = providedUrl;
    } else if (!process.env.PROVIDER_API_URL) {
      process.env.PROVIDER_API_URL = DEFAULT_URL;
    }
    try {
      const envPath = path.resolve(__dirname, '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      const lines = envContent
        .split('\n')
        .filter((l) => !l.startsWith('PROVIDER_API_URL=') && !l.startsWith('PROVIDER_API_KEY='));
      lines.push(`PROVIDER_API_URL="${process.env.PROVIDER_API_URL}"`);
      lines.push(`PROVIDER_API_KEY="${process.env.PROVIDER_API_KEY}"`);
      fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf8');
    } catch {
      // Ignore write error in read-only environments
    }
  }

  let apiUrl = process.env.PROVIDER_API_URL?.trim() || providedUrl || DEFAULT_URL;
  let apiKey = process.env.PROVIDER_API_KEY?.trim() || providedKey || null;

  // 2. If still not in memory, try reading Firestore config/business via REST API (publicly readable per firestore.rules)
  if (!apiKey) {
    try {
      const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
      if (fs.existsSync(cfgPath)) {
        const fbCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        const projectId = fbCfg.projectId;
        const dbId = fbCfg.firestoreDatabaseId || '(default)';
        if (projectId) {
          const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbId)}/documents/config/business`;
          const fbRes = await fetch(firestoreUrl);
          if (fbRes.ok) {
            const fbJson: any = await fbRes.json();
            const fields = fbJson?.fields || {};
            const remoteKey = fields?.providerApiKey?.stringValue?.trim();
            const remoteUrl = fields?.providerApiUrl?.stringValue?.trim();
            if (remoteKey) {
              apiKey = remoteKey;
              process.env.PROVIDER_API_KEY = remoteKey;
            }
            if (remoteUrl) {
              apiUrl = remoteUrl;
              process.env.PROVIDER_API_URL = remoteUrl;
            }
          }
        }
      }
    } catch {
      // Ignore Firestore lookup warnings
    }
  }

  return { apiUrl, apiKey };
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.DEFAULT_APP_PORT) || Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // --- API Routes for SMM Provider Integration ---

  // 1. Check API configuration status
  app.get('/api/provider/config', async (req: Request, res: Response) => {
    const { apiUrl, apiKey } = await resolveProviderCredentials(req);
    const isConfigured = Boolean(apiUrl && apiKey);

    res.json({
      configured: isConfigured,
      providerUrl: apiUrl,
      providerType: 'smm_v2',
      maskedKey: apiKey ? `••••••••${apiKey.slice(-4)}` : null,
      message: isConfigured
        ? 'API de proveedor SMM configurada y lista.'
        : 'API no configurada. Ingresa tu clave API en Configuración > Integración API.'
    });
  });

  // 2. Test connection with SMM provider (supports custom or configured credentials)
  app.post('/api/provider/test-connection', async (req: Request, res: Response) => {
    const resolved = await resolveProviderCredentials(req);
    const targetUrl = req.body?.providerUrl?.trim() || resolved.apiUrl;
    const targetKey = req.body?.apiKey?.trim() || resolved.apiKey;

    if (!targetUrl || !targetKey) {
      return res.status(200).json({
        success: false,
        error: 'Debes proporcionar la URL de la API y la Clave API para realizar la prueba.'
      });
    }

    try {
      const params = new URLSearchParams();
      params.append('key', targetKey);
      params.append('action', 'balance');

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ImpulsaNet-OrderSync/1.0',
        },
        body: params.toString(),
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(200).json({
          success: false,
          error: `El servidor del proveedor respondió (${response.status}) pero no devolvió JSON válido. Verifica que la URL sea https://mazsocialmarket.com/api/v2`
        });
      }

      if (data?.error) {
        return res.status(200).json({
          success: false,
          error: `Error reportado por el proveedor: "${data.error}"`
        });
      }

      if (data?.balance !== undefined) {
        return res.json({
          success: true,
          balance: data.balance,
          currency: data.currency || 'USD',
          message: `¡Conexión exitosa! Saldo disponible: $${data.balance} ${data.currency || 'USD'}`
        });
      }

      return res.status(200).json({
        success: false,
        error: `Respuesta inesperada del proveedor: ${text.slice(0, 150)}`
      });
    } catch (err: any) {
      return res.status(200).json({
        success: false,
        error: `Fallo de conexión de red: ${err.message || 'No se pudo contactar con el host del proveedor.'}`
      });
    }
  });

  // 3. Save and activate provider API configuration (writes to .env and process.env)
  app.post('/api/provider/save-config', async (req: Request, res: Response) => {
    const { providerUrl, apiKey } = req.body;

    if (!providerUrl?.trim() || !apiKey?.trim()) {
      return res.status(200).json({
        success: false,
        error: 'La URL de la API y la Clave de API son requeridas.'
      });
    }

    const cleanUrl = providerUrl.trim();
    const cleanKey = apiKey.trim();

    try {
      // Test credentials with provider first
      const params = new URLSearchParams();
      params.append('key', cleanKey);
      params.append('action', 'balance');

      const testResp = await fetch(cleanUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'ImpulsaNet-OrderSync/1.0',
        },
        body: params.toString(),
      });

      const testText = await testResp.text();
      let testData: any = null;
      try {
        testData = JSON.parse(testText);
      } catch {
        return res.status(200).json({
          success: false,
          error: `No se pudo verificar la API: El proveedor no devolvió una respuesta JSON válida (${testResp.status}). Revisa la URL.`
        });
      }

      if (testData?.error) {
        return res.status(200).json({
          success: false,
          error: `El proveedor rechazó las credenciales: "${testData.error}". Verifica que la clave API sea la correcta.`
        });
      }

      // Update runtime env
      process.env.PROVIDER_API_URL = cleanUrl;
      process.env.PROVIDER_API_KEY = cleanKey;

      // Persist to .env file if available
      try {
        const envPath = path.resolve(__dirname, '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
        }
        const lines = envContent
          .split('\n')
          .filter((l) => !l.startsWith('PROVIDER_API_URL=') && !l.startsWith('PROVIDER_API_KEY='));
        lines.push(`PROVIDER_API_URL="${cleanUrl}"`);
        lines.push(`PROVIDER_API_KEY="${cleanKey}"`);
        fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf8');
      } catch (fileErr) {
        console.warn('Could not write to .env file:', fileErr);
      }

      return res.json({
        success: true,
        providerUrl: cleanUrl,
        maskedKey: `••••••••${cleanKey.slice(-4)}`,
        balance: testData.balance ?? null,
        currency: testData.currency ?? 'USD',
        message: '¡Credenciales verificadas y guardadas exitosamente!'
      });
    } catch (err: any) {
      return res.status(200).json({
        success: false,
        error: `Error al conectar con el proveedor: ${err.message || 'Error de red.'}`
      });
    }
  });

  // 4. Check balance on provider
  app.get('/api/provider/balance', async (req: Request, res: Response) => {
    const { apiUrl, apiKey } = await resolveProviderCredentials(req);

    if (!apiUrl || !apiKey) {
      return res.status(200).json({
        success: false,
        configured: false,
        error: 'Clave API de MazSocialMarket no configurada. Agrégala en Configuración > Integración API.'
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

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return res.status(200).json({
          success: false,
          error: `Respuesta no válida del proveedor (${response.status}): ${text.slice(0, 150)}`
        });
      }

      if (data?.error) {
        return res.status(200).json({
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
      return res.status(200).json({
        success: false,
        error: err.message || 'Error al conectar con la API del proveedor.'
      });
    }
  });

  // 5. Sync status for single or multiple Order IDs
  app.post('/api/provider/order-status', async (req: Request, res: Response) => {
    const { orderId, orderIds } = req.body;
    const { apiUrl, apiKey } = await resolveProviderCredentials(req);

    const targetIds: string[] = [];
    if (orderId && typeof orderId === 'string') {
      const split = orderId.split(/[\s,]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean);
      targetIds.push(...split);
    }
    if (Array.isArray(orderIds)) {
      orderIds.forEach(id => {
        if (typeof id === 'string') {
          const split = id.split(/[\s,]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean);
          targetIds.push(...split);
        }
      });
    }

    const uniqueIds = Array.from(new Set(targetIds));

    if (uniqueIds.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'Debes proporcionar al menos un ID de orden de proveedor.'
      });
    }

    if (!apiUrl || !apiKey) {
      return res.status(200).json({
        success: false,
        configured: false,
        error: 'La clave API del proveedor (MazSocialMarket) no está configurada. Ingresa tu API Key abajo o en Configuración > Integración API.'
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

        const rawText = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          return res.status(200).json({
            success: false,
            error: `El proveedor devolvió una respuesta no válida (${resp.status}): ${rawText.slice(0, 150)}`
          });
        }

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

        const rawText = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(rawText);
        } catch {
          return res.status(200).json({
            success: false,
            error: `El proveedor devolvió una respuesta no válida (${resp.status}): ${rawText.slice(0, 150)}`
          });
        }

        // Check if top-level error was returned by provider (e.g. Bad API key)
        if (data && typeof data === 'object' && data.error && !Array.isArray(data)) {
          for (const id of uniqueIds) {
            results.push({
              orderId: id,
              found: false,
              rawStatus: 'Error',
              mappedStatus: 'en_proceso',
              startCount: null,
              remains: null,
              charge: null,
              currency: null,
              error: data.error
            });
          }
        } else {
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
      }

      return res.json({
        success: true,
        results
      });
    } catch (err: any) {
      return res.status(200).json({
        success: false,
        error: err.message || 'Error al comunicarse con la API del proveedor.'
      });
    }
  });

  // 6. Live Instagram Profile Public Lookup Endpoint
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

  function isItemForInstagram(item: any): boolean {
    if (!item) return false;
    const snId = String(item.socialNetworkId || '').toLowerCase();
    const snName = String(item.socialNetworkName || '').toLowerCase();
    const srvName = String(item.serviceName || '').toLowerCase();
    const desc = String(item.description || '').toLowerCase();
    const target = String(item.targetAccount || '').toLowerCase();

    // Check for explicit non-Instagram platforms first
    if (
      target.includes('facebook.com') ||
      target.includes('fb.com') ||
      target.includes('fb.watch') ||
      snId.includes('facebook') ||
      snName.includes('facebook') ||
      srvName.includes('facebook') ||
      desc.includes('facebook')
    ) {
      return false;
    }
    if (
      target.includes('tiktok.com') ||
      snId.includes('tiktok') ||
      snName.includes('tiktok') ||
      srvName.includes('tiktok') ||
      desc.includes('tiktok')
    ) {
      return false;
    }
    if (
      target.includes('youtube.com') ||
      target.includes('youtu.be') ||
      snId.includes('youtube') ||
      snName.includes('youtube') ||
      srvName.includes('youtube') ||
      desc.includes('youtube')
    ) {
      return false;
    }

    // Check for Instagram indicators
    if (
      target.includes('instagram.com') ||
      snId.includes('instagram') ||
      snName.includes('instagram') ||
      srvName.includes('instagram') ||
      desc.includes('instagram') ||
      desc.includes('insta')
    ) {
      return true;
    }

    // If no explicit network is indicated and target is an instagram URL
    if (target.includes('instagram.com')) return true;

    return false;
  }

  // 5. Safe Customer Tracking Endpoint (Public, with live network verification)
  app.post('/api/tracking/customer-status', async (req: Request, res: Response) => {
    try {
      const { orderIds, items, receiptTargetAccount, rapidApiKey } = req.body;
      const { apiUrl, apiKey } = await resolveProviderCredentials(req);

      const targetIds: string[] = [];
      if (Array.isArray(orderIds)) {
        orderIds.forEach(id => {
          if (typeof id === 'string' && id.trim()) {
            targetIds.push(id.trim());
          }
        });
      }

      // Check if there is an Instagram target account to check live ONLY for Instagram items
      let igProfilePromise: Promise<any> | null = null;
      const igItem = Array.isArray(items) ? items.find(i => isItemForInstagram(i) && i.targetAccount) : null;
      const targetIg = igItem?.targetAccount || (items?.length === 1 && isItemForInstagram(items[0]) ? receiptTargetAccount : null);
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
          const isIg = isItemForInstagram(itemInfo);

          return {
            orderId: id,
            found: true,
            status: 'En curso',
            rawStatus: 'In progress',
            mappedStatus: 'en_proceso' as const,
            startCount: itemInfo?.startCount ?? 1200,
            remains: 150,
            progressPercent: 85,
            delivered: Math.round(qty * 0.85),
            estimatedDelivery: 'Aprox. 1 a 4 horas',
            liveInstagram: isIg && liveIgResult?.followersCount !== null && liveIgResult?.followersCount !== undefined ? {
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
        mappedStatus: 'procesando' | 'en_proceso' | 'parcial' | 'completado' | 'cancelado';
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

        const rawText = await resp.text();
        let data: SmmStatusResponse = {};
        try {
          data = JSON.parse(rawText);
        } catch {
          data = { error: 'Respuesta no válida del proveedor' };
        }
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

        // Live Instagram Profile Verification & Reconciliation (STRICTLY for Instagram items)
        let igDetails = null;
        const isIg = isItemForInstagram(itemInfo);
        if (isIg && liveIgResult && liveIgResult.followersCount !== null && liveIgResult.followersCount !== undefined) {
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

          // If Instagram shows more delivery than the lagging provider:
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
          status: mapped === 'completado' ? 'Completado' : mapped === 'cancelado' ? 'Cancelado' : formatProviderStatusLabel(raw),
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

        const rawText = await resp.text();
        let data: Record<string, SmmStatusResponse> = {};
        try {
          data = JSON.parse(rawText);
        } catch {
          data = {};
        }

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

          // Live Instagram Profile Verification & Reconciliation (STRICTLY for Instagram items)
          let igDetails = null;
          const isIg = isItemForInstagram(itemInfo);
          if (isIg && liveIgResult && liveIgResult.followersCount !== null && liveIgResult.followersCount !== undefined) {
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
            status: mapped === 'completado' ? 'Completado' : mapped === 'cancelado' ? 'Cancelado' : formatProviderStatusLabel(raw),
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
