-- Minimal per-server source of truth for LFG activity.
--
-- `timezone` is an IANA zone name and is how bare start times typed into /lfg
-- ("8pm") are read. It defaults to UTC so the column can be NOT NULL, but /setup
-- always writes a real choice, so the default only ever applies to a row this
-- migration back-fills.
CREATE TABLE IF NOT EXISTS mplus_guild_config (
	guild_id TEXT PRIMARY KEY,
	channel_id TEXT NOT NULL,
	timezone TEXT NOT NULL DEFAULT 'UTC'
) STRICT;
