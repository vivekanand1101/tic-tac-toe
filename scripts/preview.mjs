// Loopback preview with a per-player Jev API. No environment credentials are loaded.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {handleApi} from '../server/api.mjs';
import {Readable} from 'node:stream';
const env={};
const root=resolve('dist');
const port=Number(process.env.PORT || 3039);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://api.typesafe.ai; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
 if(!/^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(req.headers.host||'')){res.writeHead(403);res.end();return;}
 if(new URL(req.url,'http://localhost').pathname.startsWith('/api/')){
  try {
   const init={method:req.method,headers:req.headers};
   if(req.method!=='GET'&&req.method!=='HEAD'){init.body=Readable.toWeb(req);init.duplex='half';}
   const controller=new AbortController();res.on('close',()=>controller.abort());init.signal=controller.signal;
   const response=await handleApi(new Request(`http://${req.headers.host}${req.url}`,init),env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(400);res.end('Invalid request');}
  return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 try{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Game: http://127.0.0.1:${port}`));
