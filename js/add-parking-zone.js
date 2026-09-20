const ADD_ZONE_CENTER = { lat: 24.7136, lng: 46.6753 };

const addParkingZoneState = {
  root: null,
  map: null,
  mapContainer: null,
  geocoder: null,
  marker: null,
  polygon: null,
  polygonPoints: [],
  drawingMode: false,
  mapClickListener: null,
  mapDoubleClickListener: null,
  locationControl: null,
  placesSessionToken: null,
  placesAutocompleteSuggestion: null,
  AutocompleteSessionToken: null,
  suggestions: [],
  highlightedSuggestion: -1,
  suggestionTimer: null,
  suggestionRequestId: 0,
  outsideClickHandler: null,
  imageUrl: null,
  polygonPathListeners: [],
  vertexMarkers: [],
  zoneBoundary: [],
  initialized: false,
};

function addZoneToast(message) {
  const toast = addParkingZoneState.root?.querySelector("[data-add-zone-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function addZoneWaitForGoogleMaps() {
  if (window.google?.maps?.Map && window.google.maps.Marker && window.google.maps.Geocoder) return Promise.resolve(true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      if (window.google?.maps?.Map && window.google.maps.Marker && window.google.maps.Geocoder) return resolve(true);
      if (Date.now() - startedAt > 10000) return resolve(false);
      window.setTimeout(check, 100);
    };
    check();
  });
}

function addZonePredictionText(value) {
  if (typeof value === "string") return value;
  return value?.text || value?.toString?.() || "";
}

function addZoneCreatePlacesSession() {
  const SessionToken = addParkingZoneState.AutocompleteSessionToken;
  return SessionToken ? new SessionToken() : null;
}

function addZoneSuggestionsRoot() {
  return addParkingZoneState.root?.querySelector("[data-add-zone-location-suggestions]");
}

function addZoneCloseSuggestions() {
  const suggestionsRoot = addZoneSuggestionsRoot();
  if (!suggestionsRoot) return;
  addParkingZoneState.suggestions = [];
  addParkingZoneState.highlightedSuggestion = -1;
  suggestionsRoot.replaceChildren();
  suggestionsRoot.classList.remove("is-visible");
  addParkingZoneState.root?.querySelector("[data-add-zone-map-search]")?.setAttribute("aria-expanded", "false");
}

function addZoneShowSuggestionMessage(message) {
  const suggestionsRoot = addZoneSuggestionsRoot();
  if (!suggestionsRoot) return;
  suggestionsRoot.innerHTML = `<div class="add-zone-location-suggestion-message" role="status">${message}</div>`;
  suggestionsRoot.classList.add("is-visible");
  addParkingZoneState.root?.querySelector("[data-add-zone-map-search]")?.setAttribute("aria-expanded", "true");
}

function addZoneRenderSuggestions() {
  const suggestionsRoot = addZoneSuggestionsRoot();
  if (!suggestionsRoot) return;
  const suggestions = addParkingZoneState.suggestions;
  if (!suggestions.length) {
    addZoneShowSuggestionMessage("No locations found");
    return;
  }
  suggestionsRoot.innerHTML = suggestions.map((suggestion, index) => {
    const prediction = suggestion.placePrediction;
    const primary = addZonePredictionText(prediction?.mainText) || addZonePredictionText(prediction?.text);
    const secondary = addZonePredictionText(prediction?.secondaryText);
    return `<button type="button" class="add-zone-location-suggestion ${index === addParkingZoneState.highlightedSuggestion ? "is-highlighted" : ""}" role="option" aria-selected="${index === addParkingZoneState.highlightedSuggestion}" data-add-zone-suggestion="${index}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span><strong>${addZoneEscape(primary)}</strong>${secondary ? `<small>${addZoneEscape(secondary)}</small>` : ""}</span></button>`;
  }).join("");
  suggestionsRoot.classList.add("is-visible");
  addParkingZoneState.root?.querySelector("[data-add-zone-map-search]")?.setAttribute("aria-expanded", "true");
}

function addZoneEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function addZoneFetchSuggestions(value) {
  const query = value.trim();
  if (query.length < 2 || !addParkingZoneState.placesAutocompleteSuggestion) {
    addZoneCloseSuggestions();
    return;
  }
  const requestId = ++addParkingZoneState.suggestionRequestId;
  try {
    const { suggestions = [] } = await addParkingZoneState.placesAutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ["sa"],
      language: "en",
      region: "sa",
      locationBias: { center: ADD_ZONE_CENTER, radius: 50000 },
      ...(addParkingZoneState.placesSessionToken ? { sessionToken: addParkingZoneState.placesSessionToken } : {}),
    });
    if (requestId !== addParkingZoneState.suggestionRequestId) return;
    addParkingZoneState.suggestions = suggestions.filter((suggestion) => suggestion.placePrediction);
    addParkingZoneState.highlightedSuggestion = -1;
    addZoneRenderSuggestions();
  } catch (error) {
    if (requestId !== addParkingZoneState.suggestionRequestId) return;
    console.error("Add Parking Zone location search failed:", error);
    addZoneShowSuggestionMessage("Location search is temporarily unavailable.");
  }
}

function addZoneMapBelongsToContainer(mapElement) {
  return Boolean(
    addParkingZoneState.map &&
    addParkingZoneState.mapContainer === mapElement &&
    mapElement.isConnected &&
    mapElement.querySelector(".gm-style"),
  );
}

function resetAddZoneMapState() {
  addZoneSetDrawingCursor(false);
  addParkingZoneState.mapClickListener?.remove();
  addParkingZoneState.mapDoubleClickListener?.remove();
  addParkingZoneState.marker?.setMap(null);
  addParkingZoneState.polygon?.setMap(null);
  addZoneClearPolygonPathListeners();
  addZoneRemoveVertexMarkers();
  addParkingZoneState.marker = null;
  addParkingZoneState.polygon = null;
  addParkingZoneState.polygonPoints = [];
  addParkingZoneState.zoneBoundary = [];
  addParkingZoneState.drawingMode = false;
  addParkingZoneState.mapClickListener = null;
  addParkingZoneState.mapDoubleClickListener = null;
  addParkingZoneState.locationControl = null;
  addParkingZoneState.geocoder = null;
  addParkingZoneState.map = null;
  addParkingZoneState.mapContainer = null;
}

function scheduleAddZoneMapResize(map) {
  const resize = () => {
    if (!map || !addParkingZoneState.mapContainer?.isConnected) return;
    google.maps.event.trigger(map, "resize");
    map.setCenter(ADD_ZONE_CENTER);
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(resize));
}

function addZoneSetFieldError(name, message) {
  const root = addParkingZoneState.root;
  const field = root?.querySelector(`[name="${name}"]`);
  const error = root?.querySelector(`[data-error-for="${name}"]`);
  if (field) field.setAttribute("aria-invalid", message ? "true" : "false");
  if (error) error.textContent = message || "";
  return Boolean(message);
}

function addZoneReadFormState() {
  const form = addParkingZoneState.root.querySelector("[data-add-zone-form]");
  const data = new FormData(form);
  return {
    name: String(data.get("name") || "").trim(),
    description: String(data.get("description") || "").trim(),
    address: String(data.get("address") || "").trim(),
    latitude: addParkingZoneState.marker?.getPosition()?.lat() ?? null,
    longitude: addParkingZoneState.marker?.getPosition()?.lng() ?? null,
    locationGroup: String(data.get("locationGroup") || ""),
    zoneType: String(data.get("zoneType") || ""),
    totalSpaces: String(data.get("totalSpaces") || "").trim(),
    availableSpaces: String(data.get("availableSpaces") || "").trim(),
    pricing: String(data.get("pricing") || "").trim(),
    currency: String(data.get("currency") || "SAR (Saudi Riyal)"),
    status: String(data.get("status") || "Active"),
    operatingMode: String(data.get("operatingMode") || "24/7"),
    openingTime: String(data.get("openingTime") || ""),
    closingTime: String(data.get("closingTime") || ""),
    maxVehicleSize: String(data.get("maxVehicleSize") || ""),
    notes: String(data.get("notes") || "").trim(),
    facility: String(data.get("facility") || ""),
    imageFile: data.get("imageFile") instanceof File && data.get("imageFile").name ? data.get("imageFile") : null,
    zoneBoundary: addParkingZoneState.zoneBoundary,
  };
}

