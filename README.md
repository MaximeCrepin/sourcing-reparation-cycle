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

## Fonctionnalités de la plateforme

1. **Cartographie Interactive (Leaflet + Clustering + Heatmap)** :
   - Vue France entière et navigation rapide par agglomération et par quartier / arrondissement.
   - Marqueurs codés par typologie d'acteur (Atelier indépendant, Vélociste / Boutique, Réseau / Grande enseigne, Réparateur mobile / itinérant, Atelier associatif / participatif).
   - Bascule entre le mode **Clusters**, **Marqueurs détaillés** et **Carte de chaleur (Densité)**.
2. **Filtres Multicritères & Recherche Instantanée** :
   - Recherche par enseigne, raison sociale, numéro de SIRET/SIREN, rue ou quartier.
   - Filtrage par ville, quartier, catégorie d'acteur, note client minimale, tranche de Chiffre d'Affaires, présence de SIRET, site web ou réseaux sociaux.
3. **Fiche Détaillée par Réparateur (Card & Volet d'inspection)** :
   - **Visuel & État du lieu** : Photo de la devanture / atelier (via API Panoramax / Wikimedia / StreetView) + lien direct vers Google Street View et Panoramax aux coordonnées GPS exactes pour inspecter l'état réel de l'établissement.
   - **Données Administratives & Financières** : Numéro de SIRET et SIREN, statut actif vérifié ("En activité"), code NAF (`95.29Z`, `47.64Z`, `94.99Z`), date de création, tranche d'effectif, Chiffre d'Affaires (CA publié ou estimé) et liens directs vers **L'Annuaire des Entreprises (data.gouv.fr)** et **Pappers**.
   - **Coordonnées & Présence Digitale** : Adresse exacte, téléphone cliquable, email, site web officiel, liens réseaux sociaux (Instagram, Facebook, LinkedIn), horaires d'ouverture et spécialités techniques (VAE, Cargo, Hydraulique, etc.).
   - **Analyse des Avis Clients** : Note moyenne sur 5, volume d'avis, et affichage côte à côte du **Top 5 des meilleurs avis** et du **Top 5 des pires avis** (points de vigilance : délais, tarifs, disponibilité pièces) + lien direct Google Maps.
4. **Comparateur Multi-Acteurs (2 à 4 réparateurs)** :
   - Matrice de comparaison côte à côte : note, volume d'avis, chiffre d'affaires, ancienneté, effectif, tarifs moyens constatés, spécialités, état du lieu et contacts.
5. **Enrichissement Live OpenData & Export** :
   - Synchronisation à la volée avec l'API gouvernementale `recherche-entreprises.api.gouv.fr` et `api.panoramax.xyz`.
   - Export en 1 clic de la sélection filtrée au format **CSV (Excel)** ou **JSON**.
   - Lien de partage dynamique encodant les filtres, la ville et la sélection dans l'URL.

## Structure du projet

- `index.html` : Interface principale de l'application cartographique et analytique.
- `styles.css` : Design system moderne responsive (mode clair/sombre, cartes, tiroir d'inspection, comparateur).
- `data.js` : Base de données consolidée des acteurs en activité sur les 7 villes + moteur de synchronisation live OpenData (`recherche-entreprises.api.gouv.fr` & `api.panoramax.xyz`).
- `app.js` : Logique applicative (carte Leaflet, filtres, KPIs, fiches détaillées, comparateur, exports CSV/JSON, partage d'URL).
- `sourcing_pipeline.py` : Script Python reproductible d'extraction et de consolidation OpenData (API Sirene / Recherche d'Entreprises, OpenStreetMap Overpass API, Base Adresse Nationale BAN, Panoramax).
