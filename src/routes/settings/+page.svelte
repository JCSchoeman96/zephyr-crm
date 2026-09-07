<script lang="ts">
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Settings | Zephyr CRM</title>
	<meta name="description" content="Business configuration for quotes and defaults" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.profile.role} context="Settings">
	<PageHeader
		title="Settings"
		description="Configure the quote and business defaults your team uses every day."
	/>
	{#if form?.message}<ErrorState
			title="Quote defaults could not be saved"
			message={form.message}
		/>{/if}
	{#if data.saved}<p class="save-note" data-tone="success">Quote defaults saved.</p>{/if}

	<Card title="Quote defaults" class="settings-card">
		<p class="settings-intro">
			These defaults apply to new quotes. They are captured when a quote is reviewed for sending.
			Saving requires your current MFA verification.
		</p>
		<form method="POST" action="?/saveQuoteDefaults" class="settings-form">
			<div class="settings-grid">
				<Input
					id="quote-prefix"
					name="prefix"
					label="Quote prefix"
					value={data.quoteDefaults.prefix}
					maxlength={12}
					required
				/>
				<Input
					id="quote-tax-label"
					name="tax_label"
					label="Tax label"
					value={data.quoteDefaults.tax_label}
					maxlength={40}
				/>
				<Input
					id="quote-tax-rate"
					name="tax_rate"
					label="Tax rate (%)"
					type="number"
					min="0"
					max="100"
					step="0.000001"
					value={String(data.quoteDefaults.tax_rate)}
					required
				/>
				<Input
					id="quote-validity-days"
					name="validity_days"
					label="Validity (days)"
					type="number"
					min="1"
					max="365"
					step="1"
					value={String(data.quoteDefaults.validity_days)}
					required
				/>
			</div>
			<Textarea
				id="quote-default-terms"
				name="terms"
				label="Terms"
				rows={4}
				maxlength={10000}
				value={data.quoteDefaults.terms}
			/>
			<Textarea
				id="quote-default-bank-details"
				name="bank_details"
				label="Bank details"
				rows={4}
				maxlength={5000}
				hint="Optional customer-facing payment instructions. Do not enter secrets or credentials."
				value={data.quoteDefaults.bank_details}
			/>
			<Button type="submit">Save Quote defaults</Button>
		</form>
	</Card>
</AppShell>

<style>
	.save-note {
		margin: 0 0 var(--space-lg);
		color: var(--color-success);
	}
	.settings-intro {
		margin: 0 0 var(--space-lg);
		color: var(--color-text-muted);
	}
	.settings-form {
		display: grid;
		gap: var(--space-lg);
	}
	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
	}
	@media (max-width: 40rem) {
		.settings-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
