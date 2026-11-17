# Chapter player implementation

- Changed `audio-player.mjs` to use the selected chapter MP3 directly. Public player methods and absolute book-time state/storage remain compatible; native audio time and MediaSession position/duration are chapter-local.
- Preserved synchronous gesture-triggered `play()`, paused resume, pending seeks, speed, automatic next chapter, final stop/restart, sentence repeat, native seek cancellation, and retry. Stale play rejections and queued pause events cannot overwrite a newer request.
- Optional `preloadAudio` stays silent and loads at most the next chapter while actively playing within 30 seconds of the current chapter end. Pause, error, repeat, leaving the window, and chapter changes release the preload source. No full-book fetch or Blob playback.
- TDD: first run had 12 expected failures out of 15 tests against the old implementation. Final `node --test tests/chapter-player.test.mjs`: 20 passed, 0 failed. Also passed `node --check audio-player.mjs` and `git diff --check`.
- Covered actual native local/global semantics, persisted resume/fingerprint, MediaSession, chapter navigation, repeated ranges, paused loading, rapid requests, retry, native rate, native pause-before-ended order, and deterministic interval cleanup.
- Browser/mobile playback and network verification are delegated to the parent task; these unit tests use a fake media boundary and no network. No asset/UI changes, build, commit, or push performed here.

## Review follow-up: native replay

- Added a completion flag for actual final-chapter ending. Native audio `play` after completion now selects chapter one even though the browser already reset its local time and `ended` state.
- Deliberate API seeks and paused native scrubbing clear completion; the browser's automatic seek during native replay preserves it.
- Regression demonstrated first: native replay stayed on chapter three (21/22 passed). Final verification: 24/24 tests passed, syntax and diff checks passed.
