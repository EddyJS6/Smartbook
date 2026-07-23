# Architecture de BrainBook

BrainBook suit une approche **mobile-first** et **local-first**. L’interface doit rester rapide et utilisable sur Safari iPhone, y compris lorsque le réseau est absent ou instable.

## Direction prévue

- **IndexedDB sera la source de données immédiate** sur l’appareil. Les lectures et écritures métier passeront plus tard par une couche de dépôt dédiée, jamais par `localStorage`.
- **Chaque action devra fonctionner hors ligne.** L’interface écrira d’abord localement, sans attendre une réponse réseau.
- **Supabase servira ultérieurement de sauvegarde et de synchronisation**, et non de prérequis au fonctionnement de l’application.
- **Les données locales et distantes partageront les mêmes UUID**, générés côté client, afin de faciliter la réconciliation.
- **Les champs `updatedAt` permettront de repérer et arbitrer les changements** lors de la future synchronisation. La stratégie de résolution des conflits reste à définir.
- **Les images seront stockées séparément des données structurées** : Blob/référence locale dans IndexedDB sur l’appareil, puis objet dans un stockage distant. Les entités ne contiennent qu’une `ImageReference`, jamais une grande chaîne Base64.
- **Aucune logique de synchronisation n’est implémentée à cette étape.** Les données visibles proviennent uniquement de `src/data/demo-books.ts`.

## PWA actuelle

Le manifeste, les métadonnées iOS, les icônes locales et un service worker minimal sont en place. Le service worker ne gère que le shell, les routes déjà visitées et les ressources statiques de l’interface. Il ne met en cache aucune donnée métier.

## Étapes structurelles futures

1. Définir les interfaces de dépôts métier.
2. Ajouter l’implémentation IndexedDB et ses migrations de schéma.
3. Brancher les écrans sur les dépôts locaux.
4. Concevoir séparément la file d’opérations et la synchronisation Supabase.

Toute décision qui modifie ces frontières doit être consignée ici.
