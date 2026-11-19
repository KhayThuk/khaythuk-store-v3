import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { build } from 'esbuild';

const codecs = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.webm': 'video/webm', '.mp4': 'video/mp4',
};
const contents = {};
const temporary = await mkdtemp(join(tmpdir(), 'line-oa-shop-build-'));
try {
  const files = await readdir('web', { recursive: true, withFileTypes: true });
  for (const file of files) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    const extension = extname(path);
    const type = codecs[extension];
    if (!type) throw new Error(`Unknown asset type: ${path}`);
    const data = await readFile(path);
    const etag = '"' + createHash('sha256').update(data).digest('hex').slice(0, 32) + '"';
    const encoding = ['.html', '.css', '.js', '.svg'].includes(extension)
      ? { text: data.toString('utf8') }
      : { base64: data.toString('base64'), size: data.length };
    contents['/' + path.slice('web/'.length)] = { type, etag, ...encoding };
  }
  const generated = join(temporary, 'assets.js');
  await writeFile(generated, 'export const assets = ' + JSON.stringify(contents));
  await mkdir('dist/server/migrations', { recursive: true });
  await build({
    entryPoints: ['worker/index.js'],
    outfile: 'dist/server/index.js',
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    minify: true,
    plugins: [{
      name: 'web-assets',
      setup(api) { api.onResolve({ filter: /assets\.generated\.js$/ }, () => ({ path: generated })); },
    }],
  });
  await cp('drizzle', 'dist/server/migrations', { recursive: true });
  await writeFile('dist/server/wrangler.json', JSON.stringify({
    name: 'line-oa-shop',
    main: './index.js',
    compatibility_date: '2026-11-19',
    d1_databases: [{
      binding: 'DB', database_name: 'shop-catalog',
      database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: 'migrations',
    }],
  }, null, 2) + '\n');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
