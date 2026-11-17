# Sourcing & Cartographie des Réparateurs Cycle en France (7 Grandes Villes)

Application web interactive et pipeline OpenData de sourcing des acteurs de la réparation de vélos en activité.

Application web interactive et pipeline OpenData de sourcing des acteurs de la réparation de vélos en activité sur les **7 grandes métropoles françaises** :
- **Paris** (Île-de-France)
- **Lyon** (Métropole de Lyon)
- **Marseille** (Aix-Marseille-Provence)
- **Bordeaux** (Bordeaux Métropole)
- **Lille** (Métropole Européenne de Lille)
- **Nantes** (Nantes Métropole)
- **Strasbourg** (Eurométropole de Strasbourg)

## Fonctionnalités de la plateforme (Prototype V2)

1. **Cartographie Interactive (Leaflet + Clustering)** :
   - Vue France entière et navigation rapide par agglomération et par quartier / arrondissement.
   - Clusters automatiques sous le zoom 14, avec marqueurs détaillés au zoom rapproché et repère Decathlon distinctif.
   - Marqueurs codés par activité, avec repère Decathlon contrasté.
   - Bascule entre les modes **Clusters** et **Marqueurs détaillés**.
2. **Filtres Multicritères & Recherche Instantanée** :
   - Recherche par enseigne, raison sociale, numéro de SIRET/SIREN, rue ou quartier.
   - Sélection de plusieurs villes et activités, catégorie d'acteur, note, tranche de chiffre d'affaires, forfait de révision, présence VAE et zone visible.
3. **Fiche Détaillée par Réparateur (Card & Volet d'inspection)** :
   - **Visuel & État du lieu** : Photo de la devanture / atelier (via API Panoramax / Wikimedia / StreetView) + lien direct vers Google Street View et Panoramax aux coordonnées GPS exactes pour inspecter l'état réel de l'établissement.
   - **Données Administratives & Financières** : Numéro de SIRET et SIREN, statut actif vérifié ("En activité"), code NAF (`95.29Z`, `47.64Z`, `94.99Z`), date de création, tranche d'effectif, Chiffre d'Affaires (CA publié ou estimé) et liens directs vers **L'Annuaire des Entreprises (data.gouv.fr)** et **Pappers**.
   - **Coordonnées & Présence Digitale** : Adresse exacte, téléphone cliquable, email, site web officiel, liens réseaux sociaux (Instagram, Facebook, LinkedIn), horaires d'ouverture et spécialités techniques (VAE, Cargo, Hydraulique, etc.).
   - **Analyse des Avis Clients** : Note moyenne sur 5, volume d'avis, et affichage côte à côte du **Top 5 des meilleurs avis** et du **Top 5 des pires avis** (points de vigilance : délais, tarifs, disponibilité pièces) + lien direct Google Maps.
4. **Comparateur Multi-Acteurs (2 à 4 réparateurs)** :
   - Matrice de comparaison côte à côte : note, volume d'avis, chiffre d'affaires, ancienneté, effectif, tarifs moyens constatés, spécialités, état du lieu et contacts.
5. **Synchronisation Google Sheets & Export** :
   - Rechargement à l'ouverture et à la demande depuis le Google Sheet maître. En cas d'échec, le jeu local reste visible et l'état de synchronisation précise la cause.
   - Export CSV de toutes les colonnes disponibles dans la vue filtrée, ou export JSON.
   - Lien de partage dynamique encodant les filtres, la ville et la sélection dans l'URL.

## Structure du projet

- `index.html` : Interface principale de l'application cartographique et analytique.
- `styles.css` : Design system moderne responsive (mode clair/sombre, cartes, tiroir d'inspection, comparateur).
- `data/reparateurs_data.js` : Jeu local de repli.
- `app.js` : Carte Leaflet, synchronisation CSV Google Sheets, filtres, fiches, comparateur, exports et partage d'URL.
- `scripts/sourcing_pipeline.py` : Script Python reproductible de sourcing et de consolidation OpenData.

### Connexion au Google Sheet

La feuille doit être consultable sans authentification et disponible en export CSV. L'application tente le lien d'export configuré dans `app.js` à chaque ouverture et via **Actualiser**. Pour une autre feuille, définir `window.REPARATEURS_SHEET_CSV_URL` avant le chargement de `app.js`. Si l'accès est refusé ou bloqué par le navigateur, l'application conserve les données locales et affiche l'état d'erreur. Le lien fourni pour le prototype renvoie actuellement HTTP 401 depuis l'environnement de développement ; la synchronisation réelle nécessite donc de rendre la feuille lisible/publiée en CSV.
