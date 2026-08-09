let customerTrendCharts = [];

function getCustomerVehicleApiBaseUrl() {
  return (
    window.PARKIN_CONFIG?.apiBaseUrl ||
    "https://api.parkin.com.sa"
  );
}

function getCustomerVehicleAuthHeaders() {
  const accessToken = localStorage.getItem("parkin_access_token");

  if (!accessToken) {
    throw new Error("Your login session has expired. Please sign in again.");
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function parseCustomerVehicleResponse(response) {
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray(result?.message)
      ? result.message.join(", ")
      : result?.message ||
        result?.error ||
        `Vehicle request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return result?.data ?? result;
}

async function loadCustomersPage() {
  const view = document.querySelector("#customers-view");

  const container = document.querySelector("#customers-container");

  if (!view || !container) {
    console.error("Customers view or container was not found.");
    return;
  }

  hideAllCustomerViews();

  view.classList.remove("hidden");

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
      const response = await fetch("/pages/customers.html");

      if (!response.ok) {
        throw new Error(`Unable to load Customers page: ${response.status}`);
      }

      container.innerHTML = await response.text();

      container.dataset.loaded = "true";
    }

    bindCustomerActions();
    bindCustomerTableSelection();
    bindCustomerActionMenus();

    setTimeout(() => {
      initCustomerTrendCharts();
    }, 100);
  } catch (error) {
    console.error("Unable to load Customers page:", error);

    container.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h2>Unable to load Customers</h2>
        <p>Please refresh the page and try again.</p>

        <button
          type="button"
          id="retry-customers-page"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    container
      .querySelector("#retry-customers-page")
      ?.addEventListener("click", () => {
        container.dataset.loaded = "false";
        loadCustomersPage();
      });
  }
}

function bindCustomerActions() {
  document.querySelector(".customer-add-btn")?.addEventListener("click", () => {
    window.location.hash = "add-customer";
  });
}

function bindCustomerTableSelection() {
  const selectAll = document.querySelector("#select-all-customers");
  const rowCheckboxes = document.querySelectorAll(".customer-row-checkbox");

  if (!selectAll || rowCheckboxes.length === 0) return;

  if (selectAll.dataset.bound === "true") return;
  selectAll.dataset.bound = "true";

  selectAll.addEventListener("change", () => {
    rowCheckboxes.forEach((checkbox) => {
      checkbox.checked = selectAll.checked;
    });

    selectAll.indeterminate = false;
  });

  rowCheckboxes.forEach((checkbox) => {
    if (checkbox.dataset.bound === "true") return;
    checkbox.dataset.bound = "true";

    checkbox.addEventListener("change", () => {
      const selectedCount = [...rowCheckboxes].filter(
        (item) => item.checked,
      ).length;

      selectAll.checked = selectedCount === rowCheckboxes.length;
      selectAll.indeterminate =
        selectedCount > 0 && selectedCount < rowCheckboxes.length;
    });
  });
}

function bindCustomerActionMenus() {
  const buttons = document.querySelectorAll(".customer-more-btn");

  buttons.forEach((button) => {
    if (button.dataset.bound === "true") return;

    button.dataset.bound = "true";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const cell = button.closest(".customer-actions-cell");
      const menu = cell?.querySelector(".customer-actions-menu");

      if (!menu) {
        console.warn("Customer actions menu not found for button:", button);
        return;
      }

      document.querySelectorAll(".customer-actions-menu").forEach((item) => {
        if (item !== menu) {
          item.classList.add("hidden");
        }
      });

      document.querySelectorAll(".customer-more-btn").forEach((item) => {
        if (item !== button) {
          item.setAttribute("aria-expanded", "false");
        }
      });

      const shouldOpen = menu.classList.contains("hidden");

      if (shouldOpen) {
        const rect = button.getBoundingClientRect();
        const menuWidth = 230;
        const pagePadding = 12;

        let left = rect.right - menuWidth;

        if (left < pagePadding) {
          left = pagePadding;
        }

        if (left + menuWidth > window.innerWidth - pagePadding) {
          left = window.innerWidth - menuWidth - pagePadding;
        }

        menu.style.top = `${rect.bottom + 8}px`;
        menu.style.left = `${left}px`;
      }

      menu.classList.toggle("hidden", !shouldOpen);
      button.setAttribute("aria-expanded", String(shouldOpen));
    });
  });

  document
    .querySelectorAll(".customer-actions-menu [data-customer-action]")
    .forEach((actionButton) => {
      if (actionButton.dataset.actionBound === "true") return;

      actionButton.dataset.actionBound = "true";

      actionButton.addEventListener("click", (event) => {
        event.stopPropagation();

        const action = actionButton.dataset.customerAction;

        document.querySelectorAll(".customer-actions-menu").forEach((menu) => {
          menu.classList.add("hidden");
        });

        document.querySelectorAll(".customer-more-btn").forEach((button) => {
          button.setAttribute("aria-expanded", "false");
        });

        if (action === "view") {
          window.location.hash = "customer-details";

          loadCustomerDetailsPage("overview");

          return;
        }

        if (action === "edit") {
          window.location.hash = "edit-customer";
          return;
        }

        console.log("Customer action:", action);
      });
    });

  if (document.body.dataset.customerMenuBound !== "true") {
    document.body.dataset.customerMenuBound = "true";

    document.addEventListener("click", () => {
      document.querySelectorAll(".customer-actions-menu").forEach((menu) => {
        menu.classList.add("hidden");
      });

      document.querySelectorAll(".customer-more-btn").forEach((button) => {
        button.setAttribute("aria-expanded", "false");
      });
    });

    window.addEventListener("resize", closeCustomerActionMenus);
    window.addEventListener("scroll", closeCustomerActionMenus, true);
  }
}

function closeCustomerActionMenus() {
  document.querySelectorAll(".customer-actions-menu").forEach((menu) => {
    menu.classList.add("hidden");
  });

  document.querySelectorAll(".customer-more-btn").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function createCustomerTrendChart(canvasId, data, color) {
  const canvas = document.querySelector(canvasId);

  if (!canvas || typeof Chart === "undefined") {
    return null;
  }

  return new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map((_, index) => index + 1),
      datasets: [
        {
          data,
          borderColor: color,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
          fill: false,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: {
        duration: 800,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false,
        },
      },
      scales: {
        x: {
          display: false,
        },
        y: {
          display: false,
          beginAtZero: false,
        },
      },
      elements: {
        line: {
          borderCapStyle: "round",
          borderJoinStyle: "round",
        },
      },
    },
  });
}

async function loadAddCustomerPage() {
  const container = document.querySelector("#add-customer-container");
  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/add-customer.html");

    if (!response.ok) {
      throw new Error(`Unable to load Add Customer page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  const memberSince = document.querySelector("#customer-member-since");

  if (memberSince && !memberSince.value) {
    memberSince.value = new Date().toISOString().split("T")[0];
  }

  bindAddCustomerForm();
}

function bindAddCustomerForm() {
  const form = document.querySelector("#add-customer-form");
  if (!form || form.dataset.bound === "true") return;

  form.dataset.bound = "true";

  const fullName = document.querySelector("#customer-full-name");
  const email = document.querySelector("#customer-email");
  const customerType = document.querySelector("#customer-type");
  const customerStatus = document.querySelector("#customer-status");
  const memberSince = document.querySelector("#customer-member-since");
  const language = document.querySelector("#customer-language");
  const communication = document.querySelector("#customer-communication");
  const notes = document.querySelector("#customer-notes");

  const summaryName = document.querySelector("#summary-customer-name");
  const summaryEmail = document.querySelector("#summary-customer-email");
  const summaryType = document.querySelector("#summary-customer-type");
  const summaryStatus = document.querySelector("#summary-customer-status");
  const summaryMemberSince = document.querySelector("#summary-member-since");
  const summaryLanguage = document.querySelector("#summary-language");
  const summaryCommunication = document.querySelector("#summary-communication");
  const noteCount = document.querySelector("#customer-note-count");

  function formatDate(value) {
    if (!value) return "Not selected";

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return "Not selected";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function updateSummary() {
    if (summaryName) {
      summaryName.textContent = fullName?.value.trim() || "Customer Preview";
    }

    if (summaryEmail) {
      summaryEmail.textContent =
        email?.value.trim() || "Enter customer details";
    }

    if (summaryType) {
      summaryType.textContent = customerType?.value || "Individual";
    }

    if (summaryStatus) {
      const status = customerStatus?.value || "Active";

      summaryStatus.textContent = status;
      summaryStatus.classList.remove("active", "inactive", "blocked");
      summaryStatus.classList.add(status.toLowerCase());
    }

    if (summaryMemberSince) {
      summaryMemberSince.textContent = formatDate(memberSince?.value);
    }

    if (summaryLanguage) {
      summaryLanguage.textContent = language?.value || "English";
    }

    if (summaryCommunication) {
      summaryCommunication.textContent = communication?.value || "Email, SMS";
    }

    if (noteCount) {
      noteCount.textContent = String(notes?.value.length || 0);
    }
  }

  [
    fullName,
    email,
    customerType,
    customerStatus,
    memberSince,
    language,
    communication,
    notes,
  ].forEach((field) => {
    field?.addEventListener("input", updateSummary);
    field?.addEventListener("change", updateSummary);
  });

  document
    .querySelector("#back-to-customers")
    ?.addEventListener("click", () => {
      window.location.hash = "customers";
    });

  document
    .querySelector("#cancel-add-customer")
    ?.addEventListener("click", () => {
      window.location.hash = "customers";
    });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    console.log("Customer form submitted");
  });

  updateSummary();
}

async function loadCustomerDetailsPage(initialTab = "overview") {
  const view = document.querySelector("#customer-details-view");

  const container = document.querySelector("#customer-details-container");

  if (!view || !container) {
    console.error("Customer Details view or container was not found.");
    return;
  }

  hideAllCustomerViews();

  view.classList.remove("hidden");

  try {
    if (container.dataset.loaded !== "true" || !container.innerHTML.trim()) {
      const response = await fetch("/pages/customer-details.html");

      if (!response.ok) {
        throw new Error(
          `Unable to load Customer Details page: ${response.status}`,
        );
      }

      container.innerHTML = await response.text();

      container.dataset.loaded = "true";
    }

    bindCustomerDetailsActions();
    bindCustomerDetailsTabs();
    bindCustomerVehicleActions();
    bindCustomerBookingActions();
    bindCustomerBookingsList();
    bindCustomerPaymentMethodActions();
    bindCustomerActivityLog();

    activateCustomerDetailsTab(initialTab);
  } catch (error) {
    console.error("Unable to load Customer Details:", error);

    container.innerHTML = `
      <section class="page-load-error">
        <h2>Unable to load Customer Details</h2>
        <p>Please refresh the page and try again.</p>
      </section>
    `;
  }
}

function bindCustomerVehicleActions() {
  const buttons = [
    document.querySelector("#customer-add-vehicle-top"),
    document.querySelector("#customer-add-vehicle-empty"),
  ].filter(Boolean);

  buttons.forEach((button) => {
    if (button.dataset.bound === "true") return;

    button.dataset.bound = "true";

    button.addEventListener("click", () => {
      window.location.hash = "customer-add-vehicle";
    });
  });
}

async function loadEditCustomerPage() {
  const container = document.querySelector("#edit-customer-container");
  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/edit-customer.html");

    if (!response.ok) {
      throw new Error(`Unable to load Edit Customer page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  bindEditCustomerActions();
}

function bindEditCustomerActions() {
  document
    .querySelector("#back-from-edit-customer")
    ?.addEventListener("click", () => {
      window.location.hash = "customer-details";
    });

  document
    .querySelector("#cancel-edit-customer")
    ?.addEventListener("click", () => {
      window.location.hash = "customer-details";
    });
}

function bindCustomerDetailsActions() {
  document
    .querySelector("#back-to-customers-list")
    ?.addEventListener("click", async () => {
      window.location.hash = "customers";

      await loadCustomersPage();
    });

  document
    .querySelector("#open-edit-customer")
    ?.addEventListener("click", () => {
      window.location.hash = "edit-customer";
    });
}

function bindCustomerDetailsTabs() {
  const view = document.querySelector("#customer-details-view");

  if (!view) return;

  const tabs = view.querySelectorAll(".customer-details-tab");

  const panels = view.querySelectorAll(".customer-tab-panel");

  if (!tabs.length || !panels.length) {
    return;
  }

  tabs.forEach((tab) => {
    if (tab.dataset.bound === "true") {
      return;
    }

    tab.dataset.bound = "true";

    tab.addEventListener("click", () => {
      const target = tab.dataset.customerTab;

      tabs.forEach((item) => {
        const isActive = item.dataset.customerTab === target;

        item.classList.toggle("active", isActive);

        item.setAttribute("aria-selected", String(isActive));
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.customerPanel === target;

        panel.classList.toggle("active", isActive);

        panel.classList.toggle("hidden", !isActive);
      });
    });
  });
}

async function loadCustomerCreateBookingPage() {
  const container = document.querySelector(
    "#customer-create-booking-container",
  );

  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/customer-create-booking.html");

    if (!response.ok) {
      throw new Error(`Unable to load Create Booking page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  bindCustomerCreateBookingForm();
}

function bindCustomerCreateBookingForm() {
  const page = document.querySelector(".customer-create-booking-page");

  if (!page || page.dataset.bound === "true") return;

  page.dataset.bound = "true";

  const location = page.querySelector("#booking-location");
  const zone = page.querySelector("#booking-zone");
  const entryDate = page.querySelector("#booking-entry-date");
  const entryTime = page.querySelector("#booking-entry-time");
  const exitDate = page.querySelector("#booking-exit-date");
  const exitTime = page.querySelector("#booking-exit-time");
  const vehicle = page.querySelector("#booking-vehicle");

  const parkingRate = page.querySelector("#bookingRate");
  const bookingAmount = page.querySelector("#bookingAmount");
  const paymentMethod = page.querySelector("#paymentMethod");
  const paidArrival = page.querySelector("#paidArrival");
  const bookingNotes = page.querySelector("#booking-notes");
  const bookingNotesCount = page.querySelector("#booking-notes-count");

  const successModal = document.querySelector("#booking-success-modal");

  const createdBookingId = document.querySelector("#created-booking-id");

  const successVehicle = document.querySelector("#success-booking-vehicle");

  const successLocation = document.querySelector("#success-booking-location");

  const successAmount = document.querySelector("#success-booking-amount");

  const bookingTypeButtons = [...page.querySelectorAll(".booking-type-card")];

  let selectedBookingType = "Single Entry";

  function setSummaryText(selector, value) {
    const element = page.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function formatBookingDate(dateValue, timeValue) {
    if (!dateValue && !timeValue) return "-";

    let formattedDate = dateValue || "";
    let formattedTime = timeValue || "";

    if (dateValue) {
      const date = new Date(`${dateValue}T00:00:00`);

      if (!Number.isNaN(date.getTime())) {
        formattedDate = new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(date);
      }
    }

    if (timeValue) {
      const [hours, minutes] = timeValue.split(":");
      const date = new Date();

      date.setHours(Number(hours), Number(minutes), 0, 0);

      formattedTime = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    }

    return [formattedDate, formattedTime].filter(Boolean).join(", ");
  }

  function updateBookingAmount() {
    const rate = parkingRate?.value || "";

    const amountMap = {
      Hourly: "25.00",
      Daily: "120.00",
      Weekly: "650.00",
      Monthly: "2200.00",
    };

    const amount = amountMap[rate] || "0.00";

    if (bookingAmount) {
      bookingAmount.value = amount;
    }

    setSummaryText("#booking-summary-amount", `SAR ${amount}`);
  }

  function updateBookingSummary() {
    const locationText =
      location?.selectedOptions?.[0]?.textContent?.trim() || "-";

    const zoneText = zone?.selectedOptions?.[0]?.textContent?.trim() || "-";

    const vehicleText =
      vehicle?.selectedOptions?.[0]?.textContent?.trim() || "-";

    setSummaryText(
      "#booking-summary-location",
      location?.value ? locationText : "-",
    );

    setSummaryText("#booking-summary-zone", zone?.value ? zoneText : "-");

    setSummaryText("#booking-summary-type", selectedBookingType);

    setSummaryText(
      "#booking-summary-entry",
      formatBookingDate(entryDate?.value, entryTime?.value),
    );

    setSummaryText(
      "#booking-summary-exit",
      formatBookingDate(exitDate?.value, exitTime?.value),
    );

    setSummaryText("#booking-summary-vehicle", vehicleText);

    updateBookingAmount();
  }

  /* ADD MODAL FUNCTIONS HERE */

  function closeBookingSuccessModal() {
    successModal?.classList.add("hidden");
    document.body.classList.remove("booking-modal-open");
  }

  function openBookingSuccessModal(bookingId) {
    if (!successModal) return;

    if (createdBookingId) {
      createdBookingId.textContent = bookingId;
    }

    if (successVehicle) {
      successVehicle.textContent =
        vehicle?.selectedOptions?.[0]?.textContent?.trim() || "Not selected";
    }

    if (successLocation) {
      successLocation.textContent =
        location?.selectedOptions?.[0]?.textContent?.trim() || "Not selected";
    }

    if (successAmount) {
      successAmount.textContent = `SAR ${bookingAmount?.value || "0.00"}`;
    }

    successModal.classList.remove("hidden");
    document.body.classList.add("booking-modal-open");
  }
  bookingTypeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      bookingTypeButtons.forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      selectedBookingType =
        button.dataset.bookingType === "multiple"
          ? "Multiple Entry"
          : "Single Entry";

      updateBookingSummary();
    });
  });

  document
    .querySelector("#close-booking-success")
    ?.addEventListener("click", closeBookingSuccessModal);

  document
    .querySelector(".booking-success-backdrop")
    ?.addEventListener("click", closeBookingSuccessModal);

  document
    .querySelector("#copy-created-booking-id")
    ?.addEventListener("click", async () => {
      const bookingId = createdBookingId?.textContent?.trim();

      if (!bookingId) return;

      const copyButton = document.querySelector("#copy-created-booking-id");

      const icon = copyButton?.querySelector("i");

      function showCopiedState() {
        icon?.classList.remove("fa-copy");
        icon?.classList.add("fa-check");

        copyButton?.classList.add("copied");
        copyButton?.setAttribute("aria-label", "Booking ID copied");

        setTimeout(() => {
          icon?.classList.remove("fa-check");
          icon?.classList.add("fa-copy");

          copyButton?.classList.remove("copied");
          copyButton?.setAttribute("aria-label", "Copy booking ID");
        }, 1400);
      }

      function copyWithFallback(text) {
        const textarea = document.createElement("textarea");

        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        const copied = document.execCommand("copy");

        textarea.remove();

        return copied;
      }

      try {
        let copied = false;

        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(bookingId);
          copied = true;
        } else {
          copied = copyWithFallback(bookingId);
        }

        if (!copied) {
          throw new Error("Browser rejected copy operation");
        }

        showCopiedState();
      } catch (error) {
        console.error("Unable to copy booking ID:", error);

        const manualCopy = window.prompt("Copy this Booking ID:", bookingId);

        if (manualCopy !== null) {
          showCopiedState();
        }
      }
    });

  document
    .querySelector("#create-another-booking")
    ?.addEventListener("click", () => {
      closeBookingSuccessModal();

      page
        .querySelector(
          "#booking-information-card input, #booking-information-card select",
        )
        ?.focus();
    });

  document
    .querySelector("#view-created-booking")
    ?.addEventListener("click", () => {
      closeBookingSuccessModal();

      window.location.hash = "customer-details";

      setTimeout(() => {
        document
          .querySelector('.customer-details-tab[data-customer-tab="bookings"]')
          ?.click();
      }, 150);
    });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !successModal?.classList.contains("hidden")) {
      closeBookingSuccessModal();
    }
  });
  /* Notes counter */
  bookingNotes?.addEventListener("input", () => {
    if (bookingNotesCount) {
      bookingNotesCount.textContent = String(bookingNotes.value.length);
    }
  });

  if (bookingNotesCount) {
    bookingNotesCount.textContent = String(bookingNotes?.value.length || 0);
  }

  /* General field listeners */

  [
    location,
    zone,
    entryDate,
    entryTime,
    exitDate,
    exitTime,
    vehicle,
    parkingRate,
    paymentMethod,
    paidArrival,
  ].forEach((field) => {
    field?.addEventListener("change", updateBookingSummary);
    field?.addEventListener("input", updateBookingSummary);
  });

  page.querySelector("#booking-add-vehicle")?.addEventListener("click", () => {
    window.location.hash = "customer-add-vehicle";
  });

  page
    .querySelector("#back-to-customer-bookings")
    ?.addEventListener("click", openCustomerBookingsTab);

  page
    .querySelector("#cancel-customer-booking")
    ?.addEventListener("click", openCustomerBookingsTab);

  page
    .querySelector(".booking-footer-actions .btn-secondary")
    ?.addEventListener("click", openCustomerBookingsTab);

  page
    .querySelector("#create-customer-booking-submit")
    ?.addEventListener("click", (event) => {
      event.preventDefault();

      const requiredFields = [
        location,
        zone,
        entryDate,
        entryTime,
        exitDate,
        exitTime,
        vehicle,
        parkingRate,
        paymentMethod,
      ];

      const firstEmptyField = requiredFields.find((field) => !field?.value);

      if (firstEmptyField) {
        firstEmptyField.focus();
        return;
      }

      const entryDateTime = new Date(`${entryDate.value}T${entryTime.value}`);

      const exitDateTime = new Date(`${exitDate.value}T${exitTime.value}`);

      if (exitDateTime <= entryDateTime) {
        exitDate.focus();
        alert("Exit date and time must be after entry date and time.");
        return;
      }
      // console.log("Create booking");
      const bookingId = generateUniqueBookingId();

      console.log("Booking created:", bookingId);

      openBookingSuccessModal(bookingId);
    });

  updateBookingSummary();
}

