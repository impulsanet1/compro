import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_URL = 'https://mazsocialmarket.com/api/v2';
const AUTHORIZED_ADMIN_EMAIL = 'estebanruiz.12vrgassergio@gmail.com';

function loadFirebaseAppletConfig() {
  try {
    const configPath = path.resolve(__dirname, '..', 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch {
    // Fallback to embedded public config values
  }
  return {
    projectId: 'gen-lang-client-0776513868',
    apiKey: 'AIzaSyDYFU81fKMGKI6seMQI13GvKeeNwz_k8HU',
    firestoreDatabaseId: 'ai-studio-5149ce93-aa35-4b1d-9194-63cd1e9b621e',
  };
}

const FIREBASE_CONFIG = loadFirebaseAppletConfig();
const FIREBASE_WEB_API_KEY = FIREBASE_CONFIG.apiKey;
const FIRESTORE_PROJECT_ID = FIREBASE_CONFIG.projectId;
const FIRESTORE_DB_ID = FIREBASE_CONFIG.firestoreDatabaseId || '(default)';

const FIRESTORE_PROVIDER_CONFIG_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DB_ID}/documents/config/provider`;
const IDENTITY_TOOLKIT_LOOKUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`;

// Short-lived in-memory cache for provider credentials (60 seconds TTL)
const CREDENTIALS_CACHE_TTL_MS = 60 * 1000;
let cachedFirestoreCreds = {
  apiUrl: '',
  apiKey: '',
  rapidApiKey: '',
  expiresAt: 0,
};

// Short-lived in-memory cache for verified admin ID tokens (60 seconds TTL)
const verifiedAdminTokensCache = new Map();
const TOKEN_CACHE_TTL_MS = 60 * 1000;

// Nota: En entornos serverless (como Vercel), este límite en memoria por instancia es aproximado.
const PUBLIC_TRACKING_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const PUBLIC_TRACKING_MAX_REQUESTS_PER_MINUTE = 30;
const publicTrackingRateLimitMap = new Map();

function checkPublicTrackingRateLimit(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === 'string' ? forwarded : '';
  const clientIp =
    rawForwarded.split(',')[0].trim() ||
    req?.socket?.remoteAddress ||
    req?.connection?.remoteAddress ||
    'unknown';

  const now = Date.now();
  let entry = publicTrackingRateLimitMap.get(clientIp);

  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 1,
      resetAt: now + PUBLIC_TRACKING_RATE_LIMIT_WINDOW_MS,
    };
    publicTrackingRateLimitMap.set(clientIp, entry);
  } else {
    entry.count += 1;
  }

  // Cleanup expired entries when map grows
  if (publicTrackingRateLimitMap.size > 500) {
    for (const [ip, data] of publicTrackingRateLimitMap.entries()) {
      if (now >= data.resetAt) {
        publicTrackingRateLimitMap.delete(ip);
      }
    }
  }

  if (entry.count > PUBLIC_TRACKING_MAX_REQUESTS_PER_MINUTE) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Resolves provider credentials strictly for the public tracking endpoint:
 * uses environment variables PROVIDER_API_URL and PROVIDER_API_KEY first,
 * with the in-memory cache (cachedFirestoreCreds) as backup.
 * NEVER reads config/provider from Firestore without an admin token.
 */
function resolvePublicTrackingCredentials() {
  const envUrl = process.env.PROVIDER_API_URL?.trim() || '';
  const envKey = process.env.PROVIDER_API_KEY?.trim() || '';
  if (envKey) {
    return {
      apiUrl: envUrl || cachedFirestoreCreds.apiUrl || DEFAULT_URL,
      apiKey: envKey,
    };
  }

  if (cachedFirestoreCreds.apiKey) {
    return {
      apiUrl: cachedFirestoreCreds.apiUrl || envUrl || DEFAULT_URL,
      apiKey: cachedFirestoreCreds.apiKey,
    };
  }

  return {
    apiUrl: envUrl || DEFAULT_URL,
    apiKey: null,
  };
}

/**
 * Verifies the Firebase ID token from Authorization: Bearer <token>
 * using Google Identity Toolkit accounts:lookup and checks that the user
 * is the verified administrator.
 */