function addZoneValidate() {
  const data = addZoneReadFormState();
  let firstInvalid = null;
  const fail = (name, message) => {
    if (addZoneSetFieldError(name, message) && !firstInvalid) firstInvalid = addParkingZoneState.root.querySelector(`[name="${name}"]`);
  };
  fail("name", data.name ? "" : "Zone name is required.");
  fail("address", data.address ? "" : "Location / Address is required.");
  addZoneSetFieldError("coordinates", data.latitude !== null && data.longitude !== null ? "" : "Select a location on the map.");
  if (data.latitude === null || data.longitude === null) firstInvalid ||= addParkingZoneState.root.querySelector('[name="address"]');
  const total = Number(data.totalSpaces);
  const available = data.availableSpaces === "" ? null : Number(data.availableSpaces);
  fail("totalSpaces", Number.isInteger(total) && total > 0 ? "" : "Enter a whole number greater than zero.");
  if (available !== null && (!Number.isInteger(available) || available < 0 || available > total)) fail("availableSpaces", "Available spaces must be between 0 and total spaces.");
  else addZoneSetFieldError("availableSpaces", "");
  fail("pricing", Number.isFinite(Number(data.pricing)) && Number(data.pricing) >= 0 ? "" : "Enter a valid non-negative price.");
  if (data.operatingMode === "custom" && (!data.openingTime || !data.closingTime || data.openingTime === data.closingTime)) {
    addZoneSetFieldError("operatingHours", "Set different opening and closing times.");
    if (!firstInvalid) firstInvalid = addParkingZoneState.root.querySelector('[name="openingTime"]');
  } else addZoneSetFieldError("operatingHours", "");
  if (data.imageFile && (!/^image\/(png|jpeg)$/.test(data.imageFile.type) || data.imageFile.size > 5 * 1024 * 1024)) fail("imageFile", "Use a PNG or JPG image under 5MB.");
  else addZoneSetFieldError("imageFile", "");
  if (firstInvalid) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
    return null;
  }
  return data;
}

function addZoneUpdateCoordinates() {
  const position = addParkingZoneState.marker?.getPosition();
  const output = addParkingZoneState.root.querySelector("[data-add-zone-coordinates]");
  output.textContent = position ? `${position.lat().toFixed(5)}, ${position.lng().toFixed(5)}` : "Not selected";
}

function addZonePlaceMarker(position, reverseGeocode = true, viewport = null) {
  if (!addParkingZoneState.map) return;
  if (!addParkingZoneState.marker) {
    addParkingZoneState.marker = new google.maps.Marker({ map: addParkingZoneState.map, position, title: "Zone location" });
  } else {
    addParkingZoneState.marker.setPosition(position);
    addParkingZoneState.marker.setMap(addParkingZoneState.map);
  }
  if (viewport) {
    addParkingZoneState.map.fitBounds(viewport);
  } else {
    addParkingZoneState.map.panTo(position);
    addParkingZoneState.map.setZoom(Math.max(addParkingZoneState.map.getZoom() || 12, 14));
  }
  addZoneUpdateCoordinates();
  if (reverseGeocode && addParkingZoneState.geocoder) {
    addParkingZoneState.geocoder.geocode({ location: position }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const address = results[0].formatted_address;
        addParkingZoneState.root.querySelector('[name="address"]').value = address;
        addParkingZoneState.root.querySelector("[data-add-zone-map-search]").value = address;
      }
    });
  }
}

function addZoneSyncPolygonBoundary() {
  const path = addParkingZoneState.polygon?.getPath();
  addParkingZoneState.zoneBoundary = path
    ? Array.from({ length: path.getLength() }, (_, index) => {
      const point = path.getAt(index);
      return { lat: point.lat(), lng: point.lng() };
    })
    : [];
  addParkingZoneState.polygonPoints = path ? Array.from({ length: path.getLength() }, (_, index) => path.getAt(index)) : [];
}

function addZoneClearPolygonPathListeners() {
  addParkingZoneState.polygonPathListeners.forEach((listener) => listener.remove());
  addParkingZoneState.polygonPathListeners = [];
}