function openCustomerBookingsTab() {
  window.location.hash = "customer-details";

  setTimeout(() => {
    document
      .querySelector('.customer-details-tab[data-customer-tab="bookings"]')
      ?.click();
  }, 150);
}

async function loadCustomerAddVehiclePage() {
  const container = document.querySelector("#customer-add-vehicle-container");

  if (!container) return;

  if (container.dataset.loaded !== "true") {
    const response = await fetch("/pages/customer-add-vehicle.html");

    if (!response.ok) {
      throw new Error(`Unable to load Add Vehicle page: ${response.status}`);
    }

    container.innerHTML = await response.text();
    container.dataset.loaded = "true";
  }

  bindCustomerAddVehicleForm();
  resetCustomerAddVehicleForm();
}

function bindCustomerAddVehicleForm() {
  const page = document.querySelector(".customer-add-vehicle-page");
  if (!page) return;

  if (page.dataset.vehicleFormBound === "true") {
    page.refreshVehiclePreview?.();
    return;
  }

  page.dataset.vehicleFormBound = "true";

  const form = page.querySelector("#customer-add-vehicle-form");

  const vehicleType = page.querySelector("#vehicle-type");
  const vehicleMake = page.querySelector("#vehicle-make");
  const vehicleModel = page.querySelector("#vehicle-model");
  const vehicleYear = page.querySelector("#vehicle-year");
  const vehicleColor = page.querySelector("#vehicle-color");
  const vehicleBody = page.querySelector("#vehicle-body");
  const vehicleCountry = page.querySelector("#vehicle-country");
  const primaryVehicle = page.querySelector("#vehicle-primary");

  const vehicleVin = page.querySelector("#vehicle-vin");

  const vehicleEngineNumber = page.querySelector("#vehicle-engine-number");

  const vehicleMileage = page.querySelector("#vehicle-mileage");

  const vehicleNotes = page.querySelector("#vehicle-notes");

  const saveVehicleButton = page.querySelector("#save-customer-vehicle");

  const digitInputs = [...page.querySelectorAll(".vehicle-plate-digit")];

  const letterSelects = [...page.querySelectorAll(".vehicle-plate-letter")];

  const digitMap = {
    0: "٠",
    1: "١",
    2: "٢",
    3: "٣",
    4: "٤",
    5: "٥",
    6: "٦",
    7: "٧",
    8: "٨",
    9: "٩",
  };

  const letterMap = {
    A: "ا",
    B: "ب",
    D: "د",
    G: "ق",
    H: "هـ",
    J: "ح",
    K: "ك",
    L: "ل",
    N: "ن",
    R: "ر",
    S: "س",
    T: "ط",
    U: "و",
    V: "ى",
    X: "ص",
    Z: "م",
  };

  function setPreviewText(selector, value) {
    const element = page.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function getEnglishPlateNumber() {
    return digitInputs.map((input) => input.value.trim()).join("");
  }

  function getEnglishPlateLetters() {
    return letterSelects.map((select) => select.value || "A");
  }

  function getArabicPlateNumber(englishNumber) {
    return [...englishNumber].map((digit) => digitMap[digit] || digit).join("");
  }

  function getArabicPlateLetters(englishLetters) {
    return englishLetters.map((letter) => letterMap[letter] || letter);
  }

  function updateDigitValidation(input) {
    const field = input.closest(".plate-field");
    const status = field?.querySelector(".plate-status-icon");
    const icon = status?.querySelector("i");

    if (!field || !status || !icon) return;

    const isValid = /^[0-9]$/.test(input.value.trim());

    field.classList.toggle("valid", isValid);
    field.classList.toggle("invalid", !isValid);

    status.classList.toggle("valid", isValid);
    status.classList.toggle("invalid", !isValid);

    icon.classList.toggle("fa-check", isValid);
    icon.classList.toggle("fa-xmark", !isValid);

    input.setAttribute("aria-invalid", String(!isValid));
  }

  function updateVehiclePreview() {
    const englishNumber = getEnglishPlateNumber();
    const englishLetters = getEnglishPlateLetters();

    const arabicNumber = getArabicPlateNumber(englishNumber);
    const arabicLetters = getArabicPlateLetters(englishLetters);

    const previewEnglishNumber =
      englishNumber.length === 4 ? englishNumber : "----";

    const previewArabicNumber =
      arabicNumber.length === 4 ? arabicNumber : "ــــ";

    setPreviewText(
      "#preview-vehicle-type",
      vehicleType?.value || "Not selected",
    );

    const makeModel = [
      vehicleMake?.value || "",
      vehicleModel?.value.trim() || "",
    ]
      .filter(Boolean)
      .join(" ");

    setPreviewText("#preview-make-model", makeModel || "Not selected");

    setPreviewText("#preview-year", vehicleYear?.value || "Not selected");

    setPreviewText("#preview-color", vehicleColor?.value || "Not selected");

    setPreviewText("#preview-body-type", vehicleBody?.value || "Not selected");

    const countryText =
      vehicleCountry?.selectedOptions?.[0]?.textContent
        ?.replace(/\s*\(\+966\)\s*/g, "")
        .trim() || "Saudi Arabia";

    setPreviewText("#preview-plate-country", countryText);

    setPreviewText("#preview-english-number", previewEnglishNumber);

    setPreviewText("#preview-arabic-number", previewArabicNumber);

    setPreviewText("#preview-english-letters", englishLetters.join(" "));

    setPreviewText("#preview-arabic-letters", arabicLetters.join(" "));

    setPreviewText(
      "#preview-summary-english",
      `${previewEnglishNumber} ${englishLetters.join(" ")}`,
    );

    setPreviewText(
      "#preview-summary-arabic",
      `${previewArabicNumber} ${arabicLetters.join(" ")}`,
    );

    const primaryStatus = page.querySelector("#preview-primary-status");

    if (primaryStatus) {
      const isPrimary = Boolean(primaryVehicle?.checked);

      primaryStatus.textContent = isPrimary ? "Yes" : "No";
      primaryStatus.classList.toggle("active", isPrimary);
      primaryStatus.classList.toggle("inactive", !isPrimary);
    }
  }

  digitInputs.forEach((input, index) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 1);

      updateDigitValidation(input);
      updateVehiclePreview();

      if (input.value && digitInputs[index + 1]) {
        digitInputs[index + 1].focus();
        digitInputs[index + 1].select();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Backspace") return;

      event.preventDefault();

      if (input.value) {
        input.value = "";
        updateDigitValidation(input);
        updateVehiclePreview();
        return;
      }

      const previousInput = digitInputs[index - 1];

      if (previousInput) {
        previousInput.value = "";
        updateDigitValidation(previousInput);
        updateVehiclePreview();
        previousInput.focus();
        previousInput.select();
      }
    });

    input.addEventListener("paste", (event) => {
      event.preventDefault();

      const pastedValue = event.clipboardData
        ?.getData("text")
        .replace(/\D/g, "")
        .slice(0, 4);

      if (!pastedValue) return;

      [...pastedValue].forEach((digit, pastedIndex) => {
        const targetInput = digitInputs[pastedIndex];

        if (!targetInput) return;

        targetInput.value = digit;
        updateDigitValidation(targetInput);
      });

      const nextEmptyInput = digitInputs.find((item) => !item.value);

      if (nextEmptyInput) {
        nextEmptyInput.focus();
      } else {
        digitInputs[digitInputs.length - 1]?.focus();
      }

      updateVehiclePreview();
    });

    updateDigitValidation(input);
  });

  letterSelects.forEach((select) => {
    select.addEventListener("change", updateVehiclePreview);
  });

  [
    vehicleType,
    vehicleMake,
    vehicleYear,
    vehicleColor,
    vehicleBody,
    vehicleCountry,
    primaryVehicle,
  ].forEach((field) => {
    field?.addEventListener("change", updateVehiclePreview);
  });

  vehicleModel?.addEventListener("input", updateVehiclePreview);
  vehicleModel?.addEventListener("change", updateVehiclePreview);

  page
    .querySelector("#back-to-customer-vehicles")
    ?.addEventListener("click", openCustomerVehiclesTab);

  page
    .querySelector("#cancel-customer-vehicle")
    ?.addEventListener("click", openCustomerVehiclesTab);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (saveVehicleButton?.disabled) {
      return;
    }

    const allDigitsValid = digitInputs.every((input) =>
      /^[0-9]$/.test(input.value.trim()),
    );

    if (!allDigitsValid) {
      digitInputs.forEach(updateDigitValidation);

      digitInputs.find((input) => !/^[0-9]$/.test(input.value.trim()))?.focus();

      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const plateNumberEnglish = getEnglishPlateNumber();

    const plateLettersEnglish = getEnglishPlateLetters().join("").toUpperCase();

    if (!/^[ABDGHJKLNRSTUVXZ]{3}$/.test(plateLettersEnglish)) {
      throw new Error("Please select three valid plate letters.");
    }

    const mileageValue = vehicleMileage?.value?.trim() || "";

    const vinValue = String(vehicleVin?.value || "")
      .trim()
      .toUpperCase();

    if (vinValue && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vinValue)) {
      vehicleVin.focus();

      vehicleVin.setCustomValidity(
        "VIN must contain exactly 17 valid characters.",
      );

      vehicleVin.reportValidity();

      return;
    }

    vehicleVin?.setCustomValidity("");

    const storedCustomerId = sessionStorage.getItem("selectedCustomerId");

    const validCustomerId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        storedCustomerId || "",
      )
        ? storedCustomerId
        : undefined;

    const payload = {
      customerId: validCustomerId,

      vehicleType: vehicleType?.value?.trim() || "",

      make: vehicleMake?.value?.trim() || "",

      model: vehicleModel?.value?.trim() || "",

      year: Number(vehicleYear?.value),

      color: vehicleColor?.value?.trim() || "",

      bodyType: vehicleBody?.value?.trim() || undefined,

      plateCountryCode: "SA",

      plateNumberEnglish,

      plateLettersEnglish,

      vin: vinValue || undefined,

      engineNumber: vehicleEngineNumber?.value?.trim() || undefined,

      mileage: mileageValue === "" ? undefined : Number(mileageValue),

      notes: vehicleNotes?.value?.trim() || undefined,

      /*
       * The backend requires a customer ID
       * before a vehicle can be marked as the
       * customer's primary vehicle.
       */
      isPrimaryForCustomer: Boolean(validCustomerId && primaryVehicle?.checked),

      status: "ACTIVE",
    };

    const originalButtonContent = saveVehicleButton?.innerHTML;

    try {
      if (saveVehicleButton) {
        saveVehicleButton.disabled = true;

        saveVehicleButton.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Saving Vehicle...
        `;
      }

      const response = await fetch(
        `${getCustomerVehicleApiBaseUrl()}/vehicles`,
        {
          method: "POST",
          headers: getCustomerVehicleAuthHeaders(),
          body: JSON.stringify(payload),
        },
      );

      const result = await parseCustomerVehicleResponse(response);

      const createdVehicle = result?.vehicle || result;

      if (!createdVehicle?.id) {
        throw new Error("The API did not return the created vehicle.");
      }

      sessionStorage.setItem("lastCreatedVehicleId", createdVehicle.id);

      console.log("Vehicle created:", createdVehicle);

      resetCustomerAddVehicleForm();

      showCustomerVehicleCreatedModal(createdVehicle);
    } catch (error) {
      console.error("Unable to create vehicle:", error);

      showCustomerVehicleError(error?.message || "Unable to save the vehicle.");
    } finally {
      if (saveVehicleButton) {
        saveVehicleButton.disabled = false;

        saveVehicleButton.innerHTML = originalButtonContent;
      }
    }
  });

  page.refreshVehiclePreview = updateVehiclePreview;

  updateVehiclePreview();
}

function showCustomerVehicleCreatedModal(vehicle) {
  document.querySelector("#customer-vehicle-result-modal")?.remove();

  const modal = document.createElement("div");

  modal.id = "customer-vehicle-result-modal";

  modal.className = "customer-vehicle-result-modal";

  const plate =
    vehicle.plateDisplayEnglish ||
    [
      vehicle.plateNumberEnglish,
      String(vehicle.plateLettersEnglish || "")
        .split("")
        .join(" "),
    ]
      .filter(Boolean)
      .join(" ");

  modal.innerHTML = `
    <div
      class="customer-vehicle-result-backdrop"
      data-close-vehicle-result
    ></div>

    <section
      class="customer-vehicle-result-card"
      role="dialog"
      aria-modal="true"
    >
      <div class="customer-vehicle-result-icon success">
        <i class="fa-solid fa-check"></i>
      </div>

      <h2>Vehicle Created Successfully</h2>

      <p>
        The vehicle has been saved and is now
        available in the driver assignment list.
      </p>

      <div class="customer-vehicle-result-details">
        <strong>${escapeCustomerVehicleHtml(plate)}</strong>

        <span>
          ${escapeCustomerVehicleHtml(
            [vehicle.make, vehicle.model, vehicle.year]
              .filter(Boolean)
              .join(" "),
          )}
        </span>
      </div>

      <button
        type="button"
        data-close-vehicle-result
      >
        Done
      </button>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-vehicle-result]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.remove();
    });
  });
}

