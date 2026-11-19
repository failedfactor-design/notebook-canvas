create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_path text,
  preferences jsonb not null default '{"theme":"graphite","accent":"gray"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  title text not null default 'New folder',
  color text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint folders_parent_owner_fk foreign key (parent_id, owner_id)
    references public.folders(id, owner_id) on delete cascade
);

create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid,
  title text not null default 'Untitled notebook',
  description text,
  icon text not null default 'notebook',
  cover_path text,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint notebooks_folder_owner_fk foreign key (folder_id, owner_id)
    references public.folders(id, owner_id) on delete set null (folder_id)
);

create table public.notebook_pages (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled page',
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  position integer not null default 0,
  page_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  constraint notebook_pages_notebook_owner_fk foreign key (notebook_id, owner_id)
    references public.notebooks(id, owner_id) on delete cascade
);

create table public.canvas_items (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('image','file','pdf','link','embed','sticky')),
  title text,
  storage_path text,
  external_url text,
  position jsonb not null default '{"x":80,"y":80,"width":320,"height":220}'::jsonb,
  rotation numeric(7,2) not null default 0,
  z_index integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canvas_items_page_owner_fk foreign key (page_id, owner_id)
    references public.notebook_pages(id, owner_id) on delete cascade,
  constraint canvas_items_storage_or_url_check
    check (kind = 'sticky' or storage_path is not null or external_url is not null)
);

create index folders_owner_parent_idx on public.folders(owner_id, parent_id, position);
create index notebooks_owner_folder_idx on public.notebooks(owner_id, folder_id, updated_at desc);
create index pages_notebook_position_idx on public.notebook_pages(notebook_id, position);
create index canvas_items_page_z_idx on public.canvas_items(page_id, z_index);

alter table public.profiles enable row level security;
alter table public.folders enable row level security;
alter table public.notebooks enable row level security;
alter table public.notebook_pages enable row level security;
alter table public.canvas_items enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "folders_manage_own" on public.folders for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "notebooks_manage_own" on public.notebooks for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "notebook_pages_manage_own" on public.notebook_pages for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "canvas_items_manage_own" on public.canvas_items for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.profiles, public.folders, public.notebooks, public.notebook_pages, public.canvas_items to authenticated;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger folders_set_updated_at before update on public.folders for each row execute function public.set_updated_at();
create trigger notebooks_set_updated_at before update on public.notebooks for each row execute function public.set_updated_at();
create trigger notebook_pages_set_updated_at before update on public.notebook_pages for each row execute function public.set_updated_at();
create trigger canvas_items_set_updated_at before update on public.canvas_items for each row execute function public.set_updated_at();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values (
'notebook-assets','notebook-assets',false,52428800,
array['image/jpeg','image/png','image/webp','image/gif','image/avif','application/pdf','text/plain','text/markdown','text/csv','application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']
) on conflict (id) do nothing;

create policy "notebook_assets_select_own" on storage.objects for select to authenticated using (bucket_id='notebook-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "notebook_assets_insert_own" on storage.objects for insert to authenticated with check (bucket_id='notebook-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "notebook_assets_update_own" on storage.objects for update to authenticated using (bucket_id='notebook-assets' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='notebook-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "notebook_assets_delete_own" on storage.objects for delete to authenticated using (bucket_id='notebook-assets' and (storage.foldername(name))[1]=(select auth.uid())::text);