function addZoneRemoveVertexMarkers() {
  addParkingZoneState.vertexMarkers.forEach((marker) => marker.setMap(null));
  addParkingZoneState.vertexMarkers = [];
}

function addZoneCreateVertexMarker(position) {
  if (!addParkingZoneState.map) return;
  const marker = new google.maps.Marker({
    map: addParkingZoneState.map,
    position,
    clickable: false,
    zIndex: 10,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 5,
      fillColor: "#0a9b55",
      fillOpacity: 1,
      strokeColor: "#fff",
      strokeWeight: 2,
    },
  });
  addParkingZoneState.vertexMarkers.push(marker);
}

function addZoneSetDrawingCursor(active) {
  addParkingZoneState.map?.setOptions({
    draggableCursor: active ? "crosshair" : null,
    disableDoubleClickZoom: active,
  });
}

function addZoneUpdateDrawingButton() {
  const button = addParkingZoneState.root?.querySelector("[data-add-zone-draw]");
  if (!button) return;
  button.innerHTML = addParkingZoneState.drawingMode
    ? '<i class="fa-solid fa-pen" aria-hidden="true"></i> Drawing...'
    : addParkingZoneState.polygon
      ? '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Redraw Zone'
      : '<i class="fa-solid fa-draw-polygon" aria-hidden="true"></i> Draw Zone';
  button.classList.toggle("is-active", addParkingZoneState.drawingMode);
  button.setAttribute("aria-pressed", String(addParkingZoneState.drawingMode));
}

function addZoneStartDrawing() {
  if (!addParkingZoneState.map) return;
  if (addParkingZoneState.drawingMode) return;
  if (addParkingZoneState.polygon) addZoneClearPolygon();
  addParkingZoneState.drawingMode = true;
  addParkingZoneState.polygonPoints = [];
  addParkingZoneState.zoneBoundary = [];
  addZoneRemoveVertexMarkers();
  addZoneUpdateDrawingButton();
  const root = addParkingZoneState.root;
  root.querySelector("[data-add-zone-finish]").hidden = false;
  root.querySelector("[data-add-zone-draw-hint]").textContent = "Click on the map to add boundary points. Tap the map to add boundary points.";
  addZoneSetDrawingCursor(true);
}

function addZoneFinishDrawing() {
  if (!addParkingZoneState.drawingMode) return;
  if (addParkingZoneState.polygonPoints.length < 3) {
    addZoneToast("Add at least 3 points to create a parking zone.");
    return;
  }
  addParkingZoneState.drawingMode = false;
  addZoneSetDrawingCursor(false);
  addZoneRemoveVertexMarkers();
  addParkingZoneState.polygon?.setOptions({ clickable: true, editable: true });
  addZoneSyncPolygonBoundary();
  const root = addParkingZoneState.root;
  root.querySelector("[data-add-zone-finish]").hidden = true;
  root.querySelector("[data-add-zone-draw-hint]").textContent = "Zone boundary saved. You can edit it on the map or clear it.";
  addZoneUpdateDrawingButton();
}

function addZoneMapClick(event) {
  if (!addParkingZoneState.drawingMode) {
    addZonePlaceMarker(event.latLng);
    return;
  }
  const point = event.latLng;
  addParkingZoneState.polygonPoints.push(point);
  addZoneCreateVertexMarker(point);
  if (!addParkingZoneState.polygon) {
    addParkingZoneState.polygon = new google.maps.Polygon({
      paths: addParkingZoneState.polygonPoints,
      strokeColor: "#0a9b55",
      strokeOpacity: 1,
      strokeWeight: 2,
      fillColor: "#0a9b55",
      fillOpacity: 0.16,
      clickable: false,
      editable: false,
      map: addParkingZoneState.map,
    });
    addZoneClearPolygonPathListeners();
    const path = addParkingZoneState.polygon.getPath();
    ["set_at", "insert_at", "remove_at"].forEach((eventName) => {
      addParkingZoneState.polygonPathListeners.push(path.addListener(eventName, addZoneSyncPolygonBoundary));
    });
  } else {
    addParkingZoneState.polygon.setPath(addParkingZoneState.polygonPoints);
  }
  addZoneSyncPolygonBoundary();
}

