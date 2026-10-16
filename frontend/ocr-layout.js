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
      if(groups.length===1)return [{text:line.text||words.map(w=>w.text).join(' '),bbox:line.bbox}];
      return groups.map(group=>({text:group.map(w=>w.text).join(' '),bbox:{x0:Math.min(...group.map(w=>w.bbox.x0)),y0:Math.min(...group.map(w=>w.bbox.y0)),x1:Math.max(...group.map(w=>w.bbox.x1)),y1:Math.max(...group.map(w=>w.bbox.y1))}}));
    }).filter(line=>line.text.trim()&&line.bbox);
  }
  function documentXml(pages){
    let id=0;
    const section=page=>`<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${Math.round(page.width*20)}" w:h="${Math.round(page.height*20)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/></w:sectPr>`;
    const body=pages.map((page,index)=>{
      const shapes=page.lines.map(line=>{
        const b=line.bbox,scale=page.scale;
        const x=Math.max(0,b.x0/scale),y=Math.max(0,b.y0/scale),height=(b.y1-b.y0)/scale;
        const estimated=height*(/[\u3400-\u9fff]/.test(line.text)?1.08:1.22);
        const size=Math.max(5,Math.min(72,line.fontSize||estimated));
        const width=Math.max(1,Math.min(page.width-x,(b.x1-b.x0)/scale+size*.8));
        const boxHeight=Math.min(page.height-y,Math.max(height+size*.7,size*1.5));
        return `<w:r><w:pict><v:rect id="ocr_line_${++id}" style="position:absolute;margin-left:${x.toFixed(2)}pt;margin-top:${Math.max(0,y-size*.1).toFixed(2)}pt;width:${width.toFixed(2)}pt;height:${boxHeight.toFixed(2)}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;z-index:${id}" filled="f" stroked="f"><v:textbox inset="0,0,0,0"><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.round(size*24)}" w:lineRule="exact"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft JhengHei"/><w:sz w:val="${Math.round(size*2)}"/><w:szCs w:val="${Math.round(size*2)}"/></w:rPr><w:t xml:space="preserve">${esc(line.text.trim())}</w:t></w:r></w:p></w:txbxContent></v:textbox><w10:wrap type="none"/></v:rect></w:pict></w:r>`;
      }).join('');
      return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${shapes}</w:p>`+(index<pages.length-1?`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${section(page)}</w:pPr></w:p>`:section(page));
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:body>${body}</w:body></w:document>`;
  }
  const api={linesFromBlocks,documentXml};
  if(typeof module!=='undefined')module.exports=api;else root.OCRLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
