
create table if not exists public.teams (
  id uuid primary key,
  team_name text not null,
  players text default '',
  colour text default 'Gold',
  scores jsonb default '{}'::jsonb,
  tom jsonb default '{}'::jsonb,
  evidence jsonb default '{}'::jsonb,
  approvals jsonb default '{}'::jsonb,
  riddles jsonb default '[]'::jsonb,
  unlocked_hole integer default 2,
  bonus integer default 0,
  locked boolean default false,
  round_finished boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.teams enable row level security;

drop policy if exists "Public can read teams" on public.teams;
drop policy if exists "Public can insert teams" on public.teams;
drop policy if exists "Public can update teams" on public.teams;

create policy "Public can read teams" on public.teams for select using (true);
create policy "Public can insert teams" on public.teams for insert with check (true);
create policy "Public can update teams" on public.teams for update using (true) with check (true);
