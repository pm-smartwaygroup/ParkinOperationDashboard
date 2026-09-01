const PROFILE_API_BASE_URL =
  window.PARKIN_CONFIG?.apiBaseUrl || "https://api.parkin.com.sa";

const profileHrData = {
  fullName: "Dashboard User",
  nationality: "Saudi Arabia",
  dateOfBirth: "15 January 1985",
  gender: "Male",
  idType: "Iqama",
  iqamaNumber: "2547896541",
  iqamaExpiryDate: "30 December 2026",
};

const profileDefaults = {
  fullName: "Dashboard User",
  nationality: "Saudi Arabia",
  dateOfBirth: "15 January 1985",
  gender: "Male",
  idType: "Iqama",
  iqamaNumber: "2547896541",
  iqamaExpiryDate: "30 December 2026",
  email: "john.manager@parkin.com.sa",
  phone: "+966 50 123 4567",
  preferredLanguage: "English",
  timeZone: "Riyadh · GMT+03:00",
  dateFormat: "DD/MM/YYYY",
};

const profileTimeZoneOptions = [
  { label: "(GMT+03:00) Riyadh", value: "Riyadh · GMT+03:00" },
  { label: "(GMT+04:00) Dubai", value: "Dubai · GMT+04:00" },
  { label: "(GMT+03:00) Kuwait", value: "Kuwait · GMT+03:00" },
  { label: "(GMT+03:00) Doha", value: "Doha · GMT+03:00" },
  { label: "(GMT+03:00) Bahrain", value: "Bahrain · GMT+03:00" },
];

let profileData = { ...profileDefaults };
let profileUser = null;
let profileEditSnapshot = null;
let profileEditHistoryState = false;
let profileSaveInProgress = false;
let profilePhotoUploadInProgress = false;
let profilePhotoPreviewUrl = "";

async function loadProfilePage() {
  const container = document.querySelector("#profile-container");

  if (!container) {
    console.error("Profile container was not found.");
    return;
  }

  if (container.dataset.loaded === "true" && container.innerHTML.trim()) {
    if (profileEditSnapshot) {
      cancelProfileEdit(container, { restoreHistory: false });
    }
    return;
  }

  try {
    container.innerHTML = `
      <section class="profile-page">
        <article class="profile-panel profile-load-state">
          <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          <p>Loading profile...</p>
        </article>
      </section>
    `;

    const response = await fetch("/pages/profile.html");

    if (!response.ok) {
      throw new Error(`Unable to load Profile page: ${response.status}`);
    }

    const canonicalProfile = await loadCurrentUserProfile();

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
    profileData = canonicalProfile.profile;
    profileUser = canonicalProfile.user;
    localStorage.removeItem("parkin_profile");
    bindProfilePage(container);
    updateReadOnlyValues(container);
    window.syncDashboardProfile?.(profileUser);
  } catch (error) {
    console.error("Unable to load Profile page:", error);
    container.dataset.loaded = "false";
    container.innerHTML = `
      <section class="profile-page">
        <article class="profile-panel profile-load-state profile-load-error">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <h2>Unable to load Profile</h2>
          <p>Please refresh the page and try again.</p>
          <button type="button" class="profile-button-primary" data-profile-retry>Try Again</button>
        </article>
      </section>
    `;

    container
      .querySelector("[data-profile-retry]")
      ?.addEventListener("click", loadProfilePage);
  }
}

function bindProfilePage(container) {
  if (container.dataset.eventsBound === "true") return;

  container.dataset.eventsBound = "true";

  container.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-profile-edit]");
    const cancelButton = event.target.closest("[data-profile-cancel]");
    const photoTrigger = event.target.closest("[data-profile-photo-trigger]");

    if (editButton) {
      enterProfileEditMode(container);
      return;
    }

    if (cancelButton) {
      cancelProfileEdit(container);
      return;
    }

    if (photoTrigger && !profilePhotoUploadInProgress) {
      container.querySelector("#profile-photo-input")?.click();
    }
  });

  container.addEventListener("change", (event) => {
    if (event.target.id !== "profile-photo-input") return;

    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) uploadProfilePhoto(container, file);
  });

  container.addEventListener("input", (event) => {
    if (!event.target.closest("[data-profile-edit-form]")) return;

    clearProfileFieldError(event.target);
    updateProfileSaveState(container);
  });

  container.addEventListener("change", (event) => {
    if (!event.target.closest("[data-profile-edit-form]")) return;

    clearProfileFieldError(event.target);
    updateProfileSaveState(container);
  });

  container.addEventListener("focusout", (event) => {
    if (event.target.matches("[data-profile-editable-field]")) {
      validateProfileField(event.target);
    }
  });

  container.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-profile-edit-form]");

    if (!form) return;

    event.preventDefault();
    saveProfileChanges(container, form);
  });
}

