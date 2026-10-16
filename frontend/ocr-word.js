(function(root){
  'use strict';
  const OCR_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
  const OCR_OPTIONS={
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
    langPath:'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@87416418657359cb625c412a48b6e1d6d41c29bd',gzip:false
  };
  function escapeXml(value){
    return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  }
  function documentXml(pages){
    const body=pages.map((text,index)=>{
      const paragraphs=String(text).trim().split(/\n\s*\n/);
      return paragraphs.map((paragraph,p)=>{
        const properties=index>0&&p===0?'<w:pPr><w:pageBreakBefore/></w:pPr>':'';
        const runs=paragraph.split(/\r?\n/).map((line,i)=>`${i?'<w:r><w:br/></w:r>':''}<w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`).join('');
        return `<w:p>${properties}${runs}</w:p>`;
      }).join('');
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;
  }
  async function createDocx(pages,Zip,layout=false){
    const zip=new Zip();
    zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml',layout?root.OCRLayout.documentXml(pages):documentXml(pages));
    let imageRelations='',imageBytes=0;
    if(layout)pages.forEach((page,index)=>{if(page.image){imageBytes+=page.image.length*.75;if(imageBytes>30*1024*1024)throw new Error('圖片圖層超過 30 MB，請減少頁數再試');zip.file(`word/media/page-${index+1}.png`,page.image,{base64:true});imageRelations+=`<Relationship Id="rImage${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${index+1}.png"/>`;}});
    zip.file('word/_rels/document.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+imageRelations+'</Relationships>');
    zip.file('word/styles.xml','<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft JhengHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>');
    return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
  }
  function abortError(){const error=new Error('已取消 OCR');error.name='AbortError';return error;}
  function checkAbort(signal){if(signal.aborted)throw abortError();}
  function abortable(promise,signal){
    return new Promise((resolve,reject)=>{
      if(signal.aborted){Promise.resolve(promise).catch(()=>{});reject(abortError());return;}
      const abort=()=>reject(abortError());
      signal.addEventListener('abort',abort,{once:true});
      Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    });
  }
  async function recognizePages(pdf,worker,createCanvas,onPage,signal,layout=false,reflow=true,preserve=false,preferNative=false){
    const texts=[],styleCache=new Map();let imageBytes=0;
    const account=image=>{imageBytes+=(image?.length||0)*.75;if(imageBytes>30*1024*1024)throw new Error('圖片圖層超過 30 MB，請減少頁數再試');};
    for(let number=1;number<=pdf.numPages;number++){
      checkAbort(signal);
      onPage(number,pdf.numPages,'render');
      const page=await pdf.getPage(number), canvas=createCanvas();
      try{
        const base=page.getViewport({scale:1});
        const scale=Math.min(200/72,4096/Math.max(base.width,base.height),Math.sqrt(8000000/(base.width*base.height)));
        const viewport=page.getViewport({scale});
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        const task=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport,background:'#ffffff'});
        const cancelRender=()=>task.cancel();
        signal.addEventListener('abort',cancelRender,{once:true});
        try{await abortable(task.promise,signal);}finally{signal.removeEventListener('abort',cancelRender);}
        checkAbort(signal);
        onPage(number,pdf.numPages,'recognize');
        if(preserve&&preferNative){const native=await root.PDFFidelity.nativePage(page,canvas,scale,signal);if(native){account(native.image);texts.push(native);onPage(number,pdf.numPages,'done');continue;}}
        const result=await abortable(worker.recognize(canvas,{},layout||reflow?{text:true,blocks:true}:{text:true}),signal);
        if(layout){
          let lines=root.OCRLayout.linesFromBlocks(result.data.blocks);const context=canvas.getContext('2d');
          for(const line of lines){const cjk=/[\u3400-\u9fff]/.test(line.text);context.font='100px '+(cjk?'Microsoft JhengHei':'Arial');const units=context.measureText(line.text.trim()).width/100;const height=(line.bbox.y1-line.bbox.y0)/scale;line.fontSize=Math.min(height*(cjk?1.08:1.22),(line.bbox.x1-line.bbox.x0)/scale/Math.max(.01,units));}
          const masks=lines;let styleStats=null;
          if(root.OCRStyle){
            onPage(number,pdf.numPages,'style');
            const styled=await root.OCRStyle.analyze(lines,canvas,scale,createCanvas,signal,(done,count)=>onPage(number,pdf.numPages,'style',Math.round(done/Math.max(1,count)*100)),styleCache);
            lines=styled.lines;styleStats=styled.stats;
          }
          const image=preserve?await root.PDFFidelity.graphics(page,canvas,scale,masks,false,signal):null;
          account(image);
          texts.push({text:result.data.text||'',width:base.width,height:base.height,scale,lines,image,styleStats});
        }else if(reflow){
          const flow=typeof module!=='undefined'?require('./ocr-flow.js'):root.OCRFlow;
          texts.push(flow.textFromBlocks(result.data.blocks,result.data.text||''));
        }else texts.push(result.data.text||'');
        onPage(number,pdf.numPages,'done');
      }finally{
        canvas.width=canvas.height=0;
        page.cleanup();
      }
    }
    styleCache.clear();return texts;
  }
  let scriptPromise;
  function loadOcr(){
    if(root.Tesseract)return Promise.resolve();
    if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=OCR_SCRIPT;
      script.onload=resolve;
      script.onerror=()=>{scriptPromise=null;script.remove();reject(new Error('無法下載 OCR 套件，請確認網路後重試'));};
      document.head.appendChild(script);
    });
    return scriptPromise;
  }
  function init(){
    const input=document.getElementById('input-docx');
    if(!input)return;
    const button=document.getElementById('btn-docx'),cancel=document.getElementById('btn-ocr-cancel');
    const bar=document.getElementById('progress-ocr-word'),status=document.getElementById('status-docx');
    let controller=null;
    function message(text,error=false){status.textContent=text;status.className='status'+(error?' err':'');}
    cancel.onclick=()=>controller?.abort();
    root.OCRWord.runFile=async(file,options={})=>{
      if(!file||controller)return;
      const outputMode=document.getElementById('ocr-output-mode');const preserve=document.getElementById('word-preserve').checked,layout=preserve||outputMode.value==='layout',reflow=outputMode.value!=='raw';outputMode.disabled=true;
      root.PdfGuide.clear(document.getElementById('guide-docx'));
      const language=document.getElementById('ocr-language');
      const languages=language.value;const label=language.selectedOptions[0].textContent;language.disabled=true;
      const selected=file;controller=new AbortController();const signal=controller.signal;
      button.disabled=true;cancel.disabled=false;input.disabled=true;bar.hidden=false;bar.removeAttribute('value');
      const started=performance.now();let worker=null,pdf=null,loadingTask=null,current=0,total=0,phase='準備檔案';
      const elapsed=()=>Math.floor((performance.now()-started)/1000);
      const update=()=>message(`${phase} · 已用 ${elapsed()} 秒`);
      const timer=setInterval(update,1000);
      try{
        loadingTask=root.pdfjsLib.getDocument({data:new Uint8Array(await selected.arrayBuffer()),fontExtraProperties:preserve,isOffscreenCanvasSupported:false});
        const abortPdf=()=>{void loadingTask.destroy();};
        signal.addEventListener('abort',abortPdf,{once:true});
        try{pdf=await abortable(loadingTask.promise,signal);}finally{signal.removeEventListener('abort',abortPdf);}
        total=pdf.numPages;
        phase=`載入${label} OCR（首次使用需下載語言資料）`;update();
        await abortable(loadOcr(),signal);checkAbort(signal);
        const workerPromise=root.Tesseract.createWorker(languages,1,{...OCR_OPTIONS,logger:entry=>{
          if(signal.aborted)return;
          if(entry.status==='recognizing text'&&current){
            const fraction=Math.max(0,Math.min(1,Number(entry.progress)||0));
            bar.value=Math.min(99,Math.floor(((current-1)+fraction)/total*100));
            phase=`OCR ${bar.value}% · 第 ${current}/${total} 頁，本頁 ${Math.floor(fraction*100)}%`;update();
          }
        }});
        workerPromise.then(created=>{if(signal.aborted)void created.terminate();},()=>{});
        worker=await abortable(workerPromise,signal);
        await abortable(worker.setParameters({tessedit_pageseg_mode:'3',user_defined_dpi:'200'}),signal);
        const texts=await recognizePages(pdf,worker,()=>document.createElement('canvas'),(number,count,stage,stylePercent=0)=>{
          current=number;total=count;
          phase=stage==='render'?`準備第 ${number}/${count} 頁`:stage==='style'?`比對字型與粗斜體 ${stylePercent}% · 第 ${number}/${count} 頁`:stage==='done'?`已辨識 ${number}/${count} 頁`:`辨識第 ${number}/${count} 頁`;
          if(stage!=='style')bar.value=Math.min(99,Math.floor((number-(stage==='done'?0:1))/count*100));update();
        },signal,layout,reflow,preserve,options.preferNative);
        checkAbort(signal);
        if(!texts.some(text=>(layout?text.text:text).trim()||(preserve&&text.image)))throw new Error('沒有辨識到文字，請確認畫面清晰並選擇正確語言');
        if(layout&&texts.some(page=>page.text.trim()&&!page.lines.length))throw new Error('未取得排版座標，請改用可編輯文字版');
        phase='辨識完成，產生可編輯 Word';bar.removeAttribute('value');update();
        const blob=await abortable(createDocx(texts,root.JSZip,layout),signal);checkAbort(signal);
        const url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download=selected.name.replace(/\.pdf$/i,'')+(preserve?'-images-fonts.docx':layout?'-ocr-layout.docx':'-ocr.docx');
        document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        const styleTotals=texts.reduce((sum,page)=>{if(page.styleStats)for(const key of ['matched','uncertain','inherited','bold','italic'])sum[key]+=page.styleStats[key];return sum;},{matched:0,uncertain:0,inherited:0,bold:0,italic:0});
        const styleNote=layout&&texts.some(page=>page.styleStats)?`；視覺比對 ${styleTotals.matched} 詞、同列推估 ${styleTotals.inherited} 詞（粗體 ${styleTotals.bold}、斜體 ${styleTotals.italic}），${styleTotals.uncertain} 詞採一般替代樣式，請校對`:'';
        bar.value=100;message(`完成 100% · ${total} 頁 · 共 ${((performance.now()-started)/1000).toFixed(1)} 秒；${preserve?'圖片圖層與可編輯文字，OCR 字型為估計，請校對背景與字型':layout?'保留文字位置（實驗版），文字框可編輯，請校對位置與內容':reflow?'可編輯文字版，段落／欄序整理模式，請校對辨識結果':'原始換行文字，未重排，請校對辨識結果'}${styleNote}`);
      }catch(error){
        bar.hidden=true;
        message(signal.aborted?'已取消 OCR，未產生檔案':`OCR 失敗：${error.name==='PasswordException'?'PDF 有密碼保護，請先解鎖':error.message}`,!signal.aborted);
      }finally{
        clearInterval(timer);
        if(worker)await worker.terminate().catch(()=>{});
        if(loadingTask)await loadingTask.destroy().catch(()=>{});
        controller=null;button.disabled=!file;cancel.disabled=true;input.disabled=false;language.disabled=false;outputMode.disabled=false;
      }
    };
  }
  const api={escapeXml,documentXml,createDocx,recognizePages,abortable};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else{root.OCRWord=api;document.addEventListener('DOMContentLoaded',init,{once:true});}
})(typeof globalThis!=='undefined'?globalThis:this);
