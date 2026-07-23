# Architecture de BrainBook

BrainBook suit une approche **mobile-first** et **local-first**. L’interface doit rester rapide et utilisable sur Safari iPhone, y compris lorsque le réseau est absent ou instable.

## Source de données locale

IndexedDB est la source immédiate des données métier. BrainBook utilise **Dexie 4** comme enveloppe légère afin de :

- déclarer explicitement les versions du schéma ;
- centraliser les accès IndexedDB et les transactions ;
- préparer des migrations incrémentales ;
- conserver une API testable indépendamment des composants React.

La base s’appelle `brainbook`. Aucun livre, aucune couverture et aucune note ne doit être enregistré dans `localStorage`.

## Schéma IndexedDB

La version 1, déjà diffusée, déclare uniquement `books` et `images`. Elle reste inchangée dans le code. La **version 2** conserve ces deux tables et ajoute `bookNotes` de façon additive : l’ouverture de la base met à niveau le schéma sans transformer ni supprimer les livres et images existants.

### Table `books`

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | UUID | Clé primaire générée côté client |
| `title` | string | Titre normalisé et obligatoire |
| `author` | string | Auteur normalisé et obligatoire |
| `coverImageId` | UUID ou `null` | Référence vers `images.id` |
| `status` | `to_read`, `reading`, `finished` | Statut technique stable |
| `createdAt` | date ISO | Date de création immuable |
| `updatedAt` | date ISO | Date de dernière modification |

Index : clé unique `id`, puis `updatedAt`, `title`, `author` et `status`.

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
| `extractedText` | string | Passage saisi manuellement ou extrait plus tard |
| `personalReflection` | string | Réflexion personnelle |
| `pageNumber` | string ou `null` | Page ou référence libre, par exemple `p. 42` ou `chapitre 3` |
| `tags` | string[] | Tags normalisés et dédupliqués sans tenir compte de la casse |
| `sourceType` | `manual`, `scan`, `import` | Provenance stable de la note |
| `sourceImageId` | UUID ou `null` | Emplacement réservé à l’image source d’un futur scan |
| `createdAt` | date ISO | Date de création immuable |
| `updatedAt` | date ISO | Date de dernière modification |

Index : clé unique `id`, puis `bookId`, `createdAt` et `updatedAt`. Les tags restent un tableau embarqué, car leur faible volume et la recherche locale en mémoire ne justifient pas une table de jointure.

Une note est valide si elle contient au moins un passage ou une réflexion. Les deux champs peuvent coexister. Le nombre de notes est toujours calculé depuis `bookNotes` et n’est jamais dupliqué dans `Book`.

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
- les composants visuels n’accèdent pas directement aux tables Dexie.

La recherche de « Mes idées » joint les notes et leurs livres en mémoire, puis porte sur le passage, la réflexion, la référence, les tags, le titre et l’auteur. La recherche est insensible à la casse et aux accents. Le filtre par tag peut être combiné avec le texte recherché.

## Stratégie des images

La couverture source est limitée à 15 Mo et à 40 mégapixels pour protéger la mémoire mobile. Elle est décodée avec les API natives, redimensionnée afin que son plus grand côté ne dépasse pas 1 200 pixels, puis compressée en JPEG avec une qualité raisonnable.

L’affichage récupère le Blob seulement lorsque nécessaire, crée une Object URL, puis la révoque au démontage ou au changement de couverture. Sans image, un placeholder déterministe est généré visuellement à partir du titre et de l’auteur, sans persistance supplémentaire.

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
même `extractedText` que la saisie manuelle, conserve réflexion, page et tags,
puis marque le brouillon `sourceType: "scan"`.

## Persistance et confidentialité du scan

Le scanner utilise le formulaire et `NoteRepository.create` existants. Une note scannée est enregistrée avec `sourceType: "scan"` et `sourceImageId: null`. Le schéma IndexedDB v2 ne change donc pas.

La photographie n’est jamais inscrite dans IndexedDB. Après une action explicite, la page préparée est envoyée temporairement à la route Vercel puis à l’API OpenAI. BrainBook ne la stocke ni dans sa base, ni dans Cache Storage, ni dans les logs applicatifs. Après enregistrement ou abandon, le fichier, le Blob préparé et les Object URLs sont libérés.

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

Les évolutions doivent ajouter une nouvelle déclaration `database.version(n)` et, seulement si nécessaire, une transformation explicite. Une version existante ne doit jamais être réécrite après diffusion. Un test ouvre une base v1 peuplée avec la classe v2 pour vérifier que les données historiques sont conservées.

Les UUID locaux seront aussi les identifiants distants. `updatedAt` permettra plus tard de repérer les changements à synchroniser. Supabase servira de sauvegarde et de synchronisation, jamais de prérequis au fonctionnement immédiat.

## Limites actuelles

Le scan rapide ne corrige pas la perspective et ne recadre pas la page. La
photo doit donc être prise aussi parallèle, nette et rapprochée que possible.
La photo originale et la transcription textuelle éditable servent de secours.

Il n’y a ni scan multipage, ni import PDF, ni détection automatique de langue.

Il n’y a toujours ni authentification ni synchronisation distante. La route payante est donc protégée seulement par l’origine, des limites de taille et une limite de fréquence par instance. Un déploiement publiquement connu doit ajouter une règle Vercel de rate limiting et une limite de dépense OpenAI stricte. Les suppressions sont définitives sur l’appareil et les confirmations l’indiquent explicitement.

Le service worker gère le shell, les routes visitées et les ressources statiques.
Les données métier IndexedDB et les photos de page ne sont ni mises en cache par
le service worker ni synchronisées à distance.
