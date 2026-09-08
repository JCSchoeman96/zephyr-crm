export type FulfilmentNextAction = {
	key: string;
	label: string;
	kind: 'step' | 'payment' | 'complete' | 'plan';
};

export function fulfilmentOutstandingRequirements(input: {
	caseStatus: string;
	steps: Array<{ type: string; status: string }>;
	payments: Array<{ type: string; status: string }>;
}): string[] {
	if (input.caseStatus !== 'open') return [];
	const outstanding: string[] = [];
	const activeSteps = input.steps.filter(
		(step) => !['completed', 'delivered', 'collected', 'cancelled'].includes(step.status)
	);
	if (activeSteps.length === 0 && input.steps.every((step) => step.status === 'cancelled')) {
		outstanding.push('complete at least one successful work step');
	}
	for (const step of activeSteps) {
		if (step.type === 'installation') outstanding.push('complete the installation');
		else if (step.type === 'courier') outstanding.push('complete the delivery');
		else if (step.type === 'pickup') outstanding.push('complete the collection');
		else outstanding.push('complete the outstanding work step');
	}
	for (const payment of input.payments) {
		if (!['received', 'not_required'].includes(payment.status)) {
			outstanding.push(
				payment.type === 'deposit'
					? 'resolve the deposit payment milestone'
					: payment.type === 'final_balance'
						? 'resolve the final payment milestone'
						: 'resolve the outstanding payment milestone'
			);
		}
	}
	return [...new Set(outstanding)];
}

export function fulfilmentNextActions(input: {
	caseStatus: string;
	steps: Array<{ id: string; type: string; status: string }>;
	payments: Array<{ id: string; type: string; status: string }>;
}): FulfilmentNextAction[] {
	if (input.caseStatus !== 'open') return [];
	const actions: FulfilmentNextAction[] = [];
	for (const step of input.steps) {
		if (step.status === 'awaiting_schedule')
			actions.push({ key: step.id, label: 'Schedule installation', kind: 'step' });
		else if (step.status === 'scheduled')
			actions.push({ key: step.id, label: 'Complete installation', kind: 'step' });
		else if (step.status === 'awaiting_dispatch')
			actions.push({ key: step.id, label: 'Dispatch delivery', kind: 'step' });
		else if (step.status === 'dispatched')
			actions.push({ key: step.id, label: 'Confirm delivery', kind: 'step' });
		else if (step.status === 'preparing')
			actions.push({ key: step.id, label: 'Mark ready for collection', kind: 'step' });
		else if (step.status === 'ready_for_collection')
			actions.push({ key: step.id, label: 'Confirm collection', kind: 'step' });
	}
	for (const payment of input.payments) {
		if (payment.status === 'awaiting')
			actions.push({ key: payment.id, label: 'Record payment evidence', kind: 'payment' });
	}
	if (actions.length === 0) {
		const outstanding = fulfilmentOutstandingRequirements(input);
		if (outstanding.length === 0) {
			actions.push({ key: 'complete', label: 'Complete fulfilment', kind: 'complete' });
		} else if (
			input.steps.every((step) =>
				['completed', 'delivered', 'collected', 'cancelled'].includes(step.status)
			)
		) {
			// payments still outstanding already added above; otherwise plan
		} else {
			actions.push({ key: 'plan', label: 'Plan next step', kind: 'plan' });
		}
	}
	return actions;
}
