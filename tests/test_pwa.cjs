const fs=require('fs'),vm=require('vm'),assert=require('assert');
const handlers={},stored=new Map(),fetches=[];
const cache={match:async key=>stored.get(typeof key==='string'?key:key.url),put:async(key,value)=>stored.set(typeof key==='string'?key:key.url,value),addAll:async()=>{}};
const context={URL,Request,Response,Promise,caches:{open:async()=>cache},self:{location:{origin:'https://convert-bench.pages.dev'},addEventListener:(name,fn)=>handlers[name]=fn},fetch:async request=>{fetches.push(request);if(context.offline)throw Error('offline');return new Response('network');}};
vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/sw.js','utf8'),context);
function dispatch(url,method='GET',mode='cors'){
 let result;handlers.fetch({request:{url,method,mode},respondWith:p=>result=p});return result;
}
(async()=>{
 assert.equal(dispatch('https://person-convert-api.onrender.com/health'),undefined);
 assert.equal(dispatch('https://convert-bench.pages.dev/private.pdf'),undefined);
 assert.equal(dispatch('https://convert-bench.pages.dev/private.pdf','GET','navigate'),undefined);
 assert.equal(dispatch('https://convert-bench.pages.dev/','POST'),undefined);
 stored.set('/',new Response('cached shell'));context.offline=true;
 assert.equal(await(await dispatch('https://convert-bench.pages.dev/','GET','navigate')).text(),'cached shell');
 assert.equal((await dispatch('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js')).status,503);
 context.offline=false;assert.equal(await(await dispatch('https://convert-bench.pages.dev/','GET','navigate')).text(),'network');
 const url='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';stored.set(url,new Response('cached library'));
 const count=fetches.length;assert.equal(await(await dispatch(url)).text(),'cached library');assert.equal(fetches.length,count);
 const manifest=JSON.parse(fs.readFileSync('frontend/manifest.json','utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
 for(const icon of manifest.icons)assert(fs.existsSync('frontend/'+icon.src));
 console.log('PWA manifest, asset caching, offline fallback and private/API exclusion passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
