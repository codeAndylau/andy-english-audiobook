import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const book = await read('editions/r2/book.json');
const manifest = await read('editions/r2/audio/manifest.json');
const timeline = await read('editions/r2/audio/sentences.json');
const sha = data => createHash('sha256').update(data).digest('hex');
test('published edition has complete matching text, audio and sentence ranges', async () => {
  assert.deepEqual(book.map(c => c.id), Array.from({length:24}, (_,i) => i+1));
  assert.equal(manifest.chapters.length, 24);
  assert.equal(timeline.chapters.length, 24);
  assert.equal(timeline.bookSha256, manifest.book.sha256);
  let previousEnd = 0;
  for (const [i, chapter] of book.entries()) {
    const audio = manifest.chapters[i];
    const sentences = timeline.chapters[i];
    assert.equal(audio.id, chapter.id);
    assert.equal(audio.title, chapter.title);
    assert.equal(sentences.id, chapter.id);
    assert.equal(audio.text_sha256, sha(`Chapter ${chapter.id}. ${chapter.title}.\n\n${chapter.story}`));
    assert.equal(audio.start, previousEnd);
    assert.ok(Math.abs(audio.end-audio.start-audio.duration) < .001);
    previousEnd = audio.end;
    assert.equal(audio.src, `editions/r2/audio/chapter-${String(chapter.id).padStart(2,'0')}.mp3`);
    assert.equal((await readFile(new URL(audio.src, root))).length, audio.bytes);
    let cursor = 0, time = audio.start;
    for (const [j, s] of sentences.sentences.entries()) {
      assert.equal(s.id, `${chapter.id}-${j+1}`);
      assert.equal(chapter.story.slice(s.charStart, s.charEnd), s.text);
      assert.equal(chapter.story.slice(cursor, s.charStart).trim(), '');
      assert.ok(s.start >= time && s.end > s.start && s.end <= audio.end);
      cursor = s.charEnd;
      time = s.end;
    }
    assert.equal(chapter.story.slice(cursor).trim(), '');
  }
  const full = await readFile(new URL(manifest.book.src, root));
  assert.equal(full.length, manifest.book.bytes);
  assert.equal(sha(full), manifest.book.sha256);
  assert.equal(previousEnd, manifest.book.duration);
});

test('downloaded playlist addresses all published chapters directly', async () => {
  const playlist = await readFile(new URL('editions/r2/audio/playlist.m3u', root), 'utf8');
  const entries = playlist.split('\n').filter(line => line && !line.startsWith('#'));
  assert.deepEqual(entries, manifest.chapters.map(c => `https://codeandylau.github.io/andy-english-audiobook/${c.src}`));
});
