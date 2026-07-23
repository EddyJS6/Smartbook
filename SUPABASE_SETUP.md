# Configurer la sauvegarde Supabase

BrainBook reste entièrement local-first. Supabase ajoute une sauvegarde privée
facultative ; l’application continue de fonctionner si cette configuration est
absente ou hors ligne.

## 1. Créer le projet

1. Créer un projet sur <https://supabase.com/dashboard>.
2. Choisir une région proche et conserver le mot de passe de base de données
   dans un gestionnaire de mots de passe.
3. Dans **Project Settings → API**, relever :
   - l’URL du projet ;
   - la **Publishable key**.

Les nouveaux projets affichent une clé publique `sb_publishable_…`. Certains
anciens projets affichent encore une clé `anon` JWT : elle remplit le même rôle
côté navigateur et reste limitée par RLS. Ne jamais utiliser la clé
`service_role` dans BrainBook ou Vercel.

## 2. Appliquer la migration versionnée

Depuis PowerShell, dans le dossier SmartBook :

```powershell
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

La migration
`supabase/migrations/20260723173000_create_brainbook_backup.sql` crée :

- `public.books` ;
- `public.book_notes` ;
- les contraintes, index et triggers ;
- toutes les policies RLS ;
- le bucket privé `book-covers` ;
- les policies Storage.

Ne créez pas les colonnes manuellement dans Table Editor. Une modification
future du schéma doit produire une nouvelle migration.

Pour valider localement avec Docker :

```powershell
npx supabase start
npx supabase db reset
```

`db reset` détruit uniquement la base Supabase locale ciblée. Ne lancez jamais
`supabase db reset --linked` sur le projet de production.

## 3. Vérifier le bucket privé

Dans **Storage**, vérifier :

- nom : `book-covers` ;
- mode : **Private** ;
- taille maximale : 5 Mo ;
- types : JPEG, PNG et WEBP.

Les chemins ont la forme :

```text
{userId}/{bookId}/{imageId}.jpg
```

Les quatre policies de `storage.objects` doivent limiter SELECT, INSERT, UPDATE
et DELETE au dossier dont le premier segment égale `auth.uid()`.

## 4. Créer le premier utilisateur personnel

1. Ouvrir **Authentication → Users**.
2. Cliquer **Add user → Create new user**.
3. Saisir votre email et un mot de passe fort.
4. Marquer l’email comme confirmé si le tableau de bord le propose.

BrainBook ne contient volontairement aucun formulaire d’inscription.

Dans **Authentication → Providers → Email** ou la page de configuration Auth,
désactiver l’autorisation des nouvelles inscriptions publiques. La
configuration Supabase locale contient également `enable_signup = false`.

## 5. Variables locales et Vercel

Créer `.env.local` sans le committer :

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VOTRE_CLE
```

Dans Vercel :

1. ouvrir **Settings → Environment Variables** ;
2. ajouter les deux variables pour **Production** et éventuellement
   **Preview** ;
3. redéployer après leur ajout.

Ces deux valeurs sont publiques par conception. La confidentialité dépend de
la session et de RLS. Ne jamais ajouter `SUPABASE_SERVICE_ROLE_KEY` au projet
client.

## 6. Première connexion

1. Ouvrir BrainBook puis **Compte**.
2. Saisir l’email et le mot de passe de l’utilisateur créé dans le tableau de
   bord.
3. BrainBook initialise automatiquement le compte :
   - compte vide : les données de l’appareil sont ajoutées au compte ;
   - appareil vide : la bibliothèque du compte est téléchargée ;
   - les deux sont vides : le compte est immédiatement prêt.
4. Si l’appareil et le compte contiennent déjà des données distinctes, appuyer
   sur **Rassembler avec mon compte**. Cette fusion est non destructive.
5. Vérifier l’état **À jour** et les nombres dans Table Editor.

Un changement de compte demande confirmation et crée d’abord une sauvegarde
structurée des livres et notes de l’ancien compte. Cette sauvegarde de sécurité
ne duplique pas encore les fichiers binaires de couverture.

## 7. Tester RLS avec deux utilisateurs

Créer deux utilisateurs de test A et B dans **Authentication → Users**, puis
remplacer les deux UUID d’exemple dans
`supabase/tests/rls_validation.sql`.

Exécuter les blocs dans SQL Editor :

1. avec le JWT simulé de A, insérer et relire son livre : une ligne attendue ;
2. basculer vers B : aucune ligne de A ne doit être visible ;
3. l’UPDATE de B sur le livre de A doit affecter zéro ligne ;
4. l’INSERT d’une note B rattachée au livre A doit échouer ;
5. avec `set local role anon`, SELECT doit renvoyer zéro ligne ;
6. refaire SELECT/UPDATE avec A : ils doivent réussir.

Tester aussi Storage depuis deux sessions navigateur distinctes :

1. A téléverse une couverture dans son dossier ;
2. B ne peut ni la lister, ni la télécharger, ni la modifier, ni la supprimer ;
3. A peut effectuer les quatre opérations.

La procédure n’utilise jamais de `service_role`, car celle-ci contournerait RLS
et invaliderait le test.

## 8. Tester une restauration

1. Effectuer une sauvegarde complète et vérifier les tables/bucket.
2. Dans un profil Safari ou navigateur séparé, ouvrir BrainBook avec IndexedDB
   vide.
3. Se connecter au même compte.
4. Attendre l’état **À jour** : la bibliothèque est chargée automatiquement.
5. Vérifier livres, notes, tags et couvertures.
6. Vérifier qu’une note scannée ne contient que son texte final et qu’aucune
   photographie de page n’existe dans Storage.

## 9. Checklist iPhone réelle

- connexion depuis Safari ;
- connexion depuis la PWA installée ;
- session conservée après fermeture et après redémarrage de l’iPhone ;
- mode avion puis ajout d’une note locale ;
- état **Modifications en attente** hors ligne ;
- synchronisation automatique après le retour en ligne ;
- bouton **Synchroniser maintenant** ;
- upload d’une couverture choisie ou prise avec l’iPhone ;
- restauration sur une nouvelle installation ;
- mise en arrière-plan pendant un upload puis retour dans l’application ;
- statut final cohérent ;
- déconnexion sans perte des données locales ;
- reconnexion au même compte ;
- connexion d’un second compte bloquant tout envoi automatique.

Cette checklist doit être exécutée physiquement : les tests automatisés de
BrainBook ne simulent pas toutes les suspensions propres à Safari iOS.
