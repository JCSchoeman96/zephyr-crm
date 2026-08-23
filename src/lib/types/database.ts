export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
	public: {
		Tables: {
			activities: {
				Row: {
					actor_id: string | null;
					client_id: string | null;
					created_at: string;
					event_type: string;
					id: string;
					lead_id: string | null;
					metadata: Json;
					occurred_at: string;
					outbound_message_id: string | null;
					quote_id: string | null;
					summary: string;
					task_id: string | null;
				};
				Insert: {
					actor_id?: string | null;
					client_id?: string | null;
					created_at?: string;
					event_type: string;
					id?: string;
					lead_id?: string | null;
					metadata?: Json;
					occurred_at?: string;
					outbound_message_id?: string | null;
					quote_id?: string | null;
					summary: string;
					task_id?: string | null;
				};
				Update: {
					actor_id?: string | null;
					client_id?: string | null;
					created_at?: string;
					event_type?: string;
					id?: string;
					lead_id?: string | null;
					metadata?: Json;
					occurred_at?: string;
					outbound_message_id?: string | null;
					quote_id?: string | null;
					summary?: string;
					task_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'activities_actor_id_fkey';
						columns: ['actor_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_outbound_message_id_fkey';
						columns: ['outbound_message_id'];
						isOneToOne: false;
						referencedRelation: 'outbound_messages';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_quote_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'task_work_queue';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'activities_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			app_settings: {
				Row: {
					created_at: string;
					description: string | null;
					setting_key: string;
					setting_value: Json;
					updated_at: string;
					updated_by: string | null;
				};
				Insert: {
					created_at?: string;
					description?: string | null;
					setting_key: string;
					setting_value?: Json;
					updated_at?: string;
					updated_by?: string | null;
				};
				Update: {
					created_at?: string;
					description?: string | null;
					setting_key?: string;
					setting_value?: Json;
					updated_at?: string;
					updated_by?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'app_settings_updated_by_fkey';
						columns: ['updated_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			automation_runs: {
				Row: {
					claims_count: number;
					created_tasks: number;
					error_message: string | null;
					expired_quotes: number;
					failed_count: number;
					finished_at: string | null;
					run_id: string;
					sent_count: number;
					started_at: string;
					status: string;
					unknown_count: number;
				};
				Insert: {
					claims_count?: number;
					created_tasks?: number;
					error_message?: string | null;
					expired_quotes?: number;
					failed_count?: number;
					finished_at?: string | null;
					run_id: string;
					sent_count?: number;
					started_at?: string;
					status?: string;
					unknown_count?: number;
				};
				Update: {
					claims_count?: number;
					created_tasks?: number;
					error_message?: string | null;
					expired_quotes?: number;
					failed_count?: number;
					finished_at?: string | null;
					run_id?: string;
					sent_count?: number;
					started_at?: string;
					status?: string;
					unknown_count?: number;
				};
				Relationships: [];
			};
			client_contacts: {
				Row: {
					client_id: string;
					created_at: string;
					email: string | null;
					first_name: string;
					id: string;
					is_primary: boolean;
					job_title: string | null;
					last_name: string;
					phone: string | null;
					phone_normalized: string | null;
					updated_at: string;
				};
				Insert: {
					client_id: string;
					created_at?: string;
					email?: string | null;
					first_name: string;
					id?: string;
					is_primary?: boolean;
					job_title?: string | null;
					last_name?: string;
					phone?: string | null;
					phone_normalized?: string | null;
					updated_at?: string;
				};
				Update: {
					client_id?: string;
					created_at?: string;
					email?: string | null;
					first_name?: string;
					id?: string;
					is_primary?: boolean;
					job_title?: string | null;
					last_name?: string;
					phone?: string | null;
					phone_normalized?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'client_contacts_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					}
				];
			};
			clients: {
				Row: {
					billing_address: string | null;
					billing_address_line_1: string | null;
					billing_address_line_2: string | null;
					billing_city: string | null;
					billing_country: string | null;
					billing_postal_code: string | null;
					billing_region: string | null;
					client_number: number;
					company_name: string | null;
					converted_at: string | null;
					created_at: string;
					display_name: string;
					email: string | null;
					id: string;
					phone: string | null;
					phone_normalized: string | null;
					registration_number: string | null;
					source_lead_id: string | null;
					status: string;
					tax_number: string | null;
					type: string;
					updated_at: string;
				};
				Insert: {
					billing_address?: string | null;
					billing_address_line_1?: string | null;
					billing_address_line_2?: string | null;
					billing_city?: string | null;
					billing_country?: string | null;
					billing_postal_code?: string | null;
					billing_region?: string | null;
					client_number?: number;
					company_name?: string | null;
					converted_at?: string | null;
					created_at?: string;
					display_name: string;
					email?: string | null;
					id?: string;
					phone?: string | null;
					phone_normalized?: string | null;
					registration_number?: string | null;
					source_lead_id?: string | null;
					status?: string;
					tax_number?: string | null;
					type: string;
					updated_at?: string;
				};
				Update: {
					billing_address?: string | null;
					billing_address_line_1?: string | null;
					billing_address_line_2?: string | null;
					billing_city?: string | null;
					billing_country?: string | null;
					billing_postal_code?: string | null;
					billing_region?: string | null;
					client_number?: number;
					company_name?: string | null;
					converted_at?: string | null;
					created_at?: string;
					display_name?: string;
					email?: string | null;
					id?: string;
					phone?: string | null;
					phone_normalized?: string | null;
					registration_number?: string | null;
					source_lead_id?: string | null;
					status?: string;
					tax_number?: string | null;
					type?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'clients_source_lead_id_fkey';
						columns: ['source_lead_id'];
						isOneToOne: true;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'clients_source_lead_id_fkey';
						columns: ['source_lead_id'];
						isOneToOne: true;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					}
				];
			};
			inbound_submissions: {
				Row: {
					error_message: string | null;
					external_submission_id: string;
					form_id: string | null;
					id: string;
					intake_state: string;
					lead_id: string | null;
					payload_hash: string;
					processed_at: string | null;
					received_at: string;
					source: string;
				};
				Insert: {
					error_message?: string | null;
					external_submission_id: string;
					form_id?: string | null;
					id?: string;
					intake_state?: string;
					lead_id?: string | null;
					payload_hash: string;
					processed_at?: string | null;
					received_at?: string;
					source: string;
				};
				Update: {
					error_message?: string | null;
					external_submission_id?: string;
					form_id?: string | null;
					id?: string;
					intake_state?: string;
					lead_id?: string | null;
					payload_hash?: string;
					processed_at?: string | null;
					received_at?: string;
					source?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'inbound_submissions_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'inbound_submissions_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					}
				];
			};
			lead_sources: {
				Row: {
					active: boolean;
					code: string;
					created_at: string;
					id: string;
					label: string;
					sort_order: number;
					updated_at: string;
				};
				Insert: {
					active?: boolean;
					code: string;
					created_at?: string;
					id?: string;
					label: string;
					sort_order?: number;
					updated_at?: string;
				};
				Update: {
					active?: boolean;
					code?: string;
					created_at?: string;
					id?: string;
					label?: string;
					sort_order?: number;
					updated_at?: string;
				};
				Relationships: [];
			};
			leads: {
				Row: {
					assigned_to: string | null;
					attention_reason: string | null;
					attention_resume_at: string | null;
					attention_state: string;
					company: string | null;
					converted_client_id: string | null;
					created_at: string;
					email: string | null;
					external_submission_id: string | null;
					first_name: string;
					id: string;
					landing_page: string | null;
					last_activity_at: string | null;
					last_name: string;
					lead_number: number;
					lock_version: number;
					lost_notes: string | null;
					lost_reason_id: string | null;
					message: string | null;
					pause_reason: string | null;
					paused_at: string | null;
					phone: string | null;
					phone_normalized: string | null;
					pipeline_stage: string;
					referrer: string | null;
					resume_at: string | null;
					source_id: string | null;
					updated_at: string;
					utm_campaign: string | null;
					utm_content: string | null;
					utm_medium: string | null;
					utm_source: string | null;
					utm_term: string | null;
				};
				Insert: {
					assigned_to?: string | null;
					attention_reason?: string | null;
					attention_resume_at?: string | null;
					attention_state?: string;
					company?: string | null;
					converted_client_id?: string | null;
					created_at?: string;
					email?: string | null;
					external_submission_id?: string | null;
					first_name: string;
					id?: string;
					landing_page?: string | null;
					last_activity_at?: string | null;
					last_name?: string;
					lead_number?: number;
					lock_version?: number;
					lost_notes?: string | null;
					lost_reason_id?: string | null;
					message?: string | null;
					pause_reason?: string | null;
					paused_at?: string | null;
					phone?: string | null;
					phone_normalized?: string | null;
					pipeline_stage?: string;
					referrer?: string | null;
					resume_at?: string | null;
					source_id?: string | null;
					updated_at?: string;
					utm_campaign?: string | null;
					utm_content?: string | null;
					utm_medium?: string | null;
					utm_source?: string | null;
					utm_term?: string | null;
				};
				Update: {
					assigned_to?: string | null;
					attention_reason?: string | null;
					attention_resume_at?: string | null;
					attention_state?: string;
					company?: string | null;
					converted_client_id?: string | null;
					created_at?: string;
					email?: string | null;
					external_submission_id?: string | null;
					first_name?: string;
					id?: string;
					landing_page?: string | null;
					last_activity_at?: string | null;
					last_name?: string;
					lead_number?: number;
					lock_version?: number;
					lost_notes?: string | null;
					lost_reason_id?: string | null;
					message?: string | null;
					pause_reason?: string | null;
					paused_at?: string | null;
					phone?: string | null;
					phone_normalized?: string | null;
					pipeline_stage?: string;
					referrer?: string | null;
					resume_at?: string | null;
					source_id?: string | null;
					updated_at?: string;
					utm_campaign?: string | null;
					utm_content?: string | null;
					utm_medium?: string | null;
					utm_source?: string | null;
					utm_term?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'leads_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'leads_converted_client_id_fkey';
						columns: ['converted_client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'leads_lost_reason_id_fkey';
						columns: ['lost_reason_id'];
						isOneToOne: false;
						referencedRelation: 'lost_reasons';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'leads_source_id_fkey';
						columns: ['source_id'];
						isOneToOne: false;
						referencedRelation: 'lead_sources';
						referencedColumns: ['id'];
					}
				];
			};
			lost_reasons: {
				Row: {
					active: boolean;
					code: string;
					created_at: string;
					id: string;
					label: string;
					sort_order: number;
					updated_at: string;
				};
				Insert: {
					active?: boolean;
					code: string;
					created_at?: string;
					id?: string;
					label: string;
					sort_order?: number;
					updated_at?: string;
				};
				Update: {
					active?: boolean;
					code?: string;
					created_at?: string;
					id?: string;
					label?: string;
					sort_order?: number;
					updated_at?: string;
				};
				Relationships: [];
			};
			message_events: {
				Row: {
					created_at: string;
					deduplication_hash: string;
					event_type: string;
					id: string;
					metadata: Json;
					occurred_at: string;
					outbound_message_id: string;
					provider_event_id: string | null;
				};
				Insert: {
					created_at?: string;
					deduplication_hash: string;
					event_type: string;
					id?: string;
					metadata?: Json;
					occurred_at: string;
					outbound_message_id: string;
					provider_event_id?: string | null;
				};
				Update: {
					created_at?: string;
					deduplication_hash?: string;
					event_type?: string;
					id?: string;
					metadata?: Json;
					occurred_at?: string;
					outbound_message_id?: string;
					provider_event_id?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'message_events_outbound_message_id_fkey';
						columns: ['outbound_message_id'];
						isOneToOne: false;
						referencedRelation: 'outbound_messages';
						referencedColumns: ['id'];
					}
				];
			};
			operational_events: {
				Row: {
					created_at: string;
					event_type: string;
					id: string;
					message: string;
					metadata: Json;
					occurred_at: string;
					severity: string;
					source: string;
				};
				Insert: {
					created_at?: string;
					event_type: string;
					id?: string;
					message: string;
					metadata?: Json;
					occurred_at?: string;
					severity: string;
					source: string;
				};
				Update: {
					created_at?: string;
					event_type?: string;
					id?: string;
					message?: string;
					metadata?: Json;
					occurred_at?: string;
					severity?: string;
					source?: string;
				};
				Relationships: [];
			};
			outbound_message_attempts: {
				Row: {
					attempt_number: number;
					created_at: string;
					error_message: string | null;
					id: string;
					idempotency_key: string;
					outbound_message_id: string;
					provider_message_id: string | null;
					request_finished_at: string | null;
					request_started_at: string;
					state: string;
				};
				Insert: {
					attempt_number: number;
					created_at?: string;
					error_message?: string | null;
					id?: string;
					idempotency_key: string;
					outbound_message_id: string;
					provider_message_id?: string | null;
					request_finished_at?: string | null;
					request_started_at?: string;
					state: string;
				};
				Update: {
					attempt_number?: number;
					created_at?: string;
					error_message?: string | null;
					id?: string;
					idempotency_key?: string;
					outbound_message_id?: string;
					provider_message_id?: string | null;
					request_finished_at?: string | null;
					request_started_at?: string;
					state?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'outbound_message_attempts_outbound_message_id_fkey';
						columns: ['outbound_message_id'];
						isOneToOne: false;
						referencedRelation: 'outbound_messages';
						referencedColumns: ['id'];
					}
				];
			};
			outbound_messages: {
				Row: {
					attempt_count: number;
					bounced_at: string | null;
					channel: string;
					client_id: string | null;
					created_at: string;
					delivered_at: string | null;
					delivery_status: string;
					id: string;
					last_error: string | null;
					lead_id: string | null;
					logical_key: string;
					provider: string;
					provider_message_id: string | null;
					purpose: string;
					quote_id: string | null;
					recipient_snapshot: Json;
					subject: string | null;
					submission_unknown_at: string | null;
					submitted_at: string | null;
					task_id: string | null;
					updated_at: string;
				};
				Insert: {
					attempt_count?: number;
					bounced_at?: string | null;
					channel: string;
					client_id?: string | null;
					created_at?: string;
					delivered_at?: string | null;
					delivery_status?: string;
					id?: string;
					last_error?: string | null;
					lead_id?: string | null;
					logical_key: string;
					provider?: string;
					provider_message_id?: string | null;
					purpose: string;
					quote_id?: string | null;
					recipient_snapshot?: Json;
					subject?: string | null;
					submission_unknown_at?: string | null;
					submitted_at?: string | null;
					task_id?: string | null;
					updated_at?: string;
				};
				Update: {
					attempt_count?: number;
					bounced_at?: string | null;
					channel?: string;
					client_id?: string | null;
					created_at?: string;
					delivered_at?: string | null;
					delivery_status?: string;
					id?: string;
					last_error?: string | null;
					lead_id?: string | null;
					logical_key?: string;
					provider?: string;
					provider_message_id?: string | null;
					purpose?: string;
					quote_id?: string | null;
					recipient_snapshot?: Json;
					subject?: string | null;
					submission_unknown_at?: string | null;
					submitted_at?: string | null;
					task_id?: string | null;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'outbound_messages_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'outbound_messages_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'outbound_messages_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'outbound_messages_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_quote_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'outbound_messages_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'outbound_messages_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'task_work_queue';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'outbound_messages_task_id_fkey';
						columns: ['task_id'];
						isOneToOne: false;
						referencedRelation: 'tasks';
						referencedColumns: ['id'];
					}
				];
			};
			profiles: {
				Row: {
					created_at: string;
					email: string;
					full_name: string;
					id: string;
					role: string;
					status: string;
					timezone: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					email: string;
					full_name?: string;
					id: string;
					role?: string;
					status?: string;
					timezone?: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					email?: string;
					full_name?: string;
					id?: string;
					role?: string;
					status?: string;
					timezone?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			quote_items: {
				Row: {
					created_at: string;
					description: string | null;
					id: string;
					line_subtotal: number;
					name: string;
					position: number;
					quantity: number;
					quote_id: string;
					taxable: boolean;
					unit_price: number;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					description?: string | null;
					id?: string;
					line_subtotal: number;
					name: string;
					position: number;
					quantity: number;
					quote_id: string;
					taxable?: boolean;
					unit_price: number;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					description?: string | null;
					id?: string;
					line_subtotal?: number;
					name?: string;
					position?: number;
					quantity?: number;
					quote_id?: string;
					taxable?: boolean;
					unit_price?: number;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'quote_items_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_quote_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quote_items_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					}
				];
			};
			quotes: {
				Row: {
					acceptance_evidence: string | null;
					acceptance_source: string | null;
					accepted_at: string | null;
					accepted_by: string | null;
					base_quote_number: number;
					cancelled_at: string | null;
					client_id: string | null;
					created_at: string;
					created_by: string;
					currency: string;
					declined_at: string | null;
					document_generated_at: string | null;
					document_generator_version: string | null;
					document_hash: string | null;
					document_path: string | null;
					document_template_version: string | null;
					expired_at: string | null;
					id: string;
					introduction: string | null;
					lead_id: string;
					lock_version: number;
					quote_number: string | null;
					quote_prefix: string;
					quote_snapshot: Json;
					quote_year: number;
					ready_at: string | null;
					revision_number: number;
					sent_at: string | null;
					status: string;
					subject: string;
					subtotal: number;
					supersedes_quote_id: string | null;
					tax_amount: number;
					tax_label: string | null;
					tax_rate: number;
					terms: string | null;
					total: number;
					updated_at: string;
					valid_until: string | null;
				};
				Insert: {
					acceptance_evidence?: string | null;
					acceptance_source?: string | null;
					accepted_at?: string | null;
					accepted_by?: string | null;
					base_quote_number?: number;
					cancelled_at?: string | null;
					client_id?: string | null;
					created_at?: string;
					created_by: string;
					currency?: string;
					declined_at?: string | null;
					document_generated_at?: string | null;
					document_generator_version?: string | null;
					document_hash?: string | null;
					document_path?: string | null;
					document_template_version?: string | null;
					expired_at?: string | null;
					id?: string;
					introduction?: string | null;
					lead_id: string;
					lock_version?: number;
					quote_number?: string | null;
					quote_prefix?: string;
					quote_snapshot?: Json;
					quote_year?: number;
					ready_at?: string | null;
					revision_number?: number;
					sent_at?: string | null;
					status?: string;
					subject: string;
					subtotal?: number;
					supersedes_quote_id?: string | null;
					tax_amount?: number;
					tax_label?: string | null;
					tax_rate?: number;
					terms?: string | null;
					total?: number;
					updated_at?: string;
					valid_until?: string | null;
				};
				Update: {
					acceptance_evidence?: string | null;
					acceptance_source?: string | null;
					accepted_at?: string | null;
					accepted_by?: string | null;
					base_quote_number?: number;
					cancelled_at?: string | null;
					client_id?: string | null;
					created_at?: string;
					created_by?: string;
					currency?: string;
					declined_at?: string | null;
					document_generated_at?: string | null;
					document_generator_version?: string | null;
					document_hash?: string | null;
					document_path?: string | null;
					document_template_version?: string | null;
					expired_at?: string | null;
					id?: string;
					introduction?: string | null;
					lead_id?: string;
					lock_version?: number;
					quote_number?: string | null;
					quote_prefix?: string;
					quote_snapshot?: Json;
					quote_year?: number;
					ready_at?: string | null;
					revision_number?: number;
					sent_at?: string | null;
					status?: string;
					subject?: string;
					subtotal?: number;
					supersedes_quote_id?: string | null;
					tax_amount?: number;
					tax_label?: string | null;
					tax_rate?: number;
					terms?: string | null;
					total?: number;
					updated_at?: string;
					valid_until?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'quotes_accepted_by_fkey';
						columns: ['accepted_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_created_by_fkey';
						columns: ['created_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_supersedes_quote_id_fkey';
						columns: ['supersedes_quote_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_quote_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_supersedes_quote_id_fkey';
						columns: ['supersedes_quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					}
				];
			};
			security_audit_events: {
				Row: {
					action: string;
					actor_id: string | null;
					id: string;
					metadata: Json;
					occurred_at: string;
					target_id: string | null;
					target_type: string;
				};
				Insert: {
					action: string;
					actor_id?: string | null;
					id?: string;
					metadata?: Json;
					occurred_at?: string;
					target_id?: string | null;
					target_type: string;
				};
				Update: {
					action?: string;
					actor_id?: string | null;
					id?: string;
					metadata?: Json;
					occurred_at?: string;
					target_id?: string | null;
					target_type?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'security_audit_events_actor_id_fkey';
						columns: ['actor_id'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					}
				];
			};
			tasks: {
				Row: {
					assigned_to: string | null;
					automation_key: string | null;
					cancelled_at: string | null;
					client_id: string | null;
					completed_at: string | null;
					created_at: string;
					created_by: string;
					description: string | null;
					due_at: string | null;
					id: string;
					lead_id: string | null;
					lock_version: number;
					notification_sent_at: string | null;
					quote_id: string | null;
					reminder_attempt_count: number;
					reminder_claim_id: string | null;
					reminder_claimed_at: string | null;
					reminder_last_error: string | null;
					reminder_outbound_message_id: string | null;
					reminder_status: string;
					status: string;
					title: string;
					type: string;
					updated_at: string;
				};
				Insert: {
					assigned_to?: string | null;
					automation_key?: string | null;
					cancelled_at?: string | null;
					client_id?: string | null;
					completed_at?: string | null;
					created_at?: string;
					created_by: string;
					description?: string | null;
					due_at?: string | null;
					id?: string;
					lead_id?: string | null;
					lock_version?: number;
					notification_sent_at?: string | null;
					quote_id?: string | null;
					reminder_attempt_count?: number;
					reminder_claim_id?: string | null;
					reminder_claimed_at?: string | null;
					reminder_last_error?: string | null;
					reminder_outbound_message_id?: string | null;
					reminder_status?: string;
					status?: string;
					title: string;
					type: string;
					updated_at?: string;
				};
				Update: {
					assigned_to?: string | null;
					automation_key?: string | null;
					cancelled_at?: string | null;
					client_id?: string | null;
					completed_at?: string | null;
					created_at?: string;
					created_by?: string;
					description?: string | null;
					due_at?: string | null;
					id?: string;
					lead_id?: string | null;
					lock_version?: number;
					notification_sent_at?: string | null;
					quote_id?: string | null;
					reminder_attempt_count?: number;
					reminder_claim_id?: string | null;
					reminder_claimed_at?: string | null;
					reminder_last_error?: string | null;
					reminder_outbound_message_id?: string | null;
					reminder_status?: string;
					status?: string;
					title?: string;
					type?: string;
					updated_at?: string;
				};
				Relationships: [
					{
						foreignKeyName: 'tasks_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_created_by_fkey';
						columns: ['created_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_quote_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_reminder_outbound_message_id_fkey';
						columns: ['reminder_outbound_message_id'];
						isOneToOne: false;
						referencedRelation: 'outbound_messages';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: {
			dashboard_lead_facts: {
				Row: {
					attention_state: string | null;
					converted_client_id: string | null;
					created_at: string | null;
					has_follow_up: boolean | null;
					id: string | null;
					is_overdue: boolean | null;
					last_activity_at: string | null;
					lost_reason_id: string | null;
					next_task_due_at: string | null;
					pipeline_stage: string | null;
					source_code: string | null;
					source_label: string | null;
					updated_at: string | null;
					utm_campaign: string | null;
					utm_content: string | null;
					utm_medium: string | null;
					utm_source: string | null;
					utm_term: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'leads_converted_client_id_fkey';
						columns: ['converted_client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'leads_lost_reason_id_fkey';
						columns: ['lost_reason_id'];
						isOneToOne: false;
						referencedRelation: 'lost_reasons';
						referencedColumns: ['id'];
					}
				];
			};
			dashboard_quote_facts: {
				Row: {
					accepted_at: string | null;
					created_at: string | null;
					currency: string | null;
					id: string | null;
					lead_id: string | null;
					pipeline_stage: string | null;
					sent_at: string | null;
					source_code: string | null;
					status: string | null;
					total: number | null;
					utm_campaign: string | null;
					utm_medium: string | null;
					utm_source: string | null;
					valid_until: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'quotes_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'quotes_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					}
				];
			};
			task_work_queue: {
				Row: {
					assigned_to: string | null;
					automation_key: string | null;
					cancelled_at: string | null;
					client_id: string | null;
					completed_at: string | null;
					created_at: string | null;
					created_by: string | null;
					derived_state: string | null;
					description: string | null;
					due_at: string | null;
					id: string | null;
					is_due: boolean | null;
					is_overdue: boolean | null;
					lead_id: string | null;
					lock_version: number | null;
					notification_sent_at: string | null;
					quote_id: string | null;
					reminder_attempt_count: number | null;
					reminder_claim_id: string | null;
					reminder_claimed_at: string | null;
					reminder_last_error: string | null;
					reminder_outbound_message_id: string | null;
					reminder_status: string | null;
					status: string | null;
					title: string | null;
					type: string | null;
					updated_at: string | null;
				};
				Insert: {
					assigned_to?: string | null;
					automation_key?: string | null;
					cancelled_at?: string | null;
					client_id?: string | null;
					completed_at?: string | null;
					created_at?: string | null;
					created_by?: string | null;
					derived_state?: never;
					description?: string | null;
					due_at?: string | null;
					id?: string | null;
					is_due?: never;
					is_overdue?: never;
					lead_id?: string | null;
					lock_version?: number | null;
					notification_sent_at?: string | null;
					quote_id?: string | null;
					reminder_attempt_count?: number | null;
					reminder_claim_id?: string | null;
					reminder_claimed_at?: string | null;
					reminder_last_error?: string | null;
					reminder_outbound_message_id?: string | null;
					reminder_status?: string | null;
					status?: string | null;
					title?: string | null;
					type?: string | null;
					updated_at?: string | null;
				};
				Update: {
					assigned_to?: string | null;
					automation_key?: string | null;
					cancelled_at?: string | null;
					client_id?: string | null;
					completed_at?: string | null;
					created_at?: string | null;
					created_by?: string | null;
					derived_state?: never;
					description?: string | null;
					due_at?: string | null;
					id?: string | null;
					is_due?: never;
					is_overdue?: never;
					lead_id?: string | null;
					lock_version?: number | null;
					notification_sent_at?: string | null;
					quote_id?: string | null;
					reminder_attempt_count?: number | null;
					reminder_claim_id?: string | null;
					reminder_claimed_at?: string | null;
					reminder_last_error?: string | null;
					reminder_outbound_message_id?: string | null;
					reminder_status?: string | null;
					status?: string | null;
					title?: string | null;
					type?: string | null;
					updated_at?: string | null;
				};
				Relationships: [
					{
						foreignKeyName: 'tasks_assigned_to_fkey';
						columns: ['assigned_to'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_client_id_fkey';
						columns: ['client_id'];
						isOneToOne: false;
						referencedRelation: 'clients';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_created_by_fkey';
						columns: ['created_by'];
						isOneToOne: false;
						referencedRelation: 'profiles';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_lead_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_lead_id_fkey';
						columns: ['lead_id'];
						isOneToOne: false;
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'dashboard_quote_facts';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_reminder_outbound_message_id_fkey';
						columns: ['reminder_outbound_message_id'];
						isOneToOne: false;
						referencedRelation: 'outbound_messages';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Functions: {
			accept_quote:
				| {
						Args: { p_lock_version: number; p_quote_id: string };
						Returns: Json;
				  }
				| {
						Args: {
							p_acceptance_evidence?: string;
							p_acceptance_source: string;
							p_lock_version: number;
							p_quote_id: string;
						};
						Returns: Json;
				  };
			add_activity_note: {
				Args: {
					p_client_id?: string;
					p_lead_id?: string;
					p_metadata?: Json;
					p_outbound_message_id?: string;
					p_quote_id?: string;
					p_summary?: string;
					p_task_id?: string;
				};
				Returns: Json;
			};
			assign_lead: {
				Args: {
					p_assigned_to: string;
					p_lead_id: string;
					p_lock_version: number;
				};
				Returns: Json;
			};
			attach_quote_document: {
				Args: {
					p_document_hash: string;
					p_document_path: string;
					p_lock_version: number;
					p_quote_id: string;
				};
				Returns: Json;
			};
			cancel_quote: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			cancel_task: {
				Args: { p_lock_version: number; p_task_id: string };
				Returns: Json;
			};
			complete_quote_send: {
				Args: { p_outbound_message_id: string; p_provider_message_id: string };
				Returns: Json;
			};
			complete_task: {
				Args: { p_lock_version: number; p_task_id: string };
				Returns: Json;
			};
			convert_lead: {
				Args: { p_lead_id: string; p_lock_version: number };
				Returns: Json;
			};
			create_minimal_quote: {
				Args: {
					p_item_name: string;
					p_lead_id: string;
					p_quantity: number;
					p_subject: string;
					p_tax_rate?: number;
					p_unit_price: number;
				};
				Returns: Json;
			};
			create_task: {
				Args: {
					p_assigned_to?: string;
					p_automation_key?: string;
					p_client_id?: string;
					p_description?: string;
					p_due_at?: string;
					p_lead_id?: string;
					p_quote_id?: string;
					p_title?: string;
					p_type?: string;
				};
				Returns: Json;
			};
			dashboard_attribution: {
				Args: { p_from?: string; p_limit?: number; p_to?: string };
				Returns: Json;
			};
			dashboard_lost_analysis: {
				Args: { p_from?: string; p_limit?: number; p_to?: string };
				Returns: Json;
			};
			dashboard_operational_summary: {
				Args: { p_from?: string; p_to?: string };
				Returns: Json;
			};
			dashboard_sales_kpis: {
				Args: { p_from?: string; p_to?: string };
				Returns: Json;
			};
			decline_quote: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			expire_quote: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			fail_quote_send: {
				Args: { p_error: string; p_outbound_message_id: string };
				Returns: Json;
			};
			ingest_bricks_lead: {
				Args: {
					p_external_submission_id: string;
					p_form_id: string;
					p_payload: Json;
				};
				Returns: Json;
			};
			mark_quote_ready: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			mark_quote_send_unknown: {
				Args: { p_error: string; p_outbound_message_id: string };
				Returns: Json;
			};
			mark_task_reminder_unknown: {
				Args: {
					p_error?: string;
					p_provider_message_id?: string;
					p_run_id: string;
					p_task_id: string;
				};
				Returns: Json;
			};
			operational_diagnostics: { Args: never; Returns: Json };
			pause_lead: {
				Args: {
					p_lead_id: string;
					p_lock_version?: number;
					p_reason: string;
					p_resume_at?: string;
				};
				Returns: Json;
			};
			prepare_quote_send: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			prepare_task_reminder: {
				Args: { p_run_id: string; p_task_id: string };
				Returns: Json;
			};
			process_reminders: {
				Args: { p_limit?: number; p_run_id: string };
				Returns: Json;
			};
			process_sendpulse_event: {
				Args: {
					p_deduplication_hash: string;
					p_event_type: string;
					p_metadata: Json;
					p_occurred_at: string;
					p_provider_event_id: string;
					p_provider_message_id: string;
				};
				Returns: Json;
			};
			provision_invited_profile: {
				Args: { p_role?: string; p_status?: string; p_user_id: string };
				Returns: Json;
			};
			reconcile_quote_submission: {
				Args: { p_logical_key: string; p_provider_message_id: string };
				Returns: Json;
			};
			reconcile_task_reminder: {
				Args: { p_provider_message_id: string; p_task_id: string };
				Returns: Json;
			};
			record_bricks_rejection: {
				Args: {
					p_error_message: string;
					p_external_submission_id: string;
					p_form_id: string;
					p_payload: Json;
				};
				Returns: Json;
			};
			record_quote_send_ack: {
				Args: {
					p_error?: string;
					p_outbound_message_id: string;
					p_provider_message_id: string;
				};
				Returns: Json;
			};
			record_task_reminder: {
				Args: {
					p_error?: string;
					p_provider_message_id?: string;
					p_run_id: string;
					p_task_id: string;
				};
				Returns: Json;
			};
			reopen_lead: {
				Args: { p_lead_id: string; p_lock_version: number; p_reason: string };
				Returns: Json;
			};
			reschedule_task: {
				Args: { p_due_at: string; p_lock_version: number; p_task_id: string };
				Returns: Json;
			};
			resume_lead: {
				Args: { p_lead_id: string; p_lock_version?: number };
				Returns: Json;
			};
			revise_quote: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			save_quote_draft: {
				Args: {
					p_client_id: string;
					p_currency: string;
					p_introduction: string;
					p_items: Json;
					p_lead_id: string;
					p_lock_version: number;
					p_quote_id: string;
					p_subject: string;
					p_tax_label: string;
					p_tax_rate: number;
					p_terms: string;
					p_valid_until: string;
				};
				Returns: Json;
			};
			set_app_setting: {
				Args: {
					p_description?: string;
					p_setting_key: string;
					p_setting_value: Json;
				};
				Returns: Json;
			};
			set_lead_attention: {
				Args: {
					p_attention_state: string;
					p_lead_id: string;
					p_lock_version?: number;
					p_reason?: string;
					p_resume_at?: string;
				};
				Returns: Json;
			};
			set_profile_access: {
				Args: {
					p_reason?: string;
					p_role: string;
					p_status: string;
					p_user_id: string;
				};
				Returns: Json;
			};
			start_task_reminder: {
				Args: { p_run_id: string; p_task_id: string };
				Returns: Json;
			};
			supersede_quote: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			transition_lead: {
				Args: {
					p_lead_id: string;
					p_lock_version: number;
					p_lost_notes?: string;
					p_lost_reason_id?: string;
					p_to_stage: string;
				};
				Returns: Json;
			};
			transition_quote_status: {
				Args: {
					p_lock_version: number;
					p_quote_id: string;
					p_to_status: string;
				};
				Returns: Json;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
		? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
	TableName extends (DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
		: never) = never
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
		? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
	EnumName extends (DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
		: never) = never
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
		? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
		: never) = never
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
		? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	public: {
		Enums: {}
	}
} as const;
