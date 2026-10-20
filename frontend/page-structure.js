/* Conservative local analysis: flat backgrounds and complete, unmerged ruled grids only. */
(function(root){'use strict';
function flatColour(data,width,height){
 if(width<5||height<5||data.length<width*height*4)return null;const groups=new Map();let total=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(x>1&&x<width-2&&y>1&&y<height-2)continue;const i=(y*width+x)*4;if(data[i+3]<240)continue;const rgb=[data[i],data[i+1],data[i+2]],key=rgb.map(n=>n>>4).join(','),v=groups.get(key)||[0,0,0,0];v[0]++;rgb.forEach((n,j)=>v[j+1]+=n);groups.set(key,v);total++;}
 const best=[...groups.values()].sort((a,b)=>b[0]-a[0])[0];if(!best||best[0]<total*.78)return null;const rgb=best.slice(1).map(n=>Math.round(n/best[0]));if(Math.min(...rgb)<155)return null;return rgb.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
}
function gridLines(data,w,h){
 const dark=(x,y)=>{const i=(y*w+x)*4;return data[i+3]>220&&data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722<155;},groups=[],minimum=Math.max(45,Math.round(w*.12));
 for(let y=0;y<h;y++){let start=-1;for(let x=0;x<=w;x++){if(x<w&&dark(x,y)){if(start<0)start=x;}else if(start>=0){if(x-start>=minimum){let g=groups.find(g=>Math.abs(g.left-start)<=3&&Math.abs(g.right-(x-1))<=3);if(!g){g={left:start,right:x-1,ys:[]};groups.push(g);}if(!g.ys.length||y-g.ys.at(-1)>3)g.ys.push(y);}start=-1;}}if(groups.length>80)return [];}
 const grids=[];
 for(const g of groups){const ys=g.ys;if(ys.length<3||ys.length>31||ys.at(-1)-ys[0]<30)continue;const xs=[],partial=[];
  for(let x=g.left;x<=g.right;x++){let count=0;for(let y=ys[0];y<=ys.at(-1);y++)if(dark(x,y))count++;const ratio=count/(ys.at(-1)-ys[0]+1);if(ratio>=.94){const complete=ys.slice(1).every((bottom,i)=>{let ink=0,seen=0;for(let y=ys[i]+2;y<bottom-2;y++){seen++;if(dark(x,y))ink++;}return seen>0&&ink/seen>=.9;});if(complete){if(!xs.length||x-xs.at(-1)>3)xs.push(x);}else partial.push(x);}else if(ratio>.3)partial.push(x);}
  if(partial.some(x=>xs.every(v=>Math.abs(v-x)>3)))continue;
  if(groups.some(other=>other!==g&&other.ys.some(y=>y>ys[0]+3&&y<ys.at(-1)-3&&ys.every(v=>Math.abs(y-v)>3))&&Math.min(other.right,g.right)-Math.max(other.left,g.left)>(g.right-g.left)*.3))continue;
  if(xs.length<3||xs.length>13||Math.abs(xs[0]-g.left)>3||Math.abs(xs.at(-1)-g.right)>3||(xs.length-1)*(ys.length-1)>200)continue;
  if(xs.some((x,i)=>i&&x-xs[i-1]<15)||ys.some((y,i)=>i&&y-ys[i-1]<12))continue;
  grids.push({xs,ys});if(grids.length===4)break;
 }
 return grids;
}
function detect(canvas){const sample=document.createElement('canvas');try{const factor=Math.min(1,1000/canvas.width,1400/canvas.height);sample.width=Math.max(1,Math.round(canvas.width*factor));sample.height=Math.max(1,Math.round(canvas.height*factor));const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,sample.width,sample.height);return gridLines(ctx.getImageData(0,0,sample.width,sample.height).data,sample.width,sample.height).map(g=>({xs:g.xs.map(n=>n/factor),ys:g.ys.map(n=>n/factor)}));}finally{sample.width=sample.height=0;}}
function cellFor(b,g){const x=(b.x0+b.x1)/2,y=(b.y0+b.y1)/2,c=g.xs.findIndex((n,i)=>i<g.xs.length-1&&x>n&&x<g.xs[i+1]),r=g.ys.findIndex((n,i)=>i<g.ys.length-1&&y>n&&y<g.ys[i+1]);return c<0||r<0?null:{r,c,left:g.xs[c],right:g.xs[c+1],top:g.ys[r],bottom:g.ys[r+1]};}
function background(canvas,b,grids=[]){
 const pad=Math.max(2,(b.y1-b.y0)*.12);let x=Math.max(0,Math.floor(b.x0-pad)),y=Math.max(0,Math.floor(b.y0-pad)),right=Math.min(canvas.width,Math.ceil(b.x1+pad)),bottom=Math.min(canvas.height,Math.ceil(b.y1+pad));
 for(const g of grids){const cell=cellFor(b,g);if(cell){x=Math.max(x,Math.ceil(cell.left+2));right=Math.min(right,Math.floor(cell.right-2));y=Math.max(y,Math.ceil(cell.top+2));bottom=Math.min(bottom,Math.floor(cell.bottom-2));}}
 const width=right-x,height=bottom-y;if(width<5||height<5||width>1024||height>256||x>b.x0||right<b.x1||y>b.y0||bottom<b.y1)return null;
 try{const colour=flatColour(canvas.getContext('2d').getImageData(x,y,width,height).data,width,height);return colour?{colour,x,y,width,height}:null;}catch(_){return null;}
}
function tables(lines,grids,scale){const used=new Set(),found=[];
 for(const g of grids){const rows=Array.from({length:g.ys.length-1},()=>Array.from({length:g.xs.length-1},()=>[]));let bad=false,count=0;const pending=[];
  for(const line of lines){for(const run of line.runs||[line]){if(run.rasterOnly||!run.text?.trim()||!run.bbox)continue;const b=run.bbox,cell=cellFor(b,g);if(!cell)continue;if(b.x0<cell.left+1||b.x1>cell.right-1||b.y0<cell.top+1||b.y1>cell.bottom-1||Math.abs(run.rotation||line.rotation||0)>1){bad=true;break;}rows[cell.r][cell.c].push(run);pending.push(run);count++;}if(bad)break;}
  if(bad||count<4||rows.filter(row=>row.some(c=>c.length)).length<2||rows[0].length<2)continue;
  for(const row of rows)for(const cell of row)cell.sort((a,b)=>Math.abs(a.bbox.y0-b.bbox.y0)>Math.min(a.bbox.y1-a.bbox.y0,b.bbox.y1-b.bbox.y0)*.5?a.bbox.y0-b.bbox.y0:a.bbox.x0-b.bbox.x0);
  pending.forEach(r=>used.add(r));found.push({xs:g.xs.map(n=>n/scale),ys:g.ys.map(n=>n/scale),rows});
 }
 const remaining=lines.flatMap(line=>{if(!line.runs)return used.has(line)?[]:[line];const runs=line.runs.filter(r=>!used.has(r));return runs.length?[{...line,runs,text:runs.map(r=>r.text).join(' ')}]:[];});return {tables:found,lines:remaining};
}
const api={flatColour,gridLines,detect,cellFor,background,tables};if(typeof module!=='undefined')module.exports=api;else root.PageStructure=api;
})(typeof window!=='undefined'?window:globalThis);
