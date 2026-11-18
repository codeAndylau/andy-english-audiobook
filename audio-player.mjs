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
  const { storage, storageKey = KEY, mediaSession, metadataFactory, preloadAudio, onUpdate = () => {} } = options;
  let raw = null;
  try { raw = storage?.getItem(storageKey); } catch (_) {}
  const resume = restorePosition(raw, manifest);
  let chapter = chapterAtTime(manifest.chapters, resume.time), rate = resume.rate;
  let pendingSeek = resume.time, metadataReady = false, wantsPlay = false, completed = false;
  let loop = null, loopTimer = null, internalSeekTarget = null;
  let error = '', buffering = false, request = 0, lastSave = 0, metadataChapter = null, preloaded = null;
  const clamp = time => Math.min(manifest.book.duration, Math.max(0, time));
  const localDuration = () => metadataReady && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : chapter.duration;
  const position = () => pendingSeek ?? Math.min(chapter.end, chapter.start + (Number.isFinite(audio.currentTime) ? audio.currentTime : 0));
  const playing = () => wantsPlay && !audio.paused && !audio.ended && !error;
  function persist() {
    try { storage?.setItem(storageKey, JSON.stringify({ version: manifest.version, fingerprint: manifest.book.sha256, time: position(), rate })); } catch (_) {}
    lastSave = Date.now();
  }
  function updatePreload() {
    if (!preloadAudio) return;
    const index = manifest.chapters.indexOf(chapter);
    const next = playing() && !loop && chapter.end - position() <= 30 ? manifest.chapters[index + 1] : null;
    if (next?.src === preloaded || (!next && !preloaded)) return;
    if (preloaded) {
      preloadAudio.pause();
      preloadAudio.removeAttribute('src');
      preloadAudio.load();
    }
    preloaded = next?.src || null;
    if (preloaded) {
      preloadAudio.muted = true;
      preloadAudio.preload = 'auto';
      preloadAudio.src = preloaded;
      preloadAudio.load();
    }
  }
  function notify() {
    updatePreload();
    if (mediaSession) {
      if (metadataChapter !== chapter.id && metadataFactory) {
        try { mediaSession.metadata = metadataFactory({ title: `Chapter ${chapter.id} · ${chapter.title}`, artist: 'Andrew · AI English Narration', album: 'A Place at the Table', artwork: [{src:'audio-cover.svg',sizes:'512x512',type:'image/svg+xml'}] }); metadataChapter = chapter.id; } catch (_) {}
      }
      try { mediaSession.playbackState = playing() ? 'playing' : 'paused'; } catch (_) {}
      if (mediaSession.setPositionState && metadataReady) {
        try { mediaSession.setPositionState({ duration: localDuration(), playbackRate: rate, position: Math.min(localDuration(), Math.max(0, position() - chapter.start)) }); } catch (_) {}
      }
    }
    onUpdate({ loop, chapter, time: position(), duration: manifest.book.duration, rate, playing: playing(), buffering, error, ended: !!audio.ended && chapter === manifest.chapters.at(-1) });
  }
  function applySeek() {
    if (!metadataReady || pendingSeek === null) return;
    const target = Math.min(localDuration(), Math.max(0, pendingSeek - chapter.start));
    try { internalSeekTarget = target; audio.currentTime = target; pendingSeek = null; } catch (_) {}
  }
  function selectChapter(next, target) {
    request++;
    stopLoopTimer();
    chapter = next;
    pendingSeek = target;
    internalSeekTarget = null;
    metadataReady = false;
    error = '';
    buffering = wantsPlay;
    audio.src = chapter.src;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
  }
  async function startPlayback() {
    const ownRequest = ++request;
    wantsPlay = true;
    error = '';
    buffering = !metadataReady;
    try {
      // Call synchronously from the gesture; awaiting metadata first loses mobile permission.
      const result = audio.play();
      notify();
      await result;
      if (ownRequest === request) { startLoopTimer(); notify(); }
    } catch (cause) {
      if (ownRequest !== request || cause.name === 'AbortError') return;
      wantsPlay = false;
      stopLoopTimer();
      error = cause.name === 'NotAllowedError' ? '请点击播放器的播放按钮，允许浏览器开始收听。' : '音频暂时无法播放，请检查网络后再试；也可以下载音频收听。';
      buffering = false;
      notify();
    }
  }
  function seekTo(time, keepLoop = false) {
    if (!Number.isFinite(time)) return;
    completed = false;
    if (!keepLoop) { loop = null; stopLoopTimer(); }
    const target = clamp(time), next = chapterAtTime(manifest.chapters, target);
    if (next !== chapter) {
      const continuePlaying = wantsPlay;
      selectChapter(next, target);
      if (continuePlaying) void startPlayback();
    } else { pendingSeek = target; applySeek(); }
    error = '';
    notify(); persist();
  }
  async function play() {
    if (chapter === manifest.chapters.at(-1) && (audio.ended || position() >= manifest.book.duration)) {
      wantsPlay = false;
      seekTo(0);
    }
    if (audio.error || error) {
      pendingSeek = position();
      metadataReady = false;
      request++;
      audio.load();
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
    }
    return startPlayback();
  }
  function validRange(range) {
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start) return false;
    return range.end <= chapterAtTime(manifest.chapters, range.start).end;
  }
  function stopLoopTimer() { if (loopTimer !== null) clearInterval(loopTimer); loopTimer = null; }
  function checkLoop() {
    if (loop && playing() && !audio.seeking && pendingSeek === null && position() >= loop.end) seekTo(loop.start, true);
  }
  function startLoopTimer() { stopLoopTimer(); if (loop && playing()) { loopTimer = setInterval(checkLoop, 40); loopTimer.unref?.(); } }
  function setLoop(range) { loop = validRange(range) && chapterAtTime(manifest.chapters, range.start) === chapter ? {...range} : null; startLoopTimer(); notify(); }
  async function playSentence(range, repeat = false) {
    if (!validRange(range)) return;
    wantsPlay = false;
    seekTo(range.start); setLoop(repeat ? range : null); return play();
  }
  function pause() { wantsPlay = false; request++; stopLoopTimer(); audio.pause(); buffering = false; notify(); persist(); }
  async function playChapter(id) {
    const next = manifest.chapters.find(c => c.id === id);
    if (!next) return;
    wantsPlay = false;
    seekTo(next.start); return play();
  }
  function seekBy(seconds) { seekTo(position() + seconds); }
  function setRate(value) { if (!validRate(value)) return; rate = value; audio.defaultPlaybackRate = rate; audio.playbackRate = rate; notify(); persist(); }
  function adjacent(direction) {
    const next = manifest.chapters[manifest.chapters.indexOf(chapter) + direction];
    if (next) return playChapter(next.id);
  }
  audio.addEventListener('loadedmetadata', () => {
    metadataReady = true;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    applySeek(); notify();
  });
  audio.addEventListener('timeupdate', () => { checkLoop(); notify(); if (Date.now() - lastSave >= 5000) persist(); });
  audio.addEventListener('play', () => {
    if (audio.paused) return;
    // Native controls reset currentTime before play, so ended alone cannot identify a book replay.
    if (completed) {
      wantsPlay = false;
      seekTo(0);
      void startPlayback();
      return;
    }
    wantsPlay = true; error = ''; startLoopTimer(); notify();
  });
  audio.addEventListener('playing', () => { if (audio.paused) return; buffering = false; error = ''; startLoopTimer(); notify(); });
  audio.addEventListener('pause', () => {
    // Queued pause events from a replaced source must not cancel the new play request.
    if (!audio.paused) return;
    stopLoopTimer();
    if (!audio.ended) { wantsPlay = false; request++; }
    buffering = false; notify(); persist();
  });
  audio.addEventListener('waiting', () => { buffering = wantsPlay; notify(); });
  audio.addEventListener('seeking', () => {
    const internal = internalSeekTarget !== null && Math.abs(audio.currentTime - internalSeekTarget) < .1;
    if (!internal && audio.paused) completed = false;
    if (loop && !internal) setLoop(null);
  });
  audio.addEventListener('seeked', () => { internalSeekTarget = null; buffering = false; notify(); persist(); });
  audio.addEventListener('ratechange', () => {
    if (metadataReady && validRate(audio.playbackRate)) { rate = audio.playbackRate; audio.defaultPlaybackRate = rate; notify(); persist(); }
  });
  audio.addEventListener('durationchange', notify);
  audio.addEventListener('ended', () => {
    stopLoopTimer(); buffering = false;
    if (wantsPlay && loop) { seekTo(loop.start, true); void startPlayback(); }
    else if (wantsPlay && chapter !== manifest.chapters.at(-1)) { void adjacent(1); }
    else { completed = chapter === manifest.chapters.at(-1); wantsPlay = false; notify(); persist(); }
  });
  audio.addEventListener('error', () => {
    pendingSeek = position();
    request++; wantsPlay = false; stopLoopTimer();
    error = '音频加载失败。请检查网络后点击“重试播放”，或使用下方下载链接。'; buffering = false; notify();
  });
  if (mediaSession?.setActionHandler) {
    const actions = { play, pause, seekbackward: detail => seekBy(-(detail?.seekOffset || 15)), seekforward: detail => seekBy(detail?.seekOffset || 15), seekto: detail => { if (Number.isFinite(detail?.seekTime)) seekTo(chapter.start + Math.min(localDuration(), Math.max(0, detail.seekTime))); }, previoustrack: () => adjacent(-1), nexttrack: () => adjacent(1), stop: pause };
    for (const [name, handler] of Object.entries(actions)) { try { mediaSession.setActionHandler(name, handler); } catch (_) {} }
  }
  selectChapter(chapter, resume.time);
  notify();
  return { play, pause, playChapter, playSentence, setLoop, seekTo, seekBy, setRate, persist, previous: () => adjacent(-1), next: () => adjacent(1) };
}
