/**
 * login → GitHub → callback → session cookie. Also logout and me.
 *
 * The allow-list check happens here, once, before a session exists: a GitHub
 * account that is not the owner's or the maintainer's never gets a cookie, so
 * no later endpoint has to re-decide who may write.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { config, roleFor, selfOrigin } from '../_lib/env.js';
import { exchangeCode, viewer } from '../_lib/github.js';
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  clearCookie,
  cookie,
  parseCookies,
  safeEqual,
  seal,
  unseal,
} from '../_lib/session.js';
import type { Session } from '../_lib/session.js';

const SESSION_DAYS = 180;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const action = String(req.query.action ?? '');
  let cfg;
  try {
    cfg = config();
  } catch (error) {
    res.status(500).json({ error: 'misconfigured', detail: String((error as Error).message) });
    return;
  }

  const origin = selfOrigin(req.headers.host);
  const redirectUri = `${origin}/api/auth/callback`;
  const cookies = parseCookies(req.headers.cookie);

  if (action === 'login') {
    const state = randomBytes(16).toString('base64url');
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    res.setHeader('Set-Cookie', cookie(STATE_COOKIE, state, { maxAge: 600 }));
    res.redirect(302, url.toString());
    return;
  }

  if (action === 'callback') {
    const { code, state } = req.query as Record<string, string>;
    const expected = cookies[STATE_COOKIE];
    if (!code || !state || !expected || !safeEqual(state, expected)) {
      res.status(400).send(page('ההתחברות לא הושלמה', 'אפשר לנסות שוב מהעמוד הראשי.'));
      return;
    }
    try {
      const tokens = await exchangeCode(cfg.clientId, cfg.clientSecret, code, redirectUri);
      const user = await viewer(tokens.accessToken);
      if (!cfg.allowedLogins.includes(user.login.toLowerCase())) {
        res.setHeader('Set-Cookie', clearCookie(STATE_COOKIE));
        res.status(403).send(page('אין הרשאה', 'החשבון הזה אינו מורשה לערוך את האתר.'));
        return;
      }
      const session: Session = {
        login: user.login,
        role: roleFor(user.login, cfg),
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
        refreshToken: tokens.refreshToken,
        refreshExpiresAt: tokens.refreshExpiresAt,
      };
      res.setHeader('Set-Cookie', [
        clearCookie(STATE_COOKIE),
        cookie(SESSION_COOKIE, seal(session, cfg.sessionSecret), {
          maxAge: SESSION_DAYS * 24 * 3600,
        }),
      ]);
      res.redirect(302, '/');
    } catch {
      res.status(502).send(page('ההתחברות נכשלה', 'אפשר לנסות שוב בעוד רגע.'));
    }
    return;
  }

  if (action === 'logout') {
    res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE));
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'me') {
    const session = unseal<Session>(cookies[SESSION_COOKIE] ?? '', cfg.sessionSecret);
    if (!session) {
      res.status(401).json({ signedIn: false });
      return;
    }
    res.status(200).json({ signedIn: true, login: session.login, role: session.role });
    return;
  }

  res.status(404).json({ error: 'unknown action' });
}

/** A Hebrew, RTL page - these are the only responses the owner sees directly. */
const page = (title: string, body: string): string =>
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${title}</title>` +
  `<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;` +
  `background:#f7f4ef;color:#2d2a26;text-align:center;padding:24px}a{color:#3f6f63}</style>` +
  `<div><h1 style="font-weight:400">${title}</h1><p>${body}</p><p><a href="/">חזרה</a></p></div>`;
