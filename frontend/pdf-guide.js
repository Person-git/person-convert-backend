(function(root){
  const active=new WeakMap();
  function classify(pages){
    const noText=pages.filter(p=>p.chars===0).length,sparse=pages.filter(p=>p.chars>0&&p.chars<20).length,bad=pages.filter(p=>p.badRatio>.1).length;
    if(noText===pages.length)return {kind:'ocr',message:'未偵測到可用文字層，建議使用 OCR。也可能是空白頁或文字已轉成輪廓。'};
    if(noText||sparse||bad)return {kind:'mixed',message:'部分頁面文字不足或可能含亂碼，建議檢查後使用 OCR；混合文件可用 OCR 處理整份。'};
    return {kind:'text',message:'偵測到可選取文字，通常可直接轉 Word，不需要先跑 OCR。'};
  }
  function clear(panel){const old=active.get(panel);if(old){old.cancelled=true;old.task?.destroy().catch(()=>{});}active.delete(panel);panel.replaceChildren();}
  async function inspect(file,panel,useWord,useOcr,pageSpec=''){
    clear(panel);const state={cancelled:false,task:null};active.set(panel,state);panel.textContent='正在本機檢查文字層，文件不上傳…';
    try{
      state.task=pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())});
      if(state.cancelled){await state.task.destroy();return;}
      const pdf=await state.task.promise;
      const selected=root.AppCore.pages(pageSpec,pdf.numPages);
      const numbers=selected.length<=30?selected:Array.from({length:30},(_,i)=>selected[Math.round(i*(selected.length-1)/29)]);
      const pages=[];
      for(const number of numbers){
        if(state.cancelled)return;
        const page=await pdf.getPage(number);
        try{const content=await page.getTextContent();const text=content.items.map(i=>i.str||'').join('').replace(/\s/g,'');pages.push({chars:text.length,badRatio:(text.match(/[\uFFFD\u0000-\u0008]/g)||[]).length/Math.max(1,text.length)});}finally{page.cleanup();}
        if(state.cancelled)return;
        panel.textContent=`本機文字層檢查 ${pages.length} / ${numbers.length} 頁…`;
      }
      if(state.cancelled)return;
      const result=classify(pages);panel.replaceChildren();
      const title=document.createElement('strong');title.textContent=result.message;panel.append(title);
      const note=document.createElement('div');note.textContent=`${selected.length>30?'抽樣檢查 30 / '+selected.length+' 個指定頁面':'已檢查 '+selected.length+' 個指定頁面'}。這是初步判斷；圖片內的文字、閱讀順序與辨識品質仍需校對。`;panel.append(note);
      const actions=document.createElement('div');actions.className='row';
      for(const [label,action] of [['改用直接擷取文字',useWord],['改用 OCR',useOcr]]){const b=document.createElement('button');b.className='run';b.type='button';b.textContent=label;b.onclick=action;actions.append(b);}panel.append(actions);
      return result;
    }catch(error){if(!state.cancelled)panel.textContent=error.name==='PasswordException'?'此 PDF 需要開啟密碼，請先使用「09 解除 PDF 保護」，再重新選檔。':root.AppCore.errorMessage(error);}
    finally{if(state.task)await state.task.destroy().catch(()=>{});}
  }
  if(typeof module!=='undefined')module.exports={classify};else root.PdfGuide={inspect,clear};
})(typeof globalThis!=='undefined'?globalThis:this);