function showCustomerVehicleError(message) {
  document.querySelector("#customer-vehicle-error-modal")?.remove();

  const modal = document.createElement("div");

  modal.id = "customer-vehicle-error-modal";

  modal.className = "customer-vehicle-result-modal";

  modal.innerHTML = `
    <div
      class="customer-vehicle-result-backdrop"
      data-close-vehicle-error
    ></div>

    <section
      class="customer-vehicle-result-card"
      role="alertdialog"
      aria-modal="true"
    >
      <div class="customer-vehicle-result-icon error">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>

      <h2>Unable to Save Vehicle</h2>

      <p>
        ${escapeCustomerVehicleHtml(message)}
      </p>

      <button
        type="button"
        data-close-vehicle-error
      >
        Okay
      </button>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-vehicle-error]").forEach((button) => {
    button.addEventListener("click", () => {
      modal.remove();
    });
  });
}

function escapeCustomerVehicleHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetCustomerAddVehicleForm() {
  const page = document.querySelector(".customer-add-vehicle-page");
  const form = page?.querySelector("#customer-add-vehicle-form");

  if (!page || !form) return;

  form.reset();

  // Force every dropdown to its first option.
  page.querySelectorAll("select").forEach((select) => {
    select.selectedIndex = 0;
  });

  // Clear all plate digits and restore invalid state.
  page.querySelectorAll(".vehicle-plate-digit").forEach((input) => {
    input.value = "";
    input.setAttribute("aria-invalid", "true");

    const field = input.closest(".plate-field");
    const status = field?.querySelector(".plate-status-icon");
    const icon = status?.querySelector("i");

    field?.classList.remove("valid");
    field?.classList.add("invalid");

    status?.classList.remove("valid");
    status?.classList.add("invalid");

    icon?.classList.remove("fa-check");
    icon?.classList.add("fa-xmark");
  });

  // Clear normal text fields.
  [
    "#vehicle-model",
    "#vehicle-vin",
    "#vehicle-engine-number",
    "#vehicle-mileage",
    "#vehicle-notes",
  ].forEach((selector) => {
    const field = page.querySelector(selector);

    if (field) {
      field.value = "";
    }
  });

  // Keep this checked if it should be the default.
  const primaryVehicle = page.querySelector("#vehicle-primary");

  if (primaryVehicle) {
    primaryVehicle.checked = true;
  }

  page.refreshVehiclePreview?.();
}

function openCustomerVehiclesTab() {
  window.location.hash = "customer-details";

  setTimeout(() => {
    document
      .querySelector('.customer-details-tab[data-customer-tab="vehicles"]')
      ?.click();
  }, 150);
}

function bindCustomerBookingActions() {
  const createBookingButton = document.querySelector(
    "#create-customer-booking",
  );

  if (!createBookingButton || createBookingButton.dataset.bound === "true") {
    return;
  }

  createBookingButton.dataset.bound = "true";

  createBookingButton.addEventListener("click", () => {
    window.location.hash = "customer-create-booking";
  });
}

function generateUniqueBookingId() {
  const date = new Date();

  const datePart = [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");

  const randomPart = Math.floor(1000 + Math.random() * 9000);

  return `SWG-${datePart}-${randomPart}`;
}

function bindCustomerBookingsList() {
  const panel = document.querySelector('[data-customer-panel="bookings"]');

  if (!panel || panel.dataset.bookingsBound === "true") return;

  panel.dataset.bookingsBound = "true";

  const searchInput = panel.querySelector("#customer-bookings-search");

  const statusFilter = panel.querySelector("#customer-bookings-status-filter");

  const locationFilter = panel.querySelector(
    "#customer-bookings-location-filter",
  );

  const rows = [
    ...panel.querySelectorAll(
      ".customer-booking-row:not(.customer-booking-head)",
    ),
  ];

  const table = panel.querySelector(".customer-bookings-table-scroll");

  const noResults = panel.querySelector("#customer-bookings-no-results");

  const resultCount = panel.querySelector("#customer-bookings-result-count");

  function filterBookings() {
    const searchValue = searchInput?.value.trim().toLowerCase() || "";

    const statusValue = statusFilter?.value || "all";
    const locationValue = locationFilter?.value || "all";

    let visibleCount = 0;

    rows.forEach((row) => {
      const rowText = row.textContent.toLowerCase();
      const rowStatus = row.dataset.bookingStatus;
      const rowLocation = row.dataset.bookingLocation;

      const matchesSearch = !searchValue || rowText.includes(searchValue);

      const matchesStatus = statusValue === "all" || rowStatus === statusValue;

      const matchesLocation =
        locationValue === "all" || rowLocation === locationValue;

      const visible = matchesSearch && matchesStatus && matchesLocation;

      row.classList.toggle("hidden", !visible);

      if (visible) {
        visibleCount += 1;
      }
    });

    table?.classList.toggle("hidden", visibleCount === 0);
    noResults?.classList.toggle("hidden", visibleCount !== 0);

    if (resultCount) {
      resultCount.textContent =
        visibleCount === 0
          ? "No bookings found"
          : `Showing 1 to ${visibleCount} of 24 bookings`;
    }
  }

  searchInput?.addEventListener("input", filterBookings);
  statusFilter?.addEventListener("change", filterBookings);
  locationFilter?.addEventListener("change", filterBookings);

  panel
    .querySelector("#add-new-customer-booking")
    ?.addEventListener("click", () => {
      window.location.hash = "customer-create-booking";
    });

  const actionButtons = panel.querySelectorAll(".customer-booking-more-btn");

  actionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const cell = button.closest(".customer-booking-actions-cell");

      const menu = cell?.querySelector(".customer-booking-actions-menu");

      if (!menu) return;

      panel
        .querySelectorAll(".customer-booking-actions-menu")
        .forEach((item) => {
          if (item !== menu) {
            item.classList.add("hidden");
          }
        });

      const shouldOpen = menu.classList.contains("hidden");

      if (shouldOpen) {
        const rect = button.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 7}px`;
        menu.style.left = `${Math.max(12, rect.right - 190)}px`;
      }

      menu.classList.toggle("hidden");
      button.setAttribute("aria-expanded", String(shouldOpen));
    });
  });

  panel
    .querySelectorAll(".customer-booking-actions-menu button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.bookingAction;
        const bookingId = button.dataset.bookingId;

        panel
          .querySelectorAll(".customer-booking-actions-menu")
          .forEach((menu) => {
            menu.classList.add("hidden");
          });

        if (action === "view") {
          loadCustomerBookingDetailsPage(bookingId);
        }

        if (action === "edit") {
          loadCustomerEditBookingPage(bookingId);
        }

        if (action === "cancel") {
          openCancelBookingModal(bookingId);
        }

        if (action === "receipt") {
          openPrintableBookingReceipt(bookingId);
        }
      });
    });

  document.addEventListener("click", () => {
    panel.querySelectorAll(".customer-booking-actions-menu").forEach((menu) => {
      menu.classList.add("hidden");
    });

    actionButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  });

  panel.querySelectorAll(".customer-booking-id button").forEach((button) => {
    button.addEventListener("click", () => {
      loadCustomerBookingDetailsPage(button.dataset.bookingId);
    });
  });

  applyBookingActionPermissions(panel);

  filterBookings();
}

