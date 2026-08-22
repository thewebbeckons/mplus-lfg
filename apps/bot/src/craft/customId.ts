import { CRAFT_ID_PREFIX } from './constants';

/**
 * Button `custom_id` grammar (Discord caps these at 100 characters):
 *
 *   mplus:craft:claim:<request_id>
 *   mplus:craft:release:<request_id>
 *   mplus:craft:complete:<request_id>
 *   mplus:craft:cancel:<request_id>
 *
 * The `craft` segment is what keeps these from ever being read as an LFG
 * button: `parseComponentId` in ../lfg/customId only accepts join/leave/cancel
 * in that position.
 */
export const CRAFT_ACTIONS = ['claim', 'release', 'complete', 'cancel'] as const;

export type CraftAction = (typeof CRAFT_ACTIONS)[number];

export interface CraftComponentAction {
	kind: CraftAction;
	requestId: string;
}

export function craftButtonId(action: CraftAction, requestId: string): string {
	return `${CRAFT_ID_PREFIX}:${action}:${requestId}`;
}

/** True for any id in the crafting namespace, valid or not. */
export function isCraftComponentId(customId: string): boolean {
	return customId.startsWith(`${CRAFT_ID_PREFIX}:`);
}

export function parseCraftComponentId(customId: string): CraftComponentAction | null {
	const parts = customId.split(':');
	if (parts.length !== 4) return null;
	if (`${parts[0]}:${parts[1]}` !== CRAFT_ID_PREFIX) return null;
	if (!(CRAFT_ACTIONS as readonly string[]).includes(parts[2]) || !parts[3]) return null;
	return { kind: parts[2] as CraftAction, requestId: parts[3] };
}
