/**
 * Registers this bot's slash commands with Discord.
 *
 *   node scripts/register-commands.ts            # global (up to ~1h to propagate)
 *   DISCORD_GUILD_ID=... node scripts/register-commands.ts   # one guild, instant
 *
 * Credentials are read from the environment, falling back to .dev.vars so the
 * same file drives `wrangler dev` and this script. Run standalone on Node 22+
 * (uses built-in TypeScript type stripping and global fetch).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../src/commands.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal `KEY="value"` reader — enough for the handful of keys we need. */
function readDevVars(): Record<string, string> {
	try {
		const contents = readFileSync(join(ROOT, '.dev.vars'), 'utf8');
		const vars: Record<string, string> = {};
		for (const line of contents.split('\n')) {
			const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
			if (match) vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
		}
		return vars;
	} catch {
		return {};
	}
}

const devVars = readDevVars();

function config(key: string): string | undefined {
	return process.env[key] || devVars[key] || undefined;
}

function requireConfig(key: string): string {
	const value = config(key);
	if (!value) {
		throw new Error(`Missing ${key}. Set it in the environment or in .dev.vars (see .dev.vars.example).`);
	}
	return value;
}

const applicationId = requireConfig('DISCORD_APPLICATION_ID');
const token = requireConfig('DISCORD_TOKEN');
const guildId = config('DISCORD_GUILD_ID');

const scope = guildId ? `guild ${guildId}` : 'globally';
const path = guildId ? `/applications/${applicationId}/guilds/${guildId}/commands` : `/applications/${applicationId}/commands`;

// PUT replaces the full command set, so removing a command here removes it in Discord.
const response = await fetch(`https://discord.com/api/v10${path}`, {
	method: 'PUT',
	headers: {
		Authorization: `Bot ${token}`,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify(COMMANDS),
});

if (!response.ok) {
	console.error(`Registration failed: ${response.status} ${response.statusText}`);
	console.error(await response.text());
	process.exit(1);
}

const registered = (await response.json()) as Array<{ name: string }>;
console.log(`Registered ${scope}: ${registered.map((command) => `/${command.name}`).join(', ')}`);
