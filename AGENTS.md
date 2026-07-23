# Consignes BrainBook

- BrainBook est une PWA personnelle mobile consacrée aux livres, notes de lecture et idées.
- Stack : Next.js App Router, React, TypeScript strict et Tailwind CSS.
- Concevoir mobile-first, avec une priorité à l’usage à une main et à Safari sur iPhone.
- Respecter l’approche local-first : IndexedDB sera la source immédiate ; Supabase ne sera qu’une sauvegarde/synchronisation future.
- Conserver un typage TypeScript strict et éviter les contournements (`any`, assertions injustifiées).
- Tester chaque changement avec au minimum le lint, la vérification TypeScript et le build.
- Ne pas modifier plusieurs grandes fonctionnalités au cours d’une même intervention.
- Préserver les safe areas, les cibles tactiles et les capacités PWA compatibles avec Safari iOS.
- Mettre à jour `ARCHITECTURE.md` après toute décision structurelle importante.
