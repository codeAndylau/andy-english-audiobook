export function createTranslations({fetcher = fetch, basePath = 'translations', onUpdate}) {
  const cache = new Map();
  let selected = null, visible = false, request = 0;
  function loadChapter(chapterId) {
    if (!cache.has(chapterId)) {
      const pending = (async () => {
        const response = await fetcher(`${basePath}/chapter-${String(chapterId).padStart(2, '0')}.json`);
        if (!response.ok) throw new Error('unavailable');
        const data = await response.json();
        if (data.chapterId !== chapterId || !data.sentences) throw new Error('mismatch');
        return data.sentences;
      })();
      cache.set(chapterId, pending);
      pending.catch(() => { if (cache.get(chapterId) === pending) cache.delete(chapterId); });
    }
    return cache.get(chapterId);
  }
  async function render() {
    const own = ++request, sentence = selected;
    if (!visible || !sentence) { onUpdate({visible:false}); return; }
    onUpdate({visible:true,id:sentence.id,text:'正在加载中文……',error:false});
    try {
      const chapterId = sentence.chapterId;
      const translations = await loadChapter(chapterId), text = translations[sentence.id];
      if (typeof text !== 'string' || !text.trim()) { cache.delete(chapterId); throw new Error('missing'); }
      if (own === request) onUpdate({visible:true,id:sentence.id,text,error:false});
    } catch (_) {
      if (own === request) onUpdate({visible:true,id:sentence.id,text:'中文暂时加载失败，请重试。',error:true});
    }
  }
  return {
    loadChapter,
    select(sentence) { if (sentence?.id === selected?.id) return; selected = sentence; return render(); },
    show(sentence) { selected = sentence; visible = true; return render(); },
    hide() { visible = false; return render(); },
    retry: render
  };
}
