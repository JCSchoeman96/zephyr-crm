<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import QuoteEditor from '$lib/components/quotes/QuoteEditor.svelte';
	import type { DimensionValue } from '$lib/domain/products/dimensions';

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

	function optionalText(value: unknown) {
		return value === null || value === undefined ? null : String(value);
	}

	function optionalNumber(value: unknown) {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value !== 'string' || !value.trim()) return null;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function optionalDisplayValue(value: unknown): string | number | null {
		return typeof value === 'string' || typeof value === 'number' ? value : null;
	}

	function failureRehydrationDisplayItems() {
		const raw = failedValues()?.quote_failure_rehydration_catalogue_display;
		if (!raw) return [];
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function initialItems() {
		const raw = failedValues()?.items;
		if (raw) {
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					const displayItems = failureRehydrationDisplayItems();
					return parsed.map((submitted, index) => {
						const record =
							submitted && typeof submitted === 'object' && !Array.isArray(submitted)
								? (submitted as Record<string, unknown>)
								: {};
						const displayRecord =
							displayItems[index] &&
							typeof displayItems[index] === 'object' &&
							!Array.isArray(displayItems[index])
								? (displayItems[index] as Record<string, unknown>)
								: {};
						const displayValue = (name: string) =>
							Object.prototype.hasOwnProperty.call(displayRecord, name)
								? displayRecord[name]
								: record[name];
						return {
							name: String(record.name ?? ''),
							description: String(record.description ?? ''),
							quantity: String(record.quantity ?? '1'),
							unit_price: String(record.unit_price ?? '0'),
							taxable: typeof record.taxable === 'boolean' ? record.taxable : true,
							source_type: record.source_type === 'catalogue' ? 'catalogue' : 'custom',
							product_id: optionalText(record.product_id),
							product_lock_version: optionalNumber(record.product_lock_version),
							product_code_snapshot: optionalText(displayValue('product_code_snapshot')),
							unit_label_snapshot: optionalText(displayValue('unit_label_snapshot')),
							catalogue_unit_price: optionalDisplayValue(displayValue('catalogue_unit_price')),
							source_product_version: optionalNumber(displayValue('source_product_version')),
							source_product_reviewed_version: optionalNumber(
								displayValue('source_product_reviewed_version')
							),
							current_product_lock_version: optionalNumber(
								displayValue('current_product_lock_version')
							),
							is_stale:
								typeof displayValue('is_stale') === 'boolean'
									? (displayValue('is_stale') as boolean)
									: false,
							product_category_id_snapshot: optionalText(
								displayValue('product_category_id_snapshot')
							),
							product_category_code_snapshot: optionalText(
								displayValue('product_category_code_snapshot')
							),
							product_category_label_snapshot: optionalText(
								displayValue('product_category_label_snapshot')
							),
							dimensions: Array.isArray(record.dimensions)
								? (record.dimensions as DimensionValue[])
								: []
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
		productCategories={data.productCategories}
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
