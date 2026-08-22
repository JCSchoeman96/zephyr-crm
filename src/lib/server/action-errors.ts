function errorMessage(error: unknown) {
	if (error instanceof Error) return error.message;
	if (error && typeof error === 'object' && 'message' in error) {
		return String(error.message ?? '');
	}
	return String(error ?? '');
}

export function isConcurrencyConflict(error: unknown) {
	const message = errorMessage(error);
	return /stale|lock_version|changed during/i.test(message);
}

export function actionFailureStatus(error: unknown) {
	// Svelte form actions retain the existing 422 contract; the conflict-specific
	// message is the user-visible distinction required by Phase 11.
	void error;
	return 422;
}

export function userFacingActionMessage(error: unknown, fallback: string) {
	if (isConcurrencyConflict(error)) {
		const original = errorMessage(error).trim();
		return `Conflict: this record changed in another session${original ? ` (${original})` : ''}. Reload the page to review the newer values; your changes were not saved.`;
	}
	const message = errorMessage(error).trim();
	return message || fallback;
}
