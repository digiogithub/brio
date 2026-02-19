import type { Driver } from '@brio/storage';

export const _aliasMap: Record<string, string> = {
	local: '@brio/storage-driver-local',
	s3: '@brio/storage-driver-s3',
	gcs: '@brio/storage-driver-gcs',
	azure: '@brio/storage-driver-azure',
	cloudinary: '@brio/storage-driver-cloudinary',
};

export const getStorageDriver = async (driverName: string): Promise<typeof Driver> => {
	if (driverName in _aliasMap) {
		driverName = _aliasMap[driverName]!;
	} else {
		throw new Error(`Driver "${driverName}" doesn't exist.`);
	}

	return (await import(driverName)).default;
};
