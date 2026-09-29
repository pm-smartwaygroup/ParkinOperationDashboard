const userManagementAddState = {
  initialized: false,
  loading: false,
  submitting: false,
  dirty: false,
  companies: [],
  locations: [],
  createdUserId: null,
  createdEmail: "",
  inviteFailed: false,
  companyRequest: null,
  locationRequest: null,
};

function userManagementAddAuthHeaders(json = false) {
  const token = localStorage.getItem("parkin_access_token");
  if (!token)
    throw new Error("Your login session has expired. Please sign in again.");
  return json
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${token}` };
}

function userManagementAddCoreApiBaseUrl() {
  return window.PARKIN_CONFIG?.apiBaseUrl || "https://api.parkin.com.sa";
}

async function userManagementAddResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("User request failed");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body?.data ?? body;
}

function userManagementAddCollection(value) {
  if (Array.isArray(value)) return value;
  return value?.items || value?.data?.items || value?.data || [];
}

function userManagementAddCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("parkin_user") || "null") || {};
  } catch {
    return {};
  }
}

function userManagementAddField(form, name) {
  return form.elements.namedItem(name);
}

function userManagementAddValue(form, name) {
  return String(userManagementAddField(form, name)?.value || "").trim();
}

function userManagementAddSelectedLocations(form) {
  return Array.from(
    userManagementAddField(form, "locationIds")?.selectedOptions || [],
  )
    .map((option) => option.value)
    .filter(Boolean);
}

function userManagementAddSetError(form, name, message = "") {
  const field = userManagementAddField(form, name);
  const error = form.querySelector(`[data-error-for="${name}"]`);
  field?.toggleAttribute("aria-invalid", Boolean(message));
  if (error) error.textContent = message;
}

function userManagementAddClearErrors(form) {
  form.querySelectorAll("[data-error-for]").forEach((element) => {
    element.textContent = "";
  });
  form.querySelectorAll('[aria-invalid="true"]').forEach((element) => {
    element.removeAttribute("aria-invalid");
  });
}

function userManagementAddDisplayError(container, message) {
  const feedback = container.querySelector("[data-user-add-feedback]");
  if (!feedback) return;
  feedback.className = "user-management-add-feedback error";
  feedback.textContent = message;
}

function userManagementAddClearFeedback(container) {
  const feedback = container.querySelector("[data-user-add-feedback]");
  if (!feedback) return;
  feedback.className = "user-management-add-feedback hidden";
  feedback.textContent = "";
}

function userManagementAddCompanyIdForRequester() {
  const user = userManagementAddCurrentUser();
  return user.role === "COMPANY_ADMIN" ? String(user.companyId || "") : "";
}

function userManagementAddRenderCompanies(container) {
  const form = container.querySelector("[data-user-add-form]");
  const select = userManagementAddField(form, "companyId");
  if (!select) return;
  const requesterCompanyId = userManagementAddCompanyIdForRequester();
  const current = select.value;
  select.replaceChildren(new Option("Select company", ""));
  userManagementAddState.companies
    .filter((company) =>
      company.status
        ? String(company.status).toUpperCase() === "ACTIVE"
        : company.isActive !== false,
    )
    .forEach((company) => {
      const option = new Option(company.name || "Unnamed company", company.id);
      option.textContent = company.name || "Unnamed company";
      select.append(option);
    });
  if (requesterCompanyId) {
    select.value = requesterCompanyId;
    select.disabled = true;
  } else {
    select.value =
      current &&
      userManagementAddState.companies.some((item) => item.id === current)
        ? current
        : "";
  }
}

function userManagementAddRenderLocations(container) {
  const form = container.querySelector("[data-user-add-form]");
  const select = userManagementAddField(form, "locationIds");
  if (!select) return;
  const companyId = userManagementAddValue(form, "companyId");
  const selected = new Set(userManagementAddSelectedLocations(form));
  const locations = userManagementAddState.locations.filter((location) => {
    if (location.deletedAt || location.isDeleted === true) return false;
    const locationCompanyId = location.companyId || location.company?.id;
    return companyId && locationCompanyId
      ? String(locationCompanyId) === companyId
      : false;
  });
  select.replaceChildren();
  locations.forEach((location) => {
    const option = new Option(location.name || "Unnamed location", location.id);
    option.textContent = location.name || "Unnamed location";
    option.selected = selected.has(String(location.id));
    select.append(option);
  });
  if (!locations.length) {
    select.append(
      new Option(
        companyId ? "No locations available" : "Select a company first",
        "",
      ),
    );
    select.disabled = true;
  } else {
    select.disabled = false;
  }
}

function userManagementAddClearLocations(form) {
  Array.from(
    userManagementAddField(form, "locationIds")?.options || [],
  ).forEach((option) => {
    option.selected = false;
  });
}

function userManagementAddUpdateLocationVisibility(container) {
  const form = container.querySelector("[data-user-add-form]");
  const wrap = container.querySelector("[data-user-add-location-wrap]");
  const visible = userManagementAddValue(form, "accessScope") === "LOCATION";
  wrap?.classList.toggle("hidden", !visible);
  if (visible) userManagementAddRenderLocations(container);
}

function userManagementAddUpdatePreview(container) {
  const form = container.querySelector("[data-user-add-form]");
  const role = userManagementAddValue(form, "role");
  const scope = userManagementAddValue(form, "accessScope");
  const company = userManagementAddState.companies.find(
    (item) => String(item.id) === userManagementAddValue(form, "companyId"),
  );
  const locations = userManagementAddSelectedLocations(form);
  const password = userManagementAddValue(form, "password");
  const confirmPassword = userManagementAddValue(form, "confirmPassword");
  container.querySelector("[data-preview-role]").textContent =
    userManagementRoleLabel(role) || "—";
  container.querySelector("[data-preview-scope]").textContent =
    userManagementScopeLabel(scope) || "—";
  container.querySelector("[data-preview-company]").textContent =
    company?.name || "—";
  container.querySelector("[data-preview-locations]").textContent =
    scope === "LOCATION"
      ? `${locations.length} selected`
      : "All company locations";
}

function userManagementAddUpdatePasswordRules(container) {
  const form = container.querySelector("[data-user-add-form]");
  if (!form) return;

  const password = userManagementAddValue(form, "password");
  const confirmPassword =
    userManagementAddValue(form, "confirmPassword");

  const rules = {
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    number: /[0-9]/.test(password),
  };

  Object.entries(rules).forEach(([name, met]) => {
    container
      .querySelector(`[data-user-password-rule="${name}"]`)
      ?.classList.toggle("is-met", met);
  });

  const passwordValid =
    rules.length &&
    rules.letter &&
    rules.number;

  if (passwordValid) {
    const passwordError =
      form.querySelector('[data-error-for="password"]');

    if (passwordError) {
      passwordError.textContent = "";
    }
  }

  if (
    confirmPassword &&
    password === confirmPassword
  ) {
    const confirmError =
      form.querySelector('[data-error-for="confirmPassword"]');

    if (confirmError) {
      confirmError.textContent = "";
    }
  }
}

function userManagementAddValidate(container) {
  const form = container.querySelector("[data-user-add-form]");
  userManagementAddClearErrors(form);
  let valid = true;
  const firstName = userManagementAddValue(form, "firstName");
  const lastName = userManagementAddValue(form, "lastName");
  const email = userManagementAddValue(form, "email").toLowerCase();
  const role = userManagementAddValue(form, "role");
  const companyId = userManagementAddValue(form, "companyId");
  const scope = userManagementAddValue(form, "accessScope");
  const locations = userManagementAddSelectedLocations(form);
  const password = userManagementAddValue(form, "password");
  const confirmPassword =
    userManagementAddValue(form, "confirmPassword");

  if (!firstName) {
    userManagementAddSetError(form, "firstName", "First name is required.");
    valid = false;
  }
  if (!lastName) {
    userManagementAddSetError(form, "lastName", "Last name is required.");
    valid = false;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    userManagementAddSetError(form, "email", "Enter a valid email address.");
    valid = false;
  }
  if (
    ![
      "COMPANY_ADMIN",
      "OPERATIONS_MANAGER",
      "VALET_OPERATIONS",
      "SUPPORT",
      "DRIVER",
    ].includes(role)
  ) {
    userManagementAddSetError(form, "role", "Select a valid role.");
    valid = false;
  }
  if (!companyId) {
    userManagementAddSetError(form, "companyId", "Company is required.");
    valid = false;
  }
  if (!["COMPANY", "LOCATION", "OWN"].includes(scope)) {
    userManagementAddSetError(
      form,
      "accessScope",
      "Select a valid access scope.",
    );
    valid = false;
  }
  if (scope === "LOCATION" && !locations.length) {
    userManagementAddSetError(
      form,
      "locationIds",
      "Select at least one location.",
    );
    valid = false;
  }
  if (!password) {
    userManagementAddSetError(form, "password", "Initial password is required.");
    valid = false;
  } else if (password.length < 8) {
    userManagementAddSetError(
      form,
      "password",
      "Password must be at least 8 characters.",
    );
    valid = false;
  } else if (!/[A-Za-z]/.test(password)) {
    userManagementAddSetError(
      form,
      "password",
      "Password must contain at least one letter.",
    );
    valid = false;
  } else if (!/[0-9]/.test(password)) {
    userManagementAddSetError(
      form,
      "password",
      "Password must contain at least one number.",
    );
    valid = false;
  }

  if (!confirmPassword) {
    userManagementAddSetError(
      form,
      "confirmPassword",
      "Confirm the initial password.",
    );
    valid = false;
  } else if (password !== confirmPassword) {
    userManagementAddSetError(
      form,
      "confirmPassword",
      "Passwords do not match.",
    );
    valid = false;
  }

  const phone = userManagementAddValue(form, "phoneNumber").replace(/\D/g, "");
  if (phone && !(phone.length === 9 && phone.startsWith("5"))) {
    userManagementAddSetError(
      form,
      "phoneNumber",
      "Enter a Saudi mobile number, such as 50 123 4567.",
    );
    valid = false;
  }
  return valid;
}

function userManagementAddPayload(container) {
  const form = container.querySelector("[data-user-add-form]");
  const payload = {
    name: `${userManagementAddValue(form, "firstName")} ${userManagementAddValue(form, "lastName")}`.trim(),
    email: userManagementAddValue(form, "email").toLowerCase(),
    role: userManagementAddValue(form, "role"),
    companyId: userManagementAddValue(form, "companyId"),
    accessScope: userManagementAddValue(form, "accessScope"),
    password: userManagementAddValue(form, "password"),
    confirmPassword: userManagementAddValue(form, "confirmPassword"),
  };
  const optional = {
    employeeId: userManagementAddValue(form, "employeeId"),
    department: userManagementAddValue(form, "department"),
    region: userManagementAddValue(form, "region"),
  };
  Object.entries(optional).forEach(([key, value]) => {
    if (value) payload[key] = value;
  });
  const phone = userManagementAddValue(form, "phoneNumber").replace(/\D/g, "");
  if (phone) {
    payload.phoneCountryCode = "+966";
    payload.phoneNumber = phone;
  }
  if (payload.accessScope === "LOCATION")
    payload.locationIds = userManagementAddSelectedLocations(form);
  return payload;
}

function userManagementAddCreatedUserId(result) {
  return (
    result?.user?.id ||
    result?.data?.user?.id ||
    result?.data?.data?.user?.id ||
    result?.data?.id ||
    result?.id ||
    null
  );
}

function userManagementAddErrorMessage(error) {
  if (error?.status === 401)
    return "Your session has expired. Please sign in again.";
  if (error?.status === 403)
    return "You do not have permission to create this user.";
  if (error?.status === 409)
    return "A user with this email address already exists.";
  if (error?.status === 400)
    return error?.message || "Please review the highlighted fields and try again.";
  return "Unable to create user. Please try again.";
}

async function userManagementAddSubmit(container) {
  if (userManagementAddState.submitting) return;

  userManagementAddState.submitting = true;

  const form = container.querySelector("[data-user-add-form]");
  const submit = container.querySelector("[data-user-add-submit]");
  const reset = container.querySelector("[data-user-add-reset]");
  const label = submit.querySelector("span");

  submit.disabled = true;
  reset.disabled = true;
  userManagementAddClearFeedback(container);

  try {
    label.textContent = "Creating User...";

    const response = await fetch(`${getUserManagementApiBaseUrl()}/users`, {
      method: "POST",
      headers: userManagementAddAuthHeaders(true),
      body: JSON.stringify(userManagementAddPayload(container)),
    });

    const result = await userManagementAddResponse(response);
    const createdUserId = userManagementAddCreatedUserId(result);

    if (!createdUserId) {
      throw new Error("The created user could not be identified.");
    }

    userManagementAddState.createdUserId = createdUserId;
    userManagementAddState.createdEmail =
      userManagementAddValue(form, "email");
    userManagementAddState.dirty = false;

    window.showDashboardAlert?.(
      "User created successfully. The account is active and ready to sign in.",
      {
        title: "User created",
        type: "success",
      },
    );

    window.location.hash = "user-management";
  } catch (error) {
    userManagementAddDisplayError(
      container,
      userManagementAddErrorMessage(error),
    );
  } finally {
    userManagementAddState.submitting = false;
    submit.disabled = false;
    reset.disabled = false;
    label.textContent = "Create User";
  }
}

function userManagementAddConfirmDiscard(container, action) {
  if (!userManagementAddState.dirty) {
    action();
    return;
  }
  window.showDashboardAlert?.("Discard unsaved user information?", {
    title: "Unsaved user information",
    type: "warning",
    buttonText: "Discard",
    cancelButtonText: "Continue Editing",
    onConfirm: action,
  });
}

function userManagementAddApplyRolePolicy(container) {
  const roleSelect = userManagementAddField(
    container.querySelector("[data-user-add-form]"),
    "role",
  );
  const requester = userManagementAddCurrentUser();
  const isSuperAdmin = requester.role === "SUPER_ADMIN";
  Array.from(roleSelect?.options || []).forEach((option) => {
    if (option.value) {
      option.hidden = option.value === "COMPANY_ADMIN" && !isSuperAdmin;
    }
  });
  if (!isSuperAdmin && roleSelect?.value === "COMPANY_ADMIN") {
    roleSelect.value = "";
  }
}

function userManagementAddReset(container) {
  const form = container.querySelector("[data-user-add-form]");
  form.reset();
  userManagementAddState.dirty = false;
  userManagementAddState.inviteFailed = false;
  userManagementAddClearErrors(form);
  userManagementAddClearFeedback(container);
  userManagementAddRenderCompanies(container);
  userManagementAddUpdateLocationVisibility(container);
  userManagementAddUpdatePreview(container);
  userManagementAddUpdatePasswordRules(container);
}

async function userManagementAddLoadOptions(container) {
  userManagementAddState.companyRequest?.abort();
  userManagementAddState.locationRequest?.abort();
  const companyController = new AbortController();
  const locationController = new AbortController();
  userManagementAddState.companyRequest = companyController;
  userManagementAddState.locationRequest = locationController;
  try {
    const [companiesResponse, locationsResponse] = await Promise.all([
      fetch(`${userManagementAddCoreApiBaseUrl()}/companies?page=1&limit=100`, {
        headers: userManagementAddAuthHeaders(),
        signal: companyController.signal,
      }),
      fetch(`${userManagementAddCoreApiBaseUrl()}/locations?page=1&limit=100`, {
        headers: userManagementAddAuthHeaders(),
        signal: locationController.signal,
      }),
    ]);
    const [companies, locations] = await Promise.all([
      userManagementAddResponse(companiesResponse),
      userManagementAddResponse(locationsResponse),
    ]);
    userManagementAddState.companies = userManagementAddCollection(companies);
    userManagementAddState.locations = userManagementAddCollection(locations);
    userManagementAddApplyRolePolicy(container);
    userManagementAddRenderCompanies(container);
    userManagementAddUpdateLocationVisibility(container);
    userManagementAddUpdatePreview(container);
  } catch (error) {
    if (error?.name !== "AbortError")
      userManagementAddDisplayError(
        container,
        "Unable to load companies and locations. Please try again.",
      );
  }
}

function bindUserManagementAddPage(container) {
  const form = container.querySelector("[data-user-add-form]");
  if (!form || form.dataset.eventsBound === "true") return;
  form.dataset.eventsBound = "true";
  form.addEventListener("input", (event) => {
    userManagementAddState.dirty = true;
    userManagementAddClearFeedback(container);

    const fieldName = event.target?.name;
    if (fieldName) {
      const fieldError = form.querySelector(
        `[data-error-for="${fieldName}"]`,
      );
      if (fieldError) fieldError.textContent = "";
    }

    if (
      fieldName === "password" ||
      fieldName === "confirmPassword"
    ) {
      const password = userManagementAddValue(form, "password");
      const confirmPassword =
        userManagementAddValue(form, "confirmPassword");

      if (
        password.length >= 8 &&
        /[A-Za-z]/.test(password) &&
        /[0-9]/.test(password)
      ) {
        const passwordError =
          form.querySelector('[data-error-for="password"]');
        if (passwordError) passwordError.textContent = "";
      }

      if (confirmPassword && password === confirmPassword) {
        const confirmError =
          form.querySelector('[data-error-for="confirmPassword"]');
        if (confirmError) confirmError.textContent = "";
      }
    }

    userManagementAddUpdatePreview(container);
    userManagementAddUpdatePasswordRules(container);
  });
  form.addEventListener("change", (event) => {
    userManagementAddState.dirty = true;
    userManagementAddUpdatePasswordRules(container);
    if (event.target.name === "companyId") {
      userManagementAddClearLocations(form);
      userManagementAddRenderLocations(container);
    }
    if (event.target.name === "accessScope") {
      if (event.target.value !== "LOCATION")
        userManagementAddClearLocations(form);
      userManagementAddUpdateLocationVisibility(container);
    }
    userManagementAddUpdatePreview(container);
  });
  form.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-user-add-password-toggle]");
    if (!toggle) return;

    const fieldName = toggle.dataset.userAddPasswordToggle;
    const input = userManagementAddField(form, fieldName);

    if (!input) return;

    const showing = input.type === "text";
    input.type = showing ? "password" : "text";

    toggle.setAttribute(
      "aria-label",
      showing ? "Show password" : "Hide password",
    );

    const icon = toggle.querySelector("i");
    if (icon) {
      icon.className = showing
        ? "fa-solid fa-eye"
        : "fa-solid fa-eye-slash";
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (userManagementAddValidate(container))
      void userManagementAddSubmit(container);
  });
  container
    .querySelector("[data-user-add-reset]")
    .addEventListener("click", () =>
      userManagementAddConfirmDiscard(container, () =>
        userManagementAddReset(container),
      ),
    );
  container
    .querySelector("[data-user-add-cancel]")
    .addEventListener("click", (event) => {
      event.preventDefault();
      userManagementAddConfirmDiscard(container, () => {
        window.location.hash = "user-management";
      });
    });
  container.addEventListener("click", (event) => {
    if (event.target.closest("[data-user-add-retry-invite]"))
      void userManagementAddSubmit(container, true);
  });
  userManagementAddUpdatePasswordRules(container);

  // Browsers/password managers may populate credentials after page render
  // without dispatching a normal input event.
  window.setTimeout(
    () => userManagementAddUpdatePasswordRules(container),
    150,
  );
  window.setTimeout(
    () => userManagementAddUpdatePasswordRules(container),
    600,
  );

  window.onbeforeunload = (event) => {
    if (userManagementAddState.dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
}

function cancelUserManagementAddRequests() {
  userManagementAddState.companyRequest?.abort();
  userManagementAddState.locationRequest?.abort();
  if (window.location.hash !== "#user-management/add")
    window.onbeforeunload = null;
}

async function loadUserManagementAddPage() {
  const container = document.querySelector("#user-management-add-container");
  if (!container) return;
  if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
    const response = await fetch("/pages/user-management-add.html");
    if (!response.ok) throw new Error("Unable to load Add New User page.");
    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }
  bindUserManagementAddPage(container);
  if (
    !userManagementAddState.initialized ||
    !userManagementAddState.companies.length
  ) {
    userManagementAddState.initialized = true;
    await userManagementAddLoadOptions(container);
  } else {
    userManagementAddRenderCompanies(container);
    userManagementAddUpdateLocationVisibility(container);
    userManagementAddUpdatePreview(container);
  }
}

window.loadUserManagementAddPage = loadUserManagementAddPage;
window.cancelUserManagementAddRequests = cancelUserManagementAddRequests;
