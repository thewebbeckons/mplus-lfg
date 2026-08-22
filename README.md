# mplus-lfg

**Guild Helper** is a Discord bot for World of Warcraft guilds. It fills Mythic+
groups with `/lfg` and tracks crafting orders with `/craft`, all inside the
Discord server your guild already uses.

> "Guild Helper" is the current user-facing name. The repository, the Cloudflare
> Worker, the D1 database, and the package scope all remain `mplus-lfg`: those
> are the identifiers of a live deployment, not branding. User-facing copy lives
> in `apps/bot/src/branding.ts` and `apps/web/app/utils/branding.ts`.

## Setup

A server admin runs `/setup` once and chooses:

- the dedicated **LFG channel**
- an optional dedicated **crafting channel** — leave it empty to keep `/craft` off
- the **server timezone**, which is how bare start times are read
- an optional **crafter role**, which restricts who may claim a crafting request

`/settings` reopens the same form later. A server that only ever configured LFG
keeps working exactly as before; crafting stays off until a channel is chosen.

The server timezone only decides what a bare `8pm` means. Discord renders the
posted time in each viewer's own zone, so it does not change how anyone sees it.

## Looking for Group — `/lfg`

1. In the LFG channel, run `/lfg` and enter the activity, start time, your role,
   group composition, and any notes.
2. The bot posts the run with buttons for Tank, Healer, and DPS.
3. Players join by choosing an open role. The bot updates the roster as people
   join, leave, or switch roles, and prevents roles from overfilling.
4. The run leader can cancel the run, and the bot closes sign-ups after the
   start time.

The composition field accepts simple descriptions such as `1/1/3`, `LF 2 DPS`,
or `LF1M tank`. This supports both fresh groups and groups that already have
some players ready.

## Crafting Requests — `/craft`

1. In the crafting channel, run `/craft` and fill in the form:
   - **Wowhead item link** (required)
   - **Quantity** (optional, defaults to 1)
   - **Character and realm** (optional)
   - **Request details** (optional) — quality/rank, embellishment, whether you
     are supplying mats, a tip, a deadline, anything else
2. The bot posts the request with **I'll craft it** and **Cancel request**.
3. A crafter claims it. They can **Release claim** if plans change, or
   **Mark complete** once the item is made.
4. On completion the requester gets a DM naming the item, the quantity, the
   crafter, the character it is for, and a jump link back to the request.

A request the bot never lets slip: claiming, releasing, completing, and
cancelling are all conditional SQL updates, so two people cannot claim the same
order and a repeated **Mark complete** cannot send a second DM.

### Supported item links

Only **Retail** Wowhead *item* pages are accepted, on exact Wowhead hosts:

```
https://www.wowhead.com/item=222441
https://www.wowhead.com/item=222441/charged-claw
https://www.wowhead.com/item=222441/charged-claw?bonus=10421:9633
https://de.wowhead.com/item=222441          # language subdomains
https://www.wowhead.com/fr/item=222441      # language path prefixes
```

The exact link you submit is stored and used for the **View on Wowhead** button,
bonus and modifier parameters included. Classic, Cataclysm, MoP Classic, PTR,
and beta links are rejected, as are spell, NPC, and quest pages, plain `http://`
links, and any host that is not Wowhead. The bot never fetches the URL you paste
— only the numeric item ID is used, and only against Blizzard's own API.

### Item names and icons

With `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` configured, the bot
resolves each item's name, quality, and icon through Blizzard's official
[WoW Game Data API](https://develop.battle.net/documentation/world-of-warcraft/game-data-apis).

Both secrets are **optional**. Without them — or if the lookup fails or times
out — `/craft` still works and falls back to the name in the Wowhead URL, or to
`WoW Item #<id>` when the link carries no slug.

## Data retention

- LFG runs and their rosters are deleted about 24 hours after the start time.
- Crafting requests expire after 14 days unfinished, and are deleted about 30
  days after they were posted.
- Server setup (channels, timezone, crafter role) is kept until it is changed.

## Contributing

The bot lives in `apps/bot` and runs locally with Cloudflare Workers and a
local D1 database. The marketing site lives in `apps/web` (Nuxt).

```
apps/bot/src/
  branding.ts    user-facing name, in one place
  constants.ts   shared: API base, command names, id namespace, timezones
  discord.ts     shared REST client (follow-ups, message edits, DMs)
  guildConfig.ts shared per-server configuration
  interactions.ts, access.ts, modalValues.ts, sql.ts, time.ts, verify.ts
  lfg/           Mythic+ grouping: db, embeds, parsing, custom ids, access
  craft/         crafting requests: db, embeds, wowhead, item metadata, flow
  handlers/      interaction dispatch shared by both features
```

Custom component IDs are namespaced: LFG owns `mplus:<action>:…` and crafting
owns `mplus:craft:<action>:…`, so the two can never be confused.

### Prerequisites

- Node.js 22 or later
- [pnpm](https://pnpm.io/)
- A Discord application for local testing

### Install and run locally

Install the workspace dependencies:

```sh
pnpm install
```

Create the local development variables file:

```sh
cp apps/bot/.dev.vars.example apps/bot/.dev.vars
```

Fill in the Discord application values in `apps/bot/.dev.vars`. The public
key and application ID come from the Discord Developer Portal. The bot token
is also required for registering the slash commands, for the expiry sweep, and
for completion DMs. `DISCORD_GUILD_ID` is optional, but setting it makes the
commands available in a test server immediately instead of waiting for global
command propagation. `BLIZZARD_CLIENT_ID` and `BLIZZARD_CLIENT_SECRET` are
optional; get them from [develop.battle.net](https://develop.battle.net/access/clients).

Initialize the local database and start the Worker:

```sh
pnpm --filter @mplus-lfg/bot db:init
pnpm dev:bot
```

For an existing deployment, apply pending D1 migrations before deploying the
updated bot:

```sh
pnpm --filter @mplus-lfg/bot db:migrate:remote
```

To test interactions from Discord, expose the local Worker through a public
URL and use that URL as the application's Interactions Endpoint URL.

Register `/lfg`, `/craft`, `/setup`, and `/settings` with Discord when needed:

```sh
pnpm register
```

Run the checks before opening a pull request:

```sh
pnpm test
pnpm typecheck
pnpm build
```
