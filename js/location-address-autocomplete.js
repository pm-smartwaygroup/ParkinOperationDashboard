/* ParkIn Locations. Reuse the existing Google Maps Places (New) browser loader.
 * This browser-only integration does not verify Saudi National Addresses.
 */
(() => {
  const form = document.querySelector('#add-location-view .add-location-layout');
  const address = form?.elements.namedItem('address');
  if (!form || !address || address.dataset.parkinPlacesBound === 'true') return;
  address.dataset.parkinPlacesBound = 'true';
  address.setAttribute('role', 'combobox');
  address.setAttribute('aria-autocomplete', 'list');
  address.setAttribute('aria-expanded', 'false');
  address.setAttribute('autocomplete', 'off');

  const list = document.createElement('div');
  list.id = 'location-google-suggestions';
  list.className = 'location-google-suggestions';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  address.setAttribute('aria-controls', list.id);
  address.insertAdjacentElement('afterend', list);

  const feedback = document.createElement('div');
  feedback.className = 'location-google-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  list.insertAdjacentElement('afterend', feedback);

  const field = (name) => form.elements.namedItem(name);
  const count = (value) => Array.from(String(value || '').replace(/\s/g, '')).length;
  const titleText = (value) => typeof value === 'string' ? value : value?.text || value?.toString?.() || '';
  let predictions = [];
  let active = -1;
  let requestVersion = 0;
  let timer;
  let session;
  let selectedAddress = null;
  let choosing = false;

  function close() {
    predictions = [];
    active = -1;
    list.replaceChildren();
    list.hidden = true;
    address.setAttribute('aria-expanded', 'false');
    address.removeAttribute('aria-activedescendant');
  }
  function activate(index) {
    active = index;
    list.querySelectorAll('[role="option"]').forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === active));
      option.classList.toggle('is-active', i === active);
    });
    if (active < 0) address.removeAttribute('aria-activedescendant');
    else address.setAttribute('aria-activedescendant', `${list.id}-${active}`);
  }
  function reset() {
    requestVersion++;
    clearTimeout(timer);
    close();
    session = null;
    selectedAddress = null;
    feedback.textContent = '';
  }
  form.addEventListener('parkin:location-form-loaded', reset);
  form.addEventListener('parkin:location-form-cleared', reset);

  function formattedComponent(components, names) {
    return components?.find((part) => names.some((name) => part.types?.includes(name)))?.longText || '';
  }
  function assignPlaceFields(place) {
    const lat = typeof place.location?.lat === 'function' ? place.location.lat() : place.location?.lat;
    const lng = typeof place.location?.lng === 'function' ? place.location.lng() : place.location?.lng;
    const valid = Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    field('latitude').value = valid ? Number(lat).toFixed(7) : '';
    field('longitude').value = valid ? Number(lng).toFixed(7) : '';
    const components = place.addressComponents;
    const district = formattedComponent(components, ['sublocality_level_1', 'sublocality', 'neighborhood']);
    const city = formattedComponent(components, ['locality', 'administrative_area_level_2']);
    const postal = formattedComponent(components, ['postal_code']);
    if (district) field('district').value = district;
    if (postal) field('postalCode').value = postal;
    const cityField = field('city');
    if (city) {
      const option = [...cityField.options].find((item) => item.value.toLowerCase() === city.toLowerCase());
      if (option) cityField.value = option.value;
      else {
        const newOption = document.createElement('option');
        newOption.value = city;
        newOption.textContent = city;
        newOption.dataset.parkinLocationDynamic = 'true';
        cityField.appendChild(newOption);
        cityField.value = city;
      }
    }
    feedback.textContent = valid
      ? 'Google location selected. Latitude and longitude have been updated. Review city and district before saving.'
      : 'Address selected, but coordinates were not available. Enter latitude and longitude manually.';
    return valid;
  }
  async function select(prediction) {
    const version = ++requestVersion;
    clearTimeout(timer);
    close();
    feedback.textContent = 'Loading the selected address and coordinates...';
    try {
      if (!prediction || typeof prediction.toPlace !== 'function') throw new Error('Place details unavailable');
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });
      if (version !== requestVersion || !form.isConnected) return;
      const text = place.formattedAddress || titleText(prediction.text);
      if (!text) throw new Error('Place address unavailable');
      choosing = true;
      address.value = String(text).slice(0, 500);
      address.dispatchEvent(new Event('input', { bubbles: true }));
      address.dispatchEvent(new Event('change', { bubbles: true }));
      choosing = false;
      assignPlaceFields(place);
      selectedAddress = address.value;
      session = null;
      address.focus();
    } catch {
      choosing = false;
      feedback.textContent = 'Google could not retrieve this place. Enter the address and coordinates manually.';
    }
  }
  function show(items) {
    close();
    predictions = items.map((item) => item?.placePrediction).filter(Boolean).slice(0, 6);
    if (!predictions.length) return;
    predictions.forEach((prediction, i) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `${list.id}-${i}`;
      option.className = 'location-google-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const first = document.createElement('strong');
      first.textContent = titleText(prediction.mainText) || titleText(prediction.text);
      const second = document.createElement('small');
      second.textContent = titleText(prediction.secondaryText);
      option.append(first, second);
      option.addEventListener('pointerdown', (event) => event.preventDefault());
      option.addEventListener('click', () => { void select(prediction); });
      list.append(option);
    });
    const attribution = document.createElement('div');
    attribution.className = 'location-google-attribution';
    attribution.textContent = 'Google Maps';
    list.append(attribution);
    list.hidden = false;
    address.setAttribute('aria-expanded', 'true');
  }
  async function query(text, version) {
    try {
      const places = await window.google?.maps?.importLibrary?.('places');
      if (version !== requestVersion || !form.isConnected) return;
      if (!places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
        feedback.textContent = 'Google suggestions unavailable. Enter the address manually.';
        return;
      }
      if (!session && places.AutocompleteSessionToken) session = new places.AutocompleteSessionToken();
      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: text,
        includedRegionCodes: ['sa'],
        region: 'sa',
        language: 'en',
        ...(session ? { sessionToken: session } : {}),
      });
      if (version !== requestVersion || address.value.trim() !== text) return;
      show(response?.suggestions || []);
    } catch {
      if (version === requestVersion) {
        close();
        feedback.textContent = 'Google suggestions unavailable. Enter the address manually.';
      }
    }
  }
  address.addEventListener('input', () => {
    if (choosing) return;
    const version = ++requestVersion;
    clearTimeout(timer);
    close();
    const text = address.value.trim();
    if (selectedAddress !== null && selectedAddress !== text) {
      field('latitude').value = '';
      field('longitude').value = '';
      selectedAddress = null;
      feedback.textContent = 'Address changed. Select another Google suggestion to refresh coordinates, or enter them manually.';
    }
    if (count(text) < 3) return;
    timer = setTimeout(() => { void query(text, version); }, 300);
  });
  address.addEventListener('keydown', (event) => {
    if (list.hidden || !predictions.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activate((active + (event.key === 'ArrowDown' ? 1 : predictions.length - 1)) % predictions.length);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      void select(predictions[active]);
    } else if (event.key === 'Escape') {
      requestVersion++;
      close();
    }
  });
  address.addEventListener('blur', () => setTimeout(() => { requestVersion++; close(); }, 180));
})();
