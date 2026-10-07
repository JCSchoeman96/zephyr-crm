export default {
	async scheduled(controller: ScheduledController, env: KeepaliveWorkerEnv): Promise<void> {
		const event = {
			cron: controller.cron,
			scheduledTime: new Date(controller.scheduledTime).toISOString()
		};

		try {
			const baseUrl = new URL(env.SUPABASE_URL);
			if (baseUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(baseUrl.hostname)) {
				throw new Error('Supabase URL must use HTTPS');
			}

			const response = await fetch(new URL('/rest/v1/rpc/keepalive', baseUrl), {
				method: 'POST',
				headers: {
					apikey: env.SUPABASE_PUBLISHABLE_KEY,
					'content-type': 'application/json'
				},
				body: '{}',
				signal: AbortSignal.timeout(10_000)
			});
			if (!response.ok) throw new Error(`Supabase keepalive returned HTTP ${response.status}`);
			if ((await response.json()) !== true) {
				throw new Error('Supabase keepalive returned an unexpected response');
			}

			console.log(JSON.stringify({ event: 'supabase_keepalive_succeeded', ...event }));
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			console.error(
				JSON.stringify({ event: 'supabase_keepalive_failed', error: message, ...event })
			);
			throw error;
		}
	}
} satisfies ExportedHandler<KeepaliveWorkerEnv>;
