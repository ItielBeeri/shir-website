/**
 * The session cookie.
 *
 * It carries the GitHub user access token, so it is encrypted (AES-256-GCM),
 * not merely signed: HttpOnly keeps it away from page scripts, and encryption
 * keeps it from being a usable bearer token anywhere it might be logged or
 * mirrored. The client never sees the token - every GitHub call is made by the
 * function, which is what lets the write allowlist be unbypassable.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Role } from './env.js';

export const SESSION_COOKIE = 'sid';
export const STATE_COOKIE = 'oas';

export interface Session {
  login: string;
  role: Role;
  accessToken: string;
  /** Epoch ms. GitHub user tokens last 8 hours when expiry is enabled. */
  expiresAt: number;
  refreshToken?: string;
  refreshExpiresAt?: number;
}

const key = (secret: string): Buffer => createHash('sha256').update(secret).digest();

export function seal(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function unseal<T>(token: string, secret: string): T | null {
  try {
    const [iv, tag, body] = token.split('.').map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !body || iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(
  name: string,
  value: string,
  options: { maxAge: number; sameSite?: 'Lax' | 'Strict' },
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    `SameSite=${options.sameSite ?? 'Lax'}`,
    `Max-Age=${options.maxAge}`,
  ];
  return parts.join('; ');
}

export const clearCookie = (name: string): string =>
  `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Refresh a little early, so a call never starts with a token about to die. */
export const needsRefresh = (session: Session): boolean =>
  session.expiresAt - Date.now() < 5 * 60_000;
