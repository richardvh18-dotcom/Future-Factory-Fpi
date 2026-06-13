type UsbPrinterFilterInput = {
  vendorId?: unknown;
  productId?: unknown;
  usbVendorId?: unknown;
  usbProductId?: unknown;
};

type UsbPrinterRef = {
  vendorId?: number;
  productId?: number;
};

const USB_TRANSFER_CHUNK_SIZE = 4096;

type UsbDeviceLockState = {
  locked: boolean;
  waiters: Array<() => void>;
};

const usbDeviceLocks = new Map<string, UsbDeviceLockState>();

const getUsbDeviceLockKey = (device: USBDevice): string => {
  const vendor = Number(device?.vendorId || 0);
  const product = Number(device?.productId || 0);
  const serial = String(device?.serialNumber || "").trim();
  return `${vendor}:${product}:${serial || "na"}`;
};

const acquireUsbDeviceLock = async (device: USBDevice): Promise<() => void> => {
  const key = getUsbDeviceLockKey(device);
  let state = usbDeviceLocks.get(key);

  if (!state) {
    state = { locked: false, waiters: [] };
    usbDeviceLocks.set(key, state);
  }

  if (!state.locked) {
    state.locked = true;
    return () => {
      const current = usbDeviceLocks.get(key);
      if (!current) return;
      const next = current.waiters.shift();
      if (next) {
        next();
      } else {
        current.locked = false;
      }
    };
  }

  await new Promise<void>((resolve) => {
    state?.waiters.push(resolve);
  });

  const resumedState = usbDeviceLocks.get(key);
  if (resumedState) resumedState.locked = true;

  return () => {
    const current = usbDeviceLocks.get(key);
    if (!current) return;
    const next = current.waiters.shift();
    if (next) {
      next();
    } else {
      current.locked = false;
    }
  };
};

export const parseUsbId = (value: unknown): number | undefined => {
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

export const getPrinterFilters = (printer: UsbPrinterFilterInput = {}): USBDeviceFilter[] => {
  const vendorId = parseUsbId(printer.vendorId ?? printer.usbVendorId);
  const productId = parseUsbId(printer.productId ?? printer.usbProductId);

  if (vendorId && productId) return [{ vendorId, productId }];
  if (vendorId) return [{ vendorId }];
  return [];
};

const ensureUsbSupport = (): void => {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.usb) {
    throw new Error("WebUSB is niet beschikbaar in deze browser.");
  }

  if (!window.isSecureContext) {
    throw new Error("WebUSB werkt alleen in een secure context (https of localhost).");
  }
};

