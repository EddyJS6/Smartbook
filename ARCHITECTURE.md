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

## OCR local et parcours scanner

BrainBook utilise **Tesseract.js 7.0.0** pour reconnaître localement le texte d’une page. Le module est importé dynamiquement par `BrowserOcrSession` uniquement après une action explicite sur l’écran de scan. Il n’est ni importé pendant le rendu serveur, ni chargé par la bibliothèque ou la page « Mes idées ».

Tesseract s’exécute dans son Web Worker. Une session possède au maximum un worker :

- le worker est réutilisé pour les analyses successives dans la même langue ;
- changer de langue termine le worker courant avant d’en créer un autre ;
- annuler invalide l’identifiant d’opération, termine le worker et ignore tout résultat tardif ;
- quitter le scan ou démonter le composant termine également le worker ;
- aucun scheduler multi-worker n’est utilisé.

Les langues proposées sont le français (`fra`), l’anglais (`eng`) et le polonais (`pol`), une seule à la fois. Le français est sélectionné par défaut. Le worker et le cœur WebAssembly utilisent les chemins cohérents avec les versions installées calculés par Tesseract.js ; aucune URL versionnée n’est recopiée dans le code BrainBook. Sans `langPath` personnalisé, Tesseract.js récupère le modèle choisi depuis `@tesseract.js-data/<lang>/4.0.0_best_int` sur jsDelivr, le décompresse puis le met en cache dans IndexedDB. BrainBook conserve dans Cache Storage un simple marqueur technique après une préparation réussie afin d’éviter de lancer hors ligne une langue jamais téléchargée. Ce marqueur ne contient ni photo ni texte.

Le cache du modèle améliore les analyses suivantes. Un premier chargement exige une connexion. Une utilisation totalement hors ligne après ce premier chargement dépend aussi de la disponibilité du worker et du cœur WebAssembly dans le cache HTTP du navigateur ; elle doit donc être vérifiée sur chaque version de Safari et n’est pas présentée comme une garantie absolue.

## Détection et redressement de page

Le scanner embarque la distribution autonome officielle **OpenCV.js 4.13.0** dans `public/vendor/opencv/4.13.0/opencv.js`. Sa source, sa licence Apache 2.0 et son empreinte SHA-256 sont documentées dans le `README.md` placé à côté du fichier. Le WebAssembly est incorporé dans ce JavaScript : le déploiement ne dépend donc pas d’un CDN OpenCV.

OpenCV n’est chargé ni au démarrage de l’application, ni dans le thread principal. Le parcours scanner crée à la demande un unique worker classique, `public/workers/document-processing-worker.js`, qui charge la ressource locale avec `importScripts`. Les pixels RGBA transitent par des `ArrayBuffer` transférables afin d’éviter leur duplication entre le thread d’interface et le worker. Le décodage initial et l’encodage JPEG final restent dans Canvas, car ces API sont mieux prises en charge dans le contexte de la page.

Le worker OpenCV est terminé lors d’une annulation, d’un nouveau fichier, d’un abandon, du démontage du scanner et après le transfert du passage vers la note. Chaque `cv.Mat`, `MatVector`, noyau morphologique et matrice de transformation est libéré dans un bloc `finally`. Le module Emscripten officiel expose temporairement une méthode `then` non standard ; le worker attend `cv.calledRun`, puis retire cette propriété pour empêcher une assimilation récursive du module comme une Promise.

La détection utilise une copie dont le grand côté ne dépasse pas **1 000 px** :

1. conversion en niveaux de gris, mesure de luminosité et flou gaussien ;
2. deux passages Canny (`45/135` et `28/92`) puis fermeture morphologique ;
3. extraction des contours externes, avec un maximum de 420 contours inspectés pour protéger la mémoire mobile ;
4. approximation polygonale (`epsilon = 2,2 %` du périmètre) et conservation des quadrilatères convexes ;
5. secours par seuillage adaptatif lorsque les contours Canny sont insuffisants.

Le score final est une fonction TypeScript pure qui combine aire, angles proches de 90°, centrage, proximité des bords et proportions plausibles. Un résultat fort est accepté à partir de `0,66`, un résultat moyen à partir de `0,42`, et les cas faibles reviennent au cadre de secours. Ce cadre laisse une marge normalisée de 5,5 % autour de l’image.

Les quatre coins sont toujours conservés sous forme de coordonnées normalisées `[0, 1]`. Des fonctions pures assurent les conversions entre image source, image de détection et aperçu, l’ordre haut-gauche / haut-droit / bas-droit / bas-gauche, la rotation par pas de 90°, la convexité, les croisements et la surface minimale. L’automatisme ne remplace jamais l’utilisateur : les quatre poignées tactiles de 44 px restent disponibles, avec polygone, assombrissement extérieur, loupe, zoom 100/150/200 %, rotations et réglage accessible au clavier.

