const assert=require('assert');
const ocr=require('../frontend/ocr-word.js');
async function exercise(){
  const xml=ocr.documentXml(['A & B <test>\nSecond line\n\nNew paragraph','Page two\u0001']);
  assert(xml.includes('A &amp; B &lt;test&gt;'));
  assert(xml.includes('<w:br/>'));
  assert.equal((xml.match(/pageBreakBefore/g)||[]).length,1);
  assert(!xml.includes('\u0001'));
  const files={};
  class FakeZip{file(name,text){files[name]=text;}async generateAsync(options){assert.equal(options.type,'blob');return 'DOCX';}}
  assert.equal(await ocr.createDocx(['Editable English text'],FakeZip),'DOCX');
  assert(files['[Content_Types].xml'].includes('word/document.xml'));
  assert(files['_rels/.rels'].includes('officeDocument'));
  assert(files['word/document.xml'].includes('Editable English text'));
  const canvases=[], stages=[], pageCleaned=[];
  let inFlight=0,maxFlight=0;
  const worker={recognize:async canvas=>{inFlight++;maxFlight=Math.max(maxFlight,inFlight);assert(canvas.width<=4096&&canvas.height<=4096);await Promise.resolve();inFlight--;return {data:{text:'Recognized page'}};}};
  const pdf={numPages:3,getPage:async number=>({getViewport:({scale})=>({width:600*scale,height:900*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup:()=>pageCleaned.push(number)})};
  const canvas=()=>{const c={width:0,height:0,getContext:()=>({})};canvases.push(c);return c;};
  const result=await ocr.recognizePages(pdf,worker,canvas,(...s)=>stages.push(s),new AbortController().signal);
  assert.equal(result.length,3);assert.equal(maxFlight,1);
  assert.deepEqual(pageCleaned,[1,2,3]);
  assert(canvases.every(c=>c.width===0&&c.height===0));
  assert.equal(stages.filter(s=>s[2]==='done').length,3);
  const structuredWorker={recognize:async(c,parameters,output)=>{assert.deepEqual(output,{text:true,blocks:true});return {data:{text:'First line\ncontinues.',blocks:[{paragraphs:[{lines:[{text:'First line',bbox:{x0:10,y0:10,x1:150,y1:30}},{text:'continues.',bbox:{x0:10,y0:40,x1:150,y1:60}}]}]}]}};}};
  const joined=await ocr.recognizePages({...pdf,numPages:1},structuredWorker,canvas,()=>{},new AbortController().signal);
  assert.equal(joined[0],'First line continues.');
  const raw=await ocr.recognizePages({...pdf,numPages:1},{recognize:async(c,p,output)=>{assert.deepEqual(output,{text:true});return {data:{text:'Original\nlines'}};}},canvas,()=>{},new AbortController().signal,false,false);
  assert.equal(raw[0],'Original\nlines');
  const controller=new AbortController();
  const pending=ocr.recognizePages({...pdf,numPages:1},{recognize:()=>{controller.abort();return new Promise(()=>{});}},canvas,()=>{},controller.signal);
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(canvases.at(-1).width,0);
  console.log('Editable DOCX structure, escaping, page boundaries, sequential memory cleanup and cancellation passed');
}
exercise().catch(error=>{console.error(error);process.exitCode=1;});
