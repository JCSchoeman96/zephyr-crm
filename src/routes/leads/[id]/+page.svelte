<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	function stageTone(stage: string) {
		if (stage === 'WON') return 'success';
		if (stage === 'LOST') return 'danger';
		if (stage === 'DECISION') return 'warning';
		return 'info';
	}

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : '—';
	}
</script>

<svelte:head>
	<title>{data.lead.first_name} {data.lead.last_name} | Zephyr CRM</title>
	<meta name="description" content="Lead detail and tracer-bullet workflow" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email}>
	<a class="back-link" href={resolve('/leads')}>← Back to Leads</a>
	<PageHeader
		title={`${data.lead.first_name} ${data.lead.last_name}`}
		description={data.lead.email ?? 'Lead detail'}
	>
		{#snippet actions()}
			<Badge tone={stageTone(data.lead.pipeline_stage)}>{data.lead.pipeline_stage}</Badge>
		{/snippet}
	</PageHeader>

	{#if form?.message}<ErrorState
			title="Action could not be completed"
			message={form.message}
		/>{/if}

	<div class="detail-grid">
		<Card class="summary-card">
			<SectionHeader
				title="Lead details"
				description="Pipeline position and responsibility remain separate."
			/>
			<dl class="detail-list">
				<div>
					<dt>Lead number</dt>
					<dd>#{data.lead.lead_number}</dd>
				</div>
				<div>
					<dt>Email</dt>
					<dd>{data.lead.email ?? '—'}</dd>
				</div>
				<div>
					<dt>Phone</dt>
					<dd>{data.lead.phone ?? '—'}</dd>
				</div>
				<div>
					<dt>Company</dt>
					<dd>{data.lead.company ?? '—'}</dd>
				</div>
				<div>
					<dt>Attention</dt>
					<dd>{data.lead.attention_state}</dd>
				</div>
				<div>
					<dt>Lock version</dt>
					<dd>{data.lead.lock_version}</dd>
				</div>
			</dl>
			{#if data.lead.message}<p class="lead-message">{data.lead.message}</p>{/if}
		</Card>

		<Card>
			<SectionHeader
				title="Next workflow action"
				description="The server validates every state transition."
			/>
			<div class="action-stack">
				{#if data.lead.pipeline_stage === 'NEW'}
					<form method="POST" action="?/qualify">
						<input type="hidden" name="lock_version" value={data.lead.lock_version} /><Button
							type="submit">Qualify lead</Button
						>
					</form>
				{:else if data.lead.pipeline_stage === 'QUALIFICATION'}
					<form method="POST" action="?/proposal">
						<input type="hidden" name="lock_version" value={data.lead.lock_version} /><Button
							type="submit">Move to proposal</Button
						>
					</form>
				{:else if data.lead.pipeline_stage === 'PROPOSAL' && data.quotes.length === 0}
					<p class="action-note">Create a quote below to continue the tracer bullet.</p>
				{:else if data.lead.pipeline_stage === 'DECISION'}
					<form method="POST" action="?/win">
						<input type="hidden" name="lock_version" value={data.lead.lock_version} /><Button
							type="submit">Mark won and create Client</Button
						>
					</form>
				{:else if data.lead.pipeline_stage === 'WON'}
					<p class="success-note">Converted to Client {data.lead.converted_client_id}</p>
				{:else if data.lead.pipeline_stage === 'LOST'}
					<p class="action-note">This lead is terminal under ordinary operations.</p>
				{/if}
				{#if data.lead.pipeline_stage !== 'WON' && data.lead.pipeline_stage !== 'LOST'}
					<details class="lost-panel">
						<summary>Mark lead lost</summary>
						<form method="POST" action="?/lost" class="stack-form">
							<input type="hidden" name="lock_version" value={data.lead.lock_version} />
							<Select id="lost_reason_id" name="lost_reason_id" label="Lost reason" required>
								<option value="">Select a reason</option>
								{#each data.lostReasons as reason (reason.id)}<option value={reason.id}
										>{reason.label}</option
									>{/each}
							</Select>
							<Textarea id="lost_notes" name="lost_notes" label="Notes" rows={3} />
							<Button type="submit" variant="danger">Mark lost</Button>
						</form>
					</details>
				{/if}
			</div>
		</Card>
	</div>

	{#if data.lead.pipeline_stage === 'PROPOSAL' && data.quotes.length === 0}
		<Card class="quote-create-card">
			<SectionHeader
				title="Create a simple quote"
				description="The database calculates the authoritative totals."
			/>
			<form method="POST" action="?/createQuote" class="quote-form">
				<Input
					id="subject"
					name="subject"
					label="Subject"
					value="Quote for your enquiry"
					required
				/>
				<Input id="item_name" name="item_name" label="Line item" value="Services" required />
				<div class="form-row">
					<Input
						id="quantity"
						name="quantity"
						label="Quantity"
						type="number"
						min="0.01"
						step="0.01"
						value="1"
						required
					/>
					<Input
						id="unit_price"
						name="unit_price"
						label="Unit price (ZAR)"
						type="number"
						min="0"
						step="0.01"
						value="0"
						required
					/>
					<Input
						id="tax_rate"
						name="tax_rate"
						label="Tax rate (%)"
						type="number"
						min="0"
						max="100"
						step="0.01"
						value="0"
						required
					/>
				</div>
				<Button type="submit">Create quote</Button>
			</form>
		</Card>
	{/if}

	<Card>
		<SectionHeader
			title="Quotes"
			description="Quote records are durable and linked to this Lead."
		/>
		{#if data.quotes.length === 0}
			<EmptyState
				title="No quotes"
				message="A quote can be created once the lead reaches Proposal."
			/>
		{:else}
			<div class="quote-list">
				{#each data.quotes as quote (quote.id)}
					<div class="quote-row">
						<div>
							<strong>{quote.subject}</strong><span
								>#{quote.base_quote_number} · {quote.currency}
								{quote.total.toFixed(2)} · {quote.status}</span
							>
						</div>
						{#if quote.status === 'ready'}
							<form method="POST" action="?/sendQuote">
								<input type="hidden" name="quote_id" value={quote.id} /><input
									type="hidden"
									name="lock_version"
									value={quote.lock_version}
								/><Button type="submit" size="sm">Send quote</Button>
							</form>
						{:else if quote.status === 'sent'}
							<Badge tone="success">Submitted</Badge>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</Card>

	<div class="lower-grid">
		<Card>
			<SectionHeader
				title="Follow-up tasks"
				description="An open task determines the next action."
			/>
			{#if data.tasks.length === 0}<p class="muted">No tasks yet.</p>{:else}<ul class="plain-list">
					{#each data.tasks as task (task.id)}<li>
							<strong>{task.title}</strong><span>{task.status} · {dateTime(task.due_at)}</span>
						</li>{/each}
				</ul>{/if}
		</Card>
		<Card>
			<SectionHeader title="Activity" description="Material actions are append-only evidence." />
			{#if data.activities.length === 0}<p class="muted">No activity yet.</p>{:else}<ol
					class="activity-list"
				>
					{#each data.activities as activity (activity.id)}<li>
							<strong>{activity.summary}</strong><span
								>{activity.event_type} · {dateTime(activity.occurred_at)}</span
							>
						</li>{/each}
				</ol>{/if}
		</Card>
	</div>
</AppShell>

<style>
	.back-link {
		display: inline-block;
		margin-bottom: var(--space-md);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-decoration: none;
	}
	.back-link:hover {
		color: var(--color-brand-primary);
	}
	.detail-grid,
	.lower-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-lg);
	}
	.detail-grid {
		margin-bottom: var(--space-lg);
	}
	:global(.summary-card) {
		min-height: 18rem;
	}
	.detail-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
	}
	.detail-list div {
		display: flex;
		justify-content: space-between;
		gap: var(--space-lg);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.detail-list dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.detail-list dd {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-sm);
		text-align: right;
	}
	.lead-message {
		margin: var(--space-lg) 0 0;
		padding: var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-background-muted);
		color: var(--color-text-muted);
		white-space: pre-wrap;
	}
	.action-stack,
	.stack-form,
	.quote-form {
		display: grid;
		gap: var(--space-md);
	}
	.action-note,
	.success-note,
	.muted {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.success-note {
		color: var(--color-success);
	}
	.lost-panel {
		margin-top: var(--space-lg);
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-border-subtle);
	}
	.lost-panel summary {
		color: var(--color-danger);
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.stack-form {
		margin-top: var(--space-lg);
	}
	:global(.quote-create-card),
	.lower-grid,
	.quote-list {
		margin-top: var(--space-lg);
	}
	.form-row {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-md);
	}
	.quote-list {
		display: grid;
		gap: var(--space-sm);
	}
	.quote-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-lg);
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
	}
	.quote-row strong,
	.quote-row span,
	.plain-list span,
	.activity-list span {
		display: block;
	}
	.quote-row span,
	.plain-list span,
	.activity-list span {
		margin-top: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.plain-list,
	.activity-list {
		display: grid;
		gap: var(--space-md);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.plain-list li,
	.activity-list li {
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.activity-list {
		counter-reset: activity;
	}
	.activity-list li {
		counter-increment: activity;
	}
	@media (max-width: 760px) {
		.detail-grid,
		.lower-grid {
			grid-template-columns: 1fr;
		}
		.form-row {
			grid-template-columns: 1fr;
		}
		.quote-row {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
