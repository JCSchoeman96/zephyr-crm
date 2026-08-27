import { describe, expect, it } from 'vitest';
import {
	activityEventLabel,
	fulfilmentCaseStatusLabel,
	fulfilmentPaymentStatusLabel,
	fulfilmentPaymentTypeLabel,
	fulfilmentStepStatusLabel,
	fulfilmentStepTypeLabel,
	leadStageLabel,
	leadStageMeaning,
	quoteStatusLabel,
	taskStatusLabel,
	taskTypeLabel,
	followUpLabel
} from './labels';

describe('presentation labels', () => {
	it('translates every ordinary lead status without exposing enum values', () => {
		expect(leadStageLabel('NEW')).toBe('New enquiry');
		expect(leadStageLabel('QUALIFICATION')).toBe('Reviewing details');
		expect(leadStageLabel('PROPOSAL')).toBe('Preparing quote');
		expect(leadStageLabel('DECISION')).toBe('Quote sent');
		expect(leadStageLabel('WON')).toBe('Customer confirmed');
		expect(leadStageLabel('LOST')).toBe('Not proceeding');
		expect(leadStageLabel('UNKNOWN')).toBe('Status unavailable');
	});

	it('provides practical lead status meaning and follow-up labels', () => {
		expect(leadStageMeaning('NEW')).toContain('needs to be reviewed');
		expect(followUpLabel('none')).toBe('No follow-up needed');
		expect(followUpLabel('waiting_on_us')).toBe('We need to respond');
		expect(followUpLabel('waiting_on_client')).toBe('Waiting for customer');
		expect(followUpLabel('unexpected')).toBe('Follow-up status unavailable');
	});

	it('translates quote and task statuses and types', () => {
		expect(quoteStatusLabel('ready')).toBe('Ready to send');
		expect(quoteStatusLabel('superseded')).toBe('Replaced');
		expect(taskStatusLabel('open')).toBe('Open');
		expect(taskStatusLabel('cancelled')).toBe('Cancelled');
		expect(taskTypeLabel('review_lead')).toBe('Review enquiry');
		expect(taskTypeLabel('call_client')).toBe('Call customer');
		expect(taskTypeLabel('payment_follow_up')).toBe('Payment follow-up');
		expect(taskTypeLabel('unexpected')).toBe('Other follow-up');
	});

	it('translates fulfilment work and history labels', () => {
		expect(fulfilmentCaseStatusLabel('open')).toBe('Open');
		expect(fulfilmentCaseStatusLabel('completed')).toBe('Completed');
		expect(fulfilmentStepTypeLabel('installation')).toBe('Installation');
		expect(fulfilmentStepStatusLabel('awaiting_schedule')).toBe('Awaiting schedule');
		expect(fulfilmentStepStatusLabel('ready_for_collection')).toBe('Ready for collection');
		expect(fulfilmentPaymentTypeLabel('final_balance')).toBe('Final balance');
		expect(fulfilmentPaymentStatusLabel('not_required')).toBe('Not required');
		expect(activityEventLabel('lead_reopened')).toBe('Enquiry reopened');
		expect(activityEventLabel('unexpected_event')).toBe('History event');
	});
});
