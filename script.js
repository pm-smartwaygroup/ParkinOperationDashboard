const translations = {
  en: {
    heroLineOne: "Smart Parking.",
    heroLineTwo: "Smarter <strong>Operations.</strong>",
    heroDescription: "Manage Valet, Rental and Event parking operations seamlessly.",
    valetTitle: "Valet Parking",
    valetDescription: "Real-time valet requests and driver management",
    rentalTitle: "Rental Parking",
    rentalDescription: "Monitor occupancy and optimize parking spaces",
    eventTitle: "Event Management",
    eventDescription: "Handle events, bookings and guest parking effortlessly",
    welcomeTitle: "Welcome back",
    welcomeDescription: "Sign in to access your Parkin dashboard",
    emailLabel: "Email address",
    emailPlaceholder: "Enter your email address",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    forgotPassword: "Forgot password?",
    rememberMe: "Remember me",
    signIn: "Sign in",
    securityCopy: "Secure. Reliable. Built for the future.",
    copyright: "© 2026 Parkin. All rights reserved.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    emailRequired: "Enter your email address.",
    emailInvalid: "Enter a valid email address, such as name@example.com.",
    passwordRequired: "Enter your password.",
    passwordShort: "Password must contain at least 8 characters.",
    validationSuccess: "Validation passed. Opening dashboard…",
  },
  ar: {
    heroLineOne: "مواقف ذكية.",
    heroLineTwo: "عمليات <strong>أكثر ذكاءً.</strong>",
    heroDescription: "أدر خدمات صف السيارات والتأجير ومواقف الفعاليات بكل سلاسة.",
    valetTitle: "صف السيارات",
    valetDescription: "طلبات فورية وإدارة متكاملة للسائقين",
    rentalTitle: "تأجير المواقف",
    rentalDescription: "راقب الإشغال وحسّن الاستفادة من المساحات",
    eventTitle: "إدارة الفعاليات",
    eventDescription: "أدر الفعاليات والحجوزات ومواقف الضيوف بسهولة",
    welcomeTitle: "مرحباً بعودتك",
    welcomeDescription: "سجّل الدخول للوصول إلى لوحة تحكم باركن",
    emailLabel: "البريد الإلكتروني",
    emailPlaceholder: "أدخل بريدك الإلكتروني",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    forgotPassword: "نسيت كلمة المرور؟",
    rememberMe: "تذكرني",
    signIn: "تسجيل الدخول",
    securityCopy: "آمن. موثوق. صُمم للمستقبل.",
    copyright: "© 2026 باركن. جميع الحقوق محفوظة.",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    emailRequired: "أدخل بريدك الإلكتروني.",
    emailInvalid: "أدخل بريداً إلكترونياً صحيحاً مثل name@example.com.",
    passwordRequired: "أدخل كلمة المرور.",
    passwordShort: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
    validationSuccess: "تم التحقق من البيانات. جارٍ فتح لوحة التحكم…",
  },
};

const loginPage = document.querySelector("#login-page");
const dashboardPage = document.querySelector("#dashboard-page");
const dashboardMain = document.querySelector(".dashboard-main");
const dashboardLogout = document.querySelector("#dashboard-logout");
const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const emailShell = document.querySelector("#email-shell");
const passwordShell = document.querySelector("#password-shell");
const emailError = document.querySelector("#email-error");
const passwordError = document.querySelector("#password-error");
const passwordToggle = document.querySelector("#password-toggle");
const languageSelect = document.querySelector("#language");
const submitButton = document.querySelector("#sign-in-button");
const formStatus = document.querySelector("#form-status");
const loginLoader = document.querySelector("#login-loader");

const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3001"
    : `http://${window.location.hostname}:3001`;

let authSocket = null;

let currentLanguage = "en";
let submitAttempted = false;
let submitTimer;

let sessionMonitor = null;
let isManualLogout = false;

function startSessionMonitor() {
  stopSessionMonitor();

  sessionMonitor = setInterval(() => {
    checkSession();
  }, 5000); // every 30 seconds
}

