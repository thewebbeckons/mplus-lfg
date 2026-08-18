import { ID_PREFIX, ROLES } from './constants';
import type { Role } from './types';

/**
 * Button `custom_id` grammar (Discord caps these at 100 characters):
 *
 *   mplus:join:tank:<group_id>
 *   mplus:leave:<group_id>
 *   mplus:cancel:<group_id>
 */
export type ComponentAction = { kind: 'join'; role: Role; groupId: string } | { kind: 'leave' | 'cancel'; groupId: string };

export function joinId(role: Role, groupId: string): string {
	return `${ID_PREFIX}:join:${role.toLowerCase()}:${groupId}`;
}

export function leaveId(groupId: string): string {
	return `${ID_PREFIX}:leave:${groupId}`;
}

export function cancelId(groupId: string): string {
	return `${ID_PREFIX}:cancel:${groupId}`;
}

export function parseComponentId(customId: string): ComponentAction | null {
	const parts = customId.split(':');
	if (parts[0] !== ID_PREFIX) return null;

	if (parts[1] === 'join' && parts.length === 4) {
		const role = parts[2].toUpperCase();
		if (!ROLES.includes(role as Role) || !parts[3]) return null;
		return { kind: 'join', role: role as Role, groupId: parts[3] };
	}
	if ((parts[1] === 'leave' || parts[1] === 'cancel') && parts.length === 3 && parts[2]) {
		return { kind: parts[1], groupId: parts[2] };
	}
	return null;
}
