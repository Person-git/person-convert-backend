(function(root){'use strict';
class Results{
 constructor(urls,limit=256*1024*1024){this.urls=urls;this.limit=limit;this.items=new Map();}
 clear(key){const old=this.items.get(key);if(old)this.urls.revokeObjectURL(old.url);this.items.delete(key);}
 clearOwner(owner){for(const [key,item]of this.items)if(item.owner===owner)this.clear(key);}
 clearAll(){for(const key of this.items.keys())this.clear(key);}
 put(key,owner,blob,name){
  if(!blob||blob.size>128*1024*1024)throw Error('輸出超過 128 MB，請減少頁數或降低解析度後重試');
  this.clear(key);const evicted=[];let total=[...this.items.values()].reduce((n,x)=>n+x.size,0);
  for(const [id,item]of this.items){if(total+blob.size<=this.limit)break;total-=item.size;this.clear(id);evicted.push(id);}
  const item={owner,name,size:blob.size,url:this.urls.createObjectURL(blob)};this.items.set(key,item);return {item,evicted};
 }
}
if(typeof module!=='undefined'){module.exports={Results};return;}
const store=new Results(URL),panels=new Map();
function hide(key){const p=panels.get(key);if(!p)return;p.link.removeAttribute('href');p.link.removeAttribute('download');p.panel.hidden=true;}
function clear(key){store.clear(key);hide(key);}
function clearOwner(owner){for(const [key,p]of panels)if(p.owner===owner)hide(key);store.clearOwner(owner);}
function publish(blob,name,owner=root.AppTasks?.owner,options={}){
 root.AppTasks?.check();const host=options.host||document.getElementById(owner);if(!host)throw Error('找不到下載結果所屬功能，請重新開啟頁面');
 const key=options.key||owner,{item,evicted}=store.put(key,owner,blob,name);evicted.forEach(hide);
 let p=panels.get(key);if(!p){
  const panel=document.createElement('div'),title=document.createElement('strong'),filename=document.createElement('p'),link=document.createElement('a'),remove=document.createElement('button'),note=document.createElement('p');
  panel.className='preview-panel download-result';panel.dataset.resultKey=key;title.textContent='上次完成的檔案';link.className='run';link.textContent='再次下載';remove.type='button';remove.className='preview-button';remove.textContent='清除結果';note.className='desc';
  link.onclick=e=>{if(root.AppTasks?.busy){e.preventDefault();return;}root.AppTasks?.downloaded();};remove.onclick=()=>{if(!root.AppTasks?.busy)clear(key);};
  panel.append(title,filename,link,document.createTextNode(' '),remove,note);host.append(panel);p={panel,filename,link,note,owner};panels.set(key,p);
 }
 p.filename.textContent=name;p.link.href=item.url;p.link.download=name;p.panel.hidden=false;
 p.note.textContent=(evicted.length?'已釋放較早的結果以控制記憶體。':'')+'只暫存在目前分頁，沒有固定分鐘數。此功能重選／移除文件或開始下一次輸出、重新整理、關閉或瀏覽器回收分頁後清除。全站最多暫存 256 MB，超過時釋放較早結果；請及時下載。';
 const auto=document.createElement('a');auto.href=item.url;auto.download=name;document.body.append(auto);auto.click();auto.remove();root.AppTasks?.downloaded();return item.url;
}
root.DownloadResults={publish,clear,clearOwner};root.addEventListener('pagehide',()=>{store.clearAll();for(const key of panels.keys())hide(key);});
})(typeof window!=='undefined'?window:globalThis);