function stopSessionMonitor() {
  if (sessionMonitor) {
    clearInterval(sessionMonitor);
    sessionMonitor = null;
  }
}

const getCopy = (key) => translations[currentLanguage][key];

function updateLanguage(language) {
  currentLanguage = translations[language] ? language : "en";
  const isArabic = currentLanguage === "ar";

  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = isArabic ? "rtl" : "ltr";

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    element.innerHTML = getCopy(key);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = getCopy(element.dataset.i18nPlaceholder);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const isPasswordVisible = passwordInput.type === "text";
    const key = isPasswordVisible ? "hidePassword" : element.dataset.i18nAriaLabel;
    element.setAttribute("aria-label", getCopy(key));
  });

  if (submitAttempted) {
    validateForm();
  }

  if (formStatus.classList.contains("is-visible")) {
    formStatus.textContent = getCopy("validationSuccess");
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);
}

function setFieldState(input, shell, errorElement, message) {
  const hasError = Boolean(message);
  input.setAttribute("aria-invalid", String(hasError));
  shell.classList.toggle("is-invalid", hasError);
  errorElement.textContent = message;
}

function validateEmail() {
  const value = emailInput.value.trim();
  let message = "";

  if (!value) {
    message = getCopy("emailRequired");
  } else if (!isValidEmail(value)) {
    message = getCopy("emailInvalid");
  }

  setFieldState(emailInput, emailShell, emailError, message);
  return !message;
}

function validatePassword() {
  const value = passwordInput.value;
  let message = "";

  if (!value) {
    message = getCopy("passwordRequired");
  } else if (value.length < 8) {
    message = getCopy("passwordShort");
  }

  setFieldState(passwordInput, passwordShell, passwordError, message);
  return !message;
}

function validateForm() {
  const emailIsValid = validateEmail();
  const passwordIsValid = validatePassword();
  return emailIsValid && passwordIsValid;
}

function clearSuccessState() {
  window.clearTimeout(submitTimer);
  formStatus.classList.remove("is-visible");
  formStatus.textContent = "";
  submitButton.classList.remove("is-loading");
  submitButton.disabled = false;
}

function showLoader() {
  loginLoader.classList.remove("hidden");
}

function hideLoader() {
  loginLoader.classList.add("hidden");
}

function getSessionIdFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sessionId;
  } catch {
    return null;
  }
}

function connectAuthSocket() {
  const token = localStorage.getItem("parkin_access_token");
  const sessionId = getSessionIdFromToken(token || "");

  if (!sessionId || typeof io === "undefined") return;

  disconnectAuthSocket();

  authSocket = io(API_BASE_URL, {
    transports: ["websocket"],
  });

authSocket.on("connect", () => {
  console.log("✅ Socket connected:", authSocket.id);
  console.log("Registering session:", sessionId);
  authSocket.emit("register_session", { sessionId }, (ack) => {
    console.log("✅ Register session ACK:", ack);
  });
});

authSocket.on("connect_error", (error) => {
  console.error("❌ Socket connect error:", error.message);
});

authSocket.on("force_logout", (data) => {
  console.log("🚨 Force logout received:", data);

  if (isManualLogout) return;

  stopSessionMonitor();
  disconnectAuthSocket();

  localStorage.removeItem("parkin_access_token");
  localStorage.removeItem("parkin_user");

  showLogin();

  alert(data?.message || "Your session has ended because your account was signed in on another device.");
});
}

function disconnectAuthSocket() {
  if (authSocket) {
    authSocket.disconnect();
    authSocket = null;
  }
}


function showDashboard() {
  clearSuccessState();
  loginPage.classList.add("hidden");
  dashboardPage.classList.remove("hidden");
  document.body.classList.add("dashboard-open");
  document.title = "Parkin Dashboard | Operations";
  window.location.hash = "dashboard";
  window.scrollTo({ top: 0, behavior: "auto" });
  dashboardMain.focus({ preventScroll: false });
  hideLoader();

  // checkSession();
 startSessionMonitor();
  // connectAuthSocket();
}

