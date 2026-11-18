import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudiobookPlayer, chapterAtTime, restorePosition } from '../audio-player.mjs';

const manifest = { version: 1, book: { src: 'full.m4a', duration: 300, sha256: 'book' }, chapters: [
  {id:1,title:'One',src:'one.mp3',start:0,end:100,duration:100},
  {id:2,title:'Two',src:'two.mp3',start:100,end:200,duration:100},
  {id:3,title:'Three',src:'three.mp3',start:200,end:300,duration:100}
] };
class Audio extends EventTarget {
  constructor() { super(); this.currentTime=0; this.duration=NaN; this.paused=true; this.ended=false; this.playbackRate=1; this.plays=0; this.loads=0; this.sources=[]; this.error=null; }
  set src(value) { this._src=value; this.sources.push(value); this.currentTime=0; this.duration=NaN; this.paused=true; this.ended=false; }
  get src() { return this._src; }
  removeAttribute(key) { if(key==='src') this._src=''; }
  load() { this.loads++; this.currentTime=0; this.duration=NaN; this.paused=true; this.error=null; this.playbackRate=1; }
  play() { this.plays++; if(this.playResult) return this.playResult(); this.paused=false; this.ended=false; this.emit('play'); return Promise.resolve(); }
  pause() { this.paused=true; this.emit('pause'); }
  emit(name) { this.dispatchEvent(new Event(name)); }
  ready() { this.duration=100; this.emit('loadedmetadata'); }
  tick(time) { this.currentTime=time; this.emit('timeupdate'); }
  finish() { this.currentTime=100; this.paused=true; this.ended=true; this.emit('ended'); }
}
function setup(saved, ready=true) {
  const audio=new Audio(), preloadAudio=new Audio(), updates=[], writes=[], handlers={}, positions=[];
  const mediaSession={setActionHandler:(key,fn)=>handlers[key]=fn,setPositionState:state=>positions.push(state)};
  const player=createAudiobookPlayer(audio,manifest,{preloadAudio,mediaSession,metadataFactory:x=>x,storage:{getItem:()=>saved,setItem:(_,v)=>writes.push(JSON.parse(v))},onUpdate:s=>updates.push(s)});
  if(ready) audio.ready();
  return {audio,preloadAudio,player,updates,writes,handlers,positions,mediaSession,state:()=>updates.at(-1)};
}
const saved=(time,rate=.8)=>JSON.stringify({version:1,fingerprint:'book',time,rate});

test('editions keep independent progress when old and new tabs both save',()=>{
  const values=new Map([['apatt-audiobook-v1',saved(120)],['apatt-audiobook-r2',saved(210)]]);
  const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const oldAudio=new Audio(), newAudio=new Audio();
  const oldPlayer=createAudiobookPlayer(oldAudio,manifest,{storage});
  const newPlayer=createAudiobookPlayer(newAudio,manifest,{storage,storageKey:'apatt-audiobook-r2'});
  oldAudio.ready();newAudio.ready();
  assert.equal(oldAudio.src,'two.mp3');assert.equal(newAudio.src,'three.mp3');
  newAudio.tick(35);newPlayer.persist();oldAudio.tick(45);oldPlayer.persist();
  assert.equal(JSON.parse(values.get('apatt-audiobook-r2')).time,235);
  assert.equal(JSON.parse(values.get('apatt-audiobook-v1')).time,145);
});

