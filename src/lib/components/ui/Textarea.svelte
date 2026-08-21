<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	type TextareaProps = Omit<HTMLTextareaAttributes, 'value'> & {
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
		class: className = '',
		...rest
	}: TextareaProps = $props();
</script>

<div class={`ui-field ${className}`}>
	<label class="ui-field__label" for={id}>{label}</label>
	<textarea
		class="ui-field__control"
		{id}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
		{...rest}></textarea>
	{#if hint && !error}
		<p class="ui-field__hint" id={`${id}-hint`}>{hint}</p>
	{/if}
	{#if error}
		<p class="ui-field__error" id={`${id}-error`}>{error}</p>
	{/if}
</div>
