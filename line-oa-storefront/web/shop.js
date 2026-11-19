'use strict';

const search = document.querySelector('#catalog-search');
const searchLink = document.querySelector('#search-link');
const filters = document.querySelector('#filters');
const resultCount = document.querySelector('#result-count');
const emptyState = document.querySelector('#empty-state');
const grid = document.querySelector('#catalog-grid');
const menu = document.querySelector('#main-nav');
const menuToggle = document.querySelector('#menu-toggle');
const bagToggle = document.querySelector('#bag-toggle');
const bagCount = document.querySelector('#bag-count');
const bagDialog = document.querySelector('#bag-dialog');
const bagList = document.querySelector('#bag-list');
const bagHelp = document.querySelector('#bag-help');
const copyStatus = document.querySelector('#copy-status');
const floatLine = document.querySelector('#float-line');
const floatBag = document.querySelector('#float-bag');
const floatBagCount = document.querySelector('#float-bag-count');
const video = document.querySelector('.cover-video');
const motionToggle = document.querySelector('#motion-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const normalize = value => value.toLocaleLowerCase('th').replace(/\s+/g, '');
const plans = new Map();
const brands = Array.from(grid.querySelectorAll('.brand-card'), card => {
  const name = card.querySelector('h3').textContent;
  const entries = Array.from(card.querySelectorAll('.plan-row'), row => {
    const button = row.querySelector('.pick');
    const plan = {
      sku: row.dataset.sku,
      name,
      label: row.querySelector('.plan-name strong').textContent,
      price: row.querySelector('.plan-price').textContent,
      searchable: normalize(name + ' ' + row.textContent),
      row,
      button,
    };
    plans.set(plan.sku, plan);
    button.hidden = false;
    return plan;
  });
  return { card, entries };
});

const storageKey = 'line-oa-shop-selected';
function readSelected() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    return new Set(Array.isArray(stored) ? stored.filter(sku => plans.has(sku)) : []);
  } catch {
    return new Set();
  }
}

const selected = readSelected();
let activeFilter = 'all';
let pastHero = false;

function filterCatalog() {
  const query = normalize(search.value);
  let serviceCount = 0;
  let planCount = 0;
  for (const { card, entries } of brands) {
    const showBrand = activeFilter === 'all' || activeFilter === card.dataset.brand;
    let matching = 0;
    for (const plan of entries) {
      const showPlan = showBrand && plan.searchable.includes(query);
      plan.row.hidden = !showPlan;
      matching += Number(showPlan);
    }
    card.hidden = !matching;
    serviceCount += Number(Boolean(matching));
    planCount += matching;
  }
  resultCount.textContent = `${serviceCount} บริการ · ${planCount} แพ็กเกจ`;
  emptyState.hidden = planCount > 0;
}

function setFilter(brand) {
  activeFilter = brand;
  for (const button of filters.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.brand === activeFilter));
  }
  filterCatalog();
}

function setMenu(open) {
  menu.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
}

function updateBag() {
  const count = selected.size;
  bagCount.hidden = !count;
  bagCount.textContent = count;
  bagToggle.setAttribute('aria-label', count ? `เปิดรายการที่เลือก ${count} แพ็กเกจ` : 'เปิดรายการที่เลือก');
  floatBagCount.textContent = count;
  floatBag.hidden = !count || !pastHero;
  for (const { sku, button, name } of plans.values()) {
    const picked = selected.has(sku);
    button.setAttribute('aria-pressed', String(picked));
    button.setAttribute('aria-label', `${picked ? 'เอาออก' : 'เลือก'} ${name} ${sku}`);
    button.textContent = picked ? '✓' : '+';
  }
}

function setPicked(sku, picked) {
  if (picked) selected.add(sku);
  else selected.delete(sku);
  try {
    localStorage.setItem(storageKey, JSON.stringify([...selected]));
  } catch {
    // Selections remain available in the current tab.
  }
  updateBag();
}

