window.LocalCompress={
  async run(file){
    const button=document.getElementById('btn-compress'),status='status-compress';
    if(!file||button.dataset.busy)return;
    if(file.size>50*1024*1024){setStatus(status,'請使用小於 50 MB 的 PDF',true);return;}
    button.dataset.busy='1';button.disabled=true;
    const progress=document.getElementById(status+'-progress');if(progress)progress.hidden=true;
    let worker,timer,stop;const signal=AppTasks.signal;
    try{
      const bytes=await file.arrayBuffer();AppTasks.check();worker=new Worker('unlock-worker.js');
      await new Promise((resolve,reject)=>{
        stop=()=>{worker.terminate();reject(AppCore.abortError());};signal?.addEventListener('abort',stop,{once:true});
        timer=setTimeout(()=>{worker.terminate();reject(Error('處理超過 120 秒，請減少檔案大小後重試'));},120000);
        worker.onmessage=event=>{if(signal?.aborted)return;
          if(event.data.stage){setStatus(status,event.data.stage);return;}
          if(event.data.error){reject(new Error(event.data.error));return;}
          AppTasks.check();const output=event.data.bytes;
          if(output.byteLength>=file.size){setStatus(status,'完成 · 原檔已有效壓縮，無損整理沒有縮小；未下載較大的檔案');resolve();return;}
          download(new Blob([output],{type:'application/pdf'}),'compressed-lossless.pdf');
          setStatus(status,`完成 · ${formatBytes(file.size)} → ${formatBytes(output.byteLength)}（縮小 ${(100-output.byteLength/file.size*100).toFixed(1)}%）`+(event.data.warning?' · 來源有結構警告，請檢查輸出':''));resolve();
        };
        worker.onerror=()=>reject(new Error('無損壓縮引擎載入或處理失敗，請確認網路後重試'));
        worker.postMessage({bytes,operation:'compress'},[bytes]);
      });
    }catch(error){setStatus(status,error,true);}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);worker?.terminate();delete button.dataset.busy;button.disabled=false;}
  }
};
