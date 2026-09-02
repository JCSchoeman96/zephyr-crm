<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import QuoteEditor from '$lib/components/quotes/QuoteEditor.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function defaultValidUntil(validityDays: number) {
		const timestamp = Date.now() + validityDays * 24 * 60 * 60 * 1000;
		return new Date(timestamp).toISOString().slice(0, 10);
	}

	function failedValues() {
		return form && 'values' in form && form.values ? (form.values as Record<string, string>) : null;
	}

	function formValue(name: string, fallback: string) {
		return failedValues()?.[name] ?? fallback;
	}

	function initialItems() {
		const raw = failedValues()?.items;
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					return parsed.map((submitted) => {
						const record =
							submitted && typeof submitted === 'object' && !Array.isArray(submitted)
								? (submitted as Record<string, unknown>)
								: {};
						return {
							name: String(record.name ?? ''),
							description: String(record.description ?? ''),
							quantity: String(record.quantity ?? '1'),
							unit_price: String(record.unit_price ?? '0'),
							taxable: typeof record.taxable === 'boolean' ? record.taxable : true,
							dimensions: []
						};
					});
				}
			} catch {
				// QuoteEditor will keep its initial row when the submitted JSON is malformed.
			}
		}
		return [];
	}
</script>

<svelte:head><title>New Quote | Zephyr CRM</title></svelte:head>
<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/quotes')}>← Back to Quotes</a>
	<PageHeader
		title="New quote"
		description="Build a quote for an enquiry that is ready for pricing."
	/>
	{#if form?.message}<ErrorState title="Quote could not be saved" message={form.message} />{/if}
	<QuoteEditor
		action="?/save"
		leadId={formValue('lead_id', data.selectedLeadId)}
		leadOptions={data.leads}
		clientOptions={data.clients}
		clientId={formValue('client_id', '')}
		subject={formValue('subject', '')}
		introduction={formValue('introduction', '')}
		terms={formValue('terms', data.quoteDefaults.terms)}
		taxLabel={formValue('tax_label', data.quoteDefaults.tax_label)}
		taxRate={formValue('tax_rate', String(data.quoteDefaults.tax_rate))}
		validUntil={formValue('valid_until', defaultValidUntil(data.quoteDefaults.validity_days))}
		currency={formValue('currency', 'ZAR')}
		initialItems={initialItems()}
		errorMessage={form?.message ?? ''}
	/>
</AppShell>
