class DriverDocumentUploader {
  constructor(options = {}) {
    this.root =
      typeof options.root === "string"
        ? document.querySelector(options.root)
        : options.root;

    this.uploadUrl = options.uploadUrl || "/api/drivers/documents";

    this.deleteUrl = options.deleteUrl || "/api/drivers/documents";

    this.driverId =
      options.driverId || sessionStorage.getItem("currentDriverId") || null;

    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024;

    this.allowedTypes = options.allowedTypes || [
      "image/jpeg",
      "image/png",
      "application/pdf",
    ];

    this.onUploadComplete = options.onUploadComplete || null;

    this.onUploadError = options.onUploadError || null;

    this.uploads = new Map();
    this.bound = false;
  }

  init() {
    if (!this.root) {
      console.error("DriverDocumentUploader root was not found.");

      return;
    }

    if (this.bound) {
      return;
    }

    this.bound = true;

    this.bindUploadBoxes();
    this.bindTabs();
    this.updateOverallProgress();
  }

  destroy() {
    this.uploads.forEach((upload) => {
      if (upload.status === "uploading" && upload.xhr) {
        upload.xhr.abort();
      }

      if (upload.previewUrl) {
        URL.revokeObjectURL(upload.previewUrl);
      }
    });

    this.uploads.clear();
    this.bound = false;
  }

  bindUploadBoxes() {
    const uploadBoxes = this.root.querySelectorAll(".document-upload");

    uploadBoxes.forEach((uploadBox, index) => {
      const input = uploadBox.querySelector('input[type="file"]');

      const card = uploadBox.closest(".document-card");

      if (!input || !card) {
        return;
      }

      if (!input.dataset.documentType) {
        input.dataset.documentType = `driver_document_${index + 1}`;
      }

      this.createStatusUI(uploadBox);

      input.addEventListener("change", () => {
        const file = input.files?.[0];

        if (!file) {
          return;
        }

        this.uploadFile({
          file,
          input,
          uploadBox,
          card,
        });
      });

      this.bindDragAndDrop({
        uploadBox,
        input,
        card,
      });
    });
  }

  bindDragAndDrop({ uploadBox, input, card }) {
    const preventDefault = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    uploadBox.addEventListener("dragenter", (event) => {
      preventDefault(event);

      uploadBox.classList.add("drag-active");
    });

    uploadBox.addEventListener("dragover", (event) => {
      preventDefault(event);

      uploadBox.classList.add("drag-active");

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    });

    uploadBox.addEventListener("dragleave", (event) => {
      preventDefault(event);

      if (!uploadBox.contains(event.relatedTarget)) {
        uploadBox.classList.remove("drag-active");
      }
    });

    uploadBox.addEventListener("drop", (event) => {
      preventDefault(event);

      uploadBox.classList.remove("drag-active");

      const file = event.dataTransfer?.files?.[0];

      if (!file) {
        return;
      }

      this.uploadFile({
        file,
        input,
        uploadBox,
        card,
      });
    });
  }

  createStatusUI(uploadBox) {
    if (uploadBox.querySelector(".document-upload-status")) {
      return;
    }

    uploadBox.insertAdjacentHTML(
      "beforeend",
      `
        <div class="document-upload-status">
          <div class="document-file-row">

            <span class="document-file-icon">
              <i class="fa-regular fa-file"></i>
            </span>

            <div class="document-file-details">
              <strong class="document-file-name">
                Document
              </strong>

              <span class="document-file-meta">
                Preparing upload...
              </span>
            </div>

            <button
              type="button"
              class="document-upload-action cancel"
              aria-label="Cancel upload"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>

          </div>

          <div class="document-progress-row">

            <div
              class="document-progress-track"
              role="progressbar"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="0"
            >
              <div
                class="document-progress-value"
              ></div>
            </div>

            <div class="document-progress-info">
              <span class="document-upload-speed">
                Starting...
              </span>

              <strong class="document-upload-percent">
                0%
              </strong>
            </div>

          </div>

          <div class="document-upload-message">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>Uploading document...</span>
          </div>

          <div
            class="document-upload-footer-actions"
          ></div>
        </div>
      `,
    );
  }

  getDocumentExpiryDate(documentType) {
    const normalizedType = String(documentType || "")
      .trim()
      .toUpperCase();

    const identityDocumentTypes = new Set([
      "NATIONAL_ID_FRONT",
      "NATIONAL_ID_BACK",
      "IQAMA_FRONT",
      "IQAMA_BACK",
      "PASSPORT",
    ]);

    const licenceDocumentTypes = new Set([
      "DRIVING_LICENSE_FRONT",
      "DRIVING_LICENSE_BACK",
    ]);

    if (identityDocumentTypes.has(normalizedType)) {
      return document.querySelector("#idExpiryDate")?.value?.trim() || "";
    }

    if (licenceDocumentTypes.has(normalizedType)) {
      return document.querySelector("#licenseExpiryDate")?.value?.trim() || "";
    }

    return "";
  }

  uploadFile({ file, input, uploadBox, card }) {
    if (!this.driverId) {
      this.showError({
        uploadBox,
        card,
        input,
        file,
        message:
          "Driver draft was not found. Please return to Driver Details and save the draft first.",
      });

      return;
    }

    const documentType = input.dataset.documentType;

    const documentSlot = input.dataset.documentSlot || documentType;

    if (!documentType) {
      this.showError({
        uploadBox,
        card,
        input,
        file,
        message:
          "Document configuration is missing. Please refresh the page and try again.",
      });

      return;
    }

    const validationError = this.validateFile(file);

    if (validationError) {
      this.showError({
        uploadBox,
        card,
        input,
        file,
        message: validationError,
      });

      return;
    }

    if (card.classList.contains("is-uploading")) {
      return;
    }
    const category = input.dataset.documentCategory || "optional";

    const expiryDate = this.getDocumentExpiryDate(documentType);

    this.cancelUpload(documentSlot);

    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);

    if (this.driverId) {
      formData.append("driverId", this.driverId);
    }

    formData.append("documentType", documentType);

    formData.append("documentSlot", documentSlot);

    if (expiryDate) {
      formData.append("expiryDate", expiryDate);
    }
    formData.append("documentCategory", category);

    const upload = {
      xhr,
      file,
      input,
      uploadBox,
      card,

      documentType,
      documentSlot,

      documentLabel: input.dataset.documentLabel || documentType,

      category,
      expiryDate,
      status: "uploading",
      serverDocument: null,
      lastLoaded: 0,
      lastTimestamp: Date.now(),
    };

    this.uploads.set(documentSlot, upload);

    this.showUploading(upload);

    xhr.open("POST", this.uploadUrl, true);

    this.applyAuthorization(xhr);

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const percentage = Math.min(
        99,
        Math.round((event.loaded / event.total) * 100),
      );

      this.updateProgress(upload, percentage, event.loaded, event.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = this.parseResponse(xhr.responseText);

        upload.status = "uploaded";
        upload.serverDocument = response.document || response.data || response;

        this.showSuccess(upload);
        this.updateOverallProgress();

        this.onUploadComplete?.(upload.serverDocument, upload);

        return;
      }

      const response = this.parseResponse(xhr.responseText);

      const message =
        response.message ||
        response.error ||
        "The server could not upload this document.";

      upload.status = "error";

      this.showError({
        uploadBox,
        card,
        input,
        file,
        message,
      });

      this.updateOverallProgress();

