import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const server = createServer(async (request, response) => {
	let body = '';
	for await (const chunk of request) body += chunk;
	response.setHeader('content-type', 'application/json');
	if (request.url === '/oauth/access_token' && request.method === 'POST') {
		response.end(JSON.stringify({ access_token: 'p14-browser-provider-token' }));
		return;
	}
	if (request.url === '/smtp/emails' && request.method === 'POST') {
		try {
			const payload = JSON.parse(body);
			if (
				!payload.email?.from?.email ||
				!payload.email?.to?.length ||
				!payload.email?.attachments?.length
			) {
				response.statusCode = 422;
				response.end(JSON.stringify({ result: false }));
				return;
			}
		} catch {
			response.statusCode = 400;
			response.end(JSON.stringify({ result: false }));
			return;
		}
		response.end(JSON.stringify({ result: true, id: `p14-browser-provider-${randomUUID()}` }));
		return;
	}
	response.statusCode = 404;
	response.end(JSON.stringify({ result: false }));
});

server.listen(4180, '127.0.0.1');
const close = () => server.close(() => process.exit(0));
process.once('SIGINT', close);
process.once('SIGTERM', close);
