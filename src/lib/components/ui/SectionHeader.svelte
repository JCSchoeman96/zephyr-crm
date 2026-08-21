<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		actions,
		class: className = ''
	}: { title: string; description?: string; actions?: Snippet; class?: string } = $props();
</script>

<header class={`ui-section-header ${className}`}>
	<div>
		<h2 class="ui-section-header__title">{title}</h2>
		{#if description}<p class="ui-section-header__description">{description}</p>{/if}
	</div>
	{#if actions}<div class="ui-page-header__actions">{@render actions()}</div>{/if}
</header>
