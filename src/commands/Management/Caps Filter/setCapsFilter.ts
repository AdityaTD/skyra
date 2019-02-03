import { CommandStore, KlasaClient, KlasaMessage } from 'klasa';
import { SkyraCommand } from '../../../lib/structures/SkyraCommand';

/* eslint-disable no-bitwise */
const VALUES = {
	alert: { value: 1 << 2, key: 'COMMAND_SETCAPSFILTER_ALERT' },
	delete: { value: 1 << 0, key: 'COMMAND_SETCAPSFILTER_DELETE' },
	log: { value: 1 << 1, key: 'COMMAND_SETCAPSFILTER_LOG' }
};

export default class extends SkyraCommand {

	public constructor(client: KlasaClient, store: CommandStore, file: string[], directory: string) {
		super(client, store, file, directory, {
			cooldown: 5,
			description: (language) => language.get('COMMAND_SETCAPSFILTER_DESCRIPTION'),
			extendedHelp: (language) => language.get('COMMAND_SETCAPSFILTER_EXTENDED'),
			permissionLevel: 5,
			runIn: ['text'],
			usage: '<delete|log|alert|show:default> [enable|disable]',
			usageDelim: ' '
		});
	}

	public async run(message: KlasaMessage, [type, mode = 'enable']: [string, string?]) {
		const capsfilter = message.guild.settings.get('selfmod.capsfilter') as number;
		if (type === 'show') {
			return message.sendLocale('COMMAND_SETCAPSFILTER_SHOW', [
				capsfilter & VALUES.alert.value,
				capsfilter & VALUES.log.value,
				capsfilter & VALUES.delete.value
			], { code: 'asciidoc' });
		}

		const { value, key } = VALUES[type];
		const enable = mode === 'enable';
		const changed = enable
			? capsfilter | value
			: capsfilter & ~value;
		if (capsfilter === changed) throw message.language.get('COMMAND_SETCAPSFILTER_EQUALS');
		await message.guild.settings.update('selfmod.capsfilter', changed);

		return message.sendLocale(key, [enable]);
	}

}