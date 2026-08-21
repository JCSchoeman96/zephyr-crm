<script lang="ts">
	import type { Snippet } from 'svelte';

	type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

	let {
		tone = 'neutral',
		children,
		class: className = ''
	}: { tone?: BadgeTone; children?: Snippet; class?: string } = $props();
</script>

<span class={`ui-badge ${className}`} data-tone={tone}>{@render children?.()}</span>
