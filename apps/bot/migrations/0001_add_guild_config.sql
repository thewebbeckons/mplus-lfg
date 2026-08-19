-- Minimal per-server source of truth for LFG activity.
CREATE TABLE IF NOT EXISTS mplus_guild_config (
	guild_id TEXT PRIMARY KEY,
	channel_id TEXT NOT NULL
) STRICT;
