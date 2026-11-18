import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {WebSocketServer} from 'ws';
import {BrowserAccess,equalSecret,rfbInputFilter} from './access.js';
import {startEgressProxy} from './egress.js';
import {launchBrowser} from './runtime.js';

const home=process.env.SAL_BROWSER_HOME||'/data/browser';fs.mkdirSync(home,{recursive:true});
const access=new BrowserAccess(path.join(home,'control.json'));
const key=process.env.BUZZIE_API_TOKEN||process.env.BACKEND_TOKEN;
if(!key)throw Error('Browser runtime requires channel authentication.');
const children=[];let runtime,server,proxy,closing=false;
function child(command,args){const c=spawn(command,args,{env:{...process.env,DISPLAY:':99'},stdio:['ignore','ignore','ignore']});children.push(c);c.on('error',()=>shutdown(1));c.on('exit',()=>{if(!closing)shutdown(1);});return c;}
async function shutdown(code=0){if(closing)return;closing=true;await runtime?.context.close().catch(()=>{});for(const c of children)c.kill('SIGTERM');server?.close();proxy?.close();process.exit(code);}
process.on('SIGTERM',()=>shutdown());process.on('SIGINT',()=>shutdown());process.on('uncaughtException',()=>shutdown(1));process.on('unhandledRejection',()=>shutdown(1));
child('Xvfb',[':99','-screen','0','1280x900x24','-nolisten','tcp','-ac']);
for(let i=0;i<50&&!fs.existsSync('/tmp/.X11-unix/X99');i++)await new Promise(r=>setTimeout(r,100));
child('openbox',[]);
child('x11vnc',['-display',':99','-rfbport','5900','-localhost','-nopw','-forever','-shared','-rfbversion','3.8','-noxdamage','-repeat','-quiet']);
proxy=await startEgressProxy();runtime=await launchBrowser(home);
runtime.context.on('close',()=>{if(!closing)shutdown(1);});
const origin=process.env.BACKEND_URL?new URL(process.env.BACKEND_URL).origin:'https://hawk.business';
const body=async req=>{const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>20000)throw Error('Request too large.');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');};
const token=req=>req.headers.authorization?.match(/^Bearer (.+)$/)?.[1]||'';
const owner=req=>access.valid(token(req));
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(data));};
const here=path.dirname(fileURLToPath(import.meta.url));
server=http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('Referrer-Policy','no-referrer');
 if(url.pathname==='/health'){json(res,200,{ready:true});return;}
 if(url.pathname==='/browser/view'){
  const nonce=randomBytes(16).toString('base64');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors ${origin}; base-uri 'none'; form-action 'none'`});
  res.end(fs.readFileSync(path.join(here,'viewer.html'),'utf8').replace('__NONCE__',nonce));return;
 }
 if(url.pathname.startsWith('/browser/vendor/')){
  const relative=decodeURIComponent(url.pathname.slice('/browser/vendor/'.length));const root='/usr/share/novnc/';const file=path.resolve(root,relative);
  if(!file.startsWith(root)||!file.endsWith('.js')){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);return;
 }
 if(url.pathname==='/browser/sessions'&&req.method==='POST'){
  if(!equalSecret(token(req),key)){json(res,401,{error:'Unauthorized.'});return;}
  if(access.sessions.size>30){for(const [id,s]of access.sessions)if(s.expires<Date.now())access.sessions.delete(id);if(access.sessions.size>30){json(res,429,{error:'Too many viewer sessions. Wait for an earlier session to expire.'});return;}}
  json(res,200,access.session());return;
 }
 if(url.pathname==='/browser/control'&&req.method==='POST'){
  if(!owner(req)){json(res,401,{error:'Session expired. Reconnect from Hawk.'});return;}
  const data=await body(req);const ticket=token(req);
  if(data.action==='take')await access.take(ticket);
  else if(data.action==='release')access.release(ticket);
  else if(data.action!=='status'){json(res,400,{error:'Unknown control action.'});return;}
  json(res,200,{mode:access.mode,controller:access.controller===ticket});return;
 }
 if(url.pathname==='/browser/api'&&req.method==='POST'){
  if(!equalSecret(token(req),key)){json(res,401,{error:'Unauthorized.'});return;}
  const data=await body(req);
  if(data.op==='status'){json(res,200,{ready:true,mode:access.mode,viewerPath:'/browser'});return;}
  const allowed=['tabs','navigate','new_tab','close_tab','snapshot','click','type','press','scroll'];
  if(!allowed.includes(data.op)||Object.values(data).some(v=>typeof v!=='string'||v.length>10000)){json(res,400,{error:'Invalid browser action.'});return;}
  try{json(res,200,await access.automate(()=>runtime.action(data)));}catch(error){json(res,409,{error:access.mode!=='agent'?'The owner has control. Wait for them to Return to Sal.':String(error.message).replace(/\n[\s\S]*/,'').slice(0,240)});}return;
 }
 json(res,404,{error:'Not found.'});
 }catch{if(!res.headersSent)json(res,400,{error:'Browser request could not be completed.'});else res.destroy();}
});
const wss=new WebSocketServer({noServer:true,maxPayload:4*1024*1024,handleProtocols:protocols=>protocols.has('binary')?'binary':false});
server.on('upgrade',(req,socket,head)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const protocols=String(req.headers['sec-websocket-protocol']||'').split(',').map(s=>s.trim());
 const ticket=protocols.find(s=>s.startsWith('sal-ticket.'))?.slice(11);
 if(pathname!=='/browser/stream'||!access.valid(ticket)){socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');return;}
 const requestOrigin=req.headers.origin;
 if(requestOrigin&&new URL(requestOrigin).host!==req.headers.host){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
 wss.handleUpgrade(req,socket,head,ws=>{
  const tcp=net.connect(5900,'127.0.0.1');const filter=rfbInputFilter(()=>access.canInput(ticket),packet=>tcp.write(packet));
  tcp.on('data',data=>{if(ws.readyState===ws.OPEN)ws.send(data);});
  tcp.on('error',()=>ws.close());tcp.on('close',()=>ws.close());
  ws.on('message',data=>{if(!access.valid(ticket)){ws.close(1008,'Session expired');return;}try{filter(data);}catch{ws.close(1008,'Unsupported stream input');}});
  const timer=setInterval(()=>{if(!access.valid(ticket))ws.close(1008,'Session expired');},10000);
  ws.on('close',()=>{clearInterval(timer);tcp.destroy();});ws.on('error',()=>tcp.destroy());
 });
});
server.listen(Number(process.env.SAL_BROWSER_PORT||3104),'0.0.0.0',()=>console.log('[browser] Ready: persistent Chromium and authenticated live viewer.'));
