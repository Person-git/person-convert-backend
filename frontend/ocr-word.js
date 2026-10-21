(function(root){
  'use strict';
  const OCR_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
  const OCR_OPTIONS={
    workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
    corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
    langPath:'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@87416418657359cb625c412a48b6e1d6d41c29bd',gzip:false
  };
  function reviewWords(blocks,page,height,lines=[],width=null){
    const key=b=>b?`${b.x0},${b.y0},${b.x1},${b.y1}`:'';
    const retained=new Map(lines.flatMap(l=>l.runs||[l]).filter(r=>r.rasterOnly).map(r=>[key(r.bbox),r.retainedReason||'保留原圖']));
    const seen=new Set(),items=[];
    for(const block of blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]){
      const crowded=new Set(),words=line.words||[];
      // Only substantial source-box overlap, not normal tight spacing. This
      // is a source-geometry hint, never a claim about rendered Word output.
      const ordered=words.filter(w=>validBox(w.bbox)).slice().sort((a,b)=>a.bbox.x0-b.bbox.x0);
      for(let i=0;i<ordered.length;i++)for(let j=i+1;j<Math.min(ordered.length,i+65)&&ordered[j].bbox.x0<ordered[i].bbox.x1;j++){
        const a=ordered[i].bbox,b=ordered[j].bbox;if(key(a)===key(b)&&ordered[i].text===ordered[j].text)continue;
        if(Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>Math.max(1,Math.min(a.x1-a.x0,b.x1-b.x0)*.08)&&Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>Math.min(a.y1-a.y0,b.y1-b.y0)*.5){crowded.add(ordered[i]);crowded.add(ordered[j]);}
      }
      for(const word of words){
        const text=word.text?.trim(),confidence=word.confidence,keep=retained.get(key(word.bbox))||null;
        const low=Number.isFinite(confidence)&&confidence<80&&/[\p{L}\p{N}]/u.test(text||'');
        if(!text||(!low&&!keep&&!crowded.has(word)))continue;
        const identity=key(word.bbox)+'|'+text;if(seen.has(identity))continue;seen.add(identity);
        items.push({page,sourceWidth:width,sourceHeight:height,text:text.slice(0,120),confidence:Number.isFinite(confidence)?Math.max(0,Math.min(100,Math.round(confidence))):null,position:validBox(word.bbox)&&height>0?Math.max(0,Math.min(100,Math.round(word.bbox.y0/height*100))):null,retained:keep,reasons:[...(low?['low']:[]),...(keep?['retained']:[]),...(crowded.has(word)?['crowded']:[])],bbox:validBox(word.bbox)?{...word.bbox}:null,contextBox:validBox(line.bbox)?{...line.bbox}:validBox(word.bbox)?{...word.bbox}:null,contextText:(line.text||words.map(w=>w.text).join(' ')||text).slice(0,400)});
      }
    }
    return items;
  }
  function validBox(b){return b&&['x0','y0','x1','y1'].every(k=>Number.isFinite(b[k]))&&b.x1>b.x0&&b.y1>b.y0;}
  function reviewReasons(item){return item.reasons||[...(item.confidence!==null&&item.confidence<80?['low']:[]),...(item.retained?['retained']:[])];}
  function reviewCounts(items){const counts={low:0,retained:0,crowded:0};for(const item of items)for(const reason of reviewReasons(item))if(reason in counts)counts[reason]++;return counts;}
  function reviewNote(item){return reviewReasons(item).map(reason=>({low:'低信心',retained:`${item.retained||'保留原圖'}，保留原圖不可編輯`,crowded:'來源字框可能擁擠（非 Word 渲染判定）'}[reason])).filter(Boolean).join(' · ');}
  function reviewPriority(text){return /\d|^(?:mg|kg|mm|cm|ml|mL|µg|μg|mmHg|kPa|°C|%)$/i.test(text)?0:/^[A-Z][A-Za-z-]{2,}$/.test(text)?1:2;}
  function reviewText(review){
    return ['OCR 校對清單',`共 ${review.total} 個待校對項目；列出 ${review.items.length} 個。`, `OCR 檢查 ${review.pages||0} 頁；${review.unavailable||0} 頁未取得信心資料。原文字層略過 OCR 的頁面不在此檢查範圍。`, '信心分數不是正確率；未標示不代表正確，數字、單位與專有名詞仍需核對。',...review.items.map(r=>`第 ${r.page} 頁 · 距頂端 ${r.position??'?'}% · 信心 ${r.confidence===null?'未提供':r.confidence+'/100'} · ${r.text} · ${reviewNote(r)}`)].join('\n');
  }
  function clearReview(){
    root.WordSession?.closePreview();
    const panel=document.getElementById('ocr-review');if(!panel)return;
    panel.hidden=true;panel.open=false;
    document.getElementById('ocr-review-list').replaceChildren();
    document.getElementById('ocr-review-summary').textContent='OCR 校對清單';
    document.getElementById('btn-review-download').onclick=null;
    const filter=document.getElementById('ocr-review-filter');if(filter){filter.value='all';filter.onchange=null;}
  }
  function showReview(review,name){
    const panel=document.getElementById('ocr-review');if(!panel)return;
    const list=document.getElementById('ocr-review-list');list.replaceChildren();
    document.getElementById('ocr-review-summary').textContent=review.total?`建議校對 ${review.total} 個項目（列出 ${review.items.length} 個）`:review.unavailable?'OCR 校對清單：部分頁面未取得信心資料':review.pages?'OCR 校對清單：未偵測到待校對項目':'本次使用原文字層，未執行 OCR 校對';
    document.getElementById('ocr-review-coverage').textContent=`OCR 檢查 ${review.pages||0} 頁；${review.unavailable||0} 頁未取得信心資料。原文字層略過 OCR 的頁面不在此檢查範圍。`;
    const counts=review.counts||reviewCounts(review.items),filter=document.getElementById('ocr-review-filter');
    document.getElementById('ocr-review-coverage').textContent+=` 低信心 ${counts.low}、保留原圖 ${counts.retained}、來源字框可能擁擠 ${counts.crowded}；同一項目可有多種提示。`;
    const render=()=>{list.replaceChildren();const selected=filter?.value||'all';
    for(const item of [...review.items].filter(item=>selected==='all'||reviewReasons(item).includes(selected)).sort((a,b)=>reviewPriority(a.text)-reviewPriority(b.text)||(a.confidence??100)-(b.confidence??100))){
      const row=document.createElement('li'),location=document.createElement('span'),word=document.createElement('mark'),note=document.createElement('span');
      location.textContent=`第 ${item.page} 頁 · 距頂端 ${item.position??'?'}% · `;
      word.textContent=item.text;
      note.textContent=` · 信心 ${item.confidence===null?'未提供':item.confidence+'/100'} · ${reviewNote(item)}`;
      row.append(location,word,note);
      if(root.WordSession?.highlightBox(item)){const locate=document.createElement('button');locate.type='button';locate.className='preview-button';locate.textContent='在原頁定位';locate.onclick=()=>void root.WordSession.locate(item);row.append(locate);}
      if(item.image){const details=document.createElement('details'),summary=document.createElement('summary'),image=document.createElement('img');summary.textContent='查看原圖與上下文';image.className='ocr-source';image.src=item.image;image.alt=`第 ${item.page} 頁原圖字詞局部`;image.loading='lazy';details.append(summary,image);if(item.contextImage){const context=document.createElement('img');context.src=item.contextImage;context.alt=`第 ${item.page} 頁同列上下文`;context.className='review-context';context.loading='lazy';details.append(context);}const contextText=document.createElement('p');contextText.textContent='同列辨識（仍可能有誤）：'+(item.contextText||item.text);details.append(contextText);row.append(details);}list.appendChild(row);
    }
    if(!list.children.length){const empty=document.createElement('li');empty.textContent='目前列出的項目中沒有此類提示；若已達 200 項上限，其他項目可能未列出。';list.append(empty);}
    };if(filter){filter.value='all';filter.onchange=render;}render();
    document.getElementById('btn-review-download').onclick=()=>{
      const url=URL.createObjectURL(new Blob([reviewText(review)],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
      link.href=url;link.download=name.replace(/\.pdf$/i,'')+'-review.txt';document.body.appendChild(link);link.click();link.remove();root.AppTasks?.downloaded();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    panel.hidden=false;
  }
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
    if(layout)pages.forEach((page,index)=>{for(const [n,picture] of (page.pictures||[]).entries()){imageBytes+=picture.image.length*.75;if(imageBytes>30*1024*1024)throw new Error('圖片圖層超過 30 MB，請減少頁數再試');zip.file(`word/media/picture-${index+1}-${n+1}.png`,picture.image,{base64:true});imageRelations+=`<Relationship Id="rPicture${index+1}_${n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/picture-${index+1}-${n+1}.png"/>`;}if(page.image){imageBytes+=page.image.length*.75;if(imageBytes>30*1024*1024)throw new Error('圖片圖層超過 30 MB，請減少頁數再試');zip.file(`word/media/page-${index+1}.png`,page.image,{base64:true});imageRelations+=`<Relationship Id="rImage${index+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page-${index+1}.png"/>`;}});
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
  async function recognizePages(pdf,worker,createCanvas,onPage,signal,layout=false,reflow=true,preserve=false,preferNative=false,review=null,numbers=Array.from({length:pdf.numPages},(_,i)=>i+1)){
    const texts=[],styleCache=new Map();let imageBytes=0;
    const account=image=>{imageBytes+=(image?.length||0)*.75;if(imageBytes>30*1024*1024)throw new Error('圖片圖層超過 30 MB，請減少頁數再試');};
    for(let index=0;index<numbers.length;index++){
      const number=numbers[index];
      checkAbort(signal);
      onPage(index+1,numbers.length,'render',0,number);
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
        onPage(index+1,numbers.length,'recognize',0,number);
        if(preserve&&preferNative){const native=await root.PDFFidelity.nativePage(page,canvas,scale,signal);if(native){if(root.WordGeometry)await root.WordGeometry.improve(native,page,createCanvas,signal);account(native.image);for(const picture of native.pictures||[])account(picture.image);texts.push(native);onPage(index+1,numbers.length,'done',0,number);continue;}}
        const result=await abortable(worker.recognize(canvas,{},layout||reflow||review?{text:true,blocks:true}:{text:true}),signal);
        let reviewedLines=[];
        if(layout){
          let lines=root.OCRLayout.linesFromBlocks(result.data.blocks);const context=canvas.getContext('2d');
          for(const line of lines){const cjk=/[\u3400-\u9fff]/.test(line.text);context.font='100px '+(cjk?'Microsoft JhengHei':'Arial');const units=context.measureText(line.text.trim()).width/100;const height=(line.bbox.y1-line.bbox.y0)/scale;line.fontSize=Math.min(height*(cjk?1.08:1.22),(line.bbox.x1-line.bbox.x0)/scale/Math.max(.01,units));}
          let masks=lines,retained=0,styleStats=null;const grids=preserve&&root.PageStructure?root.PageStructure.detect(canvas):[];
          if(root.OCRStyle){
            onPage(index+1,numbers.length,'style',0,number);
            const styled=await root.OCRStyle.analyze(lines,canvas,scale,createCanvas,signal,(done,count)=>onPage(index+1,numbers.length,'style',Math.round(done/Math.max(1,count)*100),number),styleCache);
            lines=styled.lines;styleStats=styled.stats;
          }
          if(preserve)onPage(index+1,numbers.length,'graphics',0,number);
          if(preserve&&root.PDFFidelity.prepareOcrOverlay){const regions=await root.PDFFidelity.smallImageRegions(page);checkAbort(signal);const overlay=root.PDFFidelity.prepareOcrOverlay(lines,scale,regions,base.height,canvas,grids);masks=overlay.masks;retained=overlay.retained;}
          const image=preserve?await root.PDFFidelity.graphics(page,canvas,scale,masks,false,signal):null;

          reviewedLines=lines;
          const structured=preserve&&root.PageStructure?root.PageStructure.tables(lines,grids,scale):{lines,tables:[]};
          const output={text:result.data.text||'',width:base.width,height:base.height,scale,lines:structured.lines,tables:structured.tables,image,styleStats,retained};
          if(preserve&&root.WordGeometry)await root.WordGeometry.improve(output,page,createCanvas,signal);account(output.image);for(const picture of output.pictures||[])account(picture.image);texts.push(output);
        }else if(reflow){
          const flow=typeof module!=='undefined'?require('./ocr-flow.js'):root.OCRFlow;
          texts.push(flow.textFromBlocks(result.data.blocks,result.data.text||''));
        }else texts.push(result.data.text||'');
        if(review){
          review.pages=(review.pages||0)+1;
          const hasScores=(result.data.blocks||[]).some(b=>(b.paragraphs||[]).some(p=>(p.lines||[]).some(l=>(l.words||[]).some(w=>Number.isFinite(w.confidence)))));
          if(!hasScores)review.unavailable=(review.unavailable||0)+1;
          const items=reviewWords(result.data.blocks,number,canvas.height,reviewedLines,canvas.width);review.total+=items.length;const counts=reviewCounts(items);review.counts=review.counts||{low:0,retained:0,crowded:0};for(const key of Object.keys(counts))review.counts[key]+=counts[key];
          const kept=items.slice(0,Math.max(0,200-review.items.length));
          if(typeof document!=='undefined'&&root.WorkspaceTools){for(const item of kept){
            if((review.imageBytes||0)>=2*1024*1024)break;
            const box=root.WorkspaceTools.cropBox(item.bbox,canvas.width,canvas.height);if(!box)continue;
            const crop=createCanvas();try{crop.width=box.width;crop.height=box.height;crop.getContext('2d').drawImage(canvas,box.x,box.y,box.w,box.h,0,0,box.width,box.height);const image=crop.toDataURL('image/png');if((review.imageBytes||0)+image.length*2<=2*1024*1024){item.image=image;review.imageBytes=(review.imageBytes||0)+image.length*2;}}finally{crop.width=crop.height=0;}
          }}
          if(typeof document!=='undefined'&&root.WordTrial){for(const item of kept){if((review.imageBytes||0)>=2*1024*1024)break;const box=root.WordTrial.contextBox(item.contextBox,canvas.width,canvas.height);if(!box)continue;const crop=createCanvas();try{crop.width=box.width;crop.height=box.height;crop.getContext('2d').drawImage(canvas,box.x,box.y,box.w,box.h,0,0,box.width,box.height);const image=crop.toDataURL('image/png');if((review.imageBytes||0)+image.length*2<=2*1024*1024){item.contextImage=image;review.imageBytes=(review.imageBytes||0)+image.length*2;}}finally{crop.width=crop.height=0;}}}
          review.items.push(...kept);
        }
        onPage(index+1,numbers.length,'done',0,number);
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
      const timer=setTimeout(()=>{scriptPromise=null;script.remove();reject(new Error('OCR 套件下載逾時，請確認網路後重試'));},30000);
      script.onload=()=>{clearTimeout(timer);resolve();};
      script.onerror=()=>{clearTimeout(timer);scriptPromise=null;script.remove();reject(new Error('無法下載 OCR 套件，請確認網路後重試'));};
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
    function message(text,error=false){root.AppTasks?.observe(text,error);status.textContent=text;status.className='status'+(error?' err':'');}
    cancel.onclick=()=>controller?.abort();
    root.OCRWord.runFile=async(file,options={})=>{
      if(!file||controller)return;
      root.WordSession?.setFile(file);clearReview();const review={total:0,items:[],pages:0,unavailable:0};
      const outputMode=document.getElementById('ocr-output-mode');const preserve=document.getElementById('word-preserve').checked,layout=preserve||outputMode.value==='layout',reflow=outputMode.value!=='raw';outputMode.disabled=true;
      root.PdfGuide.clear(document.getElementById('guide-docx'));
      const language=document.getElementById('ocr-language');
      const languages=language.value;const label=language.selectedOptions[0].textContent;language.disabled=true;
      const selected=file;controller=new AbortController();const signal=controller.signal;const external=root.AppTasks?.signal,onExternal=()=>controller?.abort();external?.addEventListener('abort',onExternal,{once:true});if(external?.aborted)controller.abort();
      button.disabled=true;cancel.disabled=false;input.disabled=true;bar.hidden=false;bar.removeAttribute('value');
      const started=performance.now();let worker=null,pdf=null,loadingTask=null,current=0,total=0,phase='準備檔案';
      const timings={prepare:0,render:0,recognize:0,style:0,graphics:0,docx:0};
      let timingStage='prepare',stageStarted=started;
      const markStage=stage=>{if(stage===timingStage)return;const now=performance.now();if(timingStage)timings[timingStage]+=now-stageStarted;timingStage=stage;stageStarted=now;};
      const elapsed=()=>Math.floor((performance.now()-started)/1000);
      const update=()=>message(`${phase} · 已用 ${elapsed()} 秒`);
      const timer=setInterval(update,1000);
      try{
        loadingTask=root.pdfjsLib.getDocument({data:new Uint8Array(await selected.arrayBuffer()),fontExtraProperties:preserve,isOffscreenCanvasSupported:false});
        const abortPdf=()=>{void loadingTask.destroy();};
        signal.addEventListener('abort',abortPdf,{once:true});
        try{pdf=await abortable(loadingTask.promise,signal);}finally{signal.removeEventListener('abort',abortPdf);}
        const allNumbers=root.AppCore.pages(document.getElementById('docx-pages').value,pdf.numPages),numbers=options.trial?allNumbers.slice(0,1):allNumbers;total=numbers.length;
        phase=`載入${label} OCR（首次使用需下載語言資料）`;update();
        await abortable(loadOcr(),signal);checkAbort(signal);
        const workerPromise=root.Tesseract.createWorker(languages,1,{...OCR_OPTIONS,logger:entry=>{
          if(signal.aborted)return;
          if(entry.status==='recognizing text'&&current){
            const fraction=Math.max(0,Math.min(1,Number(entry.progress)||0));
            bar.value=Math.min(99,Math.floor(((current-1)+fraction)/total*100));
            root.AppTasks?.report(Number(bar.value)||0);phase=`OCR ${bar.value}% · 第 ${current}/${total} 頁，本頁 ${Math.floor(fraction*100)}%`;update();
          }
        }});
        workerPromise.then(created=>{if(signal.aborted)void created.terminate();},()=>{});
        worker=await abortable(workerPromise,signal);
        await abortable(worker.setParameters({tessedit_pageseg_mode:'3',user_defined_dpi:'200'}),signal);
        const texts=await recognizePages(pdf,worker,()=>document.createElement('canvas'),(number,count,stage,stylePercent=0,sourcePage=number)=>{
          current=number;total=count;
          markStage(stage==='done'?null:stage);
          phase=stage==='render'?`準備第 ${number}/${count} 頁`:stage==='style'?`比對字型與粗斜體 ${stylePercent}% · 第 ${number}/${count} 頁`:stage==='graphics'?`保留圖片與符號 · 第 ${number}/${count} 頁`:stage==='done'?`已辨識 ${number}/${count} 頁`:`辨識第 ${number}/${count} 頁`;
          if(stage!=='style')bar.value=Math.min(99,Math.floor((number-(stage==='done'?0:1))/count*100));root.AppTasks?.report(Number(bar.value)||0);phase+=`（原第 ${sourcePage} 頁）`;update();
        },signal,layout,reflow,preserve,options.preferNative,review,numbers);
        checkAbort(signal);
        if(!texts.some(text=>(layout?text.text:text).trim()||(preserve&&text.image)))throw new Error('沒有辨識到文字，請確認畫面清晰並選擇正確語言');
        if(layout&&texts.some(page=>page.text.trim()&&!page.lines.length))throw new Error('未取得排版座標，請改用可編輯文字版');
        markStage('docx');root.AppTasks?.phase('產生 Word');phase='辨識完成，產生可編輯 Word';bar.removeAttribute('value');update();
        const blob=await abortable(createDocx(texts,root.JSZip,layout),signal);checkAbort(signal);
        markStage(null);
        root.AppTasks?.check();if(options.trial){await root.WordTrial.show(selected,numbers[0],texts[0],layout,blob);}else if(root.WordSession){root.WordSession.publish(blob,selected.name.replace(/\.pdf$/i,'')+(preserve?'-images-fonts.docx':layout?'-ocr-layout.docx':'-ocr.docx'));}else{const url=URL.createObjectURL(blob),link=document.createElement('a');
        link.href=url;link.download=selected.name.replace(/\.pdf$/i,'')+(preserve?'-images-fonts.docx':layout?'-ocr-layout.docx':'-ocr.docx');
        document.body.appendChild(link);link.click();link.remove();root.AppTasks?.downloaded();setTimeout(()=>URL.revokeObjectURL(url),1000);}
        showReview(review,selected.name);
        const styleTotals=texts.reduce((sum,page)=>{if(page.styleStats)for(const key of ['matched','uncertain','inherited','bold','italic'])sum[key]+=page.styleStats[key];return sum;},{matched:0,uncertain:0,inherited:0,bold:0,italic:0});
        const styleNote=layout&&texts.some(page=>page.styleStats)?`；視覺比對 ${styleTotals.matched} 詞、鄰近樣式推估 ${styleTotals.inherited} 詞（粗體 ${styleTotals.bold}、斜體 ${styleTotals.italic}），${styleTotals.uncertain} 詞樣式不確定，請校對；僅孤立短行保守保留原圖`:'';
        const tableCount=texts.reduce((sum,page)=>sum+(page.tables?.length||0),0);
        const retained=texts.reduce((sum,page)=>sum+(page.retained||0),0),retainedNote=retained?`；${retained} 個字詞／符號因信心、圖示、頁尾或交界保護而保留原圖，不可直接編輯`:'';
        const timingNote=Object.entries(timings).filter(([,ms])=>ms>=50).map(([key,ms])=>`${({prepare:'準備',render:'頁面',recognize:'OCR',style:'字型',graphics:'圖片',docx:'Word'})[key]} ${(ms/1000).toFixed(1)} 秒`).join('／');
        const geometry=texts.reduce((a,p)=>{for(const k of ['substituted','widthAdjusted','paragraphs'])a[k]+=p.geometryStats?.[k]||0;a.pictures+=(p.pictures||[]).length;return a;},{substituted:0,widthAdjusted:0,paragraphs:0,pictures:0});
        const geometryNote=preserve?`；${geometry.pictures} 個獨立圖片裁切物件、${geometry.paragraphs} 個連續段落，${geometry.substituted} 處字型替代、${geometry.widthAdjusted} 處文字寬度校正`:'';
        bar.value=100;message(`完成 100% · ${total} 個指定頁面 · 共 ${((performance.now()-started)/1000).toFixed(1)} 秒；${preserve?'圖片圖層與可編輯文字，OCR 字型為估計，請校對背景與字型':layout?'保留文字位置（實驗版），文字框可編輯，請校對位置與內容':reflow?'可編輯文字版，段落／欄序整理模式，請校對辨識結果':'原始換行文字，未重排，請校對辨識結果'}${geometryNote}${styleNote}${retainedNote}${tableCount?`；${tableCount} 個簡單表格已轉為可編輯表格`:""}；耗時：${timingNote}`);
      }catch(error){
        bar.hidden=true;
        message(signal.aborted?'已取消 OCR，未產生檔案':`OCR 失敗：${root.AppCore.errorMessage(error)}`,!signal.aborted);
      }finally{
        clearInterval(timer);external?.removeEventListener('abort',onExternal);
        if(worker)await worker.terminate().catch(()=>{});
        if(loadingTask)await loadingTask.destroy().catch(()=>{});
        controller=null;button.disabled=!file;cancel.disabled=true;input.disabled=false;language.disabled=false;outputMode.disabled=false;
      }
    };
  }
  const api={escapeXml,documentXml,createDocx,recognizePages,abortable,reviewWords,reviewText,clearReview,reviewPriority,reviewCounts,reviewReasons,reviewNote,showReview};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else{root.OCRWord=api;document.addEventListener('DOMContentLoaded',init,{once:true});}
})(typeof globalThis!=='undefined'?globalThis:this);
