const assert=require('assert'),fs=require('fs'),vm=require('vm'),core=require('../frontend/app-core.js');
assert.deepEqual(core.pages('3,1,3,5-7',8),[3,1,5,6,7]);assert.deepEqual(core.pages('',3),[1,2,3]);
for(const spec of ['0','2-1','4','1x','1,,2','1-99999999999','1.2','1-2-3'])assert.throws(()=>core.pages(spec,3));
const size=core.dimensions(10000,8000,8);assert(size.width*size.height<=8000000);assert(Math.max(size.width,size.height)<=4096);assert(size.limited);
assert.throws(()=>core.dimensions(Infinity,20));
assert(core.errorMessage({name:'PasswordException'}).includes('開啟密碼'));assert(core.errorMessage(Error('InvalidPDFException: invalid pdf')).includes('損壞'));
assert(core.errorMessage(Error('out of memory')).includes('記憶體'));assert(core.errorMessage(Error('Failed to fetch')).includes('重新整理'));
const h=new core.History();h.commit([{text:'one',x:1}]);h.markSaved();h.commit([{text:'two',x:2}]);assert(h.dirty);assert.equal(h.undo()[0].text,'one');assert(!h.dirty);assert.equal(h.redo()[0].text,'two');h.undo();h.commit([{text:'branch'}]);assert.equal(h.redo()[0].text,'branch');for(let i=0;i<120;i++)h.commit([{text:String(i)}]);assert(h.states.length<=100);h.reset([]);assert(!h.dirty);
(async()=>{
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);view.setUint32(16,100);view.setUint32(20,200);
 const result=await core.normalizeFiles([new File([png],'empty-mime.png')],'image/png,image/jpeg');assert.equal(result[0].type,'image/png');
 view.setUint32(16,20000);await assert.rejects(core.normalizeFiles([new File([png],'huge.png')],'image/png'),/1600/);
 await assert.rejects(core.normalizeFiles([new File(['RIFF WEBP'],'fake.jpg',{type:'image/jpeg'})],'image/png,image/jpeg'),/真正的/);
 await assert.rejects(core.normalizeFiles([new File(['not pdf'],'fake.pdf',{type:'application/pdf'})],'application/pdf'),/有效/);
 assert.equal((await core.normalizeFiles([new File(['%PDF-1.7'],'test.pdf')],'application/pdf'))[0].type,'application/pdf');
 const elements=new Map(),control={disabled:false};function element(id){if(!elements.has(id))elements.set(id,{disabled:false,hidden:false,textContent:'',removeAttribute(){delete this.value;}});return elements.get(id);}
 const doc={body:{dataset:{}},addEventListener(){},dispatchEvent(){},getElementById:element,querySelectorAll:()=>[control]};const context={window:{addEventListener(){}},document:doc,AbortController,MessageChannel,Event,performance,setInterval,clearInterval,queueMicrotask,console};vm.createContext(context);vm.runInContext(fs.readFileSync('frontend/app-core.js','utf8'),context);
 const task=context.window.AppTasks,button={textContent:'test',closest:()=>({querySelector:()=>null})};let finish,executions=0;
 const pending=task.run(button,async()=>{executions++;await new Promise(r=>finish=r);task.check();});assert(task.busy);assert(control.disabled);
 await task.run(button,async()=>executions++);assert.equal(executions,1);task.cancel();await assert.rejects(task.step(1,2),{name:'AbortError'});finish();await pending;assert(!task.busy);assert(!control.disabled);assert(element('task-label').textContent.includes('已取消'));
 const waiting=task.run(button,()=>task.wait(new Promise(()=>{})));task.cancel();await waiting;assert(!task.busy);
 await task.run(button,async()=>{task.downloaded();task.cancel();task.check();});assert.equal(element('task-progress').value,100);
 console.log('Strict selected pages, raster/file budgets, actionable errors, bounded undo branches and exclusive task cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
