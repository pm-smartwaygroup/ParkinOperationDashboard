class DriverDetailsView {
  constructor(options = {}) {
    this.container =
      typeof options.container === "string"
        ? document.querySelector(options.container)
        : options.container;

    this.pageUrl = options.pageUrl || "/pages/driver-details.html";
    this.driverId = options.driverId || null;
    this.driverData = options.driverData || null;

    this.bound = false;
    this.handleDocumentClick = null;
  }

  async load(driverId) {
    if (!this.container) {
      console.error("Driver Details container was not found.");
      return;
    }

    this.driverId = driverId || this.driverId;

    if (!this.driverId) {
      this.renderError(
        error?.message || "Please refresh the page and try again.",
      );
      return;
    }

    this.container.innerHTML = `
      <section class="page-loading-state">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Loading driver details...</p>
      </section>
    `;

    try {
      const [pageResponse, driverResponse] = await Promise.all([
        fetch(this.pageUrl),
        this.fetchDriverDetails(this.driverId),
      ]);

      if (!pageResponse.ok) {
        throw new Error(
          `Unable to load Driver Details page: ${pageResponse.status}`,
        );
      }

      this.container.innerHTML = await pageResponse.text();

      this.driverData = this.mapDriverData(driverResponse);
      this.bound = false;

      this.bind();
      this.renderDriver();
    } catch (error) {
      console.error("Unable to load Driver Details:", error);

      this.renderError(
        error?.message || "Please refresh the page and try again.",
      );
    }
  }

  async fetchDriverDetails(driverId) {
    const response = await fetch(
      `${getDriverApiBaseUrl()}/drivers/${encodeURIComponent(driverId)}`,
      {
        method: "GET",
        headers: getDriverAuthHeaders(),
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const message = Array.isArray(result?.message)
        ? result.message.join(", ")
        : result?.message ||
          result?.error ||
          `Unable to load driver details: ${response.status}`;

      throw new Error(message);
    }

    return result?.data ?? result;
  }

  async updateDocumentVerification(documentId, verificationStatus) {
    const response = await fetch(
      `${getDriverApiBaseUrl()}/drivers/documents/${encodeURIComponent(
        documentId,
      )}/verification`,
      {
        method: "PATCH",
        headers: {
          ...getDriverAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verificationStatus,
        }),
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        result?.message ||
          result?.error ||
          "Unable to update document verification",
      );
    }

    return result?.data ?? result;
  }

  async handleDocumentVerification(
    documentId,
    verificationStatus,
    clickedButton,
  ) {
    const actionLabel =
      verificationStatus === "VERIFIED" ? "Verifying..." : "Rejecting...";

    const originalButtonHtml = clickedButton?.innerHTML || "";

    const actionButtons = this.container.querySelectorAll(
      `[data-document-id="${documentId}"]`,
    );

    try {
      actionButtons.forEach((button) => {
        button.disabled = true;
      });

      if (clickedButton) {
        clickedButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        ${actionLabel}
      `;
      }

      await this.updateDocumentVerification(documentId, verificationStatus);

      const refreshedDriver = await this.fetchDriverDetails(this.driverId);

      this.driverData = this.mapDriverData(refreshedDriver);

      this.renderDocuments(this.driverData);
      this.renderDocumentsTab(this.driverData);
    } catch (error) {
      console.error("Unable to update document verification:", error);

      window.alert(
        error?.message || "Unable to update the document verification status.",
      );

      actionButtons.forEach((button) => {
        button.disabled = false;
      });

      if (clickedButton) {
        clickedButton.innerHTML = originalButtonHtml;
      }
    }
  }

  mapDriverData(driver) {
    const currentAssignment =
      driver?.currentAssignment ||
      driver?.assignments?.find((assignment) => assignment.isPrimary) ||
      driver?.assignments?.[0] ||
      null;

    const summary = driver?.summary || {};

    const averageRating =
      summary.averageRating === null ||
      summary.averageRating === undefined ||
      summary.averageRating === ""
        ? null
        : Number(summary.averageRating);

    const reviewCount = Number(summary.reviewCount || 0);

    return {
      raw: driver,

      id: driver?.driverCode || driver?.id || "—",
      databaseId: driver?.id || null,

      name:
        driver?.fullName ||
        [driver?.firstName, driver?.middleName, driver?.lastName]
          .filter(Boolean)
          .join(" ") ||
        "Unnamed Driver",

      phone:
        `${driver?.phoneCountryCode || ""} ${driver?.phoneNumber || ""}`
          .replace(/\s+/g, " ")
          .trim() || "—",

      email: driver?.email || "—",

      company:
        driver?.assignedCompany?.name ||
        currentAssignment?.company?.name ||
        driver?.employment?.company?.name ||
        driver?.company?.name ||
        "—",

      type: this.formatDriverType(driver?.driverType),

      licenseNumber: driver?.licenseNumber || "—",
      licenseExpiry: this.formatDate(driver?.licenseExpiryDate),

      idNumber: driver?.idNumber || "—",
      idExpiry: this.formatDate(driver?.idExpiryDate),

      nationality: this.formatEnum(driver?.nationality),

      branch:
        currentAssignment?.location?.name ||
        currentAssignment?.location?.city ||
        "Not assigned",

      location: currentAssignment?.location?.name || "Not assigned",

      zone: currentAssignment?.zoneCode || "—",

      shift: this.formatEnum(currentAssignment?.shiftCode),

      supervisor:
        driver?.supervisor?.name ||
        driver?.supervisor?.fullName ||
        currentAssignment?.supervisor?.name ||
        currentAssignment?.supervisor?.fullName ||
        driver?.employment?.supervisor?.name ||
        driver?.employment?.supervisor?.fullName ||
        "Not assigned",

      joinedAt: this.formatDate(
        driver?.joiningDate || driver?.employment?.joiningDate,
      ),

      rating:
        averageRating === null || Number.isNaN(averageRating)
          ? "—"
          : averageRating.toFixed(1),

      reviewCount,

      status: this.formatDriverStatus(driver?.status),
      rawStatus: driver?.status || "",

      photo: driver?.profilePhotoUrl || "",

      summary: {
        totalBookings: Number(summary.totalBookings || 0),
        activeAssignments: Number(summary.activeAssignments || 0),
        assignedVehicles: Number(summary.assignedVehicles || 0),
        averageRating,
        reviewCount,
      },

      currentAssignment,

      assignments: Array.isArray(driver?.assignments) ? driver.assignments : [],

      documents: Array.isArray(driver?.documents) ? driver.documents : [],

      activities: Array.isArray(driver?.activities) ? driver.activities : [],
    };
  }

  formatDriverType(value) {
    const labels = {
      OTHER: "Independent Driver",
      VALET_DRIVER: "Valet Company Driver",
      PARKING_ATTENDANT: "Parking Attendant",
      SUPERVISOR: "Supervisor",
      SHUTTLE_DRIVER: "Shuttle Driver",
    };

    return labels[value] || this.formatEnum(value);
  }

  formatDriverStatus(value) {
    const labels = {
      ACTIVE: "Active",
      ON_DUTY: "On Duty",
      OFF_DUTY: "Off Duty",
      ON_BREAK: "On Break",
      SUSPENDED: "Suspended",
      PENDING_ACTIVATION: "Pending Activation",
      INACTIVE: "Inactive",
    };

    return labels[value] || this.formatEnum(value);
  }

  formatDocumentLabel(value) {
    const labels = {
      NATIONAL_ID_FRONT: "National ID - Front",
      NATIONAL_ID_BACK: "National ID - Back",

      DRIVING_LICENSE_FRONT: "Driving Licence - Front",
      DRIVING_LICENSE_BACK: "Driving Licence - Back",

      EMPLOYMENT_CONTRACT: "Employment Contract",
      MEDICAL_CERTIFICATE: "Medical Certificate",
      BACKGROUND_CHECK: "Background Check",

      PASSPORT: "Passport",
      COMPANY_ID: "Company ID",
      OTHER: "Other Document",
    };

    return labels[value] || this.formatEnum(value);
  }

  formatEnum(value) {
    if (!value) {
      return "—";
    }

    return String(value)
      .trim()
      .toLowerCase()
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  formatDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  formatDateTime(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  formatFileSize(bytes) {
    const numericBytes = Number(bytes || 0);

    if (!numericBytes) {
      return "—";
    }

    const units = ["B", "KB", "MB", "GB"];

    const unitIndex = Math.min(
      Math.floor(Math.log(numericBytes) / Math.log(1024)),
      units.length - 1,
    );

    const size = numericBytes / 1024 ** unitIndex;

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  getStatusClass(status) {
    return String(status || "")
      .trim()
      .toLowerCase()
      .replaceAll("_", "-")
      .replaceAll(" ", "-");
  }

  getDocumentStatusClass(status) {
    const normalizedStatus = String(status || "")
      .trim()
      .toUpperCase();

    const statusClasses = {
      VERIFIED: "confirmed",
      APPROVED: "confirmed",
      VALID: "confirmed",

      PENDING: "pending",
      PENDING_ACTIVATION: "pending",
      EXPIRING_SOON: "expiring",

      REJECTED: "rejected",
      EXPIRED: "expired",
    };

    return statusClasses[normalizedStatus] || "pending";
  }

  renderError(message) {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = `
    <section class="page-load-error">
      <i class="fa-solid fa-triangle-exclamation"></i>

      <h2>Unable to load Driver Details</h2>

      <p>${this.escapeHtml(message)}</p>

      <button
        type="button"
        class="btn-primary"
        id="retry-driver-details"
      >
        Try Again
      </button>
    </section>
  `;

    this.container
      .querySelector("#retry-driver-details")
      ?.addEventListener("click", () => {
        this.load(this.driverId);
      });
  }

  bind() {
    if (!this.container || this.bound) {
      return;
    }

    this.bound = true;

    this.bindNavigation();
    this.bindTabs();
    this.bindActions();
  }

  bindNavigation() {
    this.container
      .querySelector("#back-to-drivers")
      ?.addEventListener("click", () => {
        window.location.hash = "drivers";
      });
  }

  bindTabs() {
    const tabs = this.container.querySelectorAll("[data-driver-details-tab]");

    const panels = this.container.querySelectorAll(
      "[data-driver-details-panel]",
    );

    const activateTab = (tabName) => {
      tabs.forEach((tab) => {
        const isActive = tab.dataset.driverDetailsTab === tabName;

        tab.classList.toggle("active", isActive);

        tab.setAttribute("aria-selected", String(isActive));
      });

      panels.forEach((panel) => {
        const isActive = panel.dataset.driverDetailsPanel === tabName;

        panel.classList.toggle("active", isActive);

        panel.classList.toggle("hidden", !isActive);
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        activateTab(tab.dataset.driverDetailsTab);
      });
    });

    this.container
      .querySelectorAll("[data-open-driver-tab]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          activateTab(button.dataset.openDriverTab);
        });
      });
  }

  bindActions() {
    if (this.handleDocumentClick) {
      document.removeEventListener("click", this.handleDocumentClick);

      this.handleDocumentClick = null;
    }

    this.container
      .querySelector("#edit-driver-details")
      ?.addEventListener("click", () => {
        sessionStorage.setItem("selectedDriverId", this.driverId);

        window.location.hash = `edit-driver?id=${encodeURIComponent(this.driverId)}`;
      });

    this.container
      .querySelector("#suspend-driver-details")
      ?.addEventListener("click", () => {
        console.log("Suspend driver:", this.driverId);
      });

    const moreButton = this.container.querySelector("#driver-details-more-btn");

    const moreMenu = this.container.querySelector("#driver-details-more-menu");

    moreButton?.addEventListener("click", (event) => {
      event.stopPropagation();

      const shouldOpen = moreMenu?.classList.contains("hidden");

      moreMenu?.classList.toggle("hidden", !shouldOpen);

      moreButton.setAttribute("aria-expanded", String(shouldOpen));
    });

    this.handleDocumentClick = (event) => {
      if (
        moreMenu?.contains(event.target) ||
        moreButton?.contains(event.target)
      ) {
        return;
      }

      moreMenu?.classList.add("hidden");

      moreButton?.setAttribute("aria-expanded", "false");
    };

    document.addEventListener("click", this.handleDocumentClick);
  }

  setDriverData(driverData) {
    this.driverData = this.mapDriverData(driverData);

    this.renderDriver();
  }

  renderDriver() {
    const driver = this.driverData;

    if (!driver || !this.container) {
      return;
    }

    this.renderHeader(driver);
    this.renderSummary(driver);
    this.renderCurrentAssignment(driver);
    this.renderDocuments(driver);
    this.renderActivities(driver);

    this.renderAssignedVehiclesEmptyState();
    this.renderRecentBookingsEmptyState();
    this.renderPerformanceEmptyState();

    this.renderAssignmentsTab(driver);
    this.renderDocumentsTab(driver);
    this.renderActivityTab(driver);
  }

  renderHeader(driver) {
    this.setText("#driver-details-id", driver.id);

    this.setText("#driver-details-name", driver.name);

    this.setText("#driver-details-phone", driver.phone);

    this.setText("#driver-details-email", driver.email);

    this.setText("#driver-details-company", driver.company);

    this.setText("#driver-details-assigned-company", driver.company);

    this.setText("#driver-details-type", driver.type);

    this.setText("#driver-details-license", driver.licenseNumber);

    this.setText("#driver-details-license-expiry", driver.licenseExpiry);

    this.setText("#driver-details-iqama", driver.idNumber);

    this.setText("#driver-details-iqama-expiry", driver.idExpiry);

    this.setText("#driver-details-nationality", driver.nationality);

    this.setText("#driver-details-branch", driver.branch);

    this.setText("#driver-details-supervisor", driver.supervisor);

    this.setText("#driver-details-joining", driver.joinedAt);

    this.setText("#driver-overview-joined", driver.joinedAt);

    this.setText("#driver-details-rating", driver.rating);

    this.setText(
      "#driver-details-reviews",
      `(${driver.reviewCount} ${
        driver.reviewCount === 1 ? "review" : "reviews"
      })`,
    );

    const photo = this.container.querySelector("#driver-details-photo");

    if (photo) {
      photo.alt = driver.name;

      if (driver.photo) {
        photo.src = driver.photo;

        photo.onerror = () => {
          photo.onerror = null;

          photo.src = "/public/assets/default-driver-avatar.png";
        };
      } else {
        photo.src = "/public/assets/default-driver-avatar.png";
      }
    }

    const status = this.container.querySelector("#driver-details-duty-status");

    if (status) {
      status.textContent = driver.status;

      status.className =
        "driver-details-status " + this.getStatusClass(driver.status);
    }

    const suspendButton = this.container.querySelector(
      "#suspend-driver-details",
    );

    if (suspendButton) {
      const isSuspended = driver.rawStatus === "SUSPENDED";

      suspendButton.innerHTML = isSuspended
        ? `
          <i class="fa-solid fa-circle-play"></i>
          Activate Driver
        `
        : `
          <i class="fa-solid fa-circle-pause"></i>
          Suspend Driver
        `;
    }
  }

  renderSummary(driver) {
    this.setText(
      "#driver-total-bookings",
      driver.summary.totalBookings.toLocaleString("en-GB"),
    );

    this.setText(
      "#driver-active-assignments",
      driver.summary.activeAssignments.toLocaleString("en-GB"),
    );

    this.setText(
      "#driver-assigned-vehicles",
      driver.summary.assignedVehicles.toLocaleString("en-GB"),
    );

    this.setText("#driver-overview-rating", driver.rating);

    const ratingElement = this.container.querySelector(
      "#driver-overview-rating",
    );

    const ratingCard = ratingElement?.closest("article");

    const reviewElement = ratingCard?.querySelector("small:last-child");

    if (reviewElement) {
      reviewElement.textContent = `(${driver.reviewCount} ${
        driver.reviewCount === 1 ? "review" : "reviews"
      })`;
    }
  }

  renderCurrentAssignment(driver) {
    const panel = this.findPanelByHeading("Current Assignment");

    if (!panel) {
      return;
    }

    const assignment = driver.currentAssignment;

    const assignmentStatus = assignment
      ? this.formatEnum(assignment.status)
      : "Not Assigned";

    const headingStatus = panel.querySelector(
      ".driver-detail-panel-heading span",
    );

    if (headingStatus) {
      headingStatus.textContent = assignmentStatus;

      headingStatus.className =
        "driver-details-status " + this.getStatusClass(assignmentStatus);
    }

    const rows = panel.querySelectorAll(".driver-assignment-list > div");

    const values = [
      driver.company,

      assignment?.location?.name || "Not assigned",

      assignment?.zoneCode || "—",

      this.formatEnum(assignment?.shiftCode),

      driver.supervisor,

      assignmentStatus,
    ];

    rows.forEach((row, index) => {
      const valueElement = row.querySelector("dd");

      if (!valueElement) {
        return;
      }

      if (index === 5) {
        valueElement.innerHTML = `
          <span
            class="driver-details-status ${this.getStatusClass(
              assignmentStatus,
            )}"
          >
            ${this.escapeHtml(assignmentStatus)}
          </span>
        `;
      } else {
        valueElement.textContent = values[index] || "—";
      }
    });
  }
  renderDocuments(driver) {
    const panel = this.findPanelByHeading("Documents & Compliance");

    if (!panel) {
      return;
    }

    const list = panel.querySelector(".driver-document-list");

    if (!list) {
      return;
    }

    if (!driver.documents.length) {
      list.innerHTML = this.getEmptyStateMarkup(
        "fa-regular fa-folder-open",
        "No documents available",
        "Uploaded driver documents will appear here.",
      );

      return;
    }

    const previewDocuments = driver.documents.slice(0, 4);

    list.innerHTML = previewDocuments
      .map((document) => {
        const status = this.getDocumentVerificationStatus(document);

        const statusClass = this.getDocumentStatusClass(status);

        const expiryDate =
          document.expiryDate ||
          document.validUntil ||
          this.getFallbackDocumentExpiry(document, driver);

        const expiryText = expiryDate
          ? this.formatDate(expiryDate)
          : "No expiry";

        const downloadUrl =
          document.downloadUrl || document.signedUrl || document.url || "";

        return `
          <div>
            <span
              title="${this.escapeHtml(
                document.originalName || document.fileName || "",
              )}"
            >
              <i class="fa-regular fa-file-lines"></i>

              ${this.escapeHtml(
                this.formatDocumentLabel(document.documentType),
              )}
            </span>

            <strong 
              class="driver-document-status ${statusClass}">
              ${this.escapeHtml(this.formatDocumentStatus(status))}
            </strong>

            <small>
              ${this.escapeHtml(expiryText)}
            </small>

            ${
              downloadUrl
                ? `
                  <button
                    type="button"
                    data-driver-document-url="${this.escapeHtml(downloadUrl)}"
                    aria-label="View ${this.escapeHtml(
                      this.formatDocumentLabel(document.documentType),
                    )}"
                  >
                    View
                  </button>
                `
                : "<span>—</span>"
            }
          </div>
        `;
      })
      .join("");

    list.querySelectorAll("[data-driver-document-url]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.dataset.driverDocumentUrl;

        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      });
    });
  }

  renderActivities(driver) {
    const panel = this.findPanelByHeading("Activity Timeline");

    if (!panel) {
      return;
    }

    const timeline = panel.querySelector("ol");

    if (!timeline) {
      return;
    }

    if (!driver.activities.length) {
      timeline.innerHTML = `
        <li>
          <span></span>

          <strong>No activity yet</strong>

          <p>
            Driver activity will appear here.
          </p>

          <time>—</time>
        </li>
      `;

      return;
    }

    timeline.innerHTML = driver.activities
      .slice(0, 6)
      .map((activity) => {
        const title =
          activity.title ||
          this.formatEnum(activity.action || activity.eventType) ||
          "Driver activity";

        const description =
          activity.description || activity.message || activity.details || "—";

        const createdAt =
          activity.createdAt || activity.timestamp || activity.date;

        return `
          <li>
            <span></span>

            <strong>
              ${this.escapeHtml(title)}
            </strong>

            <p>
              ${this.escapeHtml(description)}
            </p>

            <time>
              ${this.escapeHtml(this.formatDateTime(createdAt))}
            </time>
          </li>
        `;
      })
      .join("");
  }

  renderAssignedVehiclesEmptyState() {
    const panel = this.findPanelByHeading("Assigned Vehicles");

    if (!panel) {
      return;
    }

    panel.querySelectorAll(".driver-assigned-vehicle").forEach((element) => {
      element.remove();
    });

    if (!panel.querySelector(".driver-section-empty-state")) {
      panel.insertAdjacentHTML(
        "beforeend",
        this.getEmptyStateMarkup(
          "fa-solid fa-car",
          "No assigned vehicles",
          "Vehicles assigned to this driver will appear here.",
        ),
      );
    }
  }

  renderRecentBookingsEmptyState() {
    const panel = this.findPanelByHeading("Recent Bookings");

    if (!panel) {
      return;
    }

    const table = panel.querySelector(".driver-bookings-table");

    if (!table) {
      return;
    }

    table.innerHTML = this.getEmptyStateMarkup(
      "fa-regular fa-calendar",
      "No bookings available",
      "Booking history will appear here once available.",
    );
  }

  renderPerformanceEmptyState() {
    const panel = this.findPanelByHeading("Performance Summary");

    if (!panel) {
      return;
    }

    panel.querySelector(".driver-performance-metrics")?.remove();

    panel.querySelector("select")?.remove();

    if (!panel.querySelector(".driver-section-empty-state")) {
      panel.insertAdjacentHTML(
        "beforeend",
        this.getEmptyStateMarkup(
          "fa-solid fa-chart-column",
          "Performance analytics coming soon",
          "Metrics will appear after operational data is collected.",
        ),
      );
    }
  }

  renderAssignmentsTab(driver) {
    const container = this.container.querySelector(
      "#driver-assignments-container",
    );

    if (!container) {
      return;
    }

    if (!driver.assignments.length) {
      container.innerHTML = this.getEmptyStateMarkup(
        "fa-regular fa-building",
        "No assignments available",
        "This driver has no assignments.",
      );

      return;
    }

    container.innerHTML = driver.assignments
      .map((assignment, index) => {
        const company = assignment.company?.name || driver.company;

        const location = assignment.location?.name || "Not assigned";

        const supervisor = assignment.supervisor?.name || driver.supervisor;

        const shift = this.formatEnum(assignment.shiftCode);

        const assignedDate = this.formatDate(
          assignment.validFrom || assignment.startDate || assignment.createdAt,
        );

        const status = this.formatEnum(assignment.status);

        return `

