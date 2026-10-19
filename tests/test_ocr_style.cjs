const assert=require('assert'),style=require('../frontend/ocr-style.js'),layout=require('../frontend/ocr-layout.js');
const rgba=new Uint8ClampedArray(5*5*4).fill(255);rgba[(2*5+1)*4]=rgba[(2*5+1)*4+1]=rgba[(2*5+1)*4+2]=0;
assert.deepEqual(style.inkBounds(rgba,5,5),{x:1,y:2,width:1,height:1});
assert.equal(style.inkBounds(new Uint8ClampedArray(16).fill(255),2,2),null);
assert.equal(style.distance([0,1,0],[0,1,0]),0);assert(style.distance([0,1,0],[1,0,0])>.9);
const ranked=style.rank([{score:.1,bold:true,italic:false},{score:.12,bold:true,italic:false},{score:.3,bold:false,italic:false}]);
assert(ranked.bold);assert(Math.abs(ranked.margin-.2)<1e-8);
const words=[{text:'Normal',confidence:95,bbox:{x0:0,y0:0,x1:50,y1:20}},{text:'Bold',confidence:98,bbox:{x0:55,y0:0,x1:95,y1:20}}];
assert.deepEqual(layout.linesFromBlocks([{paragraphs:[{lines:[{text:'Normal Bold',bbox:{x0:0,y0:0,x1:95,y1:20},words}]}]}])[0].words,words);
const xml=layout.documentXml([{width:600,height:800,scale:1,lines:words.map((w,i)=>({...w,fontFamily:'Times New Roman',fontSize:12,bold:!!i,italic:!!i}))}]);
assert.equal((xml.match(/<w:b\/>/g)||[]).length,1);assert.equal((xml.match(/<w:i\/>/g)||[]).length,1);
assert(xml.includes('Normal'));assert(xml.includes('Bold'));assert(xml.includes('Times New Roman'));
(async()=>{
 const allocated=[];const canvas=()=>{const c={width:0,height:0,getContext:()=>({measureText:()=>({width:10})})};allocated.push(c);return c;};
 const control=new AbortController();control.abort();
 await assert.rejects(style.analyze(words,{},1,canvas,control.signal),{name:'AbortError'});
 assert(allocated.every(c=>!c.width&&!c.height));
 const duringYield=new AbortController();
 await assert.rejects(style.analyze([{text:''}],{},1,canvas,duringYield.signal,()=>duringYield.abort()),{name:'AbortError'});
 await style.yieldTask(); // Task ports must close, allowing this process to exit.
 console.log('OCR style bounds, matching, ambiguity, word geometry, mixed Word styles and cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
