/**
 * Extingo Fire Department — map & incident history panel
 *
 * Renders incidents from ExtingoAPI onto a Leaflet map and mirrors the
 * same data into the collapsible history panel. Both stay in sync by
 * re-rendering whenever the API's event bus reports a change.
 */

(function () {
  // ---------------------------------------------------------------------
  // Coordinates — PLACEHOLDER VALUES. Replace with the real figures from
  // the project spec (§4) before this goes anywhere near production.
  // ---------------------------------------------------------------------
  // Fire station origin point: where the map is centered on load and
  // where OSRM routes originate from.
  const STATION_ORIGIN = { lat: 41.8256, lon: -71.4128 };
  // Fallback incident location, used only by the simulateEmergency() dev
  // helper below when testing without a real extingo:data event source.
  const DEMO_FIRE_LOCATION = { lat: 41.8321, lon: -71.402 };

  const STATION_CENTER = [STATION_ORIGIN.lat, STATION_ORIGIN.lon];

  const map = L.map("map", {
    zoomControl: false,
  }).setView(STATION_CENTER, 14);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Small fixed marker for the station itself, so the route has a
  // visible, labeled origin point on the map.
  L.marker(STATION_CENTER, {
    icon: L.divIcon({
      className: "",
      html: '<span class="marker-dot marker-dot--station"></span>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
  })
    .bindPopup("Station 12 (origin)")
    .addTo(map);

  const markerLayer = L.layerGroup().addTo(map);
  const markersById = new Map();

  // ---------------------------------------------------------------------
  // Live emergency routing — reacts to `extingo:data` events dispatched
  // elsewhere in the app (e.g. a websocket/polling layer not shown here).
  //
  // Expected event shape:
  //   new CustomEvent("extingo:data", {
  //     detail: { status: "EMERGENCY", lat: <number>, lon: <number> }
  //   })
  // ---------------------------------------------------------------------
  let fireMarker = null;
  let routeLine = null;

  function placeFireMarker(lat, lon) {
    const latlng = [lat, lon];
    if (fireMarker) {
      fireMarker.setLatLng(latlng);
    } else {
      fireMarker = L.marker(latlng, {
        icon: L.divIcon({
          className: "",
          html: '<span class="marker-dot marker-dot--active"></span>',
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      })
        .bindPopup("Active fire")
        .addTo(map);
    }
    return fireMarker;
  }

  function drawRouteGeometry(geometry) {
    if (routeLine) {
      map.removeLayer(routeLine);
    }
    // Hardcoded to match the --ember token in dashboard.html's CSS —
    // CSS custom properties aren't reliably resolved on SVG path
    // attributes, so the color is duplicated here rather than shared.
    routeLine = L.geoJSON(geometry, {
      style: { color: "#ff5a29", weight: 4, opacity: 0.85 },
    }).addTo(map);
  }

  async function fetchStationToFireRoute(fireLat, fireLon) {
    // NOTE: router.project-osrm.org is the public OSRM demo server. It is
    // rate-limited, has no uptime guarantee, and is explicitly meant for
    // demos/testing only. Swap this base URL for a self-hosted OSRM
    // instance (or another routing provider) before real deployment.
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${STATION_ORIGIN.lon},${STATION_ORIGIN.lat};${fireLon},${fireLat}` +
      `?overview=full&geometries=geojson`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM request failed with status ${response.status}`);
    }
    const data = await response.json();
    const route = data.routes && data.routes[0];
    if (!route) {
      throw new Error("OSRM response contained no route");
    }
    return route.geometry; // GeoJSON LineString, [lon, lat] pairs
  }

  async function handleEmergency(lat, lon) {
    placeFireMarker(lat, lon);
    map.flyTo([lat, lon], 16, { duration: 1.4 });

    try {
      const geometry = await fetchStationToFireRoute(lat, lon);
      drawRouteGeometry(geometry);
    } catch (err) {
      console.error("Failed to fetch station-to-fire route from OSRM:", err);
    }
  }

  window.addEventListener("extingo:data", (event) => {
    const detail = event.detail || {};
    if (detail.status !== "EMERGENCY") return;

    const { lat, lon } = detail;
    if (typeof lat !== "number" || typeof lon !== "number") {
      console.warn(
        "extingo:data EMERGENCY payload is missing numeric lat/lon:",
        detail
      );
      return;
    }
    handleEmergency(lat, lon);
  });

  // Dev-only helper: fire a synthetic extingo:data EMERGENCY event from
  // the console to exercise this without a real data source, e.g.
  //   ExtingoMap.simulateEmergency()
  function simulateEmergency(lat, lon) {
    window.dispatchEvent(
      new CustomEvent("extingo:data", {
        detail: {
          status: "EMERGENCY",
          lat: typeof lat === "number" ? lat : DEMO_FIRE_LOCATION.lat,
          lon: typeof lon === "number" ? lon : DEMO_FIRE_LOCATION.lon,
        },
      })
    );
  }

  function formatClock(isoString) {
    return new Date(isoString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }

  function makeDivIcon(status) {
    const modifier = status === "active" ? "active" : "resolved";
    return L.divIcon({
      className: "",
      html: `<span class="marker-dot marker-dot--${modifier}"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10],
    });
  }

  function buildPopupContent(incident) {
    const statusLabel =
      incident.status === "active"
        ? '<span class="incident-popup__tag incident-popup__tag--active">Active</span>'
        : '<span class="incident-popup__tag incident-popup__tag--resolved">Resolved</span>';

    const action =
      incident.status === "active"
        ? `<button class="incident-popup__resolve" type="button" data-action="resolve" data-id="${incident.id}">Mark Resolved</button>`
        : "";

    return `
      <div class="incident-popup">
        <p class="incident-popup__eyebrow">${incident.id} &middot; ${incident.type}</p>
        <p class="incident-popup__address">${incident.address}</p>
        <p class="incident-popup__meta">${formatDate(
          incident.reportedAt
        )} &middot; ${formatClock(incident.reportedAt)}</p>
        <p class="incident-popup__coords">${incident.lat.toFixed(
          4
        )}, ${incident.lng.toFixed(4)}</p>
        ${statusLabel}
        ${action}
      </div>
    `;
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markersById.clear();

    ExtingoAPI.getIncidents().forEach((incident) => {
      const marker = L.marker([incident.lat, incident.lng], {
        icon: makeDivIcon(incident.status),
      }).bindPopup(buildPopupContent(incident));

      marker.addTo(markerLayer);
      markersById.set(incident.id, marker);
    });
  }

  function renderHistoryList() {
    const list = document.getElementById("history-list");
    const countBadge = document.getElementById("history-count");
    const incidents = ExtingoAPI.getIncidents();

    countBadge.textContent = String(incidents.length);

    if (incidents.length === 0) {
      list.innerHTML =
        '<li class="history-empty">No incidents logged yet.</li>';
      return;
    }

    list.innerHTML = incidents
      .map((incident) => {
        const statusClass =
          incident.status === "active"
            ? "history-item__status--active"
            : "history-item__status--resolved";
        const statusText =
          incident.status === "active" ? "Active" : "Resolved";

        return `
          <li class="history-item" data-id="${incident.id}" tabindex="0" role="button">
            <div class="history-item__top">
              <span class="history-item__type">${incident.type}</span>
              <span class="history-item__status ${statusClass}">${statusText}</span>
            </div>
            <p class="history-item__address">${incident.address}</p>
            <div class="history-item__meta">
              <span>${formatDate(incident.reportedAt)} &middot; ${formatClock(
          incident.reportedAt
        )}</span>
              <span class="history-item__coords">${incident.lat.toFixed(
                4
              )}, ${incident.lng.toFixed(4)}</span>
            </div>
          </li>
        `;
      })
      .join("");
  }

  function renderAll() {
    renderMarkers();
    renderHistoryList();
  }

  function focusIncident(id) {
    const incident = ExtingoAPI.getIncidentById(id);
    const marker = markersById.get(id);
    if (!incident || !marker) return;

    map.flyTo([incident.lat, incident.lng], 16, { duration: 0.6 });
    marker.openPopup();
  }

  // History panel row -> map interaction.
  document.getElementById("history-list").addEventListener("click", (e) => {
    const item = e.target.closest(".history-item[data-id]");
    if (item) focusIncident(item.dataset.id);
  });

  document.getElementById("history-list").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target.closest(".history-item[data-id]");
    if (item) {
      e.preventDefault();
      focusIncident(item.dataset.id);
    }
  });

  // Popup "Mark Resolved" -> API, delegated since popups are re-created.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="resolve"]');
    if (!btn) return;
    ExtingoAPI.resolveIncident(btn.dataset.id);
    map.closePopup();
  });

  // Collapsible history panel toggling.
  const panel = document.getElementById("history-panel");
  const toggleBtn = document.getElementById("history-toggle");
  const closeBtn = document.getElementById("history-close");

  function setPanelOpen(open) {
    panel.classList.toggle("is-open", open);
    panel.setAttribute("aria-hidden", String(!open));
    toggleBtn.setAttribute("aria-expanded", String(open));
  }

  toggleBtn.addEventListener("click", () =>
    setPanelOpen(!panel.classList.contains("is-open"))
  );
  closeBtn.addEventListener("click", () => setPanelOpen(false));

  ExtingoAPI.bus.addEventListener("incident:new", renderAll);
  ExtingoAPI.bus.addEventListener("incident:resolved", renderAll);

  window.ExtingoMap = { focusIncident, renderAll, simulateEmergency };

  renderAll();

  // Leaflet needs a nudge once its container has real layout dimensions.
  setTimeout(() => map.invalidateSize(), 0);
  window.addEventListener("resize", () => map.invalidateSize());
})();
