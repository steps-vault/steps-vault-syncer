# Contributing

Thank you for helping. Before a big change, open an issue so we can agree on the approach first.

## Checks

Every pull request must pass `pnpm typecheck`, `pnpm lint` and `pnpm test`. CI runs them
on Linux and Windows.

## New packages

Every dependency runs on players' computers, so add one only when it saves real work. In the pull request, say who
publishes it, how old it is and how widely it is used. pnpm refuses versions younger than 7 days.

## Code style

- Names are long and fully spelled out, and name the idea, not the implementation. Booleans start with `is`, `has`,
  `should` or `was`. Collections are plural, and maps end in `ByKey` (for example `songsById`).
- Verbs: `fetch*` reads the network, `get*` computes or reads without side effects, `load*` reads a payload into
  objects, `build*` constructs a value, `create*` is a factory, `handle*` handles an event.
- Functions with two or more parameters take one object (`{ song, layout }`). Use guard clauses and early returns.
  Keep functions short, and extract and name steps instead of writing step comments.
- Anything outside the core (files, audio, network, time) is an interface (a "port") that is passed in, never
  imported.
- Comments say *why* (a non-obvious edge case), never *what*. Error messages are full sentences that tell the
  player what to do.

## Rules that never change

Read the "Rules that never bend" in [docs/plan.md](docs/plan.md): never touch the player's own folders, never send
music unasked, addons see song facts only, and every song has one clear status.
