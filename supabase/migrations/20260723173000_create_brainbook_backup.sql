create table public.books (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 500),
  author text not null check (char_length(trim(author)) between 1 and 300),
  status text not null check (status in ('to_read', 'reading', 'finished')),
  cover_storage_path text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint books_cover_path_owner
    check (
      cover_storage_path is null
      or cover_storage_path like user_id::text || '/' || id::text || '/%'
    )
);

create index books_user_updated_idx
  on public.books (user_id, updated_at desc);
create index books_user_deleted_idx
  on public.books (user_id, deleted_at);
create index books_id_idx on public.books (id);

create table public.book_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  book_id uuid not null,
  extracted_text text not null default '',
  personal_reflection text not null default '',
  page_number text,
  tags text[] not null default '{}',
  source_type text not null check (source_type in ('manual', 'scan', 'import')),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint book_notes_owned_book_fk
    foreign key (user_id, book_id)
    references public.books (user_id, id)
    on delete cascade
);

create index book_notes_user_book_idx
  on public.book_notes (user_id, book_id);
create index book_notes_user_updated_idx
  on public.book_notes (user_id, updated_at desc);
create index book_notes_user_deleted_idx
  on public.book_notes (user_id, deleted_at);
create index book_notes_id_idx on public.book_notes (id);

create function public.brainbook_set_server_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

create trigger books_set_server_updated_at
before update on public.books
for each row execute function public.brainbook_set_server_updated_at();

create trigger book_notes_set_server_updated_at
before update on public.book_notes
for each row execute function public.brainbook_set_server_updated_at();

alter table public.books enable row level security;
alter table public.book_notes enable row level security;

revoke all on table public.books from anon;
revoke all on table public.book_notes from anon;
grant select, insert, update, delete on table public.books to authenticated;
grant select, insert, update, delete on table public.book_notes to authenticated;

create policy "brainbook_books_select_own"
on public.books
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "brainbook_books_insert_own"
on public.books
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "brainbook_books_update_own"
on public.books
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "brainbook_books_delete_own"
on public.books
for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "brainbook_notes_select_own"
on public.book_notes
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "brainbook_notes_insert_own"
on public.book_notes
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.books
    where books.user_id = (select auth.uid())
      and books.id = book_id
  )
);

create policy "brainbook_notes_update_own"
on public.book_notes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.books
    where books.user_id = (select auth.uid())
      and books.id = book_id
  )
);

create policy "brainbook_notes_delete_own"
on public.book_notes
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'book-covers',
  'book-covers',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "brainbook_covers_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "brainbook_covers_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "brainbook_covers_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "brainbook_covers_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
