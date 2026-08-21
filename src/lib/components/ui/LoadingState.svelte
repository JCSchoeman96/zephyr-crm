<script lang="ts">
	let { message = 'Loading', class: className = '' }: { message?: string; class?: string } =
		$props();
</script>

<div
	class={`ui-state ui-state--loading ${className}`}
	role="status"
	aria-live="polite"
	aria-busy="true"
>
	<p class="ui-state__message">{message}</p>
</div>
