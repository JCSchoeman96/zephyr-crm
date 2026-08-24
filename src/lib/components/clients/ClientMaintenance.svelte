<script lang="ts">
	import type { Database } from '$lib/types/database';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	type Client = Database['public']['Tables']['clients']['Row'];
	type Props = {
		client: Client;
		profile: Pick<Database['public']['Tables']['profiles']['Row'], 'role'>;
	};

	let { client, profile }: Props = $props();
	const canMutate = $derived(profile.role !== 'viewer' && client.status !== 'archived');
	const canArchive = $derived(['owner', 'admin'].includes(profile.role));
</script>

<Card class="maintenance-card">
	<SectionHeader
		title="Client maintenance"
		description="Updates use the trusted Client boundary and the current lock version. Conversion provenance cannot be edited."
	/>
	{#if canMutate}
		<form method="POST" action="?/update" class="maintenance-form">
			<input type="hidden" name="lock_version" value={client.lock_version} />
			<Select id="client-edit-type" name="type" label="Type" value={client.type} required>
				<option value="individual">Individual</option><option value="company">Company</option>
			</Select>
			<Input
				id="client-edit-display"
				name="display_name"
				label="Display name"
				value={client.display_name}
				required
			/>
			<Input
				id="client-edit-company"
				name="company_name"
				label="Company name"
				value={client.company_name ?? ''}
			/>
			<Input
				id="client-edit-email"
				name="email"
				label="Email"
				type="email"
				value={client.email ?? ''}
			/>
			<Input id="client-edit-phone" name="phone" label="Phone" value={client.phone ?? ''} />
			<Input
				id="client-edit-tax"
				name="tax_number"
				label="Tax number"
				value={client.tax_number ?? ''}
			/>
			<Input
				id="client-edit-registration"
				name="registration_number"
				label="Registration number"
				value={client.registration_number ?? ''}
			/>
			<Input
				id="client-edit-address-1"
				name="billing_address_line_1"
				label="Billing address"
				value={client.billing_address_line_1 ?? ''}
			/>
			<Input
				id="client-edit-address-2"
				name="billing_address_line_2"
				label="Address line 2"
				value={client.billing_address_line_2 ?? ''}
			/>
			<Input
				id="client-edit-city"
				name="billing_city"
				label="City"
				value={client.billing_city ?? ''}
			/>
			<Input
				id="client-edit-region"
				name="billing_region"
				label="Region"
				value={client.billing_region ?? ''}
			/>
			<Input
				id="client-edit-postal"
				name="billing_postal_code"
				label="Postal code"
				value={client.billing_postal_code ?? ''}
			/>
			<Input
				id="client-edit-country"
				name="billing_country"
				label="Country"
				value={client.billing_country ?? ''}
			/>
			<div class="form-actions"><Button type="submit" size="sm">Save Client details</Button></div>
		</form>
	{:else}
		<p class="muted">Archived Clients are read-only.</p>
	{/if}
	<div class="status-actions">
		<strong>Lifecycle status: {client.status}</strong>
		{#if canMutate}
			<form method="POST" action="?/status" class="status-form">
				<input type="hidden" name="lock_version" value={client.lock_version} />
				<Select id="client-next-status" name="status" label="Change status" value={client.status}>
					<option value="active">Active</option><option value="inactive">Inactive</option>
					{#if canArchive}<option value="archived">Archived</option>{/if}
				</Select>
				<Input
					id="client-status-reason"
					name="reason"
					label="Reason (required for archive/restore)"
				/>
				<Button type="submit" size="sm" variant={canArchive ? 'secondary' : 'primary'}>
					Save status
				</Button>
			</form>
		{/if}
	</div>
</Card>

<style>
	:global(.maintenance-card) {
		margin-bottom: var(--space-lg);
	}
	.maintenance-form {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: end;
		gap: var(--space-md);
	}
	.form-actions {
		display: flex;
		align-items: end;
		min-height: 2.7rem;
	}
	.status-actions {
		display: grid;
		gap: var(--space-sm);
		margin-top: var(--space-lg);
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-border-subtle);
	}
	.status-form {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	@media (max-width: 760px) {
		.maintenance-form {
			grid-template-columns: 1fr;
		}
	}
</style>
