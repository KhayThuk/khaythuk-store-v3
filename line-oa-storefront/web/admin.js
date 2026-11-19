'use strict';

const form = document.querySelector('#add-form');
const service = form.elements.service;
const newService = document.querySelector('#new-service');
const search = document.querySelector('#search');
const catalog = document.querySelector('#catalog');
const counts = document.querySelector('#counts');
const status = document.querySelector('#notice');
const template = document.querySelector('#item-template');
const drafts = new Map();
let state;
let busy = false;

function notify(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function api(method, data) {
  const response = await fetch('/api/admin/catalog', {
    method,
    cache: 'no-store',
    headers: data ? { 'Content-Type': 'application/json', 'X-Shop-Action': 'catalog' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'บันทึกไม่ได้ กรุณาลองอีกครั้ง');
  return result;
}

function updateNewService() {
  const isNew = service.value === 'new';
  newService.hidden = !isNew;
  form.elements.newService.required = isNew;
}

function renderServices() {
  const previous = service.value;
  const options = state.brands.map(brand => new Option(brand.name, brand.id));
  service.replaceChildren(new Option('เลือกบริการ', ''), ...options, new Option('เพิ่มบริการใหม่', 'new'));
  service.value = Array.from(service.options).some(option => option.value === previous) ? previous : '';
  service.disabled = false;
  updateNewService();
}

function renderCatalog() {
  const filter = search.value.trim().toLocaleLowerCase('th');
  const items = [];
  let activeCount = 0;
  let totalCount = 0;
  for (const brand of state.brands) {
    for (const plan of brand.plans) {
      totalCount++;
      activeCount += Number(plan.visible);
      const lookup = [plan.sku, brand.name, plan.label, plan.group].join(' ').toLocaleLowerCase('th');
      if (!lookup.includes(filter)) continue;
      const row = template.content.firstElementChild.cloneNode(true);
      const price = row.elements.price;
      const visible = row.elements.visible;
      const savedPrice = String(plan.price / 100);
      const draft = drafts.get(plan.sku);
      row.dataset.sku = plan.sku;
      row.dataset.price = savedPrice;
      row.dataset.visible = String(plan.visible);
      row.querySelector('.item-name').textContent = `${brand.name} · ${plan.sku}`;
      row.querySelector('.item-label').textContent = plan.label;
      row.querySelector('.item-group').textContent = plan.group;
      price.value = draft?.price ?? savedPrice;
      price.setAttribute('aria-label', `ราคา ${plan.sku} (บาท)`);
      visible.checked = draft?.visible ?? plan.visible;
      visible.setAttribute('aria-label', `แสดงแพ็กเกจ ${plan.sku} บนหน้าร้าน`);
      row.querySelector('.item-save').setAttribute('aria-label', `บันทึก ${plan.sku}`);
      items.push(row);
    }
  }
  counts.textContent = `แสดงบนหน้าร้าน ${activeCount} จาก ${totalCount} แพ็กเกจ`;
  if (!items.length) {
    const message = document.createElement('p');
    message.className = 'empty';
    message.textContent = 'ไม่พบแพ็กเกจที่ตรงกับการค้นหา';
    items.push(message);
  }
  catalog.replaceChildren(...items);
  updateButtons();
}

function updateButtons() {
  form.querySelector('button').disabled = busy || !state;
  for (const row of catalog.querySelectorAll('form')) {
    row.querySelector('.item-save').disabled = busy || !drafts.has(row.dataset.sku);
  }
}

function readPrice(value) {
  const parts = value.split('.');
  return Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
}

async function save(method, data, message) {
  busy = true;
  notify('กำลังบันทึก…');
  updateButtons();
  try {
    state = await api(method, { ...data, revision: state.revision });
    if (data.sku) drafts.delete(data.sku);
    renderServices();
    renderCatalog();
    notify(message);
    return true;
  } catch (error) {
    notify(error.message, true);
    return false;
  } finally {
    busy = false;
    updateButtons();
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !state) return;
  const values = new FormData(form);
  const data = {
    service: values.get('service'),
    newService: values.get('newService'),
    sku: values.get('sku').trim().toUpperCase(),
    label: values.get('label'),
    group: values.get('group'),
    price: readPrice(values.get('price')),
  };
  if (await save('POST', data, `เพิ่ม ${data.sku} ลงหน้าร้านแล้ว`)) {
    form.reset();
    service.value = '';
    updateNewService();
    service.focus();
  }
});
catalog.addEventListener('input', event => {
  const row = event.target.closest('.item');
  if (!row) return;
  const { sku, price, visible } = row.dataset;
  const input = { price: row.elements.price.value, visible: row.elements.visible.checked };
  if (price === input.price && visible === String(input.visible)) drafts.delete(sku);
  else drafts.set(sku, input);
  updateButtons();
});
catalog.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !state) return;
  const { sku } = event.target.dataset;
  const input = drafts.get(sku);
  if (input) {
    await save('PATCH', { sku, visible: input.visible, price: readPrice(input.price) }, `บันทึก ${sku} แล้ว`);
    const row = Array.from(catalog.querySelectorAll('.item')).find(item => item.dataset.sku === sku);
    row?.elements.price.focus();
  }
});
service.addEventListener('change', updateNewService);
search.addEventListener('input', () => { if (state) renderCatalog(); });

api('GET').then(result => {
  state = result;
  renderServices();
  renderCatalog();
}).catch(error => {
  counts.textContent = 'โหลดรายการสินค้าไม่สำเร็จ';
  notify(error.message, true);
});
