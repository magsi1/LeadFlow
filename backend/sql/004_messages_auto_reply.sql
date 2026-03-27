create extension if not exists "uuid-ossp";

create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  phone text,
  message text,
  is_from_customer boolean,
  created_at timestamp default now()
);

alter table public.messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and policyname = 'Users access own messages'
  ) then
    create policy "Users access own messages"
      on public.messages
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

alter table public.leads
  add column if not exists auto_reply boolean default true;

update public.leads
set auto_reply = true
where auto_reply is null;

create index if not exists idx_messages_user_id_created_at
  on public.messages (user_id, created_at desc);

create index if not exists idx_messages_lead_id_created_at
  on public.messages (lead_id, created_at asc);

