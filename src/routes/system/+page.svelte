<script lang="ts">
	import { Check, Database, Sparkles } from '@lucide/svelte';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Checkbox from '$lib/components/ui/Checkbox.svelte';
	import DataTable from '$lib/components/ui/DataTable.svelte';
	import Drawer from '$lib/components/ui/Drawer.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ErrorState from '$lib/components/ui/ErrorState.svelte';
	import FilterBar from '$lib/components/ui/FilterBar.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import LoadingState from '$lib/components/ui/LoadingState.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import StatCard from '$lib/components/ui/StatCard.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import type { BrandMode } from '$lib/config/brand';

	let brandMode = $state<BrandMode>('default');
	let modalOpen = $state(false);
	let drawerOpen = $state(false);
	let accepted = $state(false);

	function toggleBrand() {
		brandMode = brandMode === 'default' ? 'alternate' : 'default';
	}
</script>

<svelte:head>
	<title>Component Lab | Zephyr CRM</title>
	<meta name="description" content="Zephyr CRM design system component lab" />
</svelte:head>

<AppShell bind:brandMode context="Design system">
	<PageHeader
		title="Component Lab"
		description="Reusable, accessible primitives for the Zephyr CRM application shell."
	>
		{#snippet actions()}
			<Button variant="secondary" onclick={toggleBrand}>
				<Sparkles size={16} aria-hidden="true" />
				{brandMode === 'default' ? 'Use alternate brand' : 'Use default brand'}
			</Button>
		{/snippet}
	</PageHeader>

	<div class="component-lab__stack">
		<section class="component-lab__intro" data-testid="brand-marker" data-brand={brandMode}>
			<div>
				<Badge tone="primary">Phase 2</Badge>
				<h2>Semantic foundations</h2>
				<p>Brand identity is a token configuration, not a component fork.</p>
			</div>
			<Database size={28} aria-hidden="true" />
		</section>

		<div class="component-lab__grid component-lab__grid--stats">
			<StatCard label="Open work" value="12" detail="Across the workspace" />
			<StatCard label="On track" value="8" detail="No action needed" tone="success" />
			<StatCard label="Needs review" value="3" detail="Requires attention" tone="warning" />
			<StatCard label="Blocked" value="1" detail="Needs a decision" tone="danger" />
		</div>

		<div class="component-lab__grid component-lab__grid--two">
			<Card title="Actions">
				<div class="component-lab__row">
					<Button ariaLabel="Primary button">Primary button</Button>
					<Button variant="secondary">Secondary</Button>
					<Button variant="ghost">Ghost</Button>
					<Button variant="danger">Danger</Button>
					<Button disabled ariaLabel="Disabled button">Disabled button</Button>
				</div>
				<div class="component-lab__row">
					<Button variant="secondary" onclick={() => (modalOpen = true)}>Open sample modal</Button>
					<Button variant="secondary" onclick={() => (drawerOpen = true)}>Open sample drawer</Button
					>
				</div>
			</Card>

			<Card title="Form controls">
				<div class="component-lab__form-grid">
					<Input id="name" label="Name" placeholder="Enter a name" hint="This is helper text." />
					<Input id="disabled" label="Disabled field" value="Read only" disabled />
					<Textarea id="description" label="Description" placeholder="Add a description" />
					<Select id="category" label="Category" value="general">
						<option value="general">General</option>
						<option value="priority">Priority</option>
					</Select>
					<Input id="error" label="Error field" error="Example field error" />
				</div>
				<div class="component-lab__checkbox">
					<Checkbox id="terms" label="Accept terms" bind:checked={accepted} />
					<span>{accepted ? 'Accepted' : 'Not accepted'}</span>
				</div>
			</Card>
		</div>

		<FilterBar>
			<Input id="search" label="Search" placeholder="Search components" />
			<Button type="submit"><Check size={16} aria-hidden="true" />Apply</Button>
		</FilterBar>

		<div class="component-lab__grid component-lab__grid--two">
			<Card title="Feedback states">
				<div class="component-lab__stack component-lab__stack--compact">
					<LoadingState message="Loading preview" />
					<ErrorState title="Example error" message="Something needs attention." />
					<EmptyState
						title="Nothing here yet"
						message="An empty state keeps the next step clear."
					/>
				</div>
			</Card>

			<Card title="Table shell">
				<DataTable caption="Component examples">
					<thead>
						<tr><th>Component</th><th>Status</th></tr>
					</thead>
					<tbody>
						<tr><td>Button</td><td><Badge tone="success">Ready</Badge></td></tr>
						<tr><td>Shell</td><td><Badge tone="info">Responsive</Badge></td></tr>
					</tbody>
				</DataTable>
			</Card>
		</div>

		<section>
			<SectionHeader
				title="Token preview"
				description="Status colours and spacing remain semantic."
			/>
			<div class="component-lab__row component-lab__row--tokens">
				<Badge tone="neutral">Neutral</Badge>
				<Badge tone="primary">Primary</Badge>
				<Badge tone="success">Success</Badge>
				<Badge tone="warning">Warning</Badge>
				<Badge tone="danger">Danger</Badge>
				<Badge tone="info">Info</Badge>
			</div>
		</section>
	</div>
</AppShell>

<Modal bind:open={modalOpen} title="Sample modal">
	<p>This modal is a reusable shell primitive. It contains no business workflow.</p>
	{#snippet footer()}
		<Button variant="secondary" onclick={() => (modalOpen = false)}>Close sample modal</Button>
	{/snippet}
</Modal>

<Drawer bind:open={drawerOpen} title="Sample drawer">
	<p>This drawer is ready for future contextual content.</p>
</Drawer>

<style>
	.component-lab__stack {
		display: grid;
		gap: var(--space-xl);
	}

	.component-lab__stack--compact {
		gap: var(--space-md);
	}

	.component-lab__intro {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-lg);
		padding: var(--space-xl);
		border-radius: var(--radius-lg);
		background: var(--color-brand-primary);
		color: var(--color-text-inverse);
		box-shadow: var(--shadow-md);
	}

	.component-lab__intro h2 {
		margin: var(--space-md) 0 var(--space-xs);
		font-size: var(--font-size-xl);
	}

	.component-lab__intro p {
		margin: 0;
		opacity: 0.86;
	}

	.component-lab__grid {
		display: grid;
		gap: var(--space-xl);
	}

	.component-lab__grid--stats {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.component-lab__grid--two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.component-lab__row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}

	.component-lab__row + .component-lab__row {
		margin-top: var(--space-lg);
	}

	.component-lab__row--tokens {
		margin-top: var(--space-lg);
	}

	.component-lab__form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-lg);
	}

	.component-lab__checkbox {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		margin-top: var(--space-lg);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	@media (max-width: 900px) {
		.component-lab__grid--stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.component-lab__grid--two,
		.component-lab__form-grid {
			grid-template-columns: 1fr;
		}

		.component-lab__intro {
			align-items: flex-start;
		}
	}
</style>
