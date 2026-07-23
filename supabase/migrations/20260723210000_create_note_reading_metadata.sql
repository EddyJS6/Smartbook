create table public.note_reading_metadata (
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null,
  is_favorite boolean not null default false,
  is_important boolean not null default false,
  last_read_at timestamptz,
  read_count integer not null default 0 check (read_count >= 0),
  last_suggested_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, note_id),
  constraint note_reading_metadata_owned_note_fk
    foreign key (user_id, note_id)
    references public.book_notes (user_id, id)
    on delete cascade
);

create index note_reading_metadata_user_favorite_idx
  on public.note_reading_metadata (user_id, is_favorite)
  where deleted_at is null;
create index note_reading_metadata_user_important_idx
  on public.note_reading_metadata (user_id, is_important)
  where deleted_at is null;
create index note_reading_metadata_user_last_read_idx
  on public.note_reading_metadata (user_id, last_read_at);
create index note_reading_metadata_user_last_suggested_idx
  on public.note_reading_metadata (user_id, last_suggested_at);
create index note_reading_metadata_user_updated_idx
  on public.note_reading_metadata (user_id, updated_at desc);

create trigger note_reading_metadata_set_server_updated_at
before update on public.note_reading_metadata
for each row execute function public.brainbook_set_server_updated_at();

alter table public.note_reading_metadata enable row level security;
revoke all on table public.note_reading_metadata from anon;
grant select, insert, update, delete
  on table public.note_reading_metadata to authenticated;

create policy "brainbook_reading_metadata_select_own"
on public.note_reading_metadata
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "brainbook_reading_metadata_insert_own"
on public.note_reading_metadata
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.book_notes
    where book_notes.user_id = (select auth.uid())
      and book_notes.id = note_id
      and book_notes.deleted_at is null
  )
);

create policy "brainbook_reading_metadata_update_own"
on public.note_reading_metadata
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.book_notes
    where book_notes.user_id = (select auth.uid())
      and book_notes.id = note_id
      and book_notes.deleted_at is null
  )
);

create policy "brainbook_reading_metadata_delete_own"
on public.note_reading_metadata
for delete to authenticated
using ((select auth.uid()) = user_id);
