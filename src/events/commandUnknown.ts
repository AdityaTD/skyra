import { Command, Event, KlasaMessage, Stopwatch } from 'klasa';
import { GuildSettings } from '../lib/types/namespaces/GuildSettings';

export default class extends Event {

	public async run(message: KlasaMessage, command: string) {
		if (!message.guild || (message.guild.settings.get('disabledChannels') as string[]).includes(message.channel.id)) return null;
		command = command.toLowerCase();

		const tag = (message.guild.settings.get('tags') as [string, string][]).some((t) => t[0] === command);
		if (tag) return this.runTag(message, command);

		const alias = (message.guild.settings.get(GuildSettings.Trigger.Alias) as GuildSettings.Trigger.Alias).find((entry) => entry.input === command);
		const commandAlias = (alias && this.client.commands.get(alias.output)) || null;
		if (commandAlias) return this.runCommand(message, commandAlias);

		return null;
	}

	public runCommand(message: KlasaMessage, command: Command) {
		const commandHandler = this.client.monitors.get('commandHandler') as any;
		const { regex: prefix, length: prefixLength } = commandHandler.getPrefix(message);

		// @ts-ignore
		return commandHandler.runCommand(message._registerCommand({ command, prefix, prefixLength }));
	}

	public async runTag(message: KlasaMessage, command: string) {
		const tagCommand = this.client.commands.get('tag') as any;
		const timer = new Stopwatch();

		try {
			await this.client.inhibitors.run(message, tagCommand);
			try {
				const commandRun = tagCommand.show(message, [command]);
				timer.stop();
				const response = await commandRun;
				// tslint:disable-next-line:no-floating-promises
				this.client.finalizers.run(message, tagCommand, response, timer);
				this.client.emit('commandSuccess', message, tagCommand, ['show', command], response);
			} catch (error) {
				this.client.emit('commandError', message, tagCommand, ['show', command], error);
			}
		} catch (response) {
			this.client.emit('commandInhibited', message, tagCommand, response);
		}
	}

}