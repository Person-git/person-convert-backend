const assert=require('node:assert/strict');const {length,size,safeSource,sanitize}=require('../frontend/svg-to-pdf.js');
assert.equal(length('1in'),96);assert.equal(length('72pt'),96);assert.equal(length('100%'),null);assert.equal(length('NaN'),null);
class N{constructor(tag,attrs={},children=[]){this.localName=tag;this.namespaceURI='http://www.w3.org/2000/svg';this.a=attrs;this.id=attrs.id;this.children=children;this.attributes=Object.entries(attrs).map(([localName,value])=>({localName,value}));this.textContent='';}getAttribute(k){return this.a[k]||null;}getAttributeNS(ns,k){return this.getAttribute(k);}querySelectorAll(){return this.children.flatMap(c=>[c,...c.querySelectorAll()]);}}
const doc=n=>({documentElement:n,querySelector:()=>null});
assert.deepEqual(size(new N('svg',{width:'600',height:'360'})),{width:600,height:360});assert.deepEqual(size(new N('svg',{viewBox:'-10 -20 300 150'})),{width:300,height:150});assert.throws(()=>size(new N('svg',{viewBox:'0 0 -10 20'})),/尺寸/);
assert.throws(()=>safeSource('<!DOCTYPE svg>'),/宣告/);assert.throws(()=>safeSource('x'.repeat(5*1024*1024+1)),/5 MB/);
assert(sanitize(doc(new N('svg',{},[new N('path',{d:'M0 0L10 10'})]))));
for(const bad of [new N('script'),new N('foreignObject'),new N('mask'),new N('path',{onclick:'alert(1)'}),new N('image',{href:'https://example.com/a.png'}),new N('path',{fill:'url(https://example.com/a)'}),new N('use',{href:'#missing'})])assert.throws(()=>sanitize(doc(new N('svg',{},[bad]))));
const loop=new N('g',{id:'a'},[new N('use',{href:'#a'})]);assert.throws(()=>sanitize(doc(new N('svg',{},[loop]))),/循環/);
assert(sanitize(doc(new N('svg',{},[new N('defs',{},[new N('path',{id:'p',d:'M0 0L10 10'})]),new N('use',{href:'#p'})]))));
const style=new N('style');style.textContent='@import "https://example.com/a";';assert.throws(()=>sanitize(doc(new N('svg',{},[style]))),/樣式/);
console.log('SVG physical dimensions, source limits, allowed geometry, external/active content rejection and reference cycle checks passed');
