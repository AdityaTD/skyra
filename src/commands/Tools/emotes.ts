import { chunk } from '@klasa/utils';
import { DbSet } from '@lib/structures/DbSet';
import { RichDisplayCommand, RichDisplayCommandOptions } from '@lib/structures/RichDisplayCommand';
import { UserRichDisplay } from '@lib/structures/UserRichDisplay';
import { ApplyOptions } from '@skyra/decorators';
import { BrandingColors } from '@utils/constants';
import { MessageEmbed } from 'discord.js';
import { KlasaMessage } from 'klasa';

@ApplyOptions<RichDisplayCommandOptions>({
	aliases: ['emojis'],
	cooldown: 10,
	description: language => language.tget('COMMAND_EMOTES_DESCRIPTION'),
	extendedHelp: language => language.tget('COMMAND_EMOTES_EXTENDED'),
	runIn: ['text']
})
export default class extends RichDisplayCommand {

	public async run(message: KlasaMessage) {
		const response = await message.sendEmbed(new MessageEmbed()
			.setDescription(message.language.tget('SYSTEM_LOADING'))
			.setColor(BrandingColors.Secondary));

		const animEmotes: string[] = [];
		const staticEmotes: string[] = [];

		for (const [id, emote] of [...message.guild!.emojis.entries()]) {
			if (emote.animated) animEmotes.push(`<a:${emote.name}:${id}>`);
			else staticEmotes.push(`<:${emote.name}:${id}>`);
		}

		const display = await this.buildDisplay(message, chunk(animEmotes, 50), chunk(staticEmotes, 50));

		await display.start(response, message.author.id);
		return response;
	}

	private async buildDisplay(message: KlasaMessage, animatedEmojis: string[][], staticEmojis: string[][]) {
		const display = new UserRichDisplay(new MessageEmbed()
			.setColor(await DbSet.fetchColor(message))
			.setAuthor([
				`${message.guild!.emojis.size}`,
				`${message.language.tget('COMMAND_EMOTES_TITLE')}`,
				`${message.guild!.name}`
			].join(' '), message.guild!.iconURL({ format: 'png' })!));

		for (const chunk of staticEmojis) {
			display.addPage((embed: MessageEmbed) => embed
				.setDescription(chunk.join(' ')));
		}

		for (const chunk of animatedEmojis) {
			display.addPage((embed: MessageEmbed) => embed
				.setDescription(chunk.join(' ')));
		}

		return display;
	}

}
