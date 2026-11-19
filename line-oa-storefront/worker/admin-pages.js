import { assets } from './assets.generated.js';
import {
  activeSession, attemptAllowed, configurePassword, endSession, isStoreOwner,
  readPassword, sameOrigin, startSession, validPassword, verifyPassword,
} from './admin-auth.js';

const headers = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
  'Content-Type': 'text/html; charset=utf-8',
};
const ownerSignIn = '/signin-with-chatgpt?return_to=%2Fadmin%2Fsetup';

function screen(request, title, content, status = 200, extra = {}) {
  const page = assets['/admin-auth.html'].text.replaceAll('{{TITLE}}', title).replace('{{BODY}}', content);
  return new Response(request.method === 'HEAD' ? null : page, { status, headers: { ...headers, ...extra } });
}

function redirect(location, status = 303, sessionCookie) {
  const responseHeaders = { ...headers, Location: location };
  if (sessionCookie) responseHeaders['Set-Cookie'] = sessionCookie;
  return new Response(null, { status, headers: responseHeaders });
}

function loginScreen(request, error = '', status = 200, extra = {}) {
  const message = error
    ? `<p class="error" role="alert">${error}</p>`
    : '<p>ใช้รหัสผ่านร้านเพื่อเข้าจัดการสินค้าและราคา</p>';
  return screen(request, 'เข้าหลังบ้าน', `${message}
    <form action="/admin/login" method="post">
      <label>รหัสผ่านร้าน
        <input type="password" name="password" required maxlength="256" autocomplete="current-password">
      </label>
      <button type="submit" class="primary">เข้าสู่ระบบ</button>
    </form>`, status, extra);
}

function setupIntro(request) {
  return screen(request, 'ตั้งรหัสผ่านร้าน', `
    <p>ยืนยันด้วยบัญชี ChatGPT ของเจ้าของร้านหนึ่งครั้งเพื่อตั้งรหัสผ่านสำหรับเข้าหลังบ้าน</p>
    <a class="primary" href="${ownerSignIn}" target="_top">ยืนยันว่าเป็นเจ้าของร้าน</a>
  `);
}

function setupForm(request, error = '') {
  return screen(request, 'ตั้งรหัสผ่านร้าน', `
    ${error ? `<p class="error" role="alert">${error}</p>` : '<p>เลือกรหัสผ่านร้านตั้งแต่ 14 ตัวอักษร</p>'}
    <form action="/admin/setup" method="post">
      <label>รหัสผ่านใหม่
        <input type="password" name="password" required minlength="14" maxlength="256" autocomplete="new-password">
      </label>
      <label>ยืนยันรหัสผ่าน
        <input type="password" name="confirm" required minlength="14" maxlength="256" autocomplete="new-password">
      </label>
      <button type="submit" class="primary">บันทึกรหัสผ่าน</button>
    </form>`, error ? 400 : 200);
}

async function formFields(request) {
  const type = request.headers.get('content-type')?.split(';')[0].trim();
  if (type !== 'application/x-www-form-urlencoded') return null;
  // Read only the small body a password form can produce.
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let total = 0;
  let body = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > 4096) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  return new URLSearchParams(body + decoder.decode());
}

async function login(request, env, fields) {
  const current = await readPassword(env.DB);
  if (!current) return redirect('/admin/setup');
  const password = fields?.get('password') || '';
  if (!await attemptAllowed(request, env)) {
    return loginScreen(request, 'ลองหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่', 429, { 'Retry-After': '900' });
  }
  if (!validPassword(password) || !await verifyPassword(env, password, current)) {
    return loginScreen(request, 'รหัสผ่านไม่ถูกต้อง', 401);
  }
  return redirect('/admin', 303, await startSession(request, env.DB));
}

async function setup(request, env, fields) {
  if (!isStoreOwner(request, env)) {
    return screen(request, 'ยืนยันสิทธิ์เจ้าของร้าน', '<p>ใช้บัญชีเจ้าของร้านเพื่อตั้งรหัสผ่าน</p><a class="secondary" href="/admin/setup">กลับไปตั้งรหัสผ่าน</a>', 403);
  }
  if (await readPassword(env.DB)) return redirect('/admin');
  const password = fields?.get('password') || '';
  if (!validPassword(password)) return setupForm(request, 'กรอกรหัสผ่านตั้งแต่ 14 ถึง 128 ตัวอักษร');
  if (password !== fields.get('confirm')) return setupForm(request, 'รหัสผ่านทั้งสองช่องต้องตรงกัน');
  if (!await configurePassword(env, password)) return redirect('/admin');
  return redirect('/admin', 303, await startSession(request, env.DB));
}

export async function adminRoute(request, url, env) {
  const path = url.pathname;
  if (request.method === 'POST') {
    if (!sameOrigin(request, url)) return screen(request, 'เปิดหลังบ้านของร้าน', '<p>ส่งฟอร์มจากหน้าเว็บไซต์ของร้าน</p>', 403);
    if (path === '/admin/logout') return redirect('/admin', 303, await endSession(request, env.DB));
    if (path === '/admin/login') return login(request, env, await formFields(request));
    if (path === '/admin/setup') return setup(request, env, await formFields(request));
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD, POST' } });
  }
  if (path === '/admin/setup') {
    if (await readPassword(env.DB)) return redirect('/admin', 302);
    return isStoreOwner(request, env) ? setupForm(request) : setupIntro(request);
  }
  if (path === '/admin' || path === '/admin/' || path === '/admin.html') {
    if (await activeSession(request, env.DB)) {
      return new Response(request.method === 'HEAD' ? null : assets['/admin.html'].text, { headers });
    }
    if (!await readPassword(env.DB)) return setupIntro(request);
    return loginScreen(request);
  }
  return new Response('ไม่พบหน้านี้', { status: 404, headers });
}
