import {
	type APILabelComponent,
	type APIApplicationCommandInteraction,
	type APIInteractionResponse,
	ApplicationCommandType,
	ChannelType,
	ComponentType,
	InteractionResponseType,
	SelectMenuDefaultValueType,
	TextInputStyle,
} from 'discord-api-types/v10';
import {
	COMMAND_NAME,
	DEFAULT_ROLE,
	MODAL_CREATE_ID,
	MODAL_FIELD,
	MODAL_SETUP_ID,
	SETUP_CHANNEL_FIELD,
	SETUP_TIMEZONE_FIELD,
	TIMEZONE_CHOICES,
} from '../constants';
import { getGuildConfig } from '../db';
import type { Bindings } from '../env';
import { canManageGuild, ephemeral } from '../interactions';
import { requireLfgChannel } from '../lfgAccess';

/**
 * `/lfg` opens a modal rather than taking slash-command options. The role is a
 * fixed select menu while the run details stay free-form, keeping the flow
 * compact on mobile and the draft off-screen until it is ready to post.
 */

interface TextInputSpec {
	customId: string;
	label: string;
	placeholder: string;
	style: TextInputStyle;
	required: boolean;
	maxLength: number;
}

const MODAL_INPUTS: TextInputSpec[] = [
	{
		customId: MODAL_FIELD.activity,
		label: 'Activity / target',
		placeholder: 'e.g. +10 Weekly Vault, or Grim Batol +11',
		style: TextInputStyle.Short,
		required: true,
		maxLength: 100,
	},
	{
		customId: MODAL_FIELD.startTime,
		label: 'Start time',
		placeholder: 'e.g. in 30 mins, 8:00 PM EST, 20:00 UTC',
		style: TextInputStyle.Short,
		required: true,
		maxLength: 60,
	},
	{
		customId: MODAL_FIELD.comp,
		label: 'Composition — or "LF 2 DPS"',
		placeholder: '1/1/3 for a fresh group, or "LF 2 DPS" if you have a premade',
		style: TextInputStyle.Short,
		required: false,
		maxLength: 60,
	},
	{
		customId: MODAL_FIELD.notes,
		label: 'Notes (optional)',
		placeholder: 'Voice required, need 640+ ilvl, bring food…',
		style: TextInputStyle.Paragraph,
		required: false,
		maxLength: 500,
	},
];

function textInput(input: TextInputSpec): APILabelComponent {
	return {
		type: ComponentType.Label,
		label: input.label,
		component: {
			type: ComponentType.TextInput,
			custom_id: input.customId,
			placeholder: input.placeholder,
			style: input.style,
			required: input.required,
			max_length: input.maxLength,
		},
	};
}

const ROLE_INPUT: APILabelComponent = {
	type: ComponentType.Label,
	label: 'Your role',
	component: {
		type: ComponentType.StringSelect,
		custom_id: MODAL_FIELD.role,
		placeholder: 'Choose your role',
		// Discord currently renders the default option but can still treat an
		// untouched required select as unanswered. Let that case submit; the modal
		// handler applies the same displayed default when `values` is empty.
		required: false,
		min_values: 0,
		max_values: 1,
		options: [
			{ label: 'Tank', value: 'TANK', emoji: { name: '🛡️' } },
			{ label: 'Healer', value: 'HEALER', emoji: { name: '💚' } },
			{ label: 'DPS', value: 'DPS', emoji: { name: '⚔️' }, default: DEFAULT_ROLE === 'DPS' },
		],
	},
};

export async function handleCommand(
	interaction: APIApplicationCommandInteraction,
	env: Bindings,
): Promise<APIInteractionResponse> {
	if (interaction.data.type !== ApplicationCommandType.ChatInput) {
		return ephemeral('Unknown command.');
	}

	if (interaction.data.name === COMMAND_NAME.setup || interaction.data.name === COMMAND_NAME.settings) {
		return handleConfigurationCommand(interaction, env);
	}
	if (interaction.data.name !== COMMAND_NAME.lfg) return ephemeral('Unknown command.');

	const access = await requireLfgChannel(interaction, env.DB);
	if (!access.allowed) return access.response;

	return createGroupModal();
}

async function handleConfigurationCommand(
	interaction: APIApplicationCommandInteraction,
	env: Bindings,
): Promise<APIInteractionResponse> {
	if (!interaction.guild_id) return ephemeral('LFG setup is only available inside a server.');
	if (!canManageGuild(interaction)) {
		return ephemeral('You need **Manage Server** or **Administrator** permission to configure LFG.');
	}

	const config = await getGuildConfig(env.DB, interaction.guild_id);
	const channelSelect: APILabelComponent = {
		type: ComponentType.Label,
		label: 'Dedicated LFG channel',
		description: 'LFG commands and group posts will stay in this text channel.',
		component: {
			type: ComponentType.ChannelSelect,
			custom_id: SETUP_CHANNEL_FIELD,
			channel_types: [ChannelType.GuildText],
			placeholder: 'Choose an LFG channel',
			required: true,
			min_values: 1,
			max_values: 1,
			...(config
				? { default_values: [{ id: config.channel_id, type: SelectMenuDefaultValueType.Channel }] }
				: {}),
		},
	};

	const timezoneSelect: APILabelComponent = {
		type: ComponentType.Label,
		label: 'Server timezone',
		description: 'Start times typed into /lfg without a timezone are read in this one.',
		component: {
			type: ComponentType.StringSelect,
			custom_id: SETUP_TIMEZONE_FIELD,
			placeholder: 'Choose a timezone',
			// Only forced on a first run. Re-opening via /settings shows the saved
			// zone as the default, and Discord can report an untouched default as
			// unanswered, so leave that case optional and keep the stored value.
			required: !config,
			min_values: config ? 0 : 1,
			max_values: 1,
			options: TIMEZONE_CHOICES.map((choice) => ({
				label: choice.label,
				value: choice.value,
				default: choice.value === config?.timezone,
			})),
		},
	};

	return {
		type: InteractionResponseType.Modal,
		data: {
			custom_id: MODAL_SETUP_ID,
			title: config ? 'LFG settings' : 'Set up LFG',
			components: [channelSelect, timezoneSelect],
		},
	};
}

function createGroupModal(): APIInteractionResponse {
	return {
		type: InteractionResponseType.Modal,
		data: {
			custom_id: MODAL_CREATE_ID,
			title: 'Start a Mythic+ group',
			components: [textInput(MODAL_INPUTS[0]), textInput(MODAL_INPUTS[1]), ROLE_INPUT, ...MODAL_INPUTS.slice(2).map(textInput)],
		},
	};
}
