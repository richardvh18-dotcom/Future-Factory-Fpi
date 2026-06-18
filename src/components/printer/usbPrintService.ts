/**
 * Controleert of WebUSB wordt ondersteund in deze browser.
 */
type UsbDeviceLike = USBDevice;

const usbNavigator = navigator as Navigator & {
  usb?: {
    requestDevice: (options: { filters: unknown[] }) => Promise<UsbDeviceLike>;
  };
};

export const isUsbDirectSupported = (): boolean => {
  return !!usbNavigator.usb;
};

/**
 * Vraagt de gebruiker om een USB-apparaat te selecteren.
 * Dit moet worden aangeroepen vanuit een user-gesture (klik).
 */
export const requestUsbPrinter = async (): Promise<UsbDeviceLike> => {
  try {
    // Filters leeg laten toont alle apparaten, handig voor Zadig-drivers
    if (!usbNavigator.usb) throw new Error("WebUSB niet ondersteund in deze browser.");
    const device = await usbNavigator.usb.requestDevice({ filters: [] });
    return device;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`USB Toegang Geweigerd: ${message}`, { cause: err });
  }
};

/**
 * Stuurt ZPL data naar het opgegeven USB-apparaat.
 * @param {USBDevice} device - Het verbonden USB apparaat
 * @param {string} zplData - De ZPL code string
 */
export const printRawUsb = async (device: UsbDeviceLike | null | undefined, zplData: string): Promise<void> => {
  if (!device) throw new Error("Geen printer geselecteerd.");

  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  try { await device.claimInterface(0); } catch { /* Interface vaak al geclaimd, negeren */ }

  const encoder = new window.TextEncoder();
  const data = encoder.encode(zplData);

  // Zoek het 'out' endpoint (waar we data naartoe kunnen sturen)
  const configuration = device.configuration;
  if (!configuration) throw new Error("USB configuratie ontbreekt op dit apparaat.");
  const interface0 = configuration.interfaces[0];
  const endpoint = interface0?.alternates
    ?.flatMap((alternate) => alternate.endpoints || [])
    .find((endpointInfo: USBEndpoint) => endpointInfo.direction === "out");
  
  if (!endpoint) throw new Error("Geen schrijf-endpoint gevonden op dit apparaat.");

  await device.transferOut(endpoint.endpointNumber, data);
};