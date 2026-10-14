document.addEventListener('DOMContentLoaded',()=>{
  let file=null,worker=null,busy=false,generation=0;
  const button=document.getElementById('btn-unlock'),password=document.getElementById('unlock-password'),cancel=document.getElementById('btn-unlock-cancel');
  setupDropzone('dz-unlock','input-unlock',files=>{
    if(busy||!files[0]||files[0].type!=='application/pdf')return;
    file=files[0];password.value='';
    const list=document.getElementById('list-unlock');list.replaceChildren();
    const row=document.createElement('div');row.className='fileitem';row.textContent=file.name+' ('+formatBytes(file.size)+')';list.append(row);button.disabled=false;
    setStatus('status-unlock','');
  });
  function finish(){generation++;worker?.terminate();worker=null;busy=false;password.value='';button.disabled=!file;cancel.disabled=true;password.disabled=false;document.getElementById('input-unlock').disabled=false;}
  cancel.onclick=()=>{finish();setStatus('status-unlock','已取消，沒有產生檔案');};
  button.onclick=async()=>{
    if(!file||busy)return;
    if(file.size>50*1024*1024){setStatus('status-unlock','請使用小於 50 MB 的 PDF',true);return;}
    const job=++generation;busy=true;button.disabled=true;cancel.disabled=false;password.disabled=true;document.getElementById('input-unlock').disabled=true;
    setStatus('status-unlock','讀取 PDF · 文件與密碼僅在本機處理');
    try{
      const bytes=await file.arrayBuffer();if(!busy||job!==generation)return;
      worker=new Worker('unlock-worker.js');
      worker.onmessage=event=>{
        if(event.data.stage){setStatus('status-unlock',event.data.stage);return;}
        if(event.data.error)setStatus('status-unlock',event.data.error,true);
        else{download(new Blob([event.data.bytes],{type:'application/pdf'}),file.name.replace(/\.pdf$/i,'')+'-unlocked.pdf');setStatus('status-unlock','完成 · 已下載解除保護的副本'+(event.data.warning?'（來源有結構警告，請檢查輸出）':''));}
        finish();
      };
      worker.onerror=()=>{setStatus('status-unlock','引擎載入或處理失敗，請確認網路後重試',true);finish();};
      worker.postMessage({bytes,password:password.value},[bytes]);
    }catch(error){setStatus('status-unlock','錯誤: '+error.message,true);finish();}
  };
});
