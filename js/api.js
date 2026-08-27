/**
 * Extingo Fire Department — dispatch API (demo)
 *
 * Stands in for a real dispatch backend. Holds incident data in memory,
 * exposes read/write helpers, and fires events on a shared bus so the
 * map and status bar can react without polling each other.
 */

(function () {
  const bus = new EventTarget();

  // Fictional station coverage area — a handful of streets clustered
  // around a single town so the map reads as one department's turf.
  const DEMO_LOCATIONS = [
    { address: "412 Birchwood Ave", lat: 41.8256, lng: -71.4128 },
    { address: "88 Foundry Street", lat: 41.8311, lng: -71.4067 },
    { address: "1200 Millbrook Rd", lat: 41.8179, lng: -71.4225 },
    { address: "27 Chapel Hill Ln", lat: 41.8298, lng: -71.4302 },
    { address: "560 Harbor View Dr", lat: 41.8123, lng: -71.4041 },
    { address: "9 Cobblestone Ct", lat: 41.8347, lng: -71.4180 },
    { address: "745 Ridgeline Ave", lat: 41.8202, lng: -71.3986 },
    { address: "301 Elm Street", lat: 41.8266, lng: -71.4198 },
  ];

  const INCIDENT_TYPES = [
    "Structure Fire",
    "Vehicle Fire",
    "Medical Emergency",
    "Gas Leak",
    "Alarm Activation",
    "Brush Fire",
  ];

  function isoMinutesAgo(minutes) {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
  }

  // Seed history: mostly resolved calls from the past shift, one live call.
  let incidentSeq = 2029;
  let incidents = [
    {
      id: "INC-2030",
      type: "Structure Fire",
      address: DEMO_LOCATIONS[0].address,
      lat: DEMO_LOCATIONS[0].lat,
      lng: DEMO_LOCATIONS[0].lng,
      status: "active",
      reportedAt: isoMinutesAgo(6),
      resolvedAt: null,
    },
    {
      id: "INC-2029",
      type: "Alarm Activation",
      address: DEMO_LOCATIONS[3].address,
      lat: DEMO_LOCATIONS[3].lat,
      lng: DEMO_LOCATIONS[3].lng,
      status: "resolved",
      reportedAt: isoMinutesAgo(95),
      resolvedAt: isoMinutesAgo(80),
    },
    {
      id: "INC-2028",
      type: "Medical Emergency",
      address: DEMO_LOCATIONS[4].address,
      lat: DEMO_LOCATIONS[4].lat,
      lng: DEMO_LOCATIONS[4].lng,
      status: "resolved",
      reportedAt: isoMinutesAgo(210),
      resolvedAt: isoMinutesAgo(192),
    },
    {
      id: "INC-2027",
      type: "Vehicle Fire",
      address: DEMO_LOCATIONS[6].address,
      lat: DEMO_LOCATIONS[6].lat,
      lng: DEMO_LOCATIONS[6].lng,
      status: "resolved",
      reportedAt: isoMinutesAgo(340),
      resolvedAt: isoMinutesAgo(312),
    },
    {
      id: "INC-2026",
      type: "Gas Leak",
      address: DEMO_LOCATIONS[2].address,
      lat: DEMO_LOCATIONS[2].lat,
      lng: DEMO_LOCATIONS[2].lng,
      status: "resolved",
      reportedAt: isoMinutesAgo(505),
      resolvedAt: isoMinutesAgo(470),
    },
  ];

  function getIncidents() {
    return incidents
      .slice()
      .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
  }

  function getActiveIncidents() {
    return incidents.filter((i) => i.status === "active");
  }

  function getIncidentById(id) {
    return incidents.find((i) => i.id === id) || null;
  }

  function addIncident(partial) {
    const incident = Object.assign(
      {
        id: `INC-${++incidentSeq}`,
        status: "active",
        reportedAt: new Date().toISOString(),
        resolvedAt: null,
      },
      partial
    );
    incidents.unshift(incident);
    bus.dispatchEvent(new CustomEvent("incident:new", { detail: incident }));
    return incident;
  }

  function resolveIncident(id) {
    const incident = getIncidentById(id);
    if (!incident || incident.status === "resolved") return;
    incident.status = "resolved";
    incident.resolvedAt = new Date().toISOString();
    bus.dispatchEvent(
      new CustomEvent("incident:resolved", { detail: incident })
    );
  }

  function silenceAlarm() {
    bus.dispatchEvent(new CustomEvent("alarm:silenced"));
  }

  // Demo-only: occasionally phones in a new call so the alarm bar and
  // map have something to react to without manual triggering.
  function simulateIncident() {
    const loc =
      DEMO_LOCATIONS[Math.floor(Math.random() * DEMO_LOCATIONS.length)];
    const type =
      INCIDENT_TYPES[Math.floor(Math.random() * INCIDENT_TYPES.length)];
    return addIncident({
      type,
      address: loc.address,
      lat: loc.lat + (Math.random() - 0.5) * 0.0015,
      lng: loc.lng + (Math.random() - 0.5) * 0.0015,
    });
  }

  let feedTimer = null;
  function startDemoFeed() {
    if (feedTimer) return;
    feedTimer = setInterval(() => {
      // Roughly a coin flip every cycle so the bar doesn't scream nonstop.
      if (Math.random() < 0.5) simulateIncident();
    }, 45000);
  }

  function stopDemoFeed() {
    clearInterval(feedTimer);
    feedTimer = null;
  }

  window.ExtingoAPI = {
    bus,
    getIncidents,
    getActiveIncidents,
    getIncidentById,
    addIncident,
    resolveIncident,
    silenceAlarm,
    simulateIncident,
    startDemoFeed,
    stopDemoFeed,
  };
})();
