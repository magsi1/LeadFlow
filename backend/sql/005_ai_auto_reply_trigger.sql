create extension if not exists pg_net;

alter table public.leads
  add column if not exists auto_replied boolean default false;

create or replace function public.trigger_auto_reply()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.auto_replied, false) then
    return new;
  end if;

  perform net.http_post(
    url := 'https://gxddsscaplfrfptgmcxa.functions.supabase.co/ai-auto-reply',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'id', new.id,
      'name', new.name,
      'message', new.message,
      'source', new.source,
      'phone', new.phone,
      'auto_replied', coalesce(new.auto_replied, false)
    )
  );

  return new;
end;
$$;

drop trigger if exists on_lead_created on public.leads;

create trigger on_lead_created
after insert on public.leads
for each row
execute function public.trigger_auto_reply();
