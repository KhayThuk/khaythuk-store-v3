import { readFile, mkdir, writeFile, cp, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path, encoding) => readFile(new URL(path, root), encoding);
const [html, css, js, image, worker, config] = await Promise.all([
  read('public/index.html', 'utf8'), read('public/style.css', 'utf8'), read('public/app.js', 'utf8'),
  read('public/hero.webp'), read('src/worker.mjs', 'utf8'), read('.openai/hosting.json'),
]);
const filenames = await readdir(new URL('public/covers/', root));
const covers = Object.fromEntries(await Promise.all(filenames.map(async name =>
  [name, (await read('public/covers/' + name)).toString('base64')])));
const catalog = JSON.parse(await read('src/catalog.json', 'utf8'));
const source = worker.replace(/^import .* from '\.\/assets\.mjs';\n/,
  [html, css, js, image.toString('base64'), covers, catalog].map((asset, index) =>
    'const ' + ['shell','stylesheet','client','hero','covers','catalog'][index] + ' = ' + JSON.stringify(asset) + ';\n').join(''));
await mkdir(new URL('dist/server/', root), { recursive: true });
await mkdir(new URL('dist/.openai/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), source);
await writeFile(new URL('dist/.openai/hosting.json', root), config);
await cp(new URL('drizzle', root), new URL('dist/server/drizzle', root), { recursive:true });
await writeFile(new URL('dist/server/wrangler.json', root), JSON.stringify({
  name:'mali-market', main:'index.js', compatibility_date:'2025-04-01',
  d1_databases:[{binding:'DB',database_name:'mali-market',database_id:'local',migrations_dir:'drizzle'}],
  r2_buckets:[{binding:'BUCKET',bucket_name:'mali-market'}],
}, null, 2));
