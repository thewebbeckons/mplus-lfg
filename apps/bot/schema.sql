-- Mythic+ LFG bot schema (Cloudflare D1 / SQLite)
--
-- Apply with:
--   pnpm exec wrangler d1 execute mplus-lfg --local --file=./schema.sql
--   pnpm exec wrangler d1 execute mplus-lfg --remote --file=./schema.sql
--
-- D1 enforces foreign keys by default, so no `PRAGMA foreign_keys` is needed
-- (and PRAGMA statements are rejected over the D1 API).

-- The configured channel is the server-side source of truth for every LFG
-- command, interaction, and generated post.
CREATE TABLE IF NOT EXISTS mplus_guild_config (
	guild_id TEXT PRIMARY KEY,
	channel_id TEXT NOT NULL,
	-- IANA zone name. Bare start times typed into /lfg ("8pm") are read in it.
	timezone TEXT NOT NULL DEFAULT 'UTC'
) STRICT;

CREATE TABLE IF NOT EXISTS mplus_groups (
	id TEXT PRIMARY KEY,
	guild_id TEXT NOT NULL,
	channel_id TEXT NOT NULL,
	-- Captured asynchronously after the interaction response is delivered, so the
	-- cron job can edit the original message when a run expires.
	message_id TEXT,
	creator_id TEXT NOT NULL,
	activity TEXT NOT NULL,
	-- Exactly what the creator typed, kept for display when we cannot parse it.
	start_time TEXT NOT NULL,
	-- Unix seconds, NULL when `start_time` was free text we could not resolve.
	start_ts INTEGER,
	notes TEXT,
	-- Total party composition, including the creator and any pre-filled slots.
	tank_needed INTEGER NOT NULL DEFAULT 1,
	healer_needed INTEGER NOT NULL DEFAULT 1,
	dps_needed INTEGER NOT NULL DEFAULT 3,
	-- Slots the creator already has covered by people who are not signing up here
	-- (a premade partly assembled in-game). They occupy capacity but have no row
	-- in mplus_signups and cannot be un-reserved by a button.
	tank_reserved INTEGER NOT NULL DEFAULT 0 CHECK (tank_reserved >= 0),
	healer_reserved INTEGER NOT NULL DEFAULT 0 CHECK (healer_reserved >= 0),
	dps_reserved INTEGER NOT NULL DEFAULT 0 CHECK (dps_reserved >= 0),
	status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FULL', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
	created_at INTEGER NOT NULL
);

-- Drives the cron sweep: scan only live groups, ordered by when they go stale.
CREATE INDEX IF NOT EXISTS idx_mplus_groups_live ON mplus_groups (status, start_ts, created_at);
CREATE INDEX IF NOT EXISTS idx_mplus_groups_guild ON mplus_groups (guild_id, status, created_at);

-- Drives the retention purge, which is keyed to the start time and falls back to
-- the post time for runs whose start time was never parsed. Indexing the same
-- expression keeps the purge from scanning the whole table every ten minutes.
CREATE INDEX IF NOT EXISTS idx_mplus_groups_retention ON mplus_groups (COALESCE(start_ts, created_at));

CREATE TABLE IF NOT EXISTS mplus_signups (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	group_id TEXT NOT NULL REFERENCES mplus_groups (id) ON DELETE CASCADE,
	user_id TEXT NOT NULL,
	username TEXT NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('TANK', 'HEALER', 'DPS')),
	signed_at INTEGER NOT NULL,
	-- One slot per user per group; role switches are an upsert on this constraint.
	UNIQUE (group_id, user_id)
);

-- Capacity checks count signups per (group, role) on every button press.
CREATE INDEX IF NOT EXISTS idx_mplus_signups_group_role ON mplus_signups (group_id, role);
