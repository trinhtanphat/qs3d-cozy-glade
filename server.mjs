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
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  let url;
  try {url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
  if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':JSON.stringify({ok:true,app:'qs3d-cozy-glade',version:'2026-11-13'}));return;}
  let p;
  try {p=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return;}
  if(p==='/' || p==='/play' || p==='/play/') p='/index.html';
  if(p.includes('\0') || p.split(/[\\/]/).some(x=>x.startsWith('.')) || p.includes('\\')){res.writeHead(403);res.end();return;}
  const rootItem=p.split('/')[1];
  if(!(new Set(['index.html','qs3d-guide.css','qs3d-guide.js','tiny-glade-aaa.html','styles.css']).has(rootItem) || ['dist','public','screenshots'].includes(rootItem))){res.writeHead(403);res.end();return;}
  const full=resolve(ROOT, '.'+p);
  if(full!==ROOT && !full.startsWith(ROOT+sep)){res.writeHead(403);res.end();return;}
  try{
    const info=await stat(full);
    if(!info.isFile()){res.writeHead(404);res.end();return;}
    const ext=extname(full).toLowerCase();
    const fresh=ext==='.html'||ext==='.js'||ext==='.css';
    const etag='"'+info.size.toString(16)+'-'+Math.trunc(info.mtimeMs).toString(16)+'"';
    const headers={'Content-Type':TYPES[ext]||'application/octet-stream',
      'Cache-Control':fresh?'no-cache, max-age=0, must-revalidate':'public, max-age=3600',
      'ETag':etag,'Last-Modified':info.mtime.toUTCString()};
    if(req.headers['if-none-match']===etag){res.writeHead(304,headers);res.end();return;}
    const buf=await readFile(full);
    headers['Content-Length']=buf.length;
    res.writeHead(200,headers);
    res.end(req.method==='HEAD'?'':buf);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
}).listen(PORT,'127.0.0.1',()=>console.log('QS3D Cozy Glade ready at http://127.0.0.1:'+PORT));
