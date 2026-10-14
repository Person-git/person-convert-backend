const fs=require('fs'), vm=require('vm'), assert=require('assert');
const html=fs.readFileSync('frontend/index.html','utf8');
const source=html.slice(html.indexOf('async function callBackendConvert('),html.indexOf('/* ---------- 09: PDF -> Word'));
async function exercise(){
  const states=[], elements=new Map();
  const button={dataset:{},disabled:false};
  let mode='success', downloads=0, requests=0;
  function element(){ return {children:[{}],hidden:false,attrs:{},before(p){elements.set(p.id,p);},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];if(k==='value') this.value=undefined;}}; }
  class FakeXHR {
    constructor(){this.upload={};this.status=200;}
    open(method,url){assert.equal(method,'POST');this.url=url;}
    getResponseHeader(name){return name==='X-Conversion-Seconds'?'1.234':null;}
    send(){
      requests++;
      queueMicrotask(()=>{
        this.upload.onprogress({lengthComputable:true,loaded:50,total:100});
        this.upload.onload();
        if(mode==='timeout'){this.ontimeout();return;}
        if(mode==='network'){this.onerror();return;}
        this.onprogress({lengthComputable:false});
        this.onprogress({lengthComputable:true,loaded:75,total:100});
        this.status=mode==='error'?422:200;
        this.response=new Blob([mode==='error'?JSON.stringify({detail:'需要 OCR'}):'output']);
        this.onload();
      });
    }
  }
  const context={
    document:{getElementById:id=>{
      if(id.startsWith('btn-'))return button;
      if(id.endsWith('-progress'))return elements.get(id)||null;
      if(!elements.has(id))elements.set(id,element());return elements.get(id);
    },createElement:()=>element()},
    XMLHttpRequest:FakeXHR, FormData:class{append(){}},getApiBase:()=> 'https://example.invalid',
    setInterval,clearInterval,performance,
    setStatus:(id,msg,error)=>states.push({msg,error,value:elements.get(id+'-progress')?.value}),
    download:()=>downloads++,formatBytes:n=>String(n),
  };
  vm.createContext(context);vm.runInContext(source,context);
  const run=()=>context.runBackendConvert('btn-docx','status-docx',p=>context.callBackendConvert('/convert/pdf-to-docx',{},'converted.docx','',p));
  await run();
  assert.equal(downloads,1);
  assert(states.some(s=>s.msg.startsWith('上傳中 50%')&&s.value===50));
  assert(states.some(s=>s.msg.includes('伺服器轉換中')&&s.value===undefined));
  assert(states.some(s=>s.msg.startsWith('下載中 75%')&&s.value===75));
  assert(states.at(-1).msg.includes('完成 100%'));
  assert(states.at(-1).msg.includes('伺服器轉換 1.2 秒'));
  assert.equal(elements.get('status-docx-progress').value,100);
  for(const next of ['error','timeout','network']){
    mode=next;await run();
    assert(states.at(-1).error);
    assert.equal(elements.get('status-docx-progress').hidden,true);
    assert.equal(button.disabled,false);
    assert.equal(button.dataset.busy,undefined);
  }
  assert.equal(downloads,1);
  let resolve;
  const pending=context.runBackendConvert('btn-docx','status-docx',()=>new Promise(r=>resolve=r));
  await context.runBackendConvert('btn-docx','status-docx',()=>{throw Error('duplicate');});
  assert.equal(button.disabled,true);resolve({});await pending;
  assert.equal(button.disabled,false);
  console.log('Upload/download percentages, indeterminate conversion, completion, errors, timeout and duplicate-click checks passed');
}
exercise().catch(e=>{console.error(e);process.exitCode=1;});