async function verifyAdminToken(req) {
  const authHeader = typeof req?.headers?.authorization === 'string' ? req.headers.authorization.trim() : '';
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'No autenticado: se requiere cabecera Authorization: Bearer <ID token>.',
    };
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return {
      ok: false,
      status: 401,
      error: 'No autenticado: el ID token está vacío.',
    };
  }

  const now = Date.now();
  const cached = verifiedAdminTokensCache.get(idToken);
  if (cached && cached.expiresAt > now) {
    return {
      ok: true,
      idToken,
      email: cached.email,
      uid: cached.uid,
    };
  }

  try {
    const res = await fetch(IDENTITY_TOOLKIT_LOOKUP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {
        ok: false,
        status: 401,
        error: 'Token de Firebase inválido o expirado.',
      };
    }

    const data = await res.json();
    const account = Array.isArray(data?.users) ? data.users[0] : null;
    if (!account) {
      return {
        ok: false,
        status: 401,
        error: 'No se encontró la cuenta asociada al token proporcionado.',
      };
    }

    const email = String(account.email || '').toLowerCase().trim();
    const emailVerified = Boolean(account.emailVerified);

    if (email !== AUTHORIZED_ADMIN_EMAIL.toLowerCase() || !emailVerified) {
      return {
        ok: false,
        status: 403,
        error: 'Acceso denegado: se requiere la cuenta de administrador verificada.',
      };
    }

    verifiedAdminTokensCache.set(idToken, {
      email,
      uid: account.localId,
      expiresAt: now + TOKEN_CACHE_TTL_MS,
    });

    // Keep cache bounded
    if (verifiedAdminTokensCache.size > 50) {
      const oldestKey = verifiedAdminTokensCache.keys().next().value;
      if (oldestKey) verifiedAdminTokensCache.delete(oldestKey);
    }

    return {
      ok: true,
      idToken,
      email,
      uid: account.localId,
    };
  } catch (err) {
    return {
      ok: false,
      status: 401,
      error: `Error al verificar el token de autenticación: ${err?.message || 'Error de red'}`,
    };
  }
}

/**
 * Reads provider credentials from private `config/provider` in Firestore using the admin's ID token
 * (so Firestore security rules apply), with a short in-memory cache.
 * Falls back to PROVIDER_API_URL and PROVIDER_API_KEY environment variables if available.
 */
async function resolveProviderCredentials(adminIdToken) {
  const now = Date.now();
  if (cachedFirestoreCreds.apiKey && cachedFirestoreCreds.expiresAt > now) {
    return {
      apiUrl: cachedFirestoreCreds.apiUrl || DEFAULT_URL,
      apiKey: cachedFirestoreCreds.apiKey,
      rapidApiKey: cachedFirestoreCreds.rapidApiKey || process.env.RAPIDAPI_KEY?.trim() || '',
    };
  }

  if (adminIdToken) {
    try {
      const res = await fetch(FIRESTORE_PROVIDER_CONFIG_URL, {
        headers: {
          Authorization: `Bearer ${adminIdToken}`,
        },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const doc = await res.json();
        const fields = doc?.fields || {};
        const urlVal = fields?.providerApiUrl?.stringValue?.trim() || DEFAULT_URL;
        const keyVal = fields?.providerApiKey?.stringValue?.trim() || '';
        const rapidVal = fields?.rapidApiKey?.stringValue?.trim() || '';

        if (keyVal) {
          cachedFirestoreCreds = {
            apiUrl: urlVal,
            apiKey: keyVal,
            rapidApiKey: rapidVal,
            expiresAt: now + CREDENTIALS_CACHE_TTL_MS,
          };
          return {
            apiUrl: urlVal,
            apiKey: keyVal,
            rapidApiKey: rapidVal || process.env.RAPIDAPI_KEY?.trim() || '',
          };
        }
      }
    } catch {
      // Fall back to environment variables if Firestore REST is unreachable
    }
  }

  const envUrl = process.env.PROVIDER_API_URL?.trim() || DEFAULT_URL;
  const envKey = process.env.PROVIDER_API_KEY?.trim() || null;
  const envRapid = process.env.RAPIDAPI_KEY?.trim() || '';

  return {
    apiUrl: envUrl,
    apiKey: envKey,
    rapidApiKey: envRapid,
  };
}

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
  return 'En curso';
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

async function fetchLiveInstagramProfile(rawUsername, rapidApiKeyFromConfig) {
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

  const rapidApiKey =
    (rapidApiKeyFromConfig && String(rapidApiKeyFromConfig).trim()) ||
    (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY.trim());

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
    error: 'No se pudo consultar el perfil en este momento.',
    updatedAt: new Date().toISOString(),
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
        error: `El proveedor devolvió una respuesta no válida (${resp.status}).`,
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
          quantity: itemData?.quantity ?? null,
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
          quantity: null,
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
            quantity: null,
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
            quantity: item.quantity ?? null,
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
 * Configures strict CORS allowing only APP_URL (and localhost in development),
 * without x-provider-* headers.
 */
function configureCors(req, res) {
  const requestOrigin = typeof req?.headers?.origin === 'string' ? req.headers.origin.trim().replace(/\/+$/, '') : '';
  const configuredAppUrl = typeof process.env.APP_URL === 'string' ? process.env.APP_URL.trim().replace(/\/+$/, '') : '';
  const isDev = process.env.NODE_ENV !== 'production';

  const allowedOrigins = new Set();
  if (configuredAppUrl) {
    allowedOrigins.add(configuredAppUrl);
  }

  const isLocalhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(requestOrigin);

  if (requestOrigin && (allowedOrigins.has(requestOrigin) || (isDev && isLocalhostOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Vary', 'Origin');
  } else if (configuredAppUrl) {
    res.setHeader('Access-Control-Allow-Origin', configuredAppUrl);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

/**
 * Universal Serverless & Node HTTP API Handler
 */
export default async function handler(req, res) {
  configureCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const urlObj = new URL(req.originalUrl || req.url || '/', 'http://localhost');
  const route = extractRoutePath(req, urlObj);
  const body = await parseRequestBody(req);

  try {
    // Public Endpoint: Customer Tracking Status (returns strictly minimal fields, no credentials or internal data)
    if (route === '/tracking/customer-status') {
      const rateLimit = checkPublicTrackingRateLimit(req);
      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
        return sendJson(res, 429, {
          success: false,
          error: 'Has realizado demasiadas consultas en poco tiempo. Por favor espera un minuto antes de volver a intentar.',
        });
      }

      const { orderIds, items } = body || {};

      const targetIds = [];
      if (Array.isArray(orderIds)) {
        orderIds.forEach((id) => {
          if (typeof id === 'string' || typeof id === 'number') {
            const cleanId = String(id).replace(/^#/, '').trim();
            // Validate strictly digits only and max 15 characters; discard others
            if (/^\d{1,15}$/.test(cleanId)) {
              targetIds.push(cleanId);
            }
          }
        });
      }
      const uniqueIds = Array.from(new Set(targetIds)).slice(0, 10);

      if (uniqueIds.length === 0) {
        return sendJson(res, 200, { success: true, tracking: [] });
      }

      const buildUnknownOrderTracking = (id) => {
        const itemInfo = findMatchingItemForOrderId(items, id);
        const start =
          itemInfo?.startCount !== undefined && itemInfo?.startCount !== null
            ? Number(itemInfo.startCount)
            : null;
        return {
          orderId: id,
          found: false,
          status: 'Consultando',
          mappedStatus: 'desconocido',
          progressPercent: null,
          delivered: null,
          remains: null,
          startCount: start,
          estimatedDelivery: 'Estamos consultando el estado de tu pedido. Vuelve a intentar en unos minutos.',
        };
      };

      const { apiUrl, apiKey } = resolvePublicTrackingCredentials();

      if (!apiUrl || !apiKey) {
        return sendJson(res, 200, {
          success: true,
          tracking: uniqueIds.map((id) => buildUnknownOrderTracking(id)),
        });
      }

      let providerRes = null;
      try {
        providerRes = await fetchOrdersFromProvider(apiUrl, apiKey, uniqueIds);
      } catch {
        providerRes = { success: false, results: [] };
      }

      if (!providerRes || !providerRes.success || !Array.isArray(providerRes.results)) {
        return sendJson(res, 200, {
          success: true,
          tracking: uniqueIds.map((id) => buildUnknownOrderTracking(id)),
        });
      }

      const orderMap = new Map();
      providerRes.results.forEach((r) => orderMap.set(String(r.orderId), r));

      const trackingList = uniqueIds.map((id) => {
        const orderInfo = orderMap.get(id);
        if (!orderInfo || !orderInfo.found) {
          return buildUnknownOrderTracking(id);
        }

        const raw = orderInfo.rawStatus;
        const mapped = orderInfo.mappedStatus || mapSmmStatusToAppStatus(raw);
        const itemInfo = findMatchingItemForOrderId(items, id);
        const qty = itemInfo?.quantity ? Number(itemInfo.quantity) : 0;

        const hasRemains =
          orderInfo.remains !== undefined &&
          orderInfo.remains !== null &&
          String(orderInfo.remains).trim() !== '' &&
          !isNaN(Number(orderInfo.remains));

        const remains = hasRemains ? Number(orderInfo.remains) : mapped === 'completado' ? 0 : null;
        const start =
          itemInfo?.startCount !== undefined && itemInfo?.startCount !== null
            ? Number(itemInfo.startCount)
            : orderInfo.startCount !== undefined && orderInfo.startCount !== null && !isNaN(Number(orderInfo.startCount))
            ? Number(orderInfo.startCount)
            : null;

        let delivered = null;
        let progress = null;

        if (mapped === 'completado') {
          progress = 100;
          delivered = qty > 0 ? qty : null;
        } else if (hasRemains && remains !== null) {
          if (qty > 0) {
            delivered = Math.max(0, qty - remains);
            progress = Math.min(100, Math.max(0, Math.round(((qty - remains) / qty) * 100)));
          }
        }

        const estimated =
          mapped === 'completado'
            ? 'Pedido completado con éxito'
            : mapped === 'cancelado'
            ? 'Cancelado / En garantía'
            : null;

        return {
          orderId: id,
          found: true,
          status:
            mapped === 'completado'
              ? 'Completado'
              : mapped === 'cancelado'
              ? 'Cancelado'
              : formatProviderStatusLabel(raw),
          mappedStatus: mapped,
          startCount: start,
          remains,
          delivered,
          progressPercent: progress,
          estimatedDelivery: estimated,
        };
      });

      return sendJson(res, 200, {
        success: true,
        tracking: trackingList,
      });
    }

    // --- ALL OTHER /api ENDPOINTS REQUIRE VERIFIED ADMIN AUTHENTICATION ---
    const authResult = await verifyAdminToken(req);
    if (!authResult.ok) {
      return sendJson(res, authResult.status, {
        success: false,
        error: authResult.error,
      });
    }

    const adminIdToken = authResult.idToken;

    // 0. Health Check (Admin only)
    if (route === '/health' || route === '/') {
      const { apiUrl, apiKey, rapidApiKey } = await resolveProviderCredentials(adminIdToken);
      return sendJson(res, 200, {
        success: true,
        server: 'online',
        providerConfigured: Boolean(apiUrl && apiKey),
        providerUrl: apiUrl,
        rapidApiConfigured: Boolean(rapidApiKey),
        timestamp: new Date().toISOString(),
      });
    }

    // 1. Provider Config Status (Admin only)
    if (route === '/provider/config') {
      const { apiUrl, apiKey } = await resolveProviderCredentials(adminIdToken);
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

    // 2. Test Connection (Admin only - accepts new key in body for testing)
    if (route === '/provider/test-connection') {
      const resolved = await resolveProviderCredentials(adminIdToken);
      const targetUrl = (typeof body?.providerUrl === 'string' && body.providerUrl.trim()) || resolved.apiUrl;
      const targetKey = (typeof body?.apiKey === 'string' && body.apiKey.trim()) || resolved.apiKey;

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
          error: 'Respuesta inesperada del proveedor.',
        });
      } catch (err) {
        return sendJson(res, 200, {
          success: false,
          error: `Fallo de conexión de red: ${err?.message || 'No se pudo contactar con el host del proveedor.'}`,
        });
      }
    }

    // 3. Validate & Cache Provider Config in Memory (Admin only - no .env writes)
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

        // Update short-lived in-memory cache (no .env file write)
        cachedFirestoreCreds = {
          apiUrl: cleanUrl,
          apiKey: cleanKey,
          rapidApiKey: cachedFirestoreCreds.rapidApiKey || '',
          expiresAt: Date.now() + CREDENTIALS_CACHE_TTL_MS,
        };

        return sendJson(res, 200, {
          success: true,
          providerUrl: cleanUrl,
          maskedKey: `••••••••${cleanKey.slice(-4)}`,
          balance: testData.balance ?? null,
          currency: testData.currency ?? 'USD',
          message: '¡Credenciales verificadas exitosamente!',
        });
      } catch (err) {
        return sendJson(res, 200, {
          success: false,
          error: `Error al conectar con el proveedor: ${err?.message || 'Error de red.'}`,
        });
      }
    }

    // 4. Provider Balance (Admin only)
    if (route === '/provider/balance') {
      const { apiUrl, apiKey } = await resolveProviderCredentials(adminIdToken);
      if (!apiUrl || !apiKey) {
        return sendJson(res, 200, {
          success: false,
          configured: false,
          error: 'Clave API de MazSocialMarket no configurada en config/provider.',
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
            error: `Respuesta no válida del proveedor (${response.status}).`,
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

    // 5. Sync Order Status (Admin only)
    if (route === '/provider/order-status') {
      const { orderId, orderIds } = body || {};
      const { apiUrl, apiKey } = await resolveProviderCredentials(adminIdToken);

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
          error: 'La clave API del proveedor (MazSocialMarket) no está configurada en config/provider.',
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

    // 6. Live Instagram Profile Lookup (Admin only)
    if (route === '/instagram/profile') {
      const rawUsername =
        (typeof req?.query?.username === 'string' && req.query.username) ||
        urlObj.searchParams.get('username') ||
        '';
      if (!rawUsername.trim()) {
        return sendJson(res, 400, {
          success: false,
          error: 'Debes proporcionar un nombre de usuario o enlace de Instagram.',
        });
      }

      const { rapidApiKey } = await resolveProviderCredentials(adminIdToken);
      const profile = await fetchLiveInstagramProfile(rawUsername, rapidApiKey);
      return sendJson(res, 200, {
        success: profile.followersCount !== null,
        profile,
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
