<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canMutate = $derived(data.profile.role !== 'viewer');

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : 'No due date';
	}

	function tone(task: PageData['tasks'][number]) {
		if (task.status === 'completed') return 'success';
		if (task.status === 'cancelled') return 'neutral';
		if (task.is_overdue) return 'danger';
		return 'info';
	}
</script>

<svelte:head>
	<title>Tasks | Zephyr CRM</title>
	<meta name="description" content="Manage the next actions for active opportunities" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email}>
	<PageHeader
		title="Tasks"
		description="Every open Task is an explicit next action; overdue is derived from its due time."
	/>
	{#if form?.message}<ErrorState title="Task action failed" message={form.message} />{/if}

	<Card class="filters-card">
		<form method="GET" class="filters-form" aria-label="Filter Tasks">
			<Select id="task-status" name="status" label="Status" value={data.filters.status}>
				<option value="open">Open</option><option value="completed">Completed</option><option
					value="cancelled">Cancelled</option
				>
			</Select>
			<label class="checkbox-label"
				><input type="checkbox" name="overdue" value="true" checked={data.filters.overdue} /> Overdue
				only</label
			>
			<Button type="submit" size="sm">Apply filters</Button>
		</form>
	</Card>

	{#if canMutate}
		<Card class="create-card">
			<h2>Create Task</h2>
			<p class="muted">Use a concrete next action; automated rules remain server-configured.</p>
			<form method="POST" action="?/create" class="create-form">
				<Select id="task-lead" name="lead_id" label="Lead" required
					><option value="">Select a Lead</option>{#each data.leads as lead (lead.id)}<option
							value={lead.id}>{lead.first_name} {lead.last_name} · {lead.pipeline_stage}</option
						>{/each}</Select
				>
				<Select id="task-type" name="type" label="Type"
					><option value="custom">Custom</option><option value="review_lead">Review lead</option
					><option value="call_client">Call client</option><option value="prepare_quote"
						>Prepare quote</option
					><option value="send_quote">Send quote</option><option value="follow_up">Follow-up</option
					><option value="confirm_acceptance">Confirm acceptance</option></Select
				>
				<Input id="task-title" name="title" label="Title" required />
				<Input id="task-due" name="due_at" label="Due at" type="datetime-local" />
				<Select id="task-assignee" name="assigned_to" label="Owner"
					><option value="">Unassigned</option>{#each data.staff as member (member.id)}<option
							value={member.id}>{member.full_name || member.email}</option
						>{/each}</Select
				>
				<Button type="submit" size="sm">Create Task</Button>
			</form>
		</Card>
	{/if}

	{#if data.tasks.length === 0}
		<EmptyState
			title="No Tasks match this view"
			message="Schedule the next action or adjust the filters."
		/>
	{:else}
		<Card class="tasks-card">
			<div class="tasks-table-wrap">
				<table class="tasks-table">
					<caption class="sr-only">Task work queue</caption><thead
						><tr><th>Task</th><th>Type</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead
					><tbody>
						{#each data.tasks as task (task.id)}
							<tr>
								<td
									><strong>{task.title}</strong><span
										>{task.lead_id
											? `Lead ${task.lead_id.slice(0, 8)}`
											: task.client_id
												? `Client ${task.client_id.slice(0, 8)}`
												: 'Quote-linked'}</span
									></td
								>
								<td>{task.type}</td><td>{dateTime(task.due_at)}</td><td
									><Badge tone={tone(task)}>{task.is_overdue ? 'overdue' : task.status}</Badge></td
								>
								<td
									>{#if canMutate && task.status === 'open'}<div class="task-actions">
											<form method="POST" action="?/complete">
												<input type="hidden" name="task_id" value={task.id} /><input
													type="hidden"
													name="lock_version"
													value={task.lock_version}
												/><Button type="submit" size="sm">Complete</Button>
											</form>
											<form method="POST" action="?/reschedule" class="reschedule-form">
												<input type="hidden" name="task_id" value={task.id} /><input
													type="hidden"
													name="lock_version"
													value={task.lock_version}
												/><Input
													id={`due-${task.id}`}
													name="due_at"
													label="New due date"
													type="datetime-local"
												/><Button type="submit" size="sm" variant="secondary">Reschedule</Button>
											</form>
											<form method="POST" action="?/cancel">
												<input type="hidden" name="task_id" value={task.id} /><input
													type="hidden"
													name="lock_version"
													value={task.lock_version}
												/><Button type="submit" size="sm" variant="danger">Cancel</Button>
											</form>
										</div>{:else}<span class="muted">Read-only</span>{/if}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</Card>
	{/if}
</AppShell>

<style>
	:global(.filters-card),
	:global(.create-card) {
		margin-bottom: var(--space-lg);
	}
	.filters-form,
	.create-form {
		display: flex;
		align-items: end;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		min-height: 2.7rem;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	:global(.create-card h2),
	:global(.create-card p) {
		margin: 0;
	}
	:global(.create-card h2) {
		font-size: var(--font-size-lg);
	}
	:global(.create-card .muted) {
		margin: var(--space-xs) 0 var(--space-lg);
	}
	.muted {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	:global(.tasks-card) {
		padding: 0;
		overflow: hidden;
	}
	.tasks-table-wrap {
		overflow-x: auto;
	}
	.tasks-table {
		width: 100%;
		min-width: 72rem;
		border-collapse: collapse;
	}
	.tasks-table th,
	.tasks-table td {
		padding: var(--space-lg);
		border-bottom: 1px solid var(--color-border-subtle);
		text-align: left;
		vertical-align: top;
	}
	.tasks-table th {
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
	}
	.tasks-table td {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.tasks-table td strong,
	.tasks-table td span {
		display: block;
	}
	.tasks-table td strong {
		color: var(--color-text);
	}
	.tasks-table td span {
		margin-top: var(--space-xs);
		font-size: var(--font-size-xs);
	}
	.task-actions {
		display: grid;
		gap: var(--space-sm);
		min-width: 15rem;
	}
	.reschedule-form {
		display: flex;
		align-items: end;
		gap: var(--space-xs);
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
	@media (max-width: 640px) {
		.filters-form,
		.create-form {
			display: grid;
			grid-template-columns: 1fr;
			align-items: stretch;
		}
	}
</style>
