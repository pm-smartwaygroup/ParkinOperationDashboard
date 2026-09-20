const BOOKING_RECEIPT_BRANDS = Object.freeze({
  Toyota: "/public/assets/vehicle-brands/toyota.svg",
  Kia: "/public/assets/vehicle-brands/kia.svg",
  Hyundai: "/public/assets/vehicle-brands/hyundai.svg",
  Mercedes: "/public/assets/vehicle-brands/mercedes.svg",
  Ford: "/public/assets/vehicle-brands/ford.svg",
  Lexus: "/public/assets/vehicle-brands/Lexus.svg",
  Nissan: "/public/assets/vehicle-brands/nissan.svg",
  Chevrolet: "/public/assets/vehicle-brands/chevrolet.svg",
});
let bookingReceiptRoot = null;
let bookingReceiptRoute = null;
let bookingReceiptReadyPromise = Promise.resolve();

function bookingReceiptEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bookingReceiptParts(value) {
  const text = String(value || "—");
  if (text === "-" || text === "—") return { date: "—", time: "" };
  const [date, time = ""] = text.split(", ");
  return { date: /\b202\d\b/.test(date) ? date : `${date} 2024`, time };
}

function bookingReceiptBrand(vehicle) {
  return Object.keys(BOOKING_RECEIPT_BRANDS).find((brand) =>
    String(vehicle || "").startsWith(brand),
  );
}

function buildBookingReceiptData(booking) {
  const bookingDate = bookingReceiptParts(booking.created);
  const entry = bookingReceiptParts(booking.start);
  const exit = bookingReceiptParts(booking.end);
  const parkingFee = Number.parseFloat(String(booking.amount || "").replace(/[^\d.]/g, "")) || 40;
  const serviceFee = 0;
  const vat = 6;
  const receiptNumber = String(booking.id).replace(/^BK-/, "PR-");
  const brand = bookingReceiptBrand(booking.vehicle);
  const driverName = booking.driverName || booking.assignedDriver || booking.driver || "—";
  const driverPhone = booking.driverPhone || "—";
  const receiptAdminBaseUrl =
    window.PARKIN_CONFIG?.dashboardBaseUrl || "https://admin.parkin.com.sa";
  const bookingDetailsUrl = `${receiptAdminBaseUrl.replace(/\/$/, "")}/#booking-details?id=${encodeURIComponent(booking.id)}`;
  return {
    ...booking,
    receiptNumber,
    bookingDate,
    entry,
    exit,
    parkingFee: parkingFee.toFixed(2),
    serviceFee: serviceFee.toFixed(2),
    vat: vat.toFixed(2),
    total: (parkingFee + serviceFee + vat).toFixed(2),
    brand,
    brandAsset: brand ? BOOKING_RECEIPT_BRANDS[brand] : "",
    driverName,
    driverPhone,
    transactionId: booking.transactionId || "TXN-20240524-7789",
    paymentDate: booking.paymentDate || booking.created,
    qrUrl: bookingDetailsUrl,
  };
}

function bookingReceiptSet(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = value ?? "—";
}

async function renderBookingReceiptQr(container, payload) {
  container.replaceChildren();
  const image = document.createElement("img");
  image.className = "booking-receipt-qr-image";
  image.dataset.bookingReceiptQrImage = "true";
  image.alt = "Booking details QR code";
  container.append(image);
  if (!window.QRCode?.toCanvas) throw new Error("Local QR library is unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  await window.QRCode.toCanvas(canvas, payload, {
    errorCorrectionLevel: "H",
    width: 512,
    margin: 4,
    color: { dark: "#071a2d", light: "#ffffff" },
  });
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(256, 256, 35, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#087b40";
  context.font = "bold 58px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("P", 256, 256);
  image.src = canvas.toDataURL("image/png");
}

