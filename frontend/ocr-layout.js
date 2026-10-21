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
  function tableXml(table,scale){
    const xs=table.xs,ys=table.ys,tw=n=>Math.max(0,Math.round(n*20));
    const runXml=run=>`<w:r><w:rPr><w:rFonts w:ascii="${esc(run.fontFamily||'Arial')}" w:hAnsi="${esc(run.fontFamily||'Arial')}" w:eastAsia="${esc(run.fontFamily||'Microsoft JhengHei')}"/><w:sz w:val="${Math.round(Math.max(4,Math.min(72,run.fontSize||10))*2)}"/>${run.bold?'<w:b/>':''}${run.italic?'<w:i/>':''}${/^[0-9a-f]{6}$/i.test(run.color||'')?`<w:color w:val="${run.color}"/>`:''}</w:rPr><w:t xml:space="preserve">${esc(run.text)}</w:t></w:r>`;
    const rows=table.rows.map((row,r)=>`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${tw(ys[r+1]-ys[r])}" w:hRule="exact"/></w:trPr>${row.map((cell,c)=>{
      const paragraphs=[];for(const run of cell){let group=paragraphs.at(-1);if(!group||Math.abs(group[0].bbox.y0-run.bbox.y0)>Math.min(group[0].bbox.y1-group[0].bbox.y0,run.bbox.y1-run.bbox.y0)*.5){group=[];paragraphs.push(group);}group.push(run);}
      const before=cell.length?Math.max(0,Math.min((ys[r+1]-ys[r])*.5,cell[0].bbox.y0/scale-ys[r]-(cell[0].fontSize||10)*.1)):0;
      return `<w:tc><w:tcPr><w:tcW w:w="${tw(xs[c+1]-xs[c])}" w:type="dxa"/><w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="${tw(2)}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="${tw(2)}" w:type="dxa"/></w:tcMar><w:vAlign w:val="top"/></w:tcPr>${paragraphs.length?paragraphs.map((words,i)=>`<w:p><w:pPr><w:spacing w:before="${i?0:tw(before)}" w:after="0" w:line="${tw(Math.max(...words.map(w=>w.fontSize||10))*1.15)}" w:lineRule="exact"/></w:pPr>${words.map((word,j)=>runXml({...word,text:(j?' ':'')+word.text})).join('')}</w:p>`).join(''):'<w:p/>'}</w:tc>`;
    }).join('')}</w:tr>`).join('');
    return `<w:tbl><w:tblPr><w:tblpPr w:leftFromText="0" w:rightFromText="0" w:topFromText="0" w:bottomFromText="0" w:vertAnchor="page" w:horzAnchor="page" w:tblpX="${tw(xs[0])}" w:tblpY="${tw(ys[0])}"/><w:tblW w:w="${tw(xs.at(-1)-xs[0])}" w:type="dxa"/><w:tblBorders>${['top','left','bottom','right','insideH','insideV'].map(n=>`<w:${n} w:val="nil"/>`).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${xs.slice(1).map((x,i)=>`<w:gridCol w:w="${tw(x-xs[i])}"/>`).join('')}</w:tblGrid>${rows}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr></w:p>`;
  }
  function runsForParagraph(line,n,count){return (line.runs||[line]).map((r,i,a)=>({...r,joinAfter:i<a.length-1&& !(/[\u3400-\u9fff]$/.test(r.text)&&/^[\u3400-\u9fff]/.test(a[i+1].text))?' ':'',paragraphEnd:i===a.length-1&&n<count-1&&!(/[\u3400-\u9fff]$/.test(r.text))}));}
  function documentXml(pages){
    let id=0,fitId=0;
    const section=page=>`<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${Math.round(page.width*20)}" w:h="${Math.round(page.height*20)}"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0"/></w:sectPr>`;
    const body=pages.map((page,index)=>{
      const pictureXml=(p,relation,behind)=>`<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${behind?0:1}" behindDoc="${behind?1:0}" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${Math.round((p.x||0)*12700)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${Math.round((p.y||0)*12700)}</wp:posOffset></wp:positionV><wp:extent cx="${Math.round(p.width*12700)}" cy="${Math.round(p.height*12700)}"/><wp:wrapNone/><wp:docPr id="${100000+(++id)}" name="${behind?"Page graphics":"Independent picture"} ${index+1}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="page-${index+1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relation}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(p.width*12700)}" cy="${Math.round(p.height*12700)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
      const picture=(page.image?pictureXml(page,`rImage${index+1}`,true):'')+(page.pictures||[]).map((p,n)=>pictureXml(p,`rPicture${index+1}_${n+1}`,false)).join('');
      const shapes=page.lines.map(line=>{
        const b=line.bbox,scale=page.scale;
        const x=Math.max(0,b.x0/scale),y=Math.max(0,b.y0/scale),height=(b.y1-b.y0)/scale;
        const estimated=(line.paragraphLines?(line.paragraphLines[0].bbox.y1-line.paragraphLines[0].bbox.y0)/scale:height)*(/[\u3400-\u9fff]/.test(line.text)?1.08:1.22);
        const size=Math.max(line.fontFamily?1:5,Math.min(line.fontFamily?400:72,line.fontSize||estimated));
        const width=Math.max(1,Math.min(page.width-x,(b.x1-b.x0)/scale+(line.runs?2:size*.8)));
        const boxHeight=Math.min(page.height-y,Math.max(height+size*.7,size*1.5));
        const contentRuns=line.paragraphLines?line.paragraphLines.flatMap((l,n)=>runsForParagraph(l,n,line.paragraphLines.length)):(line.runs||[line]);
        const runs=contentRuns.map((run,i,all)=>{
          const next=all[i+1],gap=next?Math.max(0,next.bbox.x0-run.bbox.x1):0;
          const cjk=/[\u3400-\u9fff]$/.test(run.text)&&/^[\u3400-\u9fff]/.test(next?.text||'');
          const separator=line.paragraphLines?(run.paragraphEnd?' ':run.joinAfter||''):next&&!(cjk&&gap<height*scale*.3)?' ':'';
          const runSize=Math.max(1,Math.min(400,run.fontSize||size));
          const span=(next?next.bbox.x0:run.bbox.x1)-run.bbox.x0;
          const fit=!line.paragraphLines&&!run.rasterOnly?`<w:fitText w:val="${Math.max(1,Math.round(span/scale*20))}" w:id="${++fitId}"/>`:'';
          return `<w:r><w:rPr><w:rFonts w:ascii="${esc(run.fontFamily||'Arial')}" w:hAnsi="${esc(run.fontFamily||'Arial')}" w:eastAsia="${esc(run.fontFamily||'Microsoft JhengHei')}"/>${run.bold?'<w:b/><w:bCs/>':''}${run.italic?'<w:i/><w:iCs/>':''}<w:sz w:val="${Math.round(runSize*2)}"/><w:szCs w:val="${Math.round(runSize*2)}"/>${/^[0-9a-f]{6}$/i.test(run.color||'')?`<w:color w:val="${run.color.toUpperCase()}"/>`:''}${line.paragraphLines&&run.widthPercent>=80&&run.widthPercent<=120?`<w:w w:val="${run.widthPercent}"/>`:''}${fit}</w:rPr><w:t xml:space="preserve">${esc(run.rasterOnly?' ':run.text.trim()+separator)}</w:t></w:r>`;
        }).join('');
        return `<w:r><w:pict><v:rect id="ocr_line_${++id}" style="position:absolute;margin-left:${x.toFixed(2)}pt;margin-top:${Math.max(0,y-size*.1).toFixed(2)}pt;width:${width.toFixed(2)}pt;height:${boxHeight.toFixed(2)}pt;mso-position-horizontal-relative:page;mso-position-vertical-relative:page;rotation:${Number(line.rotation)||0};z-index:${id}" filled="f" stroked="f"><v:textbox inset="0,0,0,0"><w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.round((line.lineStep||Math.max(size*1.2,height))*20)}" w:lineRule="exact"/></w:pPr>${runs}</w:p></w:txbxContent></v:textbox><w10:wrap type="none"/></v:rect></w:pict></w:r>`;
      }).join('');
      return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>${picture}${shapes}</w:p>`+(page.tables||[]).map(t=>tableXml(t,page.scale)).join('')+(index<pages.length-1?`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>${section(page)}</w:pPr></w:p>`:section(page));
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`;
  }
  const api={linesFromBlocks,documentXml,tableXml};
  if(typeof module!=='undefined')module.exports=api;else root.OCRLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
