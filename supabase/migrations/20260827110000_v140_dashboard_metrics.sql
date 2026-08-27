begin;

-- v1.4.0 metrics are additive projections over canonical Sales and Fulfilment
-- state. They deliberately do not persist queue labels or infer payment/revenue
-- facts from provider activity.

create index if not exists quotes_dashboard_current_actionable_idx
	on public.quotes (lead_id, status, created_at desc, revision_number desc, id desc)
where status in ('draft', 'ready', 'sent', 'accepted');

create index if not exists fulfilment_steps_dashboard_metrics_idx
on public.fulfilment_steps (type, status, scheduled_for, fulfilment_case_id, id)
where status in (
	'awaiting_dispatch',
	'ready_for_collection',
	'scheduled'
);

create index if not exists fulfilment_cases_dashboard_completed_idx
on public.fulfilment_cases (completed_at, id)
where status = 'completed' and completed_at is not null;

create index if not exists payment_milestones_dashboard_awaiting_idx
on public.payment_milestones (status, fulfilment_case_id, id)
where status = 'awaiting';

create index if not exists quotes_dashboard_declined_idx
on public.quotes (declined_at, base_quote_number, revision_number, id)
where status = 'declined' and declined_at is not null;

create or replace function public.dashboard_sales_fulfilment_metrics(
	p_from date default ((now() at time zone 'UTC')::date - 29),
	p_to date default (now() at time zone 'UTC')::date
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
	v_new_enquiries_waiting bigint;
	v_qualification_backlog bigint;
	v_quotes_needing_preparation bigint;
	v_quotes_awaiting_decision bigint;
	v_average_quote_response_hours numeric(14, 2);
	v_accepted_value numeric(14, 2);
	v_open_fulfilments bigint;
	v_upcoming_installations bigint;
	v_awaiting_dispatch bigint;
	v_awaiting_collection bigint;
	v_payments_awaiting_follow_up bigint;
	v_completed_fulfilments bigint;
	v_from timestamptz;
	v_to_exclusive timestamptz;
begin
	perform private.validate_dashboard_range(p_from, p_to);
	if p_to > (now() at time zone 'UTC')::date then
		raise exception using errcode = '22023', message = 'Dashboard date range cannot include future dates';
	end if;
	v_from := p_from::timestamp at time zone 'UTC';
	v_to_exclusive := (p_to + 1)::timestamp at time zone 'UTC';

	-- Snapshot metrics intentionally use current canonical state rather than
	-- creation or update time. The stage/status indexes bound these predicates.
	select count(*) into v_new_enquiries_waiting
	from public.leads
	where pipeline_stage = 'NEW';

	select count(*) into v_qualification_backlog
	from public.leads
	where pipeline_stage = 'QUALIFICATION';

	-- The Sales queue presents every current PROPOSAL Lead as preparation work;
	-- its latest actionable Quote determines whether the row has no Quote, a
	-- draft, or a ready Quote.
	select count(*) into v_quotes_needing_preparation
	from public.leads
	where pipeline_stage = 'PROPOSAL';

	select count(*) into v_quotes_awaiting_decision
	from public.leads l
	join lateral (
		select q.status
		from public.quotes q
		where q.lead_id = l.id
			and q.status in ('draft', 'ready', 'sent', 'accepted')
		order by q.created_at desc, q.revision_number desc, q.id desc
		limit 1
	) latest on latest.status = 'sent'
	where l.pipeline_stage = 'DECISION';

	-- A response is measured once per current Quote revision. Incomplete or
	-- negative durations are excluded rather than repaired in the aggregate.
	select coalesce(
		round(avg(extract(epoch from (decision_at - sent_at)) / 3600), 2),
		0
	)::numeric(14, 2)
	into v_average_quote_response_hours
	from (
		select q.sent_at, q.accepted_at as decision_at
		from public.quotes q
		where q.status = 'accepted'
			and q.sent_at is not null
			and q.accepted_at >= v_from
			and q.accepted_at < v_to_exclusive
			and q.accepted_at > q.sent_at
			and not exists (
				select 1
				from public.quotes newer
				where newer.base_quote_number = q.base_quote_number
					and newer.revision_number > q.revision_number
			)
		union all
		select q.sent_at, q.declined_at as decision_at
		from public.quotes q
		where q.status = 'declined'
			and q.sent_at is not null
			and q.declined_at >= v_from
			and q.declined_at < v_to_exclusive
			and q.declined_at > q.sent_at
			and not exists (
				select 1
				from public.quotes newer
				where newer.base_quote_number = q.base_quote_number
					and newer.revision_number > q.revision_number
			)
	) decisions;

	-- This is accepted commercial value. It is not a received-payment or
	-- accounting-revenue measure.
	select coalesce(sum(q.total), 0)::numeric(14, 2)
	into v_accepted_value
	from public.quotes q
	where q.status = 'accepted'
		and q.accepted_at >= v_from
		and q.accepted_at < v_to_exclusive
		and not exists (
			select 1
			from public.quotes newer
			where newer.base_quote_number = q.base_quote_number
				and newer.revision_number > q.revision_number
		);

	select count(*) into v_open_fulfilments
	from public.fulfilment_cases
	where status = 'open';

	select count(*) into v_upcoming_installations
	from public.fulfilment_steps fs
	join public.fulfilment_cases fc on fc.id = fs.fulfilment_case_id
	where fc.status <> 'cancelled'
		and fs.type = 'installation'
		and fs.status = 'scheduled'
		and fs.scheduled_for >= v_from
		and fs.scheduled_for < v_to_exclusive;

	select count(*) into v_awaiting_dispatch
	from public.fulfilment_steps fs
	join public.fulfilment_cases fc on fc.id = fs.fulfilment_case_id
	where fc.status <> 'cancelled'
		and fs.type = 'courier'
		and fs.status = 'awaiting_dispatch';

	select count(*) into v_awaiting_collection
	from public.fulfilment_steps fs
	join public.fulfilment_cases fc on fc.id = fs.fulfilment_case_id
	where fc.status <> 'cancelled'
		and fs.type = 'pickup'
		and fs.status = 'ready_for_collection';

	-- An overdue payment follow-up is still an open Task. Counting the awaiting
	-- milestone keeps the CRM payment evidence separate from cash settlement.
	select count(*) into v_payments_awaiting_follow_up
	from public.payment_milestones pm
	join public.fulfilment_cases fc on fc.id = pm.fulfilment_case_id
	where fc.status = 'open'
		and pm.status = 'awaiting'
		and exists (
			select 1
			from public.tasks t
			where t.fulfilment_case_id = pm.fulfilment_case_id
				and t.type = 'payment_follow_up'
				and t.status = 'open'
		);

	select count(*) into v_completed_fulfilments
	from public.fulfilment_cases
	where status = 'completed'
		and completed_at >= v_from
		and completed_at < v_to_exclusive;

	return jsonb_build_object(
		'date_from', p_from,
		'date_to', p_to,
		'new_enquiries_waiting', v_new_enquiries_waiting,
		'qualification_backlog', v_qualification_backlog,
		'quotes_needing_preparation', v_quotes_needing_preparation,
		'quotes_awaiting_decision', v_quotes_awaiting_decision,
		'average_quote_response_hours', v_average_quote_response_hours,
		'accepted_value', v_accepted_value,
		'open_fulfilments', v_open_fulfilments,
		'upcoming_installations', v_upcoming_installations,
		'awaiting_dispatch', v_awaiting_dispatch,
		'awaiting_collection', v_awaiting_collection,
		'payments_awaiting_follow_up', v_payments_awaiting_follow_up,
		'completed_fulfilments', v_completed_fulfilments
	);
end;
$$;

revoke all on function public.dashboard_sales_fulfilment_metrics(date, date) from public, anon;
grant execute on function public.dashboard_sales_fulfilment_metrics(date, date) to authenticated;

comment on function public.dashboard_sales_fulfilment_metrics(date, date) is
	'Bounded v1.4.0 Sales and Fulfilment metrics over canonical CRM state; accepted value and payment milestones are not accounting revenue.';

commit;
