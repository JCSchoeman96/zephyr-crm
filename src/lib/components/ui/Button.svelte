<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
	type ButtonSize = 'sm' | 'md' | 'lg';
	type ButtonProps = Omit<HTMLButtonAttributes, 'children' | 'type'> & {
		variant?: ButtonVariant;
		size?: ButtonSize;
		type?: HTMLButtonAttributes['type'];
		ariaLabel?: string;
		children?: Snippet;
	};

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		ariaLabel,
		children,
		class: className = '',
		...rest
	}: ButtonProps = $props();
</script>

<button
	class={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
	{type}
	{disabled}
	aria-label={ariaLabel}
	{...rest}
>
	{@render children?.()}
</button>
