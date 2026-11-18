import {randomBytes,timingSafeEqual} from 'node:crypto';
import fs from 'node:fs';
export function equalSecret(actual,expected){return !!actual&&!!expected&&Buffer.byteLength(actual)===Buffer.byteLength(expected)&&timingSafeEqual(Buffer.from(actual),Buffer.from(expected));}
export class BrowserAccess {
 constructor(file){this.file=file;this.sessions=new Map();this.mode='agent';this.controller=null;this.tail=Promise.resolve();if(file&&fs.existsSync(file)){try{this.mode=JSON.parse(fs.readFileSync(file,'utf8')).mode==='agent'?'agent':'human';}catch{this.mode='human';}}}
 persist(){if(this.file)fs.writeFileSync(this.file,JSON.stringify({mode:this.mode==='agent'?'agent':'human'}),{mode:0o600});}
 session(){for(const [id,s] of this.sessions)if(s.expires<Date.now())this.sessions.delete(id);const ticket=randomBytes(32).toString('base64url');const expires=Date.now()+30*60*1000;this.sessions.set(ticket,{expires});return{ticket,expiresAt:new Date(expires).toISOString()};}
 valid(ticket){const s=this.sessions.get(ticket);return !!s&&s.expires>Date.now();}
 canInput(ticket){return this.valid(ticket)&&this.mode==='human'&&this.controller===ticket;}
 async take(ticket,onTakeover=async()=>{}){if(!this.valid(ticket))throw Error('Session expired.');this.mode='handoff';this.controller=ticket;this.persist();await this.tail;await onTakeover();this.mode='human';this.persist();return{mode:this.mode};}
 release(ticket){if(!this.valid(ticket))throw Error('Session expired.');if(this.mode==='handoff')throw Error('Handoff is still in progress.');this.controller=null;this.mode='agent';this.persist();return{mode:this.mode};}
 automate(action){const job=this.tail.then(async()=>{if(this.mode!=='agent')throw Error('The owner has control. Ask them to Return to Sal before continuing.');return action();});this.tail=job.catch(()=>{});return job;}
}

/** Parse client RFB messages: read-only viewers cannot bypass the takeover lock. */
export function rfbInputFilter(canInput,write){
 let phase=0,buffer=Buffer.alloc(0);
 return data=>{buffer=Buffer.concat([buffer,data]);if(buffer.length>4*1024*1024)throw Error('RFB message too large.');
 while(buffer.length){
  let length,input=false;
  if(phase===0){length=12;if(buffer.length<length)return;if(!buffer.subarray(0,12).toString().match(/^RFB 003\.008\n$/))throw Error('Unsupported RFB protocol.');phase=1;}
  else if(phase===1){length=1;if(buffer[0]!==1)throw Error('Unsupported RFB security.');phase=2;}
  else if(phase===2){length=1;phase=3;}
  else {const type=buffer[0];
   if(type===0)length=20;
   else if(type===2){if(buffer.length<4)return;length=4+buffer.readUInt16BE(2)*4;}
   else if(type===3)length=10;
   else if(type===4){length=8;input=true;}
   else if(type===5){length=6;input=true;}
   else if(type===6){if(buffer.length<8)return;length=8+Math.abs(buffer.readInt32BE(4));input=true;}
   else if(type===150)length=10;
   else if(type===248){if(buffer.length<9)return;length=9+buffer[8];}
   else if(type===251){if(buffer.length<8)return;length=8+buffer[6]*16;input=true;}
   else if(type===255){length=12;input=true;}
   else throw Error('Unsupported RFB message.');
  }
  if(length>4*1024*1024)throw Error('RFB message too large.');if(buffer.length<length)return;
  const packet=buffer.subarray(0,length);buffer=buffer.subarray(length);
  if(!input||canInput())write(packet);
 }
 };
}
