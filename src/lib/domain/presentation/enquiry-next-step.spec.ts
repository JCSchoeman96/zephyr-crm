import { expect, it } from 'vitest';
import { enquiryNextStep } from './enquiry-next-step';

it.each(['NEW', 'QUALIFICATION', 'PROPOSAL', 'DECISION'])(
	'prioritizes resume over %s work',
	(stage) => {
		expect(enquiryNextStep(stage, true, 'quote')).toBe('resume');
	}
);
it.each([
	['NEW', null, 'review'],
	['QUALIFICATION', null, 'qualify'],
	['PROPOSAL', null, 'create_quote'],
	['PROPOSAL', 'quote', 'open_quote'],
	['DECISION', 'quote', 'respond'],
	['DECISION', null, 'missing_quote'],
	['WON', 'quote', 'handoff'],
	['LOST', null, 'closed']
])('selects %s work without inventing a transition', (stage, quote, expected) => {
	expect(enquiryNextStep(stage!, false, quote)).toBe(expected);
});
