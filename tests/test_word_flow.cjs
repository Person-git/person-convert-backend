const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('frontend/index.html','utf8');
const start=html.indexOf('let docxFile=null'),end=html.indexOf('/* ---------- 10: PDF -> Excel',start);
const elements=new Map(),calls=[],statuses=[];
function el(id){if(!elements.has(id))elements.set(id,{value:id==='docx-mode'?'auto':'',selectedOptions:[{textContent:'manual'}],disabled:false,hidden:true,dataset:{},children:[],focus(){}});return elements.get(id);}
let remove;
const context={document:{getElementById:el},window:{},PdfGuide:{clear(){},inspect:file=>file.inspection},setStatus:(id,text)=>statuses.push(text),renderList:(id,files,onRemove)=>{el(id).children=files;remove=onRemove;},setupDropzone(){},OCRWord:{runFile:async file=>calls.push(['ocr',file.name])},LocalConvert:{run:async(kind,file)=>calls.push(['local',file.name])},runBackendConvert:async(id,status,action)=>action(),callBackendConvert:async(path,file)=>calls.push(['backend',file.name])};
vm.createContext(context);vm.runInContext(html.slice(start,end),context);
const choose=context.window.chooseWordFile,button=el('btn-docx'),mode=el('docx-mode');
const flush=()=>Promise.resolve();
function file(name,kind){return {name:name+'.pdf',type:'application/pdf',size:100,inspection:Promise.resolve(kind?{kind}:undefined)};}
(async()=>{
  choose(file('text','text'));assert(button.disabled);await flush();assert(!button.disabled);assert(el('word-ocr-options').hidden);
  await button.onclick();assert.deepEqual(calls.pop(),['local','text.pdf']);
  choose(file('scan','ocr'));await flush();assert(!el('word-ocr-options').hidden);
  await button.onclick();assert.deepEqual(calls.pop(),['ocr','scan.pdf']);
  choose(file('mixed','mixed'));await flush();await button.onclick();assert.equal(calls.pop()[0],'ocr');
  choose(file('failed'));await flush();assert(button.disabled);
  mode.value='ocr';mode.onchange();assert(!button.disabled);await button.onclick();assert.equal(calls.pop()[0],'ocr');
  mode.value='auto';let late;choose({...file('old'),inspection:new Promise(resolve=>late=resolve)});choose(file('new','text'));await flush();late({kind:'ocr'});await flush();await button.onclick();assert.deepEqual(calls.pop(),['local','new.pdf']);
  mode.value='layout';mode.onchange();await button.onclick();assert.deepEqual(calls.pop(),['backend','new.pdf']);
  mode.value='ocr';let finish;context.OCRWord.runFile=async()=>{calls.push(['held']);await new Promise(resolve=>finish=resolve);};
  el('word-look').onchange();assert(el('word-preserve').checked);assert(el('word-look').checked);assert(!el('word-fast').checked);
  const running=button.onclick();assert(mode.disabled);assert(el('word-preserve').disabled);choose(file('ignored','text'));remove();await button.onclick();assert.equal(calls.filter(c=>c[0]==='held').length,1);finish();await running;assert(!mode.disabled);assert(!el('word-preserve').disabled);
  assert(!el('word-fast').disabled);el('word-fast').onchange();assert(!el('word-preserve').checked);assert.equal(el('ocr-output-mode').value,'text');
  remove();assert(button.disabled);assert.equal(el('list-docx').children.length,0);
  const numbers=[...html.matchAll(/class="idx">(\d+) \//g)].map(m=>Number(m[1]));assert.deepEqual(numbers,Array.from({length:14},(_,i)=>i+1));
  assert(!html.includes('id="input-ocr-word"'));assert(!html.includes('id="btn-ocr-word"'));
  console.log('Unified Word routing, manual override, stale inspection, busy lock, removal and consecutive numbering passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
