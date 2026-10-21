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
function protectionOptions(get){
 const restricted=!!get('protect-restrict').checked,requireOpen=!!get('protect-require-open').checked;
 if(!requireOpen&&!restricted)throw Error('請設定開啟密碼或啟用操作權限');
 const password=requireOpen?validate(get('protect-password').value,get('protect-confirm').value):'';
 let ownerPassword='';if(restricted){try{ownerPassword=validate(get('protect-owner').value,get('protect-owner-confirm').value);}catch(e){throw Error(e.message.replace(/新密碼/g,'權限管理密碼'));}if(password===ownerPassword)throw Error('權限管理密碼須與開啟密碼不同');}
 const permissions={};for(const name of ['print','copy','modify','annotate','form','assemble'])permissions[name]=!!get('protect-allow-'+name).checked;
 return {password,restricted,ownerPassword,permissions};
}
function init(root){
 const document=root.document,$=id=>document.getElementById(id),fields=['protect-password','protect-confirm','protect-source-password','unlock-password','protect-owner','protect-owner-confirm'];let file=null,working=false,mode='encrypt';
 const clear=()=>{fields.forEach(id=>$(id).value='');$('security-source-details').open=false;};
 const refresh=()=>{for(const kind of ['encrypt','unlock']){const active=mode===kind,tab=$('security-'+kind+'-tab');tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('security-'+kind+'-panel').hidden=!active;tab.disabled=working;}
  $('btn-protect').disabled=working||!file||mode!=='encrypt';$('btn-unlock').disabled=working||!file||mode!=='unlock';for(const id of fields)$(id).disabled=working||(id==='unlock-password'?mode!=='unlock':mode!=='encrypt');
  $('protect-permissions').hidden=!$('protect-restrict').checked;for(const id of ['protect-password','protect-confirm'])$(id).disabled=working||mode!=='encrypt'||!$('protect-require-open').checked;for(const id of ['protect-owner','protect-owner-confirm'])$(id).disabled=working||mode!=='encrypt'||!$('protect-restrict').checked;for(const id of ['protect-require-open','protect-restrict',...['print','copy','modify','annotate','form','assemble'].map(n=>'protect-allow-'+n)])$(id).disabled=working||mode!=='encrypt';};
 $('protect-require-open').onchange=()=>{clear();refresh();};$('protect-restrict').onchange=()=>{clear();refresh();};
 const switchTo=next=>{if(working||root.AppTasks.busy)return;clear();mode=next;root.setStatus('status-security','');refresh();};
 for(const kind of ['encrypt','unlock']){const tab=$('security-'+kind+'-tab');tab.onclick=()=>switchTo(kind);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||working||root.AppTasks.busy)return;e.preventDefault();const next=e.key==='Home'?'encrypt':e.key==='End'?'unlock':kind==='encrypt'?'unlock':'encrypt';switchTo(next);$('security-'+next+'-tab').focus();};}
 root.setupDropzone('dz-security','input-security',files=>{if(working||root.AppTasks.busy||!files[0])return;file=files[0];clear();const row=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');row.className='fileitem';name.textContent=file.name+' ('+root.formatBytes(file.size)+')';remove.type='button';remove.textContent='移除';remove.onclick=()=>{if(working||root.AppTasks.busy)return;file=null;clear();$('input-security').value='';$('list-security').replaceChildren();root.setStatus('status-security','');refresh();};row.append(name,remove);$('list-security').replaceChildren(row);root.setStatus('status-security','');refresh();});
 async function run(kind){
  if(!file||working||mode!==kind)return;const encrypt=kind==='encrypt';let options;try{if(encrypt)options=protectionOptions($);if(file.size>50*1024*1024)throw Error('請使用小於 50 MB 的 PDF');}catch(e){root.setStatus('status-security',e,true);return;}
  working=true;refresh();let worker,timer,stop;const signal=root.AppTasks.signal,selected=file;
  try{root.AppTasks.phase(encrypt?'讀取 PDF，準備加密':'讀取 PDF，準備解除保護');const bytes=await selected.arrayBuffer();root.AppTasks.check();worker=new root.Worker('unlock-worker.js?v=20');
   const result=await new Promise((resolve,reject)=>{stop=()=>{worker.terminate();reject(root.AppCore.abortError());};signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted){stop();return;}
    timer=setTimeout(()=>{worker.terminate();reject(Error('處理超過 120 秒，請減少檔案大小再試'));},120000);
    worker.onmessage=e=>{if(signal?.aborted)return;if(e.data.stage){root.setStatus('status-security',e.data.stage);return;}e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=()=>reject(Error('PDF 引擎載入或處理失敗，請確認網路後重試'));
    worker.postMessage({operation:encrypt?'encrypt':'decrypt',bytes,...(encrypt?options:{password:$('unlock-password').value}),sourcePassword:encrypt?$('protect-source-password').value:''},[bytes]);});
   root.AppTasks.check();root.download(new Blob([result.bytes],{type:'application/pdf'}),selected.name.replace(/\.pdf$/i,'')+(encrypt?'-protected.pdf':'-unlocked.pdf'));root.setStatus('status-security',(encrypt?(options.restricted?'完成 · 已下載權限保護副本；'+(options.password?'開啟時需要新密碼':'不需密碼即可閱讀')+'，操作限制由閱讀器配合遵守':'完成 · 已下載 AES-256 加密副本，開啟時需要新密碼'):'完成 · 已下載解除保護的未加密副本')+(result.warning?'；來源有結構警告，請檢查輸出':''));
  }catch(e){root.setStatus('status-security',e,true);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);worker?.terminate();clear();working=false;refresh();}
 }
 $('btn-protect').onclick=()=>run('encrypt');$('btn-unlock').onclick=()=>run('unlock');
 const fromHash=()=>{const hash=root.location.hash;if(!['#pdf-security','#protect-section','#unlock-section'].includes(hash))return;if(working||root.AppTasks.busy)return;switchTo(hash==='#unlock-section'?'unlock':'encrypt');$('pdf-security').hidden=false;$('pdf-security').scrollIntoView({block:'start'});};root.addEventListener('hashchange',fromHash);refresh();fromHash();
}
if(typeof module!=='undefined'){module.exports={validate,protectionOptions,init};return;}
document.addEventListener('DOMContentLoaded',()=>init(root),{once:true});
})(typeof window!=='undefined'?window:globalThis);
