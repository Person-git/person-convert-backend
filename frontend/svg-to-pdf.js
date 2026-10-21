(function(root){'use strict';
function length(value){const m=String(value||'').trim().match(/^([\d.]+)(px|pt|pc|mm|cm|in)?$/i);if(!m)return null;const n=Number(m[1])*({px:1,pt:96/72,pc:16,mm:96/25.4,cm:96/2.54,in:96}[m[2]?.toLowerCase()||'px']);return Number.isFinite(n)&&n>0?n:null;}
function size(svg){const v=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number),w=length(svg.getAttribute('width'))||(v.length===4?v[2]:null),h=length(svg.getAttribute('height'))||(v.length===4?v[3]:null);if(!w||!h||w>14400||h>14400||w<1||h<1||v.length===4&&(!v.every(Number.isFinite)||v[2]<=0||v[3]<=0))throw Error('SVG 尺寸無效，請設定 width／height 或有效 viewBox（最大 14400px）');return {width:w,height:h};}
function safeSource(text){if(text.length>5*1024*1024)throw Error('SVG 限 5 MB');if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text))throw Error('不支援 SVG 的外部宣告或實體，請另存獨立 SVG');}
function sanitize(doc){
 const svg=doc.documentElement;if(doc.querySelector('parsererror')||svg.localName!=='svg'||svg.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('SVG 格式無效，請使用有效的 SVG 檔案');
 const allowed=new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath image style'.toLowerCase().split(' ')),nodes=[svg,...svg.querySelectorAll('*')];if(nodes.length>10000)throw Error('SVG 物件超過 10000 個，請簡化圖形後重試');
 const ids=new Map();for(const n of nodes){if(n.id){if(ids.has(n.id))throw Error('SVG 有重複物件 ID，請另存後重試');ids.set(n.id,n);}}
 for(const n of nodes){
  if(!allowed.has(n.localName.toLowerCase())||n.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('SVG 含不支援的元素（如濾鏡、遮罩、動畫或 HTML），請從來源軟體簡化／轉外框後再試');
  for(const a of [...n.attributes]){
   const k=a.localName.toLowerCase(),v=a.value;if(k.startsWith('on')||k==='base'||/javascript:|expression\s*\(|@import|@font-face|[\\<>]/i.test(v))throw Error('SVG 含不支援的主動內容或外部資源');
   if(k==='href'&&!(n.localName==='image'?/^data:image\/(png|jpeg);base64,[a-z\d+/=\s]+$/i.test(v):/^#[^\s]+$/.test(v)))throw Error('SVG 僅接受內部引用與內嵌 PNG／JPG，不載入外部圖片或字型');
   for(const m of v.matchAll(/url\s*\((.*?)\)/gi))if(!/^['"]?#[\w:.-]+['"]?$/.test(m[1].trim()))throw Error('SVG 不載入外部資源，請內嵌圖片或將文字轉外框');
  }
  if(n.localName==='style'&&(/@|\\|<|>|(?:url\s*\((?!\s*['"]?#))/i.test(n.textContent)))throw Error('SVG 樣式含外部字型或不支援規則，請轉外框或移除外部樣式');
 }
 // Reject recursive references before conversion; referenced subtrees may themselves contain uses.
 let visits=0;function visit(n,stack,depth){if(++visits>100000||depth>32||stack.has(n))throw Error('SVG 引用循環或巢狀過深，請簡化後重試');const next=new Set(stack);next.add(n);for(const c of n.children)visit(c,next,depth+1);const ref=n.getAttribute('href')||n.getAttributeNS('http://www.w3.org/1999/xlink','href');if(ref?.startsWith('#')){const target=ids.get(ref.slice(1));if(!target)throw Error('SVG 引用物件不存在');visit(target,next,depth+1);}}
 visit(svg,new Set(),0);return svg;
}
if(typeof module!=='undefined'){module.exports={length,size,safeSource,sanitize};return;}
const $=id=>document.getElementById(id);let file=null,font=null,loading=null;
function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script'),timer=setTimeout(()=>{s.remove();reject(Error('載入向量轉換引擎逾時，請連線後重試'));},30000);s.src=src;s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('無法載入向量轉換引擎，請連線後重試'));};document.head.append(s);});}
function engine(){if(!loading)loading=(async()=>{if(!root.jspdf)await script('https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js');if(!root.jspdf.jsPDF.API.svg)await script('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.8.1/dist/svg2pdf.umd.min.js');})().catch(e=>{loading=null;throw e;});return loading;}
document.addEventListener('DOMContentLoaded',()=>{
 function tab(pdf){if(root.AppTasks.busy)return;for(const [id,selected]of [['vector-export-tab',pdf],['vector-import-tab',!pdf]]){$(id).setAttribute('aria-selected',String(selected));$(id).tabIndex=selected?0:-1;}$('vector-export-panel').hidden=!pdf;$('vector-import-panel').hidden=pdf;}
 $('vector-export-tab').onclick=()=>tab(true);$('vector-import-tab').onclick=()=>tab(false);
 for(const id of ['vector-export-tab','vector-import-tab'])$(id).onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const pdf=e.key==='Home'||e.key!=='End'&&id==='vector-import-tab';tab(pdf);$(pdf?'vector-export-tab':'vector-import-tab').focus();}};
 const input=$('input-vector-svg'),drop=$('dz-vector-svg');async function choose(f){if(!f||root.AppTasks.busy)return;root.DownloadResults.clearOwner('tool-12');if(f.size>5*1024*1024){root.setStatus('status-vector-svg','SVG 限 5 MB',true);return;}file=f;root.renderList('list-vector-svg',[f],()=>{file=null;input.value='';$('btn-svg-pdf').disabled=true;root.renderList('list-vector-svg',[]);});$('btn-svg-pdf').disabled=false;root.setStatus('status-vector-svg','已選擇 SVG，轉換時會檢查格式與引用。');}
 drop.onclick=()=>{if(!root.AppTasks.busy)input.click();};input.onclick=e=>e.stopPropagation();input.onchange=()=>void choose(input.files[0]);drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();void choose(e.dataTransfer.files[0]);};
 $('input-svg-font').onchange=()=>{font=$('input-svg-font').files[0]||null;root.DownloadResults.clearOwner('tool-12');};
 $('btn-svg-pdf').onclick=async()=>{
  if(!file)return;let mount,fontFace;
  try{
   root.AppTasks.phase('檢查 SVG 與內嵌資源');const text=await file.text();safeSource(text);const svg=sanitize(new DOMParser().parseFromString(text,'image/svg+xml')),{width,height}=size(svg),letters=[...svg.querySelectorAll('text,tspan')].map(n=>n.textContent).join('');root.AppTasks.check();
   if(/[^\x20-\x7e\s]/.test(letters)&&!font)throw Error('SVG 含中文或特殊字元，請提供涵蓋這些文字的 TTF 字型，或先將文字轉外框，以免輸出亂碼');
   root.AppTasks.phase('載入本機向量轉換引擎');await engine();root.AppTasks.check();const pdf=new root.jspdf.jsPDF({orientation:width>height?'landscape':'portrait',unit:'pt',format:[width*.75,height*.75],compress:true});
   for(const image of svg.querySelectorAll('image')){const uri=image.getAttribute('href')||image.getAttributeNS('http://www.w3.org/1999/xlink','href');if(uri?.startsWith('data:')){const raw=atob(uri.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));await root.AppCore.normalizeFiles([new File([bytes],'embedded.png')],'image/png,image/jpeg');}}
   if(font){if(font.size>20*1024*1024)throw Error('TTF 字型限 20 MB');const bytes=new Uint8Array(await font.arrayBuffer());if(bytes[0]!==0||bytes[1]!==1||bytes[2]!==0||bytes[3]!==0)throw Error('請選擇有效的 TrueType TTF 字型，不支援 OTF／TTC');fontFace=new FontFace('UserFont',bytes.buffer);await fontFace.load();document.fonts.add(fontFace);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));pdf.addFileToVFS('UserFont.ttf',btoa(binary));pdf.addFont('UserFont.ttf','UserFont','normal');const metadata=pdf.getFont('UserFont','normal').metadata;if(!metadata?.Unicode||typeof metadata.characterToGlyph!=='function')throw Error('TTF 字型無法解析，請更換字型');for(const c of letters)if(!/\s/.test(c)&&(c.codePointAt(0)>65535||!metadata.characterToGlyph(c.codePointAt(0))))throw Error('所選 TTF 缺少來源字元，請改選涵蓋全文的字型，或先將文字轉外框');for(const style of svg.querySelectorAll('style'))style.textContent+='\ntext,tspan {font-family:UserFont !important;font-weight:normal !important;font-style:normal !important}';for(const n of [svg,...svg.querySelectorAll('*')]){n.setAttribute('font-family','UserFont');n.style.setProperty('font-family','UserFont','important');n.style.setProperty('font-weight','normal','important');n.style.setProperty('font-style','normal','important');}}
   if(!svg.hasAttribute('viewBox'))svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));mount=document.createElement('div');mount.style.cssText='position:fixed;left:-30000px;top:0;pointer-events:none';mount.inert=true;const renderSvg=document.importNode(svg,true);mount.attachShadow({mode:'closed'}).append(renderSvg);document.body.append(mount);
   root.AppTasks.phase('轉換向量路徑與文字');await pdf.svg(renderSvg,{x:0,y:0,width:width*.75,height:height*.75,loadExternalStyleSheets:false});root.AppTasks.check();
   root.DownloadResults.publish(pdf.output('blob'),file.name.replace(/\.svg$/i,'')+'-vector.pdf','tool-12');root.setStatus('status-vector-svg','完成 · 已輸出向量 PDF；線條／形狀保持向量，內嵌圖片仍為點陣圖。請檢查字型與特殊效果。');
  }catch(e){root.setStatus('status-vector-svg',e,true);}finally{mount?.remove();if(fontFace)document.fonts.delete(fontFace);}
 };
});
})(typeof window!=='undefined'?window:globalThis);
