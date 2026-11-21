const main = document.querySelector('#main');
const nav = document.querySelector('#user-nav');
const toast = document.querySelector('#toast');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const formatMoney = new Intl.NumberFormat('th-TH', {style:'currency',currency:'THB',minimumFractionDigits:2});
const cash = value => formatMoney.format(value / 100);
const date = value => escape(new Date(value).toLocaleString('th-TH', {dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}));
const labels = {pending:'รอตรวจสอบ',approved:'อนุมัติแล้ว',rejected:'ไม่ผ่าน',confirmed:'ยืนยันแล้ว',delivered:'ส่งมอบแล้ว',order:'ซื้อสินค้า',topup:'เติมเงิน',adjustment:'ปรับยอด'};
const badge = name => `<span class="pill ${escape(name)}">${escape(labels[name] ?? name)}</span>`;
const img = key => '/api/images/' + encodeURIComponent(key);
const button = (label, classes = '', attrs = '') => `<button class="button ${classes}" ${attrs}>${label}</button>`;
const link = (label, route, classes = '') => `<a class="button ${classes}" href="#${route}">${label}</a>`;
const note = msg => `<p class="notice">${msg}</p>`;
const title = (heading, sub = '') => `<header class="page-head"><h1>${heading}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</header>`;
const empty = message => `<p class="empty">${message}</p>`;
const input = (label, name, attributes = '') => `<label>${label}<input name="${name}" ${attributes}></label>`;
const typed = (label, name, value = '', required = false) => input(label, name, `value="${escape(value)}" ${required ? 'required' : ''}`);
const priceInput = (label, name, value = '') => input(label, name, `type="number" min="0.01" max="100000" step="0.01" value="${escape(value)}" required`);
const area = (label, name, value, max = 3000) => `<label>${label}<textarea name="${name}" maxlength="${max}">${escape(value)}</textarea></label>`;
const uploadInput = (label, required = false) => input(label, 'image', `type="file" accept="image/jpeg,image/png,image/webp" ${required ? 'required' : ''}`);
const form = (action, content, label, attrs = '') => `<form data-action="${action}" class="fields" ${attrs}>${content}<p class="error" role="alert" hidden></p><div>${button(label)}</div></form>`;
const table = (columns, rows, message = 'ยังไม่มีรายการ') => rows.length ? `<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty(message);
const demo = [
  {name:'แพลนเนอร์รายสัปดาห์',category:'เทมเพลต',description:'วางแผนตารางสัปดาห์และเช็กรายการงานในหน้าเดียว',price:5900,stock:0},
  {name:'ตารางบันทึกรายรับรายจ่าย',category:'ไฟล์ตาราง',description:'รวมรายรับ รายจ่าย และยอดคงเหลือรายเดือน',price:7900,stock:0},
  {name:'ชุดวอลเปเปอร์มะลิ',category:'วอลเปเปอร์',description:'ชุดภาพพื้นหลังสำหรับมือถือและคอมพิวเตอร์',price:3900,stock:0},
];
let store = { products:[], user:null, ownerSetup:false };
let pageSequence = 0;
let alertTimer;
function message(text) {
  clearTimeout(alertTimer);
  toast.textContent = text;
  toast.hidden = false;
  alertTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}
async function api(path, data) {
  const upload = data instanceof FormData;
  const response = await fetch('/api/' + path, data === undefined ? undefined : {
    method:'POST', body:upload ? data : JSON.stringify(data),
    headers:upload ? {} : {'content-type':'application/json'},
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'ติดต่อระบบไม่ได้ กรุณาลองใหม่');
  return result;
}
async function refresh() {
  store = await api('store');
  const {user, ownerSetup} = store;
  nav.innerHTML = user ? [
    user.role === 'admin' ? link('หลังร้าน','/admin','small outline') : '',
    `<a class="wallet-nav" href="#/wallet">${cash(user.balance)}</a>`,
    button('ออกจากระบบ','small outline','type="button" data-logout'),
  ].join('') : (ownerSetup ? link('ตั้งค่าร้าน','/setup','small outline') : '') + link('เข้าสู่ระบบ','/login','small');
}
function cover(product) {
  return product.image_key ? `<img class="cover" src="${img(product.image_key)}" alt="${escape(product.name)}">`
    : `<div class="tile"><span>${escape(product.category)}</span></div>`;
}
function productCards(products, sample = false) {
  if (!products.length) return empty('ไม่มีสินค้าที่ตรงกับการค้นหา');
  return products.map(p => {
    const body = cover(p) + `<div class="card-body"><span class="muted meta">${escape(p.category)}</span><h3>${escape(p.name)}</h3>
      <div class="row"><span class="price">${cash(p.price)}</span><span class="pill">${sample ? 'ตัวอย่าง' : p.stock ? 'คงเหลือ ' + p.stock : 'สินค้าหมด'}</span></div></div>`;
    return sample ? `<article class="card">${body}</article>` : `<a class="card" href="#/product/${encodeURIComponent(p.id)}">${body}</a>`;
  }).join('');
}
function home() {
  const products = store.products.length ? store.products.slice(0,6) : demo;
  return `<section class="hero"><div class="hero-copy"><h1 class="hero-title">ร้านค้าดิจิทัล<br><span>มะลิมาร์เก็ต</span></h1><p>เลือกสินค้า เติมเงินเข้ากระเป๋า และเปิดดูคำสั่งซื้อของคุณได้ในที่เดียว</p>${link('เลือกดูสินค้า','/shop','light')}</div><div class="hero-image" role="img" aria-label="สมุดและกระเป๋าผ้าในโทนสีเขียว"></div></section>
  <div class="quick"><a href="#/${store.user?'wallet':'signup'}"><span class="quick-icon" aria-hidden="true">✿</span><span><strong>${store.user?'กระเป๋าเงิน':'สมัครสมาชิก'}</strong><small>${store.user?'ดูยอดเงินและรายการล่าสุด':'สร้างบัญชีเพื่อเริ่มสั่งซื้อ'}</small></span></a>
  <a href="#/wallet"><span class="quick-icon" aria-hidden="true">฿</span><span><strong>เติมเงิน</strong><small>โอนเงินและส่งสลิป</small></span></a>
  <a href="#/orders"><span class="quick-icon" aria-hidden="true">✓</span><span><strong>คำสั่งซื้อ</strong><small>ดูสถานะและสินค้าที่ได้รับ</small></span></a></div>
  <div class="section-head"><div><h2>${store.products.length?'สินค้าแนะนำ':'ตัวอย่างสินค้า'}</h2><p>${store.products.length?'เลือกดูสินค้าที่พร้อมสั่งซื้อ':'รายการจริงจะแสดงเมื่อร้านเพิ่มสินค้า'}</p></div>${link('สินค้าทั้งหมด','/shop','outline small')}</div>
  <div class="grid">${productCards(products,!store.products.length)}</div>`;
}
function shop() {
  const names = [...new Set(store.products.map(p => p.category))].sort((a,b)=>a.localeCompare(b,'th'));
  return title('สินค้าทั้งหมด','ค้นหาสินค้าหรือเลือกหมวดหมู่') +
    `<div class="filters"><input type="search" id="search-product" placeholder="ค้นหาสินค้า" aria-label="ค้นหาสินค้า"><select id="category" aria-label="หมวดหมู่"><option value="">ทุกหมวดหมู่</option>${names.map(c=>`<option>${escape(c)}</option>`).join('')}</select></div>
    <div class="grid" id="catalog">${store.products.length ? productCards(store.products) : empty('ร้านกำลังจัดเตรียมสินค้า')}</div>`;
}
function product(id) {
  const p = store.products.find(item => item.id===id);
  if (!p) return title('ไม่พบสินค้า') + link('กลับหน้าสินค้า','/shop','outline');
  const orderForm = p.stock ? store.user ? form('buy',
    input('จำนวน','quantity',`type="number" min="1" max="${Math.min(99,p.stock)}" value="1" required`) +
    `<p>ยอดรวม <strong id="order-total">${cash(p.price)}</strong></p><p class="muted">ยอดเงินในกระเป๋า ${cash(store.user.balance)}</p>`,
    'ยืนยันสั่งซื้อ', `data-id="${escape(p.id)}" data-price="${p.price}"`) : link('เข้าสู่ระบบเพื่อซื้อ','/login') : note('สินค้าหมด');
  return `<p class="muted"><a href="#/shop">สินค้าทั้งหมด</a> / ${escape(p.category)}</p>` + title(escape(p.name)) +
    `<section class="split"><div class="card">${cover(p)}</div><div class="panel"><div class="row"><span class="price">${cash(p.price)}</span><span class="pill">เหลือ ${p.stock} ชิ้น</span></div>
    <p class="delivery">${escape(p.description)}</p>${orderForm}</div></section>`;
}
function auth(signup) {
  const name = signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  return `<div class="narrow">${title(name)}<section class="panel">${form(signup?'signup':'login',
    (signup ? input('ชื่อที่ใช้แสดง','display_name','required maxlength="80" autocomplete="name"') : '') +
    input('ชื่อผู้ใช้','username','required minlength="3" maxlength="32" autocomplete="username"') +
    (signup ? input('อีเมล','email','type="email" required maxlength="254" autocomplete="email"'):'') +
    input(signup?'รหัสผ่าน (อย่างน้อย 12 ตัวอักษร)':'รหัสผ่าน','password',`type="password" required maxlength="128" ${signup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"'}`),
    name)}<p><a href="#/${signup?'login':'signup'}">${signup?'มีบัญชีแล้ว · เข้าสู่ระบบ':'ยังไม่มีบัญชี · สมัครสมาชิก'}</a></p></section></div>`;
}
function setup() {
  return `<div class="narrow">${title('ตั้งค่าบัญชีเจ้าของร้าน')}<section class="panel">${store.ownerSetup ?
    form('setup',note('ระบบจะสร้างชื่อผู้ใช้ admin และแสดงรหัสผ่านที่สุ่มให้ครั้งเดียว'), 'สร้างบัญชีแอดมิน')
    : note('บัญชีเจ้าของร้านได้รับการตั้งค่าแล้วหรือเซสชันนี้ไม่มีสิทธิ์')}</section></div>`;
}
function gate(path) {
  return `<div class="narrow">${title(path)}<div class="panel"><p>เข้าสู่ระบบเพื่อเปิดหน้านี้</p><div>${link('เข้าสู่ระบบ','/login')} ${link('สมัครสมาชิก','/signup','outline')}</div></div></div>`;
}
function wallet(d) {
  const {settings:s, topups, ledger} = d;
  const upload = s.account ? `<dl><dt>ธนาคาร</dt><dd>${escape(s.bank)}</dd><dt>เลขบัญชี</dt><dd class="mono">${escape(s.account)}</dd><dt>ชื่อบัญชี</dt><dd>${escape(s.holder)}</dd></dl>
    ${note(d.auto?'ระบบจะตรวจสอบสลิปและเติมเงินเมื่อยืนยันรายการโอนสำเร็จ':'แอดมินจะตรวจสอบสลิปก่อนเติมเงิน')}
    ${form('topup', uploadInput('สลิปการโอนเงิน (JPG, PNG หรือ WebP ไม่เกิน 4 MB)',true),'ส่งสลิป')}` : note('ร้านค้ายังไม่เปิดรับการเติมเงิน');
  return title('กระเป๋าเงิน') + `<div class="split"><section class="panel balance"><h2>ยอดเงินคงเหลือ</h2><p class="price">${cash(d.user.balance)}</p></section>
    <section class="panel"><h2>เติมเงินผ่านธนาคาร</h2>${upload}</section></div>
    <div class="stack"><section class="panel"><h2>รายการเติมเงิน</h2>${table(['วันที่','สถานะ','จำนวน','หมายเหตุ'],topups.map(t=>[date(t.created_at),badge(t.status),t.amount?cash(t.amount):'—',escape(t.note)]))}</section>
    <section class="panel"><h2>ประวัติยอดเงิน</h2>${table(['วันที่','รายการ','เปลี่ยนแปลง','คงเหลือ'],ledger.map(l=>[date(l.created_at),badge(l.kind)+' '+escape(l.reason),cash(l.delta),cash(l.balance_after)]))}</section></div>`;
}
function orders(d) {
  return title('คำสั่งซื้อ','แสดงรายการล่าสุดของบัญชีนี้') + `<div class="stack">${d.orders.length ? d.orders.map(o=>
    `<article class="panel"><div class="row"><h2>${escape(o.product_name)}</h2>${badge(o.status)}</div><p>${o.quantity} ชิ้น · ${cash(o.total)} · ${date(o.created_at)}</p>
    <p class="muted mono">${escape(o.id)}</p>${o.delivery?`<div class="notice delivery">${escape(o.delivery)}</div>`:''}</article>`).join('') : empty('ยังไม่มีคำสั่งซื้อ')}</div>`;
}
function adminPanel(section, data, target) {
  const tabs = [['products','สินค้า'],['users','สมาชิก'],['orders','คำสั่งซื้อ'],['topups','ตรวจสลิป'],['ledger','ประวัติยอดเงิน'],['settings','บัญชีรับเงิน']];
  let content;
  if (section==='products') {
    const p = data.products.find(x=>x.id===target);
    content = `<div class="split"><section class="panel"><div class="row"><h2>รายการสินค้า</h2>${p?link('เพิ่มสินค้าใหม่','/admin/products','outline small'):''}</div>
      ${table(['สินค้า','ราคา','สต็อก','เผยแพร่',''],data.products.map(x=>[escape(x.name),cash(x.price),x.stock,x.active?'แสดง':'ซ่อน',link('แก้ไข','/admin/products/'+encodeURIComponent(x.id),'outline small')]))}</section>
      <section class="panel"><h2>${p?'แก้ไขสินค้า':'เพิ่มสินค้า'}</h2>
      ${form('product',typed('ชื่อสินค้า','name',p?.name,true)+typed('หมวดหมู่','category',p?.category,true)+
        priceInput('ราคา (บาท)','price',p ? p.price/100 : '')+input('จำนวนคงเหลือ','stock',`type="number" min="0" max="1000000" step="1" required value="${p?.stock ?? 0}"`)+
        area('รายละเอียดสินค้า','description',p?.description)+area('ข้อความหรือ URL สำหรับลูกค้าหลังซื้อ','delivery',p?.delivery)+
        uploadInput(p?.image_key?'เลือกรูปใหม่':'รูปสินค้า (ไม่เกิน 4 MB)')+(p?.image_key?`<img class="cover" src="${img(p.image_key)}" alt=""><label class="check"><input type="checkbox" name="remove_image">ลบรูปเดิม</label>`:'')+
        `<label class="check"><input type="checkbox" name="active" ${p?.active===0?'':'checked'}>แสดงในหน้าร้าน</label>`,
        'บันทึกสินค้า', `data-id="${escape(p?.id)}" data-image="${escape(p?.image_key)}" data-revision="${p?.revision ?? 0}"`)}
      </section></div>`;
  } else if (section==='users') {
    content = `<section class="panel"><h2>สมาชิกและยอดคงเหลือ</h2>
      ${table(['ชื่อผู้ใช้','อีเมล','ยอดคงเหลือ',''],data.users.map(u=>[escape(u.username),escape(u.email),cash(u.balance),link('ปรับยอด','/admin/users/'+encodeURIComponent(u.id),'outline small')]))}
      </section>`;
    const u=data.users.find(x=>x.id===target);
    if(u) content+=`<section class="panel"><h2>ปรับยอดของ ${escape(u.username)}</h2><p>ยอดปัจจุบัน ${cash(u.balance)}</p>
      ${form('adjust',`<label>ประเภท<select name="direction"><option value="1">เพิ่มยอดเงิน</option><option value="-1">ลดยอดเงิน</option></select></label>`+priceInput('จำนวนเงิน (บาท)','amount')+
      input('เหตุผล','reason','required maxlength="250"'),'บันทึกการปรับยอด',`data-id="${escape(u.id)}"`)}</section>`;
  } else if (section==='orders') {
    content = `<section class="panel"><h2>คำสั่งซื้อล่าสุด</h2>${table(['วันที่','เลขคำสั่งซื้อ','ผู้ซื้อ','สินค้า','จำนวน','ยอด','สถานะ',''],
      data.orders.map(o=>[date(o.created_at),`<span class="mono">${escape(o.id)}</span>`,escape(o.username),escape(o.product_name),o.quantity,cash(o.total),badge(o.status),o.status==='confirmed'?link('ส่งมอบ','/admin/orders/'+encodeURIComponent(o.id),'outline small'):'']))}</section>`;
    const order=data.orders.find(x=>x.id===target&&x.status==='confirmed');
    if(order) content+=`<section class="panel"><h2>ส่งมอบ ${escape(order.product_name)}</h2>
      ${form('fulfill',`<label>ข้อความหรือ URL สำหรับลูกค้า<textarea name="delivery" required maxlength="3000"></textarea></label>`,'บันทึกการส่งมอบ',`data-id="${escape(order.id)}"`)}</section>`;
  } else if (section==='topups') {
    const t=data.topups.find(x=>x.id===target);
    content = `<section class="panel"><h2>รายการสลิป</h2>${note(data.auto?'เปิดใช้ตัวเชื่อมต่อตรวจสลิปอัตโนมัติ':'สลิปที่ส่งเข้ามาจะรอแอดมินตรวจ')}
      ${table(['วันที่','ผู้ใช้','สถานะ','ยอด',''],data.topups.map(x=>[date(x.created_at),escape(x.username),badge(x.status),x.amount?cash(x.amount):'—',link('ดูสลิป','/admin/topups/'+encodeURIComponent(x.id),'outline small')]))}</section>`;
    if(t) content+=`<section class="panel"><h2>สลิปของ ${escape(t.username)}</h2><img class="slip" src="/api/admin/slips/${encodeURIComponent(t.id)}" alt="สลิปที่ลูกค้าอัปโหลด">
      ${badge(t.status)}${t.status==='pending'?`<div class="split">
      ${form('approve',priceInput('จำนวนเงินที่โอน (บาท)','amount')+input('เลขอ้างอิงธุรกรรม','reference','required maxlength="128"')+input('บันทึกผลตรวจ','note','required maxlength="250"'),'อนุมัติและเพิ่มยอด',`data-id="${escape(t.id)}"`)}
      ${form('reject',input('เหตุผลที่ไม่ผ่าน','note','required maxlength="250"'),'ปฏิเสธสลิป',`data-id="${escape(t.id)}"`)}
      </div>`:`<p>${escape(t.reference)} ${escape(t.note)}</p>`}</section>`;
  } else if (section==='ledger') {
    content = `<section class="panel"><h2>ประวัติการเปลี่ยนยอดเงิน</h2>${table(['วันที่','สมาชิก','ประเภท','จำนวน','คงเหลือ','ผู้ดำเนินการ','เหตุผล'],
      data.ledger.map(l=>[date(l.created_at),escape(l.username),badge(l.kind),cash(l.delta),cash(l.balance_after),escape(l.actor??'ระบบ'),escape(l.reason)]))}</section>`;
  } else {
    const s=data.settings;
    content = `<section class="panel narrow"><h2>บัญชีรับเงินผ่านธนาคาร</h2>
      ${form('bank',typed('ธนาคาร','bank',s.bank)+typed('เลขบัญชี','account',s.account)+typed('ชื่อบัญชี','holder',s.holder),'บันทึกบัญชีรับเงิน')}
      <p class="muted">เว้นว่างทุกช่องเพื่อปิดรับเติมเงิน</p></section>`;
  }
  return title('จัดการร้าน') + `<div class="stack"><nav class="admin-nav" aria-label="เมนูหลังร้าน">${tabs.map(([k,v])=>link(v,'/admin/'+k,k===section?'small':'outline small')).join('')}</nav>${content}</div>`;
}
async function render(focus = false) {
  const active = ++pageSequence;
  const [page, section, target] = (location.hash.slice(2) || '').split('/');
  let view;
  try {
    if (page==='shop') view=shop();
    else if (page==='product') view=product(section);
    else if (page==='login'||page==='signup') view=auth(page==='signup');
    else if (page==='setup') view=setup();
    else if (page==='wallet'||page==='orders') {
      if (!store.user) view=gate(page==='wallet'?'กระเป๋าเงิน':'คำสั่งซื้อ');
      else { const data=await api('account'); view=page==='wallet'?wallet(data):orders(data); }
    } else if (page==='admin') {
      if (!store.user) view=gate('จัดการร้าน');
      else if(store.user.role!=='admin') view=title('บัญชีนี้ไม่มีสิทธิ์จัดการร้าน');
      else view=adminPanel(section||'products',await api('admin/data'),target);
    } else if (page==='help') view=title('วิธีสั่งซื้อ')+`<section class="panel narrow">
      <details open><summary>เริ่มสั่งซื้ออย่างไร</summary><p>สมัครสมาชิก เข้าสู่ระบบ เติมเงิน และระบุจำนวนในหน้ารายละเอียดสินค้า</p></details>
      <details><summary>ดูไฟล์หรือข้อความหลังซื้อได้ที่ไหน</summary><p>เปิดเมนูคำสั่งซื้อเพื่อดูสถานะ รายการ และข้อมูลส่งมอบจากร้าน</p></details>
      <details><summary>ดูผลตรวจสลิปได้ที่ไหน</summary><p>เปิดเมนูเติมเงิน รายการที่อนุมัติแล้วจะแสดงในประวัติยอดเงิน</p></details></section>`;
    else view=home();
  } catch(error) { view=empty(escape(error.message)); }
  if (active!==pageSequence) return;
  main.innerHTML=view;
  if (focus) { main.focus({preventScroll:true}); window.scrollTo(0,0); }
}
function go(path) {
  if (location.hash === '#'+path) return render();
  location.hash=path;
}
function filterCatalog() {
  const search=document.querySelector('#search-product');
  const category=document.querySelector('#category');
  const output=document.querySelector('#catalog');
  if (!search||!output) return;
  const needle=search.value.trim().toLocaleLowerCase();
  const result=store.products.filter(p=>(!category.value||p.category===category.value)&&
    [p.name,p.category,p.description].some(s=>s.toLocaleLowerCase().includes(needle)));
  output.innerHTML=productCards(result);
}
document.addEventListener('input', event=>{
  if(['search-product','category'].includes(event.target.id)) filterCatalog();
  if(event.target.name==='quantity') {
    const total=document.querySelector('#order-total');
    if(total) total.textContent=cash(Number(event.target.value)*Number(event.target.form.dataset.price));
  }
});
document.addEventListener('click',async event=>{
  const logout=event.target.closest('[data-logout]');
  if(!logout) return;
  logout.disabled=true;
  try { await api('logout',{}); await refresh(); await go('/'); }
  catch(error) { message(error.message); }
  finally { logout.disabled=false; }
});
function amount(value) { return Math.round(Number(value)*100); }
document.addEventListener('submit',async event=>{
  const el=event.target;
  const action=el.dataset.action;
  if(!action) return;
  event.preventDefault();
  const errorEl=el.querySelector('.error');
  const submit=el.querySelector('button');
  if(submit.disabled) return;
  errorEl.hidden=true;
  submit.disabled=true;
  const fields=new FormData(el);
  const values=Object.fromEntries(fields);
  const key=()=> el.dataset.key ||= crypto.randomUUID();
  try {
    if(action==='setup'){
      const credentials=await api('setup',{});
      await refresh();
      main.innerHTML=`<div class="narrow">${title('สร้างบัญชีแอดมินแล้ว')}<section class="panel">
        <p>ชื่อผู้ใช้ <strong class="mono">${escape(credentials.username)}</strong></p>
        <label>รหัสผ่านครั้งแรก<input readonly class="mono" value="${escape(credentials.password)}" aria-label="รหัสผ่านแอดมิน"></label>
        ${note('บันทึกรหัสผ่านนี้ในตัวจัดการรหัสผ่านก่อนออกจากหน้านี้')}${link('ไปที่หลังร้าน','/admin')}</section></div>`;
      return;
    }
    if(action==='login'||action==='signup'){await api(action,values); await refresh(); await go(store.user?.role==='admin'?'/admin':'/shop'); return;}
    if(action==='buy'){
      const quantity=Number(values.quantity), price=Number(el.dataset.price);
      if(!window.confirm('ยืนยันซื้อ '+quantity+' ชิ้น รวม '+cash(quantity*price)+' จากกระเป๋าเงิน?')) return;
      await api('orders',{product:el.dataset.id,quantity,price,key:key()}); await refresh(); await go('/orders'); message('บันทึกคำสั่งซื้อแล้ว'); return;
    }
    if(action==='topup'){
      const t=await api('topups',fields); message('ส่งสลิปแล้ว · '+labels[t.status]);
    }
    if(action==='product') {
      let image=values.remove_image ? null : el.dataset.image || null;
      if(values.image?.size){
        const body=new FormData(); body.set('image',values.image);
        image=(await api('admin/images',body)).key;
      }
      await api('admin/products',{...values,id:el.dataset.id,image_key:image,image:undefined,price:amount(values.price),stock:Number(values.stock),revision:Number(el.dataset.revision),active:values.active==='on'});
      message('บันทึกสินค้าแล้ว');
      await refresh();
      if (el.dataset.id) { await go('/admin/products'); return; }
    }
    if(action==='adjust') {
      if(!window.confirm('ยืนยันปรับยอดเงิน '+cash(amount(values.amount)*Number(values.direction))+' ?')) return;
      await api('admin/adjust',{user:el.dataset.id,key:key(),delta:amount(values.amount)*Number(values.direction),reason:values.reason});
      message('บันทึกการปรับยอดแล้ว');
    }
    if(action==='approve'||action==='reject'){
      if(!window.confirm(action==='approve'?'ยืนยันอนุมัติสลิปและเพิ่มยอดเงิน?':'ยืนยันปฏิเสธสลิปนี้?')) return;
      await api('admin/review',{id:el.dataset.id,status:action==='approve'?'approved':'rejected',note:values.note,reference:values.reference,amount:amount(values.amount)});
      message('บันทึกผลตรวจแล้ว');
    }
    if(action==='fulfill'){await api('admin/fulfill',{id:el.dataset.id,delivery:values.delivery}); message('บันทึกการส่งมอบแล้ว'); await go('/admin/orders'); return;}
    if(action==='bank'){await api('admin/settings',values); message('บันทึกบัญชีรับเงินแล้ว');}
    await refresh();
    await render();
  } catch(error) {
    errorEl.textContent=error.message;
    errorEl.hidden=false;
  } finally { submit.disabled=false; }
});
window.addEventListener('hashchange',()=>render(true));
try { await refresh(); await render(); }
catch(error) { main.innerHTML=empty(escape(error.message)); }
