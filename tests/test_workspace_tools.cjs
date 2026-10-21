const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PagePlan,cropBox,previewRows,newerVersion}=require('../frontend/workspace-tools.js');
const p=new PagePlan(6);p.selected=new Set([1,3]);p.move(3,1);assert.deepEqual(p.pages(),[3,1]);p.rotate();assert.equal(p.turns.get(3),90);for(let i=0;i<3;i++)p.rotate();assert.equal(p.turns.get(1),0);p.remove();assert.deepEqual(p.order,[2,4,5,6]);p.reset(6);assert.deepEqual(p.pages(),[1,2,3,4,5,6]);assert.equal(p.turns.size,0);
assert.equal(cropBox({x0:NaN,y0:0,x1:3,y1:4},10,10),null);assert.equal(cropBox({x0:100,y0:0,x1:200,y1:4},10,10),null);const crop=cropBox({x0:0,y0:0,x1:10000,y1:1000},10000,1000);assert(crop.width<=360&&crop.height<=90);assert.equal(crop.x,0);
const rows=previewRows(Array.from({length:100},()=>Array(30).fill('<script>'.repeat(100))));assert.equal(rows.length,40);assert.equal(rows[0].length,20);assert.equal(rows[0][0].length,500);assert.equal(previewRows([['a',,2]])[0][1],'');
const html=fs.readFileSync('frontend/index.html','utf8');const split=html.slice(html.indexOf("document.getElementById('btn-split-range').onclick"),html.indexOf("document.getElementById('btn-split-all').onclick"));assert(!split.includes('PageTools.rotation'));assert(html.includes('PageTools.rotation(order[i])'));
const handlers={};vm.runInNewContext(fs.readFileSync('frontend/sw.js','utf8'),{self:{addEventListener:(type,fn)=>handlers[type]=fn},URL,Request});let version;handlers.message({data:'APP_VERSION',ports:[{postMessage:v=>version=v}]});assert.equal(version,'person-convert-pwa-v21');
console.log('Page selection/order/rotation/delete/reset, bounded OCR crops and table previews, range isolation and SW version handshake passed');

assert(newerVersion('person-convert-pwa-v22'));assert(!newerVersion('person-convert-pwa-v21'));assert(!newerVersion('person-convert-pwa-v11'));assert(!newerVersion('anything'));
