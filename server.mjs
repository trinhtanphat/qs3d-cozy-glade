import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT || 5486);
const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.wasm':'application/wasm'};
http.createServer(async (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let url;
  try {url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
  if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':JSON.stringify({ok:true,app:'qs3d-cozy-glade',version:'2026-11-13'}));return;}
  let p;
  try {p=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return;}
  if(p==='/' || p==='/play' || p==='/play/') p='/index.html';
  if(p.includes('\0') || p.split(/[\\/]/).some(x=>x.startsWith('.')) || p.includes('\\')){res.writeHead(403);res.end();return;}
  const full=resolve(ROOT, '.'+p);
  if(full!==ROOT && !full.startsWith(ROOT+sep)){res.writeHead(403);res.end();return;}
  try{
    const info=await stat(full);
    if(!info.isFile()){res.writeHead(404);res.end();return;}
    const buf=await readFile(full);
    res.writeHead(200,{'Content-Type':TYPES[extname(full).toLowerCase()]||'application/octet-stream','Cache-Control':'public, max-age=120'});
    res.end(req.method==='HEAD'?'':buf);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
}).listen(PORT,'127.0.0.1',()=>console.log('QS3D Cozy Glade ready at http://127.0.0.1:'+PORT));
