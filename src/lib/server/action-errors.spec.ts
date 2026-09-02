import { describe, expect, it } from 'vitest';
import {
	actionFailureDetails,
	actionFailureStatus,
	isConcurrencyConflict,
	userFacingActionMessage
} from './action-errors';

describe('action error handling', () => {
	it('recognises database stale-lock errors while retaining the action status contract', () => {
		const error = { message: 'Stale quote lock_version', code: '40001' };

		expect(isConcurrencyConflict(error)).toBe(true);
		expect(actionFailureStatus(error)).toBe(409);
		expect(userFacingActionMessage(error, 'fallback')).toBe(
			'Conflict: this record changed elsewhere in another session. Reload the page to review the newer values; your changes were not saved.'
		);
		expect(actionFailureDetails(error, 'fallback')).toMatchObject({
			status: 409,
			code: 'CONFLICT'
		});
	});

	it('maps database validation failures to safe fallback text', () => {
		expect(actionFailureStatus({ message: 'Validation failed' })).toBe(422);
		expect(
			userFacingActionMessage({ message: 'SQL relation details', code: '22023' }, 'fallback')
		).toBe('fallback');
	});

	it('distinguishes permission, not-found, and step-up failures', () => {
		expect(
			actionFailureDetails(
				{ code: '42501', message: 'Current session AAL2 is required' },
				'fallback'
			)
		).toMatchObject({
			status: 403,
			code: 'STEP_UP_REQUIRED',
			message:
				'Additional verification is required for this action. Sign in again with multi-factor verification and retry.'
		});
		expect(
			actionFailureDetails({ code: '42501', message: 'Owner or admin role required' }, 'fallback')
		).toMatchObject({
			status: 403,
			code: 'FORBIDDEN',
			message: 'You do not have permission to perform this action.'
		});
		expect(
			actionFailureDetails({ code: 'P0002', message: 'Lead not found' }, 'fallback')
		).toMatchObject({
			status: 404,
			code: 'NOT_FOUND',
			message: 'The requested record was not found. Reload the page and try again.'
		});
	});

	it('keeps local form validation messages while classifying the response', () => {
		const details = actionFailureDetails(new Error('A valid Task ID is required'), 'fallback');
		expect(details).toEqual({
			status: 422,
			code: 'VALIDATION',
			message: 'A valid Task ID is required'
		});
	});

	it('classifies dimension parser unknown and duplicate key failures as validation', () => {
		for (const message of [
			'Quote line 1 has an unknown dimension field',
			'Duplicate dimension key: width'
		]) {
			expect(actionFailureDetails(new Error(message), 'fallback')).toMatchObject({
				status: 422,
				code: 'VALIDATION',
				message
			});
		}
	});
});
