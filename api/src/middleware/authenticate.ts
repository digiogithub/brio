import type { Accountability } from '@brio/types';
import type { NextFunction, Request, Response } from 'express';
import { isEqual } from 'lodash-es';
import getDatabase from '../database/index.js';
import emitter from '../emitter.js';
import env from '../env.js';
import { InvalidCredentialsException } from '../exceptions/index.js';
import asyncHandler from '../utils/async-handler.js';
import { getIPFromReq } from '../utils/get-ip-from-req.js';
import isBrioJWT from '../utils/is-brio-jwt.js';
import { verifyAccessJWT } from '../utils/jwt.js';

/**
 * Verify the passed JWT and assign the user ID and role to `req`
 */
export const handler = async (req: Request, _res: Response, next: NextFunction) => {
	const defaultAccountability: Accountability = {
		user: null,
		role: null,
		admin: false,
		app: false,
		ip: getIPFromReq(req),
	};

	const userAgent = req.get('user-agent');
	if (userAgent) defaultAccountability.userAgent = userAgent;

	const origin = req.get('origin');
	if (origin) defaultAccountability.origin = origin;

	const database = getDatabase();

	const customAccountability = await emitter.emitFilter(
		'authenticate',
		defaultAccountability,
		{
			req,
		},
		{
			database,
			schema: null,
			accountability: null,
		}
	);

	if (customAccountability && isEqual(customAccountability, defaultAccountability) === false) {
		req.accountability = customAccountability;
		return next();
	}

	req.accountability = defaultAccountability;

	if (req.token) {
		if (isBrioJWT(req.token)) {
			const payload = verifyAccessJWT(req.token, env['SECRET']);
			const roleAccess =
				payload.share || !payload.role
					? null
					: await database
						.select('admin_access', 'app_access')
						.from('brio_roles')
						.where({ id: payload.role })
						.first();

			req.accountability.role = payload.role;
			req.accountability.admin =
				roleAccess?.admin_access !== undefined
					? roleAccess.admin_access === true || roleAccess.admin_access == 1
					: payload.admin_access === true || payload.admin_access == 1;
			req.accountability.app =
				roleAccess?.app_access !== undefined
					? roleAccess.app_access === true || roleAccess.app_access == 1
					: payload.app_access === true || payload.app_access == 1;

			if (payload.share) req.accountability.share = payload.share;
			if (payload.share_scope) req.accountability.share_scope = payload.share_scope;
			if (payload.id) req.accountability.user = payload.id;
		} else {
			// Try finding the user with the provided token
			const user = await database
				.select('brio_users.id', 'brio_users.role', 'brio_roles.admin_access', 'brio_roles.app_access')
				.from('brio_users')
				.leftJoin('brio_roles', 'brio_users.role', 'brio_roles.id')
				.where({
					'brio_users.token': req.token,
					status: 'active',
				})
				.first();

			if (!user) {
				throw new InvalidCredentialsException();
			}

			req.accountability.user = user.id;
			req.accountability.role = user.role;
			req.accountability.admin = user.admin_access === true || user.admin_access == 1;
			req.accountability.app = user.app_access === true || user.app_access == 1;
		}
	}

	return next();
};

export default asyncHandler(handler);
