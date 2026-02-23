import { z } from 'zod';
import { UnsupportedMediaTypeException } from '../../../exceptions/index.js';
import { AssetsService } from '../../../services/assets.js';
import { FilesService } from '../../../services/files.js';
import { defineTool } from '../define-tool.js';

const AssetsValidateSchema = z.strictObject({ id: z.string() });
const AssetsInputSchema = z.object({ id: z.string() });

export const assets = defineTool<z.infer<typeof AssetsValidateSchema>>({
    name: 'assets',
    description: 'Returns binary asset data as base64 image/audio payload.',
    annotations: { title: 'Brio - Assets' },
    inputSchema: AssetsInputSchema,
    validateSchema: AssetsValidateSchema,
    async handler({ args, schema, accountability }) {
        const serviceOptions = { accountability, schema };
        const filesService = new FilesService(serviceOptions);
        const file = (await filesService.readOne(args.id, { limit: 1 })) as Record<string, any>;
        const fileType = file['type'] as string | null | undefined;
        const width = file['width'] as number | null | undefined;
        const height = file['height'] as number | null | undefined;

        if (!fileType || !['image', 'audio'].some((t) => fileType.startsWith(t))) {
            throw new UnsupportedMediaTypeException(`Unsupported media type "${fileType ?? 'unknown'}" in asset tool.`);
        }

        let transformation: any;

        if (fileType.startsWith('image') && width && height && (width > 1200 || height > 1200)) {
            transformation = {
                transformationParams: {
                    transforms:
                        width > height
                            ? [['resize', { width: 800, fit: 'contain' }]]
                            : [['resize', { height: 800, fit: 'contain' }]],
                },
            };
        }

        const assetsService = new AssetsService(serviceOptions);
        const asset = await assetsService.getAsset(args.id, transformation);
        const chunks: Uint8Array[] = [];
        for await (const chunk of asset.stream) chunks.push(chunk as Uint8Array);

        return {
            type: fileType.startsWith('image') ? 'image' : 'audio',
            data: Buffer.concat(chunks).toString('base64'),
            mimeType: fileType,
        };
    },
});
