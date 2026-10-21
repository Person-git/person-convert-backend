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

const anchor=(text,extra={})=>({text,fontFamily:'Times New Roman',fontSize:12,bold:true,italic:true,confidence:98,matched:true,...extra});
for(const short of ['Do','If','of','to','UV','a']){
 const sample=[anchor('before'),anchor(short,{fontFamily:'Arial',matched:false,fontSize:9,bold:false,italic:false}),anchor('after')];style.refineShortStyles(sample);assert.equal(sample[1].fontFamily,'Times New Roman');assert(sample[1].bold&&sample[1].italic);assert.equal(sample[1].fontSize,12);assert(sample[1].shortContext);
}
const beginning=[anchor('Do',{fontFamily:'Arial',matched:false}),anchor('not',{fontFamily:'Arial',matched:false}),anchor('resterilize')];style.refineShortStyles(beginning,[anchor('Verify'),anchor('integrity')]);assert(beginning[0].shortContext);
const mixed=[anchor('before'),anchor('of',{fontFamily:'Arial',matched:false}),anchor('after',{italic:false})];style.refineShortStyles(mixed);assert(!mixed[1].shortContext,'Mixed neighbour emphasis must remain mixed');
const emphasized=[anchor('before'),anchor('of',{italic:false}),anchor('after')];style.refineShortStyles(emphasized);assert(!emphasized[1].italic,'Matched same-family intentional emphasis is preserved');
const low=[anchor('before'),anchor('of',{fontFamily:'Arial',matched:false,confidence:20}),anchor('after')];style.refineShortStyles(low);assert(!low[1].shortContext,'Low OCR confidence is not promoted');

assert(beginning[1].shortContext,'Three-letter short words use corroborated nearby line style');

const regular=[anchor('before',{fontSize:12,bbox:{x0:0,y0:10,x1:30,y1:22}}),anchor('middle',{fontSize:11.5,bbox:{x0:35,y0:10,x1:65,y1:22}}),anchor('afterward',{fontSize:12.5,bbox:{x0:70,y0:10,x1:110,y1:22}}),anchor('of',{fontSize:11.5,bbox:{x0:115,y0:13,x1:125,y1:21}}),anchor('2',{fontSize:7,bbox:{x0:130,y0:3,x1:135,y1:10}})];style.normalizeLineSizes(regular);assert(regular.slice(0,4).every(w=>w.fontSize===12));assert.equal(regular[4].fontSize,7,'Superscript/small different-baseline text must not be enlarged');
