/* Reconstruct editable reading order from OCR geometry. No network or model calls. */
(function(root){
  'use strict';
  const geometry=typeof module!=='undefined'?require('./ocr-layout.js'):root.OCRLayout;
  const median=values=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]||1;};
  const height=line=>line.bbox.y1-line.bbox.y0;
  function gap(lines,axis){
    const start=axis+'0',end=axis+'1',sorted=lines.slice().sort((a,b)=>a.bbox[start]-b.bbox[start]);
    let edge=sorted[0].bbox[end],best=null;
    for(let i=1;i<sorted.length;i++){
      const next=sorted[i].bbox[start];
      if(next>edge&&(!best||next-edge>best.size))best={at:(edge+next)/2,size:next-edge};
      edge=Math.max(edge,sorted[i].bbox[end]);
    }
    return best;
  }
  function regions(lines,depth=0){
    if(lines.length<2||depth>24)return [lines.slice().sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)];
    const h=median(lines.map(height)),vertical=gap(lines,'x');
    if(vertical&&vertical.size>Math.max(24,h*2)){
      const left=lines.filter(l=>l.bbox.x1<vertical.at),right=lines.filter(l=>l.bbox.x0>vertical.at);
      const overlap=Math.min(Math.max(...left.map(l=>l.bbox.y1)),Math.max(...right.map(l=>l.bbox.y1)))-Math.max(Math.min(...left.map(l=>l.bbox.y0)),Math.min(...right.map(l=>l.bbox.y0)));
      if(left.length>=2&&right.length>=2&&overlap>=h)return [...regions(left,depth+1),...regions(right,depth+1)];
    }
    // A full-width title/footer can hide the gutter. Infer it from repeated
    // side-by-side lines before dividing the page into horizontal sections.
    const rows=lines.slice().sort((a,b)=>a.bbox.y0-b.bbox.y0),gutters=[];
    for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length&&rows[j].bbox.y0<rows[i].bbox.y1;j++){
      const a=rows[i].bbox,b=rows[j].bbox;
      if(Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)<Math.min(height(rows[i]),height(rows[j]))*.5)continue;
      const left=a.x0<b.x0?a:b,right=left===a?b:a;
      if(right.x0-left.x1>Math.max(24,h*2))gutters.push({start:left.x1,end:right.x0});
    }
    let cut=null,votes=1;
    for(const g of gutters){const x=(g.start+g.end)/2,count=gutters.filter(v=>v.start<x&&v.end>x).length;if(count>votes){cut=x;votes=count;}}
    if(cut!==null){
      const spanning=lines.filter(l=>l.bbox.x0<=cut&&l.bbox.x1>=cut).sort((a,b)=>a.bbox.y0-b.bbox.y0);
      if(spanning.length){
        let rest=lines.filter(l=>!spanning.includes(l));const result=[];
        for(const line of spanning){
          const before=rest.filter(l=>l.bbox.y1<=line.bbox.y0);
          if(before.length){result.push(...regions(before,depth+1));rest=rest.filter(l=>!before.includes(l));}
          result.push([line]);
        }
        if(rest.length)result.push(...regions(rest,depth+1));
        return result;
      }
    }
    const horizontal=gap(lines,'y');
    if(horizontal&&horizontal.size>h*1.4)return [...regions(lines.filter(l=>l.bbox.y1<horizontal.at),depth+1),...regions(lines.filter(l=>l.bbox.y0>horizontal.at),depth+1)];
    return [lines.slice().sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)];
  }
  function join(a,b){
    a=a.trimEnd();b=b.trimStart();
    if(a.endsWith('\u00ad'))return a.slice(0,-1)+b;
    if(/[-‐‑]$/.test(a)||/[\u3400-\u9fff]$/.test(a)&&/^[\u3400-\u9fff，。；：！？、）]/.test(b)||/^[,.;:!?，。；：！？、）]/.test(b))return a+b;
    return a+' '+b;
  }
  function textFromBlocks(blocks,fallback=''){
    let paragraph=0;const lines=[];
    if((blocks||[]).some(block=>block.text?.trim()&&!block.paragraphs?.length))return fallback;
    for(const block of blocks||[])for(const p of block.paragraphs||[]){
      const id=paragraph++;
      if(p.text?.trim()&&!p.lines?.length)return fallback;
      if((p.lines||[]).some(l=>(l.text?.trim()||l.words?.length)&&!l.bbox))return fallback;
      if((p.lines||[]).some(l=>(l.words||[]).some(w=>w.text?.trim()&&!w.bbox)))return fallback;
      for(const line of geometry.linesFromBlocks([{paragraphs:[p]}])){
        const b=line.bbox;
        if(!b||!['x0','y0','x1','y1'].every(k=>Number.isFinite(b[k]))||b.x1<=b.x0||b.y1<=b.y0)return fallback;
        lines.push({...line,paragraph:id});
      }
    }
    if(!lines.length)return fallback;
    const paragraphs=[];
    for(const region of regions(lines)){
      let current=null,previous=null;
      for(const line of region){
        const bullet=/^(?:[•●▪◦*]\s*|[-–—]\s+|(?:\d{1,3}|[A-Za-z])[.)]\s+)/.test(line.text.trim());
        const same=current&&previous.paragraph===line.paragraph&&!bullet&&line.bbox.y0>=previous.bbox.y1-height(previous)*.3&&line.bbox.y0-previous.bbox.y1<=Math.max(height(line),height(previous))*1.5&&Math.max(height(line),height(previous))/Math.min(height(line),height(previous))<1.5;
        if(same)current.text=join(current.text,line.text);
        else{current={text:line.text.trim()};paragraphs.push(current);}
        previous=line;
      }
    }
    return paragraphs.map(p=>p.text).join('\n\n');
  }
  const api={textFromBlocks,regions,join};
  if(typeof module!=='undefined')module.exports=api;else root.OCRFlow=api;
})(typeof globalThis!=='undefined'?globalThis:this);
