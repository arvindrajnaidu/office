import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{BrowserAccess,equalSecret,rfbInputFilter}from'./access.js';
import{publicAddress,startEgressProxy}from'./egress.js';

test('manual takeover blocks actions and reads until explicit release, including after restart',async()=>{
 const home=mkdtempSync(join(tmpdir(),'sal-browser-lock-'));const file=join(home,'control.json');
 try{const access=new BrowserAccess(file);const {ticket}=access.session();assert.equal(access.mode,'agent');assert.equal(await access.automate(async()=>42),42);
 await access.take(ticket);assert.equal(access.canInput(ticket),true);await assert.rejects(access.automate(async()=>99));
 const restarted=new BrowserAccess(file);assert.equal(restarted.mode,'human');const fresh=restarted.session().ticket;assert.equal(restarted.canInput(fresh),false);
 restarted.release(fresh);assert.equal(await restarted.automate(async()=>7),7);assert.equal(JSON.parse(readFileSync(file)).mode,'agent');
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('takeover waits for an in-flight action and rejects queued actions',async()=>{
 const a=new BrowserAccess();const {ticket}=a.session();let finish;
 const action=a.automate(()=>new Promise(resolve=>{finish=resolve;}));await new Promise(resolve=>setImmediate(resolve));
 const takeover=a.take(ticket);assert.equal(a.mode,'handoff');assert.equal(a.canInput(ticket),false);let ran=false;const blocked=a.automate(async()=>{ran=true;});
 finish(1);await action;await takeover;await assert.rejects(blocked);assert.equal(ran,false);assert.equal(a.canInput(ticket),true);
});
test('corrupt saved lock fails closed and expired sessions cannot control',async()=>{
 const home=mkdtempSync(join(tmpdir(),'sal-browser-lock-'));try{const file=join(home,'control.json');writeFileSync(file,'invalid');const a=new BrowserAccess(file);assert.equal(a.mode,'human');const{ticket}=a.session();a.sessions.get(ticket).expires=0;assert.equal(a.valid(ticket),false);assert.throws(()=>a.release(ticket));}finally{rmSync(home,{recursive:true,force:true});}
});
test('RFB input is blocked server-side while viewing and enabled only for the controller',()=>{
 const packets=[];let owner=false;const filter=rfbInputFilter(()=>owner,p=>packets.push(Buffer.from(p)));
 filter(Buffer.from('RFB 003.008\n'));filter(Buffer.from([1,1]));
 const key=Buffer.from([4,1,0,0,0,0,0,97]);filter(key);assert.equal(packets.length,3);
 owner=true;filter(key.subarray(0,3));filter(key.subarray(3));assert.equal(packets.length,4);
 owner=false;filter(Buffer.from([5,1,0,10,0,10]));assert.equal(packets.length,4);
 const update=Buffer.from([3,1,0,0,0,0,0,10,0,10]);filter(update);assert.equal(packets.length,5);
});
test('authentication and private network policy reject unsafe addresses',()=>{
 assert.equal(equalSecret('abc','abc'),true);assert.equal(equalSecret('abc','x'),false);assert.equal(equalSecret('',''),false);
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','100.100.100.100','::1','fc00::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('1.1.1.1'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
});
test('real proxy rejects localhost and cloud metadata even with a crafted Host header',async()=>{
 const server=await startEgressProxy(0);const port=server.address().port;
 const {request}=await import('node:http');
 try{for(const target of ['http://127.0.0.1:80/secret','http://169.254.169.254/latest/meta-data/']){const status=await new Promise((resolve,reject)=>{const r=request({host:'127.0.0.1',port,path:target,headers:{host:'public.example'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end();});assert.equal(status,403);}}
 finally{await new Promise(resolve=>server.close(resolve));}
});
