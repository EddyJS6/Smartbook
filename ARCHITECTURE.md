# Architecture de BrainBook

BrainBook suit une approche **mobile-first** et **local-first** pour les livres,
les vidéos YouTube et leurs notes. L’interface doit rester rapide et utilisable
sur Safari iPhone, y compris lorsque le réseau est absent ou instable.

## Source de données locale

IndexedDB est la source immédiate des données métier. BrainBook utilise **Dexie 4** comme enveloppe légère afin de :

- déclarer explicitement les versions du schéma ;
- centraliser les accès IndexedDB et les transactions ;
- préparer des migrations incrémentales ;
- conserver une API testable indépendamment des composants React.

La base s’appelle `brainbook`. Aucun livre, aucune couverture et aucune note ne doit être enregistré dans `localStorage`.

## Schéma IndexedDB

La version 1, déjà diffusée, déclare uniquement `books` et `images`. Elle reste
inchangée dans le code. La **version 2** conserve ces deux tables et ajoute
`bookNotes`. La **version 3** ajoute uniquement les structures techniques de
sauvegarde `syncQueue`, `syncMetadata` et `localSafetyBackups`. La **version
4** ajoute `noteReadingMetadata`. La **version 5** ajoute le type de contenu et
les informations YouTube aux ressources, ainsi que le titre des notes, sans
supprimer ni réécrire les objets précédents. La **version 6** ajoute le contenu
de note mis en forme ; les anciennes notes restent intactes et sont lues par
compatibilité depuis leurs champs historiques.

### Table `books`

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | UUID | Clé primaire générée côté client |
| `contentType` | `book` ou `video` | Type d’affichage et capacités disponibles |
| `title` | string | Titre normalisé et obligatoire |
| `author` | string | Auteur normalisé et obligatoire |
| `coverImageId` | UUID ou `null` | Référence vers `images.id` |
| `youtubeUrl` | string ou `null` | URL canonique d’une vidéo |
| `youtubeVideoId` | string ou `null` | Identifiant YouTube validé |
| `thumbnailUrl` | string ou `null` | Miniature publique déterministe |
| `status` | `to_read`, `reading`, `finished` | Statut technique stable |
| `createdAt` | date ISO | Date de création immuable |
| `updatedAt` | date ISO | Date de dernière modification |

Index : clé unique `id`, puis `updatedAt`, `title`, `author` et `status`.

Le nom historique de la table reste `books` pour préserver toutes les
migrations et relations déjà diffusées. Une vidéo est une ressource typée dans
cette table : elle ne possède ni Blob de couverture ni scanner. Son titre est
récupéré côté serveur par l’endpoint oEmbed fixe de YouTube. Le navigateur
n’envoie jamais le lien fourni vers une destination arbitraire : le serveur
extrait d’abord un identifiant de 11 caractères et construit l’URL canonique.

### Table `images`

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | UUID | Clé primaire générée côté client |
| `blob` | Blob | Contenu binaire de l’image |
| `mimeType` | string | Type du Blob traité |
| `width` | number | Largeur après redimensionnement |
| `height` | number | Hauteur après redimensionnement |
| `createdAt` | date ISO | Date de création |

Les images ne sont jamais stockées en Base64 ni incorporées dans un objet `Book`.

### Table `bookNotes` — ajoutée en version 2

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | UUID | Clé primaire générée côté client |
| `bookId` | UUID | Référence obligatoire vers `books.id` |
| `title` | string | Titre facultatif, limité à 160 caractères |
| `formattedContent` | `NoteTextRun[]` ou `null` | Contenu unique structuré : texte, gras, italique, soulignement et taille |
| `extractedText` | string | Miroir texte brut pour la compatibilité, la recherche et les anciennes notes |
| `personalReflection` | string | Ancien champ conservé pour ne perdre aucune note diffusée |
| `pageNumber` | string ou `null` | Ancien champ conservé, mais retiré du formulaire |
| `tags` | string[] | Anciens tags conservés, mais retirés du formulaire |
| `sourceType` | `manual`, `scan`, `voice`, `import` | Provenance stable de la note |
| `sourceImageId` | UUID ou `null` | Emplacement réservé à l’image source d’un futur scan |
| `createdAt` | date ISO | Date de création immuable |
| `updatedAt` | date ISO | Date de dernière modification |

