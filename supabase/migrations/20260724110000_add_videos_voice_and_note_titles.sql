alter table public.books
  add column content_type text not null default 'book',
  add column youtube_url text,
  add column youtube_video_id text,
  add column thumbnail_url text;

alter table public.books
  add constraint books_content_type_check
    check (content_type in ('book', 'video')),
  add constraint books_video_fields_check
    check (
      (
        content_type = 'book'
        and youtube_url is null
        and youtube_video_id is null
        and thumbnail_url is null
      )
      or
      (
        content_type = 'video'
        and cover_storage_path is null
        and youtube_url is not null
        and youtube_url like 'https://www.youtube.com/watch?v=%'
        and youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'
        and thumbnail_url like 'https://i.ytimg.com/vi/%'
      )
    );

create index books_user_content_type_updated_idx
  on public.books (user_id, content_type, updated_at desc)
  where deleted_at is null;

alter table public.book_notes
  add column title text not null default '';

alter table public.book_notes
  add constraint book_notes_title_length_check
    check (char_length(title) <= 160);

alter table public.book_notes
  drop constraint if exists book_notes_source_type_check;

alter table public.book_notes
  add constraint book_notes_source_type_check
    check (source_type in ('manual', 'scan', 'voice', 'import'));
