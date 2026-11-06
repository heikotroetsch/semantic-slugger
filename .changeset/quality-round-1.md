---
'semantic-slugger': minor
---

Quality round 1: more readable IDs. ID output changed.

- A fill segment from an unused title word takes the place of a padding tail (`board-meet-minut`, `release-v23-note`).
- Long words get long prefix cuts (`spesenab-hamburg`, `versionshinw-v51`) instead of 3-letter cuts and consonant skeletons.
- Common verbs and evaluative adjectives (`spot`, `best`, `legt`, `schnelle`) no longer take the place of the topic.
- Cuts that read as another word (`for`, `ein`, `bus`) are not used.
- Weak nouns fill short IDs when the title has only one main word.

See docs/DEVIATIONS.md rows 151 to 161.
