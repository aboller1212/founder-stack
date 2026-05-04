create extension if not exists pgcrypto;

create table if not exists public.weekly_goals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  week_start date not null,
  goal_text text not null default '',
  updated_by_email text,
  updated_at timestamptz not null default now(),
  unique (team_id, week_start)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  week_start date not null,
  assignee_name text not null check (assignee_name in ('Alex', 'Ben', 'Zach')),
  title text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_email text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.ideas
  add column if not exists status text not null default 'pending';

alter table public.ideas
  add column if not exists status_updated_at timestamptz;

alter table public.ideas
  add column if not exists status_updated_by_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ideas_status_check'
  ) then
    alter table public.ideas
      add constraint ideas_status_check
      check (status in ('pending', 'implemented', 'rejected'));
  end if;
end
$$;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.updates(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_email text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_email text not null,
  author_role text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_team_week on public.tasks(team_id, week_start);
create index if not exists idx_ideas_team_created on public.ideas(team_id, created_at desc);
create index if not exists idx_ideas_team_status on public.ideas(team_id, status, created_at desc);
create index if not exists idx_comments_update_created on public.comments(update_id, created_at asc);
create index if not exists idx_idea_comments_idea_created on public.idea_comments(idea_id, created_at asc);
create index if not exists idx_weekly_goals_team_week on public.weekly_goals(team_id, week_start);

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.weekly_goals to service_role;
grant select, insert, update, delete on public.tasks to service_role;
grant select, insert, update, delete on public.ideas to service_role;
grant select, insert, update, delete on public.comments to service_role;
grant select, insert, update, delete on public.idea_comments to service_role;

grant select on public.weekly_goals to authenticated;
grant select on public.tasks to authenticated;
grant select on public.ideas to authenticated;
grant select on public.comments to authenticated;
grant select on public.idea_comments to authenticated;
