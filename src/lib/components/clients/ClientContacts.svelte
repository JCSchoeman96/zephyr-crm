<script lang="ts">
	import type { Database } from '$lib/types/database';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';

	type Contact = Database['public']['Tables']['client_contacts']['Row'];
	type Props = {
		clientStatus: string;
		contacts: Contact[];
		profileRole: string;
	};

	let { clientStatus, contacts, profileRole }: Props = $props();
	const canMutate = $derived(profileRole !== 'viewer' && clientStatus !== 'archived');

	function contactTone(status: string) {
		return status === 'active' ? 'success' : 'neutral';
	}
</script>

<Card>
	<SectionHeader
		title="Contacts"
		description="A customer may have multiple contacts; at most one is primary."
	/>
	{#if canMutate}
		<form method="POST" action="?/contactCreate" class="contact-create-form">
			<h3>Add contact</h3>
			<Input id="contact-first-name" name="first_name" label="First name" required />
			<Input id="contact-last-name" name="last_name" label="Last name" />
			<Input id="contact-email" name="email" label="Email" type="email" />
			<Input id="contact-phone" name="phone" label="Phone" />
			<Input id="contact-job-title" name="job_title" label="Job title" />
			<label class="checkbox-label"
				><input type="checkbox" name="is_primary" /> Primary contact</label
			>
			<Button type="submit" size="sm">Add contact</Button>
		</form>
	{/if}
	{#if contacts.length === 0}
		<EmptyState title="No contacts" message="No contact records are attached to this customer." />
	{:else}
		<div class="contacts-table-wrap">
			<table class="contacts-table">
				<caption class="sr-only">Client contacts</caption>
				<thead>
					<tr>
						<th scope="col">Name</th><th scope="col">Contact</th><th scope="col">Role</th><th
							scope="col">Status</th
						><th scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each contacts as contact (contact.id)}
						<tr>
							<td>{contact.first_name} {contact.last_name}</td>
							<td>{contact.email ?? contact.phone ?? 'No contact detail'}</td>
							<td>{contact.job_title ?? '—'}</td>
							<td>
								<Badge tone={contactTone(contact.status)}>{contact.status}</Badge>
								{#if contact.is_primary}<Badge tone="primary">Primary</Badge>{/if}
							</td>
							<td>
								{#if canMutate}
									{#if contact.status === 'active'}
										<form method="POST" action="?/contactUpdate" class="contact-edit-form">
											<input type="hidden" name="contact_id" value={contact.id} />
											<input
												type="hidden"
												name="contact_lock_version"
												value={contact.lock_version}
											/>
											<Input
												id={`contact-first-${contact.id}`}
												name="first_name"
												label="First name"
												value={contact.first_name}
												required
											/>
											<Input
												id={`contact-last-${contact.id}`}
												name="last_name"
												label="Last name"
												value={contact.last_name}
											/>
											<Input
												id={`contact-email-${contact.id}`}
												name="email"
												label="Email"
												type="email"
												value={contact.email ?? ''}
											/>
											<Input
												id={`contact-phone-${contact.id}`}
												name="phone"
												label="Phone"
												value={contact.phone ?? ''}
											/>
											<Input
												id={`contact-role-${contact.id}`}
												name="job_title"
												label="Job title"
												value={contact.job_title ?? ''}
											/>
											<Button type="submit" size="sm" variant="secondary">Save contact</Button>
										</form>
									{/if}
									<div class="contact-actions">
										{#if contact.status === 'active' && !contact.is_primary}
											<form method="POST" action="?/contactPrimary">
												<input type="hidden" name="contact_id" value={contact.id} />
												<input
													type="hidden"
													name="contact_lock_version"
													value={contact.lock_version}
												/>
												<Button type="submit" size="sm" variant="ghost">Make primary</Button>
											</form>
										{/if}
										<form method="POST" action="?/contactStatus">
											<input type="hidden" name="contact_id" value={contact.id} />
											<input
												type="hidden"
												name="contact_lock_version"
												value={contact.lock_version}
											/>
											<input
												type="hidden"
												name="status"
												value={contact.status === 'active' ? 'inactive' : 'active'}
											/>
											<Button type="submit" size="sm" variant="ghost">
												{contact.status === 'active' ? 'Set inactive' : 'Set active'}
											</Button>
										</form>
									</div>
								{:else}<span class="muted">Read-only</span>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Card>

<style>
	.contacts-table-wrap {
		overflow-x: auto;
	}
	.contacts-table {
		width: 100%;
		border-collapse: collapse;
	}
	.contacts-table th,
	.contacts-table td {
		padding: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		font-size: var(--font-size-sm);
	}
	.contacts-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.contacts-table td {
		color: var(--color-text-muted);
	}
	.contacts-table td:first-child {
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}
	.contact-create-form {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		align-items: end;
		gap: var(--space-md);
		margin: var(--space-lg) 0;
		padding: var(--space-lg);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
	}
	.contact-create-form h3 {
		grid-column: 1 / -1;
		margin: 0;
		font-size: var(--font-size-md);
	}
	.contact-edit-form {
		display: grid;
		gap: var(--space-xs);
		min-width: 15rem;
	}
	.contact-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		margin-top: var(--space-sm);
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		min-height: 2.7rem;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 760px) {
		.contact-create-form {
			grid-template-columns: 1fr;
		}
		.contact-create-form h3 {
			grid-column: auto;
		}
	}
</style>
