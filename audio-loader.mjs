// A complete local Blob remains seekable even when the static host ignores Range.
export async function loadAudioBlob(book, onProgress, fetcher = fetch) {
  const response = await fetcher(`${book.src}?v=${encodeURIComponent(book.sha256)}`, {cache:'force-cache'});
  if (!response.ok) throw new Error('有声书载入失败，请检查网络后重试。');
  const chunks = [];
  let received = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value); received += value.byteLength; onProgress(received);
    }
  } else {
    const data = await response.arrayBuffer(); chunks.push(data); received = data.byteLength; onProgress(received);
  }
  if (received !== book.bytes) throw new Error('音频下载不完整，请检查网络后重试。');
  return new Blob(chunks, {type:'audio/mp4'});
}