function showLogin() {
  disconnectAuthSocket();
  stopSessionMonitor();
  hideLoader();

  dashboardPage.classList.add("hidden");
  loginPage.classList.remove("hidden");
  document.body.classList.remove("dashboard-open");
  document.title = "Parkin Dashboard | Sign in";
  window.history.replaceState(null, "", window.location.pathname);
  window.scrollTo({ top: 0, behavior: "auto" });
  emailInput.focus({ preventScroll: true });  
}

async function checkSession() {
  const token = localStorage.getItem("parkin_access_token");

  if (!token) return;

  if (dashboardPage.classList.contains("hidden")) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error();
    }
  } catch {
  if (isManualLogout) return;

  stopSessionMonitor();

  localStorage.removeItem("parkin_access_token");
  localStorage.removeItem("parkin_user");

  showLogin();

  alert(
    "Your session has ended because your account was signed in on another device.",
  );
  }
}

emailInput.addEventListener("input", () => {
  clearSuccessState();
  if (submitAttempted || emailInput.getAttribute("aria-invalid") === "true") {
    validateEmail();
  }
});

passwordInput.addEventListener("input", () => {
  clearSuccessState();
  if (submitAttempted || passwordInput.getAttribute("aria-invalid") === "true") {
    validatePassword();
  }
});

emailInput.addEventListener("blur", () => {
  if (submitAttempted || emailInput.value) {
    validateEmail();
  }
});

passwordInput.addEventListener("blur", () => {
  if (submitAttempted || passwordInput.value) {
    validatePassword();
  }
});

passwordToggle.addEventListener("click", () => {
  const showPassword = passwordInput.type === "password";
  passwordInput.type = showPassword ? "text" : "password";
  passwordToggle.classList.toggle("is-visible", showPassword);
  passwordToggle.setAttribute(
    "aria-label",
    getCopy(showPassword ? "hidePassword" : "showPassword"),
  );
  passwordInput.focus({ preventScroll: true });
});

languageSelect.addEventListener("change", (event) => {
  updateLanguage(event.target.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearSuccessState();
  submitAttempted = true;

  if (!validateForm()) {
    const firstInvalidField =
      emailInput.getAttribute("aria-invalid") === "true" ? emailInput : passwordInput;
    firstInvalidField.focus();
    return;
  }

  submitButton.disabled = true;
  showLoader();

  const minimumLoaderTime = new Promise((resolve) => setTimeout(resolve, 800));

  try {
    console.log("API:", API_BASE_URL);

    const [response] = await Promise.all([
      fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          password: passwordInput.value,
        }),
      }),
      minimumLoaderTime,
    ]);

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Invalid email or password");
    }

    const loginData = result.data || result;

    localStorage.setItem("parkin_access_token", loginData.accessToken);
    localStorage.setItem("parkin_user", JSON.stringify(loginData.user));

    console.log("Current login session:", getSessionIdFromToken(loginData.accessToken));

    showDashboard();
  } catch (error) {
    hideLoader();
    submitButton.disabled = false;
    formStatus.textContent = error.message || "Login failed. Please try again.";
    formStatus.classList.add("is-visible");
  }
});

dashboardLogout.addEventListener("click", async () => {
  const token = localStorage.getItem("parkin_access_token");

  if (!confirm("Are you sure you want to logout?")) {
    return;
  }

  disconnectAuthSocket();
  isManualLogout = true;
  stopSessionMonitor();
  showLoader();

  try {
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } finally {
    localStorage.removeItem("parkin_access_token");
    localStorage.removeItem("parkin_user");
    isManualLogout = false;
    showLogin();
  }
});

function updateCurrentDate() {
  const dateElement = document.getElementById("current-date");

  if (!dateElement) return;

  const today = new Date();

  const formattedDate = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  dateElement.textContent = `Today, ${formattedDate}`;
}

updateCurrentDate();

