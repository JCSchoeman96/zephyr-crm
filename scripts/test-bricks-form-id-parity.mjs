import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
	return readFileSync(path, 'utf8');
}

const worker = JSON.parse(read('wrangler.jsonc'));
const expectedFormId = worker.vars?.BRICKS_FORM_ID;
assert.match(expectedFormId ?? '', /^[A-Za-z0-9._-]+$/, 'Worker BRICKS_FORM_ID must be configured');

const browserConfig = read('playwright.config.ts');
const browserHelpers = read('tests/e2e/domain/helpers.ts');
const clientDefaults = read('src/lib/config/client-config.ts');
const clientExample = JSON.parse(read('config/client.example.json'));
const escapedFormId = expectedFormId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

assert.match(
	clientDefaults,
	new RegExp(`formId: '${escapedFormId}'`),
	'client default Bricks form ID must match the Worker variable'
);
assert.equal(
	clientExample.integrations?.bricks?.formId,
	expectedFormId,
	'client example Bricks form ID must match the Worker variable'
);
assert.match(
	browserConfig,
	new RegExp(`BRICKS_FORM_ID:.*\\|\\| '${escapedFormId}'`),
	'Playwright Worker environment must match the Worker variable'
);
assert.match(
	browserHelpers,
	new RegExp(`BRICKS_FORM_ID.*\\|\\| '${escapedFormId}'`),
	'Browser fixture payload must use the Worker form ID by default'
);

console.log(`Bricks form-ID parity passed for ${expectedFormId}.`);
