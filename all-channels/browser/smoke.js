import {WebSocket} from 'ws';
const root=process.env.BROWSER_SMOKE_URL||'http://127.0.0.1:3104';
const key=process.env.BUZZIE_API_TOKEN;
const check=(condition,message)=>{if(!condition)throw Error(message);};
async function post(path,data,token=key){const response=await fetch(root+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(25000)});return{status:response.status,data:await response.json()};}
for(let i=0;i<90;i++){try{if((await fetch(root+'/health',{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
const unauth=await post('/browser/api',{op:'status'},'wrong');check(unauth.status===401,'Unauthenticated browser API exposed');
let status=await post('/browser/api',{op:'status'});check(status.status===200,'Browser did not start');
const session=await post('/browser/sessions',{});check(session.status===200&&session.data.ticket,'Owner viewer session failed');const ticket=session.data.ticket;
if(process.argv.includes('--after-restart')){
 check(status.data.mode==='human','Manual pause did not persist across container recreation');
 check((await post('/browser/api',{op:'snapshot'})).status===409,'Agent inspected browser after manual restart');
 await post('/browser/control',{action:'release'},ticket);
 const tabs=await post('/browser/api',{op:'tabs'});check(tabs.data.tabs.some(t=>t.url.startsWith('https://example.com')),'Open tab was not restored from persistent profile');
 console.log('Browser profile, tabs, and manual pause survived container recreation.');
}else{
 if(status.data.mode!=='agent')await post('/browser/control',{action:'release'},ticket);
 const navigation=await post('/browser/api',{op:'navigate',url:'https://example.com'});check(navigation.status===200,'Public website navigation failed');
 const snapshot=await post('/browser/api',{op:'snapshot'});check(JSON.stringify(snapshot.data).includes('Example Domain'),'Real browser snapshot failed');
 const privateNavigation=await post('/browser/api',{op:'navigate',url:'http://169.254.169.254/'});check(privateNavigation.status!==200,'Private network navigation allowed');
 await post('/browser/api',{op:'navigate',url:'https://example.com'});
 await new Promise((resolve,reject)=>{
  const url=new URL('/browser/stream',root);url.protocol=url.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(url,['binary','sal-ticket.'+ticket]);let buffer=Buffer.alloc(0),phase=0;const timeout=setTimeout(()=>{ws.terminate();reject(Error('Live browser stream timed out'));},10000);
  ws.on('error',reject);ws.on('message',bytes=>{buffer=Buffer.concat([buffer,bytes]);
   while(true){if(phase===0){if(buffer.length<12)return;check(buffer.subarray(0,12).toString().startsWith('RFB 003.008'),'Invalid VNC stream');buffer=buffer.subarray(12);ws.send(Buffer.from('RFB 003.008\n'));phase=1;}
    else if(phase===1){if(!buffer.length||buffer.length<1+buffer[0])return;check(buffer.subarray(1,1+buffer[0]).includes(1),'Missing VNC security type');buffer=buffer.subarray(1+buffer[0]);ws.send(Buffer.from([1]));phase=2;}
    else if(phase===2){if(buffer.length<4)return;check(buffer.readUInt32BE(0)===0,'VNC negotiation failed');buffer=buffer.subarray(4);ws.send(Buffer.from([1]));phase=3;}
    else{if(buffer.length<24)return;check(buffer.readUInt16BE(0)===1280&&buffer.readUInt16BE(2)===900,'Unexpected browser display dimensions');clearTimeout(timeout);ws.close();resolve();return;}
   }
  });
 });
 await post('/browser/control',{action:'take'},ticket);
 check((await post('/browser/api',{op:'snapshot'})).status===409,'Private takeover did not block agent reads');
 check((await post('/browser/api',{op:'navigate',url:'https://example.com'})).status===409,'Private takeover did not block agent actions');
 console.log('Real Chromium navigation, DOM snapshot, authenticated streaming, egress policy, and takeover passed.');
}