async function restoreSession() {
  const token = localStorage.getItem("parkin_access_token");

  if (!token) {
    showLogin();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error();
    }

    showDashboard();
    } catch {
      console.warn("Session restore failed. Keeping login screen only.");
      showLogin();
    }
}

const locationsView = document.querySelector("#locations-view");
const navLinks = document.querySelectorAll(".dashboard-nav a");
const dashboardSections = document.querySelectorAll(
  ".dashboard-main > section:not(#locations-view):not(#add-location-view)"
);

const locationSearch = document.querySelector("#location-search");
const locationStatusFilter = document.querySelector("#location-status-filter");
const locationCityFilter = document.querySelector("#location-city-filter");
const locationItems = document.querySelectorAll(".location-item");
const locationsResultCount = document.querySelector("#locations-result-count");

function setActiveNav(hash) {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === hash);
  });
}

function showMainDashboardView() {
  dashboardSections.forEach((section) => section.classList.remove("hidden"));
  locationsView?.classList.add("hidden");
  addLocationView?.classList.add("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Dashboard";
  document.querySelector(".dashboard-title p").textContent =
    "Real-time overview of your valet parking operations";

  setActiveNav("#dashboard");
}

function showLocationsView() {
  dashboardSections.forEach((section) => section.classList.add("hidden"));
  
  locationsView?.classList.remove("hidden");
  addLocationView?.classList.add("hidden");
  
  document.querySelector(".dashboard-title h1").textContent = "Locations";
  document.querySelector(".dashboard-title p").textContent =
    "Manage all valet parking locations and operational performance";

  setActiveNav("#locations");
}

function handleDashboardRoute() {
  if (window.location.hash === "#add-location") {
    showAddLocationView();
    return;
  }

  if (window.location.hash === "#locations") {
    showLocationsView();
    return;
  }

  showMainDashboardView();
}

window.addEventListener("hashchange", handleDashboardRoute);

document.querySelector('a[href="#locations"]')?.addEventListener("click", () => {
  setTimeout(showLocationsView, 0);
});

document.querySelector('a[href="#dashboard"]')?.addEventListener("click", () => {
  setTimeout(showMainDashboardView, 0);
});

function filterLocations() {
  const searchValue = locationSearch?.value.trim().toLowerCase() || "";
  const statusValue = locationStatusFilter?.value || "all";
  const cityValue = locationCityFilter?.value || "all";

  let visibleCount = 0;

  locationItems.forEach((item) => {
    const name = item.dataset.name || "";
    const city = item.dataset.city || "";
    const status = item.dataset.status || "";

    const matchesSearch = !searchValue || name.includes(searchValue) || city.includes(searchValue);
    const matchesStatus = statusValue === "all" || status === statusValue;
    const matchesCity = cityValue === "all" || city === cityValue;

    const isVisible = matchesSearch && matchesStatus && matchesCity;

    item.classList.toggle("hidden", !isVisible);

    if (isVisible) {
      visibleCount += 1;
    }
  });

  if (locationsResultCount) {
    locationsResultCount.textContent = `Showing ${visibleCount} of 18 locations`;
  }
}

locationSearch?.addEventListener("input", filterLocations);
locationStatusFilter?.addEventListener("change", filterLocations);
locationCityFilter?.addEventListener("change", filterLocations);

const actionsBackdrop = document.createElement("div");
actionsBackdrop.className = "actions-backdrop";
document.body.appendChild(actionsBackdrop);

const actionsMenu = document.createElement("div");
actionsMenu.className = "location-actions-menu";
actionsMenu.innerHTML = `
  <button type="button">👁 View Details</button>
  <button type="button">✏ Edit Location</button>
  <button type="button">📊 Live Operations</button>
  <button type="button">👥 Assigned Drivers</button>
  <button type="button">🚗 Vehicle Queue</button>
  <button type="button">📅 Bookings</button>
  <button type="button">💰 Revenue Report</button>
  <button type="button">📈 Performance Analytics</button>
  <button type="button">🔔 Notifications</button>
  <button type="button">🗺 Open on Map</button>
  <button type="button">📄 Documents</button>
  <button type="button">📤 Export Report</button>
  <hr />
  <button type="button" class="danger">⏸ Suspend Location</button>
  <button type="button" class="danger">🗑 Delete Location</button>
`;
document.body.appendChild(actionsMenu);

function closeLocationActionsMenu() {
  actionsMenu.classList.remove("is-open");
  actionsBackdrop.classList.remove("is-open");
}

function openLocationActionsMenu(button) {
  const isMobile = window.matchMedia("(max-width: 640px)").matches;
  const rect = button.getBoundingClientRect();

  actionsMenu.classList.add("is-open");

  if (isMobile) {
    actionsMenu.style.top = "auto";
    actionsMenu.style.left = "12px";
    actionsMenu.style.right = "12px";
    actionsMenu.style.bottom = "12px";
    actionsBackdrop.classList.add("is-open");
    return;
  }

  const menuWidth = 248;
  const menuHeight = Math.min(actionsMenu.scrollHeight, window.innerHeight - 24);

  let top = rect.bottom + 8;
  let left = rect.right - menuWidth;

  if (top + menuHeight > window.innerHeight - 12) {
    top = Math.max(12, window.innerHeight - menuHeight - 12);
  }

  if (left < 12) {
    left = 12;
  }

  if (left + menuWidth > window.innerWidth - 12) {
    left = window.innerWidth - menuWidth - 12;
  }

  actionsMenu.style.top = `${top}px`;
  actionsMenu.style.left = `${left}px`;
  actionsMenu.style.right = "auto";
  actionsMenu.style.bottom = "auto";

  actionsBackdrop.classList.remove("is-open");
}

document.querySelectorAll(".loc-more").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();

    if (actionsMenu.classList.contains("is-open")) {
      closeLocationActionsMenu();
      return;
    }

    openLocationActionsMenu(button);
  });
});