function buildBagItem(plan) {
  const item = document.createElement('li');
  const content = document.createElement('div');
  const name = document.createElement('strong');
  const description = document.createElement('small');
  const actions = document.createElement('div');
  const copy = document.createElement('button');
  const remove = document.createElement('button');

  name.textContent = `${plan.name} · ${plan.sku}`;
  description.textContent = `${plan.label} · ${plan.price}`;
  content.append(name, description);
  actions.className = 'bag-actions';
  copy.className = 'bag-action';
  copy.type = 'button';
  copy.textContent = 'คัดลอกรหัส';
  copy.setAttribute('aria-label', `คัดลอกรหัส ${plan.sku}`);
  copy.dataset.copy = plan.sku;
  remove.type = 'button';
  remove.className = 'icon-button bag-remove';
  remove.textContent = '×';
  remove.setAttribute('aria-label', `เอา ${plan.sku} ออกจากรายการ`);
  remove.dataset.remove = plan.sku;
  actions.append(copy, remove);
  item.append(content, actions);
  return item;
}

function renderBag() {
  copyStatus.textContent = '';
  bagHelp.textContent = selected.size
    ? 'คัดลอกรหัสและส่งทีละรหัสในแชต LINE ของร้าน'
    : 'ยังไม่ได้เลือกแพ็กเกจ กด + ที่รายการที่คุณสนใจเพื่อเก็บรหัสไว้';
  bagList.replaceChildren(...Array.from(selected, sku => buildBagItem(plans.get(sku))));
}

function openBag() {
  renderBag();
  bagDialog.showModal();
}

async function copySku(sku) {
  try {
    await navigator.clipboard.writeText(sku);
    copyStatus.textContent = `คัดลอก ${sku} แล้ว เปิดแชต LINE เพื่อวางรหัส`;
  } catch {
    copyStatus.textContent = `รหัสแพ็กเกจ ${sku} พิมพ์รหัสนี้ในแชต LINE ได้เลย`;
  }
}

function updateMotionControl() {
  motionToggle.setAttribute('aria-label', video.paused ? 'เล่นวิดีโอพื้นหลัง' : 'หยุดวิดีโอพื้นหลัง');
  motionToggle.querySelector('.motion-pause').hidden = video.paused;
  motionToggle.querySelector('.motion-play').hidden = !video.paused;
}

function applyMotionPreference() {
  if (reducedMotion.matches) {
    video.autoplay = false;
    video.pause();
  } else {
    video.play().catch(updateMotionControl);
  }
  updateMotionControl();
}

search.addEventListener('input', filterCatalog);
searchLink.addEventListener('click', () => search.focus({ preventScroll: true }));
filters.addEventListener('click', event => {
  const button = event.target.closest('button[data-brand]');
  if (button) setFilter(button.dataset.brand);
});
document.querySelector('#reset-search').addEventListener('click', () => {
  search.value = '';
  setFilter('all');
  search.focus();
});
grid.addEventListener('click', event => {
  const button = event.target.closest('.pick');
  if (!button) return;
  const sku = button.closest('[data-sku]').dataset.sku;
  setPicked(sku, !selected.has(sku));
});
menuToggle.addEventListener('click', () => setMenu(menuToggle.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', event => {
  if (event.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    menuToggle.focus();
  }
});

bagToggle.addEventListener('click', openBag);
floatBag.addEventListener('click', openBag);
bagList.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.copy) {
    copySku(button.dataset.copy);
  } else if (button.dataset.remove) {
    const items = Array.from(bagList.children);
    const index = items.indexOf(button.closest('li'));
    setPicked(button.dataset.remove, false);
    renderBag();
    const nearestItem = bagList.children[Math.min(index, bagList.children.length - 1)];
    (nearestItem?.querySelector('[data-remove]') || bagDialog.querySelector('.close-dialog')).focus();
  }
});

const observer = new IntersectionObserver(entries => {
  const hero = entries[0];
  pastHero = !hero.isIntersecting && hero.boundingClientRect.bottom <= 0;
  floatLine.hidden = !pastHero;
  floatBag.hidden = !pastHero || !selected.size;
});
observer.observe(document.querySelector('.cover'));

video.addEventListener('play', updateMotionControl);
video.addEventListener('pause', updateMotionControl);
motionToggle.addEventListener('click', () => {
  if (video.paused) video.play().catch(updateMotionControl);
  else video.pause();
});
reducedMotion.addEventListener('change', applyMotionPreference);

window.lucide?.createIcons();
motionToggle.hidden = false;
applyMotionPreference();
filters.hidden = false;
updateBag();