Index : clé unique `id`, puis `bookId`, `createdAt` et `updatedAt`.

Le formulaire présente uniquement un titre et un champ de note. L’éditeur
stocke une suite de segments strictement validés et n’enregistre jamais de HTML
arbitraire. Chaque segment porte quatre attributs bornés : `bold`, `italic`,
`underline` et une taille `small`, `normal` ou `large`. Le texte brut dérivé est
conservé dans `extractedText` pour la recherche et la compatibilité.

Le titre ne remplace pas le contenu et reste facultatif pour préserver les
notes historiques. À la première modification d’une ancienne note, passage et
réflexion sont réunis dans le document structuré, séparés par une ligne vide ;
les anciennes pages et tags sont conservés silencieusement. La dictée vocale et
le scanner alimentent ce même contenu unique et utilisent exactement le même
`NoteRepository` que la saisie manuelle. Une note vidéo ne peut pas recevoir la
provenance `scan`; la règle est appliquée à la fois dans l’interface et le
repository.

### Table `noteReadingMetadata` — ajoutée en version 4

Cette table sépare le contenu immuable d’une note de son usage de relecture :
favori, importance, dernière lecture, nombre de lectures et dernière
suggestion. Sa clé primaire est `noteId`. La migration initialise une ligne
neutre pour chaque note existante et sa suppression suit celle de la note dans
la même transaction.

Les composants n’accèdent jamais directement à cette table. Le repository
dédié garantit l’écriture locale et l’Outbox. Une lecture est comptée une seule
fois par affichage après 1,5 seconde de présence à l’écran, afin qu’un simple
passage instantané ne gonfle pas le compteur.

IndexedDB n’accepte pas les booléens comme clés d’index. Les champs métier
`isFavorite` et `isImportant` sont donc accompagnés de miroirs numériques
internes `favoriteIndex` et `importantIndex`; ceux-ci ne quittent jamais
l’appareil et ne font pas partie du schéma Supabase.

### Tables techniques — ajoutées en version 3

`syncQueue` est une Outbox locale. Sa clé stable
`{entityType}:{entityId}` compacte automatiquement plusieurs modifications de
la même entité. Elle contient le type (`book`, `bookNote`,
`noteReadingMetadata`, `coverImage`),
l’opération (`upsert`, `delete`), l’identifiant parent éventuel, les dates, le
nombre d’essais, la dernière erreur et l’état (`pending`, `processing`,
`failed`). Une suppression remplace l’upsert antérieur. Aucun Blob n’est copié
dans la queue : une couverture y est seulement référencée.

`syncMetadata` possède une ligne `primary` avec un UUID aléatoire
d’installation, l’utilisateur associé, l’état de la première synchronisation,
les dates des derniers push, pull, succès et restauration, ainsi qu’une version
de protocole. Cet UUID n’est pas une empreinte du téléphone.

`localSafetyBackups` conserve, avant une restauration, une fusion ou un
changement de compte destructif, une copie versionnée des livres et notes. Elle
référence les identifiants des couvertures mais ne duplique pas leurs Blobs ;
cette limite est annoncée avant confirmation.

## Relations et intégrité

Les repositories constituent la frontière d’accès aux données :

- créer une note vérifie que son livre existe ;
- mettre à jour une note préserve son livre, son identité, sa création et sa provenance ;
- supprimer une note supprime aussi sa future image source, dans la même transaction ;
- supprimer un livre supprime le livre, sa couverture, toutes ses notes et leurs futures images sources dans une seule transaction Dexie.

IndexedDB ne fournit pas de clés étrangères ni de cascade natives. Ces règles transactionnelles empêchent donc explicitement les notes et images orphelines.

