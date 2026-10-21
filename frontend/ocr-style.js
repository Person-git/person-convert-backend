/* Local raster matching against available substitute fonts. No document leaves the browser. */
(function(root){
  'use strict';
  const LATIN=['Arial','Times New Roman','Calibri','Georgia','Verdana','Courier New'];
  const CJK=['Microsoft JhengHei','PMingLiU','Microsoft YaHei','SimSun'];
  const TEMPLATE_BYTES=32*1024*1024;
  const seenCaches=new WeakMap();
  // Timer-based yields can be clamped heavily in background tabs. A task message
  // still lets input/cancellation run without adding a timer delay to every line.
  function yieldTask(){
    return new Promise(resolve=>{
      const channel=new MessageChannel();
      channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
      channel.port2.postMessage(null);
    });
  }
  const abort=signal=>{if(signal?.aborted){const error=new Error('已取消 OCR');error.name='AbortError';throw error;}};
  function inkBounds(data,width,height){
    let x0=width,y0=height,x1=-1,y1=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      if(data[i+3]>80&&(data[i]<170||data[i+1]<170||data[i+2]<170)){
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;y1=y;
      }
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
    if(scratch.width!==width)scratch.width=width;if(scratch.height!==32)scratch.height=32;
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
    const otherFamily=sorted.find(c=>c.fontFamily!==best.fontFamily);
    return {...best,margin:alternative?alternative.score-best.score:0,familyMargin:otherFamily?otherFamily.score-best.score:0};
  }
  function refineShortStyles(words,context=[]){
    const signature=w=>`${w.fontFamily}|${!!w.bold}|${!!w.italic}`;
    const anchors=words.map((w,i)=>({w,i})).filter(({w})=>(w.matched||w.inherited)&&w.confidence>=80&&!w.symbolLike&&/^[A-Za-z][A-Za-z'-]{3,}[,.;:!?]?$/.test(w.text));
    for(let i=0;i<words.length;i++){
      const word=words[i];if(!/^[A-Za-z]{1,3}[,.;:!?]?$/.test(word.text)||word.symbolLike||word.confidence<50)continue;
      const nearest=anchors.filter(a=>a.i!==i).sort((a,b)=>Math.abs(a.i-i)-Math.abs(b.i-i)).slice(0,2);
      if(nearest.length===1){const a=nearest[0].w,near=context.filter(w=>(w.matched||w.inherited)&&w.confidence>=80&&w.text.length>=4&&signature(w)===signature(a)&&Math.max(w.fontSize,a.fontSize)<=Math.min(w.fontSize,a.fontSize)*1.15);if(near.length>=2)nearest.push({w:near[0],i:-1});}
      if(nearest.length!==2||signature(nearest[0].w)!==signature(nearest[1].w))continue;
      const [a,b]=nearest.map(n=>n.w);if(Math.max(a.fontSize,b.fontSize)>Math.min(a.fontSize,b.fontSize)*1.15||Math.max(a.text.length,b.text.length)<4)continue;
      // Strong same-family emphasis may be intentional. Repair unknown styles
      // and short-word family guesses, without flattening a real mixed run.
      if(word.matched&&word.fontFamily===a.fontFamily)continue;
      Object.assign(word,{fontFamily:a.fontFamily,bold:!!a.bold,italic:!!a.italic,fontSize:(a.fontSize+b.fontSize)/2,matched:false,inherited:true,shortContext:true});
    }
    return words;
  }
  function normalizeLineSizes(words){
    const groups=new Map();for(const word of words){const key=`${word.fontFamily}|${!!word.bold}|${!!word.italic}`,group=groups.get(key)||[];group.push(word);groups.set(key,group);}
    for(const group of groups.values()){
      const anchors=group.filter(w=>(w.matched||w.inherited)&&w.confidence>=80&&!w.symbolLike&&w.text.replace(/[^A-Za-z]/g,'').length>=4&&w.bbox);
      if(anchors.length<3)continue;
      const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)],size=median(anchors.map(w=>w.fontSize)),centre=median(anchors.map(w=>(w.bbox.y0+w.bbox.y1)/2)),height=median(anchors.map(w=>w.bbox.y1-w.bbox.y0));
      for(const word of group)if(word.bbox&&word.fontSize>=size*.85&&word.fontSize<=size*1.15&&Math.abs((word.bbox.y0+word.bbox.y1)/2-centre)<=height*.35){word.fontSize=size;word.sizeNormalized=true;}
    }
    return words;
  }
  async function analyze(lines,canvas,scale,createCanvas,signal,onProgress=()=>{},templates=new Map()){
    const template=createCanvas(),scratch=createCanvas(),crop=createCanvas();
    const probe=template.getContext('2d',{willReadFrequently:true});
    const families=[...LATIN,...CJK].filter(f=>available(f,probe));
    let templateBytes=0;for(const sample of templates.values())templateBytes+=sample.pixels.byteLength;
    let seen=seenCaches.get(templates);if(!seen){seen=new Set();seenCaches.set(templates,seen);}
    const frequency=new Map();for(const line of lines)for(const word of line.words?.length?line.words:[line]){const text=word.text?.trim();if(text)frequency.set(text,(frequency.get(text)||0)+1);}
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
          let dark=0;if(bounds)for(let yy=bounds.y;yy<bounds.y+bounds.height;yy++)for(let xx=bounds.x;xx<bounds.x+bounds.width;xx++){const i=(yy*crop.width+xx)*4;if(Math.min(rgba[i],rgba[i+1],rgba[i+2])<170)dark++;}
          const symbolLike=bounds&&text.length<=2&&bounds.width/bounds.height>=.7&&bounds.width/bounds.height<=1.3&&dark/(bounds.width*bounds.height)>.4;
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
                  const tw=Math.ceil(metrics.width+32);
                  if(template.width!==tw)template.width=tw;if(template.height!==80)template.height=80;
                  const tc=template.getContext('2d',{willReadFrequently:true});tc.font=font;
                  tc.fillStyle='#fff';tc.fillRect(0,0,template.width,80);tc.fillStyle='#000';tc.fillText(text,16,58);
                  // TextMetrics bounds include glyph overhangs. Read just their
                  // padded area; keep the original raster and normalisation.
                  const valid=[metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxRight,metrics.actualBoundingBoxAscent,metrics.actualBoundingBoxDescent].every(Number.isFinite);
                  const rx=valid?Math.max(0,Math.floor(16-metrics.actualBoundingBoxLeft)-2):0;
                  const ry=valid?Math.max(0,Math.floor(58-metrics.actualBoundingBoxAscent)-2):0;
                  const rw=valid?Math.max(1,Math.min(template.width,Math.ceil(16+metrics.actualBoundingBoxRight)+2)-rx):template.width;
                  const rh=valid?Math.max(1,Math.min(80,Math.ceil(58+metrics.actualBoundingBoxDescent)+2)-ry):80;
                  const rect=inkBounds(tc.getImageData(rx,ry,rw,rh).data,rw,rh);
                  if(!rect)continue;
                  rect.x+=rx;rect.y+=ry;
                  sample={pixels:pixels(template,rect,scratch,width),aspect:rect.width/rect.height,sizeFactor:40/rect.height};
                  // One-off words otherwise evict frequently repeated samples.
                  if(frequency.get(text)>1||seen.has(text)){
                    while(templates.size&&(templates.size>=4096||templateBytes+sample.pixels.byteLength>TEMPLATE_BYTES)){
                      const oldest=templates.keys().next().value;templateBytes-=templates.get(oldest).pixels.byteLength;templates.delete(oldest);
                    }
                    templates.set(key,sample);
                    templateBytes+=sample.pixels.byteLength;
                  }
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
          const item={text,color:root.TextColor?.sample(canvas,b),bbox:{...b},fontFamily:family,fontSize:estimated,confidence:word.confidence??90,symbolLike:!!symbolLike,estimated:true,styleAnalyzed:true};
          if(accepted)Object.assign(item,{fontFamily:best.fontFamily,bold:best.bold,italic:best.italic,fontSize:best.fontSize,matched:true,familyMargin:best.familyMargin});
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
        refineShortStyles(results);
        for(const word of results){stats.words++;if(word.matched)stats.matched++;else if(word.inherited)stats.inherited++;else stats.uncertain++;if(word.bold)stats.bold++;if(word.italic)stats.italic++;}
        if(results.length){
          const sizes=results.map(w=>w.fontSize).filter(Number.isFinite).sort((a,b)=>a-b);
          const size=sizes[Math.floor(sizes.length/2)]||10;
          output.push({...line,text:results.map(w=>w.text).join(' '),runs:results,fontSize:size,fontFamily:results[0].fontFamily,estimated:true});
        }
        onProgress(index+1,lines.length);
        // Yield between lines so cancellation and progress remain responsive.
        if(index%4===0)await yieldTask();
      }
      for(const line of output){const b=line.bbox,h=b.y1-b.y0,context=output.filter(other=>other!==line&&Math.abs(other.bbox.x0-b.x0)<=h*.7&&Math.abs(other.bbox.y0-b.y0)>h*.5&&Math.abs(other.bbox.y0-b.y0)<=h*2.6).flatMap(other=>other.runs||[]);refineShortStyles(line.runs,context);normalizeLineSizes(line.runs);const sizes=line.runs.map(w=>w.fontSize).sort((a,b)=>a-b);line.fontSize=sizes[Math.floor(sizes.length/2)]||line.fontSize;line.fontFamily=line.runs[0].fontFamily;}
      for(const key of Object.keys(stats))stats[key]=0;for(const word of output.flatMap(l=>l.runs)){stats.words++;if(word.matched)stats.matched++;else if(word.inherited)stats.inherited++;else stats.uncertain++;if(word.bold)stats.bold++;if(word.italic)stats.italic++;}
      for(const text of frequency.keys()){if(seen.size>=4096)seen.delete(seen.values().next().value);seen.add(text);}
      abort(signal);return {lines:output,stats};
    }finally{for(const c of [template,scratch,crop])c.width=c.height=0;}
  }
  const api={analyze,inkBounds,distance,rank,yieldTask,refineShortStyles,normalizeLineSizes};
  if(typeof module!=='undefined')module.exports=api;else root.OCRStyle=api;
})(typeof globalThis!=='undefined'?globalThis:this);
