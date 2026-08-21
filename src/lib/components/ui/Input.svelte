<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type InputProps = Omit<HTMLInputAttributes, 'value'> & {
		id: string;
		label: string;
		value?: string;
		hint?: string;
		error?: string;
	};

	let {
		id,
		label,
		value = $bindable(''),
		hint,
		error,
		type = 'text',
		class: className = '',
		...rest
	}: InputProps = $props();
</script>

<div class={`ui-field ${className}`}>
	<label class="ui-field__label" for={id}>{label}</label>
	<input
		class="ui-field__control"
		{id}
		{type}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
		{...rest}
	/>
	{#if hint && !error}
		<p class="ui-field__hint" id={`${id}-hint`}>{hint}</p>
	{/if}
	{#if error}
		<p class="ui-field__error" id={`${id}-error`}>{error}</p>
	{/if}
</div>