Le redressement calcule la taille de sortie depuis les longueurs opposées, avec un grand côté plafonné à **2 600 px** et 6,5 mégapixels. OpenCV applique `getPerspectiveTransform`, `warpPerspective`, puis l’un des trois modes :

- `Original` : couleur corrigée ;
- `Niveaux de gris` : conversion monochrome ;
- `Contraste renforcé` : niveaux de gris puis égalisation d’histogramme.

Un aperçu avant/après est présenté avant l’OCR. Toute rotation ou toute modification des coins invalide l’ancien résultat OCR. En cas de chargement impossible, de page indétectable, de géométrie invalide ou d’échec du redressement, la photo non redressée reste utilisable et la saisie manuelle reste accessible.

Le service worker ne précache pas les quelque 11 Mo d’OpenCV. Il met en cache à la demande le worker et la ressource versionnée après leur première utilisation. Ainsi, un premier scan nécessite le réseau si ce cache n’existe pas ; les scans suivants peuvent réutiliser OpenCV hors ligne. Une mise à jour de version ou d’empreinte impose un nouveau chemin versionné ou un nouveau nom de cache.

## Pipeline d’image OCR

La photo reste temporaire et côté client :

1. validation du fichier et de sa taille, limitée à 20 Mo ;
2. décodage réel avec `createImageBitmap` orienté selon les métadonnées, puis secours `HTMLImageElement` ;
3. refus des dimensions nulles, trop petites (moins de 320 px sur un côté) ou supérieures à 60 mégapixels ;
4. affichage immédiat du cadre manuel de secours, pendant que la détection automatique travaille sur une copie réduite ;
5. réglage des quatre coins et, si demandé, redressement en perspective dans le worker OpenCV ;
6. choix entre la page redressée et l’original, puis mode `Original`, `Niveaux de gris` ou `Contraste renforcé` ;
7. redimensionnement proportionnel sans agrandissement, avec un grand côté OCR limité à **2 400 px** ;
8. export temporaire JPEG de qualité 0,90, utilisé à la fois pour l’aperçu et l’OCR.

Ces limites offrent des caractères suffisamment détaillés tout en évitant de traiter simultanément plusieurs photos iPhone pleine résolution. Le code ne conserve qu’une référence au fichier choisi et les Blobs temporaires nécessaires à l’étape courante. Les `ImageBitmap`, canvases, anciens Blobs, buffers transférés et Object URLs sont fermés, réduits, remplacés ou révoqués dès qu’ils ne sont plus utiles. OpenCV et Tesseract travaillent successivement, jamais en parallèle dans le parcours normal.

HEIC/HEIF fonctionne uniquement lorsque Safari peut le décoder nativement. Aucune bibliothèque lourde de conversion n’est ajoutée ; un échec propose de reprendre la photo ou d’utiliser un JPEG.

## Modèle OCR interne

Les composants ne dépendent pas de la structure brute de Tesseract. Le domaine expose :

- `OcrBoundingBox` pour les coordonnées `x0`, `y0`, `x1`, `y1` ;
- `OcrWord` pour le texte, la confiance, la boîte, les indices structurels et l’ordre stable ;
- `OcrLine` pour les mots, le texte, la boîte et sa position structurelle ;
- `OcrResult` pour le texte intégral, les mots, les lignes, les dimensions, la confiance moyenne, la langue et la durée.

L’appel `worker.recognize` active explicitement les sorties `text` et `blocks`, désactivées par défaut dans les versions récentes. La transformation parcourt blocs, paragraphes, lignes puis mots. Elle ignore les mots vides mais conserve ceux de faible confiance. Un résultat partiel contenant du texte sans blocs reste utilisable par la sélection textuelle de secours.

## Sélection et reconstruction du passage

Sur la photo, chaque mot est superposé en pourcentage des dimensions de l’image OCR. L’image et la couche partagent le même conteneur et le même facteur de zoom (100 %, 150 % ou 200 %), ce qui maintient l’alignement lors du redimensionnement. Les Pointer Events gèrent doigt, souris et stylet sans placer chaque mot dans l’ordre de tabulation.

La sélection est une plage `startOrder` / `endOrder`. Elle accepte le glissement avec capture du pointeur, `pointercancel`, la sélection en sens inverse, ou deux touchers successifs sur le premier et le dernier mot. Les événements de mouvement ne changent React que lorsque le mot réellement survolé change. Les actions permettent d’effacer, de tout sélectionner, de recommencer ou d’utiliser le passage.

