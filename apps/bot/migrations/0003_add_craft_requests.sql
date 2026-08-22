-- Crafting requests, and the two guild settings that turn the feature on.
--
-- Additive only: `mplus_guild_config` keeps `channel_id` as the LFG channel, and
-- both new columns are nullable, so a server that has only ever configured LFG
-- reads back exactly as it did before and keeps working untouched.
ALTER TABLE mplus_guild_config ADD COLUMN craft_channel_id TEXT;
ALTER TABLE mplus_guild_config ADD COLUMN crafter_role_id TEXT;

CREATE TABLE IF NOT EXISTS craft_requests (
	id TEXT PRIMARY KEY,
	guild_id TEXT NOT NULL,
	-- The crafting channel as it was when the request was posted, so the message
	-- can still be edited after an admin moves the feature elsewhere.
	channel_id TEXT NOT NULL,
	-- Captured after the public post is created; NULL if that post failed.
	message_id TEXT,
	requester_id TEXT NOT NULL,
	requester_name TEXT NOT NULL,
	-- Numeric Wowhead/Blizzard item id, extracted from the submitted link.
	item_id INTEGER NOT NULL,
	-- The submitted link, kept verbatim including any bonus/modifier parameters,
	-- because that exact URL is what the "View on Wowhead" button points at.
	item_url TEXT NOT NULL,
	-- Resolved through the Blizzard Game Data API where credentials are
	-- configured, otherwise derived from the URL. NULL is tolerated throughout.
	item_name TEXT,
	item_icon TEXT,
	item_quality TEXT,
	quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
	character_realm TEXT,
	details TEXT,
	status TEXT NOT NULL DEFAULT 'OPEN'
		CHECK (status IN ('OPEN', 'CLAIMED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
	crafter_id TEXT,
	crafter_name TEXT,
	created_at INTEGER NOT NULL,
	claimed_at INTEGER,
	completed_at INTEGER,
	-- When the completion notice was claimed, and how it went. Together these are
	-- what stop a repeated "Mark complete" click sending a second DM.
	notified_at INTEGER,
	notify_status TEXT CHECK (notify_status IN ('PENDING', 'DM_SENT', 'DM_FAILED', 'FALLBACK_POSTED'))
) STRICT;

-- Drives the expiry sweep: scan only unfinished requests, oldest first.
CREATE INDEX IF NOT EXISTS idx_craft_requests_live ON craft_requests (status, created_at);

-- Drives the retention purge, which is keyed to age alone.
CREATE INDEX IF NOT EXISTS idx_craft_requests_created ON craft_requests (created_at);

-- Per-server listings and moderation queries.
CREATE INDEX IF NOT EXISTS idx_craft_requests_guild ON craft_requests (guild_id, status, created_at);
