import { expect, it } from 'vitest';
import { fulfilmentNextActions, fulfilmentOutstandingRequirements } from './fulfilment-next-step';

it('maps active step states to practical next actions', () => {
	expect(
		fulfilmentNextActions({
			caseStatus: 'open',
			steps: [{ id: 's1', type: 'installation', status: 'awaiting_schedule' }],
			payments: []
		}).map((action) => action.label)
	).toEqual(['Schedule installation']);
});

it('lists concurrent payment and work obligations', () => {
	expect(
		fulfilmentNextActions({
			caseStatus: 'open',
			steps: [{ id: 's1', type: 'courier', status: 'awaiting_dispatch' }],
			payments: [{ id: 'p1', type: 'deposit', status: 'awaiting' }]
		}).map((action) => action.label)
	).toEqual(['Dispatch delivery', 'Record payment evidence']);
});

it('explains completion blockers without inventing rules', () => {
	expect(
		fulfilmentOutstandingRequirements({
			caseStatus: 'open',
			steps: [{ type: 'installation', status: 'scheduled' }],
			payments: [{ type: 'final_balance', status: 'awaiting' }]
		})
	).toEqual(['complete the installation', 'resolve the final payment milestone']);
});
