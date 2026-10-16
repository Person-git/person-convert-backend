/* Local raster matching against available substitute fonts. No document leaves the browser. */
(function(root){
  'use strict';
  const LATIN=['Arial','Times New Roman','Calibri','Georgia','Verdana','Courier New'];
  const CJK=['Microsoft JhengHei','PMingLiU','Microsoft YaHei','SimSun'];
  const abort=signal=>{if(signal?.aborted){const error=new Error('已取消 OCR');error.name='AbortError';throw error;}};
  function inkBounds(data,width,height){
    let x0=width,y0=height,x1=-1,y1=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(data[i+3]>80&&Math.min(data[i],data[i+1],data[i+2])<170){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    }
    return x1<x0?null:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
  }
  function available(family,context){
    const sample='mmmmWWWWiii123漢字';
    context.font='32px monospace';const a=context.measureText(sample).width;
    context.font=`32px "${family}",monospace`;const b=context.measureText(sample).width;
    context.font='32px serif';const c=context.measureText(sample).width;
    context.font=`32px "${family}",serif`;const d=context.measureText(sample).width;
    return Math.abs(a-b)>.1||Math.abs(c-d)>.1;
  }
  function pixels(canvas,box,scratch,width){
    scratch.width=width;scratch.height=32;
    const ctx=scratch.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,32);
    ctx.drawImage(canvas,box.x,box.y,box.width,box.height,0,0,width,32);
    const data=ctx.getImageData(0,0,width,32).data,out=new Float32Array(width*32);
    for(let i=0;i<out.length;i++)out[i]=(255-(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114))/255;
    return out;
  }
  function distance(a,b){
    let loss=0,ink=0;
    for(let i=0;i<a.length;i++){loss+=(a[i]-b[i])**2;ink+=a[i]*a[i]+b[i]*b[i];}
    return loss/Math.max(1,ink);
  }
  function rank(candidates){
    const sorted=candidates.slice().sort((a,b)=>a.score-b.score),best=sorted[0];
    if(!best)return null;
    const alternative=sorted.find(c=>c.bold!==best.bold||c.italic!==best.italic);
    return {...best,margin:alternative?alternative.score-best.score:0};
  }
  async function analyze(lines,canvas,scale,createCanvas,signal,onProgress=()=>{},templates=new Map()){
    const template=createCanvas(),scratch=createCanvas(),crop=createCanvas();
    const probe=template.getContext('2d',{willReadFrequently:true});
    const families=[...LATIN,...CJK].filter(f=>available(f,probe));
    const stats={matched:0,uncertain:0,inherited:0,bold:0,italic:0,words:0};
    const output=[];
    try{
      for(let index=0;index<lines.length;index++){
        abort(signal);
        const line=lines[index],words=line.words?.length?line.words:[line],results=[];
        for(const word of words){
          const b=word.bbox,text=word.text?.trim();if(!text||!b)continue;
          const x=Math.max(0,Math.floor(b.x0)),y=Math.max(0,Math.floor(b.y0));
          crop.width=Math.max(1,Math.min(canvas.width-x,Math.ceil(b.x1)-x));
          crop.height=Math.max(1,Math.min(canvas.height-y,Math.ceil(b.y1)-y));
          const ctx=crop.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,-x,-y);
          const rgba=ctx.getImageData(0,0,crop.width,crop.height).data;
          const bounds=inkBounds(rgba,crop.width,crop.height),cjk=/[\u3400-\u9fff]/.test(text);
          let best=null;
          if(bounds&&bounds.height>=9&&text.length>=(cjk?1:3)&&text.length<=32&&(word.confidence??90)>=(cjk?80:65)){
            const width=Math.max(32,Math.min(256,text.length*16));
            const source=pixels(crop,bounds,scratch,width),candidates=[];
            for(const family of families.filter(f=>(cjk?CJK:LATIN).includes(f))){
              for(const bold of [false,true])for(const italic of [false,true]){
                const key=JSON.stringify([text,family,bold,italic]);let sample=templates.get(key);
                if(sample){templates.delete(key);templates.set(key,sample);}
                else{
                  const font=`${italic?'italic ':''}${bold?'bold ':''}40px "${family}"`;
                  probe.font=font;const metrics=probe.measureText(text);if(metrics.width>1900)continue;
                  template.width=Math.ceil(metrics.width+32);template.height=80;
                  const tc=template.getContext('2d',{willReadFrequently:true});tc.font=font;
                  tc.fillStyle='#fff';tc.fillRect(0,0,template.width,80);tc.fillStyle='#000';tc.fillText(text,16,58);
                  const rect=inkBounds(tc.getImageData(0,0,template.width,80).data,template.width,80);
                  if(!rect)continue;
                  sample={pixels:pixels(template,rect,scratch,width),aspect:rect.width/rect.height,sizeFactor:40/rect.height};
                  if(templates.size>=1024)templates.delete(templates.keys().next().value);
                  templates.set(key,sample);
                }
                const score=distance(source,sample.pixels)+.18*Math.abs(Math.log((bounds.width/bounds.height)/sample.aspect));
                candidates.push({score,fontFamily:family,bold,italic,fontSize:sample.sizeFactor*bounds.height/scale});
              }
            }
            best=rank(candidates);
          }
          const accepted=best&&best.score<.32&&best.margin>.012;
          const family=cjk?'Microsoft JhengHei':'Arial';
          probe.font=`100px "${family}"`;const metrics=probe.measureText(text);
          const estimated=100/scale*Math.min((b.x1-b.x0)/Math.max(1,metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight),(b.y1-b.y0)/Math.max(1,metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent));
          const item={text,bbox:{...b},fontFamily:family,fontSize:estimated,estimated:true};
          if(accepted)Object.assign(item,{fontFamily:best.fontFamily,bold:best.bold,italic:best.italic,fontSize:best.fontSize,matched:true});
          results.push(item);
        }
        // Complete weak/short words only when at least two direct matches agree unanimously.
        // A line containing both normal and emphasized matches is never homogenized.
        const certain=results.filter(w=>w.matched),first=certain[0];
        if(certain.length>=2&&certain.every(w=>w.fontFamily===first.fontFamily&&!!w.bold===!!first.bold&&!!w.italic===!!first.italic)){
          const heights=certain.map(w=>w.bbox.y1-w.bbox.y0).sort((a,b)=>a-b),median=heights[Math.floor(heights.length/2)];
          const sizes=certain.map(w=>w.fontSize).sort((a,b)=>a-b),size=sizes[Math.floor(sizes.length/2)];
          for(const word of results)if(!word.matched&&(word.bbox.y1-word.bbox.y0)>=median*.55&&(word.bbox.y1-word.bbox.y0)<=median*1.5){
            Object.assign(word,{fontFamily:first.fontFamily,bold:first.bold,italic:first.italic,fontSize:size,inherited:true});
          }
        }
        for(const word of results){stats.words++;if(word.matched)stats.matched++;else if(word.inherited)stats.inherited++;else stats.uncertain++;if(word.bold)stats.bold++;if(word.italic)stats.italic++;}
        output.push(...results);onProgress(index+1,lines.length);
        // Yield between lines so cancellation and progress remain responsive.
        if(index%4===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      abort(signal);return {lines:output,stats};
    }finally{for(const c of [template,scratch,crop])c.width=c.height=0;}
  }
  const api={analyze,inkBounds,distance,rank};
  if(typeof module!=='undefined')module.exports=api;else root.OCRStyle=api;
})(typeof globalThis!=='undefined'?globalThis:this);
