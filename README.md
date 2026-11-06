# semantic-slugger

Short, readable, unique IDs from any title. German + English built in. Zero dependencies.

`Jahresbericht Vertrieb Nord 2026` -> `vertrieb-nord-26`

```ts
import { slug, suggest } from 'semantic-slugger'

slug('Chocolate Cake Recipe') // 'choc-cake-recipe'
suggest('Sommerfest 2026', { taken: new Set(['sommerfest-26-jf']) }) // a result with a new tail
```

Status: under construction (pre-0.1). The build order and the full design are in [SPEC.md](./SPEC.md).

## Develop

```sh
pnpm install
pnpm build && pnpm test && pnpm lint && pnpm typecheck
```

Node 22.18+ and pnpm 12.8.1. Only synthetic titles and invented names in code, tests, docs and issues. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. Third-party material: see [NOTICE](./NOTICE).
