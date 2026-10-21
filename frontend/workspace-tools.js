/* Local workspace controls. Document previews are held only in this page's memory. */
(function(root){
'use strict';
class PagePlan{
 constructor(count){this.reset(count);}
 reset(count){this.count=count;this.order=Array.from({length:count},(_,i)=>i+1);this.selected=new Set(this.order);this.turns=new Map();}
 move(page,before){if(page===before||!this.order.includes(page)||!this.order.includes(before))return;this.order.splice(this.order.indexOf(page),1);this.order.splice(this.order.indexOf(before),0,page);}
 rotate(){for(const n of this.selected)this.turns.set(n,((this.turns.get(n)||0)+90)%360);}
 remove(){this.order=this.order.filter(n=>!this.selected.has(n));this.selected.clear();}
 pages(){return this.order.filter(n=>this.selected.has(n));}
}
function cropBox(b,width,height){
 if(!b||![b.x0,b.x1,b.y0,b.y1,width,height].every(Number.isFinite)||b.x1<=b.x0||b.y1<=b.y0)return null;
 const pad=Math.max(5,(b.y1-b.y0)*.5),x=Math.max(0,Math.floor(b.x0-pad)),y=Math.max(0,Math.floor(b.y0-pad)),right=Math.min(width,Math.ceil(b.x1+pad)),bottom=Math.min(height,Math.ceil(b.y1+pad));
 if(right<=x||bottom<=y)return null;const w=right-x,h=bottom-y,scale=Math.min(1,360/w,90/h);return {x,y,w,h,width:Math.max(1,Math.ceil(w*scale)),height:Math.max(1,Math.ceil(h*scale))};
}
function previewRows(rows){return rows.slice(0,40).map(row=>Array.from({length:Math.min(20,row.length)},(_,i)=>String(row[i]??'').slice(0,500)));}
function newerVersion(value,current=25){const match=String(value).match(/^person-convert-pwa-v(\d+)$/);return !!match&&Number(match[1])>current;}
if(typeof module!=='undefined'&&module.exports){module.exports={PagePlan,cropBox,previewRows,newerVersion};return;}
root.WorkspaceTools={cropBox,previewRows};
const $=id=>document.getElementById(id),button=(text,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{if(!root.AppTasks.busy)action();};return b;};
let plan=new PagePlan(0),cards=new Map(),drag=null;
function visualRotation(n,c){const angle=plan.turns.get(n)||0,ratio=c.canvas.width&&c.canvas.height?Math.min(c.canvas.width/c.canvas.height,c.canvas.height/c.canvas.width):.65;c.canvas.style.transform=`rotate(${angle}deg) scale(${angle%180?ratio:1})`;}
function syncPlan(){
 $('pm-order').value=plan.pages().join(',');
 for(const [n,c] of cards){c.wrap.dataset.selected=String(plan.selected.has(n));c.wrap.dataset.excluded=String(!plan.order.includes(n));c.check.checked=plan.selected.has(n);visualRotation(n,c);c.label.textContent=`原第 ${n} 頁 · 旋轉 ${plan.turns.get(n)||0}°`;c.wrap.hidden=!plan.order.includes(n);}
 for(const n of plan.order){const c=cards.get(n);if(c)$('thumbs-pm').appendChild(c.wrap);}
 $('status-pm').textContent=`保留 ${plan.pages().length} / ${plan.count} 頁；可再手動輸入頁碼範圍。`;
}
root.PageTools={
 reset(count){plan=new PagePlan(count);cards.clear();$('pm-order').value=plan.pages().join(',');},
 rotation(n){return plan.turns.get(n)||0;},
 rendered(item){const card=cards.get(item.number);if(card)visualRotation(item.number,card);},
 shell(index,view){
  const n=index+1,wrap=document.createElement('div'),frame=document.createElement('div'),canvas=document.createElement('canvas'),label=document.createElement('span'),choice=document.createElement('label'),check=document.createElement('input'),tools=document.createElement('div');
  wrap.className='pm-card';wrap.style.cssText=`width:${view.width}px;max-width:100%`;wrap.draggable=true;wrap.dataset.selected='true';frame.style.width='100%';check.type='checkbox';check.checked=true;check.setAttribute('aria-label',`保留第 ${n} 頁`);label.textContent=`原第 ${n} 頁 · 旋轉 0°`;choice.append(check,label);tools.className='pm-buttons';
  check.onchange=()=>{if(root.AppTasks.busy)return;check.checked?plan.selected.add(n):plan.selected.delete(n);syncPlan();};
  const move=direction=>{const i=plan.order.indexOf(n),j=i+direction;if(j<0||j>=plan.order.length)return;[plan.order[i],plan.order[j]]=[plan.order[j],plan.order[i]];syncPlan();};
  tools.append(button('前移',()=>move(-1)),button('後移',()=>move(1)),button('旋轉 ↻',()=>{plan.turns.set(n,((plan.turns.get(n)||0)+90)%360);syncPlan();}));
  wrap.addEventListener('dragstart',e=>{if(root.AppTasks.busy||e.target.closest('button,input')){e.preventDefault();return;}drag=n;e.dataTransfer.setData('text/plain',String(n));e.dataTransfer.effectAllowed='move';});
  wrap.addEventListener('dragover',e=>{if(drag!==null&&!root.AppTasks.busy)e.preventDefault();});
  wrap.addEventListener('drop',e=>{e.preventDefault();if(!root.AppTasks.busy&&drag!==null){plan.move(drag,n);syncPlan();}drag=null;});wrap.addEventListener('dragend',()=>drag=null);
  frame.append(canvas);wrap.append(frame,choice,tools);cards.set(n,{wrap,canvas,check,label});return {wrap,frame,canvas};
 }
};
let excelFile=null,excelEpoch=0;
root.ExcelPreview={select(file){excelFile=file;excelEpoch++;const b=$('btn-excel-preview');if(b)b.disabled=!file;const p=$('excel-preview');if(p){p.hidden=true;p.replaceChildren();}}};
async function excelPreview(){
 const file=excelFile,epoch=excelEpoch;if(!file)return;let task;
 try{
  root.AppTasks.phase('預覽 Excel 列欄');task=root.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});root.AppTasks.watch(task);const pdf=await task.promise;
  const numbers=root.AppCore.pages($('xlsx-pages').value,pdf.numPages),n=numbers[0],page=await pdf.getPage(n);
  const rows=root.LocalConvert.textRows((await page.getTextContent()).items);page.cleanup();root.AppTasks.check();if(epoch!==excelEpoch)return;
  const panel=$('excel-preview');panel.replaceChildren();const note=document.createElement('p');note.textContent=`第 ${n} 頁的列欄預覽（指定範圍第一頁；最多 40 列 × 20 欄，每格 500 字）。完整轉換仍輸出所有指定頁面。${rows.length?'請核對列欄分隔。':'找不到文字層；此功能不含 OCR。'}`;panel.append(note);
  const scroll=document.createElement('div'),table=document.createElement('table');scroll.className='table-scroll';
  for(const row of previewRows(rows)){const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}scroll.append(table);panel.append(scroll);panel.hidden=false;
  root.setStatus('status-xlsx','預覽完成；尚未轉換或下載');
 }catch(e){root.setStatus('status-xlsx',e,true);}finally{await task?.destroy().catch(()=>{});}
}
let compression=null,compressionEpoch=0;
root.CompressionPreview={clear(){compression=null;compressionEpoch++;if($('compression-preview')){$('compression-preview').replaceChildren();$('compression-preview').hidden=true;}if($('btn-compression-preview'))$('btn-compression-preview').disabled=true;},set(source,result){this.clear();compression={source,result};if($('btn-compression-preview'))$('btn-compression-preview').disabled=false;}};
// AppTasks restores old disabled states after conversion. Enable a new comparison only once idle.
document.addEventListener('tasks-idle',()=>{if($('btn-compression-preview'))$('btn-compression-preview').disabled=!compression;});
async function firstImage(blob){let task,canvas=document.createElement('canvas');try{
 task=root.pdfjsLib.getDocument({data:new Uint8Array(await blob.arrayBuffer())});root.AppTasks.watch(task);const pdf=await task.promise,page=await pdf.getPage(1),base=page.getViewport({scale:1}),view=page.getViewport({scale:Math.min(1,1000/Math.max(base.width,base.height))});canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);const render=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:view,background:'#fff'}),unwatch=root.AppTasks.watch(render);try{await render.promise;}finally{unwatch?.();}root.AppTasks.check();return canvas.toDataURL('image/png');
 }finally{canvas.width=canvas.height=0;await task?.destroy().catch(()=>{});}}
