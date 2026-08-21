<script lang="ts">
	type StatTone = 'neutral' | 'success' | 'warning' | 'danger';

	let {
		label,
		value,
		detail,
		tone = 'neutral',
		class: className = ''
	}: { label: string; value: string; detail?: string; tone?: StatTone; class?: string } = $props();
</script>

<article class={`ui-card ui-stat-card ${className}`} data-tone={tone}>
	<p class="ui-stat-card__label">{label}</p>
	<p class="ui-stat-card__value">{value}</p>
	{#if detail}<p class="ui-stat-card__detail">{detail}</p>{/if}
</article>