function applyBookingActionPermissions(scope = document) {
  scope.querySelectorAll("[data-required-permission]").forEach((element) => {
    const permission = element.dataset.requiredPermission;

    const allowed = currentUserPermissions[permission] === true;

    element.classList.toggle("hidden", !allowed);
    element.disabled = !allowed;
  });
}

function bindCustomerPaymentMethodActions() {
  const panel = document.querySelector(
    '[data-customer-panel="payment-methods"]',
  );

  if (!panel || panel.dataset.paymentMethodsBound === "true") {
    return;
  }

  panel.dataset.paymentMethodsBound = "true";

  panel
    .querySelector("#add-customer-payment-method")
    ?.addEventListener("click", () => {
      window.location.hash = "customer-add-payment-method";
    });

  const defaultButtons = [...panel.querySelectorAll(".payment-default-btn")];

  defaultButtons.forEach((button) => {
    button.addEventListener("click", () => {
      defaultButtons.forEach((item) => {
        item.classList.remove("active");
        item.dataset.paymentDefault = "false";

        item.innerHTML = `
          <i class="fa-regular fa-star"></i>
          Set as Default
        `;
      });

      button.classList.add("active");
      button.dataset.paymentDefault = "true";

      button.innerHTML = `
        <i class="fa-solid fa-star"></i>
        Default
      `;
    });
  });

  const moreButtons = [...panel.querySelectorAll(".customer-payment-more-btn")];

  moreButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const cell = button.closest(".customer-payment-actions-cell");

      const menu = cell?.querySelector(".customer-payment-actions-menu");

      if (!menu) return;

      panel
        .querySelectorAll(".customer-payment-actions-menu")
        .forEach((item) => {
          if (item !== menu) {
            item.classList.add("hidden");
          }
        });

      const shouldOpen = menu.classList.contains("hidden");

      if (shouldOpen) {
        const rect = button.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 7}px`;
        menu.style.left = `${Math.max(12, rect.right - 190)}px`;
      }

      menu.classList.toggle("hidden");
    });
  });

  panel
    .querySelectorAll(".customer-payment-actions-menu button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const row = button.closest(".customer-payment-row");

        const paymentId = row?.dataset.paymentId;
        const action = button.dataset.paymentAction;

        if (action === "view") {
          console.log("View payment:", paymentId);
        }

        if (action === "edit") {
          console.log("Edit payment:", paymentId);
        }

        if (action === "remove") {
          const confirmed = window.confirm("Remove this payment method?");

          if (confirmed) {
            row?.remove();
          }
        }

        button
          .closest(".customer-payment-actions-menu")
          ?.classList.add("hidden");
      });
    });

  document.addEventListener("click", () => {
    panel.querySelectorAll(".customer-payment-actions-menu").forEach((menu) => {
      menu.classList.add("hidden");
    });
  });
}

function bindCustomerActivityLog() {
  const panel = document.querySelector('[data-customer-panel="activity-log"]');

  if (!panel || panel.dataset.activityBound === "true") {
    return;
  }

  panel.dataset.activityBound = "true";

  const searchInput = panel.querySelector("#customer-activity-search");

  const typeFilter = panel.querySelector("#customer-activity-filter");

  const rows = [
    ...panel.querySelectorAll(
      ".customer-activity-row:not(.customer-activity-head)",
    ),
  ];

  const table = panel.querySelector(".customer-activity-table-scroll");

  const emptyState = panel.querySelector("#customer-activity-empty");

  const resultCount = panel.querySelector("#customer-activity-count");

  function filterActivities() {
    const searchValue = searchInput?.value.trim().toLowerCase() || "";

    const typeValue = typeFilter?.value || "all";

    let visibleCount = 0;

    rows.forEach((row) => {
      const matchesSearch =
        !searchValue || row.textContent.toLowerCase().includes(searchValue);

      const matchesType =
        typeValue === "all" || row.dataset.activityType === typeValue;

      const visible = matchesSearch && matchesType;

      row.classList.toggle("hidden", !visible);

      if (visible) {
        visibleCount += 1;
      }
    });

    table?.classList.toggle("hidden", visibleCount === 0);
    emptyState?.classList.toggle("hidden", visibleCount !== 0);

    if (resultCount) {
      resultCount.textContent =
        visibleCount === 0
          ? "No activities found"
          : `Showing 1 to ${visibleCount} of 28 activities`;
    }
  }

  searchInput?.addEventListener("input", filterActivities);
  typeFilter?.addEventListener("change", filterActivities);

  panel
    .querySelector("#export-customer-activity")
    ?.addEventListener("click", () => {
      console.log("Export customer activity log");
    });

  filterActivities();
}

/* ADD HERE */
function hideAllCustomerViews() {
  const viewSelectors = [
    "#customers-view",
    "#add-customer-view",
    "#customer-details-view",
    "#edit-customer-view",
    "#customer-add-vehicle-view",
    "#customer-create-booking-view",
    "#customer-edit-booking-view",
    "#customer-booking-details-view",
    "#customer-booking-receipt-view",
  ];

  viewSelectors.forEach((selector) => {
    document.querySelector(selector)?.classList.add("hidden");
  });
}

async function loadCustomerBookingReceiptPage(bookingId = "SWG-260524-0018") {
  const view = document.querySelector("#customer-booking-receipt-view");

  const container = document.querySelector(
    "#customer-booking-receipt-container",
  );

  if (!view || !container) {
    console.error("Booking receipt view or container was not found.");
    return;
  }

  hideAllCustomerViews();
  view.classList.remove("hidden");

  container.innerHTML = `
    <section class="page-loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Loading booking receipt...</p>
    </section>
  `;

  try {
    const response = await fetch("/pages/customer-booking-receipt.html");

    if (!response.ok) {
      throw new Error(`Receipt page failed to load: ${response.status}`);
    }

    container.innerHTML = await response.text();

    bindCustomerBookingReceiptPage(bookingId);
  } catch (error) {
    console.error("Unable to load receipt:", error);

    container.innerHTML = `
      <section class="page-load-error">
        <h2>Unable to load receipt</h2>
        <p>Please refresh the page and try again.</p>
      </section>
    `;
  }
}

async function loadCustomerBookingDetailsPage(bookingId = "SWG-260524-0018") {
  const view = document.querySelector("#customer-booking-details-view");

  if (!view) {
    console.error("Customer Booking Details view was not found.");
    return;
  }

  hideAllCustomerViews();
  view.classList.remove("hidden");

  view.innerHTML = `
    <section class="page-loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Loading booking details...</p>
    </section>
  `;

  try {
    const response = await fetch("/pages/customer-booking-details.html");

    if (!response.ok) {
      throw new Error(`Unable to load booking details: ${response.status}`);
    }

    view.innerHTML = await response.text();

    const bookingIdElement = view.querySelector("#booking-details-id");

    if (bookingIdElement) {
      bookingIdElement.textContent = bookingId;
    }

    bindCustomerBookingDetailsActions(view, bookingId);
  } catch (error) {
    console.error("Unable to load booking details:", error);

    view.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>

        <h2>Unable to load Booking Details</h2>

        <p>Please refresh the page and try again.</p>

        <button
          type="button"
          id="retry-booking-details"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    view
      .querySelector("#retry-booking-details")
      ?.addEventListener("click", () => {
        loadCustomerBookingDetailsPage(bookingId);
      });
  }
}

function bindCustomerBookingDetailsActions(view, bookingId) {
  if (!view) {
    return;
  }

  const backButton = view.querySelector("#back-from-booking-details");

  const editButton = view.querySelector("#edit-booking-details");

  const printButton = view.querySelector("#print-booking-details");

  const moreButton = view.querySelector("#booking-details-more-btn");

  const actionsMenu = view.querySelector("#booking-details-actions-menu");

  const cancelButton = view.querySelector("#cancel-booking-details");

  /*
   * Back to the customer's Bookings tab
   */
  backButton?.addEventListener("click", async (event) => {
    event.preventDefault();

    await loadCustomerDetailsPage("bookings");
  });

  /*
   * Open Edit Booking
   */
  editButton?.addEventListener("click", (event) => {
    event.preventDefault();

    const statusElement = view.querySelector(".booking-detail-status");

    const bookingStatus =
      statusElement?.textContent?.trim().toLowerCase() || "";

    const editableStatuses = ["pending", "confirmed", "in progress"];

    if (!editableStatuses.includes(bookingStatus)) {
      console.warn(`Booking cannot be edited with status: ${bookingStatus}`);

      return;
    }

    loadCustomerEditBookingPage(bookingId);
  });

  /*
   * Open dedicated A4 receipt
   */
  printButton?.addEventListener("click", (event) => {
    event.preventDefault();

    const currentBookingId =
      view.querySelector("#booking-details-id")?.textContent?.trim() ||
      bookingId;

    const url =
      "/pages/customer-booking-receipt-print.html" +
      `?bookingId=${encodeURIComponent(currentBookingId)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  });

  /*
   * More actions menu
   */
  moreButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!actionsMenu) {
      return;
    }

    const shouldOpen = actionsMenu.classList.contains("hidden");

    actionsMenu.classList.toggle("hidden", !shouldOpen);

    moreButton.setAttribute("aria-expanded", String(shouldOpen));
  });

  cancelButton?.addEventListener("click", (event) => {
    event.preventDefault();

    actionsMenu?.classList.add("hidden");

    moreButton?.setAttribute("aria-expanded", "false");

    openCancelBookingModal(bookingId);
  });

  document.addEventListener(
    "click",
    () => {
      actionsMenu?.classList.add("hidden");

      moreButton?.setAttribute("aria-expanded", "false");
    },
    {
      once: true,
    },
  );

  applyBookingActionPermissions(view);
}

