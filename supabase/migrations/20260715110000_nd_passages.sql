create table if not exists dsemcq_nd_passages (
  id                text primary key,
  code              text not null unique,
  slug              text not null unique,
  order_no          int not null check (order_no >= 0),
  title             text not null,
  dynasty           text,
  author            text,
  body              text not null,
  word_count        int not null default 0 check (word_count >= 0),
  summary           text,
  genre             text,
  themes            text[] not null default '{}',
  difficulty        int not null default 2 check (difficulty between 1 and 5),
  representation    text not null check (representation in ('文言文', '白話文')),
  type              text not null,
  source            text not null,
  generation_prompt text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace function set_dsemcq_nd_passages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_dsemcq_nd_passages_updated_at on dsemcq_nd_passages;
create trigger trg_dsemcq_nd_passages_updated_at
before update on dsemcq_nd_passages
for each row
execute function set_dsemcq_nd_passages_updated_at();

create index if not exists idx_dsemcq_nd_passages_order_no
  on dsemcq_nd_passages(order_no);

create index if not exists idx_dsemcq_nd_passages_is_active
  on dsemcq_nd_passages(is_active);

alter table dsemcq_nd_passages enable row level security;

drop policy if exists "nd_passages_authenticated_read" on dsemcq_nd_passages;
create policy "nd_passages_authenticated_read"
  on dsemcq_nd_passages
  for select
  to authenticated
  using (true);

drop policy if exists "nd_passages_service_all" on dsemcq_nd_passages;
create policy "nd_passages_service_all"
  on dsemcq_nd_passages
  for all
  to service_role
  using (true)
  with check (true);