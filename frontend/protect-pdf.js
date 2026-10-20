/* Passwords and document bytes are never persisted or transmitted to a service. */
(function(root){'use strict';
function validate(password,confirmation){
 if(Array.from(password).length<8)throw Error('新密碼至少需要 8 個字元');
 if(new TextEncoder().encode(password).length>127)throw Error('新密碼過長：UTF-8 編碼最多 127 bytes，請縮短密碼');
 if(/[\u0000-\u001F\u007F]/.test(password))throw Error('新密碼不能包含控制字元或換行');
 if(!password.trim())throw Error('新密碼不能全部都是空白');
 if(password!==confirmation)throw Error('兩次輸入的新密碼不一致');
 return password;
}
if(typeof module!=='undefined'){module.exports={validate};return;}
document.addEventListener('DOMContentLoaded',()=>{
 let file=null,busy=false;const $=id=>document.getElementById(id),button=$('btn-protect'),password=$('protect-password'),confirmation=$('protect-confirm'),source=$('protect-source-password');
 const clear=()=>{password.value=confirmation.value=source.value='';};
 root.setupDropzone('dz-protect','input-protect',files=>{if(busy||!files[0])return;file=files[0];clear();const row=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');row.className='fileitem';name.textContent=file.name+' ('+root.formatBytes(file.size)+')';remove.type='button';remove.textContent='移除';remove.onclick=()=>{if(root.AppTasks.busy)return;file=null;clear();$('input-protect').value='';$('list-protect').replaceChildren();button.disabled=true;root.setStatus('status-protect','');};row.append(name,remove);$('list-protect').replaceChildren(row);button.disabled=false;root.setStatus('status-protect','');});
 button.onclick=async()=>{
  if(!file||busy)return;try{validate(password.value,confirmation.value);if(file.size>50*1024*1024)throw Error('請使用小於 50 MB 的 PDF');}catch(e){root.setStatus('status-protect',e,true);return;}
  busy=true;let worker,timer,stop;const signal=root.AppTasks.signal;
  try{root.AppTasks.phase('讀取 PDF，準備加密');const bytes=await file.arrayBuffer();root.AppTasks.check();worker=new Worker('unlock-worker.js?v=15');
   const result=await new Promise((resolve,reject)=>{stop=()=>{worker.terminate();reject(root.AppCore.abortError());};signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted){stop();return;}
    timer=setTimeout(()=>{worker.terminate();reject(Error('加密超過 120 秒，請減少檔案大小再試'));},120000);
    worker.onmessage=e=>{if(signal?.aborted)return;if(e.data.stage){root.setStatus('status-protect',e.data.stage);return;}e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=()=>reject(Error('加密引擎載入或處理失敗，請確認網路後重試'));
    worker.postMessage({operation:'encrypt',bytes,password:password.value,sourcePassword:source.value},[bytes]);});
   root.AppTasks.check();root.download(new Blob([result.bytes],{type:'application/pdf'}),file.name.replace(/\.pdf$/i,'')+'-protected.pdf');root.setStatus('status-protect','完成 · 已下載 AES-256 加密副本，開啟時需要新密碼'+(result.warning?'；來源有結構警告，請檢查輸出':''));
  }catch(e){root.setStatus('status-protect',e,true);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);worker?.terminate();clear();busy=false;}
 };
});
})(typeof window!=='undefined'?window:globalThis);