actionsBackdrop.addEventListener("click", closeLocationActionsMenu);

document.addEventListener("click", (event) => {
  if (!actionsMenu.contains(event.target)) {
    closeLocationActionsMenu();
  }
});

window.addEventListener("resize", closeLocationActionsMenu);
window.addEventListener("scroll", closeLocationActionsMenu, true);

const addLocationView = document.querySelector("#add-location-view");
const addLocationBtn = document.querySelector(".add-location-btn");
const backToLocationsBtn = document.querySelector(".back-to-locations");
const cancelLocationBtn = document.querySelector(".cancel-location");
const addLocationForm = document.querySelector(".add-location-layout");

handleDashboardRoute();
filterLocations();

function showAddLocationView() {
  dashboardSections.forEach((section) => section.classList.add("hidden"));
  locationsView?.classList.add("hidden");
  addLocationView?.classList.remove("hidden");

  document.querySelector(".dashboard-title h1").textContent = "Add New Location";
  document.querySelector(".dashboard-title p").textContent =
    "Create a new valet parking location";

  setActiveNav("#locations");
  window.location.hash = "add-location";
}

function backToLocationsView() {
  addLocationView?.classList.add("hidden");
  showLocationsView();
  window.location.hash = "locations";
}

addLocationBtn?.addEventListener("click", showAddLocationView);
backToLocationsBtn?.addEventListener("click", backToLocationsView);
cancelLocationBtn?.addEventListener("click", backToLocationsView);

// Save button functionality
addLocationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const saveButton = addLocationForm.querySelector(".save-location");
  const formData = new FormData(addLocationForm);

  const payload = Object.fromEntries(formData.entries());

  if (payload.capacity) {
    payload.capacity = Number(payload.capacity);
  }

  try {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const response = await fetch(`${API_BASE_URL}/locations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to save location");
    }

    alert("Location saved successfully.");
    addLocationForm.reset();
    backToLocationsView();
  } catch (error) {
    alert(error.message || "Something went wrong.");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save Location";
  }
});

restoreSession();
updateLanguage("en");
// setInterval(checkSession, 30000);