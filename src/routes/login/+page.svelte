<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Input from '$lib/components/ui/Input.svelte';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in | Zephyr CRM</title>
	<meta name="description" content="Sign in to the invitation-only Zephyr CRM workspace" />
</svelte:head>

<main class="auth-page">
	<section class="auth-card" aria-labelledby="auth-title">
		<a class="auth-card__brand" href={resolve('/')}>Zephyr CRM</a>
		<h1 id="auth-title">Sign in to Zephyr CRM</h1>
		<p class="auth-card__intro">Use the credentials from your staff invitation.</p>
		{#if form?.message}
			<ErrorState title="Unable to sign in" message={form.message} />
		{/if}
		<form method="POST" class="auth-form">
			<Input
				id="email"
				name="email"
				type="email"
				label="Email address"
				autocomplete="email"
				required
			/>
			<Input
				id="password"
				name="password"
				type="password"
				label="Password"
				autocomplete="current-password"
				required
			/>
			<Button type="submit">Sign in</Button>
		</form>
		<p class="auth-card__note">
			Accounts are created by invitation. Public self-registration is disabled.
		</p>
	</section>
</main>

<style>
	.auth-page {
		display: grid;
		min-height: 100vh;
		padding: var(--space-xl);
		box-sizing: border-box;
		place-items: center;
		background: var(--color-background);
	}

	.auth-card {
		display: grid;
		width: min(100%, 28rem);
		gap: var(--space-lg);
		padding: var(--space-3xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-md);
	}

	.auth-card__brand {
		color: var(--color-brand-primary);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		text-decoration: none;
	}

	.auth-card h1,
	.auth-card p {
		margin: 0;
	}

	.auth-card h1 {
		font-size: var(--font-size-xl);
		line-height: var(--line-height-tight);
	}

	.auth-card__intro,
	.auth-card__note {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.auth-form {
		display: grid;
		gap: var(--space-lg);
		margin-top: var(--space-sm);
	}

	.auth-card__note {
		font-size: var(--font-size-xs);
	}

	@media (max-width: 480px) {
		.auth-page {
			padding: var(--space-lg);
		}

		.auth-card {
			padding: var(--space-xl);
		}
	}
</style>
