const assert=require('assert'),fidelity=require('../frontend/pdf-fidelity.js'),layout=require('../frontend/ocr-layout.js'),ocr=require('../frontend/ocr-word.js');
assert.deepEqual(fidelity.fontStyle('ABCDEF+Arial-BoldMT'),{fontFamily:'Arial',bold:true,italic:false});
assert.deepEqual(fidelity.fontStyle('Times-Italic'),{fontFamily:'Times New Roman',bold:false,italic:true});
assert.equal(fidelity.fontStyle('','Microsoft JhengHei').fontFamily,'Microsoft JhengHei');
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
 console.log('Font names/styles, native geometry, image anchors, relationships, PNG packaging and output budget passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