function enterProfileEditMode(container) {
  const page = container.querySelector(".profile-page");

  if (!page || profileEditSnapshot) return;

  profileEditSnapshot = { ...profileData };
  profileEditHistoryState = true;
  window.history.pushState({ profileEditing: true }, "", window.location.href);
  setProfileBreadcrumb(container, true);
  setProfileEditHeading(container, true);

  const panel = container.querySelector(".profile-identity-panel");

  if (!panel) return;

  panel.innerHTML = renderEditPanel();
  updateProfileSaveState(container);
  container.querySelector("#profile-edit-email")?.focus();
}

function cancelProfileEdit(container, { restoreHistory = true } = {}) {
  if (!profileEditSnapshot) return;

  profileData = { ...profileEditSnapshot };
  profileEditSnapshot = null;
  setProfileBreadcrumb(container, false);
  setProfileEditHeading(container, false);

  const panel = container.querySelector(".profile-identity-panel");

  if (panel) {
    panel.innerHTML = renderReadOnlyPanel();
    updateReadOnlyValues(container);
  }

  if (restoreHistory && profileEditHistoryState) {
    profileEditHistoryState = false;
    window.history.back();
  } else {
    profileEditHistoryState = false;
  }
}

async function saveProfileChanges(container, form) {
  if (profileSaveInProgress) return;

  const values = getFormValues(form);

  if (!validateProfileForm(form, values)) return;

  profileSaveInProgress = true;
  setProfileSaveState(container, true);

  try {
    const canonicalProfile = await updateCurrentUserProfile(values);

    profileData = canonicalProfile.profile;
    profileUser = canonicalProfile.user;
    profileEditSnapshot = null;
    localStorage.removeItem("parkin_profile");
    setProfileBreadcrumb(container, false);
    setProfileEditHeading(container, false);

    const panel = container.querySelector(".profile-identity-panel");

    if (panel) {
      panel.innerHTML = renderReadOnlyPanel();
      updateReadOnlyValues(container);
    }

    window.syncDashboardProfile?.(profileUser);

    if (profileEditHistoryState) {
      profileEditHistoryState = false;
      window.history.back();
    }

    if (typeof window.showDashboardAlert === "function") {
      window.showDashboardAlert("Profile information updated successfully.", {
        title: "Profile updated",
        type: "success",
      });
    }
  } catch (error) {
    if (typeof window.showDashboardAlert === "function") {
      window.showDashboardAlert(
        error.message || "Unable to update profile information.",
        { title: "Profile update failed", type: "error" },
      );
    }
  } finally {
    profileSaveInProgress = false;
    setProfileSaveState(container, false);
    updateProfileSaveState(container);
  }
}

async function uploadProfilePhoto(container, file) {
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  if (!allowedTypes.has(file.type)) {
    showProfilePhotoMessage("Unsupported image format. Use JPG, PNG or WebP.", "error");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showProfilePhotoMessage("Profile image must be smaller than 5 MB.", "error");
    return;
  }

  const cameraButton = container.querySelector("[data-profile-photo-trigger]");
  profilePhotoUploadInProgress = true;
  cameraButton?.classList.add("is-loading");
  cameraButton?.setAttribute("aria-busy", "true");

  const previousUser = profileUser;
  profilePhotoPreviewUrl = URL.createObjectURL(file);
  const previewUser = {
    ...profileUser,
    profile: { ...(profileUser?.profile || {}), profilePhotoUrl: profilePhotoPreviewUrl },
  };
  window.syncDashboardProfile?.(previewUser);

  try {
    const formData = new FormData();
    formData.append("photo", file);
    const response = await fetch(`${PROFILE_API_BASE_URL}/auth/me/photo`, {
      method: "POST",
      headers: getProfileAuthHeaders(),
      body: formData,
    });
    const result = await readProfileApiResponse(response);
    const canonicalProfile = normalizeApiProfile(result.data || result);

    profileData = canonicalProfile.profile;
    profileUser = canonicalProfile.user;
    window.syncDashboardProfile?.(profileUser);
    showProfilePhotoMessage("Profile photo updated successfully.", "success");
  } catch (error) {
    window.syncDashboardProfile?.(previousUser);
    showProfilePhotoMessage("Could not update profile photo. Please try again.", "error");
    console.error("Unable to update profile photo:", error);
  } finally {
    URL.revokeObjectURL(profilePhotoPreviewUrl);
    profilePhotoPreviewUrl = "";
    profilePhotoUploadInProgress = false;
    cameraButton?.classList.remove("is-loading");
    cameraButton?.removeAttribute("aria-busy");
  }
}

