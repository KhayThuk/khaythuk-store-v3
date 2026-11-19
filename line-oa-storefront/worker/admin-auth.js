const cookieName = '__Host-khaythuk-admin';
const sessionDuration = 12 * 60 * 60;
const loginWindow = 15 * 60;
const loginAttempts = 8;
const iterations = 100000;
const encoder = new TextEncoder();

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = value => Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));
const randomHex = size => hex(crypto.getRandomValues(new Uint8Array(size)));
const now = () => Math.floor(Date.now() / 1000);

export function sameOrigin(request, url) {
  return request.headers.get('origin') === url.origin;
}

export function isStoreOwner(request, env) {
  const owner = env.SHOP_ADMIN_EMAIL?.trim().toLowerCase();
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return Boolean(owner && email === owner && request.headers.get('oai-authenticated-user-id'));
}

async function sign(env, text) {
  if (!env.SHOP_LOGIN_PEPPER) throw new Error('SHOP_LOGIN_PEPPER is missing');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.SHOP_LOGIN_PEPPER), {
    name: 'HMAC', hash: 'SHA-256',
  }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(text));
}

export async function readPassword(db) {
  return db.prepare('SELECT salt, verifier FROM shop_admin_password WHERE id = 1').first();
}

export function validPassword(password) {
  const length = Array.from(password).length;
  return length >= 14 && length <= 128;
}

async function makeVerifier(env, password, salt) {
  const peppered = await sign(env, 'password:' + password);
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations,
  }, key, 256));
}

export async function verifyPassword(env, password, current) {
  const check = await makeVerifier(env, password, current.salt);
  const stored = fromHex(current.verifier);
  let difference = 0;
  for (let index = 0; index < check.length; index++) difference |= check[index] ^ stored[index];
  return difference === 0;
}

export async function configurePassword(env, password) {
  const salt = randomHex(16);
  const verifier = hex(await makeVerifier(env, password, salt));
  const result = await env.DB.prepare(
    'INSERT INTO shop_admin_password (id, salt, verifier) VALUES (1, ?, ?) ON CONFLICT (id) DO NOTHING'
  ).bind(salt, verifier).run();
  return result.meta.changes === 1;
}

function cookie(token, lifespan) {
  return `${cookieName}=${token}; Max-Age=${lifespan}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

async function currentTokenHash(request) {
  const tokens = (request.headers.get('cookie') || '').split(';').map(part => part.trim());
  const token = tokens.find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  return /^[0-9a-f]{64}$/.test(token ?? '') ? tokenHash(token) : null;
}

async function tokenHash(token) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(token))));
}

export async function activeSession(request, db) {
  const hash = await currentTokenHash(request);
  if (!hash) return false;
  const row = await db.prepare('SELECT token_hash FROM shop_admin_sessions WHERE token_hash = ? AND expires_at > ?')
    .bind(hash, now()).first();
  return Boolean(row);
}

export async function startSession(request, db) {
  const token = randomHex(32);
  const hash = await tokenHash(token);
  const previous = await currentTokenHash(request);
  const time = now();
  const writes = [
    db.prepare('DELETE FROM shop_admin_sessions WHERE expires_at <= ?').bind(time),
    db.prepare('DELETE FROM shop_admin_login_limits WHERE time_window < ?').bind(Math.floor(time / loginWindow) - 1),
    db.prepare('INSERT INTO shop_admin_sessions (token_hash, expires_at) VALUES (?, ?)').bind(hash, time + sessionDuration),
  ];
  if (previous) writes.push(db.prepare('DELETE FROM shop_admin_sessions WHERE token_hash = ?').bind(previous));
  await db.batch(writes);
  return cookie(token, sessionDuration);
}

export async function endSession(request, db) {
  const hash = await currentTokenHash(request);
  if (hash) await db.prepare('DELETE FROM shop_admin_sessions WHERE token_hash = ?').bind(hash).run();
  return cookie('', 0);
}

export async function attemptAllowed(request, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const key = hex(new Uint8Array(await sign(env, 'ip:' + ip)));
  const timeWindow = Math.floor(now() / loginWindow);
  const row = await env.DB.prepare(`
    INSERT INTO shop_admin_login_limits (client_hash, time_window, attempts) VALUES (?, ?, 1)
    ON CONFLICT (client_hash) DO UPDATE SET
      time_window = excluded.time_window,
      attempts = CASE WHEN time_window = excluded.time_window THEN attempts + 1 ELSE 1 END
    WHERE time_window < excluded.time_window OR attempts < ?
    RETURNING attempts
  `).bind(key, timeWindow, loginAttempts).first();
  if (!row) return false;
  if (row.attempts === 1) {
    await env.DB.prepare('DELETE FROM shop_admin_login_limits WHERE time_window < ?').bind(timeWindow - 1).run();
  }
  return true;
}
