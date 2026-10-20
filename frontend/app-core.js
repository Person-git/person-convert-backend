/* Shared local limits, strict selection and cancellable job control. No file persistence. */
(function(root){
'use strict';
function abortError(){const e=new Error('已取消');e.name='AbortError';return e;}
function yieldTask(){return new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=()=>{c.port1.close();c.port2.close();resolve();};c.port2.postMessage(0);});}
function pages(spec,total,keepDuplicates=false){
 if(!Number.isSafeInteger(total)||total<1)throw Error('PDF 頁數無效，請確認檔案完整');
 if(!String(spec||'').trim())return Array.from({length:total},(_,i)=>i+1);
 const result=[],seen=new Set();
 for(const token of String(spec).split(',')){
  const m=token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('頁碼格式錯誤，請輸入例如 1,3,5-7');
  const a=Number(m[1]),b=m[2]?Number(m[2]):a;
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b<a||b>total)throw Error(`頁碼超出範圍或區間順序錯誤（共 ${total} 頁）`);
  for(let n=a;n<=b;n++)if(keepDuplicates||!seen.has(n)){seen.add(n);result.push(n);}
 }
 return result;
}
function dimensions(width,height,scale=1,maxPixels=8000000,maxSide=4096){
 if(![width,height,scale].every(v=>Number.isFinite(v)&&v>0))throw Error('圖片或頁面尺寸無效');
 const factor=Math.min(scale,maxSide/Math.max(width,height),Math.sqrt(maxPixels/(width*height)));
 return {scale:factor,width:Math.max(1,Math.floor(width*factor)),height:Math.max(1,Math.floor(height*factor)),limited:factor<scale*.999};
}
function errorMessage(error){
 const text=String(error?.message||error||'未知錯誤');
 if(error?.name==='AbortError'||error?.name==='RenderingCancelledException')return '已取消，未產生新下載';
 if(/^(新密碼|兩次輸入的新密碼|原 PDF 開啟密碼|加密失敗)/.test(text))return text;
 if(error?.name==='PasswordException'||/password|密碼/i.test(text))return 'PDF 需要正確的開啟密碼。請先使用「09 PDF 密碼與保護」的「解除保護」，或在頁面管理輸入密碼後重試。';
 if(/EncryptedPDFError|ignoreEncryption|PDFDocument\.load[^\n]*encrypted/i.test(text))return 'PDF 有權限保護。請先使用「09 PDF 密碼與保護」的「解除保護」取得副本，再重新選檔；有開啟密碼時需輸入正確密碼。';
 if(/image|jpeg|jpg|png|bitmap/i.test(text)&&/decode|invalid|corrupt|signature|failed|not.*valid/i.test(text))return '圖片無法解碼或內容不完整，請重新另存 PNG／JPG 後重試。';
 if(error?.name==='InvalidPDFException'||/InvalidPDF|invalid pdf|xref|PDF header|trailer|corrupt|無效的 PDF/i.test(text))return 'PDF 結構不完整或已損壞。請確認可正常開啟，重新下載原檔，或從原製作軟體另存 PDF 後重試。';
 if(/memory|allocation|canvas.*(?:size|area)|out of bounds|Invalid array length/i.test(text))return '檔案或圖片尺寸超出可用記憶體。請減少指定頁數、降低解析度，或關閉其他大型工作後重試。';
 if(/fetch|network|load.*(?:script|worker)|is not defined|下載.*(?:套件|引擎)|套件.*失敗|引擎.*失敗/i.test(text))return '工具套件下載或網路連線失敗。請恢復連線後重新整理再試；首次使用需先連線下載套件。';
 return text;
}
async function normalizeFiles(files,accept){
 if(files.length>200||files.reduce((s,f)=>s+f.size,0)>100*1024*1024)throw Error('一次最多 200 個檔案、合計 100 MB，請分批處理');
 const result=[];
 for(const f of files){
  if(f.size>50*1024*1024)throw Error('單一檔案上限 50 MB，請先縮小或分割檔案');
  const b=new Uint8Array(await f.slice(0,1024).arrayBuffer());
  let type='';if(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10)type='image/png';
  else if(b[0]===255&&b[1]===216&&b[2]===255)type='image/jpeg';
  else if(new TextDecoder('latin1').decode(b).includes('%PDF-'))type='application/pdf';
  if(!type||!accept.split(',').some(a=>a.trim()===type))throw Error(accept.includes('image/')?'此工具只支援真正的 PNG／JPG 圖片，請先另存成 PNG 或 JPG；修改副檔名無法轉換格式。':'請選擇有效的 PDF 檔案');
  if(type.startsWith('image/')){
   const header=new Uint8Array(await f.slice(0,1024*1024).arrayBuffer());let width=0,height=0;
   if(type==='image/png'&&header.length>=24){const v=new DataView(header.buffer);width=v.getUint32(16);height=v.getUint32(20);}
   else if(type==='image/jpeg'){
    let i=2;while(i+3<header.length){if(header[i++]!==255)continue;let marker=header[i++];while(marker===255&&i<header.length)marker=header[i++];if(marker===217||marker===218)break;if(marker===0||marker===216||(marker>=208&&marker<=215))continue;const length=(header[i]<<8)|header[i+1];if(length<2||i+length>header.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=(header[i+3]<<8)|header[i+4];width=(header[i+5]<<8)|header[i+6];break;}i+=length;}
   }
   if(!width||!height)throw Error('圖片尺寸資料無效或過於複雜，請重新另存 PNG／JPG 後重試');
   if(width*height>16000000||Math.max(width,height)>16000)throw Error('原始圖片超過 1600 萬像素或 16000px，請先縮小圖片後重試');
  }
  result.push(f.type===type?f:new File([f],f.name,{type,lastModified:f.lastModified}));
 }
 return result;
}
class History{
 constructor(){this.reset([]);}
 reset(state){this.states=[JSON.stringify(state)];this.index=0;this.saved=this.states[0];}
 commit(state){const value=JSON.stringify(state);if(value===this.states[this.index])return;this.states.splice(this.index+1);this.states.push(value);this.index++;let bytes=this.states.reduce((s,x)=>s+x.length*2,0);while(this.states.length>1&&(this.states.length>100||bytes>2*1024*1024)){bytes-=this.states.shift().length*2;this.index--;}}
 undo(){if(this.index>0)this.index--;return JSON.parse(this.states[this.index]);}
 redo(){if(this.index<this.states.length-1)this.index++;return JSON.parse(this.states[this.index]);}
 markSaved(){this.saved=this.states[this.index];}
 get dirty(){return this.states[this.index]!==this.saved;}
}
const api={pages,dimensions,errorMessage,normalizeFiles,yieldTask,History,abortError};
if(typeof module!=='undefined')module.exports=api;
else{
 root.AppCore=api;
 let active=null;
 const tasks={get busy(){return !!active;},get signal(){return active?.controller.signal;},check(){if(active?.controller.signal.aborted)throw abortError();},
  wait(promise){
   const signal=active?.controller.signal;if(!signal)return Promise.resolve(promise);
   return new Promise((resolve,reject)=>{const abort=()=>reject(abortError());signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
  },
  async step(done,total,label='處理頁面'){tasks.check();if(active){active.progress.value=Math.max(0,Math.min(99,Math.round(done/Math.max(1,total)*100)));active.label.textContent=`${label} ${done} / ${total}`;}await yieldTask();tasks.check();},
  phase(label){if(active){active.label.textContent=label;active.progress.removeAttribute('value');}tasks.check();},
  report(percent){if(active)active.progress.value=Math.max(0,Math.min(99,percent));},
  watch(object){if(!active)return;const stop=()=>{try{const p=object.cancel?object.cancel():object.destroy?.();p?.catch?.(()=>{});}catch(_){}};const signal=active.controller.signal;signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();return ()=>signal.removeEventListener('abort',stop);},
  downloaded(){if(active){active.downloaded=true;active.cancel.disabled=true;}},
  observe(message,error){if(active){active.error ||= !!error;if(error||/伺服器轉換中|載入.*OCR|產生可編輯 Word|讀取 PDF/.test(String(message))){active.progress.removeAttribute('value');return;}const m=String(message).match(/(?:^|\s)(\d+)%/);if(m)tasks.report(Number(m[1]));}},
  cancel(){if(active&&!active.downloaded){active.controller.abort();active.cancel.disabled=true;active.label.textContent='正在取消，會在目前步驟結束後停止…';}},
  async run(button,action){
   if(active)return;
   const banner=document.getElementById('task-banner'),progress=document.getElementById('task-progress'),label=document.getElementById('task-label'),cancel=document.getElementById('task-cancel');
   const controls=[...document.querySelectorAll('main input,main select,main button')].map(el=>[el,el.disabled]);
   const job={controller:new AbortController(),progress,label,cancel,error:false,downloaded:false};active=job;
   controls.forEach(([el])=>el.disabled=true);banner.hidden=false;progress.removeAttribute('value');cancel.disabled=false;cancel.textContent='取消目前工作';cancel.onclick=tasks.cancel;
   label.textContent=button.textContent.trim();document.body.dataset.taskActive='1';
   const started=performance.now(),clock=document.getElementById('task-clock'),timer=setInterval(()=>clock.textContent=`已用 ${Math.floor((performance.now()-started)/1000)} 秒`,1000);clock.textContent='已用 0 秒';
   try{await action();tasks.check();if(!job.error){progress.value=100;label.textContent=job.downloaded?'完成 · 已下載檔案':'處理完成';}}
   catch(e){job.error=true;label.textContent=errorMessage(e);progress.removeAttribute('value');const status=button.closest('.sheet')?.querySelector('.status');if(status&&!job.controller.signal.aborted)root.setStatus?.(status.id,errorMessage(e),true);}
   finally{clearInterval(timer);if(job.controller.signal.aborted){label.textContent='已取消，未產生新下載';progress.removeAttribute('value');}cancel.disabled=true;controls.forEach(([el,disabled])=>el.disabled=disabled);delete document.body.dataset.taskActive;active=null;document.dispatchEvent(new Event('tasks-idle'));if(job.controller.signal.aborted){const status=button.closest('.sheet')?.querySelector('.status');if(status)root.setStatus?.(status.id,'已取消，未產生新下載');}clock.textContent=`共 ${((performance.now()-started)/1000).toFixed(1)} 秒`;cancel.disabled=false;cancel.textContent='收起';cancel.onclick=()=>{if(!active)banner.hidden=true;};if(job.error&&!job.controller.signal.aborted)label.textContent='處理失敗，請依功能區的提示重試';}
  }
 };
 root.AppTasks=tasks;
 const install=()=>{for(const id of ['btn-unlock','btn-protect','btn-img2pdf','btn-p2i','btn-merge','btn-split-range','btn-split-all','btn-split-image','btn-wm','btn-pn','btn-rot','btn-pm','btn-docx','btn-word-trial','btn-offline-prepare','btn-xlsx','btn-svg','btn-compress','btn-upscale','btn-annotate-save','btn-excel-preview','btn-compression-preview']){
   const button=document.getElementById(id),action=button?.onclick;if(action&&button.dataset.taskWrapped!=='1'){button.dataset.taskWrapped='1';button.onclick=()=>tasks.run(button,action);}
  }for(const id of ['btn-ocr-cancel']){const b=document.getElementById(id);if(b&&b.dataset.taskCancel!=='1'){b.dataset.taskCancel='1';b.addEventListener('click',()=>tasks.cancel());}}};
 document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});window.addEventListener('load',install,{once:true});
}
})(typeof window!=='undefined'?window:globalThis);
