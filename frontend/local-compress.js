window.LocalCompress={
  async run(file){
    const button=document.getElementById('btn-compress'),status='status-compress';
    if(!file||button.dataset.busy)return;
    if(file.size>50*1024*1024){setStatus(status,'請使用小於 50 MB 的 PDF',true);return;}
    button.dataset.busy='1';button.disabled=true;
    const progress=document.getElementById(status+'-progress');if(progress)progress.hidden=true;
    let worker;
    try{
      const bytes=await file.arrayBuffer();worker=new Worker('unlock-worker.js');
      await new Promise((resolve,reject)=>{
        worker.onmessage=event=>{
          if(event.data.stage){setStatus(status,event.data.stage);return;}
          if(event.data.error){reject(new Error(event.data.error));return;}
          const output=event.data.bytes;
          if(output.byteLength>=file.size){setStatus(status,'完成 · 原檔已有效壓縮，無損整理沒有縮小；未下載較大的檔案');resolve();return;}
          download(new Blob([output],{type:'application/pdf'}),'compressed-lossless.pdf');
          setStatus(status,`完成 · ${formatBytes(file.size)} → ${formatBytes(output.byteLength)}（縮小 ${(100-output.byteLength/file.size*100).toFixed(1)}%）`+(event.data.warning?' · 來源有結構警告，請檢查輸出':''));resolve();
        };
        worker.onerror=()=>reject(new Error('無損壓縮引擎載入或處理失敗，請確認網路後重試'));
        worker.postMessage({bytes,operation:'compress'},[bytes]);
      });
    }catch(error){setStatus(status,'錯誤: '+error.message,true);}
    finally{worker?.terminate();delete button.dataset.busy;button.disabled=false;}
  }
};
