/* Local experimental page graphics + editable text. Fonts are named, never embedded. */
(function(root){
  'use strict';
  function fontStyle(name='',fallback='Arial'){
    const raw=name.replace(/^[A-Z]{6}\+/,'');
    const bold=/bold|black|demi|heavy/i.test(raw),italic=/italic|oblique/i.test(raw);
    let family=raw.replace(/[-, ]?(BoldItalic|BoldOblique|SemiBold|DemiBold|Regular|Bold|Italic|Oblique|Roman)(MT)?$/i,'').replace(/(PS)?MT$/,'').replace(/PS$/,'').replace(/[-, ]+$/,'');
    if(/TimesNewRoman/i.test(raw)||/^Times-/i.test(raw))family='Times New Roman';
    else if(/^Arial(?:[-,]|MT$|$)/i.test(raw))family='Arial';
    else if(/^Calibri(?:[-,]|$)/i.test(raw))family='Calibri';
    else if(/MicrosoftJhengHei/i.test(raw))family='Microsoft JhengHei';
    else if(/MicrosoftYaHei/i.test(raw))family='Microsoft YaHei';
    else if(/Courier/i.test(raw))family='Courier New';
    return {fontFamily:family||fallback,bold,italic};
  }
  async function nativeText(page){
    const content=await page.getTextContent(),view=page.getViewport({scale:1});
    const chars=content.items.map(i=>i.str||'').join('').replace(/\s/g,'');
    if(chars.length<20||((chars.match(/\uFFFD/g)||[]).length/Math.max(1,chars.length))>.1)return null;
    const lines=content.items.filter(i=>i.str?.trim()).map(item=>{
      const t=root.pdfjsLib.Util.transform(view.transform,item.transform),size=Math.hypot(t[2],t[3]);
      let font;try{font=page.commonObjs.get(item.fontName);}catch(_){}
      const style=fontStyle(font?.name,content.styles[item.fontName]?.fontFamily||'Arial');
      const ascent=content.styles[item.fontName]?.ascent??.8;
      return {text:item.str,bbox:{x0:t[4],y0:t[5]-size*ascent,x1:t[4]+Math.max(item.width,size*.3),y1:t[5]+size*(1-ascent)},fontSize:size,...style,rotation:Math.atan2(t[1],t[0])*180/Math.PI};
    });
    return {text:content.items.map(i=>i.str||'').join(' '),width:view.width,height:view.height,scale:1,lines,native:true};
  }
  function check(signal){if(signal?.aborted){const e=new Error('已取消');e.name='AbortError';throw e;}}
  async function graphics(page,canvas,scale,lines,native,signal){
    check(signal);
    const view=page.getViewport({scale:1}),out=document.createElement('canvas');
    const factor=Math.min(150/72,2000/Math.max(view.width,view.height));
    out.width=Math.ceil(view.width*factor);out.height=Math.ceil(view.height*factor);
    const context=out.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,out.width,out.height);
    try{
      if(native){
        const svg=await new root.pdfjsLib.SVGGraphics(page.commonObjs,page.objs,true).getSVG(await page.getOperatorList(),view);
        svg.querySelectorAll('text').forEach(node=>node.remove());
        const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
        try{
          const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('無法產生圖片圖層，請改用一般文字模式'));img.src=url;});
          check(signal);context.drawImage(image,0,0,out.width,out.height);
        }finally{URL.revokeObjectURL(url);}
      }else{
        context.drawImage(canvas,0,0,out.width,out.height);
        // Remove recognised text before placing editable text above the graphic layer.
        // Scans/outlined glyphs lack object semantics: white masks are approximate.
        for(const line of lines){const b=line.bbox,pad=Math.max(1,(b.y1-b.y0)*.12)/scale;context.fillRect((b.x0/scale-pad)*factor,(b.y0/scale-pad)*factor,((b.x1-b.x0)/scale+pad*2)*factor,((b.y1-b.y0)/scale+pad*2)*factor);}
      }
      check(signal);return out.toDataURL('image/png').split(',')[1];
    }finally{out.width=out.height=0;}
  }
  async function nativePage(page,canvas,scale,signal){
    const result=await nativeText(page);if(!result)return null;
    result.image=await graphics(page,canvas,scale,result.lines,true,signal);return result;
  }
  const api={fontStyle,nativeText,nativePage,graphics};
  if(typeof module!=='undefined')module.exports=api;else root.PDFFidelity=api;
})(typeof globalThis!=='undefined'?globalThis:this);
