import { describe, expect, it } from 'vitest';
import {
	actionFailureStatus,
	isConcurrencyConflict,
	userFacingActionMessage
} from './action-errors';

describe('action error handling', () => {
	it('recognises database stale-lock errors while retaining the action status contract', () => {
		const error = { message: 'Stale quote lock_version', code: '40001' };

		expect(isConcurrencyConflict(error)).toBe(true);
		expect(actionFailureStatus(error)).toBe(422);
		expect(userFacingActionMessage(error, 'fallback')).toContain('your changes were not saved');
	});

	it('preserves non-conflict messages for ordinary action failures', () => {
		expect(actionFailureStatus({ message: 'Validation failed' })).toBe(422);
		expect(userFacingActionMessage({ message: 'Validation failed' }, 'fallback')).toBe(
			'Validation failed'
		);
	});
});
