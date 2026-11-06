---
"semantic-slugger": patch
---

v1 data and the language front (steps 1 to 6): normalization with ordered noise removal and protected number spans, transliteration, tokenizer (code runs, months, weekdays, versions, quantities, model numbers, number words, markers), built-in `de` and `en` language packs with full `languagePacks` validation, vendored CISTEM and Porter2 stemmers, language detection, phrases, stop words, attribute words, names, acronyms, deny tokens and back-off. New data exports in `semantic-slugger/data` and `V1_DATA_DIGEST`. `stopWords` now defaults to the built-in function and noise words, so config fingerprints change. `LexiconEntry.lang` is optional (default `*`).
