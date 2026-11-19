alter table public.folders
  drop constraint folders_parent_owner_fk,
  add constraint folders_parent_owner_fk
  foreign key (parent_id, owner_id)
  references public.folders(id, owner_id)
  on delete cascade;

alter table public.notebooks
  drop constraint notebooks_folder_owner_fk,
  add constraint notebooks_folder_owner_fk
  foreign key (folder_id, owner_id)
  references public.folders(id, owner_id)
  on delete set null (folder_id);
