export const taskQueueLimit = 50;

export function pageTaskRows<T>(rows: T[]) {
	return {
		rows: rows.slice(0, taskQueueLimit),
		hasMore: rows.length > taskQueueLimit
	};
}
