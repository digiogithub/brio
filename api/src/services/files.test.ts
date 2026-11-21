import type { Knex } from 'knex';
import knex from 'knex';
import { createTracker, MockClient, Tracker } from 'knex-mock-client';
import type { MockedFunction, MockInstance } from 'vitest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidPayloadException } from '../exceptions/index.js';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { getStorage } from '../storage/index.js';
import { FilesService, ItemsService } from './index.js';

vi.mock('../storage/index.js');

describe('Integration Tests', () => {
	let db: MockedFunction<Knex>;
	let tracker: Tracker;

	beforeAll(() => {
		db = vi.mocked(knex.default({ client: MockClient }));
		tracker = createTracker(db);
	});

	afterEach(() => {
		tracker.reset();
		vi.clearAllMocks();
	});

	describe('Services / Files', () => {
		describe('createOne', () => {
			let service: FilesService;
			let superCreateOne: MockInstance;

			beforeEach(() => {
				service = new FilesService({
					knex: db,
					schema: { collections: {}, relations: [] },
				});

				superCreateOne = vi.spyOn(ItemsService.prototype, 'createOne').mockReturnValue(Promise.resolve(1));
			});

			it('throws InvalidPayloadException when "type" is not provided', async () => {
				try {
					await service.createOne({
						title: 'Test File',
						storage: 'local',
						filename_download: 'test_file',
					});
				} catch (err: any) {
					expect(err).toBeInstanceOf(InvalidPayloadException);
					expect(err.message).toBe('"type" is required');
				}

				expect(superCreateOne).not.toHaveBeenCalled();
			});

			it('creates a file entry when "type" is provided', async () => {
				await service.createOne({
					title: 'Test File',
					storage: 'local',
					filename_download: 'test_file',
					type: 'application/octet-stream',
				});

				expect(superCreateOne).toHaveBeenCalled();
			});
		});

		describe('uploadOne', () => {
			const corruptPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

			let service: FilesService;
			let stored: Map<string, Buffer>;
			let disk: Record<string, any>;

			beforeEach(() => {
				service = new FilesService({
					knex: db,
					schema: { collections: {}, relations: [] },
				});

				stored = new Map();

				disk = {
					write: vi.fn(async (filepath: string, content: Readable) => {
						const chunks: Buffer[] = [];
						for await (const chunk of content) chunks.push(Buffer.from(chunk));
						stored.set(filepath, Buffer.concat(chunks));
					}),
					read: vi.fn(async (filepath: string) => Readable.from([stored.get(filepath)!])),
					stat: vi.fn(async (filepath: string) => ({ size: stored.get(filepath)!.length, modified: new Date() })),
					delete: vi.fn(async (filepath: string) => {
						stored.delete(filepath);
					}),
					move: vi.fn(async (src: string, dest: string) => {
						stored.set(dest, stored.get(src)!);
						stored.delete(src);
					}),
					list: vi.fn(async function* (prefix: string) {
						for (const filepath of [...stored.keys()]) {
							if (filepath.startsWith(prefix)) yield filepath;
						}
					}),
				};

				vi.mocked(getStorage).mockResolvedValue({ location: () => disk } as any);

				vi.spyOn(ItemsService.prototype, 'createOne').mockResolvedValue('file-id');
				vi.spyOn(ItemsService.prototype, 'updateOne').mockResolvedValue('file-id');

				tracker.on.select('brio_settings').response([]);
				tracker.on.delete('brio_files').response(1);
				tracker.on.update('brio_files').response(1);
			});

			const upload = (content: Buffer, primaryKey?: string) =>
				service.uploadOne(
					Readable.from([content]),
					{ storage: 'local', filename_download: 'photo.png', type: 'image/png' },
					primaryKey,
					{ emitEvents: false }
				);

			it('stores a valid image and extracts its dimensions', async () => {
				const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#00f' } })
					.png()
					.toBuffer();

				await expect(upload(png)).resolves.toBe('file-id');

				expect([...stored.keys()]).toEqual(['file-id.png']);
				expect(tracker.history.delete).toHaveLength(0);

				expect(ItemsService.prototype.updateOne).toHaveBeenCalledWith(
					'file-id',
					expect.objectContaining({ filename_disk: 'file-id.png', width: 3, height: 2 }),
					{ emitEvents: false }
				);
			});

			it('rejects a corrupt image without leaving a row or a file behind', async () => {
				await expect(upload(corruptPng)).rejects.toBeInstanceOf(InvalidPayloadException);

				expect(stored.size).toBe(0);
				expect(disk['delete']).toHaveBeenCalledWith('file-id.png');

				expect(tracker.history.delete).toHaveLength(1);
				expect(tracker.history.delete[0]!.sql).toContain('brio_files');
				expect(tracker.history.delete[0]!.bindings).toEqual(['file-id']);

				// The row is never completed with a filename_disk
				expect(ItemsService.prototype.updateOne).not.toHaveBeenCalled();
			});

			it('removes the row when the file cannot be written', async () => {
				disk['write'].mockRejectedValue(new Error('disk full'));

				await expect(upload(corruptPng)).rejects.toMatchObject({ status: 503 });

				expect(tracker.history.delete).toHaveLength(1);
			});

			it('keeps the existing file and row when a replacement is corrupt', async () => {
				stored.set('file-id.jpg', Buffer.from('previous'));
				stored.set('file-id__thumbnail.jpg', Buffer.from('thumbnail'));

				tracker.on.select('brio_files').response([
					{
						id: 'file-id',
						storage: 'local',
						filename_disk: 'file-id.jpg',
						filename_download: 'previous.jpg',
						type: 'image/jpeg',
						folder: null,
					},
				]);

				await expect(upload(corruptPng, 'file-id')).rejects.toBeInstanceOf(InvalidPayloadException);

				expect([...stored.keys()].sort()).toEqual(['file-id.jpg', 'file-id__thumbnail.jpg']);
				expect(tracker.history.delete).toHaveLength(0);

				expect(tracker.history.update).toHaveLength(1);

				expect(tracker.history.update[0]!.bindings).toEqual(
					expect.arrayContaining(['previous.jpg', 'image/jpeg', 'file-id.jpg'])
				);
			});

			it('replaces the previous file and thumbnails once the new image is valid', async () => {
				stored.set('file-id.jpg', Buffer.from('previous'));
				stored.set('file-id__thumbnail.jpg', Buffer.from('thumbnail'));

				tracker.on
					.select('brio_files')
					.response([
						{ id: 'file-id', storage: 'local', filename_disk: 'file-id.jpg', filename_download: 'previous.jpg' },
					]);

				const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#fff' } })
					.png()
					.toBuffer();

				await expect(upload(png, 'file-id')).resolves.toBe('file-id');

				expect([...stored.keys()]).toEqual(['file-id.png']);
				expect(stored.get('file-id.png')).toEqual(png);
			});
		});
	});
});