## Séparation des responsabilités

- `src/domain` contient les entités, statuts, règles de validation, normalisation et recherche pure.
- `src/storage/database.ts` déclare la base et toutes ses versions.
- `src/storage/repositories` centralise les opérations sur les livres, images et notes.
- `src/hooks` adapte les repositories au cycle de vie React.
- `src/lib/image-processing.ts` valide, oriente selon les capacités du navigateur, redimensionne et compresse les couvertures.
- les composants métier visuels continuent d’utiliser les repositories ;
- `src/sync` coordonne l’Outbox, Supabase, les imports et les écritures locales
  de restauration sans devenir la source de lecture de l’interface.

La recherche de « Mes idées » joint les notes, leurs livres et leurs repères de
relecture en mémoire. Elle porte sur le passage, la réflexion, la référence,
les tags, le titre et l’auteur. La recherche est insensible à la casse et aux
accents. Les filtres favoris, importants, récents, peu relus et jamais relus se
composent avec la recherche et le tag. L’ordre aléatoire est stable pendant une
session et son seed est conservé dans l’URL du mode lecture.

Le mode `/reading` reconstruit sa sélection depuis des paramètres courts
(`bookId`, recherche, tag, filtre et tri), jamais depuis une longue liste
d’identifiants. Il affiche une note à la fois et propose précédent/suivant,
favori, importance et trois tailles de texte. La redécouverte privilégie le
tiers des notes suggérées le moins récemment et évite la note courante lorsque
plusieurs choix existent.

La taille de texte est une préférence légère, distincte des données métier.
Elle est appliquée immédiatement depuis `localStorage` pour rester disponible
hors ligne, puis réconciliée avec le champ
`user_metadata.brainbook_reading_size` du profil Auth Supabase. Une
modification hors ligne reste marquée localement et est envoyée au retour du
réseau. Livres, notes et images ne sont toujours jamais placés dans
`localStorage`.

## Stratégie des images

La couverture source est limitée à 15 Mo et à 40 mégapixels pour protéger la mémoire mobile. Elle est décodée avec les API natives, redimensionnée afin que son plus grand côté ne dépasse pas 1 200 pixels, puis compressée en JPEG avec une qualité raisonnable.

L’affichage récupère le Blob seulement lorsque nécessaire, crée une Object URL, puis la révoque au démontage ou au changement de couverture. Sans image, un placeholder déterministe est généré visuellement à partir du titre et de l’auteur, sans persistance supplémentaire.

## Compte utilisateur et synchronisation Supabase

Supabase relie les livres et les notes au compte utilisateur afin de les
retrouver sur plusieurs appareils. L’interface présente ce fonctionnement
comme un compte BrainBook ; elle n’expose pas les commandes techniques de
sauvegarde et de restauration. IndexedDB reste disponible sans compte, sans
réseau et lorsque Supabase échoue. Les mutations des
repositories enregistrent d’abord les données métier et l’opération Outbox dans
une seule transaction Dexie. L’appel réseau se produit seulement après le
commit ; il ne peut donc pas annuler une mutation locale.