function showProfilePhotoMessage(message, type) {
  if (typeof window.showDashboardAlert === "function") {
    window.showDashboardAlert(message, {
      title: type === "success" ? "Profile photo updated" : "Photo upload failed",
      type,
    });
  }
}

function setProfileSaveState(container, isSaving) {
  const saveButton = container.querySelector("[data-profile-save]");

  if (!saveButton) return;

  saveButton.disabled = isSaving || saveButton.disabled;
  saveButton.classList.toggle("is-loading", isSaving);
  saveButton.querySelector("span")?.replaceChildren(
    isSaving ? "Saving..." : "Save Changes",
  );
}

function validateProfileForm(form, values) {
  let isValid = true;

  const requiredFields = [
    ["#profile-edit-full-name", "Full Name is required."],
    ["#profile-edit-nationality", "Nationality is required."],
    ["#profile-edit-dob", "Date of Birth is required."],
    ["#profile-edit-gender", "Gender is required."],
    ["#profile-edit-id-type", "ID Type is required."],
    ["#profile-edit-iqama-number", "Enter a valid Iqama number."],
    ["#profile-edit-iqama-expiry", "Iqama Expiry Date is required."],
    ["#profile-edit-language", "Preferred Language is required."],
    ["#profile-edit-time-zone", "Time Zone is required."],
    ["#profile-edit-date-format", "Date Format is required."],
  ];

  requiredFields.forEach(([selector, message]) => {
    const field = form.querySelector(selector);

    if (!field?.value.trim()) {
      showProfileFieldError(field, message);
      isValid = false;
    }
  });

  if (!isValidEmail(values.email)) {
    showProfileFieldError(
      form.querySelector("#profile-edit-email"),
      "Enter a valid email address.",
    );
    isValid = false;
  }

  if (!normalizeSaudiPhone(values.phone)) {
    showProfileFieldError(
      form.querySelector("#profile-edit-phone"),
      "Enter a valid Saudi mobile number.",
    );
    isValid = false;
  }

  if (!/^\d{10}$/.test(values.iqamaNumber)) {
    showProfileFieldError(
      form.querySelector("#profile-edit-iqama-number"),
      "Enter a valid Iqama number.",
    );
    isValid = false;
  }

  return isValid;
}

function getFormValues(form) {
  const timeZone = profileTimeZoneOptions.find(
    (option) => option.label === form.querySelector("#profile-edit-time-zone").value,
  );

  return {
    fullName: form.querySelector("#profile-edit-full-name").value.trim(),
    nationality: form.querySelector("#profile-edit-nationality").value.trim(),
    dateOfBirth: form.querySelector("#profile-edit-dob").value.trim(),
    gender: form.querySelector("#profile-edit-gender").value,
    idType: form.querySelector("#profile-edit-id-type").value,
    iqamaNumber: form.querySelector("#profile-edit-iqama-number").value.trim(),
    iqamaExpiryDate: form.querySelector("#profile-edit-iqama-expiry").value.trim(),
    email: form.querySelector("#profile-edit-email").value.trim(),
    phone: normalizeSaudiPhone(form.querySelector("#profile-edit-phone").value),
    preferredLanguage: form.querySelector("#profile-edit-language").value,
    timeZone: timeZone?.value || "",
    dateFormat: form.querySelector("#profile-edit-date-format").value,
  };
}