function addZoneClearPolygon() {
  addParkingZoneState.polygon?.setMap(null);
  addZoneClearPolygonPathListeners();
  addZoneRemoveVertexMarkers();
  addParkingZoneState.polygon = null;
  addParkingZoneState.polygonPoints = [];
  addParkingZoneState.zoneBoundary = [];
  addParkingZoneState.drawingMode = false;
  addZoneSetDrawingCursor(false);
  const root = addParkingZoneState.root;
  root?.querySelector("[data-add-zone-finish]")?.setAttribute("hidden", "");
  if (root) {
    root.querySelector("[data-add-zone-draw-hint]").textContent = "Click on the map to place the zone marker.";
    addZoneUpdateDrawingButton();
  }
}

async function addZoneSelectSuggestion(index) {
  const suggestion = addParkingZoneState.suggestions[index];
  const prediction = suggestion?.placePrediction;
  if (!prediction) return;
  try {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "viewport"] });
    if (!place.location) {
      addZoneShowSuggestionMessage("Location details are unavailable.");
      return;
    }
    const address = place.formattedAddress || addZonePredictionText(place.displayName);
    addParkingZoneState.root.querySelector("[data-add-zone-map-search]").value = address;
    addParkingZoneState.root.querySelector('[name="address"]').value = address;
    addZonePlaceMarker(place.location, false, place.viewport || null);
    addZoneCloseSuggestions();
    addParkingZoneState.placesSessionToken = addZoneCreatePlacesSession();
  } catch (error) {
    console.error("Add Parking Zone place selection failed:", error);
    addZoneShowSuggestionMessage("Location search is temporarily unavailable.");
  }
}

function addZoneSearchLocation(event) {
  event.preventDefault();
  const input = addParkingZoneState.root.querySelector("[data-add-zone-map-search]");
  const query = input.value.trim();
  if (!query) return;
  if (addParkingZoneState.highlightedSuggestion >= 0) {
    addZoneSelectSuggestion(addParkingZoneState.highlightedSuggestion);
    return;
  }
  if (addParkingZoneState.suggestions.length) {
    addZoneSelectSuggestion(0);
    return;
  }
  if (!addParkingZoneState.geocoder) return;
  addParkingZoneState.geocoder.geocode({ address: query }, (results, status) => {
    if (status !== "OK" || !results?.[0]) {
      addZoneToast("Location could not be found.");
      return;
    }
    const result = results[0];
    addParkingZoneState.map.setCenter(result.geometry.location);
    addParkingZoneState.map.setZoom(14);
    addZonePlaceMarker(result.geometry.location, false);
    addParkingZoneState.root.querySelector('[name="address"]').value = result.formatted_address || query;
    addParkingZoneState.root.querySelector("[data-add-zone-map-search]").value = result.formatted_address || query;
    addZoneCloseSuggestions();
  });
}

async function initAddZonePlacesSearch() {
  if (addParkingZoneState.placesAutocompleteSuggestion) return true;
  try {
    const places = await google.maps.importLibrary("places");
    addParkingZoneState.placesAutocompleteSuggestion = places.AutocompleteSuggestion;
    addParkingZoneState.AutocompleteSessionToken = places.AutocompleteSessionToken;
    addParkingZoneState.placesSessionToken = addZoneCreatePlacesSession();
    return Boolean(addParkingZoneState.placesAutocompleteSuggestion);
  } catch (error) {
    console.error("Add Parking Zone Places library unavailable:", error);
    addZoneShowSuggestionMessage("Location search is temporarily unavailable.");
    return false;
  }
}

