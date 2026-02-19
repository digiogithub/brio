import isBrioJWT from '../../src/utils/is-brio-jwt.js';
import jwt from 'jsonwebtoken';
import { test, expect } from 'vitest';

test('Returns false for non JWT string', () => {
	const result = isBrioJWT('test');
	expect(result).toBe(false);
});

test('Returns false for JWTs with text payload', () => {
	const token = jwt.sign('plaintext', 'secret');
	const result = isBrioJWT(token);
	expect(result).toBe(false);
});

test(`Returns false if token issuer isn't "brio"`, () => {
	const token = jwt.sign({ payload: 'content' }, 'secret', { issuer: 'rijk' });
	const result = isBrioJWT(token);
	expect(result).toBe(false);
});

test(`Returns true if token is valid JWT and issuer is "brio"`, () => {
	const token = jwt.sign({ payload: 'content' }, 'secret', { issuer: 'brio' });
	const result = isBrioJWT(token);
	expect(result).toBe(true);
});
