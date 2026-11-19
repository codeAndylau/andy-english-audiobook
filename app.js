import { attachDockDrag } from './dock-drag.mjs?v=20261119-drag';
import { createAudiobookPlayer } from './audio-player.mjs?v=20261118-r2';
import { createTranslations } from './translations.mjs?v=20261119-language';
const $ = id => document.getElementById(id);
const editionRoot = 'editions/r2/';
const translations = createTranslations({basePath: `${editionRoot}translations`, onUpdate: state => {
  $('translationPanel').hidden = !state.visible;
  $('translationToggle').textContent = state.visible ? '收起中文' : '查看中文';
  $('translationToggle').setAttribute('aria-expanded', String(state.visible));
  $('sentenceChinese').textContent = state.text || '';
  $('translationRetry').hidden = !state.error;
}});
const parts = ['Small Conversations', 'A Different Answer', 'In the Room', 'A Place at the Table'];
let book = [], chapter = null, tab = 'story', audioPlayer = null, audioManifest = null, audioLoading = false;
let sentenceData = null, sentenceList = [], lastAudioState = null, selectedSentence = null, highlightedId = null;
let sentencePinned = false;
let storyLanguage = 'en', languageRequest = 0;
const progressKey = 'apatt-progress-r2';
let saved = { last: 1, completed: [], font: 19 };
try { const value = JSON.parse(localStorage.getItem(progressKey)); if (value && typeof value === 'object') saved = { ...saved, ...value }; } catch (_) {}
saved.completed = Array.isArray(saved.completed) ? saved.completed.filter(n => Number.isInteger(n) && n >= 1 && n <= 24) : [];
saved.font = Number.isFinite(saved.font) ? Math.min(25, Math.max(16, saved.font)) : 19;
function persist() { try { localStorage.setItem(progressKey, JSON.stringify(saved)); } catch (_) {} }
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function progress() {
  const count = new Set(saved.completed).size;
  $('progressText').textContent = `已完成 ${count} / 24 章`;
  $('progressPercent').textContent = `${Math.round(count / 24 * 100)}%`;
  $('progressBar').style.width = `${count / 24 * 100}%`;
  document.querySelectorAll('.chapter-link').forEach(a => {
    const id = Number(a.dataset.id);
    if (chapter && id === chapter.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    a.querySelector('.tick').textContent = saved.completed.includes(id) ? '✓' : '';
  });
  if (chapter) {
    const done = saved.completed.includes(chapter.id);
    $('complete').textContent = done ? '✓ 本章已完成 · 点击取消' : '标记本章已完成';
    $('complete').classList.toggle('is-done', done);
    $('complete').setAttribute('aria-pressed', String(done));
  }
}
function fillContents() {
  $('contents').replaceChildren();
  parts.forEach((name, index) => {
    $('contents').append(el('p', `PART ${['I','II','III','IV'][index]} · ${name}`, 'part-name'));
    book.filter(c => c.part === index + 1).forEach(c => {
      const a = el('a', undefined, 'chapter-link'); a.href = `#chapter-${c.id}`; a.dataset.id = String(c.id);
      a.append(el('span', String(c.id).padStart(2, '0'), 'num'), el('span', c.title), el('span', '', 'tick'));
      a.addEventListener('click', () => menu(false)); $('contents').append(a);
    });
  });
}
function practiceBlock(n, title) { const block = el('section', undefined, 'practice-block'); const heading = el('h3'); heading.append(el('span', String(n).padStart(2, '0'), 'step'), document.createTextNode(title)); block.append(heading); $('practice').append(block); return block; }
function fillPractice(c) {
  const p = c.practice; $('practice').replaceChildren(el('p', '先说出自己的答案，再查看参考。第一轮允许停顿；第二轮只改一两个重点。', 'practice-intro'));
  const phrases = practiceBlock(1, '把这些表达说出口');
  p.phrases.forEach(item => { const card = el('div', undefined, 'phrase-card'); const en = el('strong', item.en); en.lang = 'en'; card.append(en, el('span', item.zh)); phrases.append(card); });
  const language = practiceBlock(2, '一个语言重点'); language.append(el('p', p.grammar), el('p', p.pronunciation, 'practice-note'));
  const questions = practiceBlock(3, '理解之后，开口回答');
  p.questions.forEach((item, i) => { const q = el('div', undefined, 'question'); const line = el('p', `${i + 1}. ${item.q}`); line.lang = 'en'; const answer = el('details'); answer.append(el('summary', '查看参考答案')); const a = el('p', item.a); a.lang = 'en'; answer.append(a); q.append(line, answer); questions.append(q); });
  const role = practiceBlock(4, '轮到你说'); role.append(el('p', p.roleplay.context));
  p.roleplay.turns.forEach(item => { const turn = el('div', undefined, 'role-turn'); const line = el('blockquote', item.line); line.lang = 'en'; turn.append(line, el('p', `你的任务：${item.cue}`)); role.append(turn); });
  practiceBlock(5, '换个场景，继续用').append(el('p', p.transfer));
  practiceBlock(6, '合上原文，再讲一次').append(el('p', p.retell));
}
function setTab(which) {
  tab = which; $('story').hidden = which !== 'story'; $('practice').hidden = which !== 'practice';
  for (const name of ['story', 'practice']) { const button = $(`${name}Tab`); const active = name === which; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); }
}
function openChapter(id, scroll = false, following = false) {
  if (!following) { translations.hide(); sentencePinned = false; }
  if (!following && chapter) { $('followAudio').checked = false; audioPlayer?.setLoop(null); }
  const next = book.find(c => c.id === id) || book[0]; chapter = next;
  if (following) history.replaceState(null, '', `#chapter-${next.id}`); saved.last = next.id; persist();
  $('partLabel').textContent = `PART ${['I','II','III','IV'][next.part - 1]} · ${parts[next.part - 1]}`;
  $('chapterNumber').textContent = `CHAPTER ${String(next.id).padStart(2, '0')}`;
  $('level').textContent = next.level; $('chapterTitle').textContent = next.title; $('focus').textContent = next.focus;
  renderStory(next);
  fillPractice(next); setTab('story');
  $('prev').disabled = next.id === 1; $('next').disabled = next.id === 24;
  $('prevTitle').textContent = next.id > 1 ? book[next.id - 2].title : '故事从这里开始';
  $('nextTitle').textContent = next.id < 24 ? book[next.id].title : 'The End';
  document.title = `${next.id}. ${next.title} · A Place at the Table`;
  progress(); updateChapterAudio();
  if (scroll) { $('chapterTitle').focus({ preventScroll: true }); $('reader').scrollIntoView({ behavior: 'auto', block: 'start' }); }
}
const mobile = matchMedia('(max-width:760px)');
let sidebarCollapsed = false;
try { sidebarCollapsed = localStorage.getItem('apatt-sidebar-collapsed') === 'true'; } catch (_) {}
function menu(open) {
  open = open && mobile.matches;
  if (!open && document.activeElement?.closest('#sidebar') && mobile.matches) $('menu').focus();
  document.body.classList.toggle('menu-open', open); $('menu').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  $('sidebarExpand').hidden = !sidebarCollapsed;
  const hidden = mobile.matches ? !open : sidebarCollapsed;
  if (hidden && document.activeElement?.closest('#sidebar')) {
    (mobile.matches ? $('menu') : $('sidebarExpand')).focus();
  }
  $('sidebar').inert = hidden;
  $('sidebarCollapse').setAttribute('aria-expanded', String(!hidden));
  if (hidden) $('sidebar').setAttribute('aria-hidden', 'true'); else $('sidebar').removeAttribute('aria-hidden');
}
mobile.addEventListener('change', () => menu(false));
function setSidebarCollapsed(collapsed) {
  sidebarCollapsed = collapsed;
  try { localStorage.setItem('apatt-sidebar-collapsed', String(collapsed)); } catch (_) {}
  menu(false);
  (collapsed ? $('sidebarExpand') : $('sidebarCollapse')).focus();
}
$('sidebarCollapse').addEventListener('click', () => setSidebarCollapsed(true));
$('sidebarExpand').addEventListener('click', () => setSidebarCollapsed(false));
function font(delta) { saved.font = Math.min(25, Math.max(16, saved.font + delta)); document.documentElement.style.setProperty('--story-size', `${saved.font}px`); $('fontDown').disabled = saved.font <= 16; $('fontUp').disabled = saved.font >= 25; persist(); }
function timeLabel(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function updateChapterAudio() {
  const track = audioManifest?.chapters.find(c => c.id === chapter?.id);
  $('listenChapter').disabled = !track || !audioPlayer;
  $('downloadChapter').hidden = !track;
  if (track) { $('downloadChapter').href = track.src; $('downloadChapter').download = `chapter-${String(track.id).padStart(2, '0')}.mp3`; }
}
function chapterSentences(id) { return sentenceData?.chapters.find(c => c.id === id)?.sentences || []; }
function renderStory(c) {
  $('story').lang = 'en';
  $('story').dataset.mode = 'en';
  $('story').setAttribute('aria-label', '英文故事');
  $('storyTab').textContent = '英文正文';
  const sentences = chapterSentences(c.id); let cursor = 0;
  const paragraphs = c.story.split(/\n\s*\n/).filter(Boolean).map(text => {
    const start = c.story.indexOf(text, cursor), end = start + text.length; cursor = end;
    const p = el('p'); let offset = start;
    for (const sentence of sentences.filter(s => s.charStart >= start && s.charEnd <= end)) {
      p.append(document.createTextNode(c.story.slice(offset, sentence.charStart)));
      const span = el('span', c.story.slice(sentence.charStart, sentence.charEnd), 'sentence');
      span.dataset.sentenceId = sentence.id; span.tabIndex = 0; span.setAttribute('role', 'button');
      span.setAttribute('aria-label', `查看中文：${sentence.text}`);
      span.addEventListener('click', () => chooseSentence(sentence));
      span.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseSentence(sentence); } });
      p.append(span); offset = sentence.charEnd;
    }
    p.append(document.createTextNode(c.story.slice(offset, end))); return p;
  });
  $('story').replaceChildren(...paragraphs); highlightedId = null;
  if (lastAudioState) updateSentences(lastAudioState);
  updateStoryLanguage(c);
}
async function updateStoryLanguage(c) {
  const request = ++languageRequest;
  const bilingual = storyLanguage === 'bilingual';
  $('storyLanguage').value = storyLanguage;
  $('storyLanguageStatus').textContent = '';
  $('story').removeAttribute('aria-busy');
  if (storyLanguage === 'en') return;
  $('storyLanguageStatus').textContent = '正在加载中文……';
  $('story').setAttribute('aria-busy', 'true');
  try {
    const text = await translations.loadChapter(c.id);
    if (request !== languageRequest) return;
    const nodes = [...$('story').querySelectorAll('.sentence')];
    if (!nodes.length || nodes.some(node => typeof text[node.dataset.sentenceId] !== 'string' || !text[node.dataset.sentenceId].trim())) throw new Error('incomplete');
    nodes.forEach(node => {
      const chinese = text[node.dataset.sentenceId];
      if (bilingual) {
        const englishLine = el('span', node.textContent, 'sentence-en');
        englishLine.lang = 'en';
        const chineseLine = el('span', chinese, 'sentence-zh');
        chineseLine.lang = 'zh-CN';
        node.replaceChildren(englishLine, chineseLine);
      } else node.textContent = chinese;
      node.setAttribute('aria-label', `查看原句与中文：${node.textContent}`);
    });
    $('story').lang = bilingual ? 'en' : 'zh-CN';
    $('story').dataset.mode = storyLanguage;
    $('story').setAttribute('aria-label', bilingual ? '中英对照故事' : '中文故事');
    $('storyTab').textContent = bilingual ? '中英对照' : '中文正文';
    $('storyLanguageStatus').textContent = '';
  } catch (_) {
    if (request !== languageRequest) return;
    storyLanguage = 'en';
    $('storyLanguage').value = 'en';
    $('storyLanguageStatus').textContent = '中文暂时无法加载，已保留英文。请重新选择中文或中英对照重试。';
  } finally {
    if (request === languageRequest) $('story').removeAttribute('aria-busy');
  }
}
function chooseSentence(sentence) {
  setShadowingCollapsed(false);
  selectedSentence = sentence;
  sentencePinned = true;
  translations.show(sentence);
  updateSentences(lastAudioState || {time: -1, playing: false});
}
function controlSentence() {
  if (selectedSentence && selectedSentence.chapterId === chapter?.id) return selectedSentence;
  return chapterSentences(chapter?.id)[0];
}
function moveSentence(direction) {
  const selected = controlSentence(); if (!selected) return;
  const list = chapterSentences(chapter.id), index = list.findIndex(s => s.id === selected.id);
  if (list[index + direction]) chooseSentence(list[index + direction]);
}
function updateSentences(state) {
  lastAudioState = state;
  if (!sentenceData) return;
  const current = sentenceList.find(s => state.time >= s.start && state.time < s.end);
  if (current && !sentencePinned) selectedSentence = current;
  if (!sentencePinned && $('followAudio').checked && current && chapter?.id !== current.chapterId) openChapter(current.chapterId, false, true);
  const activeId = current?.id || null;
  if (highlightedId !== activeId) {
    document.querySelectorAll('.sentence-active').forEach(node => { node.classList.remove('sentence-active'); node.removeAttribute('aria-current'); });
    const node = [...document.querySelectorAll('.sentence')].find(n => n.dataset.sentenceId === activeId);
    if (node) {
      node.classList.add('sentence-active'); node.setAttribute('aria-current', 'true');
      if (!sentencePinned && $('followAudio').checked && tab === 'story') { const rect = node.getBoundingClientRect(), panel = document.querySelector('.shadowing').getBoundingClientRect(); if (rect.top < Math.max(100, panel.bottom + 16) || rect.bottom > innerHeight - 60) node.scrollIntoView({block:'center',behavior:'smooth'}); }
    }
    highlightedId = activeId;
  }
  const selected = controlSentence(), list = chapterSentences(chapter?.id), index = list.findIndex(s => s.id === selected?.id);
  $('sentenceText').textContent = selected?.text || '选择正文中的句子开始跟读。';
  translations.select(selected);
  $('translationToggle').disabled = !selected;
  $('sentencePrevious').disabled = !audioPlayer || index <= 0;
  $('sentenceNext').disabled = !audioPlayer || index < 0 || index === list.length - 1;
  $('sentencePlay').disabled = !audioPlayer || !selected;
  $('sentenceRepeat').disabled = !audioPlayer || !selected;
  $('sentencePlay').textContent = state.playing && !sentencePinned ? '暂停' : '播放';
  $('sentenceRepeat').setAttribute('aria-pressed', String(!!state.loop));
  $('sentenceRepeat').textContent = state.loop ? '单句循环：开' : '单句循环：关';
  $('sentenceHint').textContent = state.loop ? '循环已开启。点击句子只查看中文；点击播放才切换到选中的句子。' : '点击正文只查看中文；点击播放收听选中的句子，开启单句循环反复跟读。';
}
async function initSentences(manifest) {
  try {
    const response = await fetch(`${editionRoot}audio/sentences.json`, {cache:'no-cache'});
    if (!response.ok) throw new Error('missing');
    const data = await response.json();
    if (data.bookSha256 !== manifest.book.sha256 || data.chapters?.length !== 24) throw new Error('mismatch');
    $('storyLanguage').disabled = false;
    sentenceData = data; sentenceList = data.chapters.flatMap(c => c.sentences.map(s => Object.assign(s, {chapterId:c.id})));
    if (chapter) renderStory(chapter);
    $('sentenceHint').textContent = '点击正文句子查看中文，点击播放后收听。';
    if (lastAudioState) updateSentences(lastAudioState);
  } catch (_) { $('sentenceHint').textContent = '逐句时间轴暂时不可用，完整音频仍可收听。请刷新重试。'; }
}
async function initAudio() {
  if (audioLoading || audioPlayer) return;
  audioLoading = true;
  $('audioRetry').hidden = true;
  try {
    const response = await fetch(`${editionRoot}audio/manifest.json`, {cache:'no-cache'});
    if (!response.ok) throw new Error('音频目录暂时无法载入，请刷新重试。');
    const manifest = await response.json();
    if (!manifest.book?.src || manifest.chapters?.length !== 24 || !Number.isFinite(manifest.book.duration)) throw new Error('音频目录不完整，请稍后重试。');
    audioManifest = manifest;
    initSentences(manifest);
    let storage; try { storage = window.localStorage; } catch (_) {}
    audioPlayer = createAudiobookPlayer($('bookAudio'), manifest, {
      preloadAudio: new Audio(),
      storage,
      storageKey: 'apatt-audiobook-r2',
      mediaSession: navigator.mediaSession,
      metadataFactory: window.MediaMetadata ? data => new MediaMetadata(data) : undefined,
      onUpdate: state => {
        $('nowChapter').textContent = `Chapter ${state.chapter.id} · ${state.chapter.title}`;
        $('audioLength').textContent = `当前章 ${(state.chapter.bytes / 1048576).toFixed(1)} MB · 全书 ${Math.round(manifest.book.duration / 60)} 分钟`;
        const current = Math.max(0, state.time - state.chapter.start);
        $('audioPosition').textContent = `本章 ${timeLabel(current)} / ${timeLabel(state.chapter.duration)} · 全书 ${timeLabel(state.time)} / ${timeLabel(state.duration)}`;
        const status = state.error || (state.ended ? '全书已播完。再次点击播放将从第一章开始。' : state.buffering ? '正在缓冲当前章节……' : state.playing ? (state.loop ? '正在循环当前句' : state.chapter === manifest.chapters.at(-1) ? '正在播放最后一章' : '正在播放 · 本章结束后自动续播下一章') : state.time > 0 ? '已记住当前位置 · 点击播放继续收听' : '点击播放器中的播放按钮，开始连续收听。');
        if ($('audioStatus').textContent !== status) $('audioStatus').textContent = status;
        $('audioRetry').hidden = !state.error;
        const rateValue = String(state.rate);
        if (![...$('audioRate').options].some(option => option.value === rateValue)) $('audioRate').add(new Option(`${state.rate}×`, rateValue));
        $('audioRate').value = rateValue;
        $('audioPrevious').disabled = state.chapter.id === 1;
        $('audioNext').disabled = state.chapter.id === 24;
        updateSentences(state);
      }
    });
    $('downloadBook').href = manifest.book.src;
    for (const id of ['rewind', 'forward', 'audioRate']) $(id).disabled = false;
    updateChapterAudio();
    if (lastAudioState) updateSentences(lastAudioState);
  } catch (error) { $('audioStatus').textContent = `${error.message} 正文和练习仍可阅读，也可使用下载链接。`; $('audioRetry').hidden = false; }
  finally { audioLoading = false; }
}
$('menu').addEventListener('click', () => menu(!document.body.classList.contains('menu-open')));
document.addEventListener('keydown', e => { if (e.key === 'Escape') menu(false); });
$('storyLanguage').addEventListener('change', () => { if (!chapter) return; storyLanguage = $('storyLanguage').value; setTab('story'); renderStory(chapter); });
$('storyTab').addEventListener('click', () => setTab('story'));
$('practiceTab').addEventListener('click', () => { $('followAudio').checked = false; setTab('practice'); });
$('fontDown').addEventListener('click', () => font(-1)); $('fontUp').addEventListener('click', () => font(1));
$('prev').addEventListener('click', () => { if (chapter?.id > 1) location.hash = `chapter-${chapter.id - 1}`; });
$('next').addEventListener('click', () => { if (chapter?.id < 24) location.hash = `chapter-${chapter.id + 1}`; });
$('complete').addEventListener('click', () => { if (!chapter) return; saved.completed = saved.completed.includes(chapter.id) ? saved.completed.filter(id => id !== chapter.id) : [...saved.completed, chapter.id]; persist(); progress(); });
$('listenChapter').addEventListener('click', () => { if (chapter) audioPlayer?.playChapter(chapter.id); });
$('audioRetry').addEventListener('click', () => audioPlayer ? audioPlayer.play() : initAudio());
$('rewind').addEventListener('click', () => audioPlayer?.seekBy(-15));
$('forward').addEventListener('click', () => audioPlayer?.seekBy(15));
$('audioPrevious').addEventListener('click', () => audioPlayer?.previous());
$('audioNext').addEventListener('click', () => audioPlayer?.next());
$('sentencePrevious').addEventListener('click', () => moveSentence(-1));
$('sentenceNext').addEventListener('click', () => moveSentence(1));
$('sentencePlay').addEventListener('click', () => { if (lastAudioState?.playing && !sentencePinned) audioPlayer.pause(); else if (controlSentence()) { const sentence = controlSentence(); sentencePinned = false; audioPlayer.playSentence(sentence, !!lastAudioState?.loop); } });
$('sentenceRepeat').addEventListener('click', () => { if (lastAudioState?.loop) audioPlayer.setLoop(null); else if (controlSentence()) { selectedSentence = controlSentence(); sentencePinned = false; audioPlayer.playSentence(selectedSentence, true); } });
$('followAudio').addEventListener('change', () => { if ($('followAudio').checked) { sentencePinned = false; setTab('story'); if(lastAudioState) { highlightedId = null; updateSentences(lastAudioState); } } });
$('audioRate').addEventListener('change', () => audioPlayer?.setRate(Number($('audioRate').value)));
window.addEventListener('hashchange', () => { const match = location.hash.match(/^#chapter-(\d+)$/); if (book.length && match) openChapter(Number(match[1]), true); });
window.addEventListener('pagehide', () => audioPlayer?.persist());
document.addEventListener('visibilitychange', () => { if (document.hidden) audioPlayer?.persist(); });
font(0); menu(false); initAudio();
fetch(`${editionRoot}book.json`).then(response => { if (!response.ok) throw new Error('无法载入书稿'); return response.json(); }).then(data => {
  if (!Array.isArray(data) || data.length !== 24) throw new Error('书稿内容不完整');
  book = data; fillContents(); const words = data.reduce((total, c) => total + c.story.split(/\s+/).filter(Boolean).length, 0);
  $('wordCount').textContent = `${words.toLocaleString('en-US')} 英文词`;
  $('loading').hidden = true; $('reader').hidden = false; refreshDockPosition();
  const id = Number(location.hash.match(/^#chapter-(\d+)$/)?.[1]) || saved.last || 1; openChapter(id);
}).catch(error => { $('loading').textContent = `${error.message}。请刷新页面重试。`; });

$('translationToggle').addEventListener('click', () => { if ($('translationPanel').hidden) translations.show(controlSentence()); else translations.hide(); });
$('translationRetry').addEventListener('click', () => translations.retry());

const refreshDockPosition = attachDockDrag($('shadowingDock'));
function setShadowingCollapsed(collapsed, focus = false) {
  $('shadowingPanel').hidden = collapsed;
  $('shadowingDock').hidden = !collapsed;
  if (collapsed) refreshDockPosition();
  saved.shadowingCollapsed = collapsed;
  persist();
  if (focus) {
    $(collapsed ? 'shadowingDock' : 'shadowingCollapse').focus({preventScroll:true});
    if (!collapsed) {
      const rect = $('shadowingPanel').getBoundingClientRect();
      if (rect.top >= innerHeight || rect.bottom <= 0) $('shadowingPanel').scrollIntoView({block:'start',behavior:'auto'});
    }
  }
}
$('shadowingCollapse').addEventListener('click', () => setShadowingCollapsed(true, true));
$('shadowingDock').addEventListener('click', () => setShadowingCollapsed(false, true));
setShadowingCollapsed(saved.shadowingCollapsed === true);
