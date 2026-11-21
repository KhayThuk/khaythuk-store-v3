import './build.mjs';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import { createLocalEnv } from './local-env.mjs';

const {default: worker} = await import('../dist/server/index.js');
const args = process.argv.slice(2);
const flag = (name, fallback) => args.includes(name) ? args[args.indexOf(name)+1] : fallback;
const host = flag('--host','127.0.0.1');
const port = Number(flag('--port','4173'));
const env = createLocalEnv(resolve(process.env.MALI_LOCAL_DATA ?? '.local'));
createServer(async (req,res) => {
  try {
    const request = new Request('http://' + req.headers.host + req.url, {
      method:req.method, headers:req.headers,
      ...(req.method==='GET'||req.method==='HEAD'?{}:{body:Readable.toWeb(req),duplex:'half'}),
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    if(response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error(error.name);
    res.writeHead(500).end('Server error');
  }
}).listen(port,host,()=>console.log(`Mali Market preview on http://${host}:${port}`));
