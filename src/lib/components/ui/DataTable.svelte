<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		caption,
		children,
		class: className = ''
	}: { caption?: string; children?: Snippet; class?: string } = $props();
</script>

<div class={`ui-table-shell ${className}`} role="region" aria-label={caption} tabindex="-1">
	<table class="ui-table">
		{#if caption}<caption>{caption}</caption>{/if}
		{@render children?.()}
	</table>
</div>
