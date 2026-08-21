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
						referencedRelation: 'quotes';
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
					phone: string | null;
					pipeline_stage: string;
					referrer: string | null;
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
					phone?: string | null;
					pipeline_stage?: string;
					referrer?: string | null;
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
					phone?: string | null;
					pipeline_stage?: string;
					referrer?: string | null;
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
					provider: string;
					provider_message_id: string | null;
					purpose: string;
					quote_id: string | null;
					recipient_snapshot: Json;
					subject: string | null;
					submitted_at: string | null;
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
					provider?: string;
					provider_message_id?: string | null;
					purpose: string;
					quote_id?: string | null;
					recipient_snapshot?: Json;
					subject?: string | null;
					submitted_at?: string | null;
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
					provider?: string;
					provider_message_id?: string | null;
					purpose?: string;
					quote_id?: string | null;
					recipient_snapshot?: Json;
					subject?: string | null;
					submitted_at?: string | null;
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
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'outbound_messages_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
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
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					}
				];
			};
			quotes: {
				Row: {
					accepted_at: string | null;
					base_quote_number: number;
					cancelled_at: string | null;
					client_id: string | null;
					created_at: string;
					created_by: string;
					currency: string;
					declined_at: string | null;
					document_generated_at: string | null;
					document_hash: string | null;
					document_path: string | null;
					expired_at: string | null;
					id: string;
					introduction: string | null;
					lead_id: string;
					lock_version: number;
					quote_number: string | null;
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
					accepted_at?: string | null;
					base_quote_number?: number;
					cancelled_at?: string | null;
					client_id?: string | null;
					created_at?: string;
					created_by: string;
					currency?: string;
					declined_at?: string | null;
					document_generated_at?: string | null;
					document_hash?: string | null;
					document_path?: string | null;
					expired_at?: string | null;
					id?: string;
					introduction?: string | null;
					lead_id: string;
					lock_version?: number;
					quote_number?: string | null;
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
					accepted_at?: string | null;
					base_quote_number?: number;
					cancelled_at?: string | null;
					client_id?: string | null;
					created_at?: string;
					created_by?: string;
					currency?: string;
					declined_at?: string | null;
					document_generated_at?: string | null;
					document_hash?: string | null;
					document_path?: string | null;
					expired_at?: string | null;
					id?: string;
					introduction?: string | null;
					lead_id?: string;
					lock_version?: number;
					quote_number?: string | null;
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
						referencedRelation: 'leads';
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
			tasks: {
				Row: {
					assigned_to: string | null;
					cancelled_at: string | null;
					client_id: string | null;
					completed_at: string | null;
					created_at: string;
					created_by: string;
					description: string | null;
					due_at: string | null;
					id: string;
					lead_id: string | null;
					notification_sent_at: string | null;
					quote_id: string | null;
					status: string;
					title: string;
					type: string;
					updated_at: string;
				};
				Insert: {
					assigned_to?: string | null;
					cancelled_at?: string | null;
					client_id?: string | null;
					completed_at?: string | null;
					created_at?: string;
					created_by: string;
					description?: string | null;
					due_at?: string | null;
					id?: string;
					lead_id?: string | null;
					notification_sent_at?: string | null;
					quote_id?: string | null;
					status?: string;
					title: string;
					type: string;
					updated_at?: string;
				};
				Update: {
					assigned_to?: string | null;
					cancelled_at?: string | null;
					client_id?: string | null;
					completed_at?: string | null;
					created_at?: string;
					created_by?: string;
					description?: string | null;
					due_at?: string | null;
					id?: string;
					lead_id?: string | null;
					notification_sent_at?: string | null;
					quote_id?: string | null;
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
						referencedRelation: 'leads';
						referencedColumns: ['id'];
					},
					{
						foreignKeyName: 'tasks_quote_id_fkey';
						columns: ['quote_id'];
						isOneToOne: false;
						referencedRelation: 'quotes';
						referencedColumns: ['id'];
					}
				];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			accept_quote: {
				Args: { p_lock_version: number; p_quote_id: string };
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
			complete_quote_send: {
				Args: { p_outbound_message_id: string; p_provider_message_id: string };
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
					p_quantity: number | string;
					p_subject: string;
					p_tax_rate?: number | string;
					p_unit_price: number | string;
				};
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
			prepare_quote_send: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			process_sendpulse_event: {
				Args: {
					p_deduplication_hash: string;
					p_event_type: string;
					p_metadata: Json;
					p_occurred_at: string;
					p_provider_event_id: string | null;
					p_provider_message_id: string;
				};
				Returns: Json;
			};
			provision_invited_profile: {
				Args: { p_role?: string; p_status?: string; p_user_id: string };
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
			reopen_lead: {
				Args: { p_lead_id: string; p_lock_version: number; p_reason: string };
				Returns: Json;
			};
			revise_quote: {
				Args: { p_lock_version: number; p_quote_id: string };
				Returns: Json;
			};
			save_quote_draft: {
				Args: {
					p_client_id: string | null;
					p_currency: string;
					p_introduction: string | null;
					p_items: Json;
					p_lead_id: string;
					p_lock_version: number | null;
					p_quote_id: string | null;
					p_subject: string;
					p_tax_label: string | null;
					p_tax_rate: number | string;
					p_terms: string | null;
					p_valid_until: string | null;
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
