<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { createClient } from '$lib/supabase/client';

	type RealtimeTable = 'leads' | 'tasks' | 'quotes';
	type ConnectionState = 'connecting' | 'live' | 'offline';

	let { scope, tables }: { scope: string; tables: readonly RealtimeTable[] } = $props();
	let state = $state<ConnectionState>('connecting');
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		const client = createClient();
		const channel = client.channel(`zephyr-${scope}-${Date.now()}`);

		for (const table of tables) {
			channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
				state = 'live';
				if (refreshTimer) clearTimeout(refreshTimer);
				refreshTimer = setTimeout(() => {
					refreshTimer = undefined;
					void invalidateAll();
				}, 250);
			});
		}

		channel.subscribe((status) => {
			if (status === 'SUBSCRIBED') state = 'live';
			if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
				state = 'offline';
			}
		});

		return () => {
			if (refreshTimer) clearTimeout(refreshTimer);
			void client.removeChannel(channel);
		};
	});
</script>

<span class="realtime-status" data-state={state} aria-live="polite">
	{#if state === 'live'}Live updates{:else if state === 'offline'}Live updates unavailable{:else}Connecting
		live updates…{/if}
</span>

<style>
	.realtime-status {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.realtime-status::before {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: var(--radius-pill);
		background: var(--color-warning);
		content: '';
	}
	.realtime-status[data-state='live']::before {
		background: var(--color-success);
	}
	.realtime-status[data-state='offline']::before {
		background: var(--color-danger);
	}
</style>
