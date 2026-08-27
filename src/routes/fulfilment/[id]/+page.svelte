<script lang="ts">
	import { navigating } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import {
		activityEventLabel,
		fulfilmentCaseStatusLabel,
		fulfilmentPaymentStatusLabel,
		fulfilmentPaymentTypeLabel,
		fulfilmentStepStatusLabel,
		fulfilmentStepTypeLabel,
		quoteStatusLabel,
		taskStatusLabel,
		taskTypeLabel
	} from '$lib/domain/presentation/labels';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canMutate = $derived(data.profile.role !== 'viewer');
	const canCorrect = $derived(['owner', 'admin'].includes(data.profile.role));

	function dateTime(value: string | null) {
		return value
			? new Date(value).toLocaleString(publicClientConfiguration.locale.language, {
					timeZone: publicClientConfiguration.locale.timezone
				})
			: 'Not recorded';
	}

	function dateInput(value: string | null) {
		return value ? new Date(value).toISOString().slice(0, 16) : '';
	}

	function money(value: number | null | undefined, currency: string | undefined) {
		return new Intl.NumberFormat(publicClientConfiguration.locale.language, {
			style: 'currency',
			currency: currency || publicClientConfiguration.locale.currency,
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(Number(value ?? 0));
	}

	function caseTone(status: string) {
		if (status === 'completed') return 'success';
		if (status === 'cancelled') return 'neutral';
		return 'info';
	}

	function stepTone(status: string) {
		if (['completed', 'delivered', 'collected'].includes(status)) return 'success';
		if (status === 'cancelled') return 'neutral';
		if (status.startsWith('awaiting')) return 'warning';
		return 'info';
	}

	function paymentTone(status: string) {
		if (status === 'received') return 'success';
		if (status === 'not_required') return 'neutral';
		if (status === 'awaiting') return 'warning';
		return 'info';
	}

	function actorName(id: string | null) {
		if (!id) return 'Not recorded';
		const actor = data.detail.actors.find((item) => item.id === id);
		return actor?.full_name || actor?.email || 'CRM user';
	}

	function stepDescription(step: PageData['detail']['steps'][number]) {
		if (step.type === 'installation')
			return 'Schedule and complete the accepted installation work.';
		if (step.type === 'courier') return 'Dispatch and confirm delivery for the accepted sale.';
		return 'Prepare the pickup and confirm collection by the customer.';
	}

	function isActiveStep(status: string) {
		return !['completed', 'delivered', 'collected', 'cancelled'].includes(status);
	}
</script>

<svelte:head>
	<title>Fulfilment #{data.detail.case.fulfilment_number} | Zephyr CRM</title>
	<meta name="description" content="Canonical Fulfilment case detail and operational history" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<PageHeader
		title={`Fulfilment #${data.detail.case.fulfilment_number}`}
		description="One accepted sale, one canonical operational record."
	>
		{#snippet actions()}
			<RealtimeStatus scope={`fulfilment-${data.detail.case.id}`} tables={['tasks', 'quotes']} />
		{/snippet}
	</PageHeader>

	<a class="back-link" href={resolve('/fulfilment')}>← Back to Fulfilment queues</a>
	{#if form?.message}<ErrorState
			title="Fulfilment action could not be completed"
			message={form.message}
		/>{/if}
	{#if navigating.to}<LoadingState message="Refreshing Fulfilment case…" />{/if}

	<section aria-labelledby="overview-heading" class="detail-section">
		<div class="section-heading">
			<div>
				<h2 id="overview-heading">Overview</h2>
				<p>The customer and accepted quote remain unchanged in Fulfilment.</p>
			</div>
			<Badge tone={caseTone(data.detail.case.status)}
				>{fulfilmentCaseStatusLabel(data.detail.case.status)}</Badge
			>
		</div>
		<Card class="overview-card">
			<div class="overview-grid">
				<div>
					<span class="field-label">Case</span><strong>#{data.detail.case.fulfilment_number}</strong
					>
				</div>
				<div>
					<span class="field-label">Customer</span>
					{#if data.detail.client}
						<a href={resolve(`/clients/${data.detail.client.id}`)}
							>{data.detail.client.display_name}</a
						>
						<span class="secondary">Customer #{data.detail.client.client_number}</span>
					{:else}<span>Customer unavailable</span>{/if}
				</div>
				<div>
					<span class="field-label">Source enquiry</span>
					{#if data.detail.lead}
						<a href={resolve(`/leads/${data.detail.lead.id}`)}
							>#{data.detail.lead.lead_number} · {data.detail.lead.first_name}
							{data.detail.lead.last_name}</a
						>
					{:else}<span>Enquiry unavailable</span>{/if}
				</div>
				<div>
					<span class="field-label">Accepted Quote</span>
					{#if data.detail.quote}
						<a href={resolve(`/quotes/${data.detail.quote.id}`)}
							>{data.detail.quote.quote_number ?? 'Accepted Quote'} · {data.detail.quote.subject}</a
						>
						<span class="secondary"
							>{quoteStatusLabel(data.detail.quote.status)} · {money(
								data.detail.quote.total,
								data.detail.quote.currency
							)}</span
						>
					{:else}<span>Accepted Quote unavailable</span>{/if}
				</div>
				<div>
					<span class="field-label">Created</span><span
						>{dateTime(data.detail.case.created_at)}</span
					>
				</div>
				<div>
					<span class="field-label">Last updated</span><span
						>{dateTime(data.detail.case.updated_at)}</span
					>
				</div>
			</div>
			<p class="read-only-note">
				Commercial values are displayed from the accepted immutable Quote. Fulfilment does not edit
				Quote totals, items, or payment amounts.
			</p>
			{#if data.detail.case.cancel_reason}<p class="case-reason">
					<strong>Cancellation reason:</strong>
					{data.detail.case.cancel_reason}
				</p>{/if}
			<div class="case-actions">
				{#if canMutate && data.detail.case.status === 'open'}
					<form method="POST" action="?/completeCase">
						<input type="hidden" name="lock_version" value={data.detail.case.lock_version} />
						<Button type="submit">Complete fulfilment</Button>
					</form>
				{/if}
				{#if canMutate && canCorrect && data.detail.case.status === 'open'}
					<form method="POST" action="?/cancelCase" class="inline-reason-form">
						<input type="hidden" name="lock_version" value={data.detail.case.lock_version} />
						<Input id="case-cancel-reason" name="reason" label="Cancellation reason" required />
						<Button type="submit" variant="danger">Cancel case</Button>
					</form>
				{:else if data.detail.case.status === 'open'}
					<span class="muted">Only authorized administrators can cancel an open fulfilment.</span>
				{/if}
			</div>
		</Card>
	</section>

	<section aria-labelledby="work-heading" class="detail-section">
		<div class="section-heading">
			<div>
				<h2 id="work-heading">Work</h2>
				<p>Installation, courier, and pickup steps have independent state and locks.</p>
			</div>
		</div>
		{#if canMutate && data.detail.case.status === 'open'}
			<Card class="create-work-card">
				<h3>Add operational work</h3>
				<p class="muted">
					Create one active step per work type. The next status is set automatically.
				</p>
				<form method="POST" action="?/createStep" class="work-form">
					<input type="hidden" name="lock_version" value={data.detail.case.lock_version} />
					<Select id="new-step-type" name="type" label="Work type" required>
						<option value="installation">Installation</option>
						<option value="courier">Courier</option>
						<option value="pickup">Pickup</option>
					</Select>
					<Input id="new-step-notes" name="notes" label="Notes" />
					<Input id="new-step-tracking" name="tracking_reference" label="Tracking reference" />
					<Button type="submit" size="sm">Add work step</Button>
				</form>
			</Card>
		{/if}

		{#if data.detail.steps.length === 0}
			<EmptyState
				title="No operational steps yet"
				message="Add the first installation, courier, or pickup step when work is ready to be planned."
			/>
		{:else}
			<div class="step-list">
				{#each data.detail.steps as step (step.id)}
					<Card class="step-card">
						<div class="step-header">
							<div>
								<h3>{fulfilmentStepTypeLabel(step.type)}</h3>
								<p>{stepDescription(step)}</p>
							</div>
							<Badge tone={stepTone(step.status)}>{fulfilmentStepStatusLabel(step.status)}</Badge>
						</div>
						<div class="evidence-grid">
							<div>
								<span class="field-label">Scheduled</span><span>{dateTime(step.scheduled_for)}</span
								>
							</div>
							<div>
								<span class="field-label">Completed</span><span>{dateTime(step.completed_at)}</span>
							</div>
							{#if step.tracking_reference}<div>
									<span class="field-label">Tracking reference</span><span
										>{step.tracking_reference}</span
									>
								</div>{/if}
						</div>
						{#if step.notes}<p class="evidence-note"><strong>Notes:</strong> {step.notes}</p>{/if}
						{#if step.cancel_reason}<p class="case-reason">
								<strong>Cancellation reason:</strong>
								{step.cancel_reason}
							</p>{/if}

						{#if canMutate && data.detail.case.status === 'open' && isActiveStep(step.status)}
							<div class="step-actions">
								{#if step.type === 'installation' && step.status === 'awaiting_schedule'}
									<form method="POST" action="?/schedule" class="action-form">
										<input type="hidden" name="step_id" value={step.id} /><input
											type="hidden"
											name="lock_version"
											value={step.lock_version}
										/>
										<Input
											id={`schedule-${step.id}`}
											name="scheduled_for"
											label="Schedule for"
											type="datetime-local"
											required
										/>
										<Button type="submit" size="sm">Schedule installation</Button>
									</form>
								{:else if step.type === 'installation' && step.status === 'scheduled'}
									<form method="POST" action="?/reschedule" class="action-form">
										<input type="hidden" name="step_id" value={step.id} /><input
											type="hidden"
											name="lock_version"
											value={step.lock_version}
										/>
										<Input
											id={`reschedule-${step.id}`}
											name="scheduled_for"
											label="New schedule"
											type="datetime-local"
											value={dateInput(step.scheduled_for)}
											required
										/>
										<Button type="submit" variant="secondary" size="sm">Reschedule</Button>
									</form>
									<form method="POST" action="?/completeStep">
										<input type="hidden" name="step_id" value={step.id} /><input
											type="hidden"
											name="lock_version"
											value={step.lock_version}
										/><Button type="submit" size="sm">Complete installation</Button>
									</form>
								{:else if step.type === 'courier' && step.status === 'awaiting_dispatch'}
									<form method="POST" action="?/dispatch" class="action-form">
										<input type="hidden" name="step_id" value={step.id} /><input
											type="hidden"
											name="lock_version"
											value={step.lock_version}
										/>
										<Input
											id={`tracking-${step.id}`}
											name="tracking_reference"
											label="Tracking reference"
										/>
										<Input id={`dispatch-notes-${step.id}`} name="notes" label="Dispatch notes" />
										<Button type="submit" size="sm">Dispatch courier</Button>
									</form>
								{:else if step.type === 'courier' && step.status === 'dispatched'}
									<form method="POST" action="?/completeStep">
										<input type="hidden" name="step_id" value={step.id} /><input
											type="hidden"
											name="lock_version"
											value={step.lock_version}
										/><Button type="submit" size="sm">Confirm delivery</Button>
									</form>
								{:else if step.type === 'pickup' && step.status === 'preparing'}
									<form method="POST" action="?/ready" class="action-form">
										<input type="hidden" name="step_id" value={step.id} /><input
											type="hidden"
											name="lock_version"
											value={step.lock_version}
										/>
										<Input id={`pickup-notes-${step.id}`} name="notes" label="Readiness notes" />
										<Button type="submit" size="sm">Mark ready for collection</Button>
									</form>
								{:else if step.type === 'pickup' && step.status === 'ready_for_collection'}
									<form method="POST" action="?/completeStep">
										<input type="hidden" name="step_id" value={step.id} /><input
											type="hidden"
											name="lock_version"
											value={step.lock_version}
										/><Button type="submit" size="sm">Confirm collection</Button>
									</form>
								{/if}
								<form method="POST" action="?/cancelStep" class="cancel-form">
									<input type="hidden" name="step_id" value={step.id} /><input
										type="hidden"
										name="lock_version"
										value={step.lock_version}
									/>
									<Input
										id={`cancel-step-${step.id}`}
										name="reason"
										label="Cancellation reason"
										required
									/>
									<Button type="submit" variant="danger" size="sm">Cancel step</Button>
								</form>
							</div>
						{:else if isActiveStep(step.status) && data.detail.case.status === 'open'}
							<p class="muted">Viewer access is read-only.</p>
						{/if}
					</Card>
				{/each}
			</div>
		{/if}
	</section>

	<section aria-labelledby="payments-heading" class="detail-section">
		<div class="section-heading">
			<div>
				<h2 id="payments-heading">Payments</h2>
				<p>
					Manual CRM evidence only; this does not reconcile a bank, gateway, invoice, or ledger.
				</p>
			</div>
		</div>
		{#if data.detail.payments.length === 0}
			<EmptyState
				title="No payment milestones"
				message="The accepted-sale handoff normally creates Deposit and Final Balance milestones."
			/>
		{:else}
			<div class="payment-list">
				{#each data.detail.payments as payment (payment.id)}
					<Card class="payment-card">
						<div class="step-header">
							<div>
								<h3>{fulfilmentPaymentTypeLabel(payment.type)}</h3>
								<p>Milestone status is independent of operational work.</p>
							</div>
							<Badge tone={paymentTone(payment.status)}
								>{fulfilmentPaymentStatusLabel(payment.status)}</Badge
							>
						</div>
						<div class="evidence-grid">
							<div>
								<span class="field-label">Requested</span><span
									>{dateTime(payment.requested_at)}</span
								>
							</div>
							<div>
								<span class="field-label">Received</span><span>{dateTime(payment.received_at)}</span
								>
							</div>
							{#if payment.received_recorded_by}<div>
									<span class="field-label">Recorded by</span><span
										>{actorName(payment.received_recorded_by)}</span
									>
								</div>{/if}
						</div>
						{#if payment.note}<p class="evidence-note">
								<strong>Evidence note:</strong>
								{payment.note}
							</p>{/if}
						{#if canMutate && data.detail.case.status === 'open'}
							<div class="payment-actions">
								{#if payment.status === 'not_due'}
									<form method="POST" action="?/requestPayment">
										<input type="hidden" name="payment_milestone_id" value={payment.id} /><input
											type="hidden"
											name="lock_version"
											value={payment.lock_version}
										/><Button type="submit" size="sm">Request payment evidence</Button>
									</form>
									<form method="POST" action="?/notRequired" class="action-form">
										<input type="hidden" name="payment_milestone_id" value={payment.id} /><input
											type="hidden"
											name="lock_version"
											value={payment.lock_version}
										/><Textarea
											id={`not-required-${payment.id}`}
											name="note"
											label="Why not required?"
											rows={2}
										/><Button type="submit" variant="secondary" size="sm">Mark not required</Button>
									</form>
								{:else if payment.status === 'awaiting'}
									<form method="POST" action="?/receivePayment" class="action-form">
										<input type="hidden" name="payment_milestone_id" value={payment.id} /><input
											type="hidden"
											name="lock_version"
											value={payment.lock_version}
										/><Textarea
											id={`receive-note-${payment.id}`}
											name="note"
											label="Receipt evidence note"
											rows={2}
										/><Button type="submit" size="sm">Record received</Button>
									</form>
								{/if}
							</div>
						{/if}
						{#if canCorrect && data.detail.case.status === 'open'}
							<div class="correction-panel">
								<p class="muted">
									Owner/Admin correction requires a current-session AAL2/MFA claim, a reason, and
									this lock version.
								</p>
								<form method="POST" action="?/correctPayment" class="action-form">
									<input type="hidden" name="payment_milestone_id" value={payment.id} /><input
										type="hidden"
										name="lock_version"
										value={payment.lock_version}
									/>
									<Select
										id={`correct-status-${payment.id}`}
										name="status"
										label="Corrected status"
										value={payment.status}
									>
										<option value="awaiting">Awaiting</option><option value="received"
											>Received</option
										><option value="not_required">Not required</option>
									</Select>
									<Textarea
										id={`correction-reason-${payment.id}`}
										name="reason"
										label="Correction reason"
										rows={2}
										required
									/>
									<Textarea
										id={`correction-note-${payment.id}`}
										name="note"
										label="Replacement evidence note"
										rows={2}
									/>
									<Button type="submit" variant="secondary" size="sm"
										>Correct payment evidence</Button
									>
								</form>
							</div>
						{/if}
					</Card>
				{/each}
			</div>
		{/if}
	</section>

	<section aria-labelledby="tasks-heading" class="detail-section">
		<div class="section-heading">
			<div>
				<h2 id="tasks-heading">Follow-up actions</h2>
				<p>Keep track of what needs to happen next.</p>
			</div>
			<a href={resolve('/tasks')}>Open follow-ups →</a>
		</div>
		{#if canMutate && data.detail.case.status === 'open'}
			<Card class="create-task-card">
				<form method="POST" action="?/followUp" class="work-form">
					<Input
						id="follow-up-title"
						name="title"
						label="What needs to happen?"
						value="Confirm payment evidence"
						required
					/>
					<Input id="follow-up-due" name="due_at" label="Due date" type="datetime-local" />
					<Textarea
						id="follow-up-description"
						name="description"
						label="Notes (optional)"
						rows={2}
					/>
					<Button type="submit" size="sm">Add follow-up action</Button>
				</form>
			</Card>
		{/if}
		{#if data.detail.tasks.length === 0}
			<EmptyState
				title="No follow-up actions"
				message="Add a follow-up action when someone needs to do the next check."
			/>
		{:else}
			<ul class="task-list">
				{#each data.detail.tasks as task (task.id)}
					<li class="task-row">
						<div>
							<strong>{task.title}</strong><span
								>{taskTypeLabel(task.type)}{task.due_at
									? ` · due ${dateTime(task.due_at)}`
									: ''}</span
							>{#if task.description}<small>{task.description}</small>{/if}
						</div>
						<div class="task-state">
							{#if task.is_overdue}<Badge tone="danger">Overdue</Badge>{:else}<Badge
									tone={task.status === 'completed'
										? 'success'
										: task.status === 'cancelled'
											? 'neutral'
											: 'info'}>{taskStatusLabel(task.status)}</Badge
								>{/if}<span class="secondary">{actorName(task.assigned_to)}</span>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section aria-labelledby="activity-heading" class="detail-section">
		<div class="section-heading">
			<div>
				<h2 id="activity-heading">History</h2>
				<p>See what has happened with this fulfilment.</p>
			</div>
		</div>
		{#if data.detail.activities.length === 0}
			<EmptyState title="No history" message="Fulfilment actions will appear here." />
		{:else}
			<ol class="activity-list">
				{#each data.detail.activities as activity (activity.id)}
					<li>
						<div>
							<strong>{activity.summary}</strong><span
								>{activityEventLabel(activity.event_type)} · {actorName(activity.actor_id)}</span
							>
						</div>
						<time datetime={activity.occurred_at}>{dateTime(activity.occurred_at)}</time>
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</AppShell>

<style>
	.back-link,
	.section-heading a,
	a {
		color: var(--color-brand-primary);
	}
	.back-link {
		display: inline-block;
		margin-bottom: var(--space-lg);
		font-weight: var(--font-weight-semibold);
	}
	.detail-section {
		margin-bottom: var(--space-xl);
	}
	.section-heading,
	.step-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-lg);
		margin-bottom: var(--space-md);
	}
	.section-heading h2,
	.section-heading p,
	.step-header h3,
	.step-header p {
		margin: 0;
	}
	:global(.create-work-card h3),
	:global(.create-work-card p) {
		margin: 0;
	}
	.section-heading p,
	.step-header p,
	.muted,
	.secondary {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.section-heading p,
	.step-header p {
		margin-top: var(--space-xs);
	}
	.overview-grid,
	.evidence-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-lg);
	}
	.overview-grid > div,
	.evidence-grid > div {
		display: grid;
		gap: var(--space-xs);
		min-width: 0;
	}
	.field-label {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
	}
	.overview-grid strong {
		font-size: var(--font-size-lg);
	}
	.secondary {
		display: block;
		font-size: var(--font-size-xs);
	}
	.read-only-note,
	.evidence-note,
	.case-reason {
		margin: var(--space-lg) 0 0;
		padding: var(--space-md);
		border-left: 3px solid var(--color-brand-accent);
		background: var(--color-surface-subtle);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.case-reason {
		border-left-color: var(--color-danger);
	}
	.case-actions,
	.step-actions,
	.payment-actions {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-top: var(--space-lg);
	}
	.inline-reason-form,
	.action-form,
	.cancel-form,
	.work-form {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
	.inline-reason-form :global(.ui-field),
	.action-form :global(.ui-field),
	.cancel-form :global(.ui-field),
	.work-form :global(.ui-field) {
		min-width: 13rem;
	}
	:global(.create-work-card),
	:global(.create-task-card) {
		margin-bottom: var(--space-md);
	}
	:global(.create-work-card .muted) {
		margin: var(--space-xs) 0 var(--space-md);
	}
	.step-list,
	.payment-list {
		display: grid;
		gap: var(--space-md);
	}
	.step-header h3 {
		font-size: var(--font-size-lg);
	}
	.evidence-grid {
		margin-top: var(--space-lg);
		font-size: var(--font-size-sm);
	}
	.correction-panel {
		margin-top: var(--space-lg);
		padding-top: var(--space-lg);
		border-top: 1px solid var(--color-border-subtle);
	}
	.correction-panel .muted {
		margin: 0 0 var(--space-md);
	}
	.task-list,
	.activity-list {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.task-row,
	.activity-list li {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-lg);
		padding: var(--space-md);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.task-row strong,
	.task-row span,
	.task-row small,
	.activity-list strong,
	.activity-list span {
		display: block;
	}
	.task-row span,
	.task-row small,
	.activity-list span,
	.activity-list time {
		margin-top: var(--space-xs);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.task-row small {
		max-width: 50rem;
	}
	.task-state {
		display: grid;
		justify-items: end;
		gap: var(--space-xs);
		white-space: nowrap;
	}
	.activity-list time {
		white-space: nowrap;
	}
	@media (max-width: 48rem) {
		.overview-grid,
		.evidence-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	@media (max-width: 36rem) {
		.overview-grid,
		.evidence-grid {
			grid-template-columns: 1fr;
		}
		.section-heading,
		.step-header,
		.task-row,
		.activity-list li {
			display: grid;
		}
		.task-state {
			justify-items: start;
		}
		.activity-list time {
			white-space: normal;
		}
	}
</style>
