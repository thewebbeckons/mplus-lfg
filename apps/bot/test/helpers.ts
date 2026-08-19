import { ChannelType, InteractionType } from 'discord-api-types/v10';
import { createGroup, setGuildConfig } from '../src/db';
import type { Composition, GroupState, PartyPlan, Role } from '../src/types';

export const GUILD_ID = '111111111111111111';
export const CHANNEL_ID = '222222222222222222';
export const OTHER_CHANNEL_ID = '333333333333333333';

/**
 * Applies schema.sql to a test database. `D1Database.exec()` requires one
 * statement per line, so split on `;` instead and run the DDL as a batch.
 */
export async function applySchema(db: D1Database, schemaSql: string): Promise<void> {
	const statements = schemaSql
		.replace(/^\s*--.*$/gm, '')
		.split(';')
		.map((statement) => statement.trim())
		.filter(Boolean);
	await db.batch(statements.map((statement) => db.prepare(statement)));
}

export function user(id: string, displayName = `user-${id}`): { id: string; displayName: string } {
	return { id, displayName };
}

export interface SeedOptions {
	id?: string;
	creatorId?: string;
	creatorRole?: Role;
	composition?: Composition;
	reserved?: Composition;
	startTs?: number | null;
	createdAt?: number;
}

export function seedGroup(db: D1Database, options: SeedOptions = {}): Promise<GroupState> {
	const createdAt = options.createdAt ?? Math.floor(Date.now() / 1000);
	return createGroup(db, {
		id: options.id ?? crypto.randomUUID(),
		guildId: GUILD_ID,
		channelId: CHANNEL_ID,
		creatorId: options.creatorId ?? 'creator',
		creatorName: 'Creator',
		creatorRole: options.creatorRole ?? 'TANK',
		activity: '+10 Weekly Vault',
		startTime: 'in 30 mins',
		startTs: options.startTs === undefined ? createdAt + 1800 : options.startTs,
		notes: null,
		plan: {
			total: options.composition ?? { TANK: 1, HEALER: 1, DPS: 3 },
			reserved: options.reserved ?? { TANK: 0, HEALER: 0, DPS: 0 },
		} satisfies PartyPlan,
		createdAt,
	});
}

export const TIMEZONE = 'America/New_York';

export function configureGuild(db: D1Database, channelId = CHANNEL_ID, timezone = TIMEZONE): Promise<void> {
	return setGuildConfig(db, GUILD_ID, channelId, timezone);
}

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface SigningKey {
	privateKey: CryptoKey;
	publicKeyHex: string;
}

export async function createSigningKey(): Promise<SigningKey> {
	const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
	const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
	return { privateKey: pair.privateKey, publicKeyHex: bytesToHex(raw) };
}

/** `worker.fetch` wants an inbound-shaped Request; the global constructor is the outbound one. */
export const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

/** Builds a request signed exactly the way Discord signs interaction webhooks. */
export async function signedInteraction(key: SigningKey, payload: unknown): Promise<Request<unknown, IncomingRequestCfProperties>> {
	const body = JSON.stringify(payload);
	const timestamp = Math.floor(Date.now() / 1000).toString();
	const signature = new Uint8Array(
		await crypto.subtle.sign({ name: 'Ed25519' }, key.privateKey, new TextEncoder().encode(timestamp + body)),
	);
	return new IncomingRequest('https://example.com/interactions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Signature-Ed25519': bytesToHex(signature),
			'X-Signature-Timestamp': timestamp,
		},
		body,
	});
}

const MEMBER_PERMISSIONS = { none: '0', moderator: '8', manageGuild: '32' } as const;

type MemberPermissions = keyof typeof MEMBER_PERMISSIONS;

function member(id: string, permissions: MemberPermissions = 'none') {
	return {
		user: { id, username: `user-${id}`, discriminator: '0', global_name: `User ${id}`, avatar: null },
		nick: null,
		roles: [],
		joined_at: '2024-01-01T00:00:00.000Z',
		deaf: false,
		mute: false,
		flags: 0,
		permissions: MEMBER_PERMISSIONS[permissions],
	};
}

interface CommandInteractionOptions {
	name?: string;
	channelId?: string;
	permissions?: MemberPermissions;
}

export function commandInteraction(userId: string, options: CommandInteractionOptions = {}) {
	const channelId = options.channelId ?? CHANNEL_ID;
	return {
		id: '1',
		application_id: '000000000000000001',
		type: InteractionType.ApplicationCommand,
		token: 'interaction-token',
		version: 1,
		guild_id: GUILD_ID,
		channel: { id: channelId, type: 0 },
		channel_id: channelId,
		member: member(userId, options.permissions),
		data: { id: 'cmd', name: options.name ?? 'lfg', type: 1 },
		locale: 'en-US',
		app_permissions: '0',
		entitlements: [],
		authorizing_integration_owners: {},
	};
}

export function modalInteraction(userId: string, fields: Record<string, string>, channelId = CHANNEL_ID) {
	return {
		...commandInteraction(userId, { channelId }),
		type: InteractionType.ModalSubmit,
		data: {
			custom_id: 'mplus:create',
			components: Object.entries(fields).map(([customId, value]) => ({
				type: 18,
				component:
					customId === 'role'
						? { type: 3, custom_id: customId, values: value ? [value] : [] }
						: { type: 4, custom_id: customId, value },
			})),
		},
	};
}

export function setupModalInteraction(
	userId: string,
	channelId: string,
	permissions: MemberPermissions = 'moderator',
	selectedType: ChannelType = ChannelType.GuildText,
	/** `null` submits no timezone at all, the way an untouched select does. */
	timezone: string | null = 'America/Chicago',
) {
	return {
		...commandInteraction(userId, { name: 'setup', permissions }),
		type: InteractionType.ModalSubmit,
		data: {
			custom_id: 'mplus:setup',
			components: [
				{
					type: 18,
					component: { type: 8, custom_id: 'lfg_channel', values: [channelId] },
				},
				...(timezone === null
					? []
					: [{ type: 18, component: { type: 3, custom_id: 'lfg_timezone', values: [timezone] } }]),
			],
			resolved: {
				channels: {
					[channelId]: { id: channelId, type: selectedType, name: 'mythic-plus', permissions: '0' },
				},
			},
		},
	};
}

export function buttonInteraction(userId: string, customId: string, permissions: MemberPermissions = 'none') {
	return {
		...commandInteraction(userId),
		type: InteractionType.MessageComponent,
		member: member(userId, permissions),
		message: { id: 'message-1' },
		data: { custom_id: customId, component_type: 2 },
	};
}
