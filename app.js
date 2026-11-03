/**
 * Application Interactive — Observatoire & Sourcing Réparation Cycle France (7 Grandes Villes)
 * - Carte Leaflet avec Clusters & Marqueurs codés par typologie
 * - Navigation par agglomération (Paris, Lyon, Marseille, Bordeaux, Lille, Nantes, Strasbourg) & par quartier
 * - Filtres multicritères (Type, Note, Chiffre d'Affaires, Photo Panoramax, Spécialités VAE/Cargo, Zone Carte)
 * - Fiche détaillée (Photo d'état du lieu, Street View, Panoramax, SIRET/SIREN, Pappers, Annuaire Gouv, CA, Top 5 meilleurs/pires avis)
 * - Comparateur côte à côte (2 à 4 acteurs)
 * - Exports CSV/Excel et JSON + Lien partageable avec paramètres d'URL
 */

(function () {
  "use strict";

  const ACTORS = Array.isArray(window.REPARATEURS_DATA) ? window.REPARATEURS_DATA : [];

  const CITY_VIEWPORTS = {
    ALL: { center: [46.75, 2.55], zoom: 6 },
    Paris: { center: [48.858, 2.352], zoom: 12 },
    Lyon: { center: [45.758, 4.835], zoom: 13 },
    Marseille: { center: [43.296, 5.375], zoom: 12 },
    Bordeaux: { center: [44.838, -0.579], zoom: 13 },
    Lille: { center: [50.629, 3.057], zoom: 13 },
    Nantes: { center: [47.218, -1.553], zoom: 13 },
    Strasbourg: { center: [48.573, 7.752], zoom: 13 },
  };

  const TYPE_META = {
    "Atelier indépendant": {
      color: "#2563eb",
      badgeClass: "badge-indep",
      short: "Atelier indép.",
      icon: "🔧",
    },
    "Vélociste / Boutique + Atelier": {
      color: "#059669",
      badgeClass: "badge-velociste",
      short: "Vélociste",
      icon: "🚲",
    },
    "Réseau / Grande enseigne": {
      color: "#7c3aed",
      badgeClass: "badge-reseau",
      short: "Réseau / Enseigne",
      icon: "🏢",
    },
    "Réparateur mobile / itinérant": {
      color: "#ea580c",
      badgeClass: "badge-mobile",
      short: "Mobile / Itinérant",
      icon: "🚐",
    },
    "Atelier associatif / participatif": {
      color: "#0d9488",
      badgeClass: "badge-asso",
      short: "Associatif",
      icon: "🤝",
    },
  };

  // Application State
  const state = {
    city: "ALL",
    quartier: "ALL",
    search: "",
    type: "ALL",
    minRating: 0,
    caBracket: "ALL",
    sortBy: "rating_desc",
    realPhotoOnly: false,
    cargoVaeOnly: false,
    filterByMapBounds: false,
    mapClusterMode: false, // Default to individual Google Maps pins so every repairer is immediately visible
    basemap: "google_streets",
    layoutMode: window.innerWidth < 960 ? "map" : "split",
    selectedActorId: null,
    compareIds: [],
    filteredActors: [],
  };

  // Map references
  let map = null;
  let baseTileLayers = {};
  let currentBaseLayer = null;
  let clusterLayer = null;
  let plainMarkersLayer = null;
  const markersById = new Map();

  // DOM helpers
  const $ = (id) => document.getElementById(id);

  function formatCurrency(val) {
    if (val === null || val === undefined || isNaN(val)) return "Non communiqué";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(val);
  }

  function formatCompactCA(val) {
    if (!val || isNaN(val)) return "N/C";
    if (val >= 1000000) {
      return (val / 1000000).toFixed(2).replace(".", ",") + " M€";
    }
    return Math.round(val / 1000) + " k€";
  }

  function formatSiret(siret) {
    if (!siret) return "";
    const s = String(siret).replace(/\s+/g, "");
    if (s.length === 14) {
      return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`;
    }
    return s;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(msg) {
    const toast = $("toastNotification");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.add("hidden");
    }, 3200);
  }

  // Initialize Map with Google Maps tiles (Streets, Satellite Hybrid) + OpenStreetMap
  function initMap() {
    map = L.map("mapContainer", {
      center: CITY_VIEWPORTS.ALL.center,
      zoom: CITY_VIEWPORTS.ALL.zoom,
      zoomControl: true,
    });

    baseTileLayers = {
      google_streets: L.tileLayer("https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=fr", {
        attribution: '&copy; Google Maps | SIRET INSEE &amp; Panoramax',
        subdomains: ["0", "1", "2", "3"],
        maxZoom: 21,
      }),
      google_hybrid: L.tileLayer("https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=fr", {
        attribution: '&copy; Google Maps Satellite | SIRET INSEE &amp; Panoramax',
        subdomains: ["0", "1", "2", "3"],
        maxZoom: 21,
      }),
      osm: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO | SIRET INSEE &amp; Panoramax',
        subdomains: "abcd",
        maxZoom: 20,
      }),
    };

    currentBaseLayer = baseTileLayers.google_streets;
    currentBaseLayer.addTo(map);

    clusterLayer = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 36,
      spiderfyOnMaxZoom: true,
    });

    plainMarkersLayer = L.layerGroup();
    map.addLayer(plainMarkersLayer);

    map.on("moveend", () => {
      if (state.filterByMapBounds) {
        applyFiltersAndRender(false);
      }
    });
  }

  function setBasemap(mode) {
    if (!baseTileLayers[mode] || !map) return;
    state.basemap = mode;
    if (currentBaseLayer) {
      map.removeLayer(currentBaseLayer);
    }
    currentBaseLayer = baseTileLayers[mode];
    currentBaseLayer.addTo(map);

    $("btnBasemapGoogleStreets")?.classList.toggle("active", mode === "google_streets");
    $("btnBasemapGoogleHybrid")?.classList.toggle("active", mode === "google_hybrid");
    $("btnBasemapOsm")?.classList.toggle("active", mode === "osm");
  }

  function setLayoutMode(layout) {
    state.layoutMode = layout;
    const ws = document.querySelector(".workspace");
    if (ws) {
      ws.classList.toggle("layout-map-only", layout === "map");
      ws.classList.toggle("layout-list-only", layout === "list");
    }
    document.querySelectorAll(".view-mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.layout === layout);
    });
    if (map && layout !== "list") {
      setTimeout(() => {
        map.invalidateSize();
      }, 120);
    }
  }

  function createActorMarker(actor) {
    const meta = TYPE_META[actor.type_acteur] || TYPE_META["Atelier indépendant"];
    const shortLabel = actor.nom.length > 18 ? actor.nom.slice(0, 17) + "…" : actor.nom;
    const iconHtml = `
      <div class="gmap-pin-wrapper" title="${escapeHtml(actor.nom)} — ${actor.note_moyenne.toFixed(1)}★ (${actor.nb_avis} avis)">
        <div class="gmap-pin-bubble" style="background:${meta.color};">
          <span>${meta.icon}</span>
          <span>${actor.note_moyenne.toFixed(1)}★</span>
        </div>
        <div class="gmap-pin-tip" style="border-top-color:${meta.color};"></div>
        <div class="gmap-pin-name">${escapeHtml(shortLabel)}</div>
      </div>
    `;

    const customIcon = L.divIcon({
      html: iconHtml,
      className: "",
      iconSize: [0, 0],
      iconAnchor: [0, 0],
      popupAnchor: [0, -44],
    });

    const marker = L.marker([actor.lat, actor.lng], { icon: customIcon });

    const gmapsPlaceUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(actor.nom + " " + actor.adresse)}`;
    const gmapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${actor.lat},${actor.lng}`;

    const popupHtml = `
      <div class="map-popup-card">
        <img class="map-popup-img" src="${escapeHtml(actor.photo_url)}" onerror="this.src='${escapeHtml(actor.photo_atelier_fallback)}'" alt="${escapeHtml(actor.nom)}" />
        <div class="map-popup-body">
          <span class="actor-type-badge ${meta.badgeClass}">${meta.icon} ${escapeHtml(actor.type_acteur)}</span>
          <div class="map-popup-title">${escapeHtml(actor.nom)}</div>
          <div class="map-popup-addr">📍 ${escapeHtml(actor.adresse)}</div>
          <div class="map-popup-meta">
            <span>⭐ <strong>${actor.note_moyenne.toFixed(1)}/5</strong> (${actor.nb_avis} avis)</span>
            <span>💶 CA : <strong>${formatCompactCA(actor.chiffre_affaires)}</strong></span>
          </div>
          <div class="map-popup-btns" style="margin-bottom:6px;">
            <button type="button" onclick="window.__openActorDrawer('${actor.id}')" style="background:#2563eb;color:#fff;border-color:#2563eb;">
              Fiche & Avis
            </button>
            <a href="${escapeHtml(actor.lien_street_view)}" target="_blank" rel="noopener" style="background:#f8fafc;color:#0f172a;">
              Street View ↗
            </a>
          </div>
          <div class="map-popup-btns">
            <a href="${escapeHtml(gmapsPlaceUrl)}" target="_blank" rel="noopener" style="background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;">
              🗺️ Ouvrir Google Maps
            </a>
            <a href="${escapeHtml(gmapsDirUrl)}" target="_blank" rel="noopener" style="background:#ecfdf5;color:#047857;border-color:#a7f3d0;">
              🧭 Itinéraire
            </a>
          </div>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    return marker;
  }

  function updateMapMarkers(fitToMarkers = false) {
    clusterLayer.clearLayers();
    plainMarkersLayer.clearLayers();
    markersById.clear();

    const boundsPoints = [];
    for (const actor of state.filteredActors) {
      if (typeof actor.lat === "number" && typeof actor.lng === "number") {
        const marker = createActorMarker(actor);
        markersById.set(actor.id, marker);
        boundsPoints.push([actor.lat, actor.lng]);
        if (state.mapClusterMode) {
          clusterLayer.addLayer(marker);
        } else {
          plainMarkersLayer.addLayer(marker);
        }
      }
    }

    if (state.mapClusterMode) {
      if (map.hasLayer(plainMarkersLayer)) map.removeLayer(plainMarkersLayer);
      if (!map.hasLayer(clusterLayer)) map.addLayer(clusterLayer);
    } else {
      if (map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
      if (!map.hasLayer(plainMarkersLayer)) map.addLayer(plainMarkersLayer);
    }

    if (fitToMarkers && boundsPoints.length > 0) {
      if (state.city === "ALL" && state.quartier === "ALL") {
        map.setView(CITY_VIEWPORTS.ALL.center, CITY_VIEWPORTS.ALL.zoom);
      } else {
        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, { paddingTopLeft: [40, 120], paddingBottomRight: [40, 40], maxZoom: 15 });
      }
    }
  }

  // Populate Quartier Dropdown based on selected City
  function updateQuartierOptions() {
    const select = $("selectQuartier");
    const relevant = state.city === "ALL"
      ? ACTORS
      : ACTORS.filter((a) => a.ville === state.city);

    const quartierCounts = new Map();
    for (const a of relevant) {
      if (a.quartier) {
        quartierCounts.set(a.quartier, (quartierCounts.get(a.quartier) || 0) + 1);
      }
    }

    const sortedQuartiers = Array.from(quartierCounts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "fr")
    );

    const currentQ = state.quartier;
    select.innerHTML = `<option value="ALL">📍 Tous les quartiers / arrondissements (${relevant.length})</option>`;
    for (const [qName, count] of sortedQuartiers) {
      const opt = document.createElement("option");
      opt.value = qName;
      opt.textContent = `${qName} (${count})`;
      select.appendChild(opt);
    }

    if (quartierCounts.has(currentQ)) {
      select.value = currentQ;
    } else {
      state.quartier = "ALL";
      select.value = "ALL";
    }
  }

  // Update City Counts in Top Pills
  function updateCityCounts() {
    $("count-ALL").textContent = ACTORS.length;
    const cities = ["Paris", "Lyon", "Marseille", "Bordeaux", "Lille", "Nantes", "Strasbourg"];
    for (const c of cities) {
      const el = $(`count-${c}`);
      if (el) {
        el.textContent = ACTORS.filter((a) => a.ville === c).length;
      }
    }
  }

  // Filter & Sort Logic
  function applyFiltersAndRender(fitMap = false) {
    const q = state.search.trim().toLowerCase();
    const mapBounds = state.filterByMapBounds && map ? map.getBounds() : null;

    const filtered = ACTORS.filter((a) => {
      if (state.city !== "ALL" && a.ville !== state.city) return false;
      if (state.quartier !== "ALL" && a.quartier !== state.quartier) return false;
      if (state.type !== "ALL" && a.type_acteur !== state.type) return false;
      if (state.minRating > 0 && a.note_moyenne < state.minRating) return false;

      if (state.caBracket === "PUBLISHED" && !a.ca_est_publie) return false;
      if (state.caBracket === "HIGH" && (a.chiffre_affaires || 0) < 500000) return false;
      if (state.caBracket === "MID" && ((a.chiffre_affaires || 0) < 150000 || (a.chiffre_affaires || 0) > 500000)) return false;
      if (state.caBracket === "LOW" && (a.chiffre_affaires || 0) >= 150000) return false;

      if (state.realPhotoOnly && !String(a.photo_source || "").includes("Panoramax")) return false;
      if (state.cargoVaeOnly) {
        const srvText = (a.services || []).join(" ").toLowerCase();
        if (!srvText.includes("vae") && !srvText.includes("cargo")) return false;
      }

      if (mapBounds && !mapBounds.contains([a.lat, a.lng])) return false;

      if (q) {
        const haystack = [
          a.nom,
          a.raison_sociale,
          a.ville,
          a.quartier,
          a.adresse,
          a.code_postal,
          a.siret,
          a.siren,
          a.type_acteur,
          a.dirigeants,
          ...(a.services || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (state.sortBy) {
        case "rating_desc":
          return b.note_moyenne - a.note_moyenne || b.nb_avis - a.nb_avis;
        case "reviews_desc":
          return b.nb_avis - a.nb_avis;
        case "ca_desc":
          return (b.chiffre_affaires || 0) - (a.chiffre_affaires || 0);
        case "anciennete_desc":
          return (b.anciennete_ans || 0) - (a.anciennete_ans || 0);
        case "price_asc":
          return (a.tarif_revision_base_eur || 99) - (b.tarif_revision_base_eur || 99);
        case "name_asc":
          return a.nom.localeCompare(b.nom, "fr");
        default:
          return 0;
      }
    });

    state.filteredActors = filtered;

    renderKPIs();
    renderActorsList();
    updateMapMarkers(fitMap);
    syncUrlState();
  }

  // Render Top KPIs
  function renderKPIs() {
    const list = state.filteredActors;
    const count = list.length;
    $("kpiTotalActors").textContent = count;

    const uniqueCities = new Set(list.map((a) => a.ville));
    $("kpiTotalCities").textContent =
      uniqueCities.size === 1
        ? Array.from(uniqueCities)[0]
        : `${uniqueCities.size} métropoles`;

    if (count === 0) {
      $("kpiAvgRating").textContent = "- / 5";
      $("kpiTotalReviews").textContent = "0 avis";
      $("kpiTotalCA").textContent = "0 €";
      $("kpiAvgCA").textContent = "Moy. 0 €";
      $("kpiAvgPrice").textContent = "0 €";
      $("kpiTypeBreakdown").innerHTML = `<span class="kpi-sub">Aucun acteur ne correspond aux filtres</span>`;
      return;
    }

    const totalRating = list.reduce((acc, a) => acc + (a.note_moyenne || 0), 0);
    const totalReviews = list.reduce((acc, a) => acc + (a.nb_avis || 0), 0);
    $("kpiAvgRating").textContent = `${(totalRating / count).toFixed(2)} / 5`;
    $("kpiTotalReviews").textContent = `${totalReviews.toLocaleString("fr-FR")} avis analysés`;

    const totalCA = list.reduce((acc, a) => acc + (a.chiffre_affaires || 0), 0);
    const publishedCount = list.filter((a) => a.ca_est_publie).length;
    $("kpiTotalCA").textContent = formatCompactCA(totalCA);
    $("kpiAvgCA").textContent = `Moy. ${formatCompactCA(Math.round(totalCA / count))}`;
    $("kpiPublishedCACount").textContent = `${publishedCount} bilans publiés INPI/DGFiP + ${count - publishedCount} estimés`;

    const avgPrice = Math.round(
      list.reduce((acc, a) => acc + (a.tarif_revision_base_eur || 50), 0) / count
    );
    $("kpiAvgPrice").textContent = `${avgPrice} € TTC`;

    const panoramaxCount = list.filter((a) =>
      String(a.photo_source || "").includes("Panoramax")
    ).length;
    $("kpiDigitalRate").textContent = `${Math.round((panoramaxCount / count) * 100)}% Photos Panoramax`;

    $("kpiActiveFilterTag").textContent =
      state.type === "ALL" ? "Cliquez pour filtrer" : `Filtre : ${state.type}`;

    // Type breakdown pills
    const breakdownEl = $("kpiTypeBreakdown");
    breakdownEl.innerHTML = "";
    for (const [typeName, meta] of Object.entries(TYPE_META)) {
      const c = list.filter((a) => a.type_acteur === typeName).length;
      if (c === 0 && state.type === "ALL") continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `type-mini-pill ${state.type === typeName ? "active" : ""}`;
      btn.innerHTML = `<i class="dot" style="background:${meta.color}"></i> <span>${meta.short}</span> <strong>${c}</strong>`;
      btn.addEventListener("click", () => {
        state.type = state.type === typeName ? "ALL" : typeName;
        $("filterType").value = state.type;
        applyFiltersAndRender(false);
      });
      breakdownEl.appendChild(btn);
    }
  }

  // Render Sidebar Cards List
  function renderActorsList() {
    const container = $("actorsListContainer");
    const list = state.filteredActors;
    $("resultsCountLabel").innerHTML = `<strong>${list.length}</strong> réparateur(s) en activité affiché(s)`;

    if (list.length === 0) {
      container.innerHTML = `
        <div style="padding:32px 16px;text-align:center;color:#64748b;background:#fff;border-radius:10px;border:1px dashed #cbd5e1;">
          <p style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:6px;">Aucun réparateur trouvé avec ces critères</p>
          <p style="font-size:12.5px;margin-bottom:12px;">Essayez d'élargir vos filtres ou de réinitialiser la recherche.</p>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.__resetAllFilters()">Réinitialiser tous les filtres</button>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const actor of list) {
      const meta = TYPE_META[actor.type_acteur] || TYPE_META["Atelier indépendant"];
      const isSelected = state.selectedActorId === actor.id;
      const isCompared = state.compareIds.includes(actor.id);
      const isPanoramax = String(actor.photo_source || "").includes("Panoramax");

      const best1 = actor.top_5_meilleurs_avis && actor.top_5_meilleurs_avis[0]
        ? actor.top_5_meilleurs_avis[0].text
        : "";
      const worst1 = actor.top_5_pires_avis && actor.top_5_pires_avis[0]
        ? actor.top_5_pires_avis[0].text
        : "";

      const card = document.createElement("article");
      card.className = `actor-card ${isSelected ? "selected-card" : ""}`;
      card.dataset.actorId = actor.id;

      card.innerHTML = `
        <div class="card-top">
          <div class="card-thumb-wrap">
            <img class="card-thumb" src="${escapeHtml(actor.photo_url)}" onerror="this.src='${escapeHtml(actor.photo_atelier_fallback)}'" alt="Devanture ${escapeHtml(actor.nom)}" loading="lazy" />
            <span class="card-photo-badge">${isPanoramax ? "📷 Vue Rue Réelle" : "📷 Atelier"}</span>
          </div>
          <div class="card-main">
            <div class="card-badges-row">
              <span class="actor-type-badge ${meta.badgeClass}">${meta.icon} ${escapeHtml(actor.type_acteur)}</span>
              <span class="rating-pill">★ ${actor.note_moyenne.toFixed(1)} <span class="rating-count">(${actor.nb_avis})</span></span>
            </div>
            <h3 class="card-title" title="${escapeHtml(actor.nom)}">${escapeHtml(actor.nom)}</h3>
            <p class="card-address">📍 ${escapeHtml(actor.adresse)}</p>
            <p class="card-quartier">${escapeHtml(actor.quartier)} • Créé en ${escapeHtml(actor.date_creation.slice(0, 4))}</p>
          </div>
        </div>

        <div class="card-metrics-grid">
          <div class="metric-item">
            <span class="metric-label">SIRET (Actif)</span>
            <span class="metric-val">${formatSiret(actor.siret)}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Chiffre d'Affaires</span>
            <span class="metric-val ${actor.ca_est_publie ? "ca-published" : ""}">
              ${formatCompactCA(actor.chiffre_affaires)} ${actor.ca_est_publie ? "✓ Publié" : "(Est.)"}
            </span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Forfait Révision / Délai</span>
            <span class="metric-val">${actor.tarif_revision_base_eur} € • ${escapeHtml(actor.delai_moyen_intervention)}</span>
          </div>
        </div>

        <div class="card-review-snippet">
          <div class="snippet-line snippet-pos">👍 <strong>Top avis :</strong> « ${escapeHtml(best1)} »</div>
          <div class="snippet-line snippet-neg">⚠️ <strong>Point vigilance :</strong> « ${escapeHtml(worst1)} »</div>
        </div>

        <div class="card-footer">
          <div class="card-quick-links" onclick="event.stopPropagation();">
            <a href="tel:${escapeHtml(actor.telephone.replace(/\s+/g, ""))}" class="mini-link" title="Appeler ${escapeHtml(actor.telephone)}">📞 ${escapeHtml(actor.telephone)}</a>
            <a href="${escapeHtml(actor.site_web)}" target="_blank" rel="noopener" class="mini-link" title="Site Web">🌐 Web</a>
            <a href="${escapeHtml(actor.lien_street_view)}" target="_blank" rel="noopener" class="mini-link" title="Inspecter l'état du lieu sur Street View">👁️ Lieu</a>
          </div>
          <div class="card-actions-right" onclick="event.stopPropagation();">
            <label class="compare-toggle-label">
              <input type="checkbox" data-compare-id="${actor.id}" ${isCompared ? "checked" : ""} />
              <span>Comparer</span>
            </label>
            <button type="button" class="btn-open-card" data-open-id="${actor.id}">Détails & Avis</button>
          </div>
        </div>
      `;

      card.addEventListener("click", () => {
        focusActorOnMapAndOpenDrawer(actor.id, true);
      });

      const chk = card.querySelector(`input[data-compare-id="${actor.id}"]`);
      chk.addEventListener("change", (e) => {
        toggleCompareActor(actor.id, e.target.checked);
      });

      const btnOpen = card.querySelector(`button[data-open-id="${actor.id}"]`);
      btnOpen.addEventListener("click", () => {
        focusActorOnMapAndOpenDrawer(actor.id, true);
      });

      fragment.appendChild(card);
    }

    container.innerHTML = "";
    container.appendChild(fragment);
  }

  function focusActorOnMapAndOpenDrawer(actorId, openDrawer = true) {
    const actor = ACTORS.find((a) => a.id === actorId);
    if (!actor) return;

    state.selectedActorId = actorId;
    document.querySelectorAll(".actor-card").forEach((el) => {
      el.classList.toggle("selected-card", el.dataset.actorId === actorId);
    });

    if (map && typeof actor.lat === "number" && typeof actor.lng === "number") {
      map.flyTo([actor.lat, actor.lng], Math.max(map.getZoom(), 15), {
        duration: 0.65,
      });
      const marker = markersById.get(actorId);
      if (marker) {
        if (state.mapClusterMode && clusterLayer) {
          clusterLayer.zoomToShowLayer(marker, () => {
            marker.openPopup();
          });
        } else {
          marker.openPopup();
        }
      }
    }

    if (openDrawer) {
      renderActorDrawer(actor);
    }
    syncUrlState();
  }

  // Render Detailed Actor Drawer (Top 5 best / Top 5 worst reviews, SIRET, CA, Street View, Socials)
  function renderActorDrawer(actor) {
    const meta = TYPE_META[actor.type_acteur] || TYPE_META["Atelier indépendant"];
    const badge = $("drawerTypeBadge");
    badge.className = `actor-type-badge ${meta.badgeClass}`;
    badge.textContent = `${meta.icon} ${actor.type_acteur} • ${actor.statut_activite}`;

    $("drawerActorName").textContent = actor.nom;
    $("drawerActorSubtitle").textContent = `${actor.raison_sociale} — ${actor.quartier}`;

    const isCompared = state.compareIds.includes(actor.id);
    const btnCompare = $("drawerBtnCompare");
    btnCompare.textContent = isCompared ? "✓ Dans le comparateur" : "+ Comparer cet acteur";
    btnCompare.onclick = () => {
      toggleCompareActor(actor.id, !state.compareIds.includes(actor.id));
      renderActorDrawer(actor);
    };

    const bestReviewsHtml = (actor.top_5_meilleurs_avis || [])
      .map(
        (r, idx) => `
        <div class="review-item">
          <div class="review-meta">
            <span><strong>#${idx + 1} ${escapeHtml(r.author)}</strong> • ${"★".repeat(r.rating)}</span>
            <span class="review-tag">${escapeHtml(r.tag)}</span>
          </div>
          <p class="review-text">« ${escapeHtml(r.text)} »</p>
        </div>
      `
      )
      .join("");

    const worstReviewsHtml = (actor.top_5_pires_avis || [])
      .map(
        (r, idx) => `
        <div class="review-item">
          <div class="review-meta">
            <span><strong>#${idx + 1} ${escapeHtml(r.author)}</strong> • ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
            <span class="review-tag">${escapeHtml(r.tag)}</span>
          </div>
          <p class="review-text">« ${escapeHtml(r.text)} »</p>
        </div>
      `
      )
      .join("");

    const servicesHtml = (actor.services || [])
      .map((s) => `<span class="service-tag">✓ ${escapeHtml(s)}</span>`)
      .join("");

    const body = $("drawerBodyContent");
    body.innerHTML = `
      <!-- PHOTO & ETAT DU LIEU -->
      <div class="drawer-hero">
        <img class="drawer-hero-img" src="${escapeHtml(actor.photo_url)}" onerror="this.src='${escapeHtml(actor.photo_atelier_fallback)}'" alt="Photo de ${escapeHtml(actor.nom)}" />
        <div class="drawer-hero-overlay">
          <div class="etat-lieu-box">
            <div class="etat-lieu-text">
              <div><strong>État du lieu & configuration :</strong> ${escapeHtml(actor.etat_du_lieu)}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Source visuelle : ${escapeHtml(actor.photo_source)} (GPS : ${actor.lat}, ${actor.lng})</div>
            </div>
            <div class="streetview-actions">
              <a href="${escapeHtml(actor.lien_street_view)}" target="_blank" rel="noopener" class="btn-streetview">
                🚶 Ouvrir Google Street View
              </a>
              <a href="${escapeHtml(actor.lien_panoramax)}" target="_blank" rel="noopener" class="btn-streetview secondary">
                📷 Vue Immersive Panoramax
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- SYNTHESE DES AVIS CLIENTS : TOP 5 MEILLEURS & TOP 5 PIRES -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <span>⭐ Synthèse des Avis Clients (${actor.note_moyenne.toFixed(1)} / 5 sur ${actor.nb_avis} avis)</span>
          <a href="${escapeHtml(actor.lien_google_maps)}" target="_blank" rel="noopener" style="font-size:12px;color:#2563eb;text-decoration:none;font-weight:600;">
            Vérifier sur Google Maps ↗
          </a>
        </div>
        <div class="reviews-split">
          <div class="reviews-col best-col">
            <div class="reviews-col-header">
              <span>👍 Top 5 des Meilleurs Avis</span>
              <span>Points forts</span>
            </div>
            ${bestReviewsHtml}
          </div>
          <div class="reviews-col worst-col">
            <div class="reviews-col-header">
              <span>👎 Top 5 des Pires Avis</span>
              <span>Points de vigilance</span>
            </div>
            ${worstReviewsHtml}
          </div>
        </div>
      </div>

      <!-- DONNEES FINANCIERES, JURIDIQUES & SIRET -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <span>🏛️ Données Juridiques, SIRET & Chiffre d'Affaires</span>
          <span class="status-pill" style="background:#ecfdf5;color:#059669;border-color:#a7f3d0;">✓ Établissement en activité</span>
        </div>
        <div class="info-grid">
          <div class="info-cell">
            <div class="info-cell-label">Numéro SIRET / SIREN</div>
            <div class="info-cell-val">${formatSiret(actor.siret)}</div>
            <div class="info-cell-sub">SIREN : ${escapeHtml(actor.siren)} • NAF : ${escapeHtml(actor.code_naf)}</div>
          </div>
          <div class="info-cell">
            <div class="info-cell-label">Chiffre d'Affaires Annuel</div>
            <div class="info-cell-val" style="color:${actor.ca_est_publie ? "#059669" : "#0f172a"}">
              ${formatCurrency(actor.chiffre_affaires)}
            </div>
            <div class="info-cell-sub">${escapeHtml(actor.ca_source)}</div>
          </div>
          <div class="info-cell">
            <div class="info-cell-label">Date de création & Ancienneté</div>
            <div class="info-cell-val">${escapeHtml(actor.date_creation)} (${actor.anciennete_ans} ans)</div>
            <div class="info-cell-sub">Effectif : ${escapeHtml(actor.effectif)}</div>
          </div>
          <div class="info-cell">
            <div class="info-cell-label">Direction / Gérance</div>
            <div class="info-cell-val">${escapeHtml(actor.dirigeants)}</div>
            <div class="info-cell-sub">${escapeHtml(actor.libelle_naf)}</div>
          </div>
        </div>
        <div class="external-links-grid">
          <a href="${escapeHtml(actor.lien_annuaire_entreprises)}" target="_blank" rel="noopener" class="ext-pill">
            🇫🇷 Fiche officielle L'Annuaire des Entreprises (data.gouv.fr) ↗
          </a>
          <a href="${escapeHtml(actor.lien_pappers)}" target="_blank" rel="noopener" class="ext-pill">
            📊 Bilans & Statuts sur Pappers.fr ↗
          </a>
        </div>
      </div>

      <!-- ADRESSE, CONTACTS, SITE WEB & RESEAUX SOCIAUX -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <span>📞 Coordonnées, Site Web & Réseaux Sociaux</span>
        </div>
        <div class="info-grid">
          <div class="info-cell">
            <div class="info-cell-label">Adresse postale exacte</div>
            <div class="info-cell-val">${escapeHtml(actor.adresse)}</div>
            <div class="info-cell-sub">${escapeHtml(actor.quartier)}</div>
          </div>
          <div class="info-cell">
            <div class="info-cell-label">Téléphone & Horaires</div>
            <div class="info-cell-val"><a href="tel:${escapeHtml(actor.telephone.replace(/\s+/g, ""))}" style="color:#2563eb;text-decoration:none;">${escapeHtml(actor.telephone)}</a></div>
            <div class="info-cell-sub">Horaires : ${escapeHtml(actor.horaires)} • Email : ${escapeHtml(actor.email)}</div>
          </div>
        </div>
        <div class="external-links-grid">
          <a href="${escapeHtml(actor.site_web)}" target="_blank" rel="noopener" class="ext-pill">
            🌐 Site Web Officiel ↗
          </a>
          <a href="${escapeHtml(actor.reseaux_sociaux?.instagram || "#")}" target="_blank" rel="noopener" class="ext-pill">
            📸 Instagram ↗
          </a>
          <a href="${escapeHtml(actor.reseaux_sociaux?.facebook || "#")}" target="_blank" rel="noopener" class="ext-pill">
            📘 Facebook ↗
          </a>
          <a href="${escapeHtml(actor.reseaux_sociaux?.linkedin || "#")}" target="_blank" rel="noopener" class="ext-pill">
            💼 LinkedIn ↗
          </a>
          <a href="${escapeHtml(actor.lien_pagesjaunes)}" target="_blank" rel="noopener" class="ext-pill">
            📒 PagesJaunes ↗
          </a>
        </div>
      </div>

      <!-- PRESTATIONS, SPECIALITES & TARIFS -->
      <div class="drawer-section">
        <div class="drawer-section-title">
          <span>🔧 Prestations, Spécialités & Indicateurs Atelier</span>
          <span style="font-size:12px;color:#059669;font-weight:700;">Forfait révision dès ${actor.tarif_revision_base_eur} € TTC • Délai : ${escapeHtml(actor.delai_moyen_intervention)}</span>
        </div>
        <div class="services-tags">
          ${servicesHtml}
        </div>
      </div>
    `;

    $("actorDrawerBackdrop").classList.remove("hidden");
    $("actorDrawer").classList.remove("hidden");
  }

  function closeActorDrawer() {
    $("actorDrawerBackdrop").classList.add("hidden");
    $("actorDrawer").classList.add("hidden");
  }

  // Multi-Actor Comparator (2 to 4 actors)
  function toggleCompareActor(actorId, shouldAdd) {
    if (shouldAdd) {
      if (state.compareIds.includes(actorId)) return;
      if (state.compareIds.length >= 4) {
        showToast("Vous pouvez comparer jusqu'à 4 acteurs simultanément.");
        applyFiltersAndRender(false);
        return;
      }
      state.compareIds.push(actorId);
    } else {
      state.compareIds = state.compareIds.filter((id) => id !== actorId);
    }
    renderCompareDock();
    renderActorsList();
  }

  function renderCompareDock() {
    const dock = $("compareDock");
    if (state.compareIds.length === 0) {
      dock.classList.add("hidden");
      return;
    }
    dock.classList.remove("hidden");
    $("compareCountBadge").textContent = state.compareIds.length;

    const itemsContainer = $("compareDockItems");
    itemsContainer.innerHTML = "";
    for (const id of state.compareIds) {
      const a = ACTORS.find((x) => x.id === id);
      if (!a) continue;
      const chip = document.createElement("span");
      chip.className = "compare-chip";
      chip.innerHTML = `<span>${escapeHtml(a.nom)} (${escapeHtml(a.ville)})</span> <button type="button" aria-label="Retirer">✕</button>`;
      chip.querySelector("button").addEventListener("click", () => {
        toggleCompareActor(id, false);
      });
      itemsContainer.appendChild(chip);
    }
  }

  function openCompareModal() {
    if (state.compareIds.length < 2) {
      showToast("Sélectionnez au moins 2 réparateurs pour lancer la comparaison.");
      return;
    }
    const compared = state.compareIds
      .map((id) => ACTORS.find((a) => a.id === id))
      .filter(Boolean);

    const colsHeader = compared
      .map((a) => {
        const meta = TYPE_META[a.type_acteur] || TYPE_META["Atelier indépendant"];
        return `
          <td>
            <img class="compare-col-photo" src="${escapeHtml(a.photo_url)}" onerror="this.src='${escapeHtml(a.photo_atelier_fallback)}'" alt="${escapeHtml(a.nom)}" />
            <span class="actor-type-badge ${meta.badgeClass}">${meta.icon} ${escapeHtml(a.type_acteur)}</span>
            <h3 style="font-size:15px;margin-top:6px;">${escapeHtml(a.nom)}</h3>
            <p style="font-size:11.5px;color:#64748b;">${escapeHtml(a.quartier)}</p>
          </td>
        `;
      })
      .join("");

    const row = (label, fn) => `
      <tr>
        <th>${label}</th>
        ${compared.map((a) => `<td>${fn(a)}</td>`).join("")}
      </tr>
    `;

    const html = `
      <table class="compare-matrix">
        <tbody>
          <tr>
            <th>Acteur & Aperçu du lieu</th>
            ${colsHeader}
          </tr>
          ${row("Note & Volume d'avis", (a) => `<strong style="color:#b45309;font-size:14px;">★ ${a.note_moyenne.toFixed(1)} / 5</strong> (${a.nb_avis} avis clients)`)}
          ${row("Chiffre d'Affaires (CA)", (a) => `<strong>${formatCurrency(a.chiffre_affaires)}</strong><br/><span style="font-size:11px;color:#64748b;">${escapeHtml(a.ca_source)}</span>`)}
          ${row("SIRET & Ancienneté", (a) => `SIRET : <strong>${formatSiret(a.siret)}</strong><br/>Créé en ${escapeHtml(a.date_creation.slice(0, 4))} (${a.anciennete_ans} ans) • ${escapeHtml(a.effectif)}`)}
          ${row("Tarif Révision & Délai", (a) => `Forfait base : <strong>${a.tarif_revision_base_eur} € TTC</strong><br/>Délai moyen : ${escapeHtml(a.delai_moyen_intervention)}`)}
          ${row("État du lieu & Devanture", (a) => `${escapeHtml(a.etat_du_lieu)}<br/><a href="${escapeHtml(a.lien_street_view)}" target="_blank" rel="noopener" style="color:#2563eb;font-size:11.5px;font-weight:600;">Ouvrir Street View ↗</a>`)}
          ${row("Top Meilleur Avis", (a) => `<span style="color:#065f46;">« ${escapeHtml(a.top_5_meilleurs_avis?.[0]?.text || "")} »</span>`)}
          ${row("Principal Point de Vigilance", (a) => `<span style="color:#9f1239;">« ${escapeHtml(a.top_5_pires_avis?.[0]?.text || "")} »</span>`)}
          ${row("Spécialités Techniques", (a) => (a.services || []).map((s) => `• ${escapeHtml(s)}`).join("<br/>"))}
          ${row("Contacts & Liens", (a) => `
            📞 <strong>${escapeHtml(a.telephone)}</strong><br/>
            📍 ${escapeHtml(a.adresse)}<br/>
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
              <a href="${escapeHtml(a.site_web)}" target="_blank" rel="noopener" class="mini-link">🌐 Site Web</a>
              <a href="${escapeHtml(a.reseaux_sociaux?.instagram || "#")}" target="_blank" rel="noopener" class="mini-link">📸 Instagram</a>
              <a href="${escapeHtml(a.lien_pappers)}" target="_blank" rel="noopener" class="mini-link">📊 Pappers</a>
            </div>
          `)}
        </tbody>
      </table>
    `;

    $("compareModalBody").innerHTML = html;
    $("compareModalBackdrop").classList.remove("hidden");
  }

  // Full Table Modal
  function openTableModal() {
    const tbody = $("fullTableBody");
    const list = state.filteredActors;
    $("tableModalSubtitle").textContent = `${list.length} établissements actifs affichés selon vos filtres actuels`;

    tbody.innerHTML = list
      .map((a) => {
        const meta = TYPE_META[a.type_acteur] || TYPE_META["Atelier indépendant"];
        return `
          <tr>
            <td>
              <strong>${escapeHtml(a.nom)}</strong><br/>
              <span style="font-size:11px;color:#64748b;">${escapeHtml(a.adresse)}</span>
            </td>
            <td>
              <strong>${escapeHtml(a.ville)}</strong><br/>
              <span style="font-size:11px;color:#64748b;">${escapeHtml(a.quartier)}</span>
            </td>
            <td><span class="actor-type-badge ${meta.badgeClass}">${meta.short}</span></td>
            <td><strong>★ ${a.note_moyenne.toFixed(1)}</strong> (${a.nb_avis})</td>
            <td>
              <strong>${formatCompactCA(a.chiffre_affaires)}</strong><br/>
              <span style="font-size:10.5px;color:${a.ca_est_publie ? "#059669" : "#64748b"};">${a.ca_est_publie ? "Publié INPI" : "Estimé NAF"}</span>
            </td>
            <td>
              <a href="${escapeHtml(a.lien_annuaire_entreprises)}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none;font-weight:600;">
                ${formatSiret(a.siret)} ↗
              </a>
            </td>
            <td><strong>${a.tarif_revision_base_eur} €</strong></td>
            <td>
              ${escapeHtml(a.telephone)}<br/>
              <a href="${escapeHtml(a.site_web)}" target="_blank" rel="noopener" style="font-size:11px;color:#2563eb;">Web</a> •
              <a href="${escapeHtml(a.lien_street_view)}" target="_blank" rel="noopener" style="font-size:11px;color:#2563eb;">StreetView</a>
            </td>
            <td>
              <button type="button" class="btn-open-card" onclick="window.__openFromTable('${a.id}')">Fiche</button>
            </td>
          </tr>
        `;
      })
      .join("");

    $("tableModalBackdrop").classList.remove("hidden");
  }

  // Export CSV & JSON
  function exportFilteredCSV() {
    const list = state.filteredActors;
    const headers = [
      "ID", "Nom", "Raison_Sociale", "Ville", "Quartier", "Code_Postal", "Adresse",
      "Latitude", "Longitude", "SIRET", "SIREN", "Code_NAF", "Statut", "Date_Creation",
      "Type_Acteur", "Dirigeants", "Effectif", "Chiffre_Affaires_EUR", "CA_Source",
      "Note_Moyenne_Sur_5", "Nombre_Avis", "Tarif_Revision_EUR", "Delai_Moyen",
      "Etat_Du_Lieu", "Telephone", "Email", "Site_Web", "Instagram", "Facebook", "LinkedIn",
      "Photo_URL", "Lien_Street_View", "Lien_Annuaire_Gouv", "Lien_Pappers", "Lien_Google_Maps",
      "Top_1_Meilleur_Avis", "Top_1_Pire_Avis"
    ];

    const csvEscape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [headers.join(";")];

    for (const a of list) {
      rows.push(
        [
          a.id,
          a.nom,
          a.raison_sociale,
          a.ville,
          a.quartier,
          a.code_postal,
          a.adresse,
          a.lat,
          a.lng,
          a.siret,
          a.siren,
          a.code_naf,
          a.statut_activite,
          a.date_creation,
          a.type_acteur,
          a.dirigeants,
          a.effectif,
          a.chiffre_affaires,
          a.ca_source,
          a.note_moyenne,
          a.nb_avis,
          a.tarif_revision_base_eur,
          a.delai_moyen_intervention,
          a.etat_du_lieu,
          a.telephone,
          a.email,
          a.site_web,
          a.reseaux_sociaux?.instagram || "",
          a.reseaux_sociaux?.facebook || "",
          a.reseaux_sociaux?.linkedin || "",
          a.photo_url,
          a.lien_street_view,
          a.lien_annuaire_entreprises,
          a.lien_pappers,
          a.lien_google_maps,
          a.top_5_meilleurs_avis?.[0]?.text || "",
          a.top_5_pires_avis?.[0]?.text || "",
        ]
          .map(csvEscape)
          .join(";")
      );
    }

    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sourcing_reparateurs_cycle_${state.city.toLowerCase()}_${list.length}_acteurs.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Export CSV généré (${list.length} acteurs).`);
  }

  function exportFilteredJSON() {
    const list = state.filteredActors;
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sourcing_reparateurs_cycle_${state.city.toLowerCase()}_${list.length}_acteurs.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Export JSON généré (${list.length} acteurs).`);
  }

  // Export KML for direct import into Google My Maps (google.com/mymaps) or Google Earth
  function exportFilteredKML() {
    const list = state.filteredActors;
    const xmlEscape = (s) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const placemarks = list
      .map((a) => {
        const best1 = a.top_5_meilleurs_avis?.[0]?.text || "";
        const worst1 = a.top_5_pires_avis?.[0]?.text || "";
        const desc = [
          `<b>Typologie :</b> ${xmlEscape(a.type_acteur)} (${xmlEscape(a.statut_activite)})`,
          `<b>Note :</b> ★ ${a.note_moyenne.toFixed(1)}/5 (${a.nb_avis} avis)`,
          `<b>Adresse :</b> ${xmlEscape(a.adresse)} (${xmlEscape(a.quartier)})`,
          `<b>SIRET :</b> ${xmlEscape(a.siret)} | <b>NAF :</b> ${xmlEscape(a.code_naf)}`,
          `<b>Chiffre d'Affaires :</b> ${xmlEscape(formatCurrency(a.chiffre_affaires))} (${xmlEscape(a.ca_source)})`,
          `<b>Tarif Révision :</b> ${a.tarif_revision_base_eur} € TTC | <b>Délai :</b> ${xmlEscape(a.delai_moyen_intervention)}`,
          `<b>État du lieu :</b> ${xmlEscape(a.etat_du_lieu)}`,
          `<b>Téléphone :</b> ${xmlEscape(a.telephone)} | <b>Web :</b> ${xmlEscape(a.site_web)}`,
          `<b>Top Avis Positif :</b> « ${xmlEscape(best1)} »`,
          `<b>Point de vigilance :</b> « ${xmlEscape(worst1)} »`,
          `<b>Street View :</b> ${xmlEscape(a.lien_street_view)}`,
        ].join("<br/>");

        return `    <Placemark>
      <name>${xmlEscape(a.nom)} (${a.note_moyenne.toFixed(1)}★)</name>
      <description><![CDATA[${desc}]]></description>
      <Point>
        <coordinates>${a.lng},${a.lat},0</coordinates>
      </Point>
    </Placemark>`;
      })
      .join("\n");

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Sourcing Réparateurs Cycle France (${xmlEscape(state.city)})</name>
    <description>Acteurs en activité de la réparation vélo — SIRET, Avis, CA, Adresses et Contacts</description>
${placemarks}
  </Document>
</kml>`;

    const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `google_mymaps_reparateurs_cycle_${state.city.toLowerCase()}_${list.length}_acteurs.kml`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Fichier Google My Maps (.KML) téléchargé (${list.length} réparateurs) !`);
  }

  // URL state sync & Shareable Link
  function syncUrlState() {
    const params = new URLSearchParams();
    if (state.city !== "ALL") params.set("city", state.city);
    if (state.quartier !== "ALL") params.set("quartier", state.quartier);
    if (state.type !== "ALL") params.set("type", state.type);
    if (state.minRating > 0) params.set("rating", String(state.minRating));
    if (state.caBracket !== "ALL") params.set("ca", state.caBracket);
    if (state.search) params.set("q", state.search);
    if (state.selectedActorId) params.set("actor", state.selectedActorId);
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? "?" + qs : ""}`;
    window.history.replaceState({}, "", newUrl);
  }

  function restoreUrlState() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("city") && CITY_VIEWPORTS[params.get("city")]) {
      state.city = params.get("city");
    }
    if (params.get("type")) state.type = params.get("type");
    if (params.get("rating")) state.minRating = parseFloat(params.get("rating")) || 0;
    if (params.get("ca")) state.caBracket = params.get("ca");
    if (params.get("q")) state.search = params.get("q");
    if (params.get("quartier")) state.quartier = params.get("quartier");

    $("searchInput").value = state.search;
    $("filterType").value = state.type;
    $("filterRating").value = String(state.minRating);
    $("filterCA").value = state.caBracket;

    document.querySelectorAll(".city-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.city === state.city);
    });

    updateQuartierOptions();
    if (params.get("actor")) {
      state.selectedActorId = params.get("actor");
    }
  }

  // Reset all filters
  function resetAllFilters() {
    state.city = "ALL";
    state.quartier = "ALL";
    state.search = "";
    state.type = "ALL";
    state.minRating = 0;
    state.caBracket = "ALL";
    state.sortBy = "rating_desc";
    state.realPhotoOnly = false;
    state.cargoVaeOnly = false;
    state.filterByMapBounds = false;

    $("searchInput").value = "";
    $("filterType").value = "ALL";
    $("filterRating").value = "0";
    $("filterCA").value = "ALL";
    $("sortSelect").value = "rating_desc";
    $("chkRealPhotoOnly").checked = false;
    $("chkCargoVAE").checked = false;
    $("btnMapFilterBounds").classList.remove("active");

    document.querySelectorAll(".city-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.city === "ALL");
    });

    updateQuartierOptions();
    applyFiltersAndRender(true);
  }

  // Global hooks for inline popup/table triggers
  window.__openActorDrawer = (actorId) => {
    const actor = ACTORS.find((a) => a.id === actorId);
    if (actor) renderActorDrawer(actor);
  };
  window.__openFromTable = (actorId) => {
    $("tableModalBackdrop").classList.add("hidden");
    focusActorOnMapAndOpenDrawer(actorId, true);
  };
  window.__resetAllFilters = resetAllFilters;

  // Bind UI Events
  function bindEvents() {
    // City pills
    document.querySelectorAll(".city-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        const city = btn.dataset.city;
        state.city = city;
        state.quartier = "ALL";
        document.querySelectorAll(".city-pill").forEach((b) =>
          b.classList.toggle("active", b.dataset.city === city)
        );
        updateQuartierOptions();
        applyFiltersAndRender(true);
      });
    });

    // Quartier dropdown
    $("selectQuartier").addEventListener("change", (e) => {
      state.quartier = e.target.value;
      applyFiltersAndRender(true);
    });

    // Search & Filters
    $("searchInput").addEventListener("input", (e) => {
      state.search = e.target.value;
      applyFiltersAndRender(false);
    });

    $("btnToggleAdvancedFilters").addEventListener("click", () => {
      const panel = $("advancedFiltersPanel");
      panel.classList.toggle("hidden");
    });

    $("filterType").addEventListener("change", (e) => {
      state.type = e.target.value;
      applyFiltersAndRender(false);
    });

    $("filterRating").addEventListener("change", (e) => {
      state.minRating = parseFloat(e.target.value) || 0;
      applyFiltersAndRender(false);
    });

    $("filterCA").addEventListener("change", (e) => {
      state.caBracket = e.target.value;
      applyFiltersAndRender(false);
    });

    $("sortSelect").addEventListener("change", (e) => {
      state.sortBy = e.target.value;
      applyFiltersAndRender(false);
    });

    $("chkRealPhotoOnly").addEventListener("change", (e) => {
      state.realPhotoOnly = e.target.checked;
      applyFiltersAndRender(false);
    });

    $("chkCargoVAE").addEventListener("change", (e) => {
      state.cargoVaeOnly = e.target.checked;
      applyFiltersAndRender(false);
    });

    $("btnResetFilters").addEventListener("click", resetAllFilters);

    // Map toolbar buttons (Basemap switcher: Google Plan, Google Satellite, OSM)
    $("btnBasemapGoogleStreets")?.addEventListener("click", () => setBasemap("google_streets"));
    $("btnBasemapGoogleHybrid")?.addEventListener("click", () => setBasemap("google_hybrid"));
    $("btnBasemapOsm")?.addEventListener("click", () => setBasemap("osm"));

    // Layout mode switcher (Full Map / Split / Full List)
    document.querySelectorAll(".view-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setLayoutMode(btn.dataset.layout);
      });
    });

    // KPI Ribbon Toggle
    $("btnToggleKpis")?.addEventListener("click", () => {
      const kpiSection = document.querySelector(".kpi-ribbon");
      if (kpiSection) {
        kpiSection.classList.toggle("hidden");
        if (map) {
          setTimeout(() => map.invalidateSize(), 100);
        }
      }
    });

    $("btnMapCluster").addEventListener("click", () => {
      state.mapClusterMode = true;
      $("btnMapCluster").classList.add("active");
      $("btnMapMarkers").classList.remove("active");
      updateMapMarkers(false);
    });

    $("btnMapMarkers").addEventListener("click", () => {
      state.mapClusterMode = false;
      $("btnMapMarkers").classList.add("active");
      $("btnMapCluster").classList.remove("active");
      updateMapMarkers(false);
    });

    $("btnMapFilterBounds").addEventListener("click", () => {
      state.filterByMapBounds = !state.filterByMapBounds;
      $("btnMapFilterBounds").classList.toggle("active", state.filterByMapBounds);
      applyFiltersAndRender(false);
      showToast(
        state.filterByMapBounds
          ? "Filtre sur l'emprise de la carte activé."
          : "Filtre sur l'emprise de la carte désactivé."
      );
    });

    // Drawer events
    $("btnCloseDrawer").addEventListener("click", closeActorDrawer);
    $("actorDrawerBackdrop").addEventListener("click", closeActorDrawer);

    // Compare dock & modal
    $("btnClearCompare").addEventListener("click", () => {
      state.compareIds = [];
      renderCompareDock();
      renderActorsList();
    });
    $("btnOpenCompareModal").addEventListener("click", openCompareModal);
    $("btnCloseCompareModal").addEventListener("click", () => {
      $("compareModalBackdrop").classList.add("hidden");
    });

    // Full Table Modal
    $("btnOpenTableModal").addEventListener("click", openTableModal);
    $("btnCloseTableModal").addEventListener("click", () => {
      $("tableModalBackdrop").classList.add("hidden");
    });
    $("btnTableExportCSV").addEventListener("click", exportFilteredCSV);

    // Exports & Share
    $("btnExportKML")?.addEventListener("click", exportFilteredKML);
    $("btnExportCSV").addEventListener("click", exportFilteredCSV);
    $("btnExportJSON").addEventListener("click", exportFilteredJSON);
    $("btnShareLink").addEventListener("click", () => {
      syncUrlState();
      navigator.clipboard
        .writeText(window.location.href)
        .then(() => showToast("Lien de partage copié dans le presse-papiers !"))
        .catch(() => showToast("URL mise à jour dans la barre d'adresse."));
    });

    // Escape key closes drawer/modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeActorDrawer();
        $("compareModalBackdrop").classList.add("hidden");
        $("tableModalBackdrop").classList.add("hidden");
      }
    });
  }

  // Bootstrap
  document.addEventListener("DOMContentLoaded", () => {
    initMap();
    setLayoutMode(state.layoutMode);
    if (window.innerWidth < 960) {
      document.querySelector(".kpi-ribbon")?.classList.add("hidden");
    }
    updateCityCounts();
    restoreUrlState();
    bindEvents();
    setTimeout(() => {
      if (map) map.invalidateSize();
      applyFiltersAndRender(state.city !== "ALL" || state.quartier !== "ALL");
    }, 80);

    if (state.selectedActorId) {
      setTimeout(() => {
        focusActorOnMapAndOpenDrawer(state.selectedActorId, true);
      }, 300);
    }
  });
})();