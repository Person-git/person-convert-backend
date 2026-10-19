const fs=require('fs'),vm=require('vm'),assert=require('assert');
let destroyed=0,cancelled=0,removed=0,resolveBytes;
const context={window:{AppCore:{yieldTask:async()=>{}},pdfjsLib:{getDocument:()=>({destroy:async()=>destroyed++,promise:new Promise(()=>{})})}},document:{addEventListener(){},removeEventListener(){removed++;}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/lazy-pdf.js','utf8'),context);
(async()=>{
 const viewer=new context.window.LazyPDF({},{});const pending=viewer.load({arrayBuffer:()=>new Promise(r=>resolveBytes=r)});viewer.dispose();resolveBytes(new ArrayBuffer(1));await pending;assert.equal(destroyed,1);
 const second=new context.window.LazyPDF({},{}),canvas={width:100,height:200};second.items=[{canvas}];second.loaded=second.items;second.queue.add({});second.task={destroy:async()=>destroyed++};second.renderTask={cancel:()=>cancelled++};second.dispose();assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(second.queue.size,0);assert.equal(cancelled,1);assert.equal(removed,2);
 console.log('Lazy preview late-load disposal, raster release, queue clearing and render cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
