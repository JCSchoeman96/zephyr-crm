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
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';
	import {
		formatLeadRequestValue,
		parseLeadRequestMessage,
		shouldExpandLeadRequestDetails
	} from '$lib/domain/leads/request-details';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canMutate = $derived(data.profile.role !== 'viewer');
	const leadRequestDetails = $derived(parseLeadRequestMessage(data.lead.message));
	const leadRequestOpenAll = $derived(
		shouldExpandLeadRequestDetails({
			createdAt: data.lead.created_at,
			lastActivityAt: data.lead.last_activity_at,
			pipelineStage: data.lead.pipeline_stage
		})
	);

	function stageTone(stage: string) {
		if (stage === 'WON') return 'success';
		if (stage === 'LOST') return 'danger';
		if (stage === 'DECISION') return 'warning';
		return 'info';
	}

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : '—';
	}

	function money(value: number | string) {
		const normalized = String(value);
		const [whole, fraction = ''] = normalized.split('.');
		return `${whole}.${(fraction + '00').slice(0, 2)}`;
	}

	function quoteNumber(quote: PageData['quotes'][number]) {
		return quote.quote_number ?? `#${quote.base_quote_number}`;
	}

	function actionErrorTitle(message: string | undefined) {
		return message?.startsWith('Conflict:')
			? 'Conflict — reload before saving'
			: 'Action could not be completed';
	}
</script>

