type ErrorRecord = {
	code?: unknown;
	message?: unknown;
	status?: unknown;
};

export type ActionErrorCode =
	'CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'STEP_UP_REQUIRED' | 'INTERNAL';

export type ActionFailureDetails = {
	status: 403 | 404 | 409 | 422 | 500;
	code: ActionErrorCode;
	message: string;
};

function record(value: unknown): ErrorRecord | null {
	return value && typeof value === 'object' ? (value as ErrorRecord) : null;
}

function errorMessage(error: unknown) {
	if (error instanceof Error) return error.message;
	const value = record(error)?.message;
	return typeof value === 'string' ? value : String(error ?? '');
}

function errorCode(error: unknown) {
	const value = record(error)?.code;
	return typeof value === 'string' ? value.toUpperCase() : '';
}

function errorStatus(error: unknown) {
	const value = record(error)?.status;
	return typeof value === 'number' ? value : 0;
}

export function isConcurrencyConflict(error: unknown) {
	const code = errorCode(error);
	const message = errorMessage(error);
	return (
		code === '40001' ||
		code === '23505' ||
		errorStatus(error) === 409 ||
		/stale|lock_version|changed during|already exists/i.test(message)
	);
}

function isStepUpRequired(error: unknown) {
	return /aal2|step.?up|multi.?factor.*required|additional verification/i.test(errorMessage(error));
}

function isPermissionDenied(error: unknown) {
	const code = errorCode(error);
	return (
		code === '42501' ||
		errorStatus(error) === 403 ||
		/forbidden|permission|role required|not authorized|read-only/i.test(errorMessage(error))
	);
}

function isNotFound(error: unknown) {
	const code = errorCode(error);
	return (
		code === 'P0002' ||
		errorStatus(error) === 404 ||
		/not found|does not exist/i.test(errorMessage(error))
	);
}

function isValidation(error: unknown) {
	const code = errorCode(error);
	return (
		code.startsWith('22') ||
		code === '23514' ||
		errorStatus(error) === 422 ||
		/required|invalid|choose|must be|validation/i.test(errorMessage(error))
	);
}

export function actionErrorCode(error: unknown): ActionErrorCode {
	if (isConcurrencyConflict(error)) return 'CONFLICT';
	if (isStepUpRequired(error)) return 'STEP_UP_REQUIRED';
	if (isPermissionDenied(error)) return 'FORBIDDEN';
	if (isNotFound(error)) return 'NOT_FOUND';
	if (isValidation(error)) return 'VALIDATION';
	return 'INTERNAL';
}

function statusFor(code: ActionErrorCode): ActionFailureDetails['status'] {
	if (code === 'CONFLICT') return 409;
	if (code === 'FORBIDDEN' || code === 'STEP_UP_REQUIRED') return 403;
	if (code === 'NOT_FOUND') return 404;
	if (code === 'VALIDATION') return 422;
	return 500;
}

function localErrorMessage(error: unknown) {
	return error instanceof Error && !errorCode(error) ? error.message.trim() : '';
}

export function userFacingActionMessage(error: unknown, fallback: string) {
	switch (actionErrorCode(error)) {
		case 'CONFLICT':
			return 'Conflict: this record changed elsewhere in another session. Reload the page to review the newer values; your changes were not saved.';
		case 'STEP_UP_REQUIRED':
			return 'Additional verification is required for this action. Sign in again with multi-factor verification and retry.';
		case 'FORBIDDEN':
			return 'You do not have permission to perform this action.';
		case 'NOT_FOUND':
			return 'The requested record was not found. Reload the page and try again.';
		case 'VALIDATION':
			return localErrorMessage(error) || fallback;
		default:
			return fallback;
	}
}

export function actionFailureStatus(error: unknown) {
	return statusFor(actionErrorCode(error));
}

export function actionFailureDetails(error: unknown, fallback: string): ActionFailureDetails {
	const code = actionErrorCode(error);
	return {
		status: statusFor(code),
		code,
		message: userFacingActionMessage(error, fallback)
	};
}

export function logActionFailure(error: unknown, code = actionErrorCode(error)) {
	// Keep diagnostics useful without copying database messages, SQL, payloads,
	// or credentials into application logs.
	console.error('[crm-action-failure]', {
		actionErrorCode: code,
		databaseErrorCode: errorCode(error) || undefined,
		errorType: error instanceof Error ? error.name : typeof error
	});
}