<div class="driver-assignment-card">

<div class="driver-assignment-header">

<div class="driver-assignment-title">

<i class="fa-solid fa-building"></i>

<h3>

${assignment.isPrimary ? "Primary Assignment" : `Assignment ${index + 1}`}

</h3>

</div>

<span class="driver-details-status ${this.getStatusClass(status)}">

${status}

</span>

</div>

<div class="driver-assignment-grid">

<div class="driver-assignment-item">
<span>Company</span>
<strong>${company}</strong>
</div>

<div class="driver-assignment-item">
<span>Location</span>
<strong>${location}</strong>
</div>

<div class="driver-assignment-item">
<span>Parking Zone</span>
<strong>${assignment.zoneCode || "—"}</strong>
</div>

<div class="driver-assignment-item">
<span>Shift</span>
<strong>${shift}</strong>
</div>

<div class="driver-assignment-item">
<span>Supervisor</span>
<strong>${supervisor}</strong>
</div>

<div class="driver-assignment-item">
<span>Assignment Date</span>
<strong>${assignedDate}</strong>
</div>

<div class="driver-assignment-item">
<span>Primary Assignment</span>

<strong>

${assignment.isPrimary ? '<span class="driver-primary-badge">Yes</span>' : "No"}

</strong>

</div>

<div class="driver-assignment-item">
<span>Status</span>
<strong>${status}</strong>
</div>

