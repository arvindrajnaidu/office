import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {setTimeout as sleep} from 'node:timers/promises';
import {startSchedulerWorker} from './scheduler-worker.js';

test('polls with channel authentication, serializes requests, and stops cleanly',async()=>{
 let requests=0,active=0,maxActive=0;
 const server=createServer(async(req,res)=>{
   assert.equal(req.url,'/api/channel/scheduler/test-merchant');
   assert.equal(req.headers.authorization,'Bearer test-token');
   requests++;active++;maxActive=Math.max(maxActive,active);
   await sleep(20);active--;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'idle'}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const worker=startSchedulerWorker({backendUrl:`http://127.0.0.1:${server.address().port}/api/channel/chat/test-merchant`,token:'test-token',intervalMs:5,onStatus:()=>{}});
 try{for(let i=0;i<100&&requests<3;i++)await sleep(10);assert.ok(requests>=3);assert.equal(maxActive,1);}
 finally{worker.stop();await worker.done;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('backs off after backend failures and resumes polling',async()=>{
 let requests=0;const messages=[];
 const server=createServer((req,res)=>{requests++;res.statusCode=requests===1?503:200;res.end(JSON.stringify({status:'idle'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const worker=startSchedulerWorker({backendUrl:`http://127.0.0.1:${server.address().port}/api/channel/chat/test`,token:'test-token',intervalMs:5,onStatus:m=>messages.push(m)});
 try{for(let i=0;i<100&&requests<3;i++)await sleep(10);assert.ok(requests>=3);assert.ok(messages.some(m=>m.includes('retrying')));}
 finally{worker.stop();await worker.done;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('rejects missing auth and unexpected backend paths',()=>{
 assert.throws(()=>startSchedulerWorker({backendUrl:'https://hawk.business/api/channel/chat/id'}));
 assert.throws(()=>startSchedulerWorker({backendUrl:'https://hawk.business/not-a-channel',token:'test-token'}));
});
