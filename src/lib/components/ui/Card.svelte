<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		header,
		children,
		class: className = ''
	}: { title?: string; header?: Snippet; children?: Snippet; class?: string } = $props();
</script>

<section class={`ui-card ${className}`}>
	{#if title || header}
		<header class="ui-card__header">
			{#if title}<h2 class="ui-card__title">{title}</h2>{/if}
			{@render header?.()}
		</header>
	{/if}
	<div class="ui-card__body">{@render children?.()}</div>
</section>
