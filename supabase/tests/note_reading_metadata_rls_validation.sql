-- Procédure manuelle RLS pour note_reading_metadata.
-- Remplacer les UUID A, B et NOTE_A par deux utilisateurs Auth réels et une
-- note active appartenant à A. Exécuter chaque bloc séparément dans SQL Editor.

-- A peut créer et relire ses métadonnées.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
insert into public.note_reading_metadata (
  user_id, note_id, is_favorite, is_important, read_count, created_at, updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  true, false, 1, now(), now()
)
on conflict (user_id, note_id) do update
set is_favorite = excluded.is_favorite,
    read_count = excluded.read_count,
    updated_at = excluded.updated_at;
select count(*) as a_sees_one
from public.note_reading_metadata
where note_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
rollback;

-- B ne voit pas et ne peut pas modifier la ligne de A : les deux résultats
-- doivent être zéro.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select count(*) as b_sees_zero
from public.note_reading_metadata
where note_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
with changed as (
  update public.note_reading_metadata
  set is_important = true, updated_at = now()
  where note_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  returning 1
)
select count(*) as b_updates_zero from changed;
rollback;

-- Le rôle anonyme ne voit aucune métadonnée personnelle.
begin;
set local role anon;
select count(*) as anon_sees_zero from public.note_reading_metadata;
rollback;

-- Test négatif à exécuter seul : B tente de créer une ligne pour NOTE_A.
-- L’instruction doit échouer avec une violation RLS ou de clé étrangère.
begin;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
insert into public.note_reading_metadata (
  user_id, note_id, created_at, updated_at
) values (
  '22222222-2222-4222-8222-222222222222',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  now(), now()
);
rollback;
