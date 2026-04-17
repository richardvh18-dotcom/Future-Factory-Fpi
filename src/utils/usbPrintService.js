export const parseUsbId = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return value;
  const text = String(value).trim().toLowerCase();
  if (text.startsWith("0x")) {
    const parsedHex = parseInt(text, 16);
    return Number.isNaN(parsedHex) ? undefined : parsedHex;
  }
  const parsed = parseInt(text, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const getPrinterFilters = (printer = {}) => {
  const vendorId = parseUsbId(printer.vendorId ?? printer.usbVendorId);
  const productId = parseUsbId(printer.productId ?? printer.usbProductId);

  if (vendorId && productId) return [{ vendorId, productId }];
  if (vendorId) return [{ vendorId }];
  return [];
};

const ensureUsbSupport = () => {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.usb) {
    throw new Error("WebUSB is niet beschikbaar in deze browser.");
  }

  if (!window.isSecureContext) {
    throw new Error("WebUSB werkt alleen in een secure context (https of localhost).");
  }
};

const getOutEndpoint = (device) => {
  const interfaces = device.configuration?.interfaces || [];

  for (const iface of interfaces) {
    for (const alternate of iface.alternates || []) {
      const endpoint = (alternate.endpoints || []).find((ep) => ep.direction === "out");
      if (endpoint) {
        return {
          interfaceNumber: iface.interfaceNumber,
          alternateSetting: alternate.alternateSetting,
          endpointNumber: endpoint.endpointNumber,
        };
      }
    }
  }

  return null;
};

const safeCloseDevice = async (device) => {
  if (!device) return;
  try {
    if (device.opened) {
      await device.close();
    }
  } catch {
    // Best effort close; ignore close failures.
  }
};

const closeMatchingAuthorizedDevices = async ({ printer = {}, excludeDevice } = {}) => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  const matching = authorizedDevices.filter((device) => {
    if (excludeDevice && device === excludeDevice) return false;
    if (filters.length === 0) return true;
    return filters.some(
      (f) => device.vendorId === f.vendorId && (f.productId ? device.productId === f.productId : true)
    );
  });

  for (const device of matching) {
    await safeCloseDevice(device);
  }
};

const normalizeUsbError = (err) => {
  const name = String(err?.name || "");
  const message = String(err?.message || "");
  const combined = `${name} ${message}`.toLowerCase();

  if (name === "SecurityError" || /access denied|permission|toegang|not allowed/i.test(combined)) {
    return new Error(
      "USB toegang geweigerd. Sluit andere tabbladen/apps die de printer gebruiken, koppel USB opnieuw en geef browsertoegang opnieuw." 
    );
  }

  return err;
};

const prepareDevice = async (device, printer = {}) => {
  if (!device.opened) {
    try {
      await device.open();
    } catch (err) {
      const isAccessIssue = err?.name === "SecurityError" || /access denied|permission|toegang/i.test(String(err?.message || ""));
      if (!isAccessIssue) throw err;

      // One retry after cleaning up potentially stale sessions in this browser context.
      await closeMatchingAuthorizedDevices({ printer, excludeDevice: device });
      await safeCloseDevice(device);
      await device.open();
    }
  }

  if (!device.configuration) {
    await device.selectConfiguration(1);
  }

  const endpointInfo = getOutEndpoint(device);
  if (!endpointInfo) {
    throw new Error("Geen bruikbare USB OUT endpoint gevonden voor deze printer.");
  }

  try {
    await device.claimInterface(endpointInfo.interfaceNumber);
  } catch (err) {
    const message = String(err?.message || "").toLowerCase();
    const isAlreadyClaimed = err?.name === "InvalidStateError" || /already|claimed|state/i.test(message);
    if (!isAlreadyClaimed) throw err;
  }

  if (endpointInfo.alternateSetting !== undefined) {
    await device.selectAlternateInterface(endpointInfo.interfaceNumber, endpointInfo.alternateSetting);
  }

  return endpointInfo;
};

const selectUsbDevice = async (printer = {}) => {
  ensureUsbSupport();

  const filters = getPrinterFilters(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  const matchAuthorized = filters.length > 0
    ? authorizedDevices.find((d) => filters.some((f) => d.vendorId === f.vendorId && (f.productId ? d.productId === f.productId : true)))
    : authorizedDevices[0];

  if (matchAuthorized) return matchAuthorized;

  return navigator.usb.requestDevice({ filters });
};

export const findAuthorizedUsbDevice = async (printer = {}) => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  if (filters.length === 0) {
    return authorizedDevices[0] || null;
  }

  return (
    authorizedDevices.find((d) =>
      filters.some(
        (f) => d.vendorId === f.vendorId && (f.productId ? d.productId === f.productId : true)
      )
    ) || null
  );
};

export const requestUsbDevice = async (printer = {}) => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  return navigator.usb.requestDevice({ filters });
};

export const printRawUsbToDevice = async ({ device, content }) => {
  if (!device) {
    throw new Error("Geen printer verbonden.");
  }
  if (!content || !String(content).trim()) {
    throw new Error("Geen printinhoud opgegeven.");
  }

  ensureUsbSupport();
  try {
    const endpointInfo = await prepareDevice(device, {
      vendorId: device.vendorId,
      productId: device.productId,
    });
    const data = new TextEncoder().encode(String(content));

    const result = await device.transferOut(endpointInfo.endpointNumber, data);
    if (result.status !== "ok") {
      throw new Error(`USB print mislukt met status: ${result.status}`);
    }

    return {
      productName: device.productName || "Onbekende USB printer",
      vendorId: device.vendorId,
      productId: device.productId,
    };
  } catch (err) {
    throw normalizeUsbError(err);
  } finally {
    await safeCloseDevice(device);
  }
};

export const printRawUsb = async ({ content, printer = {} }) => {
  if (!content || !String(content).trim()) {
    throw new Error("Geen printinhoud opgegeven.");
  }

  const device = await selectUsbDevice(printer);
  return printRawUsbToDevice({ device, content });
};

export const isUsbDirectSupported = () => {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && !!navigator.usb && !!window.isSecureContext;
};
