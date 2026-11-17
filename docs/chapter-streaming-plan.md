# Chapter streaming update

Goal: On the GitHub Pages mirror, stream only the selected/resumed chapter MP3; preserve global sentence timestamps, repeat, speed, resume and automatic next chapter. Original Sites deployment remains unchanged.

Architecture: One persistent native HTML audio player, chapter-local currentTime mapped to manifest global time. Use HTTP range streaming (verified GitHub Pages206) for current chapter. One separate, silent audio element may preload next chapter only when playing within final30 seconds; no full-book fetch. Retain full-book direct download for offline/long lock-screen listening. Native scrubber and MediaSession positions represent current chapter; visible UI still exposes whole-book progress.

Task1: Rewrite audio-player.mjs for chapter sources with tests for default/resume sources, timeline conversion, seamless user-intent continuity, no autoplay restore, final ending, repeat, native seek, rapid switching, pause while loading, failure/retry. Preserve public methods and state interface; parent supplies optional preloadAudio.
Task2: Remove full-book blob load from app.js initialization; instantiate player immediately after manifest. Update UI/guide to describe chapter loading, current chapter size, local native seek bar and background limits. Keep full-book download.
Task3: Node checks, browser actual MP3 time alignment/highlights/repeat/previous-next/automatic ended transition/paused restore and mobile layout; review and publish GitHub Pages, verify built commit and public HTTP/browser result.

Constraints: No audio regeneration or text changes. Keep same https://codeandylau.github.io/andy-english-audiobook/ URL, no login, no dependencies. Preserve apatt-audiobook-v1 global time/fingerprint records. Do not claim gapless playback or physical phone lockscreen validation. Use timing tests, no real network in unit tests.
