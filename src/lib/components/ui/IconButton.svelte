<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type IconButtonProps = Omit<HTMLButtonAttributes, 'children' | 'type'> & {
		ariaLabel: string;
		size?: 'small' | 'default';
		type?: HTMLButtonAttributes['type'];
		children?: Snippet;
	};

	let {
		ariaLabel,
		size = 'default',
		type = 'button',
		disabled = false,
		children,
		class: className = '',
		...rest
	}: IconButtonProps = $props();
</script>

<button
	class={`ui-icon-button ${size === 'small' ? 'ui-icon-button--small' : ''} ${className}`}
	{type}
	{disabled}
	aria-label={ariaLabel}
	{...rest}
>
	{@render children?.()}
</button>
