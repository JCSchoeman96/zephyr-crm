<script lang="ts">
	import { resolve } from '$app/paths';
	import { enquiryNextStep } from '$lib/domain/presentation/enquiry-next-step';
	import { followUpLabel, leadStageMeaning } from '$lib/domain/presentation/labels';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import type {
		LeadDetailCurrentQuote,
		LeadDetailFulfilment,
		LeadDetailLead,
		LeadDetailQuote,
		LeadDetailStaff
	} from '$lib/domain/leads/detail-types';

	let {
		lead,
		currentQuote,
		currentQuoteRecord,
		fulfilments,
		staff,
		nextStep,
		canMutate,
		profileRole,
		dateTimeHint
	}: {
		lead: LeadDetailLead;
		currentQuote: LeadDetailCurrentQuote | null;
		currentQuoteRecord: LeadDetailQuote | null;
		fulfilments: LeadDetailFulfilment[];
		staff: LeadDetailStaff[];
		nextStep: ReturnType<typeof enquiryNextStep>;
		canMutate: boolean;
		profileRole: string;
		dateTimeHint: string;
	} = $props();

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : 'No activity recorded';
	}

	function money(value: number | string | null) {
		if (value === null) return '—';
		const [whole, fraction = ''] = String(value).split('.');
		return `${whole}.${(fraction + '00').slice(0, 2)}`;
	}
</script>

