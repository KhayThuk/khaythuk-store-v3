const initialBrands = (await import('./catalog.seed.json', { with: { type: 'json' } })).default.map(brand => ({
  ...brand,
  plans: brand.plans.map(plan => ({ ...plan, visible: true })),
}));

const lineUrl = 'https://lin.ee/YFaxXAX';
const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 });
const money = price => '฿' + number.format(price / 100);
const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value).replace(/[&<>"']/g, char => escapes[char]);

export class CatalogError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function getCatalog(db) {
  const entry = await db.prepare('SELECT revision, state FROM shop_catalog WHERE id = 1').first();
  return entry
    ? { revision: entry.revision, brands: JSON.parse(entry.state) }
    : { revision: 0, brands: structuredClone(initialBrands) };
}

function requiredText(value, length, message, optional = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > length || (!optional && !text)) throw new CatalogError(message);
  return text;
}

function updatePlans({ brands }, method, data) {
  const sku = typeof data.sku === 'string' ? data.sku.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(sku)) throw new CatalogError('กรุณาใช้รหัสแพ็กเกจ 2–24 ตัว เป็นตัวอักษร A–Z ตัวเลข หรือขีดกลาง');
  if (!Number.isInteger(data.price) || data.price < 0 || data.price > 99999999) {
    throw new CatalogError('กรุณากรอกราคา 0 ถึง 999,999.99 บาท');
  }
  const existing = brands.flatMap(brand => brand.plans).find(plan => plan.sku === sku);
  if (method === 'PATCH') {
    if (!existing) throw new CatalogError('ไม่พบรหัสแพ็กเกจนี้', 404);
    if (typeof data.visible !== 'boolean') throw new CatalogError('กรุณาระบุสถานะการแสดงรายการ');
    Object.assign(existing, { price: data.price, visible: data.visible });
    return;
  }

  if (existing) throw new CatalogError('รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น', 409);
  const label = requiredText(data.label, 120, 'กรุณากรอกชื่อแพ็กเกจไม่เกิน 120 ตัวอักษร');
  const group = requiredText(data.group, 160, 'รายละเอียดต้องไม่เกิน 160 ตัวอักษร', true);
  let brand = brands.find(item => item.id === data.service);
  if (data.service === 'new') {
    const name = requiredText(data.newService, 70, 'กรุณากรอกชื่อบริการไม่เกิน 70 ตัวอักษร');
    if (brands.some(item => item.name.toLocaleLowerCase('th') === name.toLocaleLowerCase('th'))) {
      throw new CatalogError('ชื่อบริการนี้มีอยู่แล้ว กรุณาเลือกจากรายการ', 409);
    }
    brand = { id: 'service-' + crypto.randomUUID(), name, color: '#82415a', mark: name, plans: [] };
    brands.push(brand);
  }
  if (!brand) throw new CatalogError('กรุณาเลือกบริการ');
  brand.plans.push({ sku, label, group, price: data.price, visible: true });
}

export async function saveCatalog(db, method, data) {
  if (!data || typeof data !== 'object' || !Number.isInteger(data.revision)) {
    throw new CatalogError('ข้อมูลไม่ครบ กรุณาโหลดหน้าหลังบ้านใหม่');
  }
  const current = await getCatalog(db);
  const conflict = () => new CatalogError('มีการแก้ไขรายการจากอีกแท็บ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง', 409);
  if (data.revision !== current.revision) throw conflict();
  updatePlans(current, method, data);

  const nextRevision = current.revision + 1;
  const time = new Date().toISOString();
  const encoded = JSON.stringify(current.brands);
  const write = current.revision === 0
    ? db.prepare('INSERT INTO shop_catalog (id, revision, state, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
      .bind(nextRevision, encoded, time)
    : db.prepare('UPDATE shop_catalog SET revision = ?, state = ?, updated_at = ? WHERE id = 1 AND revision = ?')
      .bind(nextRevision, encoded, time, current.revision);
  const result = await write.run();
  if (result.meta.changes !== 1) throw conflict();
  return { revision: nextRevision, brands: current.brands };
}

function renderCard(brand) {
  const { plans } = brand;
  const name = esc(brand.name);
  const id = esc(brand.id);
  const art = brand.image
    ? `<img src="${esc(brand.image)}" alt="" width="139" height="64" loading="lazy" decoding="async">`
    : `<span>${esc(brand.mark)}</span>`;
  const note = brand.note ? `<p class="brand-note">${esc(brand.note)}</p>` : '';
  const lowest = money(Math.min(...plans.map(plan => plan.price)));
  const rows = plans.map(plan => {
    const sku = esc(plan.sku);
    const group = plan.group ? `<span class="plan-group">${esc(plan.group)}</span>` : '';
    return `<li class="plan-row" data-sku="${sku}">
      <span class="plan-name"><strong>${esc(plan.label)}</strong>${group}<small class="sku">${sku}</small></span>
      <strong class="plan-price">${money(plan.price)}</strong>
      <button class="pick" type="button" aria-pressed="false" aria-label="เลือก ${name} ${sku}" hidden>+</button>
    </li>`;
  }).join('\n');
  return `<article class="brand-card" data-brand="${id}" aria-labelledby="title-${id}">
    <div class="brand-art" style="--brand-background: ${esc(brand.color)}" aria-hidden="true">${art}</div>
    <div class="brand-info"><div class="brand-heading"><h3 id="title-${id}">${name}</h3><p>เริ่มที่ ${lowest}</p></div>${note}</div>
    <ul class="plan-list">${rows}</ul>
    <div class="card-foot"><a class="small-link" href="${lineUrl}" target="_blank" rel="noopener" aria-label="สอบถาม ${name} ทาง LINE"><i data-lucide="message-circle" aria-hidden="true"></i> สอบถามทาง LINE</a></div>
  </article>`;
}

export function renderStore(page, { brands }, admin) {
  const visible = brands.map(brand => ({ ...brand, plans: brand.plans.filter(plan => plan.visible) }))
    .filter(brand => brand.plans.length);
  const count = visible.reduce((total, brand) => total + brand.plans.length, 0);
  const replacements = {
    '{{BRANDS}}': visible.length,
    '{{COUNTS}}': `${visible.length} บริการ · ${count} แพ็กเกจ`,
    '{{ADMIN_LINK}}': admin ? '<a href="/admin">แอดมิน</a>' : '',
    '{{FILTERS}}': visible.map(brand => `<button class="filter-button" type="button" data-brand="${esc(brand.id)}" aria-pressed="false">${esc(brand.name)}</button>`).join('\n'),
    '{{CATALOG}}': visible.length ? visible.map(renderCard).join('\n') : '<p>ยังไม่มีแพ็กเกจที่เปิดขาย</p>',
  };
  return page.replace(/\{\{[A-Z_]+\}\}/g, token => replacements[token] ?? token);
}
