/* PDF bytes and password remain in this short-lived local worker. */
self.onmessage=async event=>{
  try{
    self.postMessage({stage:'載入解除保護引擎（首次使用需下載）'});
    const base='https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/';
    importScripts(base+'qpdf.js');
    const errors=[];
    const qpdf=await Module({noInitialRun:true,locateFile:name=>base+name,print:line=>errors.push(String(line)),printErr:line=>errors.push(String(line))});
    qpdf.FS.writeFile('/input.pdf',new Uint8Array(event.data.bytes));
    self.postMessage({stage:'解除保護並保留原始文字與向量'});
    let code;
    try{code=qpdf.callMain(['--password='+event.data.password,'--decrypt','/input.pdf','/output.pdf']);}
    catch(error){if(typeof error.status==='number')code=error.status;else throw error;}
    if(code!==0&&code!==3){
      if(errors.some(line=>/password/i.test(line)))throw new Error('開啟密碼不正確或未填寫，請輸入正確密碼後重試');
      throw new Error('無法解除此 PDF：請確認開啟密碼正確、檔案完整且為標準 PDF 加密格式');
    }
    const bytes=qpdf.FS.readFile('/output.pdf');
    self.postMessage({bytes:bytes.buffer,warning:code===3},[bytes.buffer]);
  }catch(error){self.postMessage({error:error.message||'解除保護失敗'});}
};