function updateProfileSaveState(container) {
  const form = container.querySelector("[data-profile-edit-form]");
  const saveButton = container.querySelector("[data-profile-save]");

  if (!form || !saveButton || !profileEditSnapshot) return;

  const values = getFormValues(form);
  const hasChanges =
    values.fullName !== profileEditSnapshot.fullName ||
    values.nationality !== profileEditSnapshot.nationality ||
    values.dateOfBirth !== profileEditSnapshot.dateOfBirth ||
    values.gender !== profileEditSnapshot.gender ||
    values.idType !== profileEditSnapshot.idType ||
    values.iqamaNumber !== profileEditSnapshot.iqamaNumber ||
    values.iqamaExpiryDate !== profileEditSnapshot.iqamaExpiryDate ||
    values.email !== profileEditSnapshot.email ||
    values.phone !== profileEditSnapshot.phone ||
    values.preferredLanguage !== profileEditSnapshot.preferredLanguage ||
    values.timeZone !== profileEditSnapshot.timeZone ||
    values.dateFormat !== profileEditSnapshot.dateFormat;

  saveButton.disabled = !hasChanges;
}

function validateProfileField(field) {
  if (!field.value.trim()) {
    showProfileFieldError(field, `${field.dataset.fieldLabel || "This field"} is required.`);
    return;
  }

  if (field.id === "profile-edit-email") {
    if (!isValidEmail(field.value.trim())) {
      showProfileFieldError(field, "Enter a valid email address.");
    }
  }

  if (field.id === "profile-edit-phone") {
    if (!normalizeSaudiPhone(field.value)) {
      showProfileFieldError(field, "Enter a valid Saudi mobile number.");
    }
  }

  if (field.id === "profile-edit-iqama-number" && !/^\d{10}$/.test(field.value.trim())) {
    showProfileFieldError(field, "Enter a valid Iqama number.");
  }
}

function showProfileFieldError(field, message) {
  if (!field) return;

  const error = field.form?.querySelector(`#${field.id}-error`);

  field.setAttribute("aria-invalid", "true");
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

function clearProfileFieldError(field) {
  if (!field?.id) return;

  const error = field.form?.querySelector(`#${field.id}-error`);

  field.removeAttribute("aria-invalid");

  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeSaudiPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const mobile = digits.startsWith("966")
    ? digits.slice(3)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;

  if (!/^5\d{8}$/.test(mobile)) return "";

  return `+966 ${mobile.slice(0, 2)} ${mobile.slice(2, 5)} ${mobile.slice(5)}`;
}

async function loadCurrentUserProfile() {
  const response = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
    headers: getProfileAuthHeaders(),
  });
  const result = await readProfileApiResponse(response);

  return normalizeApiProfile(result.data || result);
}

