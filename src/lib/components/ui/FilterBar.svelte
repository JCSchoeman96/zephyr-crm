<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label = 'Filters',
		children,
		class: className = ''
	}: { label?: string; children?: Snippet; class?: string } = $props();

	function preventSubmit(event: SubmitEvent) {
		event.preventDefault();
	}
</script>

<form class={`ui-filter-bar ${className}`} aria-label={label} onsubmit={preventSubmit}>
	{@render children?.()}
</form>
