import assert from 'node:assert/strict';
import { typeDriftMessage } from './check-generated-db-types.mjs';

assert.equal(typeDriftMessage('same\n', 'same\n'), null);
const drift = typeDriftMessage('const value = 1;\n', 'const value = 2;\n');
assert.match(drift ?? '', /line 1/);
assert.match(drift ?? '', /database types drifted/i);

console.log('Generated database type drift assertions passed');
