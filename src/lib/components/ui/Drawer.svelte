<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';
	import { X } from 'lucide-svelte';

	let {
		open = $bindable(false),
		title,
		children,
		class: className = ''
	}: { open?: boolean; title: string; children?: Snippet; class?: string } = $props();

	function close() {
		open = false;
	}
</script>

{#if open}
	<div class="ui-overlay">
		<dialog open class={`ui-drawer ${className}`} aria-modal="true" aria-labelledby="drawer-title">
			<header class="ui-dialog__header">
				<h2 class="ui-dialog__title" id="drawer-title">{title}</h2>
				<IconButton ariaLabel="Close drawer" onclick={close}>
					<X size={18} aria-hidden="true" />
				</IconButton>
			</header>
			<div class="ui-dialog__body">{@render children?.()}</div>
		</dialog>
	</div>
{/if}
