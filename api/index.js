import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_URL = 'https://mazsocialmarket.com/api/v2';
const FIRESTORE_CONFIG_URL =
  'https://firestore.googleapis.com/v1/projects/gen-lang-client-0776513868/databases/ai-studio-5149ce93-aa35-4b1d-9194-63cd1e9b621e/documents/config/business';

let cachedFirestoreCreds = {
  apiUrl: '',
  apiKey: '',
  expiresAt: 0,
};

function mapSmmStatusToAppStatus(rawStatus) {
  if (!rawStatus) return 'en_proceso';
  const s = String(rawStatus).toLowerCase().trim();
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

function formatProviderStatusLabel(rawStatus) {
  if (!rawStatus) return 'En curso';
  const s = String(rawStatus).toLowerCase().trim();
  if (s.includes('partial') || s.includes('parcial')) return 'Parcial';
  if (s.includes('processing') || s.includes('procesan') || s === 'pending' || s.includes('pendient')) {
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
  if (s.includes('complet') || s === 'completed' || s === 'completado') return 'Completado';
  if (s.includes('cancel') || s === 'canceled' || s === 'cancelled' || s === 'cancelado') return 'Cancelado';
  return String(rawStatus).charAt(0).toUpperCase() + String(rawStatus).slice(1);
}

const instagramProfileCache = new Map();

function extractInstagramUsername(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
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

async function fetchLiveInstagramProfile(rawUsername, customRapidApiKey) {
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

  const rapidApiKey = (customRapidApiKey && String(customRapidApiKey).trim()) || (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY.trim());

  if (rapidApiKey) {
    try {
      const rapidUrl = `https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`;
      const res = await fetch(rapidUrl, {
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'instagram-scraper-api2.p.rapidapi.com',
          'User-Agent': 'ImpulsaNet-LiveSync/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
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
            source: 'rapidapi',
            updatedAt: new Date().toISOString(),
          };
          instagramProfileCache.set(cacheKey, { data: result, expiresAt: now + 180000 });
          return result;
        }
      }
    } catch {
      // Fall through to Tier 2
    }
  }

  try {
    const webRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-ig-app-id': '936619743392459',
        Accept: '*/*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (webRes.ok) {
      const webData = await webRes.json();
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
          source: 'direct_web',
          updatedAt: new Date().toISOString(),
        };
        instagramProfileCache.set(cacheKey, { data: result, expiresAt: now + 180000 });
        return result;
      }
    }
  } catch {
    // Expected on rate limits
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

function persistProviderCredentialsToEnv(apiUrl, apiKey) {
  process.env.PROVIDER_API_URL = apiUrl;
  process.env.PROVIDER_API_KEY = apiKey;
  cachedFirestoreCreds = {
    apiUrl,
    apiKey,
    expiresAt: Date.now() + 600000,
  };
  try {
    const envPath = path.resolve(__dirname, '..', '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    const lines = envContent
      .split('\n')
      .filter((l) => !l.startsWith('PROVIDER_API_URL=') && !l.startsWith('PROVIDER_API_KEY='));
    lines.push(`PROVIDER_API_URL="${apiUrl}"`);
    lines.push(`PROVIDER_API_KEY="${apiKey}"`);
    fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf8');
  } catch {
    // Read-only filesystem in Vercel serverless environment
  }
}

async function fetchCredentialsFromFirestore() {
  const now = Date.now();
  if (cachedFirestoreCreds.apiKey && cachedFirestoreCreds.expiresAt > now) {
    return cachedFirestoreCreds;
  }
  try {
    const res = await fetch(FIRESTORE_CONFIG_URL, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const doc = await res.json();
      const fields = doc?.fields || {};
      const urlVal = fields?.providerApiUrl?.stringValue?.trim() || DEFAULT_URL;
      const keyVal = fields?.providerApiKey?.stringValue?.trim() || '';
      if (keyVal) {
        cachedFirestoreCreds = {
          apiUrl: urlVal,
          apiKey: keyVal,
          expiresAt: now + 300000,
        };
        process.env.PROVIDER_API_URL = urlVal;
        process.env.PROVIDER_API_KEY = keyVal;
        return cachedFirestoreCreds;
      }
    }
  } catch {
    // Ignore network error
  }
  return { apiUrl: DEFAULT_URL, apiKey: '' };
}

async function resolveProviderCredentials(req, bodyObj = {}, persistIfProvided = true) {
  const headerUrl = typeof req?.headers?.['x-provider-api-url'] === 'string' ? req.headers['x-provider-api-url'].trim() : '';
  const headerKey = typeof req?.headers?.['x-provider-api-key'] === 'string' ? req.headers['x-provider-api-key'].trim() : '';
  const bodyUrl = typeof bodyObj?.providerUrl === 'string' ? bodyObj.providerUrl.trim() : '';
  const bodyKey = typeof bodyObj?.apiKey === 'string' ? bodyObj.apiKey.trim() : '';

  const providedUrl = bodyUrl || headerUrl;
  const providedKey = bodyKey || headerKey;

  if (persistIfProvided && headerKey) {
    const targetUrl = headerUrl || process.env.PROVIDER_API_URL?.trim() || DEFAULT_URL;
    if (process.env.PROVIDER_API_KEY !== headerKey || process.env.PROVIDER_API_URL !== targetUrl) {
      persistProviderCredentialsToEnv(targetUrl, headerKey);
    }
  }

  let apiUrl = providedUrl || process.env.PROVIDER_API_URL?.trim() || '';
  let apiKey = providedKey || process.env.PROVIDER_API_KEY?.trim() || '';

  // Automatic Firestore fallback for stateless serverless instances (Vercel cold starts)
  if (!apiKey) {
    const fsCreds = await fetchCredentialsFromFirestore();
    if (fsCreds.apiKey) {
      apiKey = fsCreds.apiKey;
      if (!apiUrl) apiUrl = fsCreds.apiUrl;
    }
  }

  return {
    apiUrl: apiUrl || DEFAULT_URL,
    apiKey: apiKey || null,
  };
}

async function fetchOrdersFromProvider(apiUrl, apiKey, uniqueIds) {
  const results = [];
  const CHUNK_SIZE = 50;

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const params = new URLSearchParams();
    params.append('key', apiKey);
    params.append('action', 'status');

    if (chunk.length === 1) {
      params.append('order', chunk[0]);
    } else {
      params.append('orders', chunk.join(','));
    }

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ImpulsaNet-OrderSync/1.0',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(12000),
    });

    const rawText = await resp.text();
    let data = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      return {
        success: false,
        results: [],
        error: `El proveedor devolvió una respuesta no válida (${resp.status}): ${rawText.slice(0, 150)}`,
      };
    }

    if (chunk.length === 1) {
      const singleId = chunk[0];
      const itemData = data?.[singleId] && typeof data[singleId] === 'object' ? data[singleId] : data;
      if (itemData?.error) {
        results.push({
          orderId: singleId,
          found: false,
          rawStatus: 'Error',
          mappedStatus: 'en_proceso',
          startCount: null,
          remains: null,
          charge: null,
          currency: null,
          error: itemData.error,
        });
      } else {
        results.push({
          orderId: singleId,
          found: true,
          rawStatus: itemData?.status || 'Unknown',
          mappedStatus: mapSmmStatusToAppStatus(itemData?.status),
          startCount: itemData?.start_count ?? null,
          remains: itemData?.remains ?? null,
          charge: itemData?.charge ?? null,
          currency: itemData?.currency ?? 'USD',
        });
      }
    } else if (data && typeof data === 'object' && data.error && !Array.isArray(data)) {
      for (const id of chunk) {
        results.push({
          orderId: id,
          found: false,
          rawStatus: 'Error',
          mappedStatus: 'en_proceso',
          startCount: null,
          remains: null,
          charge: null,
          currency: null,
          error: data.error,
        });
      }
    } else {
      for (const id of chunk) {
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
            error: item?.error || 'No se encontró información para esta orden',
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
            currency: item.currency ?? 'USD',
          });
        }
      }
    }
  }

  return { success: true, results };
}

