import { SkyraCommand, SkyraCommandOptions } from '@lib/structures/SkyraCommand';
import { ApplyOptions } from '@skyra/decorators';
import { assetsFolder } from '@utils/constants';
import { fetchAvatar, radians } from '@utils/util';
import { Image } from 'canvas';
import { Canvas } from 'canvas-constructor';
import { promises as fsp } from 'fs';
import { KlasaMessage, KlasaUser } from 'klasa';
import { join } from 'path';

const imageCoordinates = [
	[
		// Tony
		{ center: [211, 53], radius: 18, rotation: radians(-9.78), flip: true },
		{ center: [136, 237], radius: 53, rotation: radians(24.27), flip: true },
		{ center: [130, 385], radius: 34, rotation: radians(17.35), flip: true }
	], [
		// Cpt America
		{ center: [326, 67], radius: 50, rotation: radians(-32.47), flip: true },
		{ center: [351, 229], radius: 43, rotation: radians(-8.53), flip: false },
		{ center: [351, 390], radius: 40, rotation: radians(-9.21), flip: false }
	]
] as const;

@ApplyOptions<SkyraCommandOptions>({
	aliases: ['pants'],
	bucket: 2,
	cooldown: 30,
	description: language => language.tget('COMMAND_HOWTOFLIRT_DESCRIPTION'),
	extendedHelp: language => language.tget('COMMAND_HOWTOFLIRT_EXTENDED'),
	requiredPermissions: ['ATTACH_FILES'],
	runIn: ['text'],
	spam: true,
	usage: '<user:username>'
})
export default class extends SkyraCommand {

	private kTemplate: Buffer | null = null;

	public async run(message: KlasaMessage, [user]: [KlasaUser]) {
		const attachment = await this.generate(message, user);
		return message.channel.send({ files: [{ attachment, name: 'HowToFlirt.png' }] });
	}

	public async init() {
		this.kTemplate = await fsp.readFile(join(assetsFolder, '/images/memes/howtoflirt.png'));
	}

	private async generate(message: KlasaMessage, user: KlasaUser) {
		if (user.id === message.author.id) user = this.client.user!;

		/* Get the buffers from both profile avatars */
		const buffers = await Promise.all([
			fetchAvatar(message.author, 128),
			fetchAvatar(user, 128)
		]);
		const images = await Promise.all(buffers.map(buffer => new Promise<Image>((resolve, reject) => {
			const image = new Image(128, 128);
			image.src = buffer;
			image.onload = resolve;
			image.onerror = reject;
			resolve(image);
		})));

		/* Initialize Canvas */
		return new Canvas(500, 500)
			.addImage(this.kTemplate!, 0, 0, 500, 500)
			.process(canvas => {
				for (const index of [0, 1]) {
					const image = images[index];
					const coordinates = imageCoordinates[index];

					for (const { center, rotation, radius, flip } of coordinates) {
						canvas
							.setTransform(flip ? -1 : 1, 0, 0, 1, center[0], center[1])
							.rotate(flip ? -rotation : rotation)
							.addCircularImage(image, 0, 0, radius);
					}
				}
			})
			.toBufferAsync();
	}

}
