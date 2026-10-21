const assert=require('assert'),ocr=require('../frontend/ocr-word.js');
const word=(text,confidence,y=100)=>({text,confidence,bbox:{x0:10,y0:y,x1:70,y1:y+10}});
const blocks=words=>[{paragraphs:[{lines:[{words}]}]}];
const words=[word('Unclear',42),word('Clear',95),word('12.5',76,200),word('?',20),word('No score',undefined),word('Unclear',42),word('<script>',20,300)].map((w,i)=>({...w,bbox:{...w.bbox,x0:10+(i===5?0:i)*80,x1:70+(i===5?0:i)*80}}));
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

// High-confidence retained text and symbols are visible; overlap is source-only.
const retainedWord=word('Retained',99),symbol={...word('◆',98),bbox:{x0:100,y0:100,x1:110,y1:110}};
const overlapA={...word('first',95),bbox:{x0:10,y0:200,x1:60,y1:212}},overlapB={...word('second',96),bbox:{x0:54,y0:200,x1:100,y1:212}};
const hints=ocr.reviewWords(blocks([retainedWord,symbol,overlapA,overlapB]),1,800,[{runs:[{...retainedWord,rasterOnly:true},{...symbol,rasterOnly:true}]}]);
assert.equal(hints.length,4);assert.deepEqual(ocr.reviewCounts(hints),{low:0,retained:2,crowded:2});assert(ocr.reviewText({total:4,items:hints}).includes('非 Word 渲染判定'));
const close=[{...overlapA,bbox:{x0:10,y0:200,x1:60,y1:212}},{...overlapB,bbox:{x0:59.5,y0:200,x1:100,y1:212}}];assert.equal(ocr.reviewWords(blocks(close),1,800).length,0,'Subpixel overhang is not suspicious crowding');
const missing=word('missing',undefined);const missingHint=ocr.reviewWords(blocks([missing]),1,800,[{runs:[{...missing,rasterOnly:true}]}]);assert.equal(missingHint[0].confidence,null);assert(ocr.reviewText({total:1,items:missingHint}).includes('信心 未提供'));
// Exercise actual filtering/reset lifecycle without OCR or external documents.
class Element{constructor(){this.children=[];this.value='all';this.textContent='';}replaceChildren(){this.children=[];}append(...nodes){this.children.push(...nodes);}appendChild(n){this.children.push(n);} }
const elements=new Map(['ocr-review','ocr-review-list','ocr-review-summary','ocr-review-coverage','ocr-review-filter','btn-review-download'].map(id=>[id,new Element()]));
global.document={getElementById:id=>elements.get(id),createElement:()=>new Element()};
ocr.showReview({total:4,items:hints,pages:1},'public.pdf');assert.equal(elements.get('ocr-review-list').children.length,4);
const filter=elements.get('ocr-review-filter');filter.value='retained';filter.onchange();assert.equal(elements.get('ocr-review-list').children.length,2);filter.value='crowded';filter.onchange();assert.equal(elements.get('ocr-review-list').children.length,2);filter.value='low';filter.onchange();assert.equal(elements.get('ocr-review-list').children.length,1);assert(elements.get('ocr-review-list').children[0].textContent.includes('沒有此類'));
ocr.clearReview();assert.equal(filter.value,'all');assert.equal(filter.onchange,null);assert.equal(elements.get('btn-review-download').onclick,null);delete global.document;

const immutableBlocks=blocks([retainedWord,overlapA,overlapB]),immutableLines=[{runs:[{...retainedWord,rasterOnly:true}]}],before=JSON.stringify([immutableBlocks,immutableLines]);ocr.reviewWords(immutableBlocks,1,800,immutableLines);assert.equal(JSON.stringify([immutableBlocks,immutableLines]),before,'Review collection must never mutate conversion text/geometry/style');
