-- Add indexes covering foreign keys used by ownership-scoped queries.
create index if not exists canvas_items_owner_id_idx
  on public.canvas_items (owner_id);

create index if not exists canvas_items_page_owner_idx
  on public.canvas_items (page_id, owner_id);

create index if not exists folders_parent_owner_idx
  on public.folders (parent_id, owner_id);

create index if not exists notebook_pages_notebook_owner_idx
  on public.notebook_pages (notebook_id, owner_id);

create index if not exists notebook_pages_owner_id_idx
  on public.notebook_pages (owner_id);

create index if not exists notebooks_folder_owner_idx
  on public.notebooks (folder_id, owner_id);
