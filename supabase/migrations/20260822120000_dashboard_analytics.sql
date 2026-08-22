-- Phase 10: bounded, reproducible PostgreSQL dashboard and analytics contracts.

begin;

create or replace function private.validate_dashboard_range(p_from date, p_to date)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
	if p_from is null or p_to is null then
		raise exception using errcode = '22023', message = 'Dashboard date range is required';
	end if;
	if p_to < p_from then
		raise exception using errcode = '22023', message = 'Dashboard end date must not precede start date';
	end if;
	if p_to - p_from > 366 then
		raise exception using errcode = '22023', message = 'Dashboard date range cannot exceed 367 days';
	end if;
end;
$$;

create or replace view public.dashboard_lead_facts
with (security_invoker = true)
as
select
	l.id,
	l.created_at,
	l.updated_at,
	l.last_activity_at,
	l.pipeline_stage,
	l.attention_state,
	l.lost_reason_id,
	l.converted_client_id,
	ls.code as source_code,
	ls.label as source_label,
	l.utm_source,
	l.utm_medium,
	l.utm_campaign,
	l.utm_content,
	l.utm_term
from public.leads l
left join public.lead_sources ls on ls.id = l.source_id;

create or replace view public.dashboard_quote_facts
with (security_invoker = true)
as
select
	q.id,
	q.lead_id,
	q.status,
	q.total,
	q.currency,
	q.created_at,
	q.sent_at,
	q.accepted_at,
	q.valid_until,
	l.pipeline_stage,
	ls.code as source_code,
	l.utm_source,
	l.utm_medium,
	l.utm_campaign
from public.quotes q
join public.leads l on l.id = q.lead_id
left join public.lead_sources ls on ls.id = l.source_id;

create index if not exists leads_dashboard_created_stage_idx
on public.leads (created_at, pipeline_stage, attention_state, id);

create index if not exists quotes_dashboard_sent_idx
on public.quotes (sent_at, lead_id, status, id)
where sent_at is not null;

create index if not exists quotes_dashboard_accepted_idx
on public.quotes (accepted_at, lead_id, id)
where status = 'accepted' and accepted_at is not null;

