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
  async function smallImageRegions(page){
    const ops=root.pdfjsLib?.OPS;if(!ops)return [];
    const view=page.getViewport({scale:1}),list=await page.getOperatorList(),regions=[],stack=[];
    const multiply=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
    let matrix=view.transform.slice();
    for(let i=0;i<list.fnArray.length;i++){
      const op=list.fnArray[i],args=list.argsArray[i];
      if(op===ops.save)stack.push(matrix.slice());
      else if(op===ops.restore)matrix=stack.pop()||view.transform.slice();
      else if(op===ops.transform)matrix=multiply(matrix,args);
      else if([ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject].filter(Number.isFinite).includes(op)){
        const points=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>[matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
        const r={x0:Math.min(...points.map(p=>p[0])),x1:Math.max(...points.map(p=>p[0])),y0:Math.min(...points.map(p=>p[1])),y1:Math.max(...points.map(p=>p[1]))};
        if((r.x1-r.x0)*(r.y1-r.y0)<view.width*view.height*.12)regions.push(r);
      }
    }
    return regions;
  }
  function footerLines(lines,scale,pageHeight){
    const found=new Set();if(!Number.isFinite(pageHeight)||pageHeight<=0)return found;
    const rows=[];
    const geometry=lines.map(line=>{const boxes=line.runs?.map(r=>r.bbox).filter(Boolean)||[];const b=line.bbox||(boxes.length?{x0:Math.min(...boxes.map(b=>b.x0)),y0:Math.min(...boxes.map(b=>b.y0)),x1:Math.max(...boxes.map(b=>b.x1)),y1:Math.max(...boxes.map(b=>b.y1))}:null);return {line,b};}).filter(x=>x.b&&x.b.y1>x.b.y0).sort((a,b)=>a.b.y0-b.b.y0);
    for(const item of geometry){
      const top=item.b.y0/scale,bottom=item.b.y1/scale,previous=rows[rows.length-1];
      if(previous&&top<previous.bottom-Math.min(bottom-top,previous.bottom-previous.top)*.3){previous.items.push(item.line);previous.top=Math.min(top,previous.top);previous.bottom=Math.max(bottom,previous.bottom);}
      else rows.push({top,bottom,items:[item.line]});
    }
    const body=rows.filter(r=>r.top>pageHeight*.1&&r.bottom<pageHeight*.88).map(r=>r.bottom-r.top).sort((a,b)=>a-b);
    if(body.length<2)return found;
    const normal=body[Math.floor(body.length/2)];let footerBottom=null;
    for(let i=1;i<rows.length;i++){
      const row=rows[i];if(row.top<pageHeight*.9)continue;
      const text=row.items.map(l=>l.text||l.runs?.map(w=>w.text).join(' ')||'').join(' ').trim();
      const height=row.bottom-row.top,gap=row.top-rows[i-1].bottom;
      const pageNumber=/^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i.test(text);
      const isolated=gap>=Math.max(normal*.9,pageHeight*.01);
      const small=height<=normal*.85&&text.length<=180;
      const continuation=footerBottom!==null&&row.top-footerBottom<=normal*1.5&&small;
      if((isolated&&(small||pageNumber))||continuation){for(const line of row.items)found.add(line);footerBottom=row.bottom;}
    }
    return found;
  }
  function prepareOcrOverlay(lines,scale,regions=[],pageHeight=Infinity,canvas=null,grids=[]){
    const footers=footerLines(lines,scale,pageHeight);
    const masks=[];let retained=0;
    for(const line of lines){
      for(const run of line.runs||[line]){
        const symbolsOnly=!/[\p{L}\p{N}]/u.test(run.text);
        const b=run.bbox,area=Math.max(1,(b.x1-b.x0)*(b.y1-b.y0));
        const insideImage=regions.some(r=>Math.max(0,Math.min(b.x1,r.x1*scale)-Math.max(b.x0,r.x0*scale))*Math.max(0,Math.min(b.y1,r.y1*scale)-Math.max(b.y0,r.y0*scale))/area>.8);
        const footer=footers.has(line);
        run.rasterOnly=footer||insideImage||run.confidence<50||symbolsOnly||run.symbolLike||run.fontSize<4||/[\uFFFD\u00a2\u00bb]/.test(run.text);
        run.retainedReason=run.rasterOnly?(footer?'頁尾':insideImage?'圖示內文字':'低信心文字或符號'):null;
        if(!run.rasterOnly&&canvas&&root.PageStructure){run.background=root.PageStructure.background(canvas,b,grids);if(!run.background){run.rasterOnly=true;run.retainedReason='背景不均，保留原圖';}}
        if(run.rasterOnly)retained++;else masks.push(run);
      }
    }
    return {masks,retained};
  }
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
        for(const line of lines){if(line.background){const m=line.background;context.fillStyle="#"+m.colour;context.fillRect(m.x/scale*factor,m.y/scale*factor,m.width/scale*factor,m.height/scale*factor);continue;}context.fillStyle="#fff";const b=line.bbox,pad=Math.max(1,(b.y1-b.y0)*.12)/scale;context.fillRect((b.x0/scale-pad)*factor,(b.y0/scale-pad)*factor,((b.x1-b.x0)/scale+pad*2)*factor,((b.y1-b.y0)/scale+pad*2)*factor);}
      }
      check(signal);return out.toDataURL('image/png').split(',')[1];
    }finally{out.width=out.height=0;}
  }
  async function nativePage(page,canvas,scale,signal){
    const result=await nativeText(page);if(!result)return null;
    for(const line of result.lines)line.color=root.TextColor?.sample(canvas,line.bbox,scale);
    result.image=await graphics(page,canvas,scale,result.lines,true,signal);
    if(root.PageStructure){const grids=root.PageStructure.detect(canvas).map(g=>({xs:g.xs.map(x=>x/scale),ys:g.ys.map(y=>y/scale)})),structured=root.PageStructure.tables(result.lines,grids,1);result.lines=structured.lines;result.tables=structured.tables;}
    return result;
  }
  const api={fontStyle,nativeText,nativePage,graphics,prepareOcrOverlay,smallImageRegions,footerLines};
  if(typeof module!=='undefined')module.exports=api;else root.PDFFidelity=api;
})(typeof globalThis!=='undefined'?globalThis:this);
