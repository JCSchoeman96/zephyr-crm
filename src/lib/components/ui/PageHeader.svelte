<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		actions,
		class: className = ''
	}: { title: string; description?: string; actions?: Snippet; class?: string } = $props();
</script>

<header class={`ui-page-header ${className}`}>
	<div>
		<h1 class="ui-page-header__title">{title}</h1>
		{#if description}<p class="ui-page-header__description">{description}</p>{/if}
	</div>
	{#if actions}<div class="ui-page-header__actions">{@render actions()}</div>{/if}
</header>
