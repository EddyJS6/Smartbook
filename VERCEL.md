# Configuration de la reconnaissance IA

BrainBook utilise une route serveur Next.js, `/api/ocr`, pour transmettre
temporairement la page préparée à l’API OpenAI. La clé OpenAI ne doit jamais
être placée dans le code client ni préfixée par `NEXT_PUBLIC_`.

## OpenAI

1. Ouvrir `https://platform.openai.com/`.
2. Ajouter un moyen de paiement ou des crédits API. Un abonnement ChatGPT
   n’inclut pas les crédits de l’API.
3. Créer un projet dédié à BrainBook.
4. Définir une limite mensuelle prudente dans les réglages de facturation.
5. Créer une clé API secrète pour ce projet et la copier une seule fois.

## Vercel

1. Ouvrir le projet BrainBook dans Vercel.
2. Aller dans **Settings → Environment Variables**.
3. Ajouter `OPENAI_API_KEY` avec la clé secrète, pour **Production** et, si
   souhaité, **Preview**.
4. Ajouter facultativement `OPENAI_OCR_MODEL` avec la valeur
   `gpt-5.4-mini-2026-03-17`.
5. Redéployer la dernière version depuis l’onglet **Deployments**.

Le déploiement doit rester protégé contre les abus. La route effectue une
vérification d’origine, limite la taille des images et applique une limite de
fréquence conservatrice par adresse IP. Pour une URL publiquement connue,
ajouter également une règle de rate limiting Vercel sur `POST /api/ocr` et
conserver une limite de dépense stricte dans le projet OpenAI.

## Test

1. Ouvrir la PWA en ligne.
2. Scanner une page, la recadrer et choisir **Reconnaissance IA**.
3. Vérifier que le texte apparaît et reste modifiable.
4. Vérifier dans le tableau de bord OpenAI qu’une seule requête a été facturée.
5. Passer brièvement en mode avion : BrainBook doit conserver le recadrage et
   expliquer que la reconnaissance IA nécessite Internet.
