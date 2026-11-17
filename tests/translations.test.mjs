import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranslations} from '../translations.mjs';
const s=(chapterId,id=1)=>({chapterId,id:`${chapterId}-${id}`});
const response=(chapterId)=>({ok:true,json:async()=>({chapterId,sentences:{[`${chapterId}-1`]:'第一句',[`${chapterId}-2`]:'第二句'}})});
test('hidden selection makes no request; showing loads one chapter and caches it',async()=>{
 const calls=[],states=[];const t=createTranslations({fetcher:async url=>{calls.push(url);return response(1)},onUpdate:v=>states.push(v)});
 await t.select(s(1));assert.equal(calls.length,0);await t.show(s(1));assert.equal(states.at(-1).text,'第一句');await t.select(s(1,2));assert.equal(states.at(-1).text,'第二句');assert.equal(calls.length,1);t.hide();assert.equal(states.at(-1).visible,false);
});
test('late old chapter result cannot overwrite latest sentence; hiding suppresses result',async()=>{
 const pending={},states=[];const t=createTranslations({fetcher:url=>new Promise(resolve=>{pending[url]=resolve}),onUpdate:v=>states.push(v)});
 const a=t.show(s(1));const b=t.select(s(2));pending['translations/chapter-02.json'](response(2));await b;assert.equal(states.at(-1).id,'2-1');pending['translations/chapter-01.json'](response(1));await a;assert.equal(states.at(-1).id,'2-1');t.hide();await t.select(s(1));assert.equal(states.at(-1).visible,false);
});
test('failed request can be retried and invalid chapter is rejected',async()=>{
 let count=0,last;const t=createTranslations({fetcher:async()=>++count===1?response(2):response(1),onUpdate:s=>last=s});await t.show(s(1));assert.equal(last.error,true);await t.retry();assert.equal(last.text,'第一句');assert.equal(last.error,false);
});
test('concurrent selections share chapter request and only latest selection renders',async()=>{
 let resolve,calls=0,last;const t=createTranslations({fetcher:()=>{calls++;return new Promise(r=>resolve=r)},onUpdate:s=>last=s});const a=t.show(s(1));const b=t.select(s(1,2));resolve(response(1));await Promise.all([a,b]);assert.equal(calls,1);assert.equal(last.text,'第二句');
});
test('hiding during a pending request does not reopen the panel',async()=>{
 let resolve,last;const t=createTranslations({fetcher:()=>new Promise(r=>resolve=r),onUpdate:s=>last=s});const pending=t.show(s(1));t.hide();resolve(response(1));await pending;assert.equal(last.visible,false);await t.show(s(1));assert.equal(last.text,'第一句');
});
test('network failure and missing sentence expose retry instead of stale text',async()=>{
 let count=0,last;const t=createTranslations({fetcher:async()=>{if(++count===1)throw new Error('offline');return response(1)},onUpdate:s=>last=s});await t.show(s(1));assert.equal(last.error,true);await t.retry();assert.equal(last.text,'第一句');await t.select(s(1,3));assert.equal(last.error,true);assert.ok(!last.text.includes('第一句'));
});
