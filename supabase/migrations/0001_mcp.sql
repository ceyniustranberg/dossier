-- Dossier, MCP-first: server-side storage for dossiers, their cards, and personal API tokens.
--
-- Only the Next.js server touches these tables, with the service-role key. Row level security
-- is on with no policies, so the publishable key (which ships to browsers) can read or write
-- nothing here.

create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  -- sha256 of the token, hex. The token itself is shown once and never stored.
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_tokens_active_by_user on public.api_tokens (user_id) where revoked_at is null;

create table public.dossiers (
  -- 22 random base62 characters: the unlisted link is the only thing protecting read access.
  id         text primary key check (char_length(id) between 16 and 40),
  owner      uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  query      text not null default '',
  brief      text not null default '',
  angle      text not null default '',
  clusters   jsonb not null default '[]'::jsonb,
  -- { body, takeaways[] } for the summary card
  summary    jsonb not null default '{}'::jsonb,
  -- Bumped on every change to the dossier or its cards; viewers poll it.
  rev        bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dossiers_by_owner on public.dossiers (owner, created_at desc);

create table public.cards (
  dossier_id text not null references public.dossiers (id) on delete cascade,
  id         text not null,
  seq        bigserial,
  -- Everything about the card except where it sits. Written by the agent and the dig route.
  content    jsonb not null,
  -- Where it sits. Written only by the owner's board (drags, chosen drop spots).
  x          integer,
  y          integer,
  moved      boolean not null default false,
  ax         integer,
  ay         integer,
  primary key (dossier_id, id)
);

alter table public.api_tokens enable row level security;
alter table public.dossiers enable row level security;
alter table public.cards enable row level security;

-- Insert or replace card content and bump the dossier's rev in one statement, so a viewer
-- polling for a new rev can never see the bump without the cards.
create function public.add_cards(p_dossier text, p_rows jsonb)
returns bigint
language sql
set search_path = ''
as $$
  with ins as (
    insert into public.cards (dossier_id, id, content, ax, ay)
    select p_dossier, r ->> 'id', r -> 'content', (r ->> 'ax')::integer, (r ->> 'ay')::integer
    from jsonb_array_elements(p_rows) as r
    on conflict (dossier_id, id) do update set content = excluded.content
    returning 1
  )
  update public.dossiers set rev = rev + 1, updated_at = now()
  where id = p_dossier
  returning rev;
$$;

create function public.bump(p_dossier text)
returns bigint
language sql
set search_path = ''
as $$
  update public.dossiers set rev = rev + 1, updated_at = now() where id = p_dossier returning rev;
$$;

revoke execute on function public.add_cards(text, jsonb) from public, anon, authenticated;
revoke execute on function public.bump(text) from public, anon, authenticated;
grant execute on function public.add_cards(text, jsonb) to service_role;
grant execute on function public.bump(text) to service_role;
