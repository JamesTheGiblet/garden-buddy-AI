-- 1. User Profiles (You provided this)
create table if not exists public.user_profiles (
  id uuid not null,
  user_type text not null,
  name text null,
  business_name text null,
  subscription_tier text null default 'free'::text,
  subscription_status text null default 'active'::text,
  trial_ends_at timestamp with time zone null,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  max_clients integer null default 5,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint user_profiles_pkey primary key (id),
  constraint user_profiles_id_fkey foreign KEY (id) references auth.users (id) on delete CASCADE,
  constraint user_profiles_user_type_check check (
    (
      user_type = any (array['client'::text, 'contractor'::text])
    )
  )
) TABLESPACE pg_default;

-- 2. Pairings Table (Fixes "client_name does not exist" error)
create table if not exists public.pairings (
  id uuid default gen_random_uuid() primary key,
  contractor_id uuid references auth.users(id) not null,
  client_device_id text,
  client_name text,
  garden_details text,
  status text default 'active',
  paired_at timestamp with time zone default now()
);

-- 3. Jobs Table (Required for "New Job" and Dashboard)
create table if not exists public.jobs (
  id uuid default gen_random_uuid() primary key,
  contractor_id uuid references auth.users(id) not null,
  pairing_id uuid references public.pairings(id) not null,
  service text,
  scheduled_date date,
  scheduled_time time,
  price numeric,
  notes text,
  urgent boolean default false,
  status text default 'pending',
  created_at timestamp with time zone default now()
);

-- 4. Row Level Security (RLS) Policies
-- Enable RLS on all tables
alter table public.user_profiles enable row level security;
alter table public.pairings enable row level security;
alter table public.jobs enable row level security;

-- Policies for user_profiles
create policy "Users can view own profile" 
  on public.user_profiles for select 
  using ( auth.uid() = id );

create policy "Users can update own profile" 
  on public.user_profiles for update 
  using ( auth.uid() = id );

-- Policies for pairings
create policy "Contractors can view own pairings" 
  on public.pairings for select 
  using ( auth.uid() = contractor_id );

create policy "Contractors can insert own pairings" 
  on public.pairings for insert 
  with check ( auth.uid() = contractor_id );

create policy "Contractors can update own pairings" 
  on public.pairings for update 
  using ( auth.uid() = contractor_id );

-- Policies for jobs
create policy "Contractors can view own jobs" 
  on public.jobs for select 
  using ( auth.uid() = contractor_id );

create policy "Contractors can insert own jobs" 
  on public.jobs for insert 
  with check ( auth.uid() = contractor_id );

create policy "Contractors can update own jobs" 
  on public.jobs for update 
  using ( auth.uid() = contractor_id );