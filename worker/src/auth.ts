import type { Context } from 'hono';
import type { Env, JwtPayload } from './types';

const JWT_EXPIRY_HOURS = 24 * 7; // 1 week

// ── JWT (HS256, manual — no external lib needed) ──────────────────────────────

function b64url(data: string | ArrayBuffer): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b), c => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function signJwt(payload: Omit<JwtPayload, 'exp'>, secret: string): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + JWT_EXPIRY_HOURS * 3600;
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC', key,
    b64urlDecode(sig),
    new TextEncoder().encode(`${header}.${body}`)
  );
  if (!valid) return null;
  const payload: JwtPayload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ── Google ID token validation ────────────────────────────────────────────────

interface GoogleKey {
  kid: string;
  n: string;
  e: string;
}

let googleKeysCache: { keys: GoogleKey[]; fetchedAt: number } | null = null;

async function getGooglePublicKeys(): Promise<GoogleKey[]> {
  const now = Date.now();
  if (googleKeysCache && now - googleKeysCache.fetchedAt < 3600_000) {
    return googleKeysCache.keys;
  }
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  const data = await res.json() as { keys: GoogleKey[] };
  googleKeysCache = { keys: data.keys, fetchedAt: now };
  return data.keys;
}

function b64urlToBigInt(s: string): bigint {
  const bytes = b64urlDecode(s);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return BigInt('0x' + hex);
}

export async function verifyGoogleToken(idToken: string, clientId: string): Promise<string | null> {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string; email?: string; email_verified?: boolean; exp?: number };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }

  if (payload.aud !== clientId) return null;
  if (!payload.email || !payload.email_verified) return null;
  if ((payload.exp ?? 0) < Math.floor(Date.now() / 1000)) return null;

  const keys = await getGooglePublicKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', cryptoKey,
      b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return valid ? payload.email : null;
  } catch {
    return null;
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────────

export async function requireAdmin(c: Context<{ Bindings: Env }>, next: () => Promise<void>): Promise<Response | void> {
  const auth = c.req.header('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  const token = auth.slice(7);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  c.set('jwtPayload', payload);
  await next();
}
