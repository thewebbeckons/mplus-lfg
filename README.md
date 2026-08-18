# mplus-lfg

A serverless Discord bot and landing page for organising World of Warcraft Mythic+ groups.

This repository is structured as a **pnpm monorepo**:
- **`apps/bot`**: Serverless Discord bot running on Cloudflare Workers with D1 and HTTP Interactions.
- **`apps/web`**: Landing page built with Nuxt 4 and Nuxt UI v4.

---

## Quick Start & Commands

```sh
pnpm install          # Install all dependencies across workspace
pnpm dev              # Start Nuxt 4 landing page dev server (apps/web)
pnpm dev:bot          # Start Cloudflare Worker bot local dev server (apps/bot)
pnpm test             # Run Vitest test suite against local D1 (apps/bot)
pnpm typecheck        # Run TypeScript checks across all apps
pnpm build            # Build the Nuxt web application for production
```

---

## Bot Overview (`apps/bot`)

`/lfg` opens a modal with a role dropdown, the modal submit posts a public run
embed with five buttons, and every button press rewrites that embed in place.

```
/lfg  ──▶  modal (activity, time, your role, composition, notes)
            │
            ▼
       run embed + [🛡️ Tank] [💚 Healer] [⚔️ DPS] [🚪 Leave] [❌ Cancel]
            │
            ▼
       button press ──▶ guarded SQL mutation ──▶ UPDATE_MESSAGE with fresh roster
```

A cron trigger sweeps every 10 minutes, marks runs past their start time as
`EXPIRED`, and rewrites their messages so the buttons go dead rather than
erroring days later.

### Composition and premades

The composition field takes the whole party, or just what you are still missing:

| You type          | Means                                                             |
| ----------------- | ----------------------------------------------------------------- |
| *(blank)*         | Standard 1 tank / 1 healer / 3 dps, all open                       |
| `1/1/3`           | The same, written out — also `1-1-3`, `1t 1h 3d`, `2 tanks 2 dps`  |
| `LF 2 DPS`        | Standard party, but only 2 dps slots open — the rest is your premade |
| `LF1M tank`       | One tank slot open; a bare role word takes its count from the marker |
| `2/1/2 lf 1 dps`  | A custom total, of which only 1 dps slot is open                   |

`need`, `looking for`, `want` and a leading `+` all work in place of `LF`.

Pre-filled slots are worked out for you rather than asked for — `reserved =
total − open − your own spot` — so you never do the arithmetic. They show in the
roster as `— premade —`, count against capacity, and cannot be claimed or freed
by a button. If a run only has dps open, the Tank and Healer buttons arrive
already greyed out.

A run whose premade covers everything but the creator posts as `FULL`
immediately.

### Monorepo Structure

| Path                                    | What it does                                                 |
| --------------------------------------- | ------------------------------------------------------------ |
| `apps/bot/src/index.ts`                 | `fetch` router and `scheduled` sweep                         |
| `apps/bot/src/verify.ts`                | Ed25519 request verification via `crypto.subtle`             |
| `apps/bot/src/db.ts`                    | All D1 access — one transaction per mutation                 |
| `apps/bot/src/embeds.ts`                | Pure renderers for the embed and action row                  |
| `apps/bot/src/handlers/`                | Slash command, modal submit, and button handlers             |
| `apps/bot/src/time.ts`, `src/parse.ts`  | Free-text parsing for start times, roles, and compositions   |
| `apps/bot/schema.sql`                   | D1 schema (also the source of truth for tests)               |
| `apps/bot/scripts/register-commands.ts` | Registers `/lfg` with Discord                                |
| `apps/web/app/pages/index.vue`          | Nuxt 4 + Nuxt UI v4 landing page                             |
| `apps/web/app/components/DiscordMockup` | Interactive Discord embed live preview component             |

### Bot Setup

1. **Create the database and apply the schema.**

   ```sh
   pnpm --filter @mplus-lfg/bot exec wrangler d1 create mplus-lfg # paste database_id into apps/bot/wrangler.jsonc
   pnpm --filter @mplus-lfg/bot db:init      # local
   pnpm --filter @mplus-lfg/bot db:init:remote # production
   ```

2. **Configure secrets.** From the [Discord developer portal](https://discord.com/developers/applications):

   ```sh
   pnpm --filter @mplus-lfg/bot exec wrangler secret put DISCORD_PUBLIC_KEY       # General Information -> Public Key
   pnpm --filter @mplus-lfg/bot exec wrangler secret put DISCORD_APPLICATION_ID   # General Information -> Application ID
   pnpm --filter @mplus-lfg/bot exec wrangler secret put DISCORD_TOKEN            # Bot -> Token
   ```

   For local development, copy `apps/bot/.dev.vars.example` to `apps/bot/.dev.vars` and fill in the same values.

3. **Register the slash command.**

   ```sh
   pnpm register                             # global, up to ~1h to propagate
   DISCORD_GUILD_ID=... pnpm register        # single guild, instant
   ```

4. **Configure the Discord install.** Under **Installation -> Default Install
   Settings -> Guild Install**, enable the `applications.commands` and `bot`
   scopes. Grant the bot **View Channels**, **Send Messages**, and **Embed
   Links** so the scheduled sweep can update its own run messages.

5. **Deploy, then point Discord at the Worker.**

   ```sh
   pnpm deploy:bot
   ```

   Set **Interactions Endpoint URL** in the developer portal to
   `https://<your-worker>.workers.dev/`. Discord validates it by sending a
   deliberately invalid signature and expects a `401` — the Worker handles this.

---

## Web Landing Page (`apps/web`)

The landing page provides a simple, high-fidelity web presence inspired by Mee6's aesthetic with:
- Instant "Add to Discord" CTA button
- Interactive live Discord embed mockup
- 3-step walkthrough and natural syntax reference
- Dark / Light mode theming using Nuxt UI v4

Copy `apps/web/.env.example` to `apps/web/.env`, then set the public Discord
application ID and GitHub repository URL. Until configured, the invite buttons
are disabled and GitHub links are hidden instead of navigating to placeholders.
