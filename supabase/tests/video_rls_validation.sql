-- Procédure manuelle : remplacer USER_A, USER_B, VIDEO_ID et NOTE_ID par
-- des UUID réels, puis exécuter chaque transaction séparément.

-- A peut créer une vidéo et une note vocale titrée.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
insert into public.books (
  user_id, id, title, author, status, content_type,
  youtube_url, youtube_video_id, thumbnail_url, created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  'Vidéo RLS', 'Autrice', 'to_read', 'video',
  'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  'M7lc1UVf-VE',
  'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg',
  now(), now()
);
insert into public.book_notes (
  user_id, id, book_id, title, personal_reflection, source_type,
  created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'Note dictée', 'Contenu vocal transformé en texte.', 'voice',
  now(), now()
);
select count(*) as a_sees_video
from public.books
where id = '33333333-3333-4333-8333-333333333333';
rollback;

-- B ne voit ni la vidéo ni sa note : les deux résultats doivent être zéro.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select count(*) as b_sees_zero_videos
from public.books
where id = '33333333-3333-4333-8333-333333333333';
select count(*) as b_sees_zero_notes
from public.book_notes
where id = '44444444-4444-4444-8444-444444444444';
rollback;
