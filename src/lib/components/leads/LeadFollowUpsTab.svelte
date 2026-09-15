<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import { taskStatusLabel, taskTypeLabel } from '$lib/domain/presentation/labels';
	import type { LeadDetailStaff, LeadDetailTask } from '$lib/domain/leads/detail-types';

	let {
		leadId,
		tasks,
		staff,
		canMutate,
		dateTimeHint
	}: {
		leadId: string;
		tasks: LeadDetailTask[];
		staff: LeadDetailStaff[];
		canMutate: boolean;
		dateTimeHint: string;
	} = $props();

	const openTasks = $derived(tasks.filter((task) => task.status === 'open'));
	const closedTasks = $derived(tasks.filter((task) => task.status !== 'open'));

	function dateTime(value: string | null) {
		return value ? new Date(value).toLocaleString('en-ZA') : 'No due date';
	}

	function overdue(value: string | null) {
		return Boolean(value && Date.parse(value) < Date.now());
	}
</script>

<div class="follow-ups-workspace">
	<Card>
		<SectionHeader
			title="Add a follow-up action"
			description="Record the next concrete thing that needs to happen."
		/>
		{#if canMutate}
			<form method="POST" action="?/followUp" class="follow-up-form">
				<div class="form-grid">
					<Input id="enquiry-follow-up-title" name="title" label="What needs to happen?" required />
					<Select id="enquiry-follow-up-type" name="type" label="Action type" value="follow_up">
						<option value="follow_up">Follow up</option>
						<option value="call_client">Call customer</option>
						<option value="review_lead">Review enquiry</option>
						<option value="custom">Other follow-up</option>
					</Select>
					<Input
						id="enquiry-follow-up-due"
						name="due_at"
						label="Due date"
						type="datetime-local"
						hint={dateTimeHint}
					/>
					<Select id="enquiry-follow-up-assignee" name="assigned_to" label="Person responsible">
						<option value="">Unassigned</option>
						{#each staff as member (member.id)}<option value={member.id}
								>{member.full_name || member.email}</option
							>{/each}
					</Select>
				</div>
				<Textarea
					id="enquiry-follow-up-notes"
					name="description"
					label="Notes (optional)"
					rows={2}
				/>
				<div class="form-actions">
					<Button type="submit" size="sm">Add follow-up</Button>
					<a class="muted-link" href={resolve(`/tasks?context_type=lead&context_id=${leadId}`)}
						>Open all follow-ups</a
					>
				</div>
			</form>
		{:else}<p class="read-only-note">
				You can view follow-ups, but you do not have permission to add or change them.
			</p>{/if}
	</Card>

	<Card>
		<SectionHeader
			title="Open actions"
			description="Complete the next action when it is done. Rescheduling and cancellation are secondary controls."
		/>
		{#if openTasks.length === 0}
			<EmptyState
				title="No open follow-ups"
				message="Add the next action when this enquiry needs more work."
			/>
		{:else}<div class="task-list">
				{#each openTasks as task (task.id)}<article
						class="task-card"
						class:task-card--overdue={overdue(task.due_at)}
					>
						<div class="task-card__main">
							<div class="task-card__heading">
								<h3>{task.title}</h3>
								{#if overdue(task.due_at)}<span class="overdue-label">Overdue</span>{/if}
							</div>
							<p>
								{taskTypeLabel(task.type)} · {taskStatusLabel(task.status)} · {dateTime(
									task.due_at
								)}
							</p>
							{#if task.description}<div class="task-description">{task.description}</div>{/if}
						</div>
						{#if canMutate}<div class="task-card__actions">
								<form method="POST" action="?/completeFollowUp">
									<input type="hidden" name="task_id" value={task.id} />
									<input type="hidden" name="lock_version" value={task.lock_version} />
									<Button type="submit" size="sm">Complete</Button>
								</form>
								<details class="task-more">
									<summary>More</summary>
									<form method="POST" action="?/rescheduleFollowUp" class="secondary-form">
										<input type="hidden" name="task_id" value={task.id} />
										<input type="hidden" name="lock_version" value={task.lock_version} />
										<Input
											id={`reschedule-${task.id}`}
											name="due_at"
											label="New due date"
											type="datetime-local"
											hint={dateTimeHint}
											required
										/>
										<Button type="submit" size="sm" variant="secondary">Reschedule</Button>
									</form>
									<form method="POST" action="?/cancelFollowUp">
										<input type="hidden" name="task_id" value={task.id} />
										<input type="hidden" name="lock_version" value={task.lock_version} />
										<Button type="submit" size="sm" variant="danger">Cancel</Button>
									</form>
								</details>
							</div>{/if}
					</article>{/each}
			</div>{/if}
	</Card>

	{#if closedTasks.length > 0}<details class="closed-actions">
			<summary>Completed and cancelled actions ({closedTasks.length})</summary>
			<Card>
				<div class="task-list">
					{#each closedTasks as task (task.id)}<div class="closed-task">
							<strong>{task.title}</strong>
							<span
								>{taskTypeLabel(task.type)} · {taskStatusLabel(task.status)} · {dateTime(
									task.due_at
								)}</span
							>
						</div>{/each}
				</div>
			</Card>
		</details>{/if}
</div>

<style>
	.follow-ups-workspace,
	.follow-up-form,
	.task-list,
	.secondary-form {
		display: grid;
		gap: var(--space-lg);
	}
	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-md);
	}
	.form-actions,
	.task-card__actions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-md);
	}
	.muted-link,
	.read-only-note,
	.task-card__main p,
	.closed-task span {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.task-card {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-lg);
		padding: var(--space-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}
	.task-card--overdue {
		border-color: var(--color-danger);
	}
	.task-card__main {
		min-width: 0;
	}
	.task-card__heading {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}
	.task-card h3 {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-md);
	}
	.task-card__main p {
		margin: var(--space-xs) 0 0;
	}
	.task-description {
		margin-top: var(--space-md);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		white-space: pre-wrap;
	}
	.overdue-label {
		color: var(--color-danger);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);
		text-transform: uppercase;
	}
	.task-more,
	.closed-actions > summary {
		color: var(--color-text-muted);
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.task-more {
		position: relative;
	}
	.task-more > summary {
		padding: var(--space-sm);
	}
	.task-more[open] {
		display: grid;
		gap: var(--space-md);
		min-width: min(20rem, 80vw);
		padding: var(--space-md);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
	}
	.closed-actions > summary {
		padding: var(--space-sm) 0;
	}
	.closed-task {
		display: grid;
		gap: var(--space-xs);
		padding-bottom: var(--space-md);
		border-bottom: 1px solid var(--color-border);
	}
	.closed-task strong {
		color: var(--color-text);
	}
	@media (max-width: 640px) {
		.form-grid {
			grid-template-columns: 1fr;
		}
		.task-card {
			flex-direction: column;
		}
	}
</style>
