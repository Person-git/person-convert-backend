(function(root){
  'use strict';
  const esc=value=>String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function linesFromBlocks(blocks){
    return (blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>paragraph.lines||[])).flatMap(line=>{
      const words=(line.words||[]).filter(w=>w.text?.trim()&&w.bbox);
      if(!words.length)return [{text:line.text||'',bbox:line.bbox}];
      const groups=[];let group=[];
      for(const word of words){
        const previous=group[group.length-1];
        if(previous&&word.bbox.x0-previous.bbox.x1>Math.max(12,(line.bbox.y1-line.bbox.y0)*1.5)){groups.push(group);group=[];}
        group.push(word);
      }
      if(group.length)groups.push(group);
      if(groups.length===1)return [{text:line.text||words.map(w=>w.text).join(' '),bbox:line.bbox,words}];
      return groups.map(group=>({text:group.map(w=>w.text).join(' '),words:group,bbox:{x0:Math.min(...group.map(w=>w.bbox.x0)),y0:Math.min(...group.map(w=>w.bbox.y0)),x1:Math.max(...group.map(w=>w.bbox.x1)),y1:Math.max(...group.map(w=>w.bbox.y1))}}));
    }).filter(line=>line.text.trim()&&line.bbox);
  }
  function documentXml(pages){
    let id=0,fitId=0;
    const section=page=>`<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${Math.round(page.width*20)}" w:h="${Math.round(page.height*20)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/></w:sectPr>`;
    const body=pages.map((page,index)=>{
      const picture=page.image?`<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${Math.round(page.width*12700)}" cy="${Math.round(page.height*12700)}"/><wp:wrapNone/><wp:docPr id="${100000+index}" name="Page graphics ${index+1}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="page-${index+1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImage${index+1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(page.width*12700)}" cy="${Math.round(page.height*12700)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`:'';
      const shapes=page.lines.map(line=>{
        const b=line.bbox,scale=page.scale;
        const x=Math.max(0,b.x0/scale),y=Math.max(0,b.y0/scale),height=(b.y1-b.y0)/scale;
        const estimated=height*(/[\u3400-\u9fff]/.test(line.text)?1.08:1.22);
        const size=Math.max(line.fontFamily?1:5,Math.min(line.fontFamily?400:72,line.fontSize||estimated));
        const width=Math.max(1,Math.min(page.width-x,(b.x1-b.x0)/scale+(line.runs?2:size*.8)));
        const boxHeight=Math.min(page.height-y,Math.max(height+size*.7,size*1.5));
        const runs=(line.runs||[line]).map((run,i,all)=>{
          const next=all[i+1],gap=next?Math.max(0,next.bbox.x0-run.bbox.x1):0;
          const cjk=/[\u3400-\u9fff]$/.test(run.text)&&/^[\u3400-\u9fff]/.test(next?.text||'');
          const separator=next&&!(cjk&&gap<height*scale*.3)?' ':'';
          const runSize=Math.max(1,Math.min(400,run.fontSize||size));
          const span=(next?next.bbox.x0:run.bbox.x1)-run.bbox.x0;
          const fit=line.runs?`<w:fitText w:val="${Math.max(1,Math.round(span/scale*20))}" w:id="${++fitId}"/>`:'';
          return `<w:r><w:rPr><w:rFonts w:ascii="${esc(run.fontFamily||'Arial')}" w:hAnsi="${esc(run.fontFamily||'Arial')}" w:eastAsia="${esc(run.fontFamily||'Microsoft JhengHei')}"/>${run.bold?'<w:b/><w:bCs/>':''}${run.italic?'<w:i/><w:iCs/>':''}<w:sz w:val="${Math.round(runSize*2)}"/><w:szCs w:val="${Math.round(runSize*2)}"/>${fit}</w:rPr><w:t xml:space="preserve">${esc(run.rasterOnly?' ':run.text.trim()+separator)}</w:t></w:r>`;
        }).join('');
        return `<w:r><w:pict><v:rect id="ocr_line_${++id}" style="position:absolute;margin-left:${x.toFixed(2)}pt;margin-top:${Math.max(0,y-size*.1).toFixed(2)}pt;width:${width.toFixed(2)}pt;height:${boxHeight.toFixed(2)}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;rotation:${Number(line.rotation)||0};z-index:${id}" filled="f" stroked="f"><v:textbox inset="0,0,0,0"><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.round(Math.max(size*1.2,height)*20)}" w:lineRule="exact"/></w:pPr>${runs}</w:p></w:txbxContent></v:textbox><w10:wrap type="none"/></v:rect></w:pict></w:r>`;
      }).join('');
      return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${picture}${shapes}</w:p>`+(index<pages.length-1?`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${section(page)}</w:pPr></w:p>`:section(page));
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`;
  }
  const api={linesFromBlocks,documentXml};
  if(typeof module!=='undefined')module.exports=api;else root.OCRLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
