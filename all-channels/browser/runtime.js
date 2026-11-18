import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';
import {resolvePublicTarget} from './egress.js';
import {startDesktopChrome,CDP_ENDPOINT} from './desktop-chrome.js';

export async function launchBrowser(home){
 const profile=path.join(home,'profile');const downloads=path.join(home,'downloads');
 const desktop=await startDesktopChrome(profile,downloads);
 let browser=null,context=null,connection=null,detaching=false,restored=false;
 const ids=new Map();let selected=null;let refs=new Map();
 let closing=false,restoring=true;
 const tabsFile=path.join(home,'tabs.json');let savedTabs=[];
 try { const saved=JSON.parse(fs.readFileSync(tabsFile,'utf8')); if(Array.isArray(saved))savedTabs=saved.filter(url=>typeof url==='string'&&/^https?:\/\//.test(url)).slice(0,50); } catch {}
 const persistTabs=()=>{if(closing||restoring||detaching||!context)return;try{const urls=context.pages().filter(p=>!p.isClosed()).map(p=>p.url()).filter(url=>{try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}});fs.writeFileSync(tabsFile+'.tmp',JSON.stringify(urls),{mode:0o600});fs.renameSync(tabsFile+'.tmp',tabsFile);}catch{}};

 const id=page=>{if(!ids.has(page))ids.set(page,randomUUID());return ids.get(page);};
 function attach(page){id(page);page.on('framenavigated',frame=>{if(frame===page.mainFrame())persistTabs();});page.on('dialog',dialog=>dialog.dismiss().catch(()=>{}));page.on('download',download=>{const name=download.suggestedFilename().replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);download.saveAs(path.join(home,'downloads',randomUUID()+'-'+name)).catch(()=>{});});page.on('close',()=>{ids.delete(page);if(selected===page)selected=null;persistTabs();});}
 async function ensureConnected(){
  if(browser?.isConnected()&&context)return context;
  if(connection)return connection;
  connection=(async()=>{
   browser=await chromium.connectOverCDP(CDP_ENDPOINT,{isLocal:true,noDefaults:true,timeout:10000});
   context=browser.contexts()[0];if(!context)throw Error('Desktop browser context unavailable.');
   context.setDefaultTimeout(2000);context.setDefaultNavigationTimeout(10000);
   context.pages().forEach(attach);context.on('page',attach);
   if(!restored){
    const existing=new Set(context.pages().map(p=>p.url()));
    // Chrome may open a startup page instead of the saved session. Restore missing tabs without closing any current tabs.
    {
     const restore=[];let reusable=context.pages().find(p=>p.url()==='about:blank'||p.url()==='chrome://newtab/');
     for(const url of savedTabs){if(existing.has(url))continue;const page=reusable||await context.newPage();reusable=null;existing.add(url);restore.push(page.goto(url,{waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{}));}
     await Promise.all(restore);
    }
    restored=true;
   }
   restoring=false;persistTabs();
   selected=context.pages().find(p=>/^https?:\/\//.test(p.url()))||context.pages()[0]||await context.newPage();
   return context;
  })();
  try{return await connection;}finally{connection=null;}
 }
 async function detach(){
  persistTabs();detaching=true;
  const attached=browser;browser=null;context=null;selected=null;refs.clear();ids.clear();
  try{await attached?.close();}catch{}finally{detaching=false;}
 }
 const safeUrl=raw=>{try{const u=new URL(raw);for(const key of [...u.searchParams.keys()])if(/token|code|secret|password|credential/i.test(key))u.searchParams.set(key,'[redacted]');u.hash='';return u.href;}catch{return 'about:blank';}};
 return {isAttached:()=>!!browser?.isConnected(),detach,onExit:handler=>desktop.child.once('exit',()=>{if(!closing)handler();}),async close(){persistTabs();await detach();closing=true;await desktop.stop();},async action(input){
  await ensureConnected();
  const pages=context.pages();
  if (!input.tabId) {
    for (const candidate of pages) { try { if (await candidate.evaluate(() => document.hasFocus())) { selected = candidate; break; } } catch {} }
  }
  if(input.tabId){selected=pages.find(p=>id(p)===input.tabId);if(!selected)throw Error('Tab not found. Refresh the tab list.');}
  const page=selected&&!selected.isClosed()?selected:pages[0]||await context.newPage();selected=page;
  if(input.op==='tabs')return{tabs:await Promise.all(context.pages().map(async p=>({id:id(p),url:safeUrl(p.url()),title:await p.title()}))),selected:id(page)};
  await page.bringToFront();
  if(input.op==='navigate'){const url=new URL(input.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use a public HTTP or HTTPS URL.');await resolvePublicTarget(url.hostname,Number(url.port||(url.protocol==='https:'?443:80)));refs.clear();await page.goto(url.href,{waitUntil:'domcontentloaded'});return{tabId:id(page),url:safeUrl(page.url()),title:await page.title()};}
  if(input.op==='new_tab'){selected=await context.newPage();return{tabId:id(selected)};}
  if(input.op==='close_tab'){await page.close();return{closed:true};}
  if(input.op==='snapshot'){
   refs=new Map();const frames=[];
   for(const [i,frame]of page.frames().slice(0,6).entries()){
    try{const data=await frame.evaluate(()=>{const elements=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').slice(0,50);return{text:document.body?.innerText.slice(0,5000)||'',elements:elements.map((e,n)=>{const ref='e'+n;e.setAttribute('data-sal-ref',ref);return{ref,tag:e.tagName.toLowerCase(),name:(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.innerText||e.getAttribute('name')||'').slice(0,160),type:e.getAttribute('type')||undefined};})};});for(const element of data.elements){const key='f'+i+':'+element.ref;refs.set(key,{frame,ref:element.ref});element.ref=key;}frames.push({frame:'f'+i,...data});}catch{}
   }
   return{tabId:id(page),url:safeUrl(page.url()),title:await page.title(),frames};
  }
  if(input.op==='click'||input.op==='type'){
   const ref=refs.get(input.ref);if(!ref||ref.frame.isDetached())throw Error('Element reference expired. Get a new snapshot.');const locator=ref.frame.locator('[data-sal-ref="'+ref.ref+'"]');
   if(input.op==='click')await locator.click({timeout:1500});else{const type=await locator.getAttribute('type');if(type==='password')throw Error('Ask the owner to Take control to enter their password.');await locator.fill(input.text,{timeout:1500});}
   return{done:true,tabId:id(page)};
  }
  if(input.op==='press'){if(!/^(Enter|Tab|Escape|Backspace|ArrowDown|ArrowUp|ArrowLeft|ArrowRight|Space|PageDown|PageUp|Home|End)$/.test(input.key))throw Error('Unsupported key.');await page.keyboard.press(input.key);return{done:true};}
  if(input.op==='scroll'){await page.mouse.wheel(0,input.direction==='up'?-600:600);return{done:true};}
  throw Error('Unknown browser action.');
 }};
}
