/* Conservative local Word reconstruction. No fonts or documents are uploaded. */
(function(root){'use strict';
const runs=line=>line.runs||[line],box=b=>b&&['x0','y0','x1','y1'].every(k=>Number.isFinite(b[k]))&&b.x1>b.x0&&b.y1>b.y0;
const overlaps=(a,b,pad=0)=>a.x0<b.x1+pad&&a.x1>b.x0-pad&&a.y0<b.y1+pad&&a.y1>b.y0-pad;
function substitute(name,text,available){
 const source=String(name||'Arial'),cjk=/[\u3400-\u9fff]/.test(text),mono=/courier|mono|consolas/i.test(source),serif=/times|georgia|cambria|ming|simsun|serif/i.test(source)&&!/sans/i.test(source);
 if(available(source))return source;
 const choices=cjk?(serif?['PMingLiU','SimSun','Noto Serif CJK TC']:['Microsoft JhengHei','Microsoft YaHei','Noto Sans CJK TC']):mono?['Courier New','Consolas','Liberation Mono']:serif?['Times New Roman','Cambria','Georgia','Liberation Serif']:['Arial','Calibri','Helvetica','Liberation Sans'];
 return choices.find(available)||(cjk?'Microsoft JhengHei':mono?'Courier New':serif?'Times New Roman':'Arial');
}
function calibrate(page,context){
 const cache=new Map(),available=family=>{if(cache.has(family))return cache.get(family);if(/^(serif|sans-serif|monospace)$/i.test(family))return false;const safe=JSON.stringify(family),sample='mmmmWWWWiii123漢字';let different=false;for(const fallback of ['monospace','serif']){context.font='32px '+fallback;const a=context.measureText(sample).width;context.font=`32px ${safe},${fallback}`;if(Math.abs(a-context.measureText(sample).width)>.1)different=true;}cache.set(family,different);return different;};
 let changed=0,adjusted=0;
 const all=[...page.lines,...(page.tables||[]).flatMap(t=>t.rows.flatMap(r=>r.flatMap(c=>c)))];
 for(const line of all)for(const run of runs(line)){
  if(run.rasterOnly||!box(run.bbox))continue;const old=run.fontFamily||line.fontFamily||'Arial';run.fontFamily=substitute(old,run.text||'',available);if(old!==run.fontFamily){run.sourceFont=old;changed++;}
  const size=run.fontSize||line.fontSize||10;context.font=`${run.italic?'italic ':''}${run.bold?'bold ':''}${size}px ${JSON.stringify(run.fontFamily)}`;
  const measured=context.measureText((run.text||'').trim()).width,target=(run.bbox.x1-run.bbox.x0)/page.scale;
  if(measured>0&&target>0){run.widthPercent=Math.round(target/measured*100);if(run.widthPercent>=80&&run.widthPercent<=120&&Math.abs(run.widthPercent-100)>1)adjusted++;}
 }
 page.geometryStats={...page.geometryStats,substituted:changed,widthAdjusted:adjusted};return page;
}
function paragraphs(page){
 // Never cross columns, images, tables, rotations, symbols or retained raster text.
 const lines=page.lines.slice().sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0),groups=[];let active=[];
 const signature=l=>runs(l).map(r=>`${r.fontFamily}|${Math.round((r.fontSize||l.fontSize||10)*2)}|${!!r.bold}|${!!r.italic}|${r.color||'000000'}`);
 const eligible=l=>box(l.bbox)&&Math.abs(l.rotation||0)<.1&&l.text?.trim().length>=25&&!/^\s*(?:[•●▪\-–]|\d+[.)、]|[A-Za-z][.)])\s/.test(l.text)&&runs(l).every(r=>!r.rasterOnly&&r.widthPercent>=80&&r.widthPercent<=120)&&new Set(signature(l)).size===1;
 const flush=()=>{if(active.length>=3){const first=active[0],last=active.at(-1),b={x0:first.bbox.x0,y0:first.bbox.y0,x1:Math.max(...active.map(l=>l.bbox.x1)),y1:last.bbox.y1},steps=active.slice(1).map((l,i)=>l.bbox.y0-active[i].bbox.y0).sort((a,b)=>a-b);groups.push({...first,bbox:b,text:active.map(l=>l.text).join(' '),paragraphLines:active.slice(),lineStep:steps[Math.floor(steps.length/2)]/page.scale});}else groups.push(...active);active=[];};
 for(const line of lines){if(!eligible(line)){flush();groups.push(line);continue;}const previous=active.at(-1);if(previous){const a=previous.bbox,b=line.bbox,h=a.y1-a.y0,step=b.y0-a.y0,width=a.x1-a.x0;
   const merged={x0:a.x0,y0:active[0].bbox.y0,x1:Math.max(a.x1,b.x1),y1:b.y1};
   const tableObstacle=(page.tables||[]).some(t=>overlaps(merged,{x0:t.xs[0]*page.scale,y0:t.ys[0]*page.scale,x1:t.xs.at(-1)*page.scale,y1:t.ys.at(-1)*page.scale}));
   const obstacle=tableObstacle||lines.some(l=>l!==line&&!active.includes(l)&&overlaps(merged,l.bbox))||(page.pictures||[]).some(p=>overlaps(merged,{x0:p.x*page.scale,y0:p.y*page.scale,x1:(p.x+p.width)*page.scale,y1:(p.y+p.height)*page.scale}));
   if(Math.abs(a.x0-b.x0)>2*page.scale||step<h*.95||step>h*1.65||Math.abs((b.y1-b.y0)-h)>h*.15||width<80*page.scale||Math.abs((b.x1-b.x0)-width)>width*.12||signature(line)[0]!==signature(previous)[0]||obstacle||active.length>=10)flush();
  }active.push(line);
 }flush();page.lines=groups;page.geometryStats={...page.geometryStats,paragraphs:groups.filter(l=>l.paragraphLines).length};return page;
}
function pictureCandidates(regions,lines,scale,width,height){
 const chosen=[];for(const b of regions){if(!box(b)||b.x0<2||b.y0<2||b.x1>width-2||b.y1>height-2)continue;const w=b.x1-b.x0,h=b.y1-b.y0;if(w<12||h<12||w*h>width*height*.6)continue;
  if(lines.some(l=>runs(l).some(r=>!r.rasterOnly&&box(r.bbox)&&overlaps(b,{x0:r.bbox.x0/scale,y0:r.bbox.y0/scale,x1:r.bbox.x1/scale,y1:r.bbox.y1/scale},2))))continue;
  if(chosen.some(c=>overlaps(c,b,2)))continue;chosen.push(b);if(chosen.length===12)break;
 }return chosen;
}
function whiteRing(data,width,height,b){
 let count=0;for(let y=Math.max(0,b.y0-2);y<Math.min(height,b.y1+2);y++)for(let x=Math.max(0,b.x0-2);x<Math.min(width,b.x1+2);x++){
  if(x>=b.x0&&x<b.x1&&y>=b.y0&&y<b.y1)continue;const i=(y*width+x)*4;if(data[i]<249||data[i+1]<249||data[i+2]<249||data[i+3]<249)return false;count++;
 }return count>0;
}
async function separatePictures(page,regions,createCanvas,signal){
 const candidates=pictureCandidates(regions,page.lines,page.scale,page.width,page.height);if(!page.image||!candidates.length)return page;
 const canvas=createCanvas(),crop=createCanvas();try{
  const image=await new Promise((resolve,reject)=>{const img=new root.Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('圖片圖層解碼失敗'));img.src='data:image/png;base64,'+page.image;});
  if(signal?.aborted)throw Object.assign(Error('已取消'),{name:'AbortError'});canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data,fx=canvas.width/page.width,fy=canvas.height/page.height;
  page.pictures=[];let total=0;for(const b of candidates){if(signal?.aborted)throw Object.assign(Error('已取消'),{name:'AbortError'});const rect={x0:Math.floor(b.x0*fx),y0:Math.floor(b.y0*fy),x1:Math.ceil(b.x1*fx),y1:Math.ceil(b.y1*fy)};
   if(!whiteRing(pixels,canvas.width,canvas.height,rect))continue;crop.width=rect.x1-rect.x0;crop.height=rect.y1-rect.y0;if(crop.width*crop.height>2000000)continue;
   crop.getContext('2d').drawImage(canvas,rect.x0,rect.y0,crop.width,crop.height,0,0,crop.width,crop.height);const png=crop.toDataURL('image/png').split(',')[1];if(total+png.length*.75>8*1024*1024)continue;
   total+=png.length*.75;page.pictures.push({image:png,x:rect.x0/fx,y:rect.y0/fy,width:crop.width/fx,height:crop.height/fy});context.fillStyle='#fff';context.fillRect(rect.x0,rect.y0,crop.width,crop.height);
  }if(page.pictures.length)page.image=canvas.toDataURL('image/png').split(',')[1];return page;
 }finally{canvas.width=canvas.height=crop.width=crop.height=0;}
}
async function improve(page,pdfPage,createCanvas,signal){
 const probe=createCanvas();try{calibrate(page,probe.getContext('2d'));const regions=(await root.PDFFidelity.smallImageRegions(pdfPage,.6)).filter(b=>!(page.tables||[]).some(t=>overlaps(b,{x0:t.xs[0],y0:t.ys[0],x1:t.xs.at(-1),y1:t.ys.at(-1)})));await separatePictures(page,regions,createCanvas,signal);return paragraphs(page);}finally{probe.width=probe.height=0;}
}
const api={substitute,calibrate,paragraphs,pictureCandidates,whiteRing,separatePictures,improve};if(typeof module!=='undefined')module.exports=api;else root.WordGeometry=api;
})(typeof globalThis!=='undefined'?globalThis:this);
