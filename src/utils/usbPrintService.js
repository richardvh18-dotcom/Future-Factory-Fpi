const parseUsbId = (value) => {
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

const getPrinterFilters = (printer = {}) => {
  const vendorId = parseUsbId(printer.usbVendorId);
  const productId = parseUsbId(printer.usbProductId);

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

const prepareDevice = async (device) => {
  if (!device.opened) {
    await device.open();
  }

  if (!device.configuration) {
    await device.selectConfiguration(1);
  }

  const endpointInfo = getOutEndpoint(device);
  if (!endpointInfo) {
    throw new Error("Geen bruikbare USB OUT endpoint gevonden voor deze printer.");
  }

  await device.claimInterface(endpointInfo.interfaceNumber);

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

export const printRawUsb = async ({ content, printer = {} }) => {
  if (!content || !String(content).trim()) {
    throw new Error("Geen printinhoud opgegeven.");
  }

  const device = await selectUsbDevice(printer);
  const endpointInfo = await prepareDevice(device);
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
};

export const isUsbDirectSupported = () => {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && !!navigator.usb && !!window.isSecureContext;
};
