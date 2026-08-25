<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';
	import { X } from '@lucide/svelte';

	let {
		open = $bindable(false),
		title,
		children,
		footer,
		class: className = ''
	}: {
		open?: boolean;
		title: string;
		children?: Snippet;
		footer?: Snippet;
		class?: string;
	} = $props();

	function close() {
		open = false;
	}
</script>

{#if open}
	<div class="ui-overlay">
		<dialog open class={`ui-dialog ${className}`} aria-modal="true" aria-labelledby="modal-title">
			<header class="ui-dialog__header">
				<h2 class="ui-dialog__title" id="modal-title">{title}</h2>
				<IconButton ariaLabel="Close dialog" onclick={close}>
					<X size={18} aria-hidden="true" />
				</IconButton>
			</header>
			<div class="ui-dialog__body">{@render children?.()}</div>
			{#if footer}<footer class="ui-dialog__footer">{@render footer()}</footer>{/if}
		</dialog>
	</div>
{/if}
