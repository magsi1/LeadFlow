-- Analytics support views and helper indexes.
-- Views are chart/card-ready and workspace scoped for reporting queries.

create index if not exists idx_leads_workspace_created
  on public.leads(workspace_id, created_at);

create index if not exists idx_leads_workspace_status
  on public.leads(workspace_id, status);

create index if not exists idx_leads_workspace_assigned
  on public.leads(workspace_id, assigned_to);

create index if not exists idx_followups_workspace_due
  on public.follow_ups(workspace_id, due_at);

create index if not exists idx_conversations_workspace_lastmsg
  on public.conversations(workspace_id, last_message_at);

create or replace view public.analytics_workspace_funnel_v as
select
  workspace_id,
  status,
  count(*)::int as lead_count
from public.leads
group by workspace_id, status;

create or replace view public.analytics_workspace_source_v as
select
  workspace_id,
  source_channel,
  count(*)::int as lead_count,
  count(*) filter (where status = 'won')::int as won_count
from public.leads
group by workspace_id, source_channel;

comment on view public.analytics_workspace_funnel_v is
'Workspace lead funnel aggregate by status. Use for dashboard/report cards.';

comment on view public.analytics_workspace_source_v is
'Workspace source/channel aggregate with won count for conversion comparisons.';
