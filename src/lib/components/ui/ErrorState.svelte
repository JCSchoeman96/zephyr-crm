<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title = 'Something went wrong',
		message,
		action,
		class: className = ''
	}: {
		title?: string;
		message: string;
		action?: Snippet;
		class?: string;
	} = $props();
</script>

<section class={`ui-state ui-state--error ${className}`} role="alert">
	<h2 class="ui-state__title">{title}</h2>
	<p class="ui-state__message">{message}</p>
	{#if action}<div>{@render action()}</div>{/if}
</section>
