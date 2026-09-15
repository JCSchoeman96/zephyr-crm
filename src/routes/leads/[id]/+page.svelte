<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import LeadContextRail from '$lib/components/leads/LeadContextRail.svelte';
	import LeadDetailTabs from '$lib/components/leads/LeadDetailTabs.svelte';
	import LeadFollowUpsTab from '$lib/components/leads/LeadFollowUpsTab.svelte';
	import LeadHistoryTab from '$lib/components/leads/LeadHistoryTab.svelte';
	import LeadOverviewTab from '$lib/components/leads/LeadOverviewTab.svelte';
	import LeadQuotesTab from '$lib/components/leads/LeadQuotesTab.svelte';
	import { leadStageLabel } from '$lib/domain/presentation/labels';
	import {
		parseLeadRequestMessage,
		shouldExpandLeadRequestDetails
	} from '$lib/domain/leads/request-details';
	import { enquiryNextStep } from '$lib/domain/presentation/enquiry-next-step';
	import RealtimeStatus from '$lib/realtime/RealtimeStatus.svelte';
	import { publicClientConfiguration } from '$lib/config/public-client-config';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const canMutate = $derived(data.profile.role !== 'viewer');
	const dateTimeHint = `Times use ${publicClientConfiguration.locale.timezone}`;
	const nextStep = $derived(
		enquiryNextStep(
			data.lead.pipeline_stage,
			Boolean(data.lead.paused_at),
			data.currentQuote?.id ?? null
		)
	);
	const currentQuoteRecord = $derived(
		data.currentQuote
			? (data.quotes.find((quote) => quote.id === data.currentQuote?.id) ?? null)
			: null
	);
	const openTaskCount = $derived(data.tasks.filter((task) => task.status === 'open').length);
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

	function actionErrorTitle(message: string | undefined) {
		return message?.startsWith('Conflict:')
			? 'Conflict — reload before saving'
			: 'Action could not be completed';
	}
</script>

<svelte:head>
	<title>{data.lead.first_name} {data.lead.last_name} | Zephyr CRM</title>
	<meta name="description" content="Enquiry detail and next steps" />
</svelte:head>

<AppShell userEmail={data.auth.user?.email} userRole={data.auth.profile?.role}>
	<a class="back-link" href={resolve('/sales')}>← Back to Sales</a>
	<PageHeader
		title={`${data.lead.first_name} ${data.lead.last_name}`}
		description={`${data.lead.company ?? 'Enquiry'} · #${data.lead.lead_number}`}
	>
		{#snippet actions()}
			<div class="record-header-actions">
				<RealtimeStatus
					scope={`lead-${data.lead.id}`}
					tables={['leads', 'quotes', 'tasks', 'activities']}
				/>
				<Badge tone={stageTone(data.lead.pipeline_stage)}
					>{leadStageLabel(data.lead.pipeline_stage)}</Badge
				>
				{#if canMutate && data.lead.pipeline_stage !== 'WON' && data.lead.pipeline_stage !== 'LOST'}
					<a class="ui-button ui-button--secondary ui-button--sm" href="#close-enquiry"
						>Close enquiry</a
					>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	{#if form?.message}<ErrorState
			title={actionErrorTitle(form.message)}
			message={form.message}
		/>{/if}

	{#if canMutate && data.lead.pipeline_stage !== 'WON' && data.lead.pipeline_stage !== 'LOST'}
		<details id="close-enquiry" class="close-panel lost-panel">
			<summary>Close enquiry</summary>
			<Card>
				<h2>Mark this enquiry as not proceeding</h2>
				<p>Choose a reason so the team knows what happened. This does not create a Customer.</p>
				<form method="POST" action="?/lost" class="close-form">
					<input type="hidden" name="lock_version" value={data.lead.lock_version} />
					<Select
						id="lost_reason_id"
						name="lost_reason_id"
						label="Why is it not proceeding?"
						required
					>
						<option value="">Select a reason</option>
						{#each data.lostReasons as reason (reason.id)}<option value={reason.id}
								>{reason.label}</option
							>{/each}
					</Select>
					<Textarea id="lost_notes" name="lost_notes" label="Extra notes (optional)" rows={3} />
					<Button type="submit" variant="danger">Close enquiry</Button>
				</form>
			</Card>
		</details>
	{/if}

	<div class="workspace-grid">
		<LeadContextRail
			lead={data.lead}
			currentQuote={data.currentQuote}
			{currentQuoteRecord}
			fulfilments={data.fulfilments}
			staff={data.staff}
			{nextStep}
			{canMutate}
			profileRole={data.profile.role}
			{dateTimeHint}
		/>

		<main class="work-panel">
			<LeadDetailTabs
				leadId={data.lead.id}
				activeTab={data.activeTab}
				quoteCount={data.quotes.length}
				{openTaskCount}
			/>

			<div class="tab-content">
				{#if data.activeTab === 'overview'}
					<LeadOverviewTab
						lead={data.lead}
						{currentQuoteRecord}
						tasks={data.tasks}
						activities={data.activities}
						{leadRequestDetails}
						{leadRequestOpenAll}
					/>
				{:else if data.activeTab === 'quotes'}
					<LeadQuotesTab
						leadId={data.lead.id}
						quotes={data.quotes}
						{currentQuoteRecord}
						{canMutate}
					/>
				{:else if data.activeTab === 'follow-ups'}
					<LeadFollowUpsTab
						leadId={data.lead.id}
						tasks={data.tasks}
						staff={data.staff}
						{canMutate}
						{dateTimeHint}
					/>
				{:else}
					<LeadHistoryTab activities={data.activities} />
				{/if}
			</div>
		</main>
	</div>
</AppShell>

<style>
	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(17rem, 21rem) minmax(0, 1fr);
		align-items: start;
		gap: var(--space-xl);
	}
	.work-panel {
		min-width: 0;
	}
	.tab-content {
		padding-top: var(--space-lg);
	}
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
	.record-header-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}
	.close-panel {
		margin-bottom: var(--space-lg);
		scroll-margin-top: var(--space-lg);
	}
	.close-panel > summary {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		padding: 0 var(--space-md);
		border: 1px solid var(--color-danger);
		border-radius: var(--radius-md);
		color: var(--color-danger);
		cursor: pointer;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}
	.close-panel > summary:hover {
		background: var(--color-danger-soft);
	}
	.close-panel[open] > summary {
		margin-bottom: var(--space-md);
	}
	.close-panel h2 {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-lg);
	}
	.close-panel p {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.close-form {
		display: grid;
		gap: var(--space-md);
		max-width: 34rem;
	}
	@media (max-width: 900px) {
		.workspace-grid {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 560px) {
		.record-header-actions {
			justify-content: flex-start;
		}
	}
</style>
