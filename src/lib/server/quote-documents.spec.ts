import { describe, expect, it } from 'vitest';
import { resolveLogoAsset } from './quote-documents';

const onePixelPng =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('quote document logo assets', () => {
	it('resolves same-deployment PNG assets into deterministic inline data', async () => {
		const requests: string[] = [];
		const assets = {
			fetch: async (request: Request) => {
				requests.push(request.url);
				return new Response(
					Uint8Array.from(atob(onePixelPng.split(',')[1]), (value) => value.charCodeAt(0)),
					{
						status: 200,
						headers: { 'content-type': 'image/png' }
					}
				);
			}
		};

		expect(await resolveLogoAsset('/brand/logo.png', assets)).toBe(onePixelPng);
		expect(requests).toEqual(['https://zephyr-crm.invalid/brand/logo.png']);
	});

	it('does not fetch external or unsupported logo assets', async () => {
		let requests = 0;
		const assets = {
			fetch: async () => {
				requests += 1;
				return new Response('not an image', {
					status: 200,
					headers: { 'content-type': 'image/svg+xml' }
				});
			}
		};

		expect(await resolveLogoAsset('https://example.test/logo.png', assets)).toBeNull();
		expect(await resolveLogoAsset('//example.test/logo.png', assets)).toBeNull();
		expect(await resolveLogoAsset('/brand/logo.svg', assets)).toBeNull();
		expect(requests).toBe(1);
	});
});
