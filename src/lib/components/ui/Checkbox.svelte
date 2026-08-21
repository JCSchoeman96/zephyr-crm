<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type CheckboxProps = Omit<HTMLInputAttributes, 'type' | 'checked'> & {
		id: string;
		label: string;
		checked?: boolean;
		error?: string;
	};

	let {
		id,
		label,
		checked = $bindable(false),
		error,
		class: className = '',
		...rest
	}: CheckboxProps = $props();
</script>

<div class={className}>
	<label class="ui-checkbox" for={id}>
		<input {id} type="checkbox" bind:checked aria-invalid={error ? 'true' : undefined} {...rest} />
		<span>{label}</span>
	</label>
	{#if error}
		<span class="ui-checkbox__error">{error}</span>
	{/if}
</div>
