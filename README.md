# mplus-lfg

`mplus-lfg` is a Discord bot for organizing World of Warcraft Mythic+ groups.
It lets players post a run, find the roles they need, and keep the roster
updated in one shared Discord message.

## How the bot works

1. A server admin runs `/setup` and chooses the dedicated LFG text channel.
2. In that channel, use `/lfg` and enter the activity, start time, your role,
   group composition, and any notes.
3. The bot posts the run with buttons for Tank, Healer, and DPS.
4. Players join by choosing an open role. The bot updates the roster as people
   join, leave, or switch roles, and prevents roles from overfilling.
5. The run leader can cancel the run, and the bot closes sign-ups after the
   start time.

Admins can run `/settings` later to move all LFG activity to another text
channel.

The composition field accepts simple descriptions such as `1/1/3`, `LF 2 DPS`,
or `LF1M tank`. This supports both fresh groups and groups that already have
some players ready.

## Contributing

The bot lives in `apps/bot` and runs locally with Cloudflare Workers and a
local D1 database.

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
is also required for registering the slash command and for the expiry sweep.
`DISCORD_GUILD_ID` is optional, but setting it makes the command available in a
test server immediately instead of waiting for global command propagation.

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

Register `/lfg`, `/setup`, and `/settings` with Discord when needed:

```sh
pnpm register
```

Run the checks before opening a pull request:

```sh
pnpm --filter @mplus-lfg/bot test
pnpm --filter @mplus-lfg/bot typecheck
```