</div>

</div>

`;
      })
      .join("");
  }

  renderDocumentsTab(driver) {
    const panel = this.container.querySelector(
      '[data-driver-details-panel="documents"]',
    );

    if (!panel) {
      return;
    }

    if (!driver.documents.length) {
      panel.innerHTML = `
      <div class="driver-placeholder-panel">
        ${this.getEmptyStateMarkup(
          "fa-regular fa-folder-open",
          "No documents available",
          "Uploaded documents will appear here.",
        )}
      </div>
    `;

      return;
    }

    panel.innerHTML = `
    <section class="driver-documents-section">
      <header class="driver-documents-header">
        <div>
          <h2>Driver Documents</h2>
          <p>
            Review uploaded files, verification status and document details.
          </p>
        </div>

        <span class="driver-documents-count">
          ${driver.documents.length}
          ${driver.documents.length === 1 ? "Document" : "Documents"}
        </span>
      </header>

      <div class="driver-documents-table-wrap">
        <div class="driver-documents-table">
          <div class="driver-documents-row driver-documents-head">
            <span>Document</span>
            <span>Original File</span>
            <span>Uploaded</span>
            <span>Expiry</span>
            <span>File Size</span>
            <span>Status</span>
            <span>Action</span>
          </div>

          ${driver.documents
            .map((document) => {
              const status = this.getDocumentVerificationStatus(document);

              const expiryDate =
                document.expiryDate ||
                document.validUntil ||
                this.getFallbackDocumentExpiry(document, driver);

              const downloadUrl =
                document.downloadUrl ||
                document.signedUrl ||
                document.url ||
                "";

              const fileName =
                document.originalName || document.fileName || "Unnamed file";

              return `
                <div class="driver-documents-row">
                  <div class="driver-document-type-cell">
                    <span class="driver-document-file-icon">
                      <i class="${this.getDocumentFileIcon(
                        document.mimeType,
                      )}"></i>
                    </span>

                    <div>
                      <strong>
                        ${this.escapeHtml(
                          this.formatDocumentLabel(document.documentType),
                        )}
                      </strong>

                      <small>
                        ${this.escapeHtml(
                          document.mimeType || "Unknown format",
                        )}
                      </small>
                    </div>
                  </div>

                  <span
                    class="driver-document-file-name"
                    title="${this.escapeHtml(fileName)}"
                  >
                    ${this.escapeHtml(fileName)}
                  </span>

                  <span>
                    ${this.escapeHtml(this.formatDateTime(document.uploadedAt))}
                  </span>

                  <span>
                    ${
                      expiryDate
                        ? this.escapeHtml(this.formatDate(expiryDate))
                        : '<span class="driver-document-muted">No expiry</span>'
                    }
                  </span>

                  <span>
                    ${this.escapeHtml(
                      this.formatFileSize(
                        document.sizeBytes || document.fileSize,
                      ),
                    )}
                  </span>

                  <span
                    class="driver-document-status ${this.getDocumentStatusClass(
                      status,
                    )}"
                  >
                    ${this.escapeHtml(this.formatDocumentStatus(status))}
                  </span>

                    <div class="driver-document-actions">
  ${
    downloadUrl
      ? `
        <button
          type="button"
          class="driver-document-action-btn view"
          data-driver-document-url="${this.escapeHtml(downloadUrl)}"
        >
          <i class="fa-regular fa-eye"></i>
          View
        </button>
      `
      : `
        <span class="driver-document-muted">
          Unavailable
        </span>
      `
  }

  ${
    status === "PENDING"
      ? `
        <button
          type="button"
          class="driver-document-action-btn verify"
          data-document-id="${this.escapeHtml(document.id)}"
        >
          <i class="fa-solid fa-check"></i>
          Verify
        </button>

        <button
          type="button"
          class="driver-document-action-btn reject"
          data-document-id="${this.escapeHtml(document.id)}"
        >
          <i class="fa-solid fa-xmark"></i>
          Reject
        </button>
      `
      : ""
  }
</div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    </section>
  `;

    panel.querySelectorAll("[data-driver-document-url]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.dataset.driverDocumentUrl;

        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      });
    });
    panel
      .querySelectorAll(".driver-document-action-btn.verify")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const documentId = button.dataset.documentId;

          if (!documentId) {
            return;
          }

          const confirmed = await this.showDocumentConfirmation({
            type: "verify",
            title: "Verify document?",
            message:
              "This document will be marked as confirmed and approved for this driver.",
            confirmText: "Verify Document",
          });

          if (!confirmed) {
            return;
          }

          await this.handleDocumentVerification(documentId, "VERIFIED", button);
        });
      });

    panel
      .querySelectorAll(".driver-document-action-btn.reject")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const documentId = button.dataset.documentId;

          if (!documentId) {
            return;
          }

          const confirmed = await this.showDocumentConfirmation({
            type: "reject",
            title: "Reject document?",
            message:
              "This document will be marked as rejected. A replacement may be required.",
            confirmText: "Reject Document",
          });

          if (!confirmed) {
            return;
          }

          await this.handleDocumentVerification(documentId, "REJECTED", button);
        });
      });
  }

  showDocumentConfirmation({
    type = "verify",
    title,
    message,
    confirmText = "Confirm",
  }) {
    return new Promise((resolve) => {
      document.querySelector("#driver-document-confirm-modal")?.remove();

      const isReject = type === "reject";

      const modal = document.createElement("div");

      modal.id = "driver-document-confirm-modal";
      modal.className = "edit-driver-confirm-modal";

      modal.innerHTML = `
      <div
        class="edit-driver-confirm-backdrop"
        data-confirm-close
      ></div>

      <section
        class="edit-driver-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="driver-document-confirm-title"
      >
        <button
          type="button"
          class="edit-driver-confirm-close"
          data-confirm-close
          aria-label="Close"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

        <div class="edit-driver-confirm-icon ${isReject ? "reject" : "verify"}">
          <i class="fa-solid ${
            isReject ? "fa-triangle-exclamation" : "fa-circle-check"
          }"></i>
        </div>

        <span class="edit-driver-confirm-label ${
          isReject ? "reject" : "verify"
        }">
          ${isReject ? "Action Required" : "Document Review"}
        </span>

        <h2 id="driver-document-confirm-title">
          ${this.escapeHtml(title)}
        </h2>

        <p>
          ${this.escapeHtml(message)}
        </p>

        <div class="edit-driver-confirm-actions">
          <button
            type="button"
            class="edit-driver-confirm-cancel"
            data-confirm-close
          >
            Cancel
          </button>

          <button
            type="button"
            class="edit-driver-confirm-submit ${isReject ? "reject" : "verify"}"
            data-confirm-submit
          >
            <i class="fa-solid ${isReject ? "fa-xmark" : "fa-check"}"></i>

            ${this.escapeHtml(confirmText)}
          </button>
        </div>
      </section>
    `;

      document.body.appendChild(modal);

      let closed = false;

      const close = (result) => {
        if (closed) {
          return;
        }

        closed = true;

        document.removeEventListener("keydown", handleKeydown);

        modal.classList.add("closing");

        window.setTimeout(() => {
          modal.remove();
          resolve(result);
        }, 160);
      };

      const handleKeydown = (event) => {
        if (event.key === "Escape") {
          close(false);
        }
      };

      modal.querySelectorAll("[data-confirm-close]").forEach((element) => {
        element.addEventListener("click", () => {
          close(false);
        });
      });

      modal
        .querySelector("[data-confirm-submit]")
        ?.addEventListener("click", () => {
          close(true);
        });

      document.addEventListener("keydown", handleKeydown);

      requestAnimationFrame(() => {
        modal.classList.add("visible");

        modal.querySelector("[data-confirm-submit]")?.focus();
      });
    });
  }

  renderActivityTab(driver) {
    const panel = this.container.querySelector(
      '[data-driver-details-panel="activity"]',
    );

    if (!panel) {
      return;
    }

    if (!driver.activities.length) {
      panel.innerHTML = `
        <div class="driver-placeholder-panel">
          ${this.getEmptyStateMarkup(
            "fa-regular fa-clock",
            "No activity available",
            "Driver activity history will appear here.",
          )}
        </div>
      `;

      return;
    }

    panel.innerHTML = `
      <div
        class="driver-placeholder-panel"
        style="text-align:left;"
      >
        <h2>Activity Log</h2>

        <ol
          class="driver-full-activity-list"
          style="
            list-style:none;
            padding:0;
            margin:20px 0 0;
          "
        >
          ${driver.activities
            .map((activity) => {
              const title =
                activity.title ||
                this.formatEnum(activity.action || activity.eventType) ||
                "Driver activity";

              const description =
                activity.description ||
                activity.message ||
                activity.details ||
                "—";

              const createdAt =
                activity.createdAt || activity.timestamp || activity.date;

              const actorName =
                activity.actor?.name ||
                activity.actor?.fullName ||
                activity.performedBy?.name ||
                "";

              return `
                <li
                  style="
                    padding:14px 0;
                    border-bottom:
                      1px solid #edf1ef;
                  "
                >
                  <strong>
                    ${this.escapeHtml(title)}
                  </strong>

                  <p
                    style="
                      margin:6px 0;
                      color:#64748b;
                    "
                  >
                    ${this.escapeHtml(description)}
                  </p>

                  <small
                    style="color:#64748b;"
                  >
                    ${this.escapeHtml(this.formatDateTime(createdAt))}

                    ${actorName ? ` · ${this.escapeHtml(actorName)}` : ""}
                  </small>
                </li>
              `;
            })
            .join("")}
        </ol>
      </div>
    `;
  }
  getEmptyStateMarkup(iconClass, title, description) {
    return `
      <div
        class="driver-section-empty-state"
        style="
          display:grid;
          place-items:center;
          gap:8px;
          min-height:120px;
          padding:22px;
          text-align:center;
          color:#64748b;
        "
      >
        <i
          class="${this.escapeHtml(iconClass)}"
          style="
            font-size:22px;
            color:#94a3b8;
          "
        ></i>

        <strong style="color:#334155;">
          ${this.escapeHtml(title)}
        </strong>

        <small>
          ${this.escapeHtml(description)}
        </small>
      </div>
    `;
  }

  findPanelByHeading(headingText) {
    return Array.from(
      this.container.querySelectorAll(".driver-detail-panel"),
    ).find((panel) => {
      const heading = panel.querySelector(
        ".driver-detail-panel-heading h3",
      )?.textContent;

      return heading?.replace(/\s+/g, " ").trim() === headingText;
    });
  }

  setText(selector, value) {
    const element = this.container.querySelector(selector);

    if (element) {
      element.textContent = value ?? "—";
    }
  }

  destroy() {
    if (this.handleDocumentClick) {
      document.removeEventListener("click", this.handleDocumentClick);

      this.handleDocumentClick = null;
    }

    this.container = null;
    this.driverData = null;
    this.bound = false;
  }

  getDocumentVerificationStatus(document) {
    const value =
      document?.verificationStatus ??
      document?.verification_status ??
      document?.complianceStatus ??
      document?.compliance_status ??
      "PENDING";

    return String(value).trim().toUpperCase();
  }

  formatDocumentStatus(value) {
    const labels = {
      PENDING: "Pending",
      VERIFIED: "Confirmed",
      APPROVED: "Confirmed",
      REJECTED: "Rejected",
      EXPIRED: "Expired",
      EXPIRING_SOON: "Expiring Soon",
    };

    return labels[value] || this.formatEnum(value);
  }

  getFallbackDocumentExpiry(document, driver) {
    const documentType = String(document?.documentType || "").toUpperCase();

    if (
      documentType === "NATIONAL_ID_FRONT" ||
      documentType === "NATIONAL_ID_BACK"
    ) {
      return driver?.raw?.idExpiryDate || null;
    }

    if (
      documentType === "DRIVING_LICENSE_FRONT" ||
      documentType === "DRIVING_LICENSE_BACK"
    ) {
      return driver?.raw?.licenseExpiryDate || null;
    }

    return null;
  }

  getDocumentFileIcon(mimeType) {
    const value = String(mimeType || "").toLowerCase();

    if (value.includes("pdf")) {
      return "fa-regular fa-file-pdf";
    }

    if (value.includes("image")) {
      return "fa-regular fa-file-image";
    }

    if (value.includes("word") || value.includes("document")) {
      return "fa-regular fa-file-word";
    }

    return "fa-regular fa-file-lines";
  }
}

window.DriverDetailsView = DriverDetailsView;
