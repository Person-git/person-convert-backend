const assert=require('assert'),fidelity=require('../frontend/pdf-fidelity.js'),layout=require('../frontend/ocr-layout.js'),ocr=require('../frontend/ocr-word.js');
assert.deepEqual(fidelity.fontStyle('ABCDEF+Arial-BoldMT'),{fontFamily:'Arial',bold:true,italic:false});
assert.deepEqual(fidelity.fontStyle('Times-Italic'),{fontFamily:'Times New Roman',bold:false,italic:true});
assert.equal(fidelity.fontStyle('','Microsoft JhengHei').fontFamily,'Microsoft JhengHei');
const overlayLines=[{runs:[{text:'unclear',confidence:20,fontSize:12,bbox:{x0:0,y0:0,x1:40,y1:20}},{text:'clear',confidence:98,fontSize:12,bbox:{x0:45,y0:0,x1:80,y1:20}},{text:'\uFFFD',confidence:95,fontSize:12,bbox:{x0:85,y0:0,x1:90,y1:20}}]}];
const overlay=fidelity.prepareOcrOverlay(overlayLines,1);assert.equal(overlay.retained,2);assert.equal(overlay.masks.length,1);assert(overlayLines[0].runs[0].rasterOnly);assert(!overlayLines[0].runs[1].rasterOnly);
global.OCRLayout=layout;
const pages=[{width:576,height:720,scale:1,image:'iVBORw0KGgo=',lines:[{text:'Font & picture',bbox:{x0:30,y0:50,x1:250,y1:70},fontSize:20,fontFamily:'Arial',bold:true,italic:true}]}];
const xml=layout.documentXml(pages);
assert(xml.includes('r:embed="rImage1"'));assert(xml.includes('behindDoc="1"'));assert(xml.includes('w:ascii="Arial"'));assert(xml.includes('<w:b/>'));assert(xml.includes('<w:i/>'));assert(xml.includes('Font &amp; picture'));
const files={};class Zip{file(name,value,options){files[name]={value,options};}async generateAsync(){return 'docx';}}
(async()=>{
 await ocr.createDocx(pages,Zip,true);assert(files['word/media/page-1.png'].options.base64);assert(files['word/_rels/document.xml.rels'].value.includes('Target="media/page-1.png"'));assert(files['[Content_Types].xml'].value.includes('image/png'));
 await assert.rejects(ocr.createDocx([{...pages[0],image:'x'.repeat(42*1024*1024)}],Zip,true),/30 MB/);
 global.pdfjsLib={Util:{transform:(view,item)=>item}};
 const source={getViewport:()=>({width:600,height:800,transform:[1,0,0,1,0,0]}),getTextContent:async()=>({items:[{str:'Original editable text sample',fontName:'font',width:160,transform:[20,0,0,20,40,100]}],styles:{font:{ascent:.8,fontFamily:'serif'}}}),commonObjs:{get:()=>({name:'ABCDEF+Arial-BoldMT'})}};
 const native=await fidelity.nativeText(source);assert.equal(native.lines[0].fontFamily,'Arial');assert(native.lines[0].bold);assert.equal(native.lines[0].fontSize,20);
 assert.equal(await fidelity.nativeText({...source,getTextContent:async()=>({items:[],styles:{}})}),null);
 global.pdfjsLib.OPS={save:1,restore:2,transform:3,paintImageXObject:4};
 const regions=await fidelity.smallImageRegions({getViewport:()=>({width:600,height:800,transform:[1,0,0,1,0,0]}),getOperatorList:async()=>({fnArray:[1,3,4,2,1,3,4,2],argsArray:[[],[20,0,0,20,30,40],['logo'],[],[],[600,0,0,800,0,0],['scan'],[]]})});
 assert.deepEqual(regions,[{x0:30,x1:50,y0:40,y1:60}],'Protect icons but never treat a full-page scan as a small icon');
 const iconLines=[{runs:[{text:'LOGO',confidence:99,fontSize:12,bbox:{x0:31,y0:41,x1:49,y1:59}},{text:'@',confidence:99,fontSize:12,bbox:{x0:60,y0:40,x1:70,y1:60}}]}];
 assert.equal(fidelity.prepareOcrOverlay(iconLines,1,regions).retained,2);
 const makeLine=(text,y,h=20)=>({text,bbox:{x0:20,y0:y,x1:160,y1:y+h},runs:[{text,confidence:99,fontSize:h,bbox:{x0:20,y0:y,x1:160,y1:y+h}}]});
 const footerLines=[makeLine('Body one',100),makeLine('Body two',300),makeLine('Body near bottom',730),makeLine('footer',780,9),makeLine('\u00a2Item',500)];
 assert.equal(fidelity.prepareOcrOverlay(footerLines,1,[],800).retained,2);
 assert(!footerLines[2].runs[0].rasterOnly,'Bottom body stays editable');
 assert(footerLines[3].runs[0].rasterOnly,'Small isolated footer keeps its image');
 const continuous=[makeLine('First',100),makeLine('Second',300),makeLine('Body',745),makeLine('Last body',770)];
 assert.equal(fidelity.prepareOcrOverlay(continuous,1,[],800).retained,0,'No fixed bottom five percent cutoff');
 const pageNumber=[makeLine('Body',100),makeLine('More',300),makeLine('End',700),makeLine('Page 3 / 6',780,15)];
 assert(fidelity.footerLines(pageNumber,1,800).has(pageNumber[3]));
 assert.equal(fidelity.footerLines([makeLine('Only line',780,9)],1,800).size,0,'Insufficient body evidence does not imply footer');
 console.log('Font names/styles, native geometry, image anchors, relationships, PNG packaging and output budget passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

const broken=[{bbox:{x0:10,y0:10,x1:80,y1:25},runs:[{text:'one',confidence:99,fontSize:12,bbox:{x0:40,y0:10,x1:60,y1:25}},{text:'two',confidence:99,fontSize:12,bbox:{x0:20,y0:10,x1:35,y1:25}}]}];assert.equal(fidelity.prepareOcrOverlay(broken,1).retained,2);assert(broken[0].runs.every(r=>r.rasterOnly&&r.retainedReason==='字詞位置不可靠'));

const adjacent=[{runs:[
 {text:'symbol',bbox:{x0:0,y0:10,x1:10,y1:20},rasterOnly:true},
 {text:'near',bbox:{x0:11,y0:10,x1:20,y1:20},background:{x:9,y:8,width:13,height:14}},
 {text:'chain',bbox:{x0:21,y0:10,x1:30,y1:20},background:{x:19,y:8,width:13,height:14}},
 {text:'safe',bbox:{x0:50,y0:10,x1:70,y1:20},background:{x:48,y:8,width:24,height:14}}
]}];
const protectedRuns=fidelity.protectRasterNeighbours(adjacent,1);assert.equal(protectedRuns.retained,3);assert.equal(protectedRuns.masks[0].text,'safe');assert(adjacent[0].runs[2].rasterOnly,'Preservation must propagate through adjacent masks');
const marker=[{text:'a',confidence:95,fontSize:15.5,bbox:{x0:5,y0:10,x1:12,y1:23}},{text:'regular body',confidence:95,fontSize:12.5,bbox:{x0:18,y0:10,x1:90,y1:23}}];assert.equal(fidelity.prepareOcrOverlay(marker,1).retained,1);assert.equal(marker[0].retainedReason,'獨立小字樣式不可靠');
