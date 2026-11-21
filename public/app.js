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
const form = (action, content, label, attrs = '') => `<form data-action="${action}" class="fields" ${attrs}>${content}<p class="error" role="alert" hidden></p><div>${button(label,'','type="submit"')}</div></form>`;
const table = (columns, rows, message = 'ยังไม่มีรายการ') => rows.length ? `<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty(message);
const coverNames = {
  Netflix:'netflix', iQIYI:'iqiyi', WeTV:'wetv', Viu:'viu', 'Prime Video':'prime-video',
  Gmail:'gmail', Monomax:'monomax', 'Disney+':'disney', TrueID:'trueid', 'Ch3+':'ch3',
  YouTube:'youtube', Bilibili:'bilibili',
};
let store = { products:[], groups:[], user:null, ownerSetup:false };
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
  const category = product.cover_category || product.category || product.name;
  const file = Object.hasOwn(coverNames, category) ? coverNames[category] : null;
  const url = product.image_key ? img(product.image_key) : file && '/covers/' + file + '.webp';
  return url ? `<img class="cover" src="${url}" alt="${escape(category)}">`
    : `<div class="tile"><span>${escape(category)}</span></div>`;
}
const variantsFor = (products, id) => products.filter(p => p.group_id === id);
const packageInfo = p => [p.days ? p.days + ' วัน' : '', p.shares ? 'หาร ' + p.shares : ''].filter(Boolean).join(' · ');
const appPath = group => '/app/' + encodeURIComponent(group.id);
function groupCards(groups) {
  if (!groups.length) return empty('ไม่พบแอปที่ตรงกับการค้นหา');
  return groups.map(group => {
    const packages = variantsFor(store.products, group.id);
    const price = Math.min(...packages.map(p => p.price));
    return `<a class="card" href="#${appPath(group)}">${cover(group)}
      <div class="card-body"><h3>${escape(group.name)}</h3><div class="row">
      <span class="price">เริ่ม ${cash(price)}</span><span class="pill">${packages.length} แพ็กเกจ</span></div></div></a>`;
  }).join('');
}
function appPage(id, filter) {
  const group = store.groups.find(item => item.id === id);
  if (!group) return title('ไม่พบแอป') + link('กลับหน้าสินค้าทั้งหมด','/shop','outline');
  const packages = variantsFor(store.products, id).sort((a,b) => (a.days ?? 9999) - (b.days ?? 9999) || a.price - b.price);
  const days = [...new Set(packages.map(p=>p.days).filter(Boolean))];
  const visible = filter ? packages.filter(p => p.days === Number(filter)) : packages;
  return `<p class="muted"><a href="#/shop">สินค้าทั้งหมด</a> / ${escape(group.name)}</p>` +
    title(escape(group.name), escape(group.description || 'เลือกแพ็กเกจเพื่อดูรายละเอียดและระบุจำนวน')) +
    (days.length ? `<nav class="admin-nav package-filters" aria-label="ระยะเวลาแพ็กเกจ">${link('ทั้งหมด',appPath(group),filter?'outline small':'small')}
      ${days.map(day=>link(day+' วัน',appPath(group)+'/'+day,Number(filter)===day?'small':'outline small')).join('')}</nav>` : '') +
    `<div class="grid">${productCards(visible)}</div>`;
}
function productCover(p) {
  const group = store.groups.find(g => g.id === p.group_id);
  return cover({...p, cover_category:group?.cover_category, image_key:p.image_key || group?.image_key});
}
function productCards(products) {
  if (!products.length) return empty('ไม่มีแพ็กเกจในระยะเวลานี้');
  return products.map(p => `<a class="card" href="#/product/${encodeURIComponent(p.id)}">${productCover(p)}
    <div class="card-body"><h3>${escape(p.name)}</h3>${packageInfo(p)?`<span class="meta muted">${packageInfo(p)}</span>`:''}
    <div class="row"><span class="price">${cash(p.price)}</span><span class="pill">${p.stock ? 'คงเหลือ ' + p.stock : 'สินค้าหมด'}</span></div></div></a>`).join('');
}
function home() {
  const groups = store.groups.slice(0,6);
  return `<section class="hero"><div class="hero-copy"><h1 class="hero-title">รหัสดิจิทัล<br><span>Khay Thuk</span></h1><p>เลือกแพ็กเกจ เติมเงิน และเปิดดูรหัสของคุณได้ทันทีหลังสั่งซื้อ</p>${link('เลือกดูสินค้า','/shop','light')}</div><div class="hero-image" role="img" aria-label="รีโมตและหูฟังกับจอทีวีสีน้ำเงิน"></div></section>
  <div class="quick"><a href="#/${store.user?'wallet':'signup'}"><span class="quick-icon" aria-hidden="true">+</span><span><strong>${store.user?'กระเป๋าเงิน':'สมัครสมาชิก'}</strong><small>${store.user?'ดูยอดเงินและรายการล่าสุด':'สร้างบัญชีเพื่อเริ่มสั่งซื้อ'}</small></span></a>
  <a href="#/wallet"><span class="quick-icon" aria-hidden="true">฿</span><span><strong>เติมเงิน</strong><small>โอนเงินและส่งสลิป</small></span></a>
  <a href="#/orders"><span class="quick-icon" aria-hidden="true">✓</span><span><strong>คำสั่งซื้อ</strong><small>ดูสถานะและสินค้าที่ได้รับ</small></span></a></div>
  <div class="section-head"><div><h2>สินค้าแนะนำ</h2><p>เลือกดูแพ็กเกจจากแอปที่คุณใช้</p></div>${link('สินค้าทั้งหมด','/shop','outline small')}</div>
  <div class="grid">${groupCards(groups)}</div>`;
}
function shop() {
  return title('สินค้าทั้งหมด','เลือกแอปเพื่อดูแพ็กเกจที่มี') +
    `<div class="filters"><input type="search" id="search-product" placeholder="ค้นหาแอปหรือแพ็กเกจ" aria-label="ค้นหาแอปหรือแพ็กเกจ"></div>
    <div class="grid" id="catalog">${groupCards(store.groups)}</div>`;
}
function product(id) {
  const p = store.products.find(item => item.id===id);
  if (!p) return title('ไม่พบสินค้า') + link('กลับหน้าสินค้า','/shop','outline');
  const group = store.groups.find(g => g.id === p.group_id);
  const orderForm = p.stock ? store.user ? form('buy',
    input('จำนวน','quantity',`type="number" min="1" max="${Math.min(99,p.stock)}" value="1" required`) +
    `<p>ยอดรวม <strong id="order-total">${cash(p.price)}</strong></p><p class="muted">ยอดเงินในกระเป๋า ${cash(store.user.balance)}</p>`,
    'ยืนยันสั่งซื้อ', `data-id="${escape(p.id)}" data-price="${p.price}"`) : link('เข้าสู่ระบบเพื่อซื้อ','/login/'+encodeURIComponent(p.id)) : note('สินค้าหมด');
  return `<p class="muted"><a href="#/shop">สินค้าทั้งหมด</a> / ${group ? `<a href="#${appPath(group)}">${escape(group.name)}</a>` : escape(p.category)}</p>` + title(escape(p.name), packageInfo(p)) +
    `<section class="split"><div class="card">${productCover(p)}</div><div class="panel"><div class="row"><span class="price">${cash(p.price)}</span><span class="pill">เหลือ ${p.stock} ชิ้น</span></div>
    <p class="delivery">${escape(p.description)}</p>${orderForm}</div></section>`;
}
function auth(signup, productId) {
  const name = signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ';
  return `<div class="narrow">${title(name)}<section class="panel">${form(signup?'signup':'login',
    (signup ? input('ชื่อที่ใช้แสดง','display_name','required maxlength="80" autocomplete="name"') : '') +
    input('ชื่อผู้ใช้','username','required minlength="3" maxlength="32" autocomplete="username"') +
    (signup ? input('อีเมล','email','type="email" required maxlength="254" autocomplete="email"'):'') +
    input(signup?'รหัสผ่าน (อย่างน้อย 12 ตัวอักษร)':'รหัสผ่าน','password',`type="password" required maxlength="128" ${signup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"'}`),
    name, `data-product="${escape(productId)}"`)}<p><a href="#/${signup?'login':'signup'}${productId?'/'+encodeURIComponent(productId):''}">${signup?'มีบัญชีแล้ว · เข้าสู่ระบบ':'ยังไม่มีบัญชี · สมัครสมาชิก'}</a></p></section></div>`;
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
function deliveredContent(order) {
  const codes = JSON.parse(order.codes || '[]');
  if (codes.length) return `<div class="notice"><strong>รหัสสินค้า</strong><ol class="order-codes">${codes.map(code =>
    `<li><code class="mono">${escape(code)}</code></li>`).join('')}</ol></div>`;
  return order.delivery ? `<div class="notice delivery">${escape(order.delivery)}</div>` : '';
}
function orders(d) {
  return title('คำสั่งซื้อ','แสดงรายการล่าสุดของบัญชีนี้') + `<div class="stack">${d.orders.length ? d.orders.map(o=>
    `<article class="panel"><div class="row"><h2>${escape(o.product_name)}</h2>${badge(o.status)}</div><p>${o.quantity} ชิ้น · ${cash(o.total)} · ${date(o.created_at)}</p>
    <p class="muted mono">${escape(o.id)}</p>${deliveredContent(o)}</article>`).join('') : empty('ยังไม่มีคำสั่งซื้อ')}</div>`;
}
function imageFields(p, label) {
  return uploadInput(label) + (p?.image_key ? `<img class="cover" src="${img(p.image_key)}" alt="">
    <label class="check"><input type="checkbox" name="remove_image">ใช้ภาพปกของแอปหรือภาพเริ่มต้น</label>` : '');
}
function variantFields(p) {
  const numeric = (label, name, max, value) => input(label,name,
    `type="number" min="1" max="${max}" step="1" value="${value ?? ''}"`);
  return typed('ชื่อแพ็กเกจ','name',p?.name,true) +
    `<div class="variant-fields">${numeric('จำนวนวัน','days',3650,p?.days)}
      ${numeric('จำนวนคนที่หาร','shares',100,p?.shares)}
      ${priceInput('ราคา (บาท)','price',p ? p.price/100 : '')}</div>` +
    `<label class="check"><input type="checkbox" name="active" ${p?.active===0?'':'checked'}>แสดงในหน้าร้าน</label>`;
}
function draftVariant() {
  return `<fieldset class="variant-draft fields" data-variant><legend>แพ็กเกจใหม่</legend>${variantFields()}
    <div>${button('ลบตัวเลือกนี้','small outline','type="button" data-remove-variant')}</div></fieldset>`;
}
function groupEditor(group, data) {
  const packages = group ? variantsFor(data.products, group.id) : [];
  const listing = group ? `<section class="panel"><h2>แพ็กเกจของ ${escape(group.name)}</h2>
    ${table(['ชื่อแพ็กเกจ','ระยะเวลา / หาร','ราคา','สต็อก',''],packages.map(p=>[escape(p.name),packageInfo(p)||'—',
      cash(p.price),p.stock,link('แก้ไขแพ็กเกจ','/admin/products/'+encodeURIComponent(p.id),'outline small')]))}</section>` : '';
  const editor = form('group',
    input('ชื่อแอป','group_name',`required maxlength="60" value="${escape(group?.name)}"`) +
    area('รายละเอียดแอป','description',group?.description) + imageFields(group,'ภาพปกแอป (ไม่เกิน 4 MB)') +
    `<div class="inventory"><h3>เพิ่มตัวเลือกแพ็กเกจ</h3><div class="stack" data-variant-list>${group?'':draftVariant()}</div>
      <div>${button('เพิ่มตัวเลือก','small outline','type="button" data-add-variant')}</div></div>`,
    group?'บันทึกแอปและตัวเลือก':'สร้างแอปและตัวเลือก',
    `data-id="${escape(group?.id)}" data-image="${escape(group?.image_key)}"`);
  return `<section class="panel"><h2>${group?'แก้ไขแอป':'เพิ่มรายการสินค้า'}</h2>${editor}</section>${listing}`;
}
function variantEditor(p) {
    const inventory = `<section class="inventory"><div class="row"><h2>รหัสสินค้าหลังสั่งซื้อ</h2><span class="pill">คงเหลือ ${p.stock} ชิ้น</span></div>
      <p class="muted">วางหนึ่งรหัสต่อหนึ่งบรรทัด ระบบจะส่งรหัสตามลำดับที่เพิ่มเข้า และนำรหัสที่ส่งแล้วออกจากสต็อก</p>
      ${form('inventory', `<label>เพิ่มรหัสสินค้า<textarea name="codes" required maxlength="50099" spellcheck="false" autocomplete="off" rows="6"></textarea>
      <small>เพิ่มได้สูงสุด 100 บรรทัดต่อครั้ง</small></label>`, 'เพิ่มรหัสเข้าสต็อก', `data-id="${escape(p.id)}"`)}</section>`;
  return `<section class="panel"><div class="row"><h2>แก้ไขแพ็กเกจ</h2>
    ${link('กลับไปที่ '+escape(p.category),'/admin/products/app/'+encodeURIComponent(p.group_id),'small outline')}</div>
    ${form('product',variantFields(p)+area('รายละเอียดแพ็กเกจ','description',p.description)+imageFields(p,'รูปแพ็กเกจ (ไม่เกิน 4 MB)'),
      'บันทึกแพ็กเกจ', `data-id="${escape(p.id)}" data-group="${escape(p.group_id)}" data-image="${escape(p.image_key)}" data-revision="${p.revision}"`)}
    ${inventory}</section>`;
}
function adminPanel(section, data, target, appId) {
  const tabs = [['products','สินค้า'],['users','สมาชิก'],['orders','คำสั่งซื้อ'],['topups','ตรวจสลิป'],['ledger','ประวัติยอดเงิน'],['settings','บัญชีรับเงิน']];
  let content;
  if (section==='products') {
    const product = data.products.find(p=>p.id===target);
    const group = data.groups.find(g=>g.id===appId);
    content = `<div class="split admin-products"><section class="panel"><div class="row"><h2>แอปทั้งหมด</h2>
      ${link('เพิ่มรายการสินค้า','/admin/products','outline small')}</div>
      ${table(['แอป','แพ็กเกจ',''],data.groups.map(g=>[escape(g.name),variantsFor(data.products,g.id).length,
        link('จัดการตัวเลือก','/admin/products/app/'+encodeURIComponent(g.id),'outline small')]))}</section>
      <div class="stack">${product ? variantEditor(product) : groupEditor(group,data)}</div></div>`;
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
  const [page, section, target, appId] = (location.hash.slice(2) || '').split('/');
  let view;
  try {
    if (page==='shop') view=shop();
    else if (page==='app') view=appPage(section,target);
    else if (page==='product') view=product(section);
    else if (page==='login'||page==='signup') view=auth(page==='signup',section);
    else if (page==='setup') view=setup();
    else if (page==='wallet'||page==='orders') {
      if (!store.user) view=gate(page==='wallet'?'กระเป๋าเงิน':'คำสั่งซื้อ');
      else { const data=await api('account'); view=page==='wallet'?wallet(data):orders(data); }
    } else if (page==='admin') {
      if (!store.user) view=gate('จัดการร้าน');
      else if(store.user.role!=='admin') view=title('บัญชีนี้ไม่มีสิทธิ์จัดการร้าน');
      else view=adminPanel(section||'products',await api('admin/data'),target,appId);
    } else if (page==='help') view=title('วิธีสั่งซื้อ')+`<section class="panel narrow">
      <details open><summary>เริ่มสั่งซื้ออย่างไร</summary><p>สมัครสมาชิก เข้าสู่ระบบ เติมเงิน และระบุจำนวนในหน้ารายละเอียดสินค้า</p></details>
      <details><summary>ดูรหัสสินค้าหลังซื้อได้ที่ไหน</summary><p>เปิดเมนูคำสั่งซื้อเพื่อดูรหัสของรายการที่ชำระเงินแล้ว</p></details>
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
  const output=document.querySelector('#catalog');
  if (!search||!output) return;
  const needle=search.value.trim().toLocaleLowerCase();
  const matches = value => value.toLocaleLowerCase().includes(needle);
  output.innerHTML=groupCards(store.groups.filter(group => matches(group.name) ||
    variantsFor(store.products, group.id).some(p => matches(p.name) || matches(packageInfo(p)))));
}
document.addEventListener('input', event=>{
  if(event.target.id==='search-product') filterCatalog();
  if(event.target.name==='quantity') {
    const total=document.querySelector('#order-total');
    if(total) total.textContent=cash(Number(event.target.value)*Number(event.target.form.dataset.price));
  }
});
document.addEventListener('click',async event=>{
  const add = event.target.closest('[data-add-variant]');
  if (add) {
    const list = add.form.querySelector('[data-variant-list]');
    if (list.children.length >= 50) { message('เพิ่มได้สูงสุด 50 ตัวเลือกต่อครั้ง'); return; }
    list.insertAdjacentHTML('beforeend',draftVariant());
    list.lastElementChild.querySelector('input').focus();
    return;
  }
  const remove = event.target.closest('[data-remove-variant]');
  if (remove) {
    const addButton = remove.form.querySelector('[data-add-variant]');
    remove.closest('[data-variant]').remove();
    addButton.focus();
    return;
  }
  const logout=event.target.closest('[data-logout]');
  if(!logout) return;
  logout.disabled=true;
  try { await api('logout',{}); await refresh(); await go('/'); }
  catch(error) { message(error.message); }
  finally { logout.disabled=false; }
});
function amount(value) { return Math.round(Number(value)*100); }
function readVariant(values) {
  return {name:values.name, days:values.days ? Number(values.days) : null,
    shares:values.shares ? Number(values.shares) : null, price:amount(values.price), active:values.active==='on'};
}
document.addEventListener('submit',async event=>{
  const el=event.target;
  const action=el.dataset.action;
  if(!action) return;
  event.preventDefault();
  const errorEl=el.querySelector('.error');
  const submit=el.querySelector('button[type=submit]');
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
    if(action==='login'||action==='signup'){await api(action,values); await refresh(); await go(el.dataset.product ? '/product/'+encodeURIComponent(el.dataset.product) : store.user?.role==='admin'?'/admin':'/shop'); return;}
    if(action==='buy'){
      const quantity=Number(values.quantity), price=Number(el.dataset.price);
      if(!window.confirm('ยืนยันซื้อ '+quantity+' ชิ้น รวม '+cash(quantity*price)+' จากกระเป๋าเงิน?')) return;
      await api('orders',{product:el.dataset.id,quantity,price,key:key()}); await refresh(); await go('/orders'); message('บันทึกคำสั่งซื้อแล้ว'); return;
    }
    if(action==='topup'){
      const t=await api('topups',fields); message('ส่งสลิปแล้ว · '+labels[t.status]);
    }
    if(action==='product'||action==='group') {
      let image=values.remove_image ? null : el.dataset.image || null;
      if(values.image?.size){
        const body=new FormData(); body.set('image',values.image);
        image=(await api('admin/images',body)).key;
      }
      const metadata = {id:el.dataset.id, name:values.name, description:values.description, image_key:image};
      if(action==='group') {
        const variants = Array.from(el.querySelectorAll('[data-variant]'),row=>readVariant(
          Object.fromEntries(Array.from(row.querySelectorAll('input'),input=>[input.name,input.type==='checkbox'?(input.checked?'on':''):input.value]))
        ));
        const saved=await api('admin/groups',{...metadata,name:values.group_name,variants});
        await refresh(); await go('/admin/products/app/'+encodeURIComponent(saved.id));
        message('บันทึกแอปและตัวเลือกแล้ว'); return;
      }
      const saved=await api('admin/products',{...metadata,...readVariant(values),group_id:el.dataset.group,revision:Number(el.dataset.revision)});
      await refresh(); await go('/admin/products/'+encodeURIComponent(saved.id));
      message('บันทึกแพ็กเกจแล้ว'); return;
    }
    if(action==='inventory'){
      const result=await api('admin/inventory',{product:el.dataset.id,codes:values.codes});
      message('เพิ่มรหัสเข้าสต็อก '+result.added+' ชิ้น');
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