function waitForReceiptImage(image, label = image.src) {
  if (image.complete) {
    if (image.naturalWidth === 0 && label) console.warn("Receipt print image failed:", label);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => {
      console.warn("Receipt print image failed:", label);
      resolve();
    }, { once: true });
  });
}

async function imageElementToDataUrl(image) {
  await waitForReceiptImage(image);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function normalizeReceiptBackgroundImage(backgroundImage) {
  return backgroundImage.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, value) => {
    if (value.startsWith("data:")) return match;
    return `url("${new URL(value, window.location.href).href}")`;
  });
}

async function prepareReceiptImagesForPrint(sourceReceipt, clonedReceipt) {
  const sourceImages = [...sourceReceipt.querySelectorAll("img")];
  const clonedImages = [...clonedReceipt.querySelectorAll("img")];
  await Promise.all(sourceImages.map((image) => waitForReceiptImage(image)));
  await Promise.all(clonedImages.map(async (image, index) => {
    const source = sourceImages[index];
    if (!source) return;
    const rawSource = source.currentSrc || source.src || source.getAttribute("src") || "";
    let printSource = rawSource;
    if (rawSource.startsWith("blob:") || rawSource.startsWith("data:")) {
      try {
        printSource = rawSource.startsWith("data:") ? rawSource : await imageElementToDataUrl(source);
      } catch (error) {
        console.warn("Receipt print image serialization failed:", rawSource, error);
      }
    } else if (rawSource) {
      printSource = new URL(rawSource, window.location.href).href;
    }
    image.removeAttribute("loading");
    image.loading = "eager";
    image.decoding = "sync";
    if (printSource) image.src = printSource;
  }));
  const sourceElements = [sourceReceipt, ...sourceReceipt.querySelectorAll("*")];
  const clonedElements = [clonedReceipt, ...clonedReceipt.querySelectorAll("*")];
  sourceElements.forEach((source, index) => {
    const cloned = clonedElements[index];
    if (!cloned) return;
    const backgroundImage = getComputedStyle(source).backgroundImage;
    if (backgroundImage && backgroundImage !== "none") {
      cloned.style.backgroundImage = normalizeReceiptBackgroundImage(backgroundImage);
    }
  });
  await Promise.all(clonedImages.map((image) => waitForReceiptImage(image)));
  await Promise.all(clonedImages.map(async (image) => {
    if (typeof image.decode === "function") {
      try { await image.decode(); } catch { /* load/error state is authoritative */ }
    }
  }));
}

function logReceiptPrintImages(printDocument) {
  console.table([...printDocument.images].map((image) => ({
    src: image.src,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  })));
}

