import { Events } from '@lib/types/Enums';
import { APIErrors, BrandingColors, Time } from '@utils/constants';
import { LLRCData, LongLivingReactionCollector } from '@utils/LongLivingReactionCollector';
import { api } from '@utils/Models/Api';
import { schemaKeys, displayEntry, isSchemaFolder, SchemaGroup } from '@utils/SettingsUtils';
import { floatPromise } from '@utils/util';
import { DiscordAPIError, MessageCollector, MessageEmbed } from 'discord.js';
import { KlasaMessage, SchemaEntry, Settings, SettingsFolderUpdateOptions } from 'klasa';
import { DbSet } from './DbSet';

const EMOJIS = { BACK: '◀', STOP: '⏹' };
const TIMEOUT = Time.Minute * 15;

export class SettingsMenu {

	private readonly message: KlasaMessage;
	private readonly oldSettings: Settings;
	private readonly embed: MessageEmbed;
	private schema: SchemaGroup;
	private schemaEntry: SchemaEntry | null;
	private messageCollector: MessageCollector | null = null;
	private errorMessage: string | null = null;
	private llrc: LongLivingReactionCollector | null = null;
	private response: KlasaMessage | null = null;

	public constructor(message: KlasaMessage) {
		this.message = message;
		this.schema = schemaKeys;
		this.schemaEntry = null;
		this.oldSettings = this.message.guild!.settings.clone();
		this.embed = new MessageEmbed()
			.setAuthor(this.message.author.username, this.message.author.displayAvatarURL({ size: 128, format: 'png', dynamic: true }));
	}

	private get changedCurrentPieceValue(): boolean {
		if (!this.schemaEntry) return false;
		if (this.schemaEntry.array) {
			const current = this.message.guild!.settings.get(this.schemaEntry.path) as unknown[];
			const old = this.oldSettings.get(this.schemaEntry.path) as unknown[];
			return current.length !== old.length || current.some((value, i) => value !== old[i]);
		}
		// eslint-disable-next-line eqeqeq
		return this.message.guild!.settings.get(this.schemaEntry.path) != this.oldSettings.get(this.schemaEntry.path);
	}

	private get changedPieceValue(): boolean {
		if (!this.schemaEntry) return false;
		// eslint-disable-next-line eqeqeq
		return this.message.guild!.settings.get(this.schemaEntry.path) != this.schemaEntry.default;
	}

	public async init(): Promise<void> {
		this.response = await this.message.sendEmbed(new MessageEmbed()
			.setColor(BrandingColors.Secondary)
			.setDescription(this.message.language.tget('SYSTEM_LOADING')));
		await this.response.react(EMOJIS.STOP);
		this.llrc = new LongLivingReactionCollector(this.message.client)
			.setListener(this.onReaction.bind(this))
			.setEndListener(this.stop.bind(this));
		this.llrc.setTime(TIMEOUT);
		this.messageCollector = this.response.channel.createMessageCollector(msg => msg.author!.id === this.message.author.id);
		this.messageCollector.on('collect', msg => this.onMessage(msg));
		await this._renderResponse();
	}

	private async render() {
		const i18n = this.message.language;
		const description: string[] = [];
		if (this.schemaEntry) {
			description.push(i18n.tget('COMMAND_CONF_MENU_RENDER_AT_PIECE', this.schemaEntry.path));
			if (this.errorMessage) description.push('\n', this.errorMessage, '\n');
			if (this.schemaEntry.configurable) {
				description.push(
					i18n.get(`SETTINGS_${this.schemaEntry.path.replace(/[.-]/g, '_').toUpperCase()}`),
					'',
					i18n.tget('COMMAND_CONF_MENU_RENDER_TCTITLE'),
					i18n.tget('COMMAND_CONF_MENU_RENDER_UPDATE'),
					this.schemaEntry.array && (this.message.guild!.settings.get(this.schemaEntry.path) as unknown[]).length ? i18n.tget('COMMAND_CONF_MENU_RENDER_REMOVE') : '',
					this.changedPieceValue ? i18n.tget('COMMAND_CONF_MENU_RENDER_RESET') : '',
					this.changedCurrentPieceValue ? i18n.tget('COMMAND_CONF_MENU_RENDER_UNDO') : '',
					'',
					i18n.tget('COMMAND_CONF_MENU_RENDER_CVALUE', displayEntry(this.schemaEntry, this.message.guild!.settings.get(this.schemaEntry.path), this.message.guild!).replace(/``+/g, '`\u200B`'))
				);
			}
		} else {
			description.push(i18n.tget('COMMAND_CONF_MENU_RENDER_AT_FOLDER', this.schema.path || 'Root'));
			if (this.errorMessage) description.push(this.errorMessage);
			const keys: string[] = [];
			const folders: string[] = [];
			for (const [key, value] of this.schema.children.entries()) {
				if (isSchemaFolder(value)) folders.push(key);
				else keys.push(key);
			}

			if (!folders.length && !keys.length) description.push(i18n.tget('COMMAND_CONF_MENU_RENDER_NOKEYS'));
			else description.push(i18n.tget('COMMAND_CONF_MENU_RENDER_SELECT'), '', ...folders.map(folder => `• \\📁${folder}`), ...keys.map(key => `• ${key}`));
		}

		const { parent } = this.schemaEntry ?? this.schema;

		if (parent) floatPromise(this.message, this._reactResponse(EMOJIS.BACK));
		else floatPromise(this.message, this._removeReactionFromUser(EMOJIS.BACK, this.message.client.user!.id));

		return this.embed
			.setColor(await DbSet.fetchColor(this.message))
			.setDescription(`${description.filter(v => v !== null).join('\n')}\n\u200B`)
			.setFooter(parent ? i18n.tget('COMMAND_CONF_MENU_RENDER_BACK') : '')
			.setTimestamp();
	}

