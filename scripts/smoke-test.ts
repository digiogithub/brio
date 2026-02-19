#!/usr/bin/env bun
/**
 * Brio Smoke Test - Verifies Bun runtime compatibility
 */

console.log('🎵 Brio Smoke Test');
console.log('Runtime:', typeof Bun !== 'undefined' ? `Bun ${Bun.version}` : 'Node.js');

// Test bun:sqlite
import { Database } from 'bun:sqlite';
const db = new Database(':memory:');
db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
db.exec("INSERT INTO test (name) VALUES ('brio')");
const result = db.query('SELECT * FROM test').get();
console.log('✅ bun:sqlite works:', result);

// Test Bun.password
const hash = await Bun.password.hash('test123', { algorithm: 'argon2id' });
const valid = await Bun.password.verify('test123', hash);
console.log('✅ Bun.password works:', valid);

// Test TypeScript execution
const x: number = 42;
console.log('✅ TypeScript native:', x);

console.log('🎉 All smoke tests passed!');