<aside class="context-rail" aria-label="Enquiry context and next step">
	<Card class="next-step-card">
		<div class="eyebrow">Next step</div>
		<h2>
			{#if lead.paused_at}
				Continue this enquiry
			{:else if nextStep === 'review'}
				Review the enquiry
			{:else if nextStep === 'qualify'}
				Confirm details for pricing
			{:else if nextStep === 'create_quote'}
				Prepare a quote
			{:else if nextStep === 'respond'}
				Record the customer's response
			{:else if nextStep === 'handoff'}
				Continue with fulfilment
			{:else if nextStep === 'closed'}
				Enquiry closed
			{:else}
				Open the current quote
			{/if}
		</h2>
		<p class="next-step-description">
			{lead.paused_at
				? (lead.pause_reason ?? 'This enquiry is on hold.')
				: leadStageMeaning(lead.pipeline_stage)}
		</p>

		{#if nextStep === 'handoff'}
			<div class="action-stack">
				{#if lead.converted_client_id}<a
						class="ui-button ui-button--primary ui-button--md"
						href={resolve(`/clients/${lead.converted_client_id}`)}>Open customer</a
					>{/if}
				{#each fulfilments as fulfilment (fulfilment.id)}<a
						class="ui-button ui-button--secondary ui-button--md"
						href={resolve(`/fulfilment/${fulfilment.id}`)}>Open fulfilment</a
					>{/each}
			</div>
		{:else if nextStep === 'closed'}
			<p class="closed-note">This enquiry is marked as not proceeding.</p>
		{:else if canMutate}
			{#if nextStep === 'resume'}
				<form method="POST" action="?/resume">
					<input type="hidden" name="lock_version" value={lead.lock_version} />
					<Button type="submit">Continue enquiry</Button>
				</form>
			{:else if nextStep === 'review'}
				<form method="POST" action="?/qualify">
					<input type="hidden" name="lock_version" value={lead.lock_version} />
					<Button type="submit">Review enquiry</Button>
				</form>
			{:else if nextStep === 'qualify'}
				<form method="POST" action="?/proposal" class="stack-form">
					<input type="hidden" name="lock_version" value={lead.lock_version} />
					<Textarea
						id="qualification-notes"
						name="qualification_notes"
						label="Qualification notes"
						value={lead.qualification_notes ?? ''}
						rows={3}
						hint="Record the requirements and details you confirmed."
					/>
					<Button type="submit">Ready for quote</Button>
				</form>
			{:else if nextStep === 'create_quote'}
				<a
					class="ui-button ui-button--primary ui-button--md"
					href={resolve(`/quotes/new?lead_id=${lead.id}`)}>Create quote</a
				>
			{:else if currentQuote}
				<a
					class="ui-button ui-button--primary ui-button--md"
					href={resolve(`/quotes/${currentQuote.id}`)}
					>{nextStep === 'respond' ? 'Record customer response' : 'Open quote'}</a
				>
			{:else}
				<p class="muted">The current quote is unavailable. Reload this record before continuing.</p>
			{/if}
		{:else}
			<p class="read-only-note">
				You can view this enquiry, but you do not have permission to change it.
			</p>
			{#if currentQuote}<a href={resolve(`/quotes/${currentQuote.id}`)}>Open quote</a>{/if}
		{/if}
	</Card>

	<Card class="context-card">
		<SectionHeader title="Current status" description="The latest position for this enquiry." />
		<div class="status-stack">
			<div>
				<span class="field-label">Pipeline</span>
				<strong>{leadStageMeaning(lead.pipeline_stage)}</strong>
			</div>
			<div>
				<span class="field-label">Follow-up</span>
				<strong>{followUpLabel(lead.attention_state)}</strong>
			</div>
			<div>
				<span class="field-label">Assigned to</span>
				<strong>{lead.assigned_to ? 'Assigned staff member' : 'Unassigned'}</strong>
			</div>
			<div>
				<span class="field-label">Latest activity</span>
				<strong>{dateTime(lead.last_activity_at ?? lead.updated_at)}</strong>
			</div>
		</div>
	</Card>

	<Card class="context-card">
		<SectionHeader
			title="Enquiry details"
			description="At a glance: the facts most useful while working this enquiry."
		/>
		<dl class="glance-list">
			<div>
				<dt>Reference</dt>
				<dd>#{lead.lead_number}</dd>
			</div>
			<div>
				<dt>Email</dt>
				<dd>{lead.email ?? '—'}</dd>
			</div>
			<div>
				<dt>Phone</dt>
				<dd>{lead.phone ?? '—'}</dd>
			</div>
			<div>
				<dt>Company</dt>
				<dd>{lead.company ?? '—'}</dd>
			</div>
			{#if currentQuoteRecord}<div>
					<dt>Current quote</dt>
					<dd>
						{currentQuoteRecord.quote_number ?? `#${currentQuoteRecord.base_quote_number}`} · {currentQuoteRecord.currency}
						{money(currentQuoteRecord.total)}
					</dd>
				</div>{/if}
		</dl>
	</Card>

	<details class="management-disclosure">
		<summary>Responsibility and other actions</summary>
		<Card class="context-card">
			<SectionHeader
				title="Record maintenance"
				description="Change responsibility or pause the enquiry when needed."
			/>
			<div class="management-grid">
				{#if canMutate}
					<form method="POST" action="?/assign" class="stack-form">
						<input type="hidden" name="lock_version" value={lead.lock_version} />
						<Select
							id="assigned_to"
							name="assigned_to"
							label="Person responsible"
							value={lead.assigned_to ?? ''}
						>
							<option value="">Unassigned</option>
							{#each staff as member (member.id)}<option value={member.id}
									>{member.full_name || member.email} · {member.role}</option
								>{/each}
						</Select>
						<Button type="submit" size="sm">Save responsibility</Button>
					</form>
					{#if lead.pipeline_stage !== 'WON' && lead.pipeline_stage !== 'LOST'}
						<form method="POST" action="?/setAttention" class="stack-form">
							<input type="hidden" name="lock_version" value={lead.lock_version} />
							<Select
								id="attention_state"
								name="attention_state"
								label="Follow-up status"
								value={lead.attention_state}
							>
								<option value="none">No follow-up needed</option>
								<option value="waiting_on_client">Waiting for customer</option>
								<option value="waiting_on_us">We need to respond</option>
							</Select>
							<Button type="submit" size="sm">Save status</Button>
						</form>
						{#if !lead.paused_at}<form method="POST" action="?/pause" class="stack-form">
								<input type="hidden" name="lock_version" value={lead.lock_version} />
								<Textarea
									id="pause_reason"
									name="pause_reason"
									label="Why is it on hold?"
									rows={2}
									required
								/>
								<Input
									id="resume_at"
									name="resume_at"
									label="Continue on (optional)"
									type="datetime-local"
									hint={dateTimeHint}
								/>
								<Button type="submit" size="sm">Put enquiry on hold</Button>
							</form>{/if}
					{/if}
					{#if lead.pipeline_stage === 'LOST' && (profileRole === 'owner' || profileRole === 'admin')}
						<form method="POST" action="?/reopen" class="stack-form">
							<input type="hidden" name="lock_version" value={lead.lock_version} />
							<Textarea
								id="reopen_reason"
								name="reopen_reason"
								label="Why are you reopening it?"
								rows={2}
								required
							/>
							<Button type="submit" size="sm">Reopen enquiry</Button>
						</form>
					{/if}
				{:else}
					<p class="read-only-note">
						You can view this enquiry, but you do not have permission to change it.
					</p>
				{/if}
			</div>
		</Card>
	</details>
</aside>

<style>
	.context-rail,
	.stack-form,
	.action-stack,
	.status-stack,
	.glance-list,
	.management-grid {
		display: grid;
		gap: var(--space-lg);
	}
	:global(.next-step-card) {
		border-color: color-mix(in srgb, var(--color-brand-primary) 36%, var(--color-border));
		background: color-mix(in srgb, var(--color-brand-primary) 5%, var(--color-surface));
	}
	.eyebrow,
	.field-label {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	:global(.next-step-card h2) {
		margin: var(--space-sm) 0;
		color: var(--color-text);
		font-size: var(--font-size-xl);
		line-height: var(--line-height-tight);
	}
	.next-step-description,
	.muted,
	.read-only-note {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.status-stack > div {
		display: grid;
		gap: var(--space-xs);
	}
	.status-stack strong,
	.glance-list dd {
		color: var(--color-text);
		font-size: var(--font-size-sm);
	}
	.glance-list {
		margin: 0;
	}
	.glance-list div {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border);
	}
	.glance-list dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.glance-list dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.management-disclosure > summary {
		padding: var(--space-sm) 0;
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.management-grid {
		grid-template-columns: 1fr;
	}
	@media (min-width: 48rem) {
		.management-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
