# Consignes BrainBook

- BrainBook est une PWA personnelle mobile consacrée aux livres, notes de lecture et idées.
- Stack : Next.js App Router, React, TypeScript strict et Tailwind CSS.
- Concevoir mobile-first, avec une priorité à l’usage à une main et à Safari sur iPhone.
- Respecter l’approche local-first : IndexedDB sera la source immédiate ; Supabase ne sera qu’une sauvegarde/synchronisation future.
- Faire évoluer IndexedDB par versions et migrations additives ; ne jamais réécrire un ancien schéma déjà diffusé.
- Conserver les Blobs dans `images` et effectuer les changements livre/couverture dans une transaction unique.
- Effectuer la suppression d’un livre, de ses notes et de leurs images dans une seule transaction afin de ne jamais laisser de donnée orpheline.
- Faire alimenter au futur scanner le même brouillon et le même repository que la saisie manuelle, sans dupliquer le formulaire ni le modèle.
- Conserver un typage TypeScript strict et éviter les contournements (`any`, assertions injustifiées).
- Tester chaque changement avec au minimum le lint, la vérification TypeScript et le build.
- Ne pas modifier plusieurs grandes fonctionnalités au cours d’une même intervention.
- Préserver les safe areas, les cibles tactiles et les capacités PWA compatibles avec Safari iOS.
- Mettre à jour `ARCHITECTURE.md` après toute décision structurelle importante.
