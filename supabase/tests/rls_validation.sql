-- Procédure isolée à exécuter avec deux utilisateurs de test.
-- Remplacez les UUID ci-dessous par deux lignes existantes de auth.users.
-- Le guide SUPABASE_SETUP.md détaille la procédure et les résultats attendus.
begin;

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.books (
  user_id, id, title, author, status, created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Livre utilisateur A',
  'Auteur A',
  'reading',
  now(),
  now()
);

-- Doit renvoyer 1.
select count(*) as user_a_reads_own_book from public.books;

select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);

-- Doit renvoyer 0.
select count(*) as user_b_cannot_read_user_a_book from public.books;

-- Doit affecter 0 ligne.
update public.books
set title = 'Tentative utilisateur B'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Doit échouer : la FK propriétaire et la policy interdisent le rattachement.
insert into public.book_notes (
  user_id, id, book_id, extracted_text, personal_reflection, tags,
  source_type, created_at, updated_at
) values (
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Interdit',
  '',
  '{}',
  'manual',
  now(),
  now()
);

rollback;

-- Après avoir créé une note appartenant à A, vérifier aussi :
-- A peut insérer/lire/modifier note_reading_metadata pour cette note.
-- B ne peut ni la lire ni la modifier.
-- B ne peut pas créer de métadonnées pour une note de A (policy + FK).
-- Le rôle anon ne peut lire aucune ligne de note_reading_metadata.
