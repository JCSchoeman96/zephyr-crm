import { readFileSync } from 'node:fs';

const { parseClientConfiguration } = await import('../src/lib/config/client-config.ts');
const file =
	process.argv.find((argument) => argument.endsWith('.json')) ??
	process.env.CLIENT_CONFIG_FILE ??
	'config/client.example.json';

try {
	const configuration = parseClientConfiguration(JSON.parse(readFileSync(file, 'utf8')));
	console.log(
		JSON.stringify({
			status: 'VALID',
			file,
			version: configuration.version,
			companyName: configuration.brand.companyName,
			currency: configuration.locale.currency,
			quotePrefix: configuration.quotes.prefix,
			bricksFormId: configuration.integrations.bricks.formId,
			sendpulseSenderDomain: configuration.integrations.sendpulse.senderDomain || null
		})
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Client configuration validation failed.');
	process.exit(1);
}
