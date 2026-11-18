import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {WebSocket} from 'ws';

export const CDP_ENDPOINT='http://127.0.0.1:9222';
export function desktopChromeArgs(profile){
 return [`--user-data-dir=${profile}`,'--remote-debugging-address=127.0.0.1','--remote-debugging-port=9222',
  '--no-sandbox','--disable-dev-shm-usage','--window-size=1280,900','--window-position=0,0',
  '--restore-last-session','--no-first-run','--no-default-browser-check','--password-store=basic',
  '--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--proxy-server=http://127.0.0.1:7080','--proxy-bypass-list=<-loopback>'];
}
export async function startDesktopChrome(profile,downloads){
 fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(downloads,{recursive:true});
 const lock=path.join(profile,'SingletonLock');
 try{const target=fs.readlinkSync(lock);const match=target.match(/^(.*)-(\d+)$/);if(match&&match[1]===os.hostname()){try{process.kill(Number(match[2]),0);throw Error('Browser profile is already in use.');}catch(error){if(error.code!=='ESRCH')throw error;}}}catch(error){if(!['ENOENT','EINVAL'].includes(error.code))throw error;}
 for(const name of ['SingletonLock','SingletonCookie','SingletonSocket']){try{fs.unlinkSync(path.join(profile,name));}catch{}}
 const preferencesFile=path.join(profile,'Default','Preferences');fs.mkdirSync(path.dirname(preferencesFile),{recursive:true});
 let preferences={};try{preferences=JSON.parse(fs.readFileSync(preferencesFile,'utf8'));}catch{}
 preferences.download={...preferences.download,default_directory:downloads};
 fs.writeFileSync(preferencesFile,JSON.stringify(preferences),{mode:0o600});
 const executable=process.env.SAL_BROWSER_EXECUTABLE||'/usr/bin/chromium';
 const child=spawn('python3',[fileURLToPath(new URL('./chrome-parent.py',import.meta.url)),executable,...desktopChromeArgs(profile)],{env:{...process.env,DISPLAY:':99'},stdio:['ignore','ignore','ignore']});
 let failure;child.once('error',error=>{failure=error;});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 const stop=async()=>{
  if(child.exitCode!==null||child.signalCode)return;
  // A signal can drop freshly written cookies. Browser.close flushes Chrome's profile first.
  let socket;
  try{
   const response=await fetch(CDP_ENDPOINT+'/json/version',{signal:AbortSignal.timeout(1000)});
   const info=await response.json();
   if(typeof info.webSocketDebuggerUrl==='string'){
    socket=new WebSocket(info.webSocketDebuggerUrl);
    socket.on('error',()=>{});
    await Promise.race([new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);}),sleep(1000)]);
    if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({id:1,method:'Browser.close'}));
    await Promise.race([exited,sleep(5000)]);
   }
  }catch{}finally{socket?.terminate();}
  if(child.exitCode!==null||child.signalCode)return;
  child.kill('SIGTERM');await Promise.race([exited,sleep(2000)]);
  if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await exited;}
 };
 for(let attempt=0;attempt<100;attempt++){
  if(failure||child.exitCode!==null||child.signalCode){await stop();throw Error('Desktop Chromium failed to start.');}
  try{const response=await fetch(CDP_ENDPOINT+'/json/version',{signal:AbortSignal.timeout(500)});if(response.ok)return{child,stop};}catch{}
  await sleep(100);
 }
 await stop();throw Error('Desktop Chromium did not become ready.');
}
