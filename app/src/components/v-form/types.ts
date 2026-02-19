import { DeepPartial, Field } from '@brio/types';

export type FormField = DeepPartial<Field> & {
	field: string;
	name: string;
	hideLabel?: boolean;
	hideLoader?: boolean;
};
