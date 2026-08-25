import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sidebar = readFileSync('src/lib/components/shell/Sidebar.svelte', 'utf8');
const dashboard = readFileSync('src/routes/+page.svelte', 'utf8');
const reports = readFileSync('src/routes/reports/+page.server.ts', 'utf8');
const componentLabGate = readFileSync('src/routes/system/+page.server.ts', 'utf8');

assert(
	!sidebar.includes("href: '/reports'"),
	'Reports must not be a visible navigation capability.'
);
assert(
	!sidebar.includes("href: '/settings'"),
	'Settings must not be a visible navigation capability.'
);
assert(!dashboard.includes("resolve('/reports')"), 'Dashboard must not advertise a Reports route.');
assert(
	!dashboard.includes("resolve('/system')"),
	'Component Lab must not be advertised in CRM UI.'
);
assert.match(reports, /error\(404/);
assert.match(componentLabGate, /ZEPHYR_COMPONENT_LAB_ENABLED/);
assert.match(componentLabGate, /error\(404/);

function runNavigationBrowser(environment = {}) {
	const output = execFileSync(
		'bun',
		['x', 'playwright', 'test', 'tests/e2e/domain/navigation.e2e.ts'],
		{
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, ...environment }
		}
	);
	process.stdout.write(output);
}

runNavigationBrowser();
runNavigationBrowser({ ZEPHYR_COMPONENT_LAB_ENABLED: '0' });
console.log('P14-T32 navigation and capability truth passed');
