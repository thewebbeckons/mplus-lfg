import {
	ApplicationCommandType,
	InteractionContextType,
	PermissionFlagsBits,
	type RESTPostAPIApplicationCommandsJSONBody,
} from 'discord-api-types/v10';
// Explicit .ts extension: scripts/register-commands.ts imports this file under
// Node's type stripping, which has no extensionless resolution. constants.ts only
// imports types, which Node erases, so the chain stops here.
import { COMMAND_NAME } from './constants.ts';

/**
 * Command definitions, shared between the Worker and `scripts/register-commands.ts`
 * so the registered name can never drift from the name the Worker dispatches on.
 *
 * Descriptions are capped at 100 characters by Discord.
 */
export const COMMANDS: RESTPostAPIApplicationCommandsJSONBody[] = [
	{
		name: COMMAND_NAME.lfg,
		type: ApplicationCommandType.ChatInput,
		description: 'Start a Mythic+ group and let people sign up by role',
		// Posts go to a channel, so there is nothing to do in DMs.
		// (`contexts` replaces the deprecated `dm_permission` flag.)
		contexts: [InteractionContextType.Guild],
	},
	{
		name: COMMAND_NAME.craft,
		type: ApplicationCommandType.ChatInput,
		description: 'Ask a guild crafter to make an item for you',
		contexts: [InteractionContextType.Guild],
	},
	{
		name: COMMAND_NAME.setup,
		type: ApplicationCommandType.ChatInput,
		description: "Set up this server's LFG and crafting channels",
		contexts: [InteractionContextType.Guild],
		default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
	},
	{
		name: COMMAND_NAME.settings,
		type: ApplicationCommandType.ChatInput,
		description: "Change this server's channels, timezone, and crafter role",
		contexts: [InteractionContextType.Guild],
		default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
	},
];