create or replace function public.dashboard_operational_summary(
	p_from date default current_date - 29,
	p_to date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_new_leads bigint;
	v_overdue_tasks bigint;
	v_due_today bigint;
	v_waiting_on_us bigint;
	v_waiting_on_client bigint;
	v_expiring_quotes bigint;
begin
	perform private.validate_dashboard_range(p_from, p_to);
	select count(*) into v_new_leads
	from public.leads
	where pipeline_stage = 'NEW'
		and created_at >= p_from::timestamptz
		and created_at < (p_to + 1)::timestamptz;
	select count(*) into v_overdue_tasks
	from public.tasks
	where status = 'open'
		and due_at < now()
		and due_at >= p_from::timestamptz
		and due_at < (p_to + 1)::timestamptz;
	select count(*) into v_due_today
	from public.tasks
	where status = 'open'
		and due_at >= current_date::timestamptz
		and due_at < (current_date + 1)::timestamptz
		and current_date between p_from and p_to;
	select count(*) into v_waiting_on_us
	from public.leads
	where pipeline_stage not in ('WON', 'LOST')
		and attention_state = 'waiting_on_us'
		and created_at >= p_from::timestamptz
		and created_at < (p_to + 1)::timestamptz;
	select count(*) into v_waiting_on_client
	from public.leads
	where pipeline_stage not in ('WON', 'LOST')
		and attention_state = 'waiting_on_client'
		and created_at >= p_from::timestamptz
		and created_at < (p_to + 1)::timestamptz;
	select count(*) into v_expiring_quotes
	from public.quotes
	where status = 'sent'
		and valid_until between p_from and p_to;

	return jsonb_build_object(
		'date_from', p_from,
		'date_to', p_to,
		'new_leads', v_new_leads,
		'overdue_tasks', v_overdue_tasks,
		'due_today', v_due_today,
		'waiting_on_us', v_waiting_on_us,
		'waiting_on_client', v_waiting_on_client,
		'expiring_quotes', v_expiring_quotes
	);
end;
$$;

create or replace function public.dashboard_sales_kpis(
	p_from date default current_date - 29,
	p_to date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_new_leads bigint;
	v_quotes_sent bigint;
	v_quote_value numeric(14, 2);
	v_accepted_value numeric(14, 2);
	v_won_leads bigint;
	v_lost_leads bigint;
	v_conversion_rate numeric(7, 2);
	v_pipeline_value numeric(14, 2);
begin
	perform private.validate_dashboard_range(p_from, p_to);
	select count(*) into v_new_leads
	from public.leads
	where created_at >= p_from::timestamptz and created_at < (p_to + 1)::timestamptz;
	select count(*) into v_quotes_sent
	from public.quotes
	where sent_at >= p_from::timestamptz and sent_at < (p_to + 1)::timestamptz;
	select coalesce(sum(total), 0)::numeric(14, 2) into v_quote_value
	from public.quotes
	where sent_at >= p_from::timestamptz and sent_at < (p_to + 1)::timestamptz;
	select coalesce(sum(total), 0)::numeric(14, 2) into v_accepted_value
	from public.quotes
	where status = 'accepted'
		and accepted_at >= p_from::timestamptz
		and accepted_at < (p_to + 1)::timestamptz;
	select count(*) into v_won_leads
	from public.leads
	where pipeline_stage = 'WON'
		and last_activity_at >= p_from::timestamptz
		and last_activity_at < (p_to + 1)::timestamptz;
	select count(*) into v_lost_leads
	from public.leads
	where pipeline_stage = 'LOST'
		and last_activity_at >= p_from::timestamptz
		and last_activity_at < (p_to + 1)::timestamptz;
	v_conversion_rate := case
		when v_won_leads + v_lost_leads = 0 then 0
		else round(v_won_leads::numeric * 100 / (v_won_leads + v_lost_leads), 2)
	end;
	select coalesce(sum(latest.total), 0)::numeric(14, 2) into v_pipeline_value
	from public.leads l
	join lateral (
		select q.total
		from public.quotes q
		where q.lead_id = l.id and q.status in ('ready', 'sent')
		order by q.created_at desc, q.id desc
		limit 1
	) latest on true
	where l.pipeline_stage in ('QUALIFICATION', 'PROPOSAL', 'DECISION')
		and l.created_at >= p_from::timestamptz
		and l.created_at < (p_to + 1)::timestamptz;

	return jsonb_build_object(
		'date_from', p_from,
		'date_to', p_to,
		'new_leads', v_new_leads,
		'quotes_sent', v_quotes_sent,
		'quote_value', v_quote_value,
		'accepted_value', v_accepted_value,
		'won_leads', v_won_leads,
		'lost_leads', v_lost_leads,
		'conversion_rate', v_conversion_rate,
		'pipeline_value', v_pipeline_value
	);
end;
$$;

create or replace function public.dashboard_lost_analysis(
	p_from date default current_date - 29,
	p_to date default current_date,
	p_limit integer default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_limit integer;
	v_by_reason jsonb;
	v_by_source jsonb;
begin
	perform private.validate_dashboard_range(p_from, p_to);
	v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
	select coalesce(jsonb_agg(jsonb_build_object(
		'reason_code', grouped.reason_code,
		'reason_label', grouped.reason_label,
		'lost_count', grouped.lost_count,
		'lost_value', grouped.lost_value
	) order by grouped.lost_count desc, grouped.reason_code), '[]'::jsonb)
	into v_by_reason
	from (
		select
			coalesce(lr.code, 'unknown') as reason_code,
			coalesce(lr.label, 'Unknown') as reason_label,
			count(*)::integer as lost_count,
			coalesce(sum(coalesce(latest.total, 0)), 0)::numeric(14, 2) as lost_value
		from public.leads l
		left join public.lost_reasons lr on lr.id = l.lost_reason_id
		left join lateral (
			select q.total
			from public.quotes q
			where q.lead_id = l.id and q.status <> 'draft'
			order by q.created_at desc, q.id desc
			limit 1
		) latest on true
		where l.pipeline_stage = 'LOST'
			and l.last_activity_at >= p_from::timestamptz
			and l.last_activity_at < (p_to + 1)::timestamptz
		group by lr.code, lr.label
		order by lost_count desc, reason_code
		limit v_limit
	) grouped;

	select coalesce(jsonb_agg(jsonb_build_object(
		'source_code', grouped.source_code,
		'lost_count', grouped.lost_count,
		'lost_value', grouped.lost_value
	) order by grouped.lost_count desc, grouped.source_code), '[]'::jsonb)
	into v_by_source
	from (
		select
			coalesce(ls.code, 'unknown') as source_code,
			count(*)::integer as lost_count,
			coalesce(sum(coalesce(latest.total, 0)), 0)::numeric(14, 2) as lost_value
		from public.leads l
		left join public.lead_sources ls on ls.id = l.source_id
		left join lateral (
			select q.total
			from public.quotes q
			where q.lead_id = l.id and q.status <> 'draft'
			order by q.created_at desc, q.id desc
			limit 1
		) latest on true
		where l.pipeline_stage = 'LOST'
			and l.last_activity_at >= p_from::timestamptz
			and l.last_activity_at < (p_to + 1)::timestamptz
		group by ls.code
		order by lost_count desc, source_code
		limit v_limit
	) grouped;

	return jsonb_build_object(
		'date_from', p_from,
		'date_to', p_to,
		'by_reason', v_by_reason,
		'by_source', v_by_source
	);
end;
$$;

create or replace function public.dashboard_attribution(
	p_from date default current_date - 29,
	p_to date default current_date,
	p_limit integer default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_limit integer;
	v_rows jsonb;
begin
	perform private.validate_dashboard_range(p_from, p_to);
	v_limit := least(greatest(coalesce(p_limit, 50), 1), 100);
	select coalesce(jsonb_agg(jsonb_build_object(
		'source_code', grouped.source_code,
		'utm_source', grouped.utm_source,
		'utm_medium', grouped.utm_medium,
		'utm_campaign', grouped.utm_campaign,
		'lead_count', grouped.lead_count,
		'won_count', grouped.won_count,
		'revenue', grouped.revenue
	) order by grouped.lead_count desc, grouped.source_code, grouped.utm_source), '[]'::jsonb)
	into v_rows
	from (
		select
			coalesce(ls.code, 'unknown') as source_code,
			coalesce(nullif(trim(l.utm_source), ''), '(none)') as utm_source,
			coalesce(nullif(trim(l.utm_medium), ''), '(none)') as utm_medium,
			coalesce(nullif(trim(l.utm_campaign), ''), '(none)') as utm_campaign,
			count(*)::integer as lead_count,
			count(*) filter (where l.pipeline_stage = 'WON')::integer as won_count,
			coalesce(sum(accepted.revenue), 0)::numeric(14, 2) as revenue
		from public.leads l
		left join public.lead_sources ls on ls.id = l.source_id
		left join lateral (
			select coalesce(sum(q.total), 0)::numeric(14, 2) as revenue
			from public.quotes q
			where q.lead_id = l.id
				and q.status = 'accepted'
				and q.accepted_at >= p_from::timestamptz
				and q.accepted_at < (p_to + 1)::timestamptz
		) accepted on true
		where l.created_at >= p_from::timestamptz
			and l.created_at < (p_to + 1)::timestamptz
		group by ls.code, l.utm_source, l.utm_medium, l.utm_campaign
		order by lead_count desc, source_code, utm_source
		limit v_limit
	) grouped;

	return jsonb_build_object('date_from', p_from, 'date_to', p_to, 'rows', v_rows, 'limit', v_limit);
end;
$$;

revoke all on function public.dashboard_operational_summary(date, date) from public, anon;
grant execute on function public.dashboard_operational_summary(date, date) to authenticated;
revoke all on function public.dashboard_sales_kpis(date, date) from public, anon;
grant execute on function public.dashboard_sales_kpis(date, date) to authenticated;
revoke all on function public.dashboard_lost_analysis(date, date, integer) from public, anon;
grant execute on function public.dashboard_lost_analysis(date, date, integer) to authenticated;
revoke all on function public.dashboard_attribution(date, date, integer) from public, anon;
grant execute on function public.dashboard_attribution(date, date, integer) to authenticated;
revoke all on public.dashboard_lead_facts, public.dashboard_quote_facts from public, anon, authenticated;

commit;
