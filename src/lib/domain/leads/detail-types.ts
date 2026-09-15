import type { Database } from '$lib/types/database';

export type LeadDetailLead = Database['public']['Tables']['leads']['Row'];
export type LeadDetailQuote = Database['public']['Tables']['quotes']['Row'];
export type LeadDetailTask = Database['public']['Tables']['tasks']['Row'];
export type LeadDetailActivity = Database['public']['Tables']['activities']['Row'];
export type LeadDetailStaff = Pick<
	Database['public']['Tables']['profiles']['Row'],
	'id' | 'full_name' | 'email' | 'role' | 'status'
>;
export type LeadDetailFulfilment = Pick<
	Database['public']['Tables']['fulfilment_cases']['Row'],
	'id' | 'status'
>;
export type LeadDetailCurrentQuote = Pick<
	LeadDetailQuote,
	'id' | 'status' | 'subject' | 'quote_number'
>;
