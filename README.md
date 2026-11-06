# semantic-slugger

Short, readable, unique IDs from titles. German + English. Zero dependencies.

`Rahmenvertrag Stromlieferung Standorte Nord 2026` -> `strom-rv-nord-26`

Status: under construction (pre-0.1). The build order and the full design are in [SPEC.md](./SPEC.md).

## Develop

```sh
pnpm install
pnpm build && pnpm test && pnpm lint && pnpm typecheck
```

Node 22.18+ and pnpm 12.8.1. Only synthetic titles in code, tests, docs and issues. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. Third-party material: see [NOTICE](./NOTICE).
