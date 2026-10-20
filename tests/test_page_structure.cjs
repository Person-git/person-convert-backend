const assert=require('node:assert/strict'),s=require('../frontend/page-structure.js'),layout=require('../frontend/ocr-layout.js');
function pixels(w,h,bg=[253,241,202]){const a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4)a.set([...bg,255],i);return a;}
const light=pixels(80,30);assert.equal(s.flatColour(light,80,30),'FDF1CA');assert.equal(s.flatColour(pixels(80,30,[25,60,100]),80,30),null);
const mixed=pixels(80,30);for(let y=0;y<30;y++)for(let x=40;x<80;x++)mixed.set([190,220,250,255],(y*80+x)*4);assert.equal(s.flatColour(mixed,80,30),null);
const w=400,h=260,a=pixels(w,h,[255,255,255]),xs=[30,140,250,360],ys=[30,80,130,180,230];for(const y of ys)for(let x=30;x<=360;x++)a.set([20,20,20,255],(y*w+x)*4);for(const x of xs)for(let y=30;y<=230;y++)a.set([20,20,20,255],(y*w+x)*4);
const grids=s.gridLines(a,w,h);assert.equal(grids.length,1);assert.deepEqual(grids[0].xs,xs);assert.deepEqual(grids[0].ys,ys);
const line=(text,x,y)=>({text,fontSize:10,bbox:{x0:x,y0:y,x1:x+35,y1:y+12}}),lines=[line('Header',40,45),line('Value',150,45),line('12.5',40,95),line('mg',150,95),line('outside',10,240)];const out=s.tables(lines,grids,1);assert.equal(out.tables.length,1);assert.equal(out.lines.length,1);assert.equal(out.tables[0].rows.length,4);assert.equal(out.tables[0].rows[0].length,3);assert(out.tables[0].rows[1][0][0].text==='12.5');
const xml=layout.documentXml([{width:400,height:260,scale:1,lines:out.lines,tables:out.tables}]);assert.equal((xml.match(/<w:tbl>/g)||[]).length,1);assert.equal((xml.match(/<w:tc>/g)||[]).length,12);assert.equal((xml.match(/Header/g)||[]).length,1);assert(xml.includes('w:tblpX="600"'));assert(xml.includes('w:tblpY="600"'));
const crossing=s.tables([...lines,line('cross',130,95)],grids,1);assert.equal(crossing.tables.length,0);
// A missing internal vertical segment (merged cells) must not be silently reconstructed.
for(let y=31;y<80;y++)a.set([255,255,255,255],(y*w+140)*4);assert.equal(s.gridLines(a,w,h).length,0);
console.log('Flat/complex background safety, complete grids, merged/crossing rejection, table geometry and nonduplicated Word cells passed');

const canvas={width:400,height:260,getContext:()=>({getImageData:(x,y,w,h)=>({data:pixels(w,h)})})};const repaired=s.background(canvas,{x0:40,y0:45,x1:75,y1:57},grids);assert.equal(repaired.colour,'FDF1CA');assert(repaired.x>30&&repaired.x+repaired.width<140);assert.equal(s.background(canvas,{x0:29,y0:45,x1:75,y1:57},grids),null);