function addZoneUseCurrentLocation() {
  if (!navigator.geolocation) {
    addZoneToast("Unable to access your current location.");
    return;
  }
  navigator.geolocation.getCurrentPosition(({ coords }) => addZonePlaceMarker({ lat: coords.latitude, lng: coords.longitude }), () => addZoneToast("Unable to access your current location."), { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
}

function addZoneUpdateOperatingMode() {
  const custom = addParkingZoneState.root.querySelector('[name="operatingMode"]:checked')?.value === "custom";
  addParkingZoneState.root.querySelectorAll('[name="openingTime"], [name="closingTime"]').forEach((input) => { input.disabled = !custom; });
}

function addZoneUpdateCounter(event) {
  const counter = addParkingZoneState.root.querySelector(`[data-counter-for="${event.target.name}"]`);
  if (counter) counter.textContent = event.target.value.length;
}

function addZoneHandleImage(event) {
  const file = event.target.files?.[0];
  const error = addParkingZoneState.root.querySelector('[data-error-for="imageFile"]');
  if (!file) return;
  if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    error.textContent = "Use a PNG or JPG image under 5MB.";
    event.target.value = "";
    return;
  }
  error.textContent = "";
  addParkingZoneState.imageUrl && URL.revokeObjectURL(addParkingZoneState.imageUrl);
  addParkingZoneState.imageUrl = URL.createObjectURL(file);
  addParkingZoneState.root.querySelector("[data-add-zone-image-preview]").innerHTML = `<img src="${addParkingZoneState.imageUrl}" alt="Selected zone image" /><span>${file.name}</span><button type="button" data-add-zone-remove-image>Remove</button>`;
  addParkingZoneState.root.querySelector("[data-add-zone-image-preview]").classList.remove("hidden");
}

function addZoneResetForm() {
  const root = addParkingZoneState.root;
  root.querySelector("[data-add-zone-form]").reset();
  root.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  root.querySelectorAll(".add-zone-error").forEach((error) => { error.textContent = ""; });
  root.querySelectorAll("[data-counter-for]").forEach((counter) => { counter.textContent = "0"; });
  root.querySelector("[data-add-zone-image-preview]").innerHTML = "";
  root.querySelector("[data-add-zone-image-preview]").classList.add("hidden");
  addZoneCloseSuggestions();
  clearTimeout(addParkingZoneState.suggestionTimer);
  if (addParkingZoneState.imageUrl) URL.revokeObjectURL(addParkingZoneState.imageUrl);
  addParkingZoneState.imageUrl = null;
  addParkingZoneState.drawingMode = false;
  addZoneClearPolygon();
  if (addParkingZoneState.marker) addParkingZoneState.marker.setMap(null);
  addParkingZoneState.marker = null;
  addZoneUpdateOperatingMode();
  addZoneUpdateCoordinates();
}

function bindAddParkingZoneEvents(root) {
  if (root.dataset.bound === "true") return;
  if (addParkingZoneState.outsideClickHandler) {
    document.removeEventListener("click", addParkingZoneState.outsideClickHandler);
  }
  root.dataset.bound = "true";
  const form = root.querySelector("[data-add-zone-form]");
  form.addEventListener("submit", (event) => {
    if (event.submitter?.matches("[data-add-zone-map-search]")) return addZoneSearchLocation(event);
    event.preventDefault();
    if (!addZoneValidate()) return;
    console.info("Add Parking Zone frontend payload", addZoneReadFormState());
    addZoneToast("Parking zone form is ready for submission.");
  });
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-counter-for], textarea[name=description], textarea[name=notes]")) addZoneUpdateCounter(event);
    if (event.target.matches("[data-add-zone-map-search]")) {
      clearTimeout(addParkingZoneState.suggestionTimer);
      addParkingZoneState.suggestionTimer = setTimeout(() => addZoneFetchSuggestions(event.target.value), 250);
    }
  });
  root.querySelector("[data-add-zone-map-search]").addEventListener("keydown", (event) => {
    if (!addParkingZoneState.suggestions.length) {
      if (event.key === "Escape") addZoneCloseSuggestions();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const count = addParkingZoneState.suggestions.length;
      addParkingZoneState.highlightedSuggestion = (addParkingZoneState.highlightedSuggestion + direction + count) % count;
      addZoneRenderSuggestions();
    } else if (event.key === "Enter" && addParkingZoneState.highlightedSuggestion >= 0) {
      event.preventDefault();
      addZoneSelectSuggestion(addParkingZoneState.highlightedSuggestion);
    } else if (event.key === "Escape") {
      event.preventDefault();
      addZoneCloseSuggestions();
    }
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches('[name="operatingMode"]')) addZoneUpdateOperatingMode();
    if (event.target.matches('[name="imageFile"]')) addZoneHandleImage(event);
  });
  root.querySelector("[data-add-zone-back]").addEventListener("click", () => { window.location.hash = "#zones"; });
  root.querySelector("[data-add-zone-cancel]").addEventListener("click", () => { window.location.hash = "#zones"; });
  root.querySelector("[data-add-zone-draw]").addEventListener("click", addZoneStartDrawing);
  root.querySelector("[data-add-zone-finish]").addEventListener("click", addZoneFinishDrawing);
  root.querySelector("[data-add-zone-clear]").addEventListener("click", addZoneClearPolygon);
  root.querySelector("[data-add-zone-current-location]").addEventListener("click", addZoneUseCurrentLocation);
  root.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-add-zone-suggestion]");
    if (suggestion) {
      event.preventDefault();
      addZoneSelectSuggestion(Number(suggestion.dataset.addZoneSuggestion));
      return;
    }
    if (!event.target.closest("[data-add-zone-remove-image]")) return;
    addParkingZoneState.root.querySelector('[name="imageFile"]').value = "";
    addParkingZoneState.root.querySelector("[data-add-zone-image-preview]").innerHTML = "";
    addParkingZoneState.root.querySelector("[data-add-zone-image-preview]").classList.add("hidden");
  });
  addParkingZoneState.outsideClickHandler = (event) => {
    if (!root.contains(event.target)) addZoneCloseSuggestions();
  };
  document.addEventListener("click", addParkingZoneState.outsideClickHandler);
}