Trois modes sont proposés : `Mots`, `Lignes` et `Texte`. En mode lignes, un premier puis un second toucher sélectionnent l’intervalle de lignes correspondant ; la recherche de la ligne la plus proche tolère un léger décalage autour des boîtes OCR. Changer de mode conserve les corrections textuelles déjà effectuées.

La reconstruction trie les mots par ordre de lecture, conserve un saut de ligne entre lignes et deux entre paragraphes ou blocs. Elle retire l’espace avant les ponctuations fermantes et rattache correctement apostrophes et traits d’union, sans modifier les données OCR originales.

L’alternative « Sélectionner dans le texte » est toujours disponible. Elle permet de corriger le texte, d’utiliser `selectionStart` / `selectionEnd` du `textarea`, ou de choisir explicitement tout le texte. Elle couvre l’accessibilité et les cas où les boîtes sont absentes ou mal alignées.

Après sélection, une étape de vérification conserve un passage entièrement éditable. « Ajouter à ma note » remplit le même `extractedText` que la saisie manuelle, conserve réflexion, page et tags, puis marque le brouillon `sourceType: "scan"`.

## Persistance et confidentialité du scan

Le scanner utilise le formulaire et `NoteRepository.create` existants. Une note scannée est enregistrée avec `sourceType: "scan"` et `sourceImageId: null`. Le schéma IndexedDB v2 ne change donc pas.

La photographie n’est jamais envoyée à une route Next.js, une API OCR ou un service distant, et elle n’est jamais inscrite dans IndexedDB. Seuls le worker, le cœur WebAssembly et le modèle de langue sont susceptibles d’être téléchargés. Après enregistrement ou abandon, le fichier, le Blob préparé, les Object URLs et le worker sont libérés.

Ne pas conserver les photos protège la confidentialité des pages complètes, réduit fortement le stockage mobile et simplifie une future synchronisation. Le champ `sourceImageId` reste réservé à une éventuelle option volontaire ultérieure.

## Compatibilité iPhone

- toute opération IndexedDB reste dans des composants ou hooks clients ;
- les champs utilisent une taille de texte de 16 px pour éviter le zoom automatique de Safari ;
- le sélecteur de couverture utilise `accept="image/*"` sans forcer `capture`, afin de laisser Safari proposer photothèque ou appareil photo ;
- le traitement d’image privilégie `createImageBitmap` et utilise un secours `HTMLImageElement` ;
- les poignées du recadrage utilisent Pointer Events, capture du pointeur, `requestAnimationFrame`, `pointercancel` et une cible minimale de 44 px ;
- la loupe et les zooms permettent un réglage fin sans exiger une précision parfaite du doigt ;
- les calculs OpenCV sont limités, séquentiels et isolés dans un worker unique ;
- les safe areas, cibles tactiles et la barre de navigation existante sont conservées ;
- les erreurs de quota, d’indisponibilité du stockage et de décodage d’image sont traduites en messages compréhensibles.

Certains formats, notamment une image HEIC non décodable par la version de Safari utilisée, peuvent être refusés avec un message clair. Le quota IndexedDB reste géré par iOS et dépend de l’espace disponible ainsi que de ses politiques de stockage.

## Migrations futures

Les évolutions doivent ajouter une nouvelle déclaration `database.version(n)` et, seulement si nécessaire, une transformation explicite. Une version existante ne doit jamais être réécrite après diffusion. Un test ouvre une base v1 peuplée avec la classe v2 pour vérifier que les données historiques sont conservées.

Les UUID locaux seront aussi les identifiants distants. `updatedAt` permettra plus tard de repérer les changements à synchroniser. Supabase servira de sauvegarde et de synchronisation, jamais de prérequis au fonctionnement immédiat.

## Limites actuelles

La détection et le redressement corrigent une page globalement plane ; ils ne déforment pas localement une page incurvée près de la reliure. Un fort reflet, un faible contraste, une page partiellement masquée ou un fond de couleur proche peut exiger de replacer les coins manuellement. Une perspective extrême peut rester imparfaite. La photo originale, la sélection par lignes et la sélection textuelle éditable servent toujours de secours.

Il n’y a ni scan multipage, ni import PDF, ni détection automatique de langue.

Il n’y a toujours ni authentification ni synchronisation distante. Les suppressions sont donc définitives sur l’appareil et les confirmations l’indiquent explicitement.

Le service worker gère le shell, les routes visitées, les ressources statiques et les ressources techniques OpenCV/OCR téléchargées à la demande. Les données métier IndexedDB et les photos de page ne sont ni mises en cache par le service worker ni synchronisées à distance.
