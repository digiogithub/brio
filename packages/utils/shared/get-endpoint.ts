export function getEndpoint(collection: string): string {
	if (collection.startsWith('directus_')) {
		return `/${collection.substring(9)}`;
	}

	if (collection.startsWith('brio_')) {
		return `/${collection.substring(5)}`;
	}

	return `/items/${collection}`;
}
