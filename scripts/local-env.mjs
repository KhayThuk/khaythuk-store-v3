import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile, rm, access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export function createLocalEnv(directory = null) {
  if (directory) mkdirSync(directory, { recursive:true });
  const sqlite = new DatabaseSync(directory ? join(directory, 'store.sqlite') : ':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000');
  const migrations = [
    ['users', '0000_store.sql'],
    ['inventory_codes', '0001_unique_inventory.sql'],
    ['product_groups', '0002_product_groups.sql'],
  ];
  for (const [table, file] of migrations) {
    if (sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(table)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
      sqlite.exec('COMMIT');
    } catch (err) { sqlite.exec('ROLLBACK'); throw err; }
  }
  const prepared = (sql, args) => ({
    first:async () => sqlite.prepare(sql).get(...args) ?? null,
    all:async () => ({results:sqlite.prepare(sql).all(...args)}),
    run:async () => execute(sql, args),
    execute:() => execute(sql, args),
  });
  const execute = (sql, args) => {
    const result = sqlite.prepare(sql).run(...args);
    return { meta:{ changes:Number(result.changes) } };
  };
  const DB = {
    prepare:sql => ({bind:(...args)=>prepared(sql,args)}),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement=>statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (err) { sqlite.exec('ROLLBACK'); throw err; }
    },
  };
  const storage = new Map();
  const base = directory && join(directory, 'images');
  const BUCKET = {
    async put(key, bytes, info) {
      if (!base) { storage.set(key,{body:bytes,httpMetadata:info.httpMetadata}); return; }
      const prefix = join(base, key.split('/')[0]);
      await mkdir(prefix, {recursive:true});
      await writeFile(join(base, key),bytes);
      await writeFile(join(base,key+'.json'),JSON.stringify(info.httpMetadata));
    },
    async get(key) {
      if (!base) return storage.get(key) ?? null;
      try {
        const [body, metadata] = await Promise.all([readFile(join(base,key)),readFile(join(base,key+'.json'),'utf8')]);
        return {body,httpMetadata:JSON.parse(metadata)};
      } catch(err) { if(err.code==='ENOENT') return null; throw err; }
    },
    async head(key) {
      if (!base) return storage.has(key) || null;
      try { await access(join(base,key)); return true; }
      catch (err) { if(err.code==='ENOENT') return null; throw err; }
    },
    async delete(key) {
      if (!base) { storage.delete(key); return; }
      await Promise.all([rm(join(base,key),{force:true}),rm(join(base,key+'.json'),{force:true})]);
    },
  };
  return { DB, BUCKET, sqlite, LOCAL_SETUP:'1', ADMIN_INITIALIZE_FROM_OWNER:'1' };
}
