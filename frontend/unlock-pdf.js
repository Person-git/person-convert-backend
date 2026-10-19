document.addEventListener('DOMContentLoaded',()=>{
 let file=null,busy=false;
 const button=document.getElementById('btn-unlock'),password=document.getElementById('unlock-password'),cancel=document.getElementById('btn-unlock-cancel');
 setupDropzone('dz-unlock','input-unlock',files=>{if(busy||!files[0])return;file=files[0];password.value='';const list=document.getElementById('list-unlock');list.replaceChildren();const row=document.createElement('div');row.className='fileitem';row.textContent=file.name+' ('+formatBytes(file.size)+')';list.append(row);button.disabled=false;setStatus('status-unlock','');});
 cancel.onclick=()=>AppTasks.cancel();
 button.onclick=async()=>{
  if(!file||busy)return;busy=true;button.disabled=true;cancel.disabled=false;password.disabled=true;
  let worker,timer,stop;const signal=AppTasks.signal;
  try{
   const bytes=await file.arrayBuffer();AppTasks.check();setStatus('status-unlock','讀取 PDF · 文件與密碼僅在本機處理');worker=new Worker('unlock-worker.js');
   const result=await new Promise((resolve,reject)=>{
    stop=()=>{worker.terminate();reject(AppCore.abortError());};signal?.addEventListener('abort',stop,{once:true});
    timer=setTimeout(()=>{worker.terminate();reject(Error('處理超過 120 秒，請減少檔案大小後重試'));},120000);
    worker.onmessage=event=>{if(signal?.aborted)return;if(event.data.stage){setStatus('status-unlock',event.data.stage);return;}if(event.data.error)reject(Error(event.data.error));else resolve(event.data);};
    worker.onerror=()=>reject(Error('引擎載入或處理失敗，請確認網路後重試'));worker.postMessage({bytes,password:password.value},[bytes]);
   });
   AppTasks.check();download(new Blob([result.bytes],{type:'application/pdf'}),file.name.replace(/\.pdf$/i,'')+'-unlocked.pdf');setStatus('status-unlock','完成 · 已下載解除保護的副本'+(result.warning?'（來源有結構警告，請檢查輸出）':''));
  }catch(error){setStatus('status-unlock',error,true);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);worker?.terminate();busy=false;password.value='';password.disabled=false;button.disabled=!file;cancel.disabled=true;}
 };
});
