const assert=require('node:assert/strict'),fs=require('node:fs');
const fixture=require('./fixtures/word-regression.json');
const layout=require('../frontend/ocr-layout.js'),ocr=require('../frontend/ocr-word.js');
global.OCRLayout=layout;
// Lock the accepted geometry/styles of public scenes. Never refresh these
// expectations automatically just because implementation output changed.
async function run(){
 const pdf=fs.readFileSync('tests/fixtures/word-regression-sample.pdf');
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 assert.equal(require('node:crypto').createHash('sha256').update(pdf).digest('hex'),fixture.sampleSha256,'Fixed public PDF changed; inspect and explain before accepting a new baseline');
 for(const {name,page,expected:e} of fixture.cases){
  const xml=layout.documentXml([structuredClone(page)]);
  const starts=[...xml.matchAll(/margin-left:([\d.]+)pt/g)].map(m=>Number(m[1]));
  assert.deepEqual(starts,e.starts,name+' source positions');
  assert.equal((xml.match(/<w:b\/>/g)||[]).length,e.bold,name+' bold');
  assert.equal((xml.match(/<w:i\/>/g)||[]).length,e.italic,name+' italic');
  assert.deepEqual([...new Set([...xml.matchAll(/w:ascii="([^"]+)"/g)].map(m=>m[1]))],e.fonts,name+' fonts');
  for(const text of e.texts)assert(xml.includes('>'+text+'</w:t>'),name+' preserves '+text);
  for(const text of e.absent||[])assert(!xml.includes('>'+text+'</w:t>'),name+' must not duplicate raster text');
  if(e.absent)assert(!xml.includes('preserve"> </w:t>'),name+' must not use blank raster placeholders');
  const files={};class Zip{file(n,v){files[n]=v;}async generateAsync(){return 'blob';}}
  await ocr.createDocx([page],Zip,true);
  assert.equal((files['word/_rels/document.xml.rels'].match(/Id="rPicture/g)||[]).length,e.pictures||0,name+' picture relationships');
  if(e.pictures)assert(files['word/media/picture-1-1.png'],name+' image bytes');
  console.log('Fixed Word regression:',name,'passed');
 }
 assert(fs.readFileSync('tests/word-regression.html','utf8').includes('word-regression-sample.pdf'));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
