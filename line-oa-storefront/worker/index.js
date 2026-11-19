import { assets } from './assets.generated.js';
import { CatalogError, getCatalog, renderStore, saveCatalog } from './catalog.js';
import { adminRoute } from './admin-pages.js';
import { activeSession, sameOrigin } from './admin-auth.js';

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const htmlHeaders = { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8' };
const methods = ['GET', 'POST', 'PATCH'];

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...privateHeaders, ...headers } });
}

async function adminApi(request, url, env) {
  if (!await activeSession(request, env.DB)) return json({ error: 'กรุณาเข้าสู่หลังบ้านด้วยรหัสผ่านร้าน' }, 403);
  if (!methods.includes(request.method)) {
    return json({ error: 'วิธีเรียกใช้งานไม่รองรับ' }, 405, { Allow: methods.join(', ') });
  }
  if (request.method === 'GET') return json(await getCatalog(env.DB));

  if (!sameOrigin(request, url) || request.headers.get('x-shop-action') !== 'catalog') {
    return json({ error: 'กรุณาบันทึกข้อมูลจากหน้าหลังบ้านของร้าน' }, 403);
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 415);
  }
  const body = await request.text();
  if (body.length > 12000) return json({ error: 'ข้อมูลยาวเกินไป' }, 413);
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return json({ error: 'อ่านข้อมูลที่ส่งมาไม่ได้' }, 400);
  }
  return json(await saveCatalog(env.DB, request.method, data), request.method === 'POST' ? 201 : 200);
}

function staticAsset(request, asset) {
  const headers = new Headers({
    'Content-Type': asset.type,
    'Cache-Control': 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    ETag: asset.etag,
  });
  if (request.headers.get('if-none-match') === asset.etag && !request.headers.get('range')) {
    return new Response(null, { status: 304, headers });
  }
  if (!asset.base64) return new Response(request.method === 'HEAD' ? null : asset.text, { headers });
  headers.set('Accept-Ranges', 'bytes');
  let start = 0;
  let end = asset.size - 1;
  let status = 200;
  const range = request.headers.get('range');
  if (range) {
    const parsed = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!parsed || (!parsed[1] && !parsed[2])) {
      headers.set('Content-Range', `bytes */${asset.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (parsed[1]) {
      start = Number(parsed[1]);
      end = parsed[2] ? Math.min(end, Number(parsed[2])) : end;
    } else {
      start = Math.max(0, asset.size - Number(parsed[2]));
    }
    if (start > end || !Number.isSafeInteger(start)) {
      headers.set('Content-Range', `bytes */${asset.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${asset.size}`);
    status = 206;
  }
  headers.set('Content-Length', end - start + 1);
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const bytes = typeof Uint8Array.fromBase64 === 'function'
    ? Uint8Array.fromBase64(asset.base64)
    : Uint8Array.from(atob(asset.base64), byte => byte.charCodeAt(0));
  return new Response(status === 206 ? bytes.subarray(start, end + 1) : bytes, { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    try {
      if (pathname === '/api/admin/catalog') return await adminApi(request, url, env);
      if (pathname === '/admin' || pathname === '/admin.html' || pathname.startsWith('/admin/')) {
        return await adminRoute(request, url, env);
      }
      if (pathname === '/admin-auth.html') return new Response('ไม่พบหน้านี้', { status: 404, headers: htmlHeaders });
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
      }
      if (pathname === '/' || pathname === '/index.html') {
        if (request.method === 'HEAD') return new Response(null, { headers: htmlHeaders });
        const [catalog, admin] = await Promise.all([getCatalog(env.DB), activeSession(request, env.DB)]);
        const page = renderStore(assets['/index.html'].text, catalog, admin);
        return new Response(page, { headers: htmlHeaders });
      }
      if (Object.hasOwn(assets, pathname)) return staticAsset(request, assets[pathname]);
      return new Response('ไม่พบหน้านี้', { status: 404, headers: htmlHeaders });
    } catch (error) {
      if (error instanceof CatalogError) return json({ error: error.message }, error.status);
      console.error(error);
      if (pathname.startsWith('/api/')) return json({ error: 'เชื่อมต่อฐานข้อมูลร้านไม่ได้ชั่วคราว กรุณาลองใหม่' }, 503);
      return new Response('โหลดข้อมูลร้านไม่ได้ชั่วคราว กรุณาลองอีกครั้ง', { status: 503, headers: htmlHeaders });
    }
  },
};
