import { BaseException } from '@brio/exceptions';

export class InvalidQueryException extends BaseException {
	constructor(message: string) {
		super(message, 400, 'INVALID_QUERY');
	}
}
