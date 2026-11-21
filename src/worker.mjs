import { shell, stylesheet, client, hero } from './assets.mjs';

const enc = new TextEncoder();
const maxUpload = 4 * 1024 * 1024;
const headers = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin',
  'content-security-policy': "default-src 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'",
};
const assets = new Map([
  ['/style.css', ['text/css; charset=utf-8', stylesheet]],
  ['/app.js', ['text/javascript; charset=utf-8', client]],
  ['/hero.webp', ['image/webp', Uint8Array.from(atob(hero), c => c.charCodeAt(0))]],
]);
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
const one = (db, sql, ...args) => stmt(db, sql, ...args).first();
const all = async (db, sql, ...args) => (await stmt(db, sql, ...args).all()).results;
const run = (db, sql, ...args) => stmt(db, sql, ...args).run();
const respond = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
});
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function field(value, limit, required = true) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) fail(400, 'กรุณาตรวจสอบข้อมูลที่กรอก');
  return value.trim();
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(400, 'จำนวนเงินหรือจำนวนสินค้าไม่ถูกต้อง');
  return value;
}
function hex(bytes) { return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join(''); }
async function digest(bytes) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); }
function matches(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function passwordHash(raw, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(raw), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt: enc.encode(salt) }, key, 256);
  return hex(new Uint8Array(hash));
}
function cookie(url, token, age) {
  return `mali_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
function sessionToken(request) { return request.headers.get('cookie')?.match(/(?:^|; *)mali_session=([a-f0-9]{64})(?:;|$)/)?.[1]; }
async function current(request, db) {
  const token = sessionToken(request);
  if (!token) return null;
  return one(db, `SELECT u.id,u.username,u.email,u.display_name,u.role,u.balance
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?`,
    await digest(enc.encode(token)), Date.now());
}
async function loginSession(db, user, url) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const age = 60 * 60 * 24 * 3;
  await db.batch([
    stmt(db, 'DELETE FROM sessions WHERE expires<=?', Date.now()),
    stmt(db, 'INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)', await digest(enc.encode(token)), user, Date.now() + age * 1000),
  ]);
  return { 'set-cookie': cookie(url, token, age) };
}
async function cap(request, maximum) {
  if (Number(request.headers.get('content-length')) > maximum) fail(413, 'ไฟล์หรือข้อมูลมีขนาดใหญ่เกินกำหนด');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'กรุณาส่งข้อมูล');
  const parts = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) { await reader.cancel(); fail(413, 'ไฟล์หรือข้อมูลมีขนาดใหญ่เกินกำหนด'); }
    parts.push(value);
  }
  return new Blob(parts);
}
async function payload(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'รูปแบบข้อมูลไม่รองรับ');
  const bytes = await cap(request, 24 * 1024);
  try {
    const data = JSON.parse(await bytes.text());
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* invalid JSON */ }
  fail(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
}
async function imageFile(request) {
  const type = request.headers.get('content-type');
  if (!type?.startsWith('multipart/form-data;')) fail(415, 'กรุณาอัปโหลดรูปภาพ');
  const body = await cap(request, maxUpload + 8192);
  let file;
  try { file = (await new Response(body, { headers: { 'content-type': type } }).formData()).get('image'); }
  catch { fail(400, 'ไม่สามารถอ่านไฟล์ได้'); }
  if (!(file instanceof File) || !file.size || file.size > maxUpload) fail(400, 'เลือกรูปภาพขนาดไม่เกิน 4 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = hex(bytes.slice(0, 12));
  const mime = signature.startsWith('89504e470d0a1a0a') ? 'image/png'
    : signature.startsWith('ffd8ff') ? 'image/jpeg'
    : signature.startsWith('52494646') && signature.endsWith('57454250') ? 'image/webp' : null;
  if (!mime) fail(400, 'รองรับรูป JPG, PNG หรือ WebP');
  return { bytes, mime };
}
async function throttle(db, scope, count, minutes) {
  const time = Date.now();
  const record = await one(db, `INSERT INTO login_limits(scope,hits,until) VALUES(?,1,?)
    ON CONFLICT(scope) DO UPDATE SET hits=CASE WHEN until<=? THEN 1 ELSE hits+1 END,
    until=CASE WHEN until<=? THEN excluded.until ELSE until END RETURNING hits`, scope, time + minutes * 60000, time, time);
  if (record.hits > count) fail(429, 'มีรายการถี่เกินกำหนด กรุณาลองใหม่ในภายหลัง');
}
const defaultSettings = { bank: '', account: '', holder: '' };
async function storeSettings(db) {
  const data = await one(db, "SELECT value FROM settings WHERE key='bank'");
  return data ? JSON.parse(data.value) : defaultSettings;
}
const validRef = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{6,128}$/.test(value);
const autoEnabled = env => Boolean(env.SLIP_VERIFY_URL && env.SLIP_VERIFY_KEY && env.SLIP_RECEIVER_ID);
async function verifySlip(env, bytes, mime) {
  if (!autoEnabled(env)) return null;
  const url = new URL(env.SLIP_VERIFY_URL);
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const data = new FormData();
  data.set('image', new Blob([bytes], { type: mime }), 'slip');
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { authorization: `Bearer ${env.SLIP_VERIFY_KEY}` },
      body: data, signal: AbortSignal.timeout(12000), redirect: 'error',
    });
    if (!response.ok) return null;
    const result = await response.json();
    const age = Date.now() - Date.parse(result.transferredAt);
    if (result.verified !== true || result.currency !== 'THB' || result.receiverId !== env.SLIP_RECEIVER_ID ||
        !validRef(result.reference) || !Number.isSafeInteger(result.amountSatang) ||
        result.amountSatang < 1 || result.amountSatang > 10000000 ||
        !Number.isFinite(age) || age < -300000 || age > 86400000) return null;
    return { amount: result.amountSatang, reference: result.reference };
  } catch { return null; }
}
async function approve(db, topup, amount, reference, reviewer, note) {
  return run(db, `UPDATE topups SET status='approved',amount=?,reference=?,reviewer=?,note=?,reviewed_at=?
    WHERE id=? AND status='pending'`, amount, reference, reviewer, note, now(), topup);
}
async function imageResponse(env, key, publicImage) {
  const object = await env.BUCKET.get(key);
  if (!object) fail(404, 'ไม่พบรูปภาพ');
  return new Response(object.body, { headers: {
    ...headers, 'content-type': object.httpMetadata.contentType,
    'cache-control': publicImage ? 'public, max-age=86400' : 'private, no-store',
  } });
}
async function api(request, env, url) {
  const db = env.DB;
  const path = url.pathname;
  const method = request.method;
  if (!db) fail(503, 'ระบบฐานข้อมูลยังไม่พร้อม');
  if (method !== 'GET' && method !== 'POST') fail(405, 'วิธีเรียกใช้ไม่รองรับ');
  if (method === 'POST' && request.headers.get('origin') !== url.origin) fail(403, 'คำขอมาจากเว็บไซต์อื่น');
  const user = await current(request, db);
  const admin = user?.role === 'admin';
  const ownerSetup = Boolean(env.ADMIN_INITIALIZE_FROM_OWNER === '1' &&
    (env.LOCAL_SETUP === '1' || request.headers.get('oai-authenticated-user-id')) &&
    !(await one(db, "SELECT id FROM users WHERE role='admin'")));
  if (method === 'GET' && path === '/api/store') {
    const products = await all(db, `SELECT id,name,category,description,price,stock,image_key
      FROM products WHERE active=1 ORDER BY updated_at DESC LIMIT 500`);
    return respond({ user, products, ownerSetup });
  }
  if (method === 'GET' && /^\/api\/images\/[a-f0-9-]{36}$/.test(path)) return imageResponse(env, 'products/' + path.split('/').at(-1), true);

  if (method === 'POST' && ['/api/signup', '/api/login', '/api/setup'].includes(path)) {
    const data = await payload(request);
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    if (path === '/api/setup') {
      if (!ownerSetup) fail(403, 'หน้านี้ใช้ตั้งค่าบัญชีเจ้าของร้านครั้งแรกเท่านั้น');
      const password = hex(crypto.getRandomValues(new Uint8Array(16)));
      const salt = id();
      const userId = id();
      const email = request.headers.get('oai-authenticated-user-email')?.toLowerCase() || 'owner@localhost.invalid';
      await run(db, "INSERT INTO users(id,username,email,display_name,password,role) VALUES(?,'admin',?,'เจ้าของร้าน',?,'admin')",
        userId, email, salt + ':' + await passwordHash(password, salt));
      return respond({ username: 'admin', password }, 201, await loginSession(db, userId, url));
    }
    const username = field(data.username, 32).toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) fail(400, 'ชื่อผู้ใช้ต้องยาว 3–32 ตัว ใช้ a-z, 0-9, จุด, ขีด หรือขีดล่างได้');
    const password = data.password;
    if (typeof password !== 'string' || password.length > 128 || password.length < 1) fail(400, 'กรุณาตรวจสอบรหัสผ่าน');
    if (path === '/api/signup') {
      await throttle(db, 'signup:' + ip, 10, 60);
      if (username === 'admin') fail(409, 'ชื่อผู้ใช้นี้ถูกสงวนไว้');
      if (password.length < 12) fail(400, 'ตั้งรหัสผ่านอย่างน้อย 12 ตัวอักษร');
      const email = field(data.email, 254).toLowerCase();
      if (email === request.headers.get('oai-authenticated-user-email')?.toLowerCase() &&
          env.ADMIN_INITIALIZE_FROM_OWNER === '1' && ownerSetup) fail(409, 'กรุณาตั้งค่าบัญชีเจ้าของร้านก่อน');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'อีเมลไม่ถูกต้อง');
      const salt = id();
      const userId = id();
      await run(db, 'INSERT INTO users(id,username,email,display_name,password) VALUES(?,?,?,?,?)',
        userId, username, email, field(data.display_name, 80), salt + ':' + await passwordHash(password, salt));
      return respond({ ok: true }, 201, await loginSession(db, userId, url));
    }
    await throttle(db, 'login-ip:' + ip, 35, 15);
    await throttle(db, 'login:' + username, 10, 15);
    const record = await one(db, 'SELECT id,password FROM users WHERE username=?', username);
    const [salt, hash] = record ? record.password.split(':') : ['missing-user', '0'.repeat(64)];
    const correct = matches(await passwordHash(password, salt), hash);
    if (!record || !correct) fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    await run(db, 'DELETE FROM login_limits WHERE scope=?', 'login:' + username);
    return respond({ ok: true }, 200, await loginSession(db, record.id, url));
  }
  if (method === 'POST' && path === '/api/logout') {
    const token = sessionToken(request);
    if (token) await run(db, 'DELETE FROM sessions WHERE token=?', await digest(enc.encode(token)));
    return respond({ ok: true }, 200, { 'set-cookie': cookie(url, '', 0) });
  }
  if (!user) fail(401, 'กรุณาเข้าสู่ระบบ');
  if (path.startsWith('/api/admin/') && !admin) fail(403, 'บัญชีนี้ไม่มีสิทธิ์จัดการร้าน');

  if (method === 'GET' && path === '/api/account') {
    const [orders, ledger, topups] = await Promise.all([
      all(db, 'SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100', user.id),
      all(db, 'SELECT * FROM ledger WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100', user.id),
      all(db, 'SELECT id,status,amount,note,created_at FROM topups WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100', user.id),
    ]);
    return respond({ user, orders, ledger, topups, settings: await storeSettings(db), auto: autoEnabled(env) });
  }
  if (method === 'POST' && path === '/api/orders') {
    const data = await payload(request);
    const key = field(data.key, 64);
    const productId = field(data.product, 64);
    const quantity = integer(data.quantity, 1, 99);
    const price = integer(data.price, 1, 10000000);
    const order = await one(db, `INSERT INTO orders(id,user_id,request_key,product_id,product_name,quantity,unit_price,total,delivery,status)
      SELECT ?,u.id,?,p.id,p.name,?,p.price,p.price*?,p.delivery,CASE WHEN p.delivery='' THEN 'confirmed' ELSE 'delivered' END
      FROM products p JOIN users u ON u.id=?
      WHERE p.id=? AND p.active=1 AND p.stock>=? AND p.price=? AND u.balance>=p.price*?
      ON CONFLICT(user_id,request_key) DO NOTHING RETURNING id`,
      id(), key, quantity, quantity, user.id, productId, quantity, price, quantity);
    const prior = order || await one(db, 'SELECT id FROM orders WHERE user_id=? AND request_key=? AND product_id=? AND quantity=? AND unit_price=?', user.id, key, productId, quantity, price);
    if (!prior) fail(409, 'ทำรายการไม่ได้ กรุณาตรวจสอบราคา สต็อก และยอดเงินคงเหลือ');
    return respond(prior, order ? 201 : 200);
  }
  if (method === 'POST' && path === '/api/topups') {
    const settings = await storeSettings(db);
    if (!settings.account) fail(409, 'ร้านค้ายังไม่เปิดรับการเติมเงิน');
    await throttle(db, 'topup:' + user.id, 12, 60);
    const { bytes, mime } = await imageFile(request);
    const topup = id();
    const signature = await digest(bytes);
    const key = 'slips/' + topup;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
    try {
      await run(db, 'INSERT INTO topups(id,user_id,image_digest,image_type) VALUES(?,?,?,?)', topup, user.id, signature, mime);
    } catch (err) {
      if (/UNIQUE constraint failed: topups.image_digest/i.test(String(err))) {
        await env.BUCKET.delete(key);
        fail(409, 'สลิปนี้ถูกส่งเข้าระบบแล้ว');
      }
      // Preserve the attachment if the database outcome is unknown.
      throw err;
    }
    const verified = await verifySlip(env, bytes, mime);
    if (!verified) return respond({ id: topup, status: 'pending' }, 201);
    try {
      const result = await approve(db, topup, verified.amount, verified.reference, null, 'ตรวจโดยระบบ');
      if (result.meta.changes) return respond({ id: topup, status: 'approved' }, 201);
    } catch (err) {
      if (/UNIQUE constraint failed: topups.reference/i.test(String(err))) {
        await run(db, "UPDATE topups SET status='rejected',note='เลขอ้างอิงนี้ถูกใช้แล้ว',reviewed_at=? WHERE id=? AND status='pending'", now(), topup);
      }
      // A limit or transient error leaves the recorded submission available for review.
    }
    const latest = await one(db, 'SELECT status FROM topups WHERE id=?', topup);
    return respond({ id: topup, status: latest.status }, 201);
  }
  if (method === 'GET' && path === '/api/admin/data') {
    const result = await Promise.all([
      all(db, 'SELECT * FROM products ORDER BY updated_at DESC LIMIT 500'),
      all(db, 'SELECT id,username,email,display_name,balance,created_at FROM users ORDER BY created_at DESC LIMIT 500'),
      all(db, 'SELECT o.*,u.username FROM orders o JOIN users u ON o.user_id=u.id ORDER BY o.created_at DESC,o.rowid DESC LIMIT 200'),
      all(db, "SELECT t.id,t.status,t.amount,t.reference,t.note,t.created_at,u.username FROM topups t JOIN users u ON t.user_id=u.id ORDER BY (t.status='pending') DESC,t.created_at DESC LIMIT 200"),
      all(db, 'SELECT l.*,u.username,a.username AS actor FROM ledger l JOIN users u ON u.id=l.user_id LEFT JOIN users a ON a.id=l.actor_id ORDER BY l.created_at DESC,l.rowid DESC LIMIT 200'),
      storeSettings(db),
    ]);
    const [products, users, orders, topups, ledger, settings] = result;
    return respond({ products, users, orders, topups, ledger, settings, auto: autoEnabled(env) });
  }
  if (method === 'GET' && /^\/api\/admin\/slips\/[a-f0-9-]{36}$/.test(path)) return imageResponse(env, 'slips/' + path.split('/').at(-1), false);

  if (method === 'POST' && path === '/api/admin/images') {
    const { bytes, mime } = await imageFile(request);
    const key = id();
    await env.BUCKET.put('products/' + key, bytes, { httpMetadata: { contentType: mime } });
    return respond({ key }, 201);
  }
  if (method === 'POST' && path === '/api/admin/products') {
    const data = await payload(request);
    const productId = data.id ? field(data.id, 36) : id();
    const image = data.image_key || null;
    if (image && (typeof image !== 'string' || !/^[a-f0-9-]{36}$/.test(image) || !(await env.BUCKET.head('products/' + image)))) fail(400, 'ไม่พบรูปสินค้าที่เลือก');
    const values = [field(data.name, 120), field(data.category, 60), field(data.description, 3000, false),
      integer(data.price, 1, 10000000), integer(data.stock, 0, 1000000), image,
      field(data.delivery, 3000, false), data.active === true ? 1 : 0, now()];
    if (data.id) {
      const revision = integer(data.revision, 0, Number.MAX_SAFE_INTEGER);
      const result = await run(db, `UPDATE products SET name=?,category=?,description=?,price=?,stock=?,image_key=?,
        delivery=?,active=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?`, ...values, productId, revision);
      if (!result.meta.changes) fail(409, 'สินค้าหรือสต็อกเพิ่งเปลี่ยน กรุณาเปิดหน้าแก้ไขใหม่');
    } else {
      await run(db, `INSERT INTO products(id,name,category,description,price,stock,image_key,delivery,active,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`, productId, ...values);
    }
    return respond({ id: productId });
  }
  if (method === 'POST' && path === '/api/admin/adjust') {
    const data = await payload(request);
    const delta = integer(data.delta, -10000000, 10000000);
    if (!delta) fail(400, 'ระบุยอดที่จะปรับ');
    const result = await run(db, `INSERT INTO ledger(id,user_id,delta,kind,reason,actor_id)
      SELECT ?,id,?,'adjustment',?,? FROM users WHERE id=? AND balance+? BETWEEN 0 AND 100000000
      ON CONFLICT(id) DO NOTHING`,
      'adjust:' + field(data.key, 64), delta, field(data.reason, 250), user.id, field(data.user, 36), delta);
    if (!result.meta.changes && !(await one(db, 'SELECT id FROM ledger WHERE id=?', 'adjust:' + data.key))) fail(409, 'ไม่พบผู้ใช้หรือยอดคงเหลือจะเกินขอบเขต');
    return respond({ ok: true });
  }
  if (method === 'POST' && path === '/api/admin/review') {
    const data = await payload(request);
    const topup = field(data.id, 36);
    const note = field(data.note, 250);
    let result;
    if (data.status === 'approved') {
      const ref = field(data.reference, 128);
      if (!validRef(ref)) fail(400, 'ระบุเลขอ้างอิงจากธนาคาร');
      result = await approve(db, topup, integer(data.amount, 1, 10000000), ref, user.id, note);
    } else if (data.status === 'rejected') {
      result = await run(db, "UPDATE topups SET status='rejected',reviewer=?,note=?,reviewed_at=? WHERE id=? AND status='pending'", user.id, note, now(), topup);
    } else fail(400, 'สถานะไม่ถูกต้อง');
    if (!result.meta.changes) fail(409, 'รายการนี้ถูกตรวจแล้วหรือไม่มีรายการ');
    return respond({ ok: true });
  }
  if (method === 'POST' && path === '/api/admin/fulfill') {
    const data = await payload(request);
    const result = await run(db, "UPDATE orders SET delivery=?,status='delivered' WHERE id=? AND status='confirmed'",
      field(data.delivery, 3000), field(data.id, 36));
    if (!result.meta.changes) fail(409, 'ไม่พบคำสั่งซื้อที่รอส่งมอบ');
    return respond({ ok: true });
  }
  if (method === 'POST' && path === '/api/admin/settings') {
    const data = await payload(request);
    const settings = { bank: field(data.bank, 80, false), account: field(data.account, 50, false), holder: field(data.holder, 100, false) };
    if (Object.values(settings).some(Boolean) && !Object.values(settings).every(Boolean)) fail(400, 'กรอกข้อมูลบัญชีรับเงินให้ครบ');
    await run(db, "INSERT INTO settings(key,value) VALUES('bank',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(settings));
    return respond(settings);
  }
  fail(404, 'ไม่พบหน้านี้');
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); }
      catch (error) {
        if (error.status) return respond({ error: error.message }, error.status);
        if (/UNIQUE constraint failed/i.test(String(error))) return respond({ error: 'ข้อมูลหรือเลขอ้างอิงนี้ถูกใช้แล้ว' }, 409);
        if (/CHECK constraint failed/i.test(String(error))) return respond({ error: 'ยอดคงเหลือหรือจำนวนรายการเกินขอบเขต' }, 409);
        console.error('Store request failed', url.pathname.replace(/[a-f0-9-]{36}/g, ':id'), error.name);
        return respond({ error: 'ระบบขัดข้อง กรุณาลองใหม่' }, 500);
      }
    }
    const asset = assets.get(url.pathname);
    if (asset) return new Response(asset[1], { headers: { ...headers, 'content-type': asset[0], 'cache-control': 'public, max-age=60' } });
    if (request.method !== 'GET') return new Response(null, { status: 405, headers });
    return new Response(shell, { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
  },
};