async function compressionPreview(){const pair=compression,epoch=compressionEpoch;if(!pair)return;try{
 root.AppTasks.phase('產生壓縮前後預覽');const source=await firstImage(pair.source),result=await firstImage(pair.result);root.AppTasks.check();if(epoch!==compressionEpoch)return;
 const panel=$('compression-preview'),note=document.createElement('p'),grid=document.createElement('div');panel.replaceChildren();note.textContent='第一頁縮圖抽查；不代表其他頁面、放大細節或文字內容完全相同。請開啟下載的 PDF 核對。';grid.className='comparison-grid';
 for(const [title,data] of [['壓縮前',source],['壓縮後',result]]){const cell=document.createElement('div'),label=document.createElement('p'),img=document.createElement('img');label.textContent=title;img.src=data;img.alt=title+'第一頁預覽';cell.append(label,img);grid.append(cell);}panel.append(note,grid);panel.hidden=false;
 }catch(e){root.setStatus('status-compress',e,true);}}
document.addEventListener('DOMContentLoaded',()=>{
 $('pm-actions').onclick=e=>{const action=e.target.dataset.pm;if(!action||root.AppTasks.busy||!plan.count)return;
  if(action==='all')plan.selected=new Set(plan.order);if(action==='none')plan.selected.clear();if(action==='rotate')plan.rotate();if(action==='delete')plan.remove();if(action==='reset')plan.reset(plan.count);syncPlan();};
 const applyManual=report=>{if(root.AppTasks.busy||!plan.count)return;try{const text=$('pm-order').value,values=text.trim()?root.AppCore.pages(text,plan.count,true):[];plan.order=[...new Set(values),...Array.from({length:plan.count},(_,i)=>i+1).filter(n=>!values.includes(n))];plan.selected=new Set(values);for(const [n,c]of cards){c.check.checked=plan.selected.has(n);c.wrap.dataset.selected=String(c.check.checked);c.wrap.dataset.excluded='false';c.wrap.hidden=false;}for(const n of plan.order){const c=cards.get(n);if(c)$('thumbs-pm').append(c.wrap);}$('status-pm').textContent='已套用手動頁碼；重複頁碼會在下載時重複輸出。';}catch(e){if(report)root.setStatus('status-pm',e,true);}};
 $('pm-order').addEventListener('input',()=>applyManual(false));$('pm-order').addEventListener('change',()=>applyManual(true));
 const excelButton=button('預覽列欄',()=>{});excelButton.id='btn-excel-preview';excelButton.disabled=!excelFile;excelButton.onclick=excelPreview;$('btn-xlsx').after(excelButton);
 const excelPanel=document.createElement('div');excelPanel.id='excel-preview';excelPanel.className='preview-panel';excelPanel.hidden=true;$('status-xlsx').before(excelPanel);$('xlsx-pages').addEventListener('input',()=>excelPanel.hidden=true);
 const compareButton=button('壓縮前後畫質抽查',()=>{});compareButton.id='btn-compression-preview';compareButton.disabled=true;compareButton.onclick=compressionPreview;$('btn-compress').after(compareButton);
 const comparison=document.createElement('div');comparison.id='compression-preview';comparison.className='preview-panel';comparison.hidden=true;$('status-compress').before(comparison);
 const groups=['全部工具','頁面整理','格式轉換','標註與保護','圖片工具'],mapping=[3,2,4,1,1,3,3,1,3,2,2,2,1,4],sheets=[...document.querySelectorAll('main > section.sheet')].slice(0,14);let category=0;
 const nav=$('workspace-nav');
 function show(index){category=index;for(const [i,section]of sheets.entries())section.hidden=index!==0&&mapping[i]!==index;for(const [i,b]of [...nav.children].entries())b.setAttribute('aria-pressed',String(i===index));}
 groups.forEach((name,i)=>{const b=button(name,()=>show(i));nav.append(b);});show(0);
 sheets.forEach((section,i)=>{if(!section.id)section.id='tool-'+String(i+1).padStart(2,'0');const badge=document.createElement('span');badge.className='processing-badge';badge.textContent=[9,12].includes(i)?'本機處理 · 可選後端上傳':'本機處理 · 文件不上傳';section.querySelector('.sheet-head').append(badge);});
 for(const section of sheets){for(const node of [...section.children]){if(node.tagName==='DIV'&&!node.className&&node.textContent.trim().startsWith('附註:')){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='使用說明與限制';node.before(details);details.append(summary,node);}}}
 const reveal=()=>{const target=document.getElementById(location.hash.slice(1));if(target?.closest('.sheet')?.hidden){show(0);target.scrollIntoView();}};window.addEventListener('hashchange',reveal);reveal();
 $('reload-app').onclick=()=>{if(root.AppTasks.busy){$('update-note').textContent='請先完成或取消目前工作。';return;}if(typeof annotationHistory!=='undefined'&&annotationHistory.dirty){$('update-note').textContent='標註尚未下載，請先儲存；其他已選檔案在重新載入後需重選。';return;}if($('reload-app').dataset.confirm!=='1'){$('reload-app').dataset.confirm='1';$('reload-app').textContent='確定重新載入';$('update-note').textContent='已選檔案與預覽會清除，請先下載所需結果。';return;}location.reload();};
 if('serviceWorker'in navigator){const checkVersion=()=>{const worker=navigator.serviceWorker.controller;if(!worker)return;const channel=new MessageChannel(),timer=setTimeout(()=>channel.port1.close(),3000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();if(newerVersion(e.data))$('update-banner').hidden=false;};worker.postMessage('APP_VERSION',[channel.port2]);};navigator.serviceWorker.addEventListener('controllerchange',checkVersion);checkVersion();}
});
})(typeof window!=='undefined'?window:globalThis);
