const leadStageLabels: Record<string, string> = {
	NEW: 'New enquiry',
	QUALIFICATION: 'Reviewing details',
	PROPOSAL: 'Preparing quote',
	DECISION: 'Quote sent',
	WON: 'Customer confirmed',
	LOST: 'Not proceeding'
};

const leadStageMeanings: Record<string, string> = {
	NEW: 'A new request has arrived and needs to be reviewed.',
	QUALIFICATION: 'The request is being checked before pricing.',
	PROPOSAL: 'The request is ready for quote details and pricing.',
	DECISION: 'The customer has a quote and a decision is pending.',
	WON: 'The customer accepted the quote and the enquiry is complete.',
	LOST: 'The customer is not going ahead with this enquiry.'
};

const followUpLabels: Record<string, string> = {
	none: 'No follow-up needed',
	waiting_on_us: 'We need to respond',
	waiting_on_client: 'Waiting for customer'
};

const quoteStatusLabels: Record<string, string> = {
	draft: 'Draft',
	ready: 'Ready to send',
	sent: 'Sent',
	accepted: 'Accepted',
	declined: 'Declined',
	expired: 'Expired',
	cancelled: 'Cancelled',
	superseded: 'Replaced'
};

const taskTypeLabels: Record<string, string> = {
	custom: 'Other follow-up',
	review_lead: 'Review enquiry',
	call_client: 'Call customer',
	prepare_quote: 'Prepare quote',
	send_quote: 'Send quote',
	follow_up: 'Follow up',
	confirm_acceptance: 'Confirm customer',
	plan_fulfilment: 'Plan fulfilment',
	schedule_installation: 'Schedule installation',
	complete_installation: 'Complete installation',
	dispatch_order: 'Dispatch order',
	confirm_delivery: 'Confirm delivery',
	prepare_pickup: 'Prepare pickup',
	confirm_collection: 'Confirm collection',
	payment_follow_up: 'Payment follow-up'
};

const taskStatusLabels: Record<string, string> = {
	open: 'Open',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

const fulfilmentCaseStatusLabels: Record<string, string> = {
	open: 'Open',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

const fulfilmentStepTypeLabels: Record<string, string> = {
	installation: 'Installation',
	courier: 'Courier delivery',
	pickup: 'Pickup'
};

const fulfilmentStepStatusLabels: Record<string, string> = {
	awaiting_schedule: 'Awaiting schedule',
	scheduled: 'Scheduled',
	awaiting_dispatch: 'Awaiting dispatch',
	dispatched: 'Dispatched',
	delivered: 'Delivered',
	preparing: 'Preparing',
	ready_for_collection: 'Ready for collection',
	collected: 'Collected',
	completed: 'Completed',
	cancelled: 'Cancelled'
};

const fulfilmentPaymentTypeLabels: Record<string, string> = {
	deposit: 'Deposit',
	final_balance: 'Final balance'
};

const fulfilmentPaymentStatusLabels: Record<string, string> = {
	not_due: 'Not due',
	awaiting: 'Awaiting',
	received: 'Received',
	not_required: 'Not required'
};

const activityEventLabels: Record<string, string> = {
	lead_qualification_started: 'Qualification started',
	lead_ready_for_quote: 'Ready for quote',
	lead_reopened: 'Enquiry reopened',
	lead_lost: 'Enquiry closed',
	lead_won: 'Customer confirmed',
	pipeline_changed: 'Progress updated',
	note_added: 'Note added',
	client_created: 'Customer created',
	client_updated: 'Customer updated',
	client_archived: 'Customer archived',
	client_restored: 'Customer restored',
	client_contact_created: 'Customer contact added',
	client_primary_contact_changed: 'Primary contact changed',
	task_created: 'Follow-up action added',
	task_completed: 'Follow-up action completed',
	task_cancelled: 'Follow-up action cancelled',
	task_rescheduled: 'Follow-up action rescheduled',
	quote_sent: 'Quote sent',
	quote_email_delivered: 'Quote delivery confirmed',
	quote_accepted: 'Quote accepted',
	quote_declined: 'Quote declined',
	quote_revised: 'Quote adjusted',
	product_created: 'Product created',
	product_updated: 'Product updated',
	product_price_changed: 'Product price changed',
	product_activated: 'Product activated',
	product_inactivated: 'Product inactivated',
	product_archived: 'Product archived',
	product_restored: 'Product restored',
	product_category_created: 'Product category created',
	product_category_updated: 'Product category updated',
	product_category_activated: 'Product category activated',
	product_category_inactivated: 'Product category inactivated',
	fulfilment_created: 'Fulfilment started',
	fulfilment_completed: 'Fulfilment completed',
	fulfilment_cancelled: 'Fulfilment cancelled',
	fulfilment_step_created: 'Fulfilment work added',
	fulfilment_step_scheduled: 'Fulfilment work scheduled',
	fulfilment_step_rescheduled: 'Fulfilment work rescheduled',
	fulfilment_step_completed: 'Fulfilment work completed',
	fulfilment_step_cancelled: 'Fulfilment work cancelled',
	payment_milestone_requested: 'Payment evidence requested',
	payment_milestone_received: 'Payment received recorded',
	payment_milestone_marked_not_required: 'Payment marked not required',
	payment_milestone_corrected: 'Payment evidence corrected',
	payment_follow_up_created: 'Payment follow-up added'
};

export function leadStageLabel(stage: string) {
	return leadStageLabels[stage] ?? 'Status unavailable';
}

export function leadStageMeaning(stage: string) {
	return leadStageMeanings[stage] ?? 'This enquiry status is unavailable.';
}

export function followUpLabel(state: string) {
	return followUpLabels[state] ?? 'Follow-up status unavailable';
}

export function quoteStatusLabel(status: string) {
	return quoteStatusLabels[status] ?? 'Status unavailable';
}

export function taskTypeLabel(type: string) {
	return taskTypeLabels[type] ?? 'Other follow-up';
}

export function taskStatusLabel(status: string) {
	return taskStatusLabels[status] ?? 'Status unavailable';
}

export function fulfilmentCaseStatusLabel(status: string) {
	return fulfilmentCaseStatusLabels[status] ?? 'Status unavailable';
}

export function fulfilmentStepTypeLabel(type: string) {
	return fulfilmentStepTypeLabels[type] ?? 'Operational work';
}

export function fulfilmentStepStatusLabel(status: string) {
	return fulfilmentStepStatusLabels[status] ?? 'Status unavailable';
}

export function fulfilmentPaymentTypeLabel(type: string) {
	return fulfilmentPaymentTypeLabels[type] ?? 'Payment milestone';
}

export function fulfilmentPaymentStatusLabel(status: string) {
	return fulfilmentPaymentStatusLabels[status] ?? 'Status unavailable';
}

export function activityEventLabel(eventType: string) {
	return activityEventLabels[eventType] ?? 'History event';
}
