import { ApplicationCommandType, InteractionContextType, type RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';
// Explicit .ts extension: scripts/register-commands.ts imports this file under
// Node's type stripping, which has no extensionless resolution. constants.ts only
// imports types, which Node erases, so the chain stops here.
import { COMMAND_NAME } from './constants.ts';

/**
 * Command definitions, shared between the Worker and `scripts/register-commands.ts`
 * so the registered name can never drift from the name the Worker dispatches on.
 */
export const COMMANDS: RESTPostAPIApplicationCommandsJSONBody[] = [
	{
		name: COMMAND_NAME,
		type: ApplicationCommandType.ChatInput,
		description: 'Start a Mythic+ group and let people sign up by role',
		// Runs are posted to a channel, so there is nothing to do in DMs.
		// (`contexts` replaces the deprecated `dm_permission` flag.)
		contexts: [InteractionContextType.Guild],
	},
];
