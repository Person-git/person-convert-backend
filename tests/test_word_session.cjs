const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {KEY,preferences,readPreferences,savePreferences,ResultVault,highlightBox}=require('../frontend/word-session.js');
const stored=new Map(),storage={getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
savePreferences(storage,{language:'eng',quality:'look',filename:'private.pdf',password:'secret',mode:'layout'});
assert.deepEqual(JSON.parse(stored.get(KEY)),{language:'eng',quality:'look'});
assert.deepEqual(readPreferences(storage),{language:'eng',quality:'look'});stored.set(KEY,'broken');assert.deepEqual(readPreferences(storage),preferences(null));
assert.deepEqual(preferences({language:'bad',quality:'bad'}),preferences(null));assert.equal(savePreferences({setItem(){throw Error('blocked');}},{}),false);
const revoked=[],urls={createObjectURL:()=>`blob:${revoked.length}`,revokeObjectURL:u=>revoked.push(u)},vault=new ResultVault(urls);
const first=vault.set(new Blob(['public']),'public.docx');assert.equal(vault.url,first);vault.set(new Blob(['next']),'next.docx');assert.deepEqual(revoked,[first]);vault.clear();assert.equal(vault.url,null);assert.equal(revoked.length,2);assert.throws(()=>vault.set({size:129*1024*1024},'large'),/128 MB/);
assert.deepEqual(highlightBox({sourceWidth:1200,sourceHeight:1600,bbox:{x0:120,y0:320,x1:360,y1:480}}),{x:.1,y:.2,width:.19999999999999998,height:.09999999999999998});
assert.equal(highlightBox({sourceWidth:0,sourceHeight:10,bbox:{x0:1,y0:1,x1:5,y1:5}}),null);assert.equal(highlightBox({sourceWidth:10,sourceHeight:10,bbox:{x0:20,y0:1,x1:25,y1:5}}),null);
class El{constructor(tag='div'){this.tag=tag;this.children=[];this.handlers={};this.value='';this.hidden=true;this.textContent='';this.attrs={};this.width=0;this.height=0;}addEventListener(k,f){this.handlers[k]=f;}replaceChildren(...a){this.children=a;}append(...a){this.children.push(...a);}click(){this.onclick?.({preventDefault(){}});}remove(){}removeAttribute(k){delete this[k];}setAttribute(k,v){this.attrs[k]=v;}scrollIntoView(){}getContext(){return {fillRect(){},strokeRect(){}};}}
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new El());return elements.get(id);},events={},pageEvents={};
stored.set(KEY,JSON.stringify({language:'eng',quality:'look'}));let changes=0,destroyed=0,cancelled=0,pending=[];
const root={AppTasks:{busy:false,downloaded(){}},updateWordOptions(){changes++;},WordTrial:{clear(){}},OCRWord:{clearReview(){}},addEventListener:(k,f)=>pageEvents[k]=f,pdfjsLib:{getDocument(){let resolve;const promise=new Promise(r=>resolve=r);pending.push(resolve);return {promise,destroy:async()=>{destroyed++;}};}}};
const context={window:root,document:{getElementById:el,createElement:t=>new El(t),body:new El(),addEventListener:(k,f)=>events[k]=f},localStorage:storage,URL:urls,Uint8Array};vm.runInNewContext(fs.readFileSync('frontend/word-session.js','utf8'),context);events.DOMContentLoaded();
assert.equal(el('ocr-language').value,'eng');assert(el('word-preserve').checked);assert(changes>0);
const session=root.WordSession;session.setFile({arrayBuffer:async()=>new ArrayBuffer(2)});session.publish(new Blob(['public']),'test.docx');assert(!el('word-result').hidden);assert(el('word-result-download').href);
session.start();assert(el('word-result').hidden);assert.equal(el('word-result-download').href,undefined);
const html=fs.readFileSync('frontend/index.html','utf8');assert(html.includes('WordSession.publish(xhr.response'));assert(html.includes('WordSession?.setFile(file)'));assert(html.includes('WordSession?.start()'));for(const path of ['frontend/local-convert.js','frontend/ocr-word.js'])assert(fs.readFileSync(path,'utf8').includes('WordSession.publish(blob'));
const item={page:1,text:'Public',sourceWidth:1200,sourceHeight:1600,bbox:{x0:120,y0:320,x1:360,y1:480}};
async function run(){
 const old=session.locate(item);await new Promise(setImmediate);assert.equal(pending.length,1);session.setFile(null);pending[0]({getPage(){throw Error('stale request must not reach page');}});await old;assert(el('ocr-page-location').hidden);assert(destroyed>0);
 session.setFile({arrayBuffer:async()=>new ArrayBuffer(2)});const current=session.locate(item);await new Promise(setImmediate);pending[1]({getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve(),cancel(){cancelled++;}})})});await current;
 assert(el('ocr-page-caption').textContent.includes('原始 PDF'));const canvas=el('ocr-page-canvas').children[0];assert(canvas.width<=900&&canvas.height<=1200);session.closePreview();assert.equal(canvas.width,0);assert(el('ocr-page-location').hidden);
 session.publish(new Blob(['one']),'one.docx');pageEvents.pagehide();assert(el('word-result').hidden);assert.equal(el('word-result-download').href,undefined);
 el('word-preference-reset').onclick();assert.equal(stored.has(KEY),false);assert.equal(el('ocr-language').value,'chi_tra+eng');assert(!el('word-preserve').checked);
 console.log('Word result retention/revocation, private preference whitelist, original-page geometry, stale render cleanup and reset passed');
}
run().catch(e=>{console.error(e);process.exitCode=1;});

