import { toTitleCase } from '@klasa/utils';
import { Guild } from 'discord.js';
import { Schema, SchemaEntry, SettingsFolder } from 'klasa';

export type SchemaValue = SchemaGroup | SchemaEntry;
export interface SchemaGroup {
	path: string;
	children: Map<string, SchemaGroup | SchemaEntry>;
	parent: SchemaGroup | null;
}

export const schemaKeys: SchemaGroup = { path: '', children: new Map(), parent: null };

export function isSchemaFolder(schemaOrEntry: SchemaValue): schemaOrEntry is SchemaGroup {
	return schemaOrEntry instanceof Map;
}

export function isSchemaEntry(schemaOrEntry: SchemaValue): schemaOrEntry is SchemaEntry {
	return !isSchemaFolder(schemaOrEntry);
}

export function displayFolder(settings: SettingsFolder) {
	const array: string[] = [];
	const folders: string[] = [];
	const sections = new Map<string, string[]>();
	let longest = 0;
	for (const [key, value] of settings.schema.entries()) {
		if (!schemaKeys.children.has(value.path)) continue;

		if (value.type === 'Folder') {
			folders.push(`// ${key}`);
		} else {
			const values = sections.get(value.type) || [];
			values.push(key);

			if (key.length > longest) longest = key.length;
			if (values.length === 1) sections.set(value.type, values);
		}
	}
	if (folders.length) array.push('= Folders =', ...folders.sort(), '');
	if (sections.size) {
		for (const keyType of [...sections.keys()].sort()) {
			array.push(`= ${toTitleCase(keyType)}s =`,
				...sections.get(keyType)!.sort().map(key => `${key.padEnd(longest)} :: ${displayEntry(settings.schema.get(key) as SchemaEntry, settings.get(key), settings.base!.target as Guild)}`),
				'');
		}
	}
	return array.join('\n');
}

export function displayEntry(entry: SchemaEntry, value: unknown, guild: Guild) {
	return entry.array
		? displayEntryMultiple(entry, value as readonly unknown[], guild)
		: displayEntrySingle(entry, value, guild);
}

export function displayEntrySingle(entry: SchemaEntry, value: unknown, guild: Guild) {
	return value === null
		? guild.language.tget('COMMAND_CONF_SETTING_NOT_SET')
		: entry.serializer!.stringify(value, guild);
}

export function displayEntryMultiple(entry: SchemaEntry, values: readonly unknown[], guild: Guild) {
	return values.length === 0
		? 'None'
		: `[ ${values.map(value => displayEntrySingle(entry, value, guild)).join(' | ')} ]`;
}

export function initSchema(schema: Schema) {
	schemaKeys.children.clear();

	for (const [key, value] of schema) {
		const entry = value as SchemaEntry;
		if (!entry.configurable) continue;

		const base = key.split('.');
		const name = base.pop()!;

		let map: SchemaGroup = schemaKeys;
		for (let i = 0; i < base.length; ++i) {
			const subKey = base[i];
			const subPath = map.children.get(subKey);
			if (typeof subPath === 'undefined') {
				const path = base.slice(0, i).join('.');
				const subFolder: SchemaGroup = { path, children: new Map(), parent: map };
				map.children.set(subKey, subFolder);
				map = subFolder;
				schemaKeys.children.set(path, subFolder);
			} else {
				map = subPath as SchemaGroup;
			}
		}

		map.children.set(name, entry);
		schemaKeys.children.set(key, entry);
	}

	return schemaKeys;
}