async function loadCustomerEditBookingPage(bookingId) {
  const view = document.querySelector("#customer-edit-booking-view");

  const container = document.querySelector("#customer-edit-booking-container");

  if (!view || !container) {
    console.error("Customer Edit Booking view or container was not found.");
    return;
  }

  hideAllCustomerViews();

  view.classList.remove("hidden");

  container.innerHTML = `
    <section class="page-loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Loading booking...</p>
    </section>
  `;

  try {
    const response = await fetch("/pages/customer-edit-booking.html");

    if (!response.ok) {
      throw new Error(`Edit Booking page failed to load: ${response.status}`);
    }

    container.innerHTML = await response.text();

    bindCustomerEditBookingPage(bookingId);
  } catch (error) {
    console.error("Unable to load Edit Booking:", error);

    container.innerHTML = `
      <section class="page-load-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h2>Unable to load Edit Booking</h2>
        <p>Please refresh the page and try again.</p>

        <button
          type="button"
          id="retry-edit-booking-load"
          class="btn-primary"
        >
          Try Again
        </button>
      </section>
    `;

    container
      .querySelector("#retry-edit-booking-load")
      ?.addEventListener("click", () => {
        loadCustomerEditBookingPage(bookingId);
      });
  }
}

function bindEditBookingNavigation(container, bookingId) {
  const backButton = container.querySelector("#back-from-edit-booking");

  const cancelButton = container.querySelector("#cancel-edit-booking");

  const saveButton = container.querySelector("#save-edit-booking");

  const successModal = container.querySelector("#edit-booking-success-modal");

  const closeModalButton = container.querySelector(
    "#close-edit-booking-success",
  );

  const continueButton = container.querySelector("#continue-editing-booking");

  const viewUpdatedButton = container.querySelector("#view-updated-booking");

  const returnToCustomerBookings = () => {
    hideAllCustomerViews();

    const customerDetailsView = document.querySelector(
      "#customer-details-view",
    );

    customerDetailsView?.classList.remove("hidden");

    activateCustomerDetailsTab("bookings");
  };

  backButton?.addEventListener("click", returnToCustomerBookings);

  cancelButton?.addEventListener("click", returnToCustomerBookings);

  saveButton?.addEventListener("click", () => {
    successModal?.classList.remove("hidden");
  });

  closeModalButton?.addEventListener("click", () => {
    successModal?.classList.add("hidden");
  });

  continueButton?.addEventListener("click", () => {
    successModal?.classList.add("hidden");
  });

  viewUpdatedButton?.addEventListener("click", () => {
    successModal?.classList.add("hidden");

    loadCustomerBookingDetailsPage(bookingId);
  });
}