function findMatchingItemForOrderId(items, targetId) {
  if (!Array.isArray(items)) return null;
  const cleanTarget = String(targetId).replace(/^#/, '').trim();
  if (!cleanTarget) return null;

  return (
    items.find((item) => {
      if (!item) return false;
      if (Array.isArray(item.orderIds)) {
        if (item.orderIds.some((oid) => String(oid).replace(/^#/, '').trim() === cleanTarget)) {
          return true;
        }
      }
      if (item.orderId !== undefined && item.orderId !== null) {
        const splitIds = String(item.orderId)
          .split(/[\s,]+/)
          .map((s) => s.replace(/^#/, '').trim())
          .filter(Boolean);
        if (splitIds.includes(cleanTarget)) {
          return true;
        }
      }
      return false;
    }) || null
  );
}

function isItemForInstagram(item) {
  if (!item) return false;
  const snId = String(item.socialNetworkId || '').toLowerCase();
  const snName = String(item.socialNetworkName || '').toLowerCase();
  const srvName = String(item.serviceName || '').toLowerCase();
  const desc = String(item.description || '').toLowerCase();
  const target = String(item.targetAccount || '').toLowerCase();

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

  return false;
}

async function parseRequestBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body;
    }
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf8'));
      } catch {
        return {};
      }
    }
  }

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return {};
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function extractRoutePath(req, urlObj) {
  const queryPath =
    (typeof req?.query?.__path === 'string' && req.query.__path) ||
    urlObj.searchParams.get('__path');
  if (queryPath) {
    return '/' + queryPath.replace(/^\/+/, '').replace(/^api\/+/, '');
  }

  const rawUrl = req.originalUrl || req.url || '/';
  const pathname = rawUrl.split('?')[0] || '/';
  const stripped = pathname.replace(/^\/+/, '').replace(/^api\/?/, '');
  return '/' + stripped;
}

/**
 * Universal Serverless & Node HTTP API Handler (Zero external dependencies)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-provider-api-url, x-provider-api-key');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const urlObj = new URL(req.originalUrl || req.url || '/', 'http://localhost');
  const route = extractRoutePath(req, urlObj);
  const body = await parseRequestBody(req);

  try {
    // 0. Health Check
    if (route === '/health' || route === '/') {
      const { apiUrl, apiKey } = await resolveProviderCredentials(req, body, true);
      return sendJson(res, 200, {
        success: true,
        server: 'online',
        providerConfigured: Boolean(apiUrl && apiKey),
        providerUrl: apiUrl,
        rapidApiConfigured: Boolean(process.env.RAPIDAPI_KEY?.trim()),
        timestamp: new Date().toISOString(),
      });
    }

    // 1. Provider Config Status
    if (route === '/provider/config') {
      const { apiUrl, apiKey } = await resolveProviderCredentials(req, body, true);
      const isConfigured = Boolean(apiUrl && apiKey);
      return sendJson(res, 200, {
        configured: isConfigured,
        providerUrl: apiUrl,
        providerType: 'smm_v2',
        maskedKey: apiKey ? `••••••••${apiKey.slice(-4)}` : null,
        message: isConfigured
          ? 'API de proveedor SMM configurada y lista.'
          : 'API no configurada. Ingresa tu clave API en Configuración > Integración API.',
      });
    }

    // 2. Test Connection
    if (route === '/provider/test-connection') {
      const resolved = await resolveProviderCredentials(req, body, false);
      const targetUrl = body?.providerUrl?.trim() || resolved.apiUrl;
      const targetKey = body?.apiKey?.trim() || resolved.apiKey;

      if (!targetUrl || !targetKey) {
        return sendJson(res, 200, {
          success: false,
          error: 'Debes proporcionar la URL de la API y la Clave API para realizar la prueba.',
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
          signal: AbortSignal.timeout(12000),
        });

        const text = await response.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          return sendJson(res, 200, {
            success: false,
            error: `El servidor del proveedor respondió (${response.status}) pero no devolvió JSON válido. Verifica que la URL sea https://mazsocialmarket.com/api/v2`,
          });
        }

        if (data?.error) {
          return sendJson(res, 200, {
            success: false,
            error: `Error reportado por el proveedor: "${data.error}"`,
          });
        }

        if (data?.balance !== undefined) {
          return sendJson(res, 200, {
            success: true,
            balance: data.balance,
            currency: data.currency || 'USD',
            message: `¡Conexión exitosa! Saldo disponible: $${data.balance} ${data.currency || 'USD'}`,
          });
        }

        return sendJson(res, 200, {
          success: false,
          error: `Respuesta inesperada del proveedor: ${text.slice(0, 150)}`,
        });
      } catch (err) {
        return sendJson(res, 200, {
          success: false,
          error: `Fallo de conexión de red: ${err?.message || 'No se pudo contactar con el host del proveedor.'}`,
        });
      }
    }

    // 3. Save Provider Config
    if (route === '/provider/save-config') {
      const { providerUrl, apiKey } = body || {};
      if (!providerUrl?.trim() || !apiKey?.trim()) {
        return sendJson(res, 200, {
          success: false,
          error: 'La URL de la API y la Clave de API son requeridas.',
        });
      }

      const cleanUrl = providerUrl.trim();
      const cleanKey = apiKey.trim();

      try {
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
          signal: AbortSignal.timeout(12000),
        });

        const testText = await testResp.text();
        let testData = null;
        try {
          testData = JSON.parse(testText);
        } catch {
          return sendJson(res, 200, {
            success: false,
            error: `No se pudo verificar la API: El proveedor no devolvió una respuesta JSON válida (${testResp.status}). Revisa la URL.`,
          });
        }

        if (testData?.error) {
          return sendJson(res, 200, {
            success: false,
            error: `El proveedor rechazó las credenciales: "${testData.error}". Verifica que la clave API sea la correcta.`,
          });
        }

        persistProviderCredentialsToEnv(cleanUrl, cleanKey);

        return sendJson(res, 200, {
          success: true,
          providerUrl: cleanUrl,
          maskedKey: `••••••••${cleanKey.slice(-4)}`,
          balance: testData.balance ?? null,
          currency: testData.currency ?? 'USD',
          message: '¡Credenciales verificadas y guardadas exitosamente!',
        });
      } catch (err) {
        return sendJson(res, 200, {
          success: false,
          error: `Error al conectar con el proveedor: ${err?.message || 'Error de red.'}`,
        });
      }
    }

    // 4. Provider Balance
    if (route === '/provider/balance') {
      const { apiUrl, apiKey } = await resolveProviderCredentials(req, body, true);
      if (!apiUrl || !apiKey) {
        return sendJson(res, 200, {
          success: false,
          configured: false,
          error: 'Clave API de MazSocialMarket no configurada. Agrégala en Configuración > Integración API.',
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
          signal: AbortSignal.timeout(12000),
        });

        const text = await response.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          return sendJson(res, 200, {
            success: false,
            error: `Respuesta no válida del proveedor (${response.status}): ${text.slice(0, 150)}`,
          });
        }

        if (data?.error) {
          return sendJson(res, 200, {
            success: false,
            error: data.error,
          });
        }

        return sendJson(res, 200, {
          success: true,
          balance: data.balance ?? null,
          currency: data.currency ?? 'USD',
        });
      } catch (err) {
        return sendJson(res, 200, {
          success: false,
          error: err?.message || 'Error al conectar con la API del proveedor.',
        });
      }
    }

    // 5. Sync Order Status
    if (route === '/provider/order-status') {
      const { orderId, orderIds } = body || {};
      const { apiUrl, apiKey } = await resolveProviderCredentials(req, body, true);

      const targetIds = [];
      if (orderId && typeof orderId === 'string') {
        const split = orderId.split(/[\s,]+/).map((s) => s.replace(/^#/, '').trim()).filter(Boolean);
        targetIds.push(...split);
      }
      if (Array.isArray(orderIds)) {
        orderIds.forEach((id) => {
          if (typeof id === 'string') {
            const split = id.split(/[\s,]+/).map((s) => s.replace(/^#/, '').trim()).filter(Boolean);
            targetIds.push(...split);
          }
        });
      }

      const uniqueIds = Array.from(new Set(targetIds));
      if (uniqueIds.length === 0) {
        return sendJson(res, 200, {
          success: false,
          error: 'Debes proporcionar al menos un ID de orden de proveedor.',
        });
      }

      if (!apiUrl || !apiKey) {
        return sendJson(res, 200, {
          success: false,
          configured: false,
          error: 'La clave API del proveedor (MazSocialMarket) no está configurada. Ingresa tu API Key abajo o en Configuración > Integración API.',
        });
      }

      try {
        const providerRes = await fetchOrdersFromProvider(apiUrl, apiKey, uniqueIds);
        if (!providerRes.success) {
          return sendJson(res, 200, {
            success: false,
            error: providerRes.error,
          });
        }

        return sendJson(res, 200, {
          success: true,
          results: providerRes.results,
        });
      } catch (err) {
        return sendJson(res, 200, {
          success: false,
          error: err?.message || 'Error al comunicarse con la API del proveedor.',
        });
      }
    }

    // 6. Live Instagram Profile Lookup
    if (route === '/instagram/profile') {
      const rawUsername =
        (typeof req?.query?.username === 'string' && req.query.username) ||
        urlObj.searchParams.get('username') ||
        '';
      const customKey =
        (typeof req?.query?.rapidApiKey === 'string' && req.query.rapidApiKey) ||
        urlObj.searchParams.get('rapidApiKey') ||
        '';
      if (!rawUsername.trim()) {
        return sendJson(res, 400, {
          success: false,
          error: 'Debes proporcionar un nombre de usuario o enlace de Instagram.',
        });
      }

      const profile = await fetchLiveInstagramProfile(rawUsername, customKey);
      return sendJson(res, 200, {
        success: profile.followersCount !== null,
        profile,
      });
    }

    // 7. Customer Public Tracking Status
    if (route === '/tracking/customer-status') {
      const { orderIds, items, receiptTargetAccount, rapidApiKey } = body || {};
      const { apiUrl, apiKey } = await resolveProviderCredentials(req, body, true);

      const targetIds = [];
      if (Array.isArray(orderIds)) {
        orderIds.forEach((id) => {
          if (typeof id === 'string' && id.trim()) {
            targetIds.push(id.replace(/^#/, '').trim());
          }
        });
      }
      const uniqueIds = Array.from(new Set(targetIds));

      let igProfilePromise = null;
      const igItem = Array.isArray(items) ? items.find((i) => isItemForInstagram(i) && i.targetAccount) : null;
      const targetIg = igItem?.targetAccount || (items?.length === 1 && isItemForInstagram(items[0]) ? receiptTargetAccount : null);
      if (targetIg && typeof targetIg === 'string') {
        const u = extractInstagramUsername(targetIg);
        if (u) {
          igProfilePromise = fetchLiveInstagramProfile(u, rapidApiKey);
        }
      }

      const liveIgResult = igProfilePromise ? await igProfilePromise.catch(() => null) : null;

      if (uniqueIds.length === 0) {
        return sendJson(res, 200, { success: true, tracking: [] });
      }

      if (!apiUrl || !apiKey) {
        const mockTracking = uniqueIds.map((id) => {
          const itemInfo = findMatchingItemForOrderId(items, id);
          const qty = itemInfo?.quantity ? Number(itemInfo.quantity) : 1000;
          const isIg = isItemForInstagram(itemInfo);

          return {
            orderId: id,
            found: true,
            status: 'En curso',
            rawStatus: 'In progress',
            mappedStatus: 'en_proceso',
            startCount: itemInfo?.startCount ?? 1200,
            remains: Math.round(qty * 0.15),
            progressPercent: 85,
            delivered: Math.round(qty * 0.85),
            estimatedDelivery: 'Aprox. 1 a 4 horas',
            liveInstagram:
              isIg && liveIgResult?.followersCount !== null && liveIgResult?.followersCount !== undefined
                ? {
                    username: liveIgResult.username,
                    currentFollowers: liveIgResult.followersCount,
                    verified: true,
                    source: liveIgResult.source,
                  }
                : null,
          };
        });
        return sendJson(res, 200, { success: true, tracking: mockTracking });
      }

      const providerRes = await fetchOrdersFromProvider(apiUrl, apiKey, uniqueIds);
      const orderMap = new Map();
      providerRes.results.forEach((r) => orderMap.set(r.orderId, r));

      const trackingList = uniqueIds.map((id) => {
        const orderInfo = orderMap.get(id);
        const raw = orderInfo?.found ? orderInfo.rawStatus : 'Processing';
        let mapped = orderInfo?.found ? orderInfo.mappedStatus : mapSmmStatusToAppStatus(raw);
        const itemInfo = findMatchingItemForOrderId(items, id);
        const qty = itemInfo?.quantity ? Number(itemInfo.quantity) : 1000;

        let remains =
          orderInfo?.remains !== undefined && orderInfo?.remains !== null
            ? Number(orderInfo.remains)
            : null;
        const start =
          itemInfo?.startCount !== undefined && itemInfo?.startCount !== null
            ? Number(itemInfo.startCount)
            : orderInfo?.startCount !== undefined && orderInfo?.startCount !== null
            ? Number(orderInfo.startCount)
            : null;

        let delivered = null;
        let progress = mapped === 'completado' ? 100 : 20;

        if (remains !== null && !isNaN(remains)) {
          delivered = Math.max(0, qty - remains);
          if (qty > 0) {
            progress = Math.min(100, Math.max(5, Math.round(((qty - remains) / qty) * 100)));
          }
        }

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
            error: liveIgResult.error,
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

        return {
          orderId: id,
          found: Boolean(orderInfo?.found),
          status:
            mapped === 'completado'
              ? 'Completado'
              : mapped === 'cancelado'
              ? 'Cancelado'
              : formatProviderStatusLabel(raw),
          rawStatus: raw,
          mappedStatus: mapped,
          startCount: start,
          remains,
          delivered,
          progressPercent: progress,
          estimatedDelivery: estimated,
          liveInstagram: igDetails,
        };
      });

      return sendJson(res, 200, {
        success: true,
        tracking: trackingList,
      });
    }

    return sendJson(res, 404, {
      success: false,
      error: `Endpoint de API no encontrado: ${route}`,
    });
  } catch (err) {
    return sendJson(res, 500, {
      success: false,
      error: err?.message || 'Error interno en el servidor de API.',
    });
  }
}
