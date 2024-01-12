import {
	type ContextMenuCommandBuilder,
	type SlashCommandBuilder,
	type SlashCommandSubcommandBuilder,
	type SlashCommandSubcommandGroupBuilder,
} from "@discordjs/builders";
import {
	type CommandInteraction,
	type Interaction,
	type MessageComponent,
	type MessageComponentInteraction,
} from "discord.js";
import type Application from "./bot";

type Bot = typeof Application;

export type CommandModule = {
	default: ({ bot }: { bot: Bot }) => unknown;
};

export type CommandArgs = {
	bot: Bot;
};

export type ActionHandler<T> = (interaction: T) => unknown;

export interface BotComponent {
	component: MessageComponent;
	handler: ActionHandler<MessageComponentInteraction>;
}

export interface BotCommand<
	T extends Interaction,
	U extends CommandBuilder = SlashCommandBuilderSequence
> {
	commands: U;
	handler: ActionHandler<T>;
}

export interface BotAutocompleteCommand<T extends CommandInteraction> {
	commands: SlashCommandBuilderDefinition;
	handler: ActionHandler<T>;
}

// export interface BotListener {}

export type SlashCommandBuilderDefinition =
	| SlashCommandBuilder
	| [SlashCommandBuilder]
	| [SlashCommandBuilder, SlashCommandSubcommandBuilder]
	| [
			SlashCommandBuilder,
			SlashCommandSubcommandGroupBuilder,
			SlashCommandSubcommandBuilder
	  ];

export type SlashCommandBuilderSequence = Exclude<
	SlashCommandBuilderDefinition,
	SlashCommandBuilder
>;

export type CommandBuilder =
	| SlashCommandBuilderSequence
	| [ContextMenuCommandBuilder];
