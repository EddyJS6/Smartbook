alter table public.book_notes
  add column if not exists formatted_content jsonb;

alter table public.book_notes
  drop constraint if exists book_notes_formatted_content_is_array;

alter table public.book_notes
  add constraint book_notes_formatted_content_is_array
  check (
    formatted_content is null
    or jsonb_typeof(formatted_content) = 'array'
  );