async function initAddParkingZoneMap(root) {
  const mapElement = root.querySelector("#add-parking-zone-map");
  if (!mapElement) return;
  if (!await addZoneWaitForGoogleMaps()) {
    root.querySelector("[data-add-zone-map-error]")?.classList.remove("hidden");
    console.error("Add Parking Zone Google Map unavailable: Google Maps API did not load.");
    return;
  }

  if (addZoneMapBelongsToContainer(mapElement)) {
    scheduleAddZoneMapResize(addParkingZoneState.map);
    return;
  }

  if (addParkingZoneState.map) resetAddZoneMapState();
  mapElement.replaceChildren();
  addParkingZoneState.map = new google.maps.Map(mapElement, { center: ADD_ZONE_CENTER, zoom: 12, zoomControl: true, zoomControlOptions: { position: google.maps.ControlPosition.LEFT_TOP }, fullscreenControl: true, mapTypeControl: false, streetViewControl: false });
  addParkingZoneState.mapContainer = mapElement;
  addParkingZoneState.geocoder = new google.maps.Geocoder();
  addParkingZoneState.mapClickListener = addParkingZoneState.map.addListener("click", addZoneMapClick);
  addParkingZoneState.mapDoubleClickListener = addParkingZoneState.map.addListener("dblclick", addZoneFinishDrawing);
  const control = document.createElement("button");
  control.type = "button";
  control.className = "add-zone-location-control";
  control.setAttribute("aria-label", "Current location");
  control.title = "Current location";
  control.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>';
  control.addEventListener("click", addZoneUseCurrentLocation);
  addParkingZoneState.locationControl = control;
  addParkingZoneState.map.controls[google.maps.ControlPosition.LEFT_TOP].push(control);
  await initAddZonePlacesSearch();
}

async function loadAddParkingZonePage({ reset = false } = {}) {
  const container = document.querySelector("#add-zone-container");
  if (!container) return;
  if (!container.querySelector("[data-add-parking-zone-page]")) {
    const response = await fetch("/pages/add-parking-zone.html");
    if (!response.ok) throw new Error(`Unable to load Add Parking Zone page: ${response.status}`);
    container.innerHTML = await response.text();
    addParkingZoneState.root = container.querySelector("[data-add-parking-zone-page]");
    bindAddParkingZoneEvents(addParkingZoneState.root);
  } else if (!addParkingZoneState.root) {
    addParkingZoneState.root = container.querySelector("[data-add-parking-zone-page]");
    bindAddParkingZoneEvents(addParkingZoneState.root);
  }
  if (reset) addZoneResetForm();
  await initAddParkingZoneMap(addParkingZoneState.root);
  if (addParkingZoneState.map) scheduleAddZoneMapResize(addParkingZoneState.map);
}

window.loadAddParkingZonePage = loadAddParkingZonePage;