<svelte:head>
	<title>{data.lead.first_name} {data.lead.last_name} | Zephyr CRM</title>
	<meta name="description" content="Lead detail and tracer-bullet workflow" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/leads')}>← Back to Leads</a>
	<PageHeader
		title={`${data.lead.first_name} ${data.lead.last_name}`}
		description={data.lead.email ?? 'Lead detail'}
	>
		{#snippet actions()}
			<RealtimeStatus scope={`lead-${data.lead.id}`} tables={['leads', 'quotes', 'tasks']} />
			<Badge tone={stageTone(data.lead.pipeline_stage)}>{data.lead.pipeline_stage}</Badge>
		{/snippet}
	</PageHeader>
	<nav class="detail-nav" aria-label="Lead detail sections">
		<a href={resolve(`/leads/${data.lead.id}#overview`)}>Overview</a>
		<a href={resolve(`/leads/${data.lead.id}#quotes`)}>Quotes</a>
		<a href={resolve(`/leads/${data.lead.id}#tasks`)}>Tasks</a>
		<a href={resolve(`/leads/${data.lead.id}#activity`)}>Activity</a>
	</nav>

	{#if form?.message}<ErrorState
			title={actionErrorTitle(form.message)}
			message={form.message}
		/>{/if}

	<div id="overview" class="anchor-section">
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
			</Card>

			<Card>
				<SectionHeader
					title="Next workflow action"
					description="The server validates every state transition."
				/>
				<div class="action-stack">
					{#if canMutate}
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
					{:else}
						<p class="read-only-note">Viewer access is read-only.</p>
					{/if}
				</div>
			</Card>
		</div>

		{#if leadRequestDetails.hasStructuredFields}
			<Card class="lead-request-card">
				<SectionHeader
					title="Request details"
					description="Captured from the quote request form."
				/>
				<div class="lead-request-groups" aria-label="Captured request details">
					{#each leadRequestDetails.groups as group, index (group.key)}
						<details
							class={`lead-request-group lead-request-group--${group.key}`}
							open={leadRequestOpenAll || index === 0}
						>
							<summary>
								<span class="lead-request-group__summary">
									<strong>{group.title}</strong>
									{#if group.summary}<span>{group.summary}</span>{/if}
								</span>
							</summary>
							{#if group.key === 'notes'}
								<p class="lead-request-note">{leadRequestDetails.notes}</p>
							{:else}
								<dl class="lead-request-fields">
									{#each group.fields as field (field.key)}
										<div>
											<dt>{field.label}</dt>
											<dd>{formatLeadRequestValue(field.key, field.value)}</dd>
										</div>
									{/each}
								</dl>
							{/if}
						</details>
					{/each}
				</div>
			</Card>
		{:else if leadRequestDetails.fallbackMessage}
			<Card class="lead-request-card">
				<p class="lead-message">{leadRequestDetails.fallbackMessage}</p>
			</Card>
		{/if}
	</div>

	{#if canMutate && data.lead.pipeline_stage === 'PROPOSAL' && data.quotes.length === 0}
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

	<div id="quotes" class="anchor-section">
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
								<strong><a href={resolve(`/quotes/${quote.id}`)}>{quote.subject}</a></strong><span
									>{quoteNumber(quote)} · {quote.currency}
									{money(quote.total)} · {quote.status}</span
								>
							</div>
							{#if quote.status === 'ready' && canMutate}
								<form method="POST" action="?/sendQuote">
									<input type="hidden" name="quote_id" value={quote.id} /><input
										type="hidden"
										name="lock_version"
										value={quote.lock_version}
									/><Button type="submit" size="sm">Send quote</Button>
								</form>
							{:else if quote.status === 'sent'}
								<Badge tone="success">Submitted</Badge>
							{:else if quote.status === 'ready'}
								<span class="muted">Read-only</span>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</Card>
	</div>

	<Card class="management-card">
		<SectionHeader
			title="Ownership and attention"
			description="Pipeline position, responsibility, and waiting state are managed separately."
		/>
		<div class="management-grid">
			{#if canMutate}
				<form method="POST" action="?/assign" class="stack-form">
					<input type="hidden" name="lock_version" value={data.lead.lock_version} />
					<Select
						id="assigned_to"
						name="assigned_to"
						label="Owner"
						value={data.lead.assigned_to ?? ''}
					>
						<option value="">Unassigned</option>
						{#each data.staff as member (member.id)}
							<option value={member.id}>{member.full_name || member.email} · {member.role}</option>
						{/each}
					</Select>
					<Button type="submit" size="sm">Save owner</Button>
				</form>
				{#if data.lead.pipeline_stage !== 'WON' && data.lead.pipeline_stage !== 'LOST'}
					<form method="POST" action="?/setAttention" class="stack-form">
						<input type="hidden" name="lock_version" value={data.lead.lock_version} />
						<Select
							id="attention_state"
							name="attention_state"
							label="Attention state"
							value={data.lead.attention_state}
						>
							<option value="none">None</option>
							<option value="waiting_on_client">Waiting on client</option>
							<option value="waiting_on_us">Waiting on us</option>
						</Select>
						<Button type="submit" size="sm">Save attention</Button>
					</form>
					{#if data.lead.paused_at}
						<form method="POST" action="?/resume" class="stack-form">
							<input type="hidden" name="lock_version" value={data.lead.lock_version} />
							<p class="muted-copy">
								Paused: {data.lead.pause_reason}
								{#if data.lead.resume_at}
									· resumes {new Date(data.lead.resume_at).toLocaleString('en-ZA')}{/if}
							</p>
							<Button type="submit" size="sm">Resume Lead</Button>
						</form>
					{:else}
						<form method="POST" action="?/pause" class="stack-form">
							<input type="hidden" name="lock_version" value={data.lead.lock_version} />
							<Textarea
								id="pause_reason"
								name="pause_reason"
								label="Pause reason"
								rows={2}
								required
							/>
							<Input
								id="resume_at"
								name="resume_at"
								label="Resume date (optional)"
								type="datetime-local"
							/>
							<Button type="submit" size="sm">Pause Lead</Button>
						</form>
					{/if}
				{/if}
				{#if data.lead.pipeline_stage === 'LOST' && (data.profile.role === 'owner' || data.profile.role === 'admin')}
					<form method="POST" action="?/reopen" class="stack-form reopen-form">
						<input type="hidden" name="lock_version" value={data.lead.lock_version} />
						<Textarea
							id="reopen_reason"
							name="reopen_reason"
							label="Reopen reason"
							rows={2}
							required
						/>
						<Button type="submit" size="sm">Reopen for qualification</Button>
					</form>
				{/if}
			{:else}
				<p class="read-only-note">Viewer access is read-only.</p>
			{/if}
		</div>
	</Card>

	<div class="lower-grid">
		<div id="tasks" class="anchor-section">
			<Card>
				<SectionHeader
					title="Follow-up tasks"
					description="An open task determines the next action."
				/>
				{#if data.tasks.length === 0}<p class="muted">No tasks yet.</p>{:else}<ul
						class="plain-list"
					>
						{#each data.tasks as task (task.id)}<li>
								<strong>{task.title}</strong><span>{task.status} · {dateTime(task.due_at)}</span>
							</li>{/each}
					</ul>{/if}
			</Card>
		</div>
		<div id="activity" class="anchor-section">
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
	.detail-nav {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-bottom: var(--space-lg);
		padding: var(--space-sm) 0;
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.detail-nav a {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}
	.detail-nav a:hover {
		color: var(--color-brand-primary);
	}
	.anchor-section {
		scroll-margin-top: var(--space-lg);
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
	:global(.lead-request-card .ui-card__body) {
		display: grid;
		gap: var(--space-lg);
	}
	.lead-request-groups {
		display: grid;
		gap: var(--space-sm);
	}
	.lead-request-group {
		overflow: hidden;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.lead-request-group > summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-lg);
		min-height: 3.5rem;
		box-sizing: border-box;
		padding: var(--space-md) var(--space-lg);
		color: var(--color-text);
		cursor: pointer;
		list-style: none;
	}
	.lead-request-group > summary::-webkit-details-marker {
		display: none;
	}
	.lead-request-group > summary::after {
		flex: 0 0 auto;
		color: var(--color-brand-primary);
		content: '+';
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		line-height: 1;
	}
	.lead-request-group[open] > summary {
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.lead-request-group[open] > summary::after {
		content: '−';
	}
	.lead-request-group__summary {
		display: grid;
		min-width: 0;
		gap: var(--space-xs);
	}
	.lead-request-group__summary strong {
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.lead-request-group__summary span {
		overflow-wrap: anywhere;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.lead-request-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md) var(--space-lg);
		margin: 0;
		padding: var(--space-lg);
	}
	.lead-request-fields div {
		display: grid;
		min-width: 0;
		gap: var(--space-xs);
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-border-subtle);
	}
	.lead-request-fields dt {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}
	.lead-request-fields dd {
		margin: 0;
		overflow-wrap: anywhere;
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.lead-request-note {
		margin: 0;
		padding: var(--space-lg);
		background: var(--color-brand-accent-soft);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-relaxed);
		white-space: pre-wrap;
	}
	.lead-message {
		margin: 0;
		padding: var(--space-md);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
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
	:global(.management-card),
	.lower-grid,
	.quote-list {
		margin-top: var(--space-lg);
	}
	.management-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-lg);
	}
	.reopen-form {
		grid-column: 1 / -1;
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-border-subtle);
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
		.lower-grid,
		.management-grid {
			grid-template-columns: 1fr;
		}
		.form-row {
			grid-template-columns: 1fr;
		}
		.lead-request-fields {
			grid-template-columns: 1fr;
		}
		.quote-row {
			align-items: flex-start;
			flex-direction: column;
		}
	}
	@media (max-width: 450px) {
		:global(.lead-request-card) {
			border: 0;
			border-radius: 0;
			background: transparent;
			box-shadow: none;
		}
		:global(.lead-request-card .ui-card__body) {
			padding: 0;
		}
		.lead-request-group > summary {
			min-height: 3.5rem;
			padding: var(--space-md) var(--space-lg);
		}
		.lead-request-fields,
		.lead-request-note {
			padding: var(--space-md) var(--space-lg);
		}
	}
</style>