test('chapter boundaries and incompatible saved records are validated',()=>{
  assert.equal(chapterAtTime(manifest.chapters,100).id,2);
  assert.deepEqual(restorePosition('{',manifest),{time:0,rate:.9});
  assert.equal(restorePosition(saved(300),manifest).time,0);
  assert.equal(restorePosition(JSON.stringify({version:1,fingerprint:'old',time:140}),manifest).time,0);
});
test('default source is first chapter; global duration remains the book duration',()=>{const s=setup();assert.equal(s.audio.src,'one.mp3');assert.equal(s.state().duration,300);assert.equal(s.audio.plays,0);});
test('resume chooses only saved chapter and applies local seek without autoplay',()=>{const s=setup(saved(142),false);assert.equal(s.audio.src,'two.mp3');assert.equal(s.state().time,142);s.audio.ready();assert.equal(s.audio.currentTime,42);assert.equal(s.state().time,142);assert.equal(s.audio.playbackRate,.8);assert.equal(s.audio.plays,0);});
test('native time updates and persistence are absolute; native media positions are local',()=>{const s=setup(saved(142));s.audio.tick(55);s.player.persist();assert.equal(s.state().time,155);assert.equal(s.writes.at(-1).time,155);assert.deepEqual(s.positions.at(-1),{duration:100,playbackRate:.8,position:55});s.handlers.seekto({seekTime:25});assert.equal(s.audio.currentTime,25);assert.equal(s.state().time,125);});
test('chapter play invokes play in gesture, applies pending seek and keeps rate',async()=>{const s=setup();s.player.setRate(1.25);const playing=s.player.playChapter(3);assert.equal(s.audio.plays,1);await playing;assert.equal(s.audio.src,'three.mp3');s.audio.ready();assert.equal(s.audio.currentTime,0);assert.equal(s.audio.playbackRate,1.25);assert.equal(s.state().time,200);s.player.pause();});
test('cross chapter seek keeps playing intent, while paused seek stays paused',async()=>{const s=setup();s.player.seekTo(120);s.audio.ready();assert.equal(s.audio.currentTime,20);assert.equal(s.audio.plays,0);await s.player.play();s.player.seekBy(100);s.audio.ready();assert.equal(s.audio.src,'three.mp3');assert.equal(s.audio.currentTime,20);assert.equal(s.audio.paused,false);s.player.pause();});
test('pause during metadata wait prevents subsequent autoplay',async()=>{const s=setup();await s.player.playChapter(2);s.player.pause();const calls=s.audio.plays;s.audio.ready();assert.equal(s.audio.paused,true);assert.equal(s.audio.plays,calls);assert.equal(s.state().playing,false);});
test('ended advances to next chapter and final ending stops until requested restart',async()=>{const s=setup();await s.player.play();s.audio.finish();assert.equal(s.audio.src,'two.mp3');s.audio.ready();assert.equal(s.audio.paused,false);s.audio.finish();s.audio.ready();s.audio.finish();assert.equal(s.audio.src,'three.mp3');assert.equal(s.state().time,300);assert.equal(s.state().ended,true);await s.player.play();assert.equal(s.audio.src,'one.mp3');s.player.pause();});
test('retry reloads chosen chapter and preserves pending absolute time and rate',async()=>{const s=setup(saved(142));s.audio.error={code:2};s.audio.emit('error');await s.player.play();assert.equal(s.audio.src,'two.mp3');assert.equal(s.audio.loads,1);s.audio.ready();assert.equal(s.audio.currentTime,42);assert.equal(s.audio.playbackRate,.8);assert.equal(s.state().error,'');s.player.pause();});
test('late rejected play from prior chapter does not overwrite latest state',async()=>{const s=setup();let reject;s.audio.playResult=()=>new Promise((_,r)=>reject=r);const old=s.player.playChapter(2);s.audio.playResult=null;await s.player.playChapter(3);s.audio.ready();reject(Object.assign(new Error('old'),{name:'NotAllowedError'}));await old;assert.equal(s.state().chapter.id,3);assert.equal(s.state().error,'');assert.equal(s.state().playing,true);s.player.pause();});
test('play denial exposes retryable error and clears buffering',async()=>{const s=setup();s.audio.playResult=()=>Promise.reject(Object.assign(new Error('blocked'),{name:'NotAllowedError'}));await s.player.play();assert.match(s.state().error,/点击/);assert.equal(s.state().buffering,false);});
test('sentence repeat uses absolute range within chosen source and native seek cancels it',async()=>{const s=setup(saved(142));await s.player.playSentence({start:142,end:145},true);s.audio.emit('seeking');assert.ok(s.state().loop);s.audio.emit('seeked');s.audio.tick(45.1);assert.equal(s.audio.currentTime,42);s.audio.emit('seeking');assert.ok(s.state().loop);s.audio.emit('seeked');s.audio.currentTime=43;s.audio.emit('seeking');assert.equal(s.state().loop,null);s.player.pause();});
test('invalid or cross chapter sentence ranges cannot change source or playback',async()=>{const s=setup();for(const range of [{start:-1,end:2},{start:99,end:101},{start:10,end:5},{start:250,end:301},{start:NaN,end:10}]) await s.player.playSentence(range,true);assert.equal(s.audio.plays,0);assert.equal(s.audio.src,'one.mp3');s.player.setLoop({start:99,end:101});assert.equal(s.state().loop,null);});
test('loop at chapter end repeats instead of advancing and pause disables loop execution',async()=>{const s=setup();await s.player.playSentence({start:98,end:100},true);s.audio.finish();assert.equal(s.audio.src,'one.mp3');assert.equal(s.audio.currentTime,98);assert.equal(s.audio.paused,false);s.player.pause();s.audio.tick(100);assert.equal(s.audio.currentTime,100);s.player.setLoop(null);});
test('next chapter preloads only when playing in final 30 seconds and stays bounded',async()=>{const s=setup();s.audio.tick(80);assert.equal(s.preloadAudio.sources.length,0);await s.player.play();assert.equal(s.preloadAudio.src,'two.mp3');assert.equal(s.preloadAudio.preload,'auto');assert.equal(s.preloadAudio.muted,true);assert.equal(s.preloadAudio.plays,0);s.audio.tick(85);assert.equal(s.preloadAudio.sources.length,1);s.player.pause();assert.equal(s.preloadAudio.src,'');await s.player.playChapter(3);s.audio.ready();s.audio.tick(90);assert.equal(s.preloadAudio.src,'');s.player.pause();});
test('native pause before ended still advances and stale pause after switching cannot cancel playback',async()=>{const s=setup();await s.player.play();s.audio.currentTime=100;s.audio.ended=true;s.audio.paused=true;s.audio.emit('pause');s.audio.emit('ended');assert.equal(s.audio.src,'two.mp3');s.audio.emit('pause');s.audio.ready();assert.equal(s.state().playing,true);s.player.pause();});
test('loop timer catches sentence end without timeupdate and stops on pause and error',async t=>{t.mock.timers.enable({apis:['setInterval']});const s=setup();await s.player.playSentence({start:2,end:5},true);s.audio.currentTime=5.1;t.mock.timers.tick(40);assert.equal(s.audio.currentTime,2);s.player.pause();s.audio.currentTime=6;t.mock.timers.tick(80);assert.equal(s.audio.currentTime,6);await s.player.play();s.audio.error={code:2};s.audio.emit('error');s.audio.currentTime=7;t.mock.timers.tick(80);assert.equal(s.audio.currentTime,7);s.player.setLoop(null);});
test('rapid pending metadata choices retain latest target and explicit rate',async()=>{const s=setup(undefined,false);await s.player.playChapter(2);s.player.seekTo(245);s.player.setRate(.7);s.audio.ready();assert.equal(s.audio.src,'three.mp3');assert.equal(s.audio.currentTime,45);assert.equal(s.state().time,245);assert.equal(s.audio.playbackRate,.7);s.player.pause();});
test('native speed selection persists and previous/next select chapter sources',async()=>{const s=setup(saved(142));s.audio.playbackRate=2;s.audio.emit('ratechange');assert.equal(s.writes.at(-1).rate,2);await s.handlers.nexttrack();s.audio.ready();assert.equal(s.audio.src,'three.mp3');assert.equal(s.audio.playbackRate,2);await s.handlers.previoustrack();s.audio.ready();assert.equal(s.audio.src,'two.mp3');assert.equal(s.mediaSession.metadata.title,'Chapter 2 · Two');s.player.pause();});
test('global seek clamps both ends and leaving preload window releases next request',async()=>{const s=setup();s.player.seekTo(-12);assert.equal(s.state().time,0);await s.player.play();s.audio.tick(80);assert.equal(s.preloadAudio.src,'two.mp3');s.player.seekTo(10);assert.equal(s.preloadAudio.src,'');s.player.seekTo(500);s.audio.ready();assert.equal(s.state().time,300);assert.equal(s.audio.currentTime,100);s.player.pause();});
test('native replay after final completion restarts chapter one',async()=>{const s=setup(saved(240));await s.player.play();s.audio.finish();assert.equal(s.state().ended,true);s.audio.currentTime=0;await s.audio.play();assert.equal(s.audio.src,'one.mp3');s.audio.ready();assert.equal(s.state().time,0);assert.equal(s.state().chapter.id,1);assert.equal(s.state().playing,true);s.player.pause();});
test('deliberate global seek after completion cancels native full-book restart',async()=>{const s=setup(saved(240));await s.player.play();s.audio.finish();s.player.seekTo(230);await s.audio.play();assert.equal(s.audio.src,'three.mp3');assert.equal(s.state().time,230);s.player.pause();});
test('native paused scrub after final completion cancels full-book restart',async()=>{const s=setup(saved(240));await s.player.play();s.audio.emit('seeked');s.audio.finish();s.audio.currentTime=30;s.audio.emit('seeking');s.audio.emit('seeked');await s.audio.play();assert.equal(s.audio.src,'three.mp3');assert.equal(s.state().time,230);s.player.pause();});
test('native replay automatic seek before play preserves full-book restart',async()=>{const s=setup(saved(240));await s.player.play();s.audio.emit('seeked');s.audio.finish();s.audio.currentTime=0;s.audio.paused=false;s.audio.ended=false;s.audio.emit('seeking');s.audio.emit('seeked');s.audio.emit('play');assert.equal(s.audio.src,'one.mp3');s.player.pause();});
