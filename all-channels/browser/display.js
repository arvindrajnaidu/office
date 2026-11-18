import {WebSocket} from 'ws';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CDP_ENDPOINT} from './desktop-chrome.js';
const exec=promisify(execFile);

/** Display configuration only. This connection never reads DOM, URLs, input or cookies. */
export class BrowserDisplay {
 constructor(endpoint=CDP_ENDPOINT){this.endpoint=endpoint;this.mode='desktop';this.sessions=new Map();this.pending=new Map();this.id=0;this.socket=null;this.tail=Promise.resolve();}
 async connect(){
  if(this.socket?.readyState===WebSocket.OPEN)return;
  const info=await(await fetch(this.endpoint+'/json/version',{signal:AbortSignal.timeout(2000)})).json();
  this.userAgent=info['User-Agent'];this.version=String(info.Browser||'').split('/')[1]||'';
  const socket=new WebSocket(info.webSocketDebuggerUrl);this.socket=socket;
  socket.on('error',()=>{});
  socket.on('message',raw=>{
   const msg=JSON.parse(raw.toString());
   if(msg.id){const waiter=this.pending.get(msg.id);if(waiter){this.pending.delete(msg.id);clearTimeout(waiter.timer);msg.error?waiter.reject(Error('Browser display could not be configured.')):waiter.resolve(msg.result);}}
   else if(msg.method==='Target.attachedToTarget'&&msg.params.targetInfo.type==='page'){
    const {sessionId,targetInfo}=msg.params;this.sessions.set(sessionId,targetInfo.targetId);
    // New tabs inherit the current display without enabling page inspection.
    const mode=this.mode;this.tail=this.tail.catch(()=>{}).then(()=>this.configurePage(sessionId,targetInfo.targetId,mode));this.tail.catch(()=>{});
   }else if(msg.method==='Target.detachedFromTarget')this.sessions.delete(msg.params.sessionId);
  });
  socket.on('close',()=>{if(this.socket===socket)this.socket=null;this.sessions.clear();for(const waiter of this.pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('Browser display disconnected.'));}this.pending.clear();});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.terminate();reject(Error('Browser display timed out.'));},3000);socket.once('open',()=>{clearTimeout(timer);resolve();});socket.once('error',()=>{clearTimeout(timer);reject(Error('Browser display unavailable.'));});});
  await this.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true,filter:[{type:'page'},{exclude:true}]});
 }
 send(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
   const id=++this.id;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Browser display timed out.'));},3000);
   this.pending.set(id,{resolve,reject,timer});
   try{this.socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}catch{clearTimeout(timer);this.pending.delete(id);reject(Error('Browser display unavailable.'));}
  });
 }
 async configurePage(sessionId,targetId,mode){
  const mobile=mode==='mobile';
  const major=this.version.split('.')[0];
  const userAgent=mobile?this.userAgent.replace(/\([^)]*\)/,'(Linux; Android 14)').replace(/ Safari\//,' Mobile Safari/'):this.userAgent;
  await this.send('Emulation.setUserAgentOverride',{userAgent,userAgentMetadata:{brands:[{brand:'Chromium',version:major}],fullVersionList:[{brand:'Chromium',version:this.version}],platform:mobile?'Android':'Linux',platformVersion:mobile?'14.0.0':'',architecture:mobile?'':'x86',model:'',mobile}},sessionId);
  if(mobile)await this.send('Emulation.setDeviceMetricsOverride',{width:500,height:780,deviceScaleFactor:1,mobile:true,screenWidth:500,screenHeight:900},sessionId);
  else await this.send('Emulation.clearDeviceMetricsOverride',{},sessionId);
  const {windowId}=await this.send('Browser.getWindowForTarget',{targetId});
  await this.send('Browser.setWindowBounds',{windowId,bounds:{windowState:'normal'}});
  await this.send('Browser.setWindowBounds',{windowId,bounds:{left:0,top:0,width:mobile?500:1280,height:900}});
 }
 async set(mode){
  if(!['mobile','desktop'].includes(mode))throw Error('Choose mobile or desktop.');
  await this.connect();this.mode=mode;
  this.tail=this.tail.catch(()=>{}).then(async()=>{
   for(const [sessionId,targetId]of this.sessions)await this.configurePage(sessionId,targetId,mode);
   await exec('x11vnc',['-display',':99','-sync','-R',mode==='mobile'?'clip:500x900+0+0':'clip:1280x900+0+0'],{timeout:5000,env:{...process.env,DISPLAY:':99'}});
  });
  await this.tail;return{display:this.mode};
 }
 close(){this.socket?.terminate();}
}
