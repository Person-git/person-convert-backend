const assert=require('assert'),ocr=require('../frontend/ocr-word.js');
const word=(text,confidence,y=100)=>({text,confidence,bbox:{x0:10,y0:y,x1:70,y1:y+10}});
const blocks=words=>[{paragraphs:[{lines:[{words}]}]}];
const words=[word('Unclear',42),word('Clear',95),word('12.5',76,200),word('?',20),word('No score',undefined),word('Unclear',42),word('<script>',20,300)];
const review=ocr.reviewWords(blocks(words),2,1000,[{runs:[{...words[0],rasterOnly:true,retainedReason:'頁尾'}]}]);
assert.equal(review.length,3);assert.equal(review[0].page,2);assert.equal(review[0].position,10);assert.equal(review[0].retained,'頁尾');
assert.equal(review[1].text,'12.5');assert.equal(review[2].text,'<script>');
assert(ocr.reviewText({total:3,items:review}).includes('信心分數不是正確率'));
assert(ocr.reviewText({total:3,items:review}).includes('保留原圖不可編輯'));
assert.equal(ocr.reviewWords(null,1,0).length,0);
(async()=>{
 const canvas=()=>({width:0,height:0,getContext:()=>({})});
 const pdf={numPages:2,getPage:async()=>({getViewport:({scale})=>({width:600*scale,height:800*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})};
 const result={total:0,items:[]};
 const worker={recognize:async(c,p,output)=>{assert(output.blocks);return {data:{text:'OCR text',blocks:blocks(Array.from({length:250},(_,i)=>word('item'+i,40,i)))}};}};
 const text=await ocr.recognizePages(pdf,worker,canvas,()=>{},new AbortController().signal,false,false,false,false,result);
 assert.deepEqual(text,['OCR text','OCR text']);assert.equal(result.total,500);assert.equal(result.items.length,200);
 console.log('OCR review confidence, geometry, retained regions, deduplication, numeric tokens and bounded collection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