	private async onMessage(message: KlasaMessage) {
		// In case of messages that do not have a content, like attachments, ignore
		if (!message.content) return;

		this.llrc?.setTime(TIMEOUT);
		this.errorMessage = null;
		if (this.schemaEntry) {
			const [command, ...params] = message.content.split(' ');
			const commandLowerCase = command.toLowerCase();
			if (commandLowerCase === 'set') await this.tryUpdate(params.join(' '), { arrayAction: 'add' });
			else if (commandLowerCase === 'remove') await this.tryUpdate(params.join(' '), { arrayAction: 'remove' });
			else if (commandLowerCase === 'reset') await this.tryUpdate(null);
			else if (commandLowerCase === 'undo') await this.tryUndo();
			else this.errorMessage = this.message.language.tget('COMMAND_CONF_MENU_INVALID_ACTION');
		} else {
			const schema = this.schema.children.get(message.content);
			if (schema) {
				if (isSchemaFolder(schema)) this.schema = schema;
				else this.schemaEntry = schema;
			} else {
				this.errorMessage = this.message.language.tget('COMMAND_CONF_MENU_INVALID_KEY');
			}
		}

		if (!this.errorMessage) floatPromise(this.message, message.nuke());
		await this._renderResponse();
	}

	private async onReaction(reaction: LLRCData): Promise<void> {
		if (reaction.userID !== this.message.author.id) return;
		this.llrc?.setTime(TIMEOUT);
		if (reaction.emoji.name === EMOJIS.STOP) {
			this.llrc?.end();
		} else if (reaction.emoji.name === EMOJIS.BACK) {
			floatPromise(this.message, this._removeReactionFromUser(EMOJIS.BACK, reaction.userID));
			if (this.schemaEntry) this.schemaEntry = null;
			else if (this.schema.parent) this.schema = this.schema.parent;
			await this._renderResponse();
		}
	}

	private async _removeReactionFromUser(reaction: string, userID: string) {
		if (!this.response) return;
		try {
			return await api(this.message.client)
				.channels(this.message.channel.id)
				.messages(this.response.id)
				.reactions(encodeURIComponent(reaction), userID === this.message.client.user!.id ? '@me' : userID)
				.delete();
		} catch (error) {
			if (error instanceof DiscordAPIError) {
				if (error.code === APIErrors.UnknownMessage) {
					this.response = null;
					this.llrc?.end();
					return this;
				}

				if (error.code === APIErrors.UnknownEmoji) {
					return this;
				}
			}

			// Log any other error
			this.message.client.emit(Events.ApiError, error);
		}
	}

	private async _reactResponse(emoji: string) {
		if (!this.response) return;
		try {
			await this.response.react(emoji);
		} catch (error) {
			if (error instanceof DiscordAPIError && error.code === APIErrors.UnknownMessage) {
				this.response = null;
				this.llrc?.end();
			} else {
				this.message.client.emit(Events.ApiError, error);
			}
		}
	}

	private async _renderResponse() {
		if (!this.response) return;
		try {
			await this.response.edit(await this.render());
		} catch (error) {
			if (error instanceof DiscordAPIError && error.code === APIErrors.UnknownMessage) {
				this.response = null;
				this.llrc?.end();
			} else {
				this.message.client.emit(Events.ApiError, error);
			}
		}
	}

	private async tryUpdate(value: unknown, options: SettingsFolderUpdateOptions = {}) {
		try {
			const updated = await (value === null
				? this.message.guild!.settings.reset(this.schemaEntry!.path, { ...options, extraContext: { author: this.message.author.id } })
				: this.message.guild!.settings.update(this.schemaEntry!.path, value, { ...options, extraContext: { author: this.message.author.id } }));
			if (updated.length === 0) this.errorMessage = this.message.language.tget('COMMAND_CONF_NOCHANGE', this.schemaEntry!.key);
		} catch (error) {
			this.errorMessage = String(error);
		}
	}

	private async tryUndo() {
		if (this.changedCurrentPieceValue) {
			const previousValue = this.oldSettings.get(this.schemaEntry!.path);
			try {
				await (previousValue === null
					? this.message.guild!.settings.reset(this.schemaEntry!.path, { extraContext: { author: this.message.author.id } })
					: this.message.guild!.settings.update(this.schemaEntry!.path, previousValue, { arrayAction: 'overwrite', extraContext: { author: this.message.author.id } }));
			} catch (error) {
				this.errorMessage = String(error);
			}
		} else {
			this.errorMessage = this.message.language.tget('COMMAND_CONF_NOCHANGE', this.schemaEntry!.key);
		}
	}

	private stop(): void {
		if (this.response) {
			if (this.response.reactions.size) {
				this.response.reactions.removeAll()
					.catch(error => this.response!.client.emit(Events.ApiError, error));
			}
			this.response.edit(this.message.language.tget('COMMAND_CONF_MENU_SAVED'), { embed: null })
				.catch(error => this.message.client.emit(Events.ApiError, error));
		}
		if (!this.messageCollector!.ended) this.messageCollector!.stop();
	}

}
