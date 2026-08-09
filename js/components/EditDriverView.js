class EditDriverView {
  constructor(options = {}) {
    this.container =
      typeof options.container === "string"
        ? document.querySelector(options.container)
        : options.container;

    this.pageUrl = options.pageUrl || "/pages/edit-driver.html";

    this.driverId = options.driverId || null;
    this.driverData = null;
    this.initialValues = {};
    this.bound = false;
  }

  async load(driverId) {
    if (!this.container) {
      console.error("Edit Driver container was not found.");
      return;
    }

    this.driverId =
      driverId || this.driverId || sessionStorage.getItem("selectedDriverId");

    if (!this.driverId) {
      throw new Error("Driver ID was not provided.");
    }

    this.container.innerHTML = `
      <section class="page-loading-state">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Loading driver information...</p>
      </section>
    `;

    try {
      const response = await fetch(this.pageUrl);

      if (!response.ok) {
        throw new Error(`Unable to load Edit Driver page: ${response.status}`);
      }

      this.container.innerHTML = await response.text();

      const driverResponse = await this.fetchDriverDetails(this.driverId);

      this.driverData = this.mapDriverData(driverResponse);

      this.bound = false;

      this.bind();
      this.populateForm();
      this.renderDocuments();
      this.captureInitialValues();
    } catch (error) {
      console.error("Unable to load Edit Driver:", error);

      this.container.innerHTML = `
        <section class="page-load-error">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <h2>Unable to load Edit Driver</h2>
          <p>${this.escapeHtml(error.message)}</p>

          <button
            type="button"
            id="retry-edit-driver"
            class="btn-primary"
          >
            Try Again
          </button>
        </section>
      `;

      this.container
        .querySelector("#retry-edit-driver")
        ?.addEventListener("click", () => {
          this.load(this.driverId);
        });
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

  async updateDriver(driverId, payload) {
    const response = await fetch(
      `${getDriverApiBaseUrl()}/drivers/${encodeURIComponent(driverId)}`,
      {
        method: "PATCH",

        headers: {
          ...getDriverAuthHeaders(),
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const message = Array.isArray(result?.message)
        ? result.message.join(", ")
        : result?.message ||
          result?.error ||
          `Unable to update driver: ${response.status}`;

      throw new Error(message);
    }

    return result?.data ?? result;
  }

  mapDriverData(driver) {
    const currentAssignment =
      driver?.currentAssignment ||
      driver?.assignments?.find((assignment) => assignment.isPrimary) ||
      driver?.assignments?.[0] ||
      null;

    return {
      raw: driver,

      id: driver?.driverCode || driver?.id || "—",
      databaseId: driver?.id || null,

      fullName:
        driver?.fullName ||
        [driver?.firstName, driver?.middleName, driver?.lastName]
          .filter(Boolean)
          .join(" "),

      phoneCountryCode: driver?.phoneCountryCode || "+966",
      phone: driver?.phoneNumber || "",
      email: driver?.email || "",

      dateOfBirth: this.formatDateInput(driver?.dateOfBirth),

      nationality: this.mapNationality(driver?.nationality),
      idType: this.mapIdType(driver?.idType),
      iqamaNumber: driver?.idNumber || "",
      iqamaExpiry: this.formatDateInput(driver?.idExpiryDate),

      status: this.mapDriverStatus(driver?.status),
      driverType: this.mapDriverType(driver?.driverType),

      licenseNumber: driver?.licenseNumber || "",
      licenseExpiry: this.formatDateInput(driver?.licenseExpiryDate),
      licenseType: this.mapLicenseType(driver?.licenseType),

      joiningDate: this.formatDateInput(
        driver?.joiningDate || driver?.employment?.joiningDate,
      ),

      company:
        driver?.assignedCompany?.name ||
        currentAssignment?.company?.name ||
        driver?.employment?.company?.name ||
        driver?.company?.name ||
        "",
      locationId: currentAssignment?.location?.id || "",

      branch:
        currentAssignment?.location?.name ||
        currentAssignment?.location?.city ||
        "",
      employeeId: driver?.employment?.employeeId || "",

      companyId:
        driver?.assignedCompany?.id ||
        currentAssignment?.company?.id ||
        driver?.employment?.company?.id ||
        driver?.company?.id ||
        "",

      supervisorId:
        driver?.supervisor?.id ||
        currentAssignment?.supervisor?.id ||
        driver?.employment?.supervisor?.id ||
        "",

      supervisor:
        driver?.supervisor?.name ||
        currentAssignment?.supervisor?.name ||
        driver?.employment?.supervisor?.name ||
        "Not assigned",

      address:
        driver?.address?.addressLine1 ||
        currentAssignment?.location?.address ||
        "",

      city: driver?.address?.city || currentAssignment?.location?.city || "",

      region: driver?.address?.region || "",

      postalCode: driver?.address?.postalCode || "",

      photo: driver?.profilePhotoUrl || "",

      documents: Array.isArray(driver?.documents) ? driver.documents : [],
    };
  }

  mapUpdatePayload(values) {
    const fullName = String(values.fullName || "")
      .trim()
      .replace(/\s+/g, " ");

    const nameParts = fullName.split(" ").filter(Boolean);

    const firstName = nameParts.shift() || "";

    const lastName = nameParts.pop() || "";

    const middleName = nameParts.join(" ");

    return {
      firstName,
      middleName: middleName || null,
      lastName,

      phoneCountryCode: values.phoneCountryCode || "+966",
      phoneNumber: values.phoneNumber || "",
      email: values.email || null,

      dateOfBirth: values.dateOfBirth || null,
      nationality: this.mapNationalityToApi(values.nationality),

      idType: this.mapIdTypeToApi(values.idType),
      idNumber: values.idNumber || null,
      idExpiryDate: values.idExpiryDate || null,

      driverType: this.mapDriverTypeToApi(values.driverType),

      licenseNumber: values.licenseNumber || null,
      licenseType: this.mapLicenseTypeToApi(values.licenseType),
      licenseExpiryDate: values.licenseExpiryDate || null,

      joiningDate: values.joiningDate || null,

      status: this.mapDriverStatusToApi(values.status),

      employeeId: values.employeeId || null,

      locationId: values.locationId || undefined,

      supervisorId: values.supervisorId || null,

      addressLine1: values.address || "",
      city: values.city || "",
      region: values.region || null,
      postalCode: values.postalCode || null,
      countryCode: "SA",
    };
  }

  formatDateInput(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toISOString().slice(0, 10);
  }

  mapNationality(value) {
    const labels = {
      SAUDI: "Saudi Arabia",
      PAKISTANI: "Pakistan",
      INDIAN: "India",
      BANGLADESHI: "Bangladesh",
      EGYPTIAN: "Egypt",
    };

    return labels[value] || this.formatEnum(value);
  }

  mapIdType(value) {
    const labels = {
      IQAMA: "Iqama",
      NATIONAL_ID: "National ID",
      PASSPORT: "Passport",
    };

    return labels[value] || this.formatEnum(value);
  }

  mapDriverStatus(value) {
    const labels = {
      ACTIVE: "On Duty",
      ON_DUTY: "On Duty",
      OFF_DUTY: "Off Duty",
      ON_BREAK: "On Break",
      SUSPENDED: "Suspended",
      PENDING_ACTIVATION: "Off Duty",
      INACTIVE: "Off Duty",
    };

    return labels[value] || this.formatEnum(value);
  }

  mapDriverType(value) {
    const labels = {
      VALET_DRIVER: "Valet Company Driver",
      OTHER: "Independent Driver",
    };

    return labels[value] || this.formatEnum(value);
  }

  mapLicenseType(value) {
    const labels = {
      PRIVATE: "Private",
      PUBLIC: "Public",
      HEAVY_VEHICLE: "Heavy Vehicle",
    };

    return labels[value] || this.formatEnum(value);
  }

  bind() {
    if (!this.container || this.bound) {
      return;
    }

    this.bound = true;

    this.bindNavigation();
    this.bindPhotoActions();
    this.bindPhoneValidation();
    this.bindForm();
  }

  bindNavigation() {
    const returnToDetails = () => {
      window.location.hash = `driver-details?id=${encodeURIComponent(this.driverId)}`;
    };

    this.container
      .querySelector("#back-from-edit-driver")
      ?.addEventListener("click", returnToDetails);

    this.container
      .querySelector("#cancel-edit-driver")
      ?.addEventListener("click", returnToDetails);

    this.container
      .querySelector("#view-updated-driver")
      ?.addEventListener("click", returnToDetails);
  }

  bindPhotoActions() {
    const input = this.container.querySelector("#edit-driver-photo-input");

    const preview = this.container.querySelector("#edit-driver-photo-preview");

    this.container
      .querySelector("#change-driver-photo")
      ?.addEventListener("click", () => {
        input?.click();
      });

    input?.addEventListener("change", () => {
      const file = input.files?.[0];

      if (!file || !preview) {
        return;
      }

      if (!["image/jpeg", "image/png"].includes(file.type)) {
        alert("Only JPG and PNG images are allowed.");
        input.value = "";
        return;
      }

      if (file.size > 2 * 1024 * 1024) {
        alert("The profile photo must not exceed 2MB.");
        input.value = "";
        return;
      }

      const url = URL.createObjectURL(file);
      preview.src = url;
      preview.dataset.localPreviewUrl = url;
    });

    this.container
      .querySelector("#remove-driver-photo")
      ?.addEventListener("click", () => {
        if (!preview) {
          return;
        }

        this.releasePreviewUrl(preview);

        preview.src = "/public/assets/vehicle-brands/default-avatar.png";

        if (input) {
          input.value = "";
        }
      });
  }

  bindPhoneValidation() {
    const phone = this.container.querySelector("#edit-driver-phone");

    phone?.addEventListener("input", () => {
      phone.value = phone.value.replace(/\D/g, "").slice(0, 9);
    });
  }

  bindForm() {
    const form = this.container.querySelector("#edit-driver-form");

    this.container
      .querySelector("#reset-edit-driver")
      ?.addEventListener("click", () => {
        this.restoreInitialValues();
      });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const submitButton = this.container.querySelector("#save-edit-driver");

      submitButton?.setAttribute("disabled", "true");

      if (submitButton) {
        submitButton.innerHTML = `
          <i class="fa-solid fa-spinner fa-spin"></i>
          Saving Changes...
        `;
      }

      try {
        const formValues = this.collectFormData();

        const payload = this.mapUpdatePayload(formValues);

        const updatedDriver = await this.updateDriver(this.driverId, payload);

        const refreshedDriver = await this.fetchDriverDetails(this.driverId);

        this.driverData = this.mapDriverData(refreshedDriver);

        this.populateForm();
        this.renderDocuments();
        this.captureInitialValues();

        console.log("Driver updated:", updatedDriver);

        this.captureInitialValues();

        this.container
          .querySelector("#edit-driver-success-modal")
          ?.classList.remove("hidden");
      } catch (error) {
        console.error("Unable to update driver:", error);

        alert(
          error.message || "Unable to update the driver. Please try again.",
        );
      } finally {
        submitButton?.removeAttribute("disabled");

        if (submitButton) {
          submitButton.innerHTML = `
            <i class="fa-regular fa-floppy-disk"></i>
            Save Changes
          `;
        }
      }
    });
  }

  setSelectOption(selector, value, label, emptyLabel = "Select option") {
    const select = this.container.querySelector(selector);

    if (!select) {
      return;
    }

    select.innerHTML = "";

    const emptyOption = document.createElement("option");

    emptyOption.value = "";
    emptyOption.textContent = emptyLabel;

    select.appendChild(emptyOption);

    if (!value) {
      select.value = "";
      return;
    }

    const selectedOption = document.createElement("option");

    selectedOption.value = value;
    selectedOption.textContent = label || value;
    selectedOption.selected = true;

    select.appendChild(selectedOption);
  }

  populateForm() {
    const driver = this.driverData;

    if (!driver) {
      return;
    }

    this.setValue("#edit-driver-country-code", driver.phoneCountryCode);
    this.setValue("#edit-driver-full-name", driver.fullName);
    this.setValue("#edit-driver-phone", driver.phone);
    this.setValue("#edit-driver-email", driver.email);
    this.setValue("#edit-driver-date-of-birth", driver.dateOfBirth);
    this.setValue("#edit-driver-nationality", driver.nationality);
    this.setValue("#edit-driver-id-type", driver.idType);
    this.setValue("#edit-driver-iqama", driver.iqamaNumber);
    this.setValue("#edit-driver-iqama-expiry", driver.iqamaExpiry);
    this.setValue("#edit-driver-status", driver.status);
    this.setValue("#edit-driver-type", driver.driverType);
    this.setValue("#edit-driver-license", driver.licenseNumber);
    this.setValue("#edit-driver-license-expiry", driver.licenseExpiry);
    this.setValue("#edit-driver-license-type", driver.licenseType);
    this.setValue("#edit-driver-joining-date", driver.joiningDate);
    this.setValue("#edit-driver-employee-id", driver.employeeId);
    this.setValue("#edit-driver-address", driver.address);
    this.setValue("#edit-driver-city", driver.city);
    this.setValue("#edit-driver-region", driver.region);
    this.setValue("#edit-driver-postal-code", driver.postalCode);

    this.setSelectOption(
      "#edit-driver-company",
      driver.companyId,
      driver.company,
      "Select company",
    );

    this.setSelectOption(
      "#edit-driver-branch",
      driver.locationId,
      driver.branch,
      "Select branch",
    );

    this.setSelectOption(
      "#edit-driver-supervisor",
      driver.supervisorId,
      driver.supervisor,
      "Not assigned",
    );
    this.setText("#edit-driver-reference", driver.id);

    const preview = this.container.querySelector("#edit-driver-photo-preview");

    if (preview && driver.photo) {
      preview.src = driver.photo;
      preview.alt = driver.fullName;
    }
  }

  renderDocuments() {
    const container = this.container.querySelector(
      "#edit-driver-documents-container",
    );

    const countElement = this.container.querySelector(
      "#edit-driver-documents-count",
    );

    const documents = Array.isArray(this.driverData?.documents)
      ? this.driverData.documents
      : [];

    if (countElement) {
      countElement.textContent = `${documents.length} ${
        documents.length === 1 ? "Document" : "Documents"
      }`;
    }

    if (!container) {
      return;
    }

    if (!documents.length) {
      container.innerHTML = `
      <div class="edit-driver-documents-empty">
        <i class="fa-regular fa-folder-open"></i>
        <strong>No documents available</strong>
        <span>Uploaded driver documents will appear here.</span>
      </div>
    `;

      return;
    }

    container.innerHTML = documents
      .map((document) => {
        const status = String(
          document.verificationStatus || "PENDING",
        ).toUpperCase();

        const downloadUrl =
          document.downloadUrl ||
          document.signedUrl ||
          document.fileUrl ||
          document.url ||
          "";

        return `
        <article class="edit-driver-document-row">
          <div class="edit-driver-document-main">
            <span class="edit-driver-document-icon">
              <i class="${this.getDocumentFileIcon(document.mimeType)}"></i>
            </span>

            <div>
              <strong>
                ${this.escapeHtml(
                  this.formatDocumentLabel(
                    document.documentType || document.type,
                  ),
                )}
              </strong>

              <small>
                ${this.escapeHtml(
                  document.originalName ||
                    document.fileName ||
                    document.name ||
                    "Unnamed document",
                )}
              </small>
            </div>
          </div>

          <div class="edit-driver-document-meta">
            <span>
              Uploaded
              <strong>
                ${this.escapeHtml(
                  this.formatDateTime(
                    document.uploadedAt || document.createdAt,
                  ),
                )}
              </strong>
            </span>

            <span>
              Expiry
              <strong>
                ${
                  document.expiryDate || document.expiresAt
                    ? this.escapeHtml(
                        this.formatDate(
                          document.expiryDate || document.expiresAt,
                        ),
                      )
                    : "No expiry"
                }
              </strong>
            </span>
          </div>

          <span
            class="edit-driver-document-status ${this.getDocumentStatusClass(
              status,
            )}"
          >
            ${this.escapeHtml(this.formatDocumentStatus(status))}
          </span>

          <div class="edit-driver-document-actions">
            ${
              downloadUrl
                ? `
                  <button
                    type="button"
                    class="edit-driver-document-view-btn"
                    data-document-url="${this.escapeHtml(downloadUrl)}"
                  >
                    <i class="fa-regular fa-eye"></i>
                    View
                  </button>
                `
                : ""
            }

            ${
              status === "PENDING"
                ? `
                  <button
                    type="button"
                    class="edit-driver-document-verify-btn"
                    data-document-id="${this.escapeHtml(document.id)}"
                  >
                    <i class="fa-solid fa-check"></i>
                    Verify
                  </button>

                  <button
                    type="button"
                    class="edit-driver-document-reject-btn"
                    data-document-id="${this.escapeHtml(document.id)}"
                  >
                    <i class="fa-solid fa-xmark"></i>
                    Reject
                  </button>
                `
                : ""
            }
          </div>
        </article>
      `;
      })
      .join("");

    this.bindDocumentActions();
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

  getDocumentStatusClass(status) {
    const normalizedStatus = String(status || "")
      .trim()
      .toUpperCase();

    const classes = {
      VERIFIED: "confirmed",
      APPROVED: "confirmed",
      VALID: "confirmed",
      PENDING: "pending",
      REJECTED: "rejected",
      EXPIRED: "expired",
      EXPIRING_SOON: "expiring",
    };

    return classes[normalizedStatus] || "pending";
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

  showConfirmationModal({
    type = "verify",
    title,
    message,
    confirmText = "Confirm",
  }) {
    return new Promise((resolve) => {
      this.container.querySelector("#edit-driver-confirm-modal")?.remove();

      const isReject = type === "reject";

      const modal = document.createElement("div");

      modal.id = "edit-driver-confirm-modal";
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
        aria-labelledby="edit-driver-confirm-title"
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

        <h2 id="edit-driver-confirm-title">
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

      const close = (result) => {
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

  bindDocumentActions() {
    const container = this.container.querySelector(
      "#edit-driver-documents-container",
    );

    if (!container) {
      return;
    }

    container.querySelectorAll("[data-document-url]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.dataset.documentUrl;

        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      });
    });

    container
      .querySelectorAll(".edit-driver-document-verify-btn")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const documentId = button.dataset.documentId;

          if (!documentId) {
            return;
          }

          const confirmed = await this.showConfirmationModal({
            type: "verify",
            title: "Verify document?",
            message:
              "This document will be marked as confirmed and approved for this driver.",
            confirmText: "Verify Document",
          });

          if (!confirmed) {
            return;
          }
          button.disabled = true;
          await this.handleDocumentVerification(documentId, "VERIFIED", button);
        });
      });

    container
      .querySelectorAll(".edit-driver-document-reject-btn")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          const documentId = button.dataset.documentId;

          if (!documentId) {
            return;
          }

          const confirmed = await this.showConfirmationModal({
            type: "reject",
            title: "Reject document?",
            message:
              "This document will be marked as rejected. The driver may need to upload a replacement.",
            confirmText: "Reject Document",
          });

          if (!confirmed) {
            return;
          }
          button.disabled = true;
          await this.handleDocumentVerification(documentId, "REJECTED", button);
        });
      });
  }

  async updateDocumentVerification(documentId, verificationStatus, note = "") {
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
          ...(note ? { note } : {}),
        }),
      },
    );

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      const message = Array.isArray(result?.message)
        ? result.message.join(", ")
        : result?.message ||
          result?.error ||
          "Unable to update document verification.";

      throw new Error(message);
    }

    return result?.data ?? result;
  }

  async handleDocumentVerification(
    documentId,
    verificationStatus,
    clickedButton,
  ) {
    const actionText =
      verificationStatus === "VERIFIED" ? "Verifying..." : "Rejecting...";

    const originalButtonHtml = clickedButton?.innerHTML || "";

    const documentButtons = this.container.querySelectorAll(
      `[data-document-id="${CSS.escape(documentId)}"]`,
    );

    try {
      documentButtons.forEach((button) => {
        button.disabled = true;
      });

      if (clickedButton) {
        clickedButton.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        ${actionText}
      `;
      }

      await this.updateDocumentVerification(documentId, verificationStatus);

      const refreshedDriver = await this.fetchDriverDetails(this.driverId);

      this.driverData = this.mapDriverData(refreshedDriver);

      this.renderDocuments();
    } catch (error) {
      console.error("Unable to update document verification:", error);

      alert(
        error?.message || "Unable to update the document verification status.",
      );

      documentButtons.forEach((button) => {
        button.disabled = false;
      });

      if (clickedButton) {
        clickedButton.innerHTML = originalButtonHtml;
      }
    }
  }

  collectFormData() {
    const getValue = (selector) => {
      return this.container.querySelector(selector)?.value?.trim() || "";
    };

    return {
      fullName: getValue("#edit-driver-full-name"),

      phoneCountryCode: getValue("#edit-driver-country-code"),
      phoneNumber: getValue("#edit-driver-phone"),
      email: getValue("#edit-driver-email"),

      dateOfBirth: getValue("#edit-driver-date-of-birth"),
      nationality: getValue("#edit-driver-nationality"),

      idType: getValue("#edit-driver-id-type"),
      idNumber: getValue("#edit-driver-iqama"),
      idExpiryDate: getValue("#edit-driver-iqama-expiry"),

      status: getValue("#edit-driver-status"),
      driverType: getValue("#edit-driver-type"),

      licenseNumber: getValue("#edit-driver-license"),
      licenseExpiryDate: getValue("#edit-driver-license-expiry"),
      licenseType: getValue("#edit-driver-license-type"),

      joiningDate: getValue("#edit-driver-joining-date"),

      companyId: getValue("#edit-driver-company"),
      locationId: getValue("#edit-driver-branch"),
      employeeId: getValue("#edit-driver-employee-id"),
      supervisorId: getValue("#edit-driver-supervisor"),

      address: getValue("#edit-driver-address"),
      city: getValue("#edit-driver-city"),
      region: getValue("#edit-driver-region"),
      postalCode: getValue("#edit-driver-postal-code"),
    };
  }

  captureInitialValues() {
    const form = this.container.querySelector("#edit-driver-form");

    if (!form) {
      return;
    }

    this.initialValues = Object.fromEntries(new FormData(form).entries());
  }

  restoreInitialValues() {
    Object.entries(this.initialValues).forEach(([name, value]) => {
      const field = this.container.querySelector(
        `[name="${CSS.escape(name)}"]`,
      );

      if (field) {
        field.value = value;
      }
    });

    const photoInput = this.container.querySelector("#edit-driver-photo-input");

    if (photoInput) {
      photoInput.value = "";
    }

    const preview = this.container.querySelector("#edit-driver-photo-preview");

    if (preview) {
      this.releasePreviewUrl(preview);

      preview.src =
        this.driverData?.photo ||
        "/public/assets/vehicle-brands/default-avatar.png";

      preview.alt = this.driverData?.fullName || "Driver profile photo";
    }
  }

  setValue(selector, value) {
    const element = this.container.querySelector(selector);

    if (element) {
      element.value = value ?? "";
    }
  }

  setText(selector, value) {
    const element = this.container.querySelector(selector);

    if (element) {
      element.textContent = value ?? "—";
    }
  }

  releasePreviewUrl(preview) {
    const url = preview?.dataset.localPreviewUrl;

    if (url) {
      URL.revokeObjectURL(url);
      delete preview.dataset.localPreviewUrl;
    }
  }

  destroy() {
    const preview = this.container?.querySelector("#edit-driver-photo-preview");

    this.releasePreviewUrl(preview);

    this.container = null;
    this.driverData = null;
    this.initialValues = {};
    this.bound = false;
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  mapNationalityToApi(value) {
    const labels = {
      "Saudi Arabia": "SAUDI",
      Pakistan: "PAKISTANI",
      India: "INDIAN",
      Bangladesh: "BANGLADESHI",
      Egypt: "EGYPTIAN",
    };

    return (
      labels[value] ||
      String(value || "")
        .trim()
        .toUpperCase()
    );
  }

  mapIdTypeToApi(value) {
    const labels = {
      "National ID": "NATIONAL_ID",
      Iqama: "IQAMA",
      Passport: "PASSPORT",
      Other: "OTHER",
    };

    return labels[value] || undefined;
  }

  mapDriverTypeToApi(value) {
    const labels = {
      "Valet Company Driver": "VALET_DRIVER",
      "Parking Attendant": "PARKING_ATTENDANT",
      Supervisor: "SUPERVISOR",
      "Shuttle Driver": "SHUTTLE_DRIVER",
      "Independent Driver": "OTHER",
    };

    return labels[value] || undefined;
  }

  mapLicenseTypeToApi(value) {
    const labels = {
      Private: "PRIVATE",
      Public: "PUBLIC",
      "Heavy Transport": "HEAVY_TRANSPORT",
      "Light Transport": "LIGHT_TRANSPORT",
      Motorcycle: "MOTORCYCLE",
      Other: "OTHER",
    };

    return labels[value] || undefined;
  }

  mapDriverStatusToApi(value) {
    const labels = {
      Active: "ACTIVE",
      "On Duty": "ACTIVE",
      Inactive: "INACTIVE",
      "Off Duty": "INACTIVE",
      Suspended: "SUSPENDED",
      "On Leave": "ON_LEAVE",
      Terminated: "TERMINATED",
      "Documents Expired": "DOCUMENTS_EXPIRED",
      "Pending Activation": "PENDING_ACTIVATION",
    };

    return labels[value] || "PENDING_ACTIVATION";
  }
}

window.EditDriverView = EditDriverView;
