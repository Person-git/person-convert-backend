const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {Results}=require('../frontend/download-results.js');
let n=0;const revoked=[],urls={createObjectURL:()=>`blob:result-${++n}`,revokeObjectURL:u=>revoked.push(u)},store=new Results(urls,200);
const a=store.put('pdf','pdf',{size:90},'out.pdf').item;
store.put('excel','excel',{size:90},'out.xlsx');const b=store.put('svg','svg',{size:30},'out.svg');
assert.deepEqual(b.evicted,['pdf']);assert(revoked.includes(a.url));assert(store.items.has('excel'));
const x=store.items.get('excel').url;store.put('excel','excel',{size:20},'new.xlsx');assert(revoked.includes(x));
store.put('excel:review','excel',{size:10},'review.txt');store.clearOwner('excel');assert.deepEqual([...store.items.keys()],['svg']);
assert.throws(()=>store.put('big','big',{size:129*1024*1024},'big.zip'),/128 MB/);store.clearAll();assert.equal(store.items.size,0);
class El{constructor(){this.dataset={};this.children=[];this.hidden=false;this.attrs={};}append(...nodes){this.children.push(...nodes);}removeAttribute(k){delete this[k];}remove(){}click(){this.onclick?.({preventDefault(){}});}}
const sheet=new El(),events={},root={AppTasks:{owner:'tool-11',busy:false,check(){},downloaded(){}},addEventListener:(e,f)=>events[e]=f};
vm.runInNewContext(fs.readFileSync('frontend/download-results.js','utf8'),{window:root,URL:urls,document:{getElementById:id=>id==='tool-11'?sheet:null,createElement:()=>new El(),createTextNode:s=>s,body:new El()}});
root.DownloadResults.publish({size:10},'output.xlsx');const panel=sheet.children[0],link=panel.children[2];assert.equal(link.download,'output.xlsx');const url=link.href;
link.click();assert.equal(link.href,url);root.DownloadResults.publish({size:12},'output.zip');assert(revoked.includes(url));assert.equal(sheet.children.length,1);assert.equal(link.download,'output.zip');
root.DownloadResults.clearOwner('tool-11');assert(panel.hidden);assert.equal(link.href,undefined);
root.DownloadResults.publish({size:10},'out.svg');events.pagehide();assert(panel.hidden);assert.equal(link.href,undefined);
const html=fs.readFileSync('frontend/index.html','utf8'),core=fs.readFileSync('frontend/app-core.js','utf8');assert(html.includes('DownloadResults.publish(blob,filename)'));assert(html.includes("clearOwner(dz.closest('.sheet').id)"));assert(core.includes('clearOwner(owner)'));assert(core.includes('get owner()'));
console.log('Cross-format result replacement, owner isolation, bounded eviction, URL revocation, repeat download and page lifecycle passed');
