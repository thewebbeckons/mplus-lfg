import {
	type APIActionRowComponent,
	type APIButtonComponentWithCustomId,
	type APIEmbed,
	type APIEmbedField,
	type APIMessageTopLevelComponent,
	ButtonStyle,
	ComponentType,
} from 'discord-api-types/v10';
import { LIVE_STATUSES, ROLES, ROLE_META, STATUS_META } from './constants';
import { cancelId, joinId, leaveId } from './customId';
import { formatStartTime } from '../time';
import type { GroupRow, GroupState, Role, SignupRow } from './types';

/**
 * Pure renderers: given committed state, produce the embed and buttons. Nothing
 * here touches D1 or the network, which keeps the message identical whether it
 * is produced by a slash command, a button press, or the cron sweep.
 */

/** Discord's hard limits; exceeding any of them rejects the whole message. */
const LIMIT = { title: 256, description: 4096, fieldValue: 1024 } as const;

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function neededFor(group: GroupRow, role: Role): number {
	return group[ROLE_META[role].neededColumn];
}

/** Slots the creator already had covered before posting. */
function reservedFor(group: GroupRow, role: Role): number {
	return group[ROLE_META[role].reservedColumn];
}

/** Slots accounted for: sign-ups plus the creator's premade. */
function takenFor(state: GroupState, role: Role): number {
	return signupsFor(state.signups, role).length + reservedFor(state.group, role);
}

function signupsFor(signups: SignupRow[], role: Role): SignupRow[] {
	return signups.filter((signup) => signup.role === role);
}

export function isLive(group: GroupRow): boolean {
	return (LIVE_STATUSES as readonly string[]).includes(group.status);
}

/** Total slots in the composition, and how many are taken. */
export function rosterCounts(state: GroupState): { filled: number; total: number } {
	const total = ROLES.reduce((sum, role) => sum + neededFor(state.group, role), 0);
	// Signups beyond a role's capacity cannot happen, but clamp defensively so
	// the header can never read "6/5".
	const filled = ROLES.reduce((sum, role) => sum + Math.min(takenFor(state, role), neededFor(state.group, role)), 0);
	return { filled, total };
}

function roleField(state: GroupState, role: Role): APIEmbedField | null {
	const needed = neededFor(state.group, role);
	const reserved = reservedFor(state.group, role);
	const members = signupsFor(state.signups, role);
	if (needed === 0 && members.length === 0) return null;

	const meta = ROLE_META[role];
	const lines = members.map((member) => `<@${member.user_id}>`);
	// Premade slots sit between the sign-ups and the open slots: they are taken,
	// but there is nobody here to name.
	for (let slot = 0; slot < reserved; slot++) {
		lines.push('`— premade —`');
	}
	for (let slot = members.length + reserved; slot < needed; slot++) {
		lines.push('`— open —`');
	}

	return {
		name: `${meta.emoji} ${meta.label} ${members.length + reserved}/${needed}`,
		value: truncate(lines.join('\n') || '`— none —`', LIMIT.fieldValue),
		inline: true,
	};
}

export function buildEmbed(state: GroupState): APIEmbed {
	const { group } = state;
	const status = STATUS_META[group.status];
	const { filled, total } = rosterCounts(state);

	const description = [
		`**When** ${formatStartTime(group)}`,
		`**Leader** <@${group.creator_id}>`,
		`**Status** ${status.emoji} ${status.label} · ${filled}/${total} filled`,
		group.notes ? `\n${group.notes.replace(/^/gm, '> ')}` : null,
	]
		.filter((line): line is string => line !== null)
		.join('\n');

	const fields = ROLES.map((role) => roleField(state, role)).filter((field): field is APIEmbedField => field !== null);

	return {
		title: truncate(`${status.emoji} ${group.activity}`, LIMIT.title),
		description: truncate(description, LIMIT.description),
		color: status.color,
		fields,
		footer: { text: `Run ${group.id.slice(0, 8)}` },
		timestamp: new Date(group.created_at * 1000).toISOString(),
	};
}

export function buildComponents(state: GroupState): APIActionRowComponent<APIButtonComponentWithCustomId>[] {
	const { group } = state;
	const live = isLive(group);

	const roleButtons = ROLES.map((role): APIButtonComponentWithCustomId => {
		const needed = neededFor(group, role);
		const taken = takenFor(state, role);
		return {
			type: ComponentType.Button,
			style: role === 'HEALER' ? ButtonStyle.Success : role === 'TANK' ? ButtonStyle.Primary : ButtonStyle.Secondary,
			label: ROLE_META[role].label,
			emoji: { name: ROLE_META[role].emoji },
			custom_id: joinId(role, group.id),
			// A filled role is not clickable; players already in it use Leave to switch out.
			disabled: !live || taken >= needed,
		};
	});

	return [
		{
			type: ComponentType.ActionRow,
			components: [
				...roleButtons,
				{
					type: ComponentType.Button,
					style: ButtonStyle.Secondary,
					label: 'Leave',
					emoji: { name: '🚪' },
					custom_id: leaveId(group.id),
					disabled: !live,
				},
				{
					type: ComponentType.Button,
					style: ButtonStyle.Danger,
					label: 'Cancel',
					emoji: { name: '❌' },
					custom_id: cancelId(group.id),
					disabled: !live,
				},
			],
		},
	];
}

export interface GroupMessagePayload {
	embeds: APIEmbed[];
	components: APIMessageTopLevelComponent[];
	/** Roster mentions must render as names without pinging half the guild. */
	allowed_mentions: { parse: [] };
}

export function buildGroupMessage(state: GroupState): GroupMessagePayload {
	return {
		embeds: [buildEmbed(state)],
		components: buildComponents(state),
		allowed_mentions: { parse: [] },
	};
}
