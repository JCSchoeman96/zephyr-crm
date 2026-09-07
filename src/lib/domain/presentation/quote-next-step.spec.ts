import { expect, it } from 'vitest';
import { quoteNextStep } from './quote-next-step';

it.each([
	['draft', 'review'],
	['ready', 'send'],
	['sent', 'respond'],
	['accepted', 'closed'],
	['declined', 'closed'],
	['cancelled', 'closed'],
	['expired', 'closed'],
	['superseded', 'closed']
])('maps %s status to %s without inventing a transition', (status, expected) => {
	expect(quoteNextStep(status)).toBe(expected);
});
