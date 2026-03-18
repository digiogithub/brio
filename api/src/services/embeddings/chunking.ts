import type { EmbeddingChunkStrategy } from '../../types/embeddings.js';

export type ChunkOptions = {
	strategy: EmbeddingChunkStrategy;
	size: number;
	overlap: number;
};

export function chunkText(input: string, options: ChunkOptions): string[] {
	const text = normalizeWhitespace(input);
	if (!text) return [];

	if (options.strategy === 'none') return [text];

	const size = Math.max(1, options.size);
	const overlap = Math.max(0, Math.min(options.overlap, size - 1));

	switch (options.strategy) {
		case 'paragraph':
			return chunkStructured(splitParagraphs(text), size, overlap);
		case 'sentence':
			return chunkStructured(splitSentences(text), size, overlap);
		case 'fixed':
			return splitFixed(text, size, overlap);
		case 'auto':
		default: {
			const paragraphs = splitParagraphs(text);
			if (paragraphs.length > 1) {
				return chunkStructured(paragraphs, size, overlap);
			}

			return chunkStructured(splitSentences(text), size, overlap);
		}
	}
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function splitParagraphs(text: string): string[] {
	return text
		.split(/\n{2,}/)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function splitSentences(text: string): string[] {
	return text
		.split(/(?<=[.!?])\s+/g)
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0);
}

function chunkStructured(segments: string[], size: number, overlap: number): string[] {
	if (segments.length === 0) return [];

	const chunks: string[] = [];
	let current = '';

	for (const segment of segments) {
		if (segment.length > size) {
			if (current) {
				chunks.push(current);
				current = '';
			}

			chunks.push(...splitFixed(segment, size, overlap));
			continue;
		}

		const candidate = current.length === 0 ? segment : `${current}\n${segment}`;

		if (candidate.length <= size) {
			current = candidate;
			continue;
		}

		if (current) {
			chunks.push(current);
			current = segment;
		} else {
			chunks.push(segment);
		}
	}

	if (current) {
		chunks.push(current);
	}

	return chunks;
}

function splitFixed(text: string, size: number, overlap: number): string[] {
	const chunks: string[] = [];
	const step = Math.max(1, size - overlap);
	let start = 0;

	while (start < text.length) {
		const end = Math.min(start + size, text.length);
		const chunk = text.slice(start, end).trim();
		if (chunk.length > 0) chunks.push(chunk);
		if (end >= text.length) break;
		start += step;
	}

	return chunks;
}
