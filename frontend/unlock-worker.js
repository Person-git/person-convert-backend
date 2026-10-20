/* PDF bytes and password remain in this short-lived local worker. */
self.onmessage=async event=>{
  try{
    const compress=event.data.operation==='compress',encrypt=event.data.operation==='encrypt';
    const validPassword=p=>typeof p==='string'&&Array.from(p).length>=8&&p.trim()&&new TextEncoder().encode(p).length<=127&&!/[\u0000-\u001F\u007F]/.test(p);
    const restricted=encrypt&&event.data.restricted===true;
    if(encrypt&&restricted&&(!validPassword(event.data.ownerPassword)||event.data.ownerPassword===event.data.password))throw Error('權限管理密碼格式不符合要求');
    if(encrypt&&restricted&&(!event.data.permissions||['print','copy','modify','annotate','form','assemble'].some(n=>typeof event.data.permissions[n]!=='boolean')))throw Error('操作權限設定不完整');
    if(encrypt&&!(restricted&&event.data.password==='')&&(typeof event.data.password!=='string'||Array.from(event.data.password).length<8||!event.data.password.trim()||new TextEncoder().encode(event.data.password).length>127||/[\u0000-\u001F\u007F]/.test(event.data.password)))throw Error('新密碼格式不符合要求');
    self.postMessage({stage:encrypt?'載入加密引擎（首次使用需下載）':compress?'載入無損壓縮引擎（首次使用需下載）':'載入解除保護引擎（首次使用需下載）'});
    const base='https://cdn.jsdelivr.net/npm/@neslinesli93/qpdf-wasm@0.3.0/dist/';
    importScripts(base+'qpdf.js');
    const errors=[];
    const qpdf=await Module({noInitialRun:true,locateFile:name=>base+name,print:line=>errors.push(String(line)),printErr:line=>errors.push(String(line))});
    qpdf.FS.writeFile('/input.pdf',new Uint8Array(event.data.bytes));
    self.postMessage({stage:encrypt?'建立 AES-256 加密副本':compress?'重新壓縮 PDF 結構，保留畫質':'解除保護並保留原始文字與向量'});
    let code;
    const owner=restricted?event.data.ownerPassword:encrypt?Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''):null;
    const permissionArgs=restricted?['--print='+(event.data.permissions.print?'full':'none'),...Object.entries({copy:'extract',modify:'modify-other',annotate:'annotate',form:'form',assemble:'assemble'}).map(([key,flag])=>'--'+flag+'='+(event.data.permissions[key]?'y':'n'))]:[];
    const encryptArgs=encrypt?['--password='+String(event.data.sourcePassword||''),'--encrypt',event.data.password,owner,'256',...permissionArgs,'--','/input.pdf','/output.pdf']:null;
    try{code=qpdf.callMain(encrypt?encryptArgs:compress?['--object-streams=generate','--recompress-flate','--compression-level=9','/input.pdf','/output.pdf']:['--password='+event.data.password,'--decrypt','/input.pdf','/output.pdf']);}
    catch(error){if(typeof error==='number')code=error;else if(typeof error.status==='number')code=error.status;else throw error;}
    if(code!==0&&code!==3){
      if(errors.some(line=>/password/i.test(line)))throw new Error(encrypt?'原 PDF 開啟密碼不正確或未填寫，請輸入原密碼後重試':'開啟密碼不正確或未填寫，請輸入正確密碼後重試');
      if(encrypt)throw Error('無法加密此 PDF，請確認原密碼、檔案完整且為標準 PDF');
      throw new Error('無法解除此 PDF：請確認開啟密碼正確、檔案完整且為標準 PDF 加密格式');
    }
    const bytes=qpdf.FS.readFile('/output.pdf');
    self.postMessage({bytes:bytes.buffer,warning:code===3},[bytes.buffer]);
  }catch(error){self.postMessage({error:event.data.operation==='encrypt'?(String(error.message).startsWith('原 PDF 開啟密碼')?error.message:'加密失敗：請確認原 PDF 密碼、檔案完整與網路連線後重試'):error.message||'解除保護失敗'});}
};
