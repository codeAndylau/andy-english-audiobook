const KEY = 'apatt-audiobook-v1';
const validRate = rate => Number.isFinite(rate) && rate >= .5 && rate <= 2;
export function chapterAtTime(chapters, time) {
  return [...chapters].reverse().find(chapter => time >= chapter.start) || chapters[0];
}
export function restorePosition(raw, manifest) {
  const fallback = { time: 0, rate: .9 };
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== manifest.version || (manifest.book.sha256 && value.fingerprint !== manifest.book.sha256)) return fallback;
    const time = Number.isFinite(value.time) && value.time >= 0 && value.time < manifest.book.duration - 1 ? value.time : 0;
    return { time, rate: validRate(value.rate) ? value.rate : .9 };
  } catch (_) { return fallback; }
}

export function createAudiobookPlayer(audio, manifest, options = {}) {
  const { storage, mediaSession, metadataFactory, onUpdate = () => {} } = options;
  let raw = null;
  try { raw = storage?.getItem(KEY); } catch (_) {}
  const resume = restorePosition(raw, manifest);
  let loop = null, loopTimer = null, internalSeekTarget = null;
  let pendingSeek = resume.time, metadataReady = false, error = '', buffering = false, request = 0, lastSave = 0, metadataChapter = null;
  audio.src = manifest.book.src;
  audio.defaultPlaybackRate = resume.rate;
  audio.playbackRate = resume.rate;
  const duration = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : manifest.book.duration;
  const position = () => pendingSeek === null ? (Number.isFinite(audio.currentTime) ? audio.currentTime : 0) : pendingSeek;
  const current = () => chapterAtTime(manifest.chapters, position());
  const clamp = time => Math.min(duration(), Math.max(0, time));
  function persist() {
    try { storage?.setItem(KEY, JSON.stringify({ version: manifest.version, fingerprint: manifest.book.sha256, time: position(), rate: audio.playbackRate })); } catch (_) {}
    lastSave = Date.now();
  }
  function notify() {
    const chapter = current();
    if (mediaSession) {
      if (chapter && metadataChapter !== chapter.id && metadataFactory) {
        try { mediaSession.metadata = metadataFactory({ title: `Chapter ${chapter.id} · ${chapter.title}`, artist: 'Andrew · AI English Narration', album: 'A Place at the Table', artwork: [{src:'audio-cover.svg',sizes:'512x512',type:'image/svg+xml'}] }); metadataChapter = chapter.id; } catch (_) {}
      }
      try { mediaSession.playbackState = audio.paused ? 'paused' : 'playing'; } catch (_) {}
      if (mediaSession.setPositionState && metadataReady) {
        try { mediaSession.setPositionState({ duration: duration(), playbackRate: audio.playbackRate, position: clamp(position()) }); } catch (_) {}
      }
    }
    onUpdate({ loop, chapter, time: position(), duration: duration(), rate: audio.playbackRate, playing: !audio.paused && !audio.ended, buffering, error, ended: !!audio.ended });
  }
  function seekTo(time, keepLoop = false) {
    if (!keepLoop) setLoop(null);
    if (!Number.isFinite(time)) return;
    const target = clamp(time);
    if (metadataReady) { try { internalSeekTarget = target; audio.currentTime = target; pendingSeek = null; } catch (_) { pendingSeek = target; } }
    else pendingSeek = target;
    error = ''; notify(); persist();
  }
  async function play() {
    const ownRequest = ++request; error = '';
    if (audio.ended || position() >= duration() - .5) seekTo(0);
    if (audio.error && typeof audio.load === 'function') { pendingSeek = position(); metadataReady = false; audio.load(); }
    try { await audio.play(); if (ownRequest === request) notify(); }
    catch (cause) {
      if (ownRequest !== request || cause.name === 'AbortError') return;
      error = cause.name === 'NotAllowedError' ? '请点击播放器的播放按钮，允许浏览器开始收听。' : '音频暂时无法播放，请检查网络后再试；也可以下载音频收听。';
      buffering = false; notify();
    }
  }
  function validRange(range) { return range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.start >= 0 && range.end > range.start && range.end <= duration(); }
  function stopLoopTimer() { if (loopTimer !== null) clearInterval(loopTimer); loopTimer = null; }
  function checkLoop() {
    if (loop && !audio.paused && !audio.seeking && position() >= loop.end) seekTo(loop.start, true);
  }
  function startLoopTimer() { stopLoopTimer(); if (loop && !audio.paused) { loopTimer = setInterval(checkLoop, 40); loopTimer.unref?.(); } }
  function setLoop(range) { loop = validRange(range) ? {...range} : null; startLoopTimer(); notify(); }
  async function playSentence(range, repeat = false) {
    if (!validRange(range)) return;
    seekTo(range.start); setLoop(repeat ? range : null); await play();
  }
  function pause() { request++; audio.pause(); persist(); }
  async function playChapter(id) { const chapter = manifest.chapters.find(c => c.id === id); if (!chapter) return; seekTo(chapter.start); await play(); }
  function seekBy(seconds) { seekTo(position() + seconds); }
  function setRate(rate) { if (!validRate(rate)) return; audio.defaultPlaybackRate = rate; audio.playbackRate = rate; notify(); persist(); }
  function adjacent(direction) {
    const index = manifest.chapters.findIndex(c => c.id === current().id);
    const next = manifest.chapters[index + direction];
    if (next) return playChapter(next.id);
  }
  audio.addEventListener('loadedmetadata', () => {
    metadataReady = true;
    if (pendingSeek !== null) { const target = pendingSeek; pendingSeek = null; seekTo(target, true); }
    notify();
  });
  audio.addEventListener('timeupdate', () => { checkLoop(); notify(); if (Date.now() - lastSave >= 5000) persist(); });
  audio.addEventListener('play', () => { error = ''; startLoopTimer(); notify(); });
  audio.addEventListener('playing', () => { buffering = false; error = ''; notify(); });
  audio.addEventListener('pause', () => { stopLoopTimer(); request++; buffering = false; notify(); persist(); });
  audio.addEventListener('waiting', () => { buffering = true; notify(); });
  audio.addEventListener('seeking', () => { const internal = internalSeekTarget !== null && Math.abs(audio.currentTime - internalSeekTarget) < .1; if (loop && !internal) setLoop(null); });
  audio.addEventListener('seeked', () => { internalSeekTarget = null; buffering = false; notify(); persist(); });
  audio.addEventListener('ratechange', () => { if (audio.defaultPlaybackRate !== audio.playbackRate) audio.defaultPlaybackRate = audio.playbackRate; notify(); persist(); });
  audio.addEventListener('durationchange', notify);
  audio.addEventListener('ended', () => { stopLoopTimer(); buffering = false; notify(); persist(); });
  audio.addEventListener('error', () => { stopLoopTimer(); error = '音频加载失败。请检查网络后点击“重试播放”，或使用下方下载链接。'; buffering = false; notify(); });
  if (mediaSession?.setActionHandler) {
    const actions = { play, pause, seekbackward: detail => seekBy(-(detail?.seekOffset || 15)), seekforward: detail => seekBy(detail?.seekOffset || 15), seekto: detail => seekTo(detail.seekTime), previoustrack: () => adjacent(-1), nexttrack: () => adjacent(1), stop: pause };
    for (const [name, handler] of Object.entries(actions)) { try { mediaSession.setActionHandler(name, handler); } catch (_) {} }
  }
  notify();
  return { play, pause, playChapter, playSentence, setLoop, seekTo, seekBy, setRate, persist, previous: () => adjacent(-1), next: () => adjacent(1) };
}