      this.onUploadError?.(message, upload);
    });

    xhr.addEventListener("error", () => {
      const message = "Network error. Check your connection and retry.";

      upload.status = "error";

      this.showError({
        uploadBox,
        card,
        input,
        file,
        message,
      });

      this.updateOverallProgress();

      this.onUploadError?.(message, upload);
    });

    xhr.addEventListener("abort", () => {
      const activeUpload = this.uploads.get(
        upload.documentSlot || upload.documentType,
      );

      /*
       * Only reset when this aborted upload is still
       * the active upload for this document slot.
       */
      if (activeUpload === upload) {
        this.resetUpload(upload);
      }
    });

    xhr.send(formData);
  }

  validateFile(file) {
    if (!this.allowedTypes.includes(file.type)) {
      return "Only JPG, PNG and PDF " + "files are allowed.";
    }

    if (file.size > this.maxFileSize) {
      return "The selected file exceeds the 5MB limit.";
    }

    return "";
  }

  showUploading(upload) {
    const { uploadBox, card, file, xhr } = upload;

    uploadBox.classList.add("has-status");

    card.classList.remove("is-uploaded", "has-error");

    card.classList.add("is-uploading");

    this.setFileInformation(uploadBox, file);

    const cancelButton = uploadBox.querySelector(".document-upload-action");

    if (cancelButton) {
      cancelButton.className = "document-upload-action cancel";

      cancelButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';

      cancelButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        xhr.abort();
      };
    }

    this.clearFooterActions(uploadBox);

    this.setMessage(uploadBox, "Uploading securely to server...", "uploading");

    this.updateProgress(upload, 0, 0, file.size);
  }

  showSuccess(upload) {
    const { uploadBox, card, file } = upload;

    const sizeBytes =
      Number(file?.size ?? upload.serverDocument?.sizeBytes) || 0;

    /*
     * Only local File/Blob objects can be passed
     * to URL.createObjectURL().
     *
     * Restored server documents use their signed URL.
     */
    if (!upload.previewUrl && file instanceof Blob) {
      upload.previewUrl = URL.createObjectURL(file);
    }

    uploadBox.classList.add("has-status");

    card.classList.remove("is-uploading", "has-error");

    card.classList.add("is-uploaded");

    this.setFileInformation(uploadBox, file);

    this.updateProgress(upload, 100, sizeBytes, sizeBytes);

    this.setMessage(uploadBox, "Uploaded successfully", "success");

    const speedElement = uploadBox.querySelector(".document-upload-speed");

    if (speedElement) {
      speedElement.textContent =
        `${this.formatSize(sizeBytes)} · ` + "Upload complete";
    }

    this.bindSuccessActions(upload);
  }

  bindSuccessActions(upload) {
    const { uploadBox, input, file } = upload;

    const removeButton = uploadBox.querySelector(".document-upload-action");

    if (removeButton) {
      removeButton.className = "document-upload-action remove";

      removeButton.setAttribute("aria-label", "Delete uploaded document");

      removeButton.setAttribute("title", "Delete document");
      removeButton.innerHTML = '<i class="fa-regular fa-trash-can"></i>';

      removeButton.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();

        await this.removeFromServer(upload);
      };
    }

    const footer = uploadBox.querySelector(".document-upload-footer-actions");

    if (!footer) {
      return;
    }

    footer.innerHTML = `
      <button
        type="button"
        class="document-small-btn replace"
      >
        <i class="fa-solid fa-arrows-rotate"></i>
        Replace
      </button>

      <button
        type="button"
        class="document-small-btn view"
      >
        <i class="fa-regular fa-eye"></i>
        View
      </button>
    `;

    footer.querySelector(".replace")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      input.value = "";
      input.click();
    });

    footer.querySelector(".view")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      this.viewFile(upload, file);
    });
  }

  showError({ uploadBox, card, input, file, message }) {
    uploadBox.classList.add("has-status");

    card.classList.remove("is-uploading", "is-uploaded");

    card.classList.add("has-error");

    this.setFileInformation(uploadBox, file);

    const progressValue = uploadBox.querySelector(".document-progress-value");

    const percentage = uploadBox.querySelector(".document-upload-percent");

    if (progressValue) {
      progressValue.style.width = "100%";

      progressValue.style.background = "#e34848";
    }

    if (percentage) {
      percentage.textContent = "Failed";

      percentage.style.color = "#d33c3c";
    }

    this.setMessage(uploadBox, message, "error");

    this.bindErrorActions({
      uploadBox,
      card,
      input,
      file,
    });
  }

  bindErrorActions({ uploadBox, card, input, file }) {
    const documentType = input.dataset.documentType;

    const documentSlot = input.dataset.documentSlot || documentType;

    const removeButton = uploadBox.querySelector(".document-upload-action");

    if (removeButton) {
      removeButton.className = "document-upload-action remove";

      removeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';

      removeButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        this.resetUpload({
          documentType,
          documentSlot,
          uploadBox,
          card,
          input,
        });
      };
    }

    const footer = uploadBox.querySelector(".document-upload-footer-actions");

    if (!footer) {
      return;
    }

    footer.innerHTML = `
      <button
        type="button"
        class="document-small-btn retry"
      >
        <i class="fa-solid fa-rotate-right"></i>
        Retry
      </button>

      <button
        type="button"
        class="document-small-btn choose-another"
      >
        Choose another
      </button>
    `;

    footer.querySelector(".retry")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!file) {
        input.click();
        return;
      }

      this.uploadFile({
        file,
        input,
        uploadBox,
        card,
      });
    });

    footer
      .querySelector(".choose-another")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        input.value = "";
        input.click();
      });
  }

  updateProgress(upload, percentage, loaded, total) {
    const { uploadBox } = upload;

    const progressTrack = uploadBox.querySelector(".document-progress-track");

    const progressValue = uploadBox.querySelector(".document-progress-value");

    const percentageElement = uploadBox.querySelector(
      ".document-upload-percent",
    );

    const speedElement = uploadBox.querySelector(".document-upload-speed");

    if (progressValue) {
      progressValue.style.width = `${percentage}%`;

      progressValue.style.background = "";
    }

    if (progressTrack) {
      progressTrack.setAttribute("aria-valuenow", String(percentage));
    }

    if (percentageElement) {
      percentageElement.textContent = `${percentage}%`;

      percentageElement.style.color = "";
    }

    const currentTimestamp = Date.now();

    const elapsedSeconds = Math.max(
      (currentTimestamp - upload.lastTimestamp) / 1000,
      0.1,
    );

    const loadedDifference = loaded - upload.lastLoaded;

    const bytesPerSecond = loadedDifference / elapsedSeconds;

    upload.lastLoaded = loaded;
    upload.lastTimestamp = currentTimestamp;

    if (speedElement) {
      speedElement.textContent =
        percentage === 0
          ? "Preparing upload..."
          : `${this.formatSize(bytesPerSecond)}/s · ${this.formatSize(
              loaded,
            )} of ${this.formatSize(total)}`;
    }
  }

  updateOverallProgress() {
    const cards = this.root.querySelectorAll(".document-card");

    const uploadedCards = this.root.querySelectorAll(
      ".document-card.is-uploaded",
    );

    const total = cards.length;
    const uploaded = uploadedCards.length;

    const percentage = total > 0 ? Math.round((uploaded / total) * 100) : 0;

    const progress = this.root.querySelector(".document-progress");

    if (!progress) {
      return;
    }

    const count = progress.querySelector("span");

    const progressBar = progress.querySelector("em i");

    const percentageText = progress.querySelector("small");

    if (count) {
      count.textContent = `${uploaded} / ${total} Uploaded`;
    }

    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    if (percentageText) {
      percentageText.textContent = `${percentage}%`;
    }
  }

  bindTabs() {
    const tabs = this.root.querySelectorAll(".upload-tabs button");

    const cards = this.root.querySelectorAll(".document-card");

    const filters = ["all", "required", "company", "optional"];

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => {
        tabs.forEach((item) => {
          item.classList.remove("active");
        });

        tab.classList.add("active");

        const filter = filters[index] || "all";

        cards.forEach((card) => {
          const input = card.querySelector('input[type="file"]');

          const category = input?.dataset.documentCategory || "optional";

          card.hidden = filter !== "all" && category !== filter;
        });
      });
    });
  }

  validateRequiredDocuments() {
    const requiredInputs = this.root.querySelectorAll(
      'input[data-document-category="required"]',
    );

    const missing = [...requiredInputs].filter((input) => {
      const documentSlot =
        input.dataset.documentSlot || input.dataset.documentType;

      const upload = this.uploads.get(documentSlot);

      return upload?.status !== "uploaded";
    });

    return {
      valid: missing.length === 0,
      missing,
      missingCount: missing.length,
    };
  }

  setDriverId(driverId) {
    this.driverId = driverId || null;

    if (this.driverId) {
      sessionStorage.setItem("currentDriverId", this.driverId);
    } else {
      sessionStorage.removeItem("currentDriverId");
    }
  }

  restoreUploadedDocuments(documents = []) {
    if (!this.root || !Array.isArray(documents)) {
      return;
    }

    const inputs = Array.from(
      this.root.querySelectorAll('input[type="file"]' + "[data-document-type]"),
    );

    /*
     * Keep only the newest active record
     * for each document card.
     */
    const latestDocuments = new Map();

    documents.forEach((serverDocument) => {
      const documentType = String(serverDocument?.documentType || "")
        .trim()
        .toUpperCase();

      let documentSlot = String(serverDocument?.documentSlot || "")
        .trim()
        .toUpperCase();

      /*
       * Compatibility for documents uploaded
       * before documentSlot was introduced.
       *
       * Only restore by documentType when exactly
       * one UI card uses that type.
       */
      if (!documentSlot && documentType) {
        const matchingInputs = inputs.filter(
          (input) =>
            String(input.dataset.documentType || "")
              .trim()
              .toUpperCase() === documentType,
        );

        if (matchingInputs.length === 1) {
          documentSlot = String(
            matchingInputs[0].dataset.documentSlot || documentType,
          )
            .trim()
            .toUpperCase();
        }
      }

      if (!documentSlot) {
        console.warn(
          "Unable to restore document without a unique slot:",
          serverDocument,
        );

        return;
      }

      const existing = latestDocuments.get(documentSlot);

      const existingTime = new Date(
        existing?.uploadedAt || existing?.createdAt || 0,
      ).getTime();

      const incomingTime = new Date(
        serverDocument?.uploadedAt || serverDocument?.createdAt || 0,
      ).getTime();

      if (!existing || incomingTime >= existingTime) {
        latestDocuments.set(documentSlot, serverDocument);
      }
    });

    latestDocuments.forEach((serverDocument, documentSlot) => {
      const input = inputs.find((candidate) => {
        const candidateSlot = String(
          candidate.dataset.documentSlot ||
            candidate.dataset.documentType ||
            "",
        )
          .trim()
          .toUpperCase();

        return candidateSlot === documentSlot;
      });

      if (!input) {
        console.warn("No upload card found for document slot:", documentSlot);

        return;
      }

      const uploadBox = input.closest(".document-upload");

      const card = input.closest(".document-card");

      if (!uploadBox || !card) {
        return;
      }

      this.createStatusUI(uploadBox);

      const fileMetadata = {
        name: serverDocument.originalName || "Uploaded document",

        size: Number(serverDocument.sizeBytes) || 0,

        type: serverDocument.mimeType || "",
      };

      const upload = {
        xhr: null,

        file: fileMetadata,

        input,
        uploadBox,
        card,

        documentType: input.dataset.documentType || serverDocument.documentType,

        documentSlot,

        documentLabel: input.dataset.documentLabel || documentSlot,

        category: input.dataset.documentCategory || "optional",

        status: "uploaded",

        serverDocument,

        previewUrl:
          serverDocument.url ||
          serverDocument.fileUrl ||
          serverDocument.downloadUrl ||
          null,

        lastLoaded: fileMetadata.size,

        lastTimestamp: Date.now(),
      };

      this.uploads.set(documentSlot, upload);

      this.showSuccess(upload);
    });

    this.updateOverallProgress();
  }

  getUploadedDocuments() {
    return Array.from(this.uploads.values())
      .filter((upload) => upload.status === "uploaded")
      .map((upload) => {
        const serverDocument = upload.serverDocument || {};

        return {
          documentSlot: upload.documentSlot,

          documentType: upload.documentType,

          documentLabel: upload.documentLabel,

          category: upload.category,

          id: serverDocument.id || serverDocument.documentId || null,

          originalName:
            serverDocument.originalName ||
            upload.file?.name ||
            "Uploaded document",

          mimeType: serverDocument.mimeType || upload.file?.type || "",

          sizeBytes: serverDocument.sizeBytes || upload.file?.size || 0,

          url:
            serverDocument.url ||
            serverDocument.fileUrl ||
            serverDocument.downloadUrl ||
            upload.previewUrl ||
            null,

          document: serverDocument,
        };
      });
  }

  async removeFromServer(upload) {
    const documentId =
      upload.serverDocument?.id || upload.serverDocument?.documentId;

    try {
      if (documentId) {
        const response = await fetch(
          `${this.deleteUrl}/${encodeURIComponent(documentId)}`,
          {
            method: "DELETE",
            headers: this.getAuthHeaders(),
          },
        );

        if (!response.ok) {
          throw new Error("Unable to remove document.");
        }
      }

      this.resetUpload(upload);
    } catch (error) {
      this.setMessage(
        upload.uploadBox,
        error.message || "Unable to remove document.",
        "error",
      );
    }
  }

  resetUpload(upload) {
    const { documentSlot, documentType, uploadBox, card, input } = upload;

    if (upload.previewUrl) {
      URL.revokeObjectURL(upload.previewUrl);

      upload.previewUrl = null;
    }

    const uploadKey = documentSlot || documentType;

    const activeUpload = this.uploads.get(uploadKey);

    if (!activeUpload || activeUpload === upload) {
      this.uploads.delete(uploadKey);
    }

    if (input) {
      input.value = "";
    }

    uploadBox?.classList.remove("has-status", "drag-active");

    card?.classList.remove("is-uploading", "is-uploaded", "has-error");

    const progressValue = uploadBox?.querySelector(".document-progress-value");

    const percentage = uploadBox?.querySelector(".document-upload-percent");

    if (progressValue) {
      progressValue.style.width = "0";
      progressValue.style.background = "";
    }

    if (percentage) {
      percentage.textContent = "0%";
      percentage.style.color = "";
    }

    this.updateOverallProgress();
  }

  cancelUpload(documentSlot) {
    const upload = this.uploads.get(documentSlot);

    if (upload?.status === "uploading" && upload.xhr) {
      upload.xhr.abort();
    }
  }

  viewFile(upload, file) {
    const serverUrl =
      upload.serverDocument?.url ||
      upload.serverDocument?.fileUrl ||
      upload.serverDocument?.downloadUrl ||
      upload.previewUrl;

    if (serverUrl) {
      window.open(serverUrl, "_blank", "noopener,noreferrer");

      return;
    }

    if (file instanceof Blob) {
      const localUrl = URL.createObjectURL(file);

      window.open(localUrl, "_blank", "noopener,noreferrer");

      setTimeout(() => {
        URL.revokeObjectURL(localUrl);
      }, 60000);

      return;
    }

    this.setMessage(
      upload.uploadBox,
      "Document preview link is unavailable.",
      "error",
    );
  }

  setFileInformation(uploadBox, file) {
    const fileName = uploadBox.querySelector(".document-file-name");

    const fileMeta = uploadBox.querySelector(".document-file-meta");

    const icon = uploadBox.querySelector(".document-file-icon");

    if (fileName) {
      fileName.textContent = file?.name || "Upload failed";
    }

    if (fileMeta) {
      fileMeta.textContent = file
        ? `${this.formatSize(file.size)} · ${this.getExtension(file.name)}`
        : "Unable to process file";
    }

    if (icon && file) {
      const isPdf = file.type === "application/pdf";

      icon.classList.toggle("pdf", isPdf);

      icon.innerHTML = isPdf
        ? '<i class="fa-regular fa-file-pdf"></i>'
        : '<i class="fa-regular fa-image"></i>';
    }
  }

  setMessage(uploadBox, message, state) {
    const element = uploadBox.querySelector(".document-upload-message");

    if (!element) {
      return;
    }

    const icons = {
      uploading: "fa-cloud-arrow-up",
      success: "fa-circle-check",
      error: "fa-circle-exclamation",
    };

    element.className = `document-upload-message ${state}`;

    element.innerHTML = `
      <i class="fa-solid ${icons[state] || icons.uploading}"></i>

      <span>
        ${this.escapeHtml(message)}
      </span>
    `;
  }

  clearFooterActions(uploadBox) {
    const footer = uploadBox.querySelector(".document-upload-footer-actions");

    if (footer) {
      footer.innerHTML = "";
    }
  }

  applyAuthorization(xhr) {
    const token = localStorage.getItem("parkin_access_token");

    if (!token) {
      throw new Error("Your login session has expired. Please sign in again.");
    }

    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
  }

  getAuthHeaders() {
    const token = localStorage.getItem("parkin_access_token");

    if (!token) {
      throw new Error("Your login session has expired. Please sign in again.");
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  parseResponse(responseText) {
    try {
      return JSON.parse(responseText || "{}");
    } catch {
      return {};
    }
  }

  formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 KB";
    }

    const units = ["B", "KB", "MB", "GB"];

    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );

    const value = bytes / 1024 ** index;

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  getExtension(fileName) {
    return fileName.split(".").pop()?.toUpperCase() || "FILE";
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ADD HERE */
  resetAll() {
    const uploads = [...this.uploads.values()];

    uploads.forEach((upload) => {
      if (upload.status === "uploading" && upload.xhr) {
        upload.xhr.abort();
      } else {
        this.resetUpload(upload);
      }
    });

    this.uploads.clear();

    this.root.querySelectorAll(".document-card").forEach((card) => {
      card.classList.remove("is-uploading", "is-uploaded", "has-error");

      const uploadBox = card.querySelector(".document-upload");

      uploadBox?.classList.remove("has-status", "drag-active");

      const input = card.querySelector('input[type="file"]');

      if (input) {
        input.value = "";
      }

      const progressValue = card.querySelector(".document-progress-value");

      const percentage = card.querySelector(".document-upload-percent");

      if (progressValue) {
        progressValue.style.width = "0%";
        progressValue.style.background = "";
      }

      if (percentage) {
        percentage.textContent = "0%";
        percentage.style.color = "";
      }
    });

    this.driverId = null;

    this.updateOverallProgress();
  }

  /* END OF CLASS */
}

window.DriverDocumentUploader = DriverDocumentUploader;
