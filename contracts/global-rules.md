# SLF Global Rules

These rules are the source of truth for SLF branch/module work. Do not rely on ChatGPT memory as the source of truth.

## Branches

The active workflow branches are:

1. `strategy-data-recommendations`
2. `transfer-analyzer`
3. `team-management`
4. `core-release`

No separate `youth-scouting` branch is used. Youth work belongs to `team-management`.

## Global principles

- One workflow branch owns one product area.
- Module branches work independently and do not synchronize full context with each other.
- Module branches do not publish the final userscript.
- `core-release` is the only branch that publishes the final bundled userscript.
- On the SLF site, users get one unified Tampermonkey userscript.
- In development, each module branch keeps its own context, requirements, and release output.

## Contract authority

- Files under `contracts/**` are the source of truth.
- ChatGPT memory is only a convenience cache.
- If memory is empty or contradictory, read these contract files first.
- Branch rules must not be changed during ordinary module work.
- Contract changes require an explicit user command such as: `измени контракт веток`.

## Module branch release rule

Each module branch must produce a release manifest under:

```text
module-releases/<branch>/<release-id>.json
```

A module release manifest must describe:

- branch name;
- module release ID;
- base script version;
- changed scope;
- changes;
- migration/cache notes;
- acceptance checks;
- whether core changes are required.

## Core release rule

`core-release` may integrate only an explicitly requested module release manifest.

It must not:

- invent module business logic;
- reinterpret module requirements;
- merge unrequested branch work;
- change branch contracts during normal release;
- publish without incrementing `@version`.

## GitHub/Tampermonkey release channel

GitHub repo `MostDef2000/SLF` is the release source.

Tampermonkey updates through:

```text
@updateURL   https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.meta.js
@downloadURL https://raw.githubusercontent.com/MostDef2000/SLF/main/releases/latest.user.js
```

Every final release must update:

- `releases/latest.user.js`
- `releases/latest.meta.js`
- `releases/SLF_<version>.user.js`
- `CHANGELOG.md`
- optionally `data/version.json`

`@name` and `@namespace` must stay stable unless the user explicitly requests a migration.
