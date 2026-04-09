-- LeadFlow CRM MVP - optional demo seed
-- This seed is safe to run multiple times (uses ON CONFLICT where applicable).
-- Assumes profile rows exist (usually created by auth trigger).

insert into public.workspaces (id, name)
values ('00000000-0000-0000-0000-000000000001'::uuid, 'LeadFlow Demo Workspace')
on conflict (id) do nothing;

-- Optional profile upserts (if users already exist in auth.users with these IDs).
-- Replace UUIDs with real auth user ids in your project.
insert into public.profiles (id, full_name, email, role)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Admin User', 'admin@leadflow.com', 'admin'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Sales One', 'sales1@leadflow.com', 'sales'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Sales Two', 'sales2@leadflow.com', 'sales')
on conflict (id) do update
set
  full_name = excluded.full_name,
  email = excluded.email;

insert into public.salespeople (id, profile_id, display_name, phone, is_active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'Sales One', '+923001112233', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'::uuid, '33333333-3333-3333-3333-333333333333'::uuid, 'Sales Two', '+923009998877', true)
on conflict (id) do nothing;

insert into public.leads (
  id, workspace_id, name, phone, city, source_channel, status, priority, assigned_to, notes, created_by
)
values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Hamza Qureshi', '+923221114477', 'Karachi', 'whatsapp', 'new', 'hot', '22222222-2222-2222-2222-222222222222'::uuid, 'Needs 10kw proposal.', '11111111-1111-1111-1111-111111111111'::uuid),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Nida Homes', '+923001234567', 'Lahore', 'instagram', 'contacted', 'warm', '33333333-3333-3333-3333-333333333333'::uuid, 'Office inverter requirement.', '11111111-1111-1111-1111-111111111111'::uuid)
on conflict (id) do nothing;

insert into public.conversations (
  id, workspace_id, channel, customer_name, customer_handle, customer_phone, city, assigned_to, lead_id, priority, status, last_message_preview, last_message_at, unread_count
)
values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'whatsapp', 'Hamza Qureshi', 'hamza.q', '+923221114477', 'Karachi', '22222222-2222-2222-2222-222222222222'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid, 'hot', 'open', 'Need 10kw system quote.', now(), 2),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'instagram', 'Nida Homes', '@nida.homes', '+923001234567', 'Lahore', '33333333-3333-3333-3333-333333333333'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'::uuid, 'warm', 'pending', 'Can you share package options?', now(), 1)
on conflict (id) do nothing;

update public.leads
set conversation_id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid;

insert into public.messages (
  id, conversation_id, direction, body, sender_name, sender_profile_id, message_type, sent_at
)
values
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid, 'inbound', 'Need 10kw system quote for DHA Karachi home.', 'Hamza Qureshi', null, 'text', now() - interval '5 minutes'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid, 'outbound', 'Sure, please share monthly bill and location.', 'LeadFlow Agent', '22222222-2222-2222-2222-222222222222'::uuid, 'text', now() - interval '3 minutes')
on conflict (id) do nothing;

insert into public.follow_ups (
  id, lead_id, assigned_to, due_at, note, status, created_by
)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, now() + interval '1 day', 'Share final quotation after bill review.', 'pending', '11111111-1111-1111-1111-111111111111'::uuid)
on conflict (id) do nothing;

insert into public.activities (
  id, lead_id, conversation_id, actor_profile_id, type, description, metadata
)
values
  ('ffffffff-ffff-ffff-ffff-fffffffffff1'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'lead_created', 'Lead created from WhatsApp conversation.', '{}'::jsonb),
  ('ffffffff-ffff-ffff-ffff-fffffffffff2'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'::uuid, 'cccccccc-cccc-cccc-cccc-ccccccccccc1'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'followup_scheduled', 'Follow-up scheduled for tomorrow.', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.integration_accounts (
  id, workspace_id, channel, display_name, external_account_id, status, config
)
values
  ('99999999-9999-9999-9999-999999999991'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'whatsapp', 'LeadFlow Solar WhatsApp', 'wa_demo_1', 'connected', '{}'::jsonb),
  ('99999999-9999-9999-9999-999999999992'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'instagram', '@leadflow.solar', 'ig_demo_1', 'connected', '{}'::jsonb),
  ('99999999-9999-9999-9999-999999999993'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'facebook', 'LeadFlow Solar Solutions', 'fb_demo_1', 'pending', '{}'::jsonb)
on conflict (id) do nothing;
