/* Windowed page rasters; overlays remain separate from disposable canvases. */
(function(root){
'use strict';
class LazyPDF{
 constructor(container,options){this.container=container;this.options=options;this.items=[];this.queue=new Set();this.loaded=[];this.disposed=false;this.running=false;this.task=null;this.renderTask=null;this.resume=()=>void this.pump();document.addEventListener('tasks-idle',this.resume);}
 async load(file,password=''){
  this.task=root.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),password,isOffscreenCanvasSupported:false});
  if(this.disposed){await this.task.destroy();return;}
  try{
   this.pdf=await this.task.promise;if(this.disposed)return;
   const first=await this.pdf.getPage(1),view=first.getViewport({scale:this.options.scale});first.cleanup();
   if(this.disposed)return;this.container.replaceChildren();this.options.onCount?.(this.pdf.numPages);
   this.observer=new IntersectionObserver(entries=>{for(const e of entries){const item=this.items[Number(e.target.dataset.lazyIndex)];if(item){item.near=e.isIntersecting;if(item.near)this.enqueue(item);}}},{rootMargin:'500px 0px'});
   for(let i=0;i<this.pdf.numPages;i++){
    if(this.disposed)return;const shell=this.options.makeShell(i,view);shell.frame.style.aspectRatio=`${view.width}/${view.height}`;shell.frame.style.position='relative';shell.frame.dataset.lazyIndex=i;
    shell.canvas.style.cssText+=';position:absolute;inset:0;width:100%;height:100%;';shell.canvas.width=shell.canvas.height=0;
    const message=document.createElement('div');message.className='lazy-message';message.textContent=`第 ${i+1} 頁 · 捲動到此處載入`;
    shell.frame.appendChild(message);if(shell.overlay)shell.overlay.style.pointerEvents='none';
    const item={...shell,message,number:i+1,near:false,ready:false};this.items.push(item);this.container.appendChild(shell.wrap);this.observer.observe(shell.frame);
    if(i%100===0)await root.AppCore.yieldTask();
   }
   if(!this.disposed&&this.items[0])this.enqueue(this.items[0]);
  }catch(e){if(!this.disposed)throw e;}
 }
 enqueue(item){if(this.disposed||item.ready)return;this.queue.add(item);void this.pump();}
 async pump(){
  if(this.running||this.disposed||root.AppTasks?.busy)return;this.running=true;
  try{while(this.queue.size&&!this.disposed&&!root.AppTasks?.busy){
   const item=this.queue.values().next().value;this.queue.delete(item);if(item.ready)continue;
   const rect=item.frame.getBoundingClientRect();if(!item.near&&(rect.bottom< -600||rect.top>innerHeight+600))continue;
   let page;try{
    item.message.hidden=false;item.message.textContent=`第 ${item.number} 頁載入中…`;
    page=await this.pdf.getPage(item.number);if(this.disposed)break;
    const base=page.getViewport({scale:1}),size=root.AppCore.dimensions(base.width,base.height,this.options.scale),view=page.getViewport({scale:size.scale});
    item.frame.style.aspectRatio=`${view.width}/${view.height}`;item.wrap.style.width=`${view.width}px`;item.wrap.style.maxWidth='100%';
    item.canvas.width=size.width;item.canvas.height=size.height;
    if(item.overlay)item.overlay.dataset.pageWidth=base.width;
    this.renderTask=page.render({canvasContext:item.canvas.getContext('2d',{alpha:false}),viewport:view,background:'#ffffff'});
    await this.renderTask.promise;if(this.disposed)break;
    item.ready=true;item.message.hidden=true;if(item.overlay)item.overlay.style.pointerEvents='';
    this.loaded.push(item);this.options.onRender?.(item);
    // Evict only offscreen rasters; visible pages and editable overlays stay intact.
    while(this.loaded.length>(this.options.maxCanvases||6)){
     const index=this.loaded.findIndex(x=>{const r=x.frame.getBoundingClientRect();return x!==item&&(r.bottom< -100||r.top>innerHeight+100);});if(index<0)break;
     const old=this.loaded.splice(index,1)[0];old.canvas.width=old.canvas.height=0;old.ready=false;old.message.hidden=false;old.message.textContent=`第 ${old.number} 頁 · 捲動到此處重新載入`;if(old.overlay)old.overlay.style.pointerEvents='none';
    }
   }catch(e){item.canvas.width=item.canvas.height=0;if(!this.disposed){item.message.replaceChildren();const text=document.createElement('span');text.textContent=root.AppCore.errorMessage(e);const retry=document.createElement('button');retry.type='button';retry.textContent='重試此頁';retry.onclick=()=>{if(!root.AppTasks?.busy)this.enqueue(item);};item.message.append(text,retry);item.message.hidden=false;}}
   finally{this.renderTask=null;page?.cleanup();}
   await root.AppCore.yieldTask();
  }}finally{this.running=false;}
 }
 dispose(){this.disposed=true;document.removeEventListener('tasks-idle',this.resume);this.observer?.disconnect();this.queue.clear();try{this.renderTask?.cancel();}catch(_){}for(const x of this.items)x.canvas.width=x.canvas.height=0;void this.task?.destroy().catch(()=>{});this.items=[];this.loaded=[];}
}
root.LazyPDF=LazyPDF;
})(typeof window!=='undefined'?window:globalThis);
