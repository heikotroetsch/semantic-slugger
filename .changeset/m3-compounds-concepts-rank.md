---
"semantic-slugger": patch
---

Compounds, concepts and rank (steps 7 to 9): two-pass compound splitter with the parts-to-concepts rules (one concept per compound, weak heads, generic modifiers, direction, region and qualifier modifiers as own concepts, re-join of lexicon words), compound weak words before the back-off, concept merge by key and group, topic-to-marker merge, number bonds, lexicon-free stored stems (plain or hashed) with the `und` plural fold, integer ranking with priors, store blend, position bonus, tf, weight, re-pick boost and the pool with leak filters. New public `analyze(title, { lang })` on the module and on the slugger, and the types `Analysis`, `AnalysisConcept`, `AnalysisToken`, `Concept`, `RankRow`.