const getOutEndpoint = (
  device: USBDevice
): { interfaceNumber: number; alternateSetting: number; endpointNumber: number } | null => {
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

const safeCloseDevice = async (device: USBDevice | null | undefined): Promise<void> => {
  if (!device) return;

  try {
    if (device.opened) {
      await device.close();
    }
  } catch {
    // Best effort close; ignore close failures.
  }
};

const closeMatchingAuthorizedDevices = async ({
  printer = {},
  excludeDevice,
}: {
  printer?: UsbPrinterFilterInput;
  excludeDevice?: USBDevice;
} = {}): Promise<void> => {
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

const normalizeUsbError = (err: unknown): Error => {
  if (err instanceof Error) {
    const name = String(err.name || "");
    const message = String(err.message || "");
    const combined = `${name} ${message}`.toLowerCase();

    if (name === "NotFoundError" || /no device selected|geen apparaat geselecteerd/i.test(combined)) {
      return new Error("Geen USB-printer geselecteerd. Kies een printer in de browser-popup om te printen.");
    }

    if (name === "SecurityError" || /access denied|permission|toegang|not allowed/i.test(combined)) {
      return new Error(
        "USB toegang geweigerd. Sluit andere tabbladen/apps die de printer gebruiken, koppel USB opnieuw en geef browsertoegang opnieuw."
      );
    }

    if (/claiminterface|claim interface|unable to claim interface|interface/i.test(combined)) {
      return new Error(
        "USB interface kon niet geclaimd worden. Printer kan nog bezet zijn door een ander tabblad of proces. Sluit andere printsessies en probeer opnieuw."
      );
    }

    return err;
  }

  return new Error(String(err || "Onbekende USB fout"));
};

const prepareDevice = async (
  device: USBDevice,
  printer: UsbPrinterRef = {}
): Promise<{ interfaceNumber: number; alternateSetting: number; endpointNumber: number }> => {
  if (!device.opened) {
    try {
      await device.open();
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : "";
      const errMessage = err instanceof Error ? err.message : String(err || "");
      const isAccessIssue =
        errName === "SecurityError" || /access denied|permission|toegang/i.test(String(errMessage || ""));

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
  } catch (err: unknown) {
    const errName = err instanceof Error ? err.name : "";
    const message = String(err instanceof Error ? err.message : err || "").toLowerCase();
    const isAlreadyClaimed = errName === "InvalidStateError" || /already|claimed|state/i.test(message);
    if (!isAlreadyClaimed) {
      // Retry once after forcefully resetting this browser-context USB session.
      await closeMatchingAuthorizedDevices({ printer, excludeDevice: device });
      await safeCloseDevice(device);
      await device.open();
      if (!device.configuration) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(endpointInfo.interfaceNumber);
    }
  }

  if (endpointInfo.alternateSetting !== undefined) {
    await device.selectAlternateInterface(endpointInfo.interfaceNumber, endpointInfo.alternateSetting);
  }

  return endpointInfo;
};

const selectUsbDevice = async (printer: UsbPrinterFilterInput = {}): Promise<USBDevice> => {
  ensureUsbSupport();

  const filters = getPrinterFilters(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  const matchAuthorized =
    filters.length > 0
      ? authorizedDevices.find((d) =>
          filters.some((f) => d.vendorId === f.vendorId && (f.productId ? d.productId === f.productId : true))
        )
      : authorizedDevices[0];

  if (matchAuthorized) return matchAuthorized;

  try {
    return await navigator.usb.requestDevice({ filters });
  } catch (err: unknown) {
    const isNotFound = err instanceof Error && err.name === "NotFoundError";
    // Als profiel-filters te strikt of onjuist zijn, geef een tweede kans zonder filters.
    if (isNotFound && filters.length > 0) {
      try {
        return await navigator.usb.requestDevice({ filters: [] });
      } catch (fallbackErr: unknown) {
        throw normalizeUsbError(fallbackErr);
      }
    }
    throw normalizeUsbError(err);
  }
};

export const findAuthorizedUsbDevice = async (
  printer: UsbPrinterFilterInput = {}
): Promise<USBDevice | null> => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  const authorizedDevices = await navigator.usb.getDevices();

  if (filters.length === 0) {
    return authorizedDevices[0] || null;
  }

  return (
    authorizedDevices.find((d) =>
      filters.some((f) => d.vendorId === f.vendorId && (f.productId ? d.productId === f.productId : true))
    ) || null
  );
};

export const requestUsbDevice = async (printer: UsbPrinterFilterInput = {}): Promise<USBDevice> => {
  ensureUsbSupport();
  const filters = getPrinterFilters(printer);
  try {
    return await navigator.usb.requestDevice({ filters });
  } catch (err: unknown) {
    const isNotFound = err instanceof Error && err.name === "NotFoundError";
    if (isNotFound && filters.length > 0) {
      try {
        return await navigator.usb.requestDevice({ filters: [] });
      } catch (fallbackErr: unknown) {
        throw normalizeUsbError(fallbackErr);
      }
    }
    throw normalizeUsbError(err);
  }
};

export const printRawUsbToDevice = async ({
  device,
  content,
}: {
  device: USBDevice | null | undefined;
  content: unknown;
}) => {
  if (!device) {
    throw new Error("Geen printer verbonden.");
  }
  if (!content || !String(content).trim()) {
    throw new Error("Geen printinhoud opgegeven.");
  }

  ensureUsbSupport();
  const releaseDeviceLock = await acquireUsbDeviceLock(device);
  try {
    const endpointInfo = await prepareDevice(device, {
      vendorId: device.vendorId,
      productId: device.productId,
    });
    const data = new TextEncoder().encode(String(content));

    for (let offset = 0; offset < data.length; offset += USB_TRANSFER_CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + USB_TRANSFER_CHUNK_SIZE);
      const result = await device.transferOut(endpointInfo.endpointNumber, chunk);
      if (result.status !== "ok") {
        throw new Error(`USB print mislukt met status: ${result.status}`);
      }
    }

    return {
      productName: device.productName || "Onbekende USB printer",
      vendorId: device.vendorId,
      productId: device.productId,
    };
  } catch (err: unknown) {
    throw normalizeUsbError(err);
  } finally {
    await safeCloseDevice(device);
    releaseDeviceLock();
  }
};

export const printRawUsb = async ({
  content,
  printer = {},
}: {
  content: unknown;
  printer?: UsbPrinterFilterInput;
}) => {
  if (!content || !String(content).trim()) {
    throw new Error("Geen printinhoud opgegeven.");
  }

  const device = await selectUsbDevice(printer);
  return printRawUsbToDevice({ device, content });
};

export const isUsbDirectSupported = (): boolean => {
  return typeof window !== "undefined" && typeof navigator !== "undefined" && !!navigator.usb && !!window.isSecureContext;
};
