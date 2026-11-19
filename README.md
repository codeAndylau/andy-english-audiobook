# A Place at the Table

Public reader: https://codeandylau.github.io/andy-english-audiobook/

The November 18, 2026 story revision includes 24 chapters, 21,162 English story words, 120 useful expressions, 72 role-play turns and 2,761 sentence translations. Andy starts with everyday conversations, then moves through job hunting and international teamwork. The early chapters retain an A2 editorial target; the book does not certify a CEFR level or an IELTS score.

AI narration uses en-US-AndrewNeural. Visitors do not need to sign in. The reader streams chapter MP3s and preloads only the following chapter near the current chapter end. The continuous M4A is offered separately for download. Mobile background playback depends on the browser and operating system.

Click a sentence to show its Simplified Chinese meaning without starting or seeking audio. Press Play in the shadowing panel to listen to the selected sentence. Previous/next sentence only changes the selection. The compact shadowing panel supports sentence repeat, previous/next sentence and collapse to the right-side tab. Translations load on demand by chapter. Use the Chinese/English toggle above the story to read the whole chapter in either language. The choice carries across chapters within the page; narration remains in English.

The active edition is stored under `editions/r2/`. Text, audio, sentence timestamps, translations and downloads switch together. Versioned runtime module URLs prevent cached translation/player code from mixing editions. Reading and listening progress use separate keys from the original release.

Validation: `node --test tests/*.test.mjs`. The edition data test checks exact text fingerprints, sentence character ranges, timing ranges, chapter media sizes and the continuous audio hash. Generation-side validation additionally checks word-boundary coverage and fully decodes each chapter and the continuous audio.