async function updateCurrentUserProfile(values) {
  const response = await fetch(`${PROFILE_API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: {
      ...getProfileAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: values.fullName,
      email: values.email,
      phoneCountryCode: "+966",
      phoneNumber: values.phone.replace(/\D/g, "").replace(/^966/, "").replace(/^0/, ""),
      preferredLanguage: values.preferredLanguage,
      timeZone: values.timeZone,
      dateFormat: values.dateFormat,
    }),
  });
  const result = await readProfileApiResponse(response);

  return normalizeApiProfile(result.data || result);
}

function getProfileAuthHeaders() {
  const token = localStorage.getItem("parkin_access_token");

  if (!token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return { Authorization: `Bearer ${token}` };
}

async function readProfileApiResponse(response) {
  let result = {};

  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw new Error(
      result.message || result.error || "Unable to load profile information.",
    );
  }

  return result;
}

function normalizeApiProfile(payload) {
  const user = payload?.user || {};
  const profile = user.profile || {};
  const phone = normalizeSaudiPhone(
    `${profile.phoneCountryCode || "+966"}${profile.phoneNumber || ""}`,
  );

  return {
    user,
    profile: {
      fullName: user.name || profileDefaults.fullName,
      nationality: profile.nationality || profileDefaults.nationality,
      dateOfBirth: formatProfileDate(profile.dateOfBirth) || profileDefaults.dateOfBirth,
      gender: profile.gender || profileDefaults.gender,
      idType: profile.idType || profileDefaults.idType,
      iqamaNumber: profile.iqamaNumber || profileDefaults.iqamaNumber,
      iqamaExpiryDate: formatProfileDate(profile.iqamaExpiryDate) || profileDefaults.iqamaExpiryDate,
      email: user.email || profileDefaults.email,
      phone: phone || profileDefaults.phone,
      preferredLanguage: profile.preferredLanguage || profileDefaults.preferredLanguage,
      timeZone: profile.timeZone || profileDefaults.timeZone,
      dateFormat: profile.dateFormat || profileDefaults.dateFormat,
      profilePhotoUrl: profile.profilePhotoUrl || "",
    },
  };
}

function formatProfileDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function updateReadOnlyValues(container) {
  const values = {
    "#profile-full-name": profileData.fullName,
    "#profile-nationality": profileData.nationality,
    "#profile-dob": profileData.dateOfBirth,
    "#profile-gender": profileData.gender,
    "#profile-id-type": profileData.idType,
    "#profile-iqama-number": profileData.iqamaNumber,
    "#profile-iqama-expiry": profileData.iqamaExpiryDate,
    "#profile-email": profileData.email,
    "#profile-phone": profileData.phone,
    "#profile-language": profileData.preferredLanguage,
    "#profile-timezone": profileData.timeZone,
    "#profile-date-format": profileData.dateFormat,
  };

  Object.entries(values).forEach(([selector, value]) => {
    const field = container.querySelector(selector);

    if (!field) return;

    if (field instanceof HTMLSelectElement && ![...field.options].some((option) => option.value === value)) {
      field.innerHTML = `<option>${escapeProfileHtml(value)}</option>`;
    }

    field.value = value;
  });

  [
    ["#profile-email", profileData.email, profileDefaults.email],
    ["#profile-phone", profileData.phone, profileDefaults.phone],
  ].forEach(([selector, value, defaultValue]) => {
    const field = container.querySelector(selector);
    const badge = field?.closest(".profile-field")?.querySelector(".profile-verified");

    if (!badge) return;

    const verified = value === defaultValue;
    badge.textContent = verified ? "✓ Verified" : "Verification required";
    badge.classList.toggle("is-pending", !verified);
  });
}

function setProfileEditHeading(container, isEditing) {
  const heading = container.querySelector("[data-profile-edit-heading]");

  if (!heading) return;

  heading.hidden = !isEditing;
  heading.innerHTML = isEditing
    ? `<h1>Edit Personal Information</h1><p>Update your personal details. Changes you make will be saved across the dashboard.</p>`
    : "";
}

function setProfileBreadcrumb(container, isEditing) {
  const breadcrumb = container.querySelector(".profile-breadcrumb");

  if (!breadcrumb) return;

  breadcrumb.innerHTML = isEditing
    ? `
      <a href="#dashboard">Home</a>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <span>My Profile</span>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <span>Personal Information</span>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <strong>Edit</strong>
    `
    : `
      <a href="#dashboard">Home</a>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <span>My Profile</span>
      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      <strong>Personal Information</strong>
    `;
}

function renderOptions(options, selected) {
  return options
    .map(
      (option) =>
        `<option ${option === selected ? "selected" : ""}>${escapeProfileHtml(option)}</option>`,
    )
    .join("");
}

function renderReadOnlyPanel() {
  return `
    <header class="profile-identity-heading">
      <div>
        <h2 id="profile-identity-heading">Identity</h2>
      </div>
      <button class="profile-edit-button" type="button" data-profile-edit aria-pressed="false">
        <i class="fa-solid fa-pencil" aria-hidden="true"></i>
        <span>Edit</span>
      </button>
    </header>
    <form class="profile-identity-form" data-profile-form>
      <div class="profile-identity-matrix">
        ${renderReadOnlyField("Full Name", "profile-full-name", profileHrData.fullName)}
        <div class="profile-field">
          <label for="profile-email">Email Address</label>
          <div class="profile-field-control profile-verified-control">
            <input id="profile-email" value="${escapeProfileHtml(profileData.email)}" readonly />
            <span class="profile-verified">✓ Verified</span>
          </div>
        </div>
        <div class="profile-field">
          <label for="profile-phone">Phone Number</label>
          <div class="profile-field-control profile-verified-control">
            <input id="profile-phone" value="${escapeProfileHtml(profileData.phone)}" readonly />
            <span class="profile-verified">✓ Verified</span>
          </div>
        </div>
        ${renderReadOnlyField("Nationality", "profile-nationality", profileHrData.nationality)}
        ${renderReadOnlyField("Date of Birth", "profile-dob", profileHrData.dateOfBirth)}
        ${renderReadOnlyField("Gender", "profile-gender", profileHrData.gender)}
        ${renderReadOnlyField("ID Type", "profile-id-type", profileHrData.idType)}
        ${renderReadOnlyField("Iqama Number", "profile-iqama-number", profileHrData.iqamaNumber)}
        <div class="profile-field profile-expiry-field">
          <label for="profile-iqama-expiry">Iqama Expiry Date</label>
          <div class="profile-field-control">
            <input id="profile-iqama-expiry" value="${escapeProfileHtml(profileHrData.iqamaExpiryDate)}" readonly />
            <i class="fa-regular fa-calendar" aria-hidden="true"></i>
          </div>
        </div>
        ${renderReadOnlyField("Preferred Language", "profile-language", profileData.preferredLanguage, "select")}
        ${renderReadOnlyField("Time Zone", "profile-timezone", profileData.timeZone, "select")}
        ${renderReadOnlyField("Date Format", "profile-date-format", profileData.dateFormat, "select")}
      </div>
      <div class="profile-identity-notice">
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        <p>Name, date of birth and ID details come from HR records.<br />To correct them, raise a request with your Administrator.</p>
      </div>
    </form>
  `;
}

function renderReadOnlyField(label, id, value, element = "input") {
  const control = element === "select"
    ? "<option>" + escapeProfileHtml(value) + "</option>"
    : "";

  return `
    <div class="profile-field">
      <label for="${id}">${label}</label>
      <${element} id="${id}" value="${escapeProfileHtml(value)}" ${element === "select" ? "disabled" : "readonly"}>${control}</${element}>
    </div>
  `;
}

function renderEditPanel() {
  return `
    <header class="profile-edit-heading">
      <h2>Personal Information</h2>
      <div class="profile-edit-panel-actions">
        <button class="profile-cancel-button" type="button" data-profile-cancel>Cancel</button>
        <button class="profile-save-button" type="submit" form="profile-edit-form" data-profile-save>
          <i class="fa-solid fa-check" aria-hidden="true"></i>
          <span>Save Changes</span>
        </button>
      </div>
    </header>
    <form id="profile-edit-form" class="profile-edit-form" data-profile-edit-form novalidate>
      <section class="profile-edit-section">
        <h3 class="profile-edit-section-title">Basic Information</h3>
        <div class="profile-edit-fields profile-edit-fields--three">
          ${renderEditInput("Full Name", "profile-edit-full-name", profileData.fullName, "text", "Full Name")}
          ${renderEditInput("Email Address", "profile-edit-email", profileData.email, "email", "Email Address", "Used for account notifications and administrative communication.", true, "", true)}
          ${renderPhoneField()}
          ${renderEditSelect("Nationality", "profile-edit-nationality", ["Saudi Arabia", "United Arab Emirates", "Kuwait", "Bahrain", "Qatar"], profileData.nationality)}
          ${renderEditInput("Date of Birth", "profile-edit-dob", profileData.dateOfBirth, "text", "Date of Birth", "", true, "calendar")}
          ${renderEditSelect("Gender", "profile-edit-gender", ["Male", "Female"], profileData.gender)}
        </div>
      </section>

      <section class="profile-edit-section">
        <h3 class="profile-edit-section-title">Identification</h3>
        <div class="profile-edit-fields profile-edit-fields--three">
          ${renderEditSelect("ID Type", "profile-edit-id-type", ["Iqama", "Passport"], profileData.idType)}
          ${renderEditInput("Iqama Number", "profile-edit-iqama-number", profileData.iqamaNumber, "text", "Iqama Number", "", true)}
          ${renderEditInput("Iqama Expiry Date", "profile-edit-iqama-expiry", profileData.iqamaExpiryDate, "text", "Iqama Expiry Date", "", true, "calendar")}
        </div>
        <div class="profile-edit-inline-notice">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          <span>ID details are verified with official records.</span>
        </div>
      </section>

      <section class="profile-edit-section profile-edit-section--preferences">
        <h3 class="profile-edit-section-title">Preferences</h3>
        <div class="profile-edit-fields profile-edit-fields--three">
          ${renderEditSelect("Preferred Language", "profile-edit-language", ["English", "العربية"], profileData.preferredLanguage)}
          ${renderEditSelect("Time Zone", "profile-edit-time-zone", profileTimeZoneOptions.map((option) => option.label), getTimeZoneLabel(profileData.timeZone))}
          ${renderEditSelect("Date Format", "profile-edit-date-format", ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"], profileData.dateFormat)}
        </div>
      </section>

      <aside class="profile-admin-notice">
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
        <span>Some of your information is managed by the administrator and cannot be changed.<br />To update restricted information, please contact your administrator.</span>
      </aside>
    </form>
  `;
}

function renderEditInput(label, id, value, type = "text", fieldLabel = label, helper = "", required = true, icon = "", verified = false) {
  const isVerified = verified && value === profileDefaults.email;

  return `
    <label class="profile-edit-field" for="${id}">
      <span>${label}${required ? ' <b aria-hidden="true">*</b>' : ""}</span>
      <span class="profile-edit-control${icon ? " has-icon" : ""}">
        <input id="${id}" type="${type}" value="${escapeProfileHtml(value)}" data-profile-editable-field data-field-label="${fieldLabel}" required aria-describedby="${id}-error" />
        ${icon ? '<i class="fa-regular fa-calendar" aria-hidden="true"></i>' : ""}
      </span>
      ${verified ? `<span class="profile-edit-verified${isVerified ? "" : " is-pending"}">${isVerified ? "✓ Verified" : "Verification required"}</span>` : ""}
      ${helper ? `<small>${helper}</small>` : ""}
      <em id="${id}-error" class="profile-field-error" role="alert" hidden></em>
    </label>
  `;
}

function renderEditSelect(label, id, options, selected) {
  return `
    <label class="profile-edit-field" for="${id}">
      <span>${label} <b aria-hidden="true">*</b></span>
      <span class="profile-edit-control has-chevron">
        <select id="${id}" data-profile-editable-field data-field-label="${label}" required>${renderOptions(options, selected)}</select>
      </span>
      <em id="${id}-error" class="profile-field-error" role="alert" hidden></em>
    </label>
  `;
}

function renderPhoneField() {
  const phoneVerified = profileData.phone === profileDefaults.phone;

  return `
    <label class="profile-edit-field" for="profile-edit-phone">
      <span>Phone Number <b aria-hidden="true">*</b></span>
      <span class="profile-phone-control">
        <span class="profile-phone-country"><span aria-hidden="true">&#x1F1F8;&#x1F1E6;</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></span>
        <span class="profile-phone-code">+966</span>
        <input id="profile-edit-phone" type="tel" inputmode="tel" value="${escapeProfileHtml(formatSaudiLocalPhone(profileData.phone))}" data-profile-editable-field data-field-label="Phone Number" required aria-describedby="profile-edit-phone-error" />
      </span>
      <span class="profile-phone-verified${phoneVerified ? "" : " is-pending"}">${phoneVerified ? "✓ Verified" : "Verification required"}</span>
      <em id="profile-edit-phone-error" class="profile-field-error" role="alert" hidden></em>
    </label>
  `;
}

function getTimeZoneLabel(value) {
  return profileTimeZoneOptions.find((option) => option.value === value)?.label || profileTimeZoneOptions[0].label;
}

function formatSaudiLocalPhone(value) {
  const normalized = normalizeSaudiPhone(value);
  const mobile = normalized.replace("+966 ", "");
  return mobile;
}

function renderReadOnlyEditField(label, value, isExpiry = false) {
  return `
    <div class="profile-hr-field${isExpiry ? " is-expiry" : ""}">
      <span>${escapeProfileHtml(label)}</span>
      <strong>${escapeProfileHtml(value)}</strong>
      ${isExpiry ? '<i class="fa-regular fa-calendar" aria-hidden="true"></i>' : ""}
    </div>
  `;
}

function escapeProfileHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("popstate", () => {
  const container = document.querySelector("#profile-container");

  if (profileEditSnapshot && container) {
    cancelProfileEdit(container, { restoreHistory: false });
  }
});

window.addEventListener("hashchange", () => {
  if (window.location.hash !== "#profile") {
    const container = document.querySelector("#profile-container");

    if (profileEditSnapshot && container) {
      cancelProfileEdit(container, { restoreHistory: false });
    } else {
      profileEditHistoryState = false;
    }
  }
});

window.loadProfilePage = loadProfilePage;
