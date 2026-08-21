<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	type SelectProps = Omit<HTMLSelectAttributes, 'value' | 'children'> & {
		id: string;
		label: string;
		value?: string;
		hint?: string;
		error?: string;
		children?: Snippet;
	};

	let {
		id,
		label,
		value = $bindable(''),
		hint,
		error,
		children,
		class: className = '',
		...rest
	}: SelectProps = $props();
</script>

<div class={`ui-field ${className}`}>
	<label class="ui-field__label" for={id}>{label}</label>
	<select
		class="ui-field__control"
		{id}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
		{...rest}
	>
		{@render children?.()}
	</select>
	{#if hint && !error}
		<p class="ui-field__hint" id={`${id}-hint`}>{hint}</p>
	{/if}
	{#if error}
		<p class="ui-field__error" id={`${id}-error`}>{error}</p>
	{/if}
</div>
