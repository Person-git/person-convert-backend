/* Local PDF exports. No document data is sent to a server. */
(function(root){
  'use strict';
  function textRows(items){
    const rows=[];
    const sorted=items.filter(i=>i.str?.trim()).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5],width:i.width,height:Math.abs(i.height)||10})).sort((a,b)=>b.y-a.y||a.x-b.x);
    for(const item of sorted){
      let row=rows.find(r=>Math.abs(r.y-item.y)<=Math.max(2,Math.min(r.height,item.height)*.3));
      if(!row){row={y:item.y,height:item.height,items:[]};rows.push(row);}
      row.items.push(item);
    }
    const merged=rows.map(row=>{
      const cells=[];
      for(const item of row.items.sort((a,b)=>a.x-b.x)){
        const prev=cells.at(-1);
        if(prev&&item.x-prev.end<=Math.max(4,item.height*.8)){prev.text+=' '+item.text;prev.end=Math.max(prev.end,item.x+item.width);}
        else cells.push({x:item.x,end:item.x+item.width,text:item.text});
      }
      return cells;
    });
    const columns=[];
    for(const cells of merged)for(const cell of cells){if(!columns.some(x=>Math.abs(x-cell.x)<8))columns.push(cell.x);}
    columns.sort((a,b)=>a-b);
    return merged.map(cells=>{const row=[];for(const c of cells){const index=columns.reduce((best,x,i)=>Math.abs(x-c.x)<Math.abs(columns[best]-c.x)?i:best,0);row[index]=row[index]?row[index]+' '+c.text:c.text;}return row;});
  }
  let sheetLoader;
  function loadSheets(){
    if(root.XLSX)return Promise.resolve(root.XLSX);
    if(!sheetLoader)sheetLoader=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      const timer=setTimeout(()=>{sheetLoader=null;script.remove();reject(new Error('Excel 套件下載逾時，請確認網路後重試'));},30000);
      script.onload=()=>{clearTimeout(timer);root.XLSX?resolve(root.XLSX):reject(new Error('Excel 套件載入失敗'));};
      script.onerror=()=>{clearTimeout(timer);sheetLoader=null;script.remove();reject(new Error('無法下載 Excel 套件，請確認網路後重試'));};document.head.appendChild(script);
    });
    return sheetLoader;
  }
  async function run(kind,file,pageValue='',options={}){
    const button=document.getElementById('btn-'+kind),status='status-'+kind;
    if(!file||button.dataset.busy)return;
    button.dataset.busy='1';button.disabled=true;
    const backendProgress=document.getElementById(status+'-progress');if(backendProgress)backendProgress.hidden=true;
    const progress=document.getElementById(status+'-local-progress')||Object.assign(document.createElement('progress'),{id:status+'-local-progress',className:'conversion-progress',max:100});
    document.getElementById(status).before(progress);progress.hidden=false;progress.value=0;
    let task;const preserve=kind==='docx'&&document.getElementById('word-preserve').checked;
    try{
      if(file.size>50*1024*1024)throw new Error('請使用小於 50 MB 的 PDF');
      setStatus(status,'讀取 PDF · 全程在瀏覽器處理');
      const sheets=kind==='xlsx'?await AppTasks.wait(loadSheets()):null;AppTasks.check();
      task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),fontExtraProperties:kind==='svg'||preserve,isOffscreenCanvasSupported:false});AppTasks.watch(task);const pdf=await task.promise;
      const allNumbers=AppCore.pages(pageValue,pdf.numPages),numbers=options.trial?allNumbers.slice(0,1):allNumbers;
      let tableCount=0;const workbook=sheets?sheets.utils.book_new():null,zip=kind==='svg'?new JSZip():null;let textCount=0,singleSvg,imageBytes=0;const texts=[];
      for(let i=0;i<numbers.length;i++){
        await AppTasks.step(i,numbers.length,'轉換頁面');
        const page=await pdf.getPage(numbers[i]);
        try{
          if(sheets){
            const content=await page.getTextContent();const rows=textRows(content.items);textCount+=rows.length;
            sheets.utils.book_append_sheet(workbook,sheets.utils.aoa_to_sheet(rows),`Page ${numbers[i]}`);
          }else if(kind==='docx'){
            if(preserve){
              const viewport=page.getViewport({scale:1}),scale=Math.min(200/72,4096/Math.max(viewport.width,viewport.height),Math.sqrt(8000000/(viewport.width*viewport.height))),canvas=document.createElement('canvas'),view=page.getViewport({scale});
              canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
              try{const render=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:view,background:'#fff'});const stop=AppTasks.watch(render);try{await render.promise;}finally{stop?.();}
                const rich=await PDFFidelity.nativePage(page,canvas,scale);
                if(!rich)throw new Error('此頁沒有足夠的文字層，請選擇 OCR 處理方式以保留圖片');
                if(root.WordGeometry)await root.WordGeometry.improve(rich,page,()=>document.createElement('canvas'),AppTasks.signal);
                imageBytes+=((rich.image?.length||0)+(rich.pictures||[]).reduce((n,p)=>n+p.image.length,0))*.75;if(imageBytes>30*1024*1024)throw new Error('圖片圖層超過 30 MB，請減少頁數再試');
                textCount+=rich.lines.length+(rich.tables?.length||0);tableCount+=rich.tables?.length||0;texts.push(rich);
              }finally{canvas.width=canvas.height=0;}
            }else{const content=await page.getTextContent();const rows=textRows(content.items);textCount+=rows.length;texts.push(rows.map(row=>row.join('\t')).join('\n'));}
          }else{
            const graphics=new pdfjsLib.SVGGraphics(page.commonObjs,page.objs,true);graphics.embedFonts=true;
            const svg=await graphics.getSVG(await page.getOperatorList(),page.getViewport({scale:1}));
            singleSvg=new XMLSerializer().serializeToString(svg);zip.file(`page-${String(numbers[i]).padStart(3,'0')}.svg`,singleSvg);
          }
        }finally{page.cleanup();}
        progress.value=Math.round((i+1)/numbers.length*95);setStatus(status,`處理中 ${progress.value}% · ${i+1} / ${numbers.length} 頁`);
        await AppTasks.step(i+1,numbers.length,'轉換頁面');
      }
      AppTasks.phase('產生下載檔案');
      if(kind==='docx'){
        if(!textCount)throw new Error('沒有可選取文字，請改用 OCR → Word');
        const blob=await OCRWord.createDocx(texts,JSZip,preserve);if(options.trial)await root.WordTrial.show(file,numbers[0],texts[0],preserve,blob);else if(root.WordSession)root.WordSession.publish(blob,file.name.replace(/\.pdf$/i,'')+(preserve?'-images-fonts.docx':'-text.docx'));else download(blob,preserve?'images-fonts.docx':'text-converted.docx');
      }else if(sheets){
        if(!textCount)throw new Error('沒有可擷取的文字，掃描圖片與輪廓文字需先 OCR');
        download(new Blob([sheets.write(workbook,{bookType:'xlsx',type:'array',compression:true})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'converted.xlsx');
      }else if(numbers.length===1)download(new Blob([singleSvg],{type:'image/svg+xml'}),`page-${numbers[0]}.svg`);
      else download(await zip.generateAsync({type:'blob',compression:'DEFLATE'}),'pages-svg.zip');
      const geometry=texts.reduce((a,p)=>{a.pictures+=p.pictures?.length||0;a.paragraphs+=p.geometryStats?.paragraphs||0;a.substituted+=p.geometryStats?.substituted||0;a.widthAdjusted+=p.geometryStats?.widthAdjusted||0;return a;},{pictures:0,paragraphs:0,substituted:0,widthAdjusted:0});
      progress.value=100;setStatus(status,`完成 100% · ${numbers.length} 頁 · ${kind==='docx'?(preserve?`圖片圖層與可編輯文字；${geometry.pictures} 個獨立圖片裁切物件、${geometry.paragraphs} 個連續段落，${geometry.substituted} 處字型替代、${geometry.widthAdjusted} 處文字寬度校正，請校對${tableCount?'；'+tableCount+' 個簡單表格可編輯':''}`:'文字版 Word，不保留原排版'):sheets?'請校對 Excel 列欄與數值':'請檢查 SVG 字型與特殊效果'}`);
    }catch(error){progress.hidden=true;setStatus(status,error,true);}
    finally{if(task)await task.destroy().catch(()=>{});delete button.dataset.busy;button.disabled=false;}
  }
  root.LocalConvert={run,textRows};
  if(typeof module!=='undefined')module.exports={textRows};
})(typeof window!=='undefined'?window:globalThis);