Le client navigateur centralisé utilise uniquement
`NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Ces valeurs
sont publiques par conception. La sécurité repose sur la session Auth et RLS.
Une clé `service_role`, un secret administrateur, un mot de passe ou
`OPENAI_API_KEY` ne doivent jamais entrer dans le bundle client.

### Authentification

La connexion utilise `signInWithPassword` avec email et mot de passe. Il
n’existe ni inscription publique dans l’interface, ni OAuth, Magic Link ou OTP.
Le compte personnel est créé dans le tableau de bord Supabase. Le client active
`persistSession` et `autoRefreshToken`, désactive la détection de session dans
l’URL et écoute `onAuthStateChange`. La PWA ne demande donc pas une nouvelle
connexion à chaque ouverture normale.

Après restauration de la session ou connexion, le provider initialise
automatiquement les données du compte. Un appareil vide télécharge la
bibliothèque du compte ; un compte vide reçoit les données locales ; si les
deux sont vides, l’association est immédiate. Le chargement ne dépend donc pas
de l’ouverture de l’écran Compte.

La déconnexion invalide la session locale et annule logiquement la génération
de synchronisation en cours, sans effacer IndexedDB. Si un autre utilisateur se
connecte, `associatedUserId` bloque tout push automatique. L’utilisateur doit
reconnecter l’ancien compte ou confirmer le retrait local des données de
l’ancien compte. Une sauvegarde structurée est créée avant ce retrait.

### Schéma distant et RLS

Les migrations versionnées créent `public.books`, `public.book_notes` et
`public.note_reading_metadata`. Les tables
tables utilisent la clé composite `(user_id, id)`, conservent les UUID locaux,
les dates métier, `deleted_at` et un `server_updated_at` alimenté par trigger.
La note possède une clé étrangère composite `(user_id, book_id)` vers le livre,
ce qui interdit de rattacher une note au livre d’un autre utilisateur.
`note_reading_metadata` possède une clé étrangère composite vers la note du
même utilisateur, un compteur positif et des index de favoris, importance,
lecture et suggestion.

RLS est activé sur les trois tables. Les seules policies accordent au rôle
`authenticated` les opérations SELECT, INSERT, UPDATE et DELETE lorsque
`auth.uid() = user_id`. Le rôle `anon` ne reçoit aucun droit sur les données
personnelles.

La migration `20260724110000_add_videos_voice_and_note_titles.sql` ajoute les
colonnes vidéo et le titre de note aux tables existantes. Les vidéos restent
donc couvertes par les mêmes policies RLS et les notes conservent leur clé
étrangère propriétaire. Les contraintes distantes exigent des URL YouTube et
de miniature canoniques, un identifiant valide et interdisent une couverture
privée sur une vidéo.

La migration `20260724150000_add_formatted_note_content.sql` ajoute
`formatted_content` en `jsonb` avec une contrainte imposant un tableau. Le
client valide ensuite chaque segment et chaque attribut avant de l’intégrer
dans IndexedDB ; une structure distante invalide est refusée. Les policies RLS
existantes continuent de protéger cette colonne avec le reste de la note.

## Vidéos YouTube

L’accueil affiche par défaut tous les contenus et permet de filtrer livres ou
vidéos. L’ajout d’une vidéo demande seulement son lien et le nom choisi par
l’utilisateur. `GET /api/youtube-metadata` valide les formats `watch`,
`youtu.be`, `shorts`, `live` et `embed`, appelle le seul endpoint oEmbed de
YouTube, puis renvoie titre, identifiant, URL et miniature canoniques.

Le lien, le titre, l’auteur et la miniature sont enregistrés immédiatement
dans IndexedDB avant toute synchronisation. La miniature reste une ressource
publique YouTube : si elle n’est pas disponible hors ligne, l’interface montre
un placeholder sans bloquer la vidéo ni ses notes.

## Dictée vocale

Le bouton « Dicter » utilise `SpeechRecognition` ou son préfixe
historique `webkitSpeechRecognition` lorsqu’il est exposé par Safari. Il est
déclenché exclusivement par un geste utilisateur afin que le navigateur gère
l’autorisation du microphone. Seuls les résultats finalisés sont ajoutés au
champ unique de la note.

BrainBook ne crée aucun `MediaRecorder`, ne stocke aucun fichier audio et
n’envoie lui-même aucun audio à Supabase ou OpenAI. Selon le navigateur, le
service de reconnaissance vocale du système peut utiliser le réseau. En cas
d’indisponibilité ou de refus de permission, la saisie clavier reste intacte.

### Couvertures privées

Le bucket `book-covers` est privé et limité aux formats image usuels. Les
policies `storage.objects` vérifient que le premier segment du chemin égale
`auth.uid()`. Le chemin stable est :

`{userId}/{bookId}/{imageId}.jpg`

L’upload transmet directement le Blob JPEG déjà redimensionné à 1 200 px ; il
n’utilise ni Base64 ni image originale. Au pull, le fichier est téléchargé avec
la session, validé, recréé comme Blob dans `images`, puis associé au livre.
BrainBook ne persiste jamais une URL signée.

### Service et ordre de synchronisation

`SyncService` possède un verrou par installation. Une seconde synchronisation
automatique réutilise la promesse active au lieu de lancer des écritures
concurrentes. Une génération logique invalide les résultats devenus obsolètes
après déconnexion ou changement de compte.

Le push remet d’abord d’éventuelles entrées `processing` en attente, respecte
un délai exponentiel limité, puis traite :

1. upload des nouvelles couvertures ;
2. upsert des livres ;
3. upsert des notes ;
4. upsert des repères de relecture ;
5. suppressions logiques des repères avant leurs notes ;
6. suppressions logiques des notes ;
7. suppressions logiques des livres ;
8. suppression des anciens fichiers de couverture.

Un succès supprime l’entrée. Une erreur temporaire conserve l’entrée et
incrémente `attemptCount`. Après trois essais, ou immédiatement pour une erreur
permanente de validation, d’authentification, RLS, table ou bucket, elle devient
`failed` jusqu’à l’action « Réessayer ».

Le pull lit les lignes actives et les tombstones. Les données distantes sont
validées avant écriture : UUID, propriétaire, dates, statut, source, tags et
relation livre/note. Une ligne invalide est ignorée avec un avertissement. Les
écritures de pull utilisent directement une transaction Dexie afin de ne pas
réalimenter l’Outbox.

### Première synchronisation et restauration

Les quatre cas local/distant sont toujours inspectés après connexion :

- local rempli, compte vide : envoi automatique de l’appareil ;
- local vide, compte rempli : téléchargement automatique ;
- tous deux vides : association immédiate ;
- tous deux remplis : proposition explicite d’une fusion non destructive.

Une restauration télécharge et valide les données avant de remplacer
atomiquement les tables métier. Une sauvegarde structurée locale est créée
avant tout remplacement non vide. Une couverture manquante ne bloque pas le
livre : son placeholder est utilisé.

La fusion se fait par UUID. Deux UUID différents sont conservés. Pour un même
UUID, `updatedAt` le plus récent gagne ; une mutation locale encore en attente
n’est pas écrasée pendant une synchronisation normale. Un `deleted_at` plus
récent évite la résurrection. Les horloges d’appareils restant imparfaites,
cette stratégie est adaptée à un usage personnel et non à l’édition simultanée
collaborative.

### Déclencheurs iPhone

Après connexion, une synchronisation est tentée au lancement, après une
mutation enregistrée (debounce), au retour en ligne et au retour au premier
plan. Une action « Réessayer » est affichée seulement en cas d’erreur. Le
fonctionnement ne dépend pas de Background Sync : Safari peut suspendre
rapidement une PWA en arrière-plan.

La section Compte distingue « À jour », « Mise à jour », « Hors ligne »,
« Action requise » et « À vérifier ». Elle ne promet jamais « À jour » tant que
la queue contient une opération en attente ou en erreur.

## Reconnaissance IA et parcours scanner

La reconnaissance locale Tesseract a été retirée. BrainBook utilise l’API
**Responses d’OpenAI** avec le modèle économique figé
`gpt-5.4-mini-2026-03-17`. Le modèle accepte une image en entrée et renvoie du
texte. Le niveau `detail: "high"` préserve les détails nécessaires aux pages
denses sans utiliser le coût supérieur d’un grand modèle. La variable serveur
optionnelle `OPENAI_OCR_MODEL` permet un changement contrôlé sans exposer le
modèle au client.

Le navigateur envoie un `FormData` à la route Next.js `POST /api/ocr`. Cette
route :

- refuse les requêtes dont l’origine ne correspond pas au déploiement ;
- accepte uniquement JPEG, PNG, WEBP ou GIF ;
- limite l’image à 8 Mo et le multipart à 11 Mo ;
- applique une limite conservatrice de huit requêtes par dix minutes et par
  adresse IP dans chaque instance ;
- transforme temporairement l’image en data URL pour la requête OpenAI ;
- demande une transcription fidèle sans résumé, correction, traduction ou
  obéissance aux instructions visibles dans l’image ;
- utilise `store: false` et renvoie toujours `Cache-Control: no-store` ;
- ne renvoie jamais la clé API ni le contenu d’une erreur amont sensible.

`OPENAI_API_KEY` existe uniquement dans l’environnement serveur Vercel. Elle ne
doit jamais être préfixée par `NEXT_PUBLIC_`. Une annulation interrompt le fetch
du navigateur et l’appel serveur possède un délai maximal de 55 secondes.
L’absence de clé, la limite API, le hors-ligne et les erreurs temporaires sont
présentés sans perdre la photo préparée.

Le parcours rapide fixe actuellement la langue principale au français (`fra`).
La reconnaissance IA nécessite toujours Internet.

## Capture rapide

Le formulaire d’ajout conserve la saisie manuelle visible et place un bouton
« Scanner une page » immédiatement sous le livre. Ce bouton déclenche
synchroniquement un `input type="file"` avec `accept="image/*"` et
`capture="environment"`, ce qui ouvre directement l’interface de prise de vue
sur iPhone. Le système ou Safari reste seul responsable d’une éventuelle
autorisation initiale : une application web ne peut pas la contourner.

Après validation de la photo dans l’interface iOS, BrainBook affiche uniquement
son aperçu, l’information de confidentialité et le bouton « Envoyer ». Il n’y a
plus de détection des bords, de réglage des coins, de redressement, de
comparaison avant/après, de rotation, de choix de filtre ou de langue dans ce
parcours. Les anciens modules OpenCV peuvent rester présents comme code
historique, mais ils ne sont plus importés ni chargés par `ScanFlow`.

## Pipeline d’image avant reconnaissance IA

La photo reste temporaire et côté client :

1. validation du fichier et de sa taille, limitée à 20 Mo ;
2. décodage réel avec `createImageBitmap` orienté selon les métadonnées, puis secours `HTMLImageElement` ;
3. refus des dimensions nulles, trop petites (moins de 320 px sur un côté) ou supérieures à 60 mégapixels ;
4. aperçu immédiat du fichier choisi, sans traitement ni envoi ;
5. après l’action explicite « Envoyer », redimensionnement proportionnel sans agrandissement, avec un grand côté OCR limité à **2 400 px** ;
6. export temporaire JPEG de qualité 0,90, puis appel de la reconnaissance IA en français.

Ces limites offrent des caractères suffisamment détaillés tout en évitant de
traiter plusieurs photos iPhone pleine résolution. Le code ne conserve qu’une
référence au fichier choisi et le Blob temporaire préparé. Les `ImageBitmap`,
canvases et Object URLs sont fermés, réduits ou révoqués dès qu’ils ne sont plus
utiles.

HEIC/HEIF fonctionne uniquement lorsque Safari peut le décoder nativement. Aucune bibliothèque lourde de conversion n’est ajoutée ; un échec propose de reprendre la photo ou d’utiliser un JPEG.

## Sélection du passage reconnu

Le modèle renvoie une transcription textuelle, sans boîtes de mots. Cette
décision supprime l’alignement fragile entre l’image et les coordonnées d’un
OCR classique. L’utilisateur peut afficher la photo préparée pour comparaison,
corriger librement le texte dans un `textarea`, sélectionner une plage avec la
sélection native iOS ou utiliser l’intégralité du texte.

Le texte visible dans la photo est explicitement traité comme une donnée à
transcrire, jamais comme une instruction. L’IA doit utiliser `[illisible]`
plutôt que d’inventer un passage. Le résultat reste entièrement éditable.
« Utiliser la sélection » ou « Utiliser tout le texte » remplit directement le
même document que la saisie manuelle, puis marque le brouillon
`sourceType: "scan"`.

## Persistance et confidentialité du scan

Le scanner utilise le formulaire et `NoteRepository.create` existants. Une note scannée est enregistrée avec `sourceType: "scan"` et `sourceImageId: null`. La synchronisation commence uniquement après cet enregistrement final.

La photographie n’est jamais inscrite dans IndexedDB. Après une action explicite, la page préparée est envoyée temporairement à la route Vercel puis à l’API OpenAI. BrainBook ne la stocke ni dans sa base, ni dans Cache Storage, ni dans les logs applicatifs. Après enregistrement ou abandon, le fichier, le Blob préparé et les Object URLs sont libérés.

Supabase reçoit uniquement le contenu final de `BookNote`. Il ne reçoit jamais
la photographie de page, le brouillon du scanner, la réponse brute de l’IA, le
prompt, les coordonnées ou les résultats OCR intermédiaires.

Les données envoyées à l’API OpenAI ne servent pas à entraîner les modèles par défaut, sauf consentement explicite du titulaire du compte. Les journaux de surveillance des abus peuvent cependant contenir des données client pendant une durée pouvant aller jusqu’à 30 jours selon les contrôles du compte OpenAI. Le champ `sourceImageId` reste `null`.

## Compatibilité iPhone

- toute opération IndexedDB reste dans des composants ou hooks clients ;
- les champs utilisent une taille de texte de 16 px pour éviter le zoom automatique de Safari ;
- le sélecteur de couverture utilise `accept="image/*"` sans forcer `capture`, afin de laisser Safari proposer photothèque ou appareil photo ;
- le traitement d’image privilégie `createImageBitmap` et utilise un secours `HTMLImageElement` ;
- le bouton scanner déclenche directement l’input de capture dans le même geste utilisateur pour rester compatible avec Safari iOS ;
- les safe areas, cibles tactiles et la barre de navigation existante sont conservées ;
- les erreurs de quota, d’indisponibilité du stockage et de décodage d’image sont traduites en messages compréhensibles.

Certains formats, notamment une image HEIC non décodable par la version de Safari utilisée, peuvent être refusés avec un message clair. Le quota IndexedDB reste géré par iOS et dépend de l’espace disponible ainsi que de ses politiques de stockage.

## Migrations futures

Les évolutions doivent ajouter une nouvelle déclaration `database.version(n)` et, seulement si nécessaire, une transformation explicite. Une version existante ne doit jamais être réécrite après diffusion. Un test ouvre une base v1 peuplée avec la classe courante pour vérifier que les données historiques sont conservées et placées dans l’Outbox.

Les migrations Supabase vivent dans `supabase/migrations` et sont appliquées au
projet lié avec `supabase db push`. Elles ne doivent pas être recréées
manuellement colonne par colonne dans le tableau de bord.

## Limites actuelles

Le scan rapide ne corrige pas la perspective et ne recadre pas la page. La
photo doit donc être prise aussi parallèle, nette et rapprochée que possible.
La photo originale et la transcription textuelle éditable servent de secours.

Il n’y a ni scan multipage, ni import PDF, ni détection automatique de langue.

La synchronisation n’est ni temps réel, ni collaborative. Deux appareils qui
modifient simultanément la même note peuvent produire un résultat dépendant de
leurs horloges ; le dernier `updatedAt` gagne sauf mutation locale encore en
attente. Il n’existe pas encore de purge planifiée des tombstones distants.

La sauvegarde structurée précédant une restauration protège les livres et
notes, mais ne constitue pas encore un export ZIP indépendant contenant les
Blobs de couverture.

La route OpenAI payante reste protégée seulement par l’origine, des limites de
taille et une limite de fréquence par instance. Un déploiement publiquement
connu doit ajouter une règle Vercel de rate limiting et une limite de dépense
OpenAI stricte.

Le service worker gère le shell, les routes visitées et les ressources statiques.
Les données métier IndexedDB et les photos de page ne sont ni mises en cache par
le service worker ni synchronisées à distance.