function bindCustomerEditBookingPage(bookingId) {
  const container = document.querySelector("#customer-edit-booking-container");

  if (!container) return;

  const page = container.querySelector(".customer-edit-booking-page");

  if (!page) {
    console.error(".customer-edit-booking-page was not found.");
    return;
  }

  const safeBookingId = bookingId || "SWG-260524-0018";

  page.dataset.bookingId = safeBookingId;

  const bookingIdInput = container.querySelector("#edit-booking-id");

  const summaryBookingId = container.querySelector("#edit-summary-booking-id");

  const updatedBookingId = container.querySelector("#updated-booking-id");

  if (bookingIdInput) {
    bookingIdInput.value = safeBookingId;
  }

  if (summaryBookingId) {
    summaryBookingId.textContent = safeBookingId;
  }

  if (updatedBookingId) {
    updatedBookingId.textContent = safeBookingId;
  }

  bindEditBookingNavigation(container, safeBookingId);

  bindEditBookingTypeButtons(container);
  bindEditBookingLiveSummary(container);
  bindEditBookingNotesCounter(container);
}

function bindCustomerBookingReceiptPage(bookingId) {
  const view = document.querySelector("#customer-booking-receipt-view");

  if (!view) return;

  view
    .querySelectorAll("#receipt-booking-id, #receipt-barcode-id")
    .forEach((element) => {
      element.textContent = bookingId;
    });

  const backButton = view.querySelector("#back-from-booking-receipt");

  const printButton = view.querySelector("#print-booking-receipt");

  const downloadButton = view.querySelector("#download-booking-receipt");

  backButton?.addEventListener("click", () => {
    loadCustomerBookingDetailsPage(bookingId);
  });

  printButton?.addEventListener("click", () => {
    const url =
      `/pages/customer-booking-receipt-print.html` +
      `?bookingId=${encodeURIComponent(bookingId)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  });

  downloadButton?.addEventListener("click", () => {
    window.print();
  });
}

function activateCustomerDetailsTab(tabName) {
  const customerDetailsView = document.querySelector("#customer-details-view");

  if (!customerDetailsView) return;

  customerDetailsView
    .querySelectorAll("[data-customer-tab]")
    .forEach((button) => {
      const active = button.dataset.customerTab === tabName;

      button.classList.toggle("active", active);

      button.setAttribute("aria-selected", String(active));
    });

  customerDetailsView
    .querySelectorAll("[data-customer-panel]")
    .forEach((panel) => {
      const active = panel.dataset.customerPanel === tabName;

      panel.classList.toggle("active", active);

      panel.classList.toggle("hidden", !active);
    });
}

function bindEditBookingTypeButtons(container) {
  const hiddenInput = container.querySelector("#edit-booking-type");

  const buttons = container.querySelectorAll("[data-edit-booking-type]");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      const type =
        button.dataset.editBookingType === "multiple"
          ? "Multiple Entry"
          : "Single Entry";

      if (hiddenInput) {
        hiddenInput.value = type;
      }

      updateEditBookingSummary(container);
    });
  });
}

function bindEditBookingNotesCounter(container) {
  const notes = container.querySelector("#edit-booking-notes");

  const counter = container.querySelector("#edit-booking-notes-count");

  if (!notes || !counter) return;

  const updateCounter = () => {
    counter.textContent = String(notes.value.length);
  };

  notes.addEventListener("input", updateCounter);

  updateCounter();
}

function bindEditBookingLiveSummary(container) {
  const fieldSelectors = [
    "#edit-booking-location",
    "#edit-booking-zone",
    "#edit-booking-entry-date",
    "#edit-booking-entry-time",
    "#edit-booking-exit-date",
    "#edit-booking-exit-time",
    "#edit-booking-vehicle",
    "#edit-booking-payment-method",
    "#edit-booking-amount",
  ];

  fieldSelectors.forEach((selector) => {
    const field = container.querySelector(selector);

    field?.addEventListener("input", () => {
      updateEditBookingSummary(container);
    });

    field?.addEventListener("change", () => {
      updateEditBookingSummary(container);
    });
  });

  updateEditBookingSummary(container);
}

function updateEditBookingSummary(container) {
  const getValue = (selector) =>
    container.querySelector(selector)?.value?.trim() || "—";

  const setText = (selector, value) => {
    const element = container.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  };

  setText("#edit-summary-location", getValue("#edit-booking-location"));

  setText("#edit-summary-zone", getValue("#edit-booking-zone"));

  setText("#edit-summary-type", getValue("#edit-booking-type"));

  setText("#edit-summary-vehicle", getValue("#edit-booking-vehicle"));

  setText(
    "#edit-summary-payment-method",
    getValue("#edit-booking-payment-method"),
  );

  const entryDate = getValue("#edit-booking-entry-date");

  const entryTime = getValue("#edit-booking-entry-time");

  const exitDate = getValue("#edit-booking-exit-date");

  const exitTime = getValue("#edit-booking-exit-time");

  setText("#edit-summary-entry", `${entryDate}, ${entryTime}`);

  setText("#edit-summary-exit", `${exitDate}, ${exitTime}`);

  const amount = getValue("#edit-booking-amount");

  setText(
    "#edit-summary-amount",
    amount === "—" ? "SAR 0.00" : `SAR ${amount}`,
  );
}

function initCustomerTrendCharts() {
  customerTrendCharts.forEach((chart) => chart?.destroy());
  customerTrendCharts = [];

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#customersTrend",
      [12, 15, 13, 18, 14, 24, 20, 28, 31],
      "#16a34a",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#mobileTrend",
      [10, 13, 11, 16, 14, 23, 18, 27, 30],
      "#2563eb",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#newTrend",
      [8, 11, 9, 14, 10, 19, 16, 24, 29],
      "#9333ea",
    ),
  );

  customerTrendCharts.push(
    createCustomerTrendChart(
      "#returnTrend",
      [9, 12, 10, 15, 13, 21, 19, 27, 32],
      "#f97316",
    ),
  );

  customerTrendCharts = customerTrendCharts.filter(Boolean);
}
