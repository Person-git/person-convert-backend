/* Cache only public application assets: never PDFs, passwords, outputs or API requests. */
const CACHE='person-convert-pwa-v23';
const LOCAL=['/','/index.html','/app-core.js','/lazy-pdf.js','/workspace-tools.js','/word-trial.js','/text-color.js','/page-structure.js','/manifest.json','/ocr-word.js','/ocr-layout.js','/ocr-style.js','/ocr-flow.js','/pdf-fidelity.js','/word-geometry.js','/pdf-guide.js','/local-convert.js','/local-compress.js','/protect-pdf.js','/unlock-worker.js','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png','/icons/apple-touch-icon.png'];
const LIBRARIES=[
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];
const OPTIONAL_PREFIXES=[
  'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0/',
  'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@87416418657359cb625c412a48b6e1d6d41c29bd/',
  'https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/'
];
function canCache(response){return response.ok;}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(LOCAL);
  await Promise.allSettled(LIBRARIES.map(async url=>{
    const response=await fetch(url,{mode:'cors'});if(canCache(response))await cache.put(url,response);
  }));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('person-convert-pwa-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);
  const local=url.origin===self.location.origin&&LOCAL.includes(url.pathname);
  const navigation=request.mode==='navigate'&&url.origin===self.location.origin&&['/','/index.html'].includes(url.pathname);
  const library=LIBRARIES.includes(url.href)||OPTIONAL_PREFIXES.some(prefix=>url.href.startsWith(prefix));
  if(!local&&!navigation&&!library)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(library){const cached=await cache.match(request);if(cached)return cached;}
    try{
      const response=await fetch(library?new Request(request.url,{mode:'cors',credentials:'omit'}):request);
      if(canCache(response))await cache.put(navigation?'/':request,response.clone()).catch(()=>{});
      return response;
    }catch(error){
      const cached=await cache.match(navigation?'/':request)||(!library&&local?await cache.match(url.pathname):null);if(cached)return cached;
      return new Response('此功能所需套件尚未下載，請先連線使用一次。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});

self.addEventListener('message',event=>{if(event.data==='APP_VERSION')event.ports[0]?.postMessage(CACHE);});