async function initializeBookingReceiptPage() {
  const root = document.querySelector("[data-booking-receipt-page]");
  const routeId = new URLSearchParams(String(window.location.hash).split("?")[1] || "").get("id");
  if (!root || (bookingReceiptRoot === root && bookingReceiptRoute === routeId)) return;
  bookingReceiptRoot = root;
  bookingReceiptRoute = routeId;
  bookingReceiptReadyPromise = Promise.resolve();
  const booking = window.getBookingDemoById?.(routeId);
  const documentElement = root.querySelector("[data-receipt-document]");
  const notFound = root.querySelector("[data-receipt-not-found]");
  if (!booking) {
    documentElement?.classList.add("hidden");
    notFound?.classList.remove("hidden");
  } else if (String(booking.status || "").trim().toLowerCase() !== "completed") {
    documentElement?.classList.add("hidden");
    notFound?.classList.add("hidden");
    let unavailable = root.querySelector("[data-receipt-unavailable]");
    if (!unavailable) {
      unavailable = document.createElement("section");
      unavailable.className = "booking-receipt-not-found";
      unavailable.dataset.receiptUnavailable = "true";
      unavailable.innerHTML = "<h1>Receipt Not Available</h1><p>A receipt is available only after the booking has been completed.</p><button type=\"button\" data-receipt-back>Back to Booking Details</button>";
      root.append(unavailable);
    }
    unavailable.classList.remove("hidden");
  } else {
    root.querySelector("[data-receipt-unavailable]")?.remove();
    const receipt = buildBookingReceiptData(booking);
    documentElement?.classList.remove("hidden");
    notFound?.classList.add("hidden");
    bookingReceiptSet(root, "[data-receipt-number]", receipt.receiptNumber);
    bookingReceiptSet(root, "[data-receipt-booking-id]", receipt.id);
    bookingReceiptSet(root, "[data-receipt-booking-date]", receipt.bookingDate.date);
    bookingReceiptSet(root, "[data-receipt-booking-time]", receipt.bookingDate.time);
    bookingReceiptSet(root, "[data-receipt-entry-date]", receipt.entry.date);
    bookingReceiptSet(root, "[data-receipt-entry-time]", receipt.entry.time);
    bookingReceiptSet(root, "[data-receipt-exit-date]", receipt.exit.date);
    bookingReceiptSet(root, "[data-receipt-exit-time]", receipt.exit.time);
    bookingReceiptSet(root, "[data-receipt-duration]", receipt.duration);
    bookingReceiptSet(root, "[data-receipt-customer]", receipt.customer);
    bookingReceiptSet(root, "[data-receipt-phone]", receipt.phone);
    bookingReceiptSet(root, "[data-receipt-vehicle]", receipt.vehicle);
    bookingReceiptSet(root, "[data-receipt-vehicle-meta]", `${receipt.year || "—"} • ${receipt.color}`);
    bookingReceiptSet(root, "[data-receipt-plate]", receipt.plate);
    bookingReceiptSet(root, "[data-receipt-zone]", receipt.zone);
    bookingReceiptSet(root, "[data-receipt-location]", receipt.location);
    bookingReceiptSet(root, "[data-receipt-driver]", receipt.driverName);
    bookingReceiptSet(root, "[data-receipt-driver-phone]", receipt.driverPhone);
    bookingReceiptSet(root, "[data-receipt-parking-fee]", receipt.parkingFee);
    bookingReceiptSet(root, "[data-receipt-total]", receipt.total);
    bookingReceiptSet(root, "[data-receipt-transaction]", receipt.transactionId);
    bookingReceiptSet(root, "[data-receipt-payment-date]", receipt.paymentDate);
    const vehicleImage = root.querySelector("[data-receipt-vehicle-image]");
    if (vehicleImage && receipt.brandAsset) {
      vehicleImage.src = receipt.brandAsset;
      vehicleImage.alt = receipt.brand || "Vehicle";
    }
    const qr = root.querySelector("[data-booking-receipt-qr]");
    if (qr) {
      qr.setAttribute("aria-label", `Booking ${receipt.id} details QR code`);
      qr.dataset.qrValue = receipt.qrUrl;
      bookingReceiptReadyPromise = renderBookingReceiptQr(qr, receipt.qrUrl)
        .then(() => waitForReceiptImage(qr.querySelector("[data-booking-receipt-qr-image]")))
        .then(() => Promise.all([...root.querySelectorAll("img")].map((image) => waitForReceiptImage(image))));
    } else {
      bookingReceiptReadyPromise = Promise.reject(new Error("Receipt QR container is missing"));
    }
  }
  root.querySelectorAll("[data-receipt-back]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const currentId = new URLSearchParams(
        String(window.location.hash).split("?")[1] || "",
      ).get("id");
      window.location.hash = currentId
        ? `#booking-details?id=${encodeURIComponent(currentId)}`
        : "#bookings";
    });
  });
  const printButton = root.querySelector("[data-receipt-print]");
  if (printButton?.dataset.bound !== "true") {
    printButton.dataset.bound = "true";
    printButton.addEventListener("click", printBookingReceipt);
  }
}

function waitForBookingReceiptStylesheet(frameDocument, link) {
  if (link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  });
}

function waitForBookingReceiptFrameImages(root) {
  return Promise.all(
    [...root.images].map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }),
  );
}

async function printBookingReceipt() {
  await bookingReceiptReadyPromise;
  const sheet = bookingReceiptRoot?.querySelector("[data-receipt-document]");
  if (!sheet) return;
  const frame = document.createElement("iframe");
  frame.title = "Print receipt";
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.top = "0";
  frame.style.width = "1000px";
  frame.style.height = "1200px";
  frame.style.border = "0";
  document.body.append(frame);
  const frameDocument = frame.contentDocument;
  const iconStylesheet = document.querySelector('link[rel="stylesheet"][href*="font-awesome"]')?.href || "";
  const iconLink = iconStylesheet ? `<link rel="stylesheet" href="${iconStylesheet}">` : "";
  frameDocument.open();
  frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>ParkIn Receipt</title>${iconLink}<link rel="stylesheet" href="/css/booking-receipt.css"><style>@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;width:210mm;height:297mm;overflow:hidden;background:#fff;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body class="booking-receipt-print-document"><div id="booking-receipt-view"></div></body></html>`);
  frameDocument.close();
  await Promise.all([...frameDocument.querySelectorAll("link[rel=stylesheet]")].map((link) => waitForBookingReceiptStylesheet(frameDocument, link)));
  const printFit = frameDocument.createElement("div");
  printFit.className = "booking-receipt-print-fit";
  const printReceipt = sheet.cloneNode(true);
  printFit.append(printReceipt);
  frameDocument.querySelector("#booking-receipt-view").append(printFit);
  await prepareReceiptImagesForPrint(sheet, printReceipt);
  await waitForBookingReceiptFrameImages(frameDocument);
  if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
  logReceiptPrintImages(frameDocument);
  const receiptWidth = printReceipt.scrollWidth;
  const receiptHeight = printReceipt.scrollHeight;
  const pageWidthPx = 793.7;
  const pageHeightPx = 1122.5;
  const safeWidth = pageWidthPx - 8;
  const safeHeight = pageHeightPx - 8;
  const scale = Math.min(safeWidth / receiptWidth, safeHeight / receiptHeight, 1);
  const scaledWidth = receiptWidth * scale;
  const scaledHeight = receiptHeight * scale;
  const horizontalOffset = Math.max(0, (pageWidthPx - scaledWidth) / 2);
  console.table({ receiptWidth, receiptHeight, pageWidthPx, pageHeightPx, scale, scaledWidth, scaledHeight });
  if (scaledWidth > pageWidthPx || scaledHeight > pageHeightPx) {
    frame.remove();
    throw new Error("Receipt does not fit on one A4 page");
  }
  printFit.style.width = `${pageWidthPx}px`;
  printFit.style.height = `${pageHeightPx}px`;
  printFit.style.setProperty("--receipt-print-scale", String(scale));
  printReceipt.style.width = `${receiptWidth}px`;
  printReceipt.style.position = "absolute";
  printReceipt.style.left = `${horizontalOffset}px`;
  printReceipt.style.top = "0";
  printReceipt.style.margin = "0";
  printReceipt.style.transformOrigin = "top left";
  printReceipt.style.transform = `scale(${scale})`;
  await new Promise((resolve) => {
    const cleanup = () => {
      frame.remove();
      resolve();
    };
    frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    frame.contentWindow.focus();
    frame.contentWindow.print();
  });
}

async function loadBookingReceiptPage() {
  const container = document.querySelector("#booking-receipt-container");
  if (!container) return;
  if (!container.querySelector("[data-booking-receipt-page]")) {
    bookingReceiptRoot = null;
    bookingReceiptRoute = null;
    const response = await fetch("/pages/booking-receipt.html");
    if (!response.ok) throw new Error(`Unable to load receipt page: ${response.status}`);
    container.innerHTML = await response.text();
  }
  initializeBookingReceiptPage();
}
