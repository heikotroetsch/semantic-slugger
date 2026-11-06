# Security

Report a security issue privately with GitHub's "Report a vulnerability" button on this repository.
Do not open a public issue.

Design rules that limit risk:

- Input is capped at `maxInputLength` (4096 chars by default) before any processing.
- All regular expressions are linear (bounded repeats, no nested quantifiers) and are tested against adversarial input.
- Config is read from known keys only (own enumerable properties). Unknown keys are rejected, so prototype pollution has no effect.
- Opaque IDs and hashed stems require a `secret`. Without it, anyone with a list of likely titles could confirm a guess.
