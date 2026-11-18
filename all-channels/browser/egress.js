import http from 'node:http';
import net from 'node:net';
import {lookup} from 'node:dns/promises';

export function publicAddress(ip){
 if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&[0,168].includes(b))||(a===100&&b>=64&&b<=127)||(a===198&&[18,19].includes(b)));}
 if(net.isIPv6(ip)){const lower=ip.toLowerCase();if(lower.startsWith('::ffff:'))return publicAddress(lower.slice(7));return /^2[0-9a-f]{3}:/.test(lower)&&!lower.startsWith('2001:db8:');}
 return false;
}
export async function resolvePublicTarget(host,port){
 host=host.replace(/^\[|\]$/g,'');if(![80,443].includes(port))throw Error('Only public HTTP and HTTPS are supported.');
 const addresses=await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Private network addresses are blocked.');
 return addresses.find(a=>a.family===4)||addresses[0];
}
export async function startEgressProxy(port=7080){
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url);if(url.protocol!=='http:')throw Error('Unsupported URL.');const address=await resolvePublicTarget(url.hostname,Number(url.port||80));
  const headers={...req.headers,host:url.host};delete headers['proxy-authorization'];delete headers['proxy-connection'];
  const upstream=http.request({hostname:address.address,family:address.family,port:Number(url.port||80),path:url.pathname+url.search,method:req.method,headers,timeout:20000},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
  upstream.on('error',()=>res.destroy());req.pipe(upstream);
 }catch{res.writeHead(403).end('Browser network policy blocked this address.');}});
 server.on('connect',async(req,socket,head)=>{try{
  const url=new URL('https://'+req.url);const port=Number(url.port||443);const address=await resolvePublicTarget(url.hostname,port);
  const remote=net.connect({host:address.address,family:address.family,port});remote.once('connect',()=>{socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)remote.write(head);socket.pipe(remote);remote.pipe(socket);});
  remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());
 }catch{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server;
}
