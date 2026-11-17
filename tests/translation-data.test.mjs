import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const timeline = JSON.parse(await readFile(new URL('../audio/sentences.json',import.meta.url),'utf8'));
for(const chapter of timeline.chapters) test(`chapter ${chapter.id} translations match every sentence id`,async()=>{
 const data=JSON.parse(await readFile(new URL(`../translations/chapter-${String(chapter.id).padStart(2,'0')}.json`,import.meta.url),'utf8'));
 assert.equal(data.chapterId,chapter.id);
 assert.deepEqual(Object.keys(data.sentences).sort(),chapter.sentences.map(s=>s.id).sort());
 for(const sentence of chapter.sentences){ const zh=data.sentences[sentence.id];assert.equal(typeof zh,'string');assert.ok(zh.trim(),sentence.id);assert.ok(!/TODO|TBD|待翻译/.test(zh),sentence.id); }
});
