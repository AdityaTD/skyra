import { Guild, User } from 'discord.js';
import { Event } from 'klasa';
import { ModerationTypeKeys } from '../lib/util/constants';

export default class extends Event {

	public async run(guild: Guild, user: User) {
		if (!guild.available || !guild.settings.get('events.banAdd')) return;
		await guild.moderation.waitLock();
		await guild.moderation.new
			.setType(ModerationTypeKeys.Ban)
			.setUser(user)
			.create();
	}

}