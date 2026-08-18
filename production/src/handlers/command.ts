import {
	type APILabelComponent,
	type APIApplicationCommandInteraction,
	type APIInteractionResponse,
	ApplicationCommandType,
	ComponentType,
	InteractionResponseType,
	TextInputStyle,
} from 'discord-api-types/v10';
import { COMMAND_NAME, MODAL_CREATE_ID, MODAL_FIELD } from '../constants';
import { ephemeral } from '../interactions';

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
		required: true,
		min_values: 1,
		max_values: 1,
		options: [
			{ label: 'Tank', value: 'TANK', emoji: { name: '🛡️' } },
			{ label: 'Healer', value: 'HEALER', emoji: { name: '💚' } },
			{ label: 'DPS', value: 'DPS', emoji: { name: '⚔️' }, default: true },
		],
	},
};

export function handleCommand(interaction: APIApplicationCommandInteraction): APIInteractionResponse {
	if (interaction.data.type !== ApplicationCommandType.ChatInput || interaction.data.name !== COMMAND_NAME) {
		return ephemeral('Unknown command.');
	}
	if (!interaction.guild_id) {
		return ephemeral('Mythic+ runs have to be posted in a server channel, not in DMs.');
	}

	return {
		type: InteractionResponseType.Modal,
		data: {
			custom_id: MODAL_CREATE_ID,
			title: 'Start a Mythic+ group',
			components: [textInput(MODAL_INPUTS[0]), textInput(MODAL_INPUTS[1]), ROLE_INPUT, ...MODAL_INPUTS.slice(2).map(textInput)],
		},
	};
}
