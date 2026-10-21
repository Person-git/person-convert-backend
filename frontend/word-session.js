(function(root){'use strict';
const KEY='boshen-word-preferences-v1';
function preferences(value){return {language:['chi_tra+eng','chi_sim+eng','eng'].includes(value?.language)?value.language:'chi_tra+eng',quality:value?.quality==='look'?'look':'fast'};}
function readPreferences(storage){try{return preferences(JSON.parse(storage.getItem(KEY)));}catch(_){return preferences(null);}}
function savePreferences(storage,value){try{storage.setItem(KEY,JSON.stringify(preferences(value)));return true;}catch(_){return false;}}
class ResultVault{
 constructor(urls){this.urls=urls;this.url=null;this.name='';}
 clear(){if(this.url)this.urls.revokeObjectURL(this.url);this.url=null;this.name='';}
 set(blob,name){this.clear();if(!blob||blob.size>128*1024*1024)throw Error('Word 結果超過可保留的 128 MB，請減少頁數');this.url=this.urls.createObjectURL(blob);this.name=name;return this.url;}
}
function highlightBox(item){
 const b=item.bbox,w=item.sourceWidth,h=item.sourceHeight;
 if(!b||![w,h,b.x0,b.y0,b.x1,b.y1].every(Number.isFinite)||w<=0||h<=0||b.x1<=b.x0||b.y1<=b.y0)return null;
 const x=Math.max(0,b.x0/w),y=Math.max(0,b.y0/h),right=Math.min(1,b.x1/w),bottom=Math.min(1,b.y1/h);
 return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;
}
if(typeof module!=='undefined'){module.exports={KEY,preferences,readPreferences,savePreferences,ResultVault,highlightBox};return;}
const $=id=>document.getElementById(id),vault=new ResultVault(URL);
let source=null,sequence=0,job=null,displayed=null;
function closePreview(){
 sequence++;const old=job;job=null;
 try{old?.render?.cancel();}catch(_){}
 void old?.loading?.destroy().catch(()=>{});
 if(!old&&displayed)displayed.width=displayed.height=0;displayed=null;
 const panel=$('ocr-page-location');if(panel)panel.hidden=true;
 $('ocr-page-canvas')?.replaceChildren();
}
function clearResult(){vault.clear();const link=$('word-result-download');if(link){link.removeAttribute('href');link.removeAttribute('download');}if($('word-result'))$('word-result').hidden=true;}
function clear(){clearResult();closePreview();source=null;}
function start(){clearResult();closePreview();}
function setFile(file){clear();source=file;}
function publish(blob,name){
 const url=vault.set(blob,name),link=$('word-result-download');
 link.href=url;link.download=name;$('word-result-name').textContent=name;$('word-result').hidden=false;
 // Keep the same URL alive for a later explicit click, even when the browser
 // declines the automatic download after a long conversion.
 const auto=document.createElement('a');auto.href=url;auto.download=name;document.body.append(auto);auto.click();auto.remove();root.AppTasks?.downloaded();
}
async function locate(item){
 const box=highlightBox(item);if(!source||!box||root.AppTasks?.busy)return;
 closePreview();const token=sequence,file=source,current={};job=current;
 const panel=$('ocr-page-location'),caption=$('ocr-page-caption'),holder=$('ocr-page-canvas');panel.hidden=false;caption.textContent=`正在本機開啟原第 ${item.page} 頁…`;
 panel.scrollIntoView({block:'nearest',behavior:'smooth'});
 try{
  const bytes=await file.arrayBuffer();if(token!==sequence)return;
  current.loading=root.pdfjsLib.getDocument({data:new Uint8Array(bytes),isOffscreenCanvasSupported:false});const pdf=await current.loading.promise;if(token!==sequence)return;
  const page=await pdf.getPage(item.page),base=page.getViewport({scale:1}),view=page.getViewport({scale:Math.min(1.5,900/base.width,1200/base.height)});if(token!==sequence)return;
  const canvas=document.createElement('canvas');current.canvas=canvas;displayed=canvas;canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.setAttribute('aria-label',`原始 PDF 第 ${item.page} 頁，紅框標示所選項目`);holder.replaceChildren(canvas);
  const ctx=canvas.getContext('2d',{alpha:false});current.render=page.render({canvasContext:ctx,viewport:view,background:'#fff'});await current.render.promise;if(token!==sequence)return;
  const x=box.x*canvas.width,y=box.y*canvas.height,w=box.width*canvas.width,h=box.height*canvas.height;
  ctx.fillStyle='rgba(220,55,35,.16)';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#dc3723';ctx.lineWidth=2;ctx.strokeRect(x-2,y-2,w+4,h+4);
  caption.textContent=`原始 PDF · 第 ${item.page} 頁 · 紅框：${item.text}（來源字框，非 Word 輸出）`;
 }catch(e){if(token===sequence){caption.textContent='無法顯示原頁，請依頁碼對照原 PDF。';holder.replaceChildren();}}
 finally{
  await current.loading?.destroy().catch(()=>{});
  if(token!==sequence&&current.canvas)current.canvas.width=current.canvas.height=0;
  if(job===current)job=null;
 }
}
root.WordSession={publish,clearResult,clear,start,setFile,locate,closePreview,highlightBox};
document.addEventListener('DOMContentLoaded',()=>{
 let storage;try{storage=localStorage;}catch(_){}
 const apply=p=>{$('ocr-language').value=p.language;$('word-preserve').checked=p.quality==='look';root.updateWordOptions?.();};
 apply(readPreferences(storage));
 const remember=()=>{const ok=savePreferences(storage,{language:$('ocr-language').value,quality:$('word-preserve').checked?'look':'fast'});$('word-preference-note').textContent=ok?'已記住語言與輸出偏好；文件不儲存。':'此瀏覽器無法儲存偏好；本次選擇仍可使用。';};
 for(const id of ['ocr-language','word-fast','word-look','word-preserve'])$(id).addEventListener('change',remember);
 $('word-preference-reset').onclick=()=>{if(root.AppTasks?.busy)return;try{storage?.removeItem(KEY);}catch(_){}apply(preferences(null));root.WordTrial?.clear();root.OCRWord?.clearReview?.();closePreview();$('word-preference-note').textContent='已恢復預設偏好；文件不儲存。';};
 $('word-result-download').onclick=e=>{if(root.AppTasks?.busy){e.preventDefault();return;}root.AppTasks?.downloaded();};
 $('word-result-clear').onclick=clearResult;
 $('ocr-page-close').onclick=closePreview;
 window.addEventListener('pagehide',clear);
});
})(typeof window!=='undefined'?window:globalThis);
