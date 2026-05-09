// @ts-nocheck
/**
 * Controleert of WebUSB wordt ondersteund in deze browser.
 */
export const isUsbDirectSupported = () => {
  return !!navigator.usb;
};

/**
 * Vraagt de gebruiker om een USB-apparaat te selecteren.
 * Dit moet worden aangeroepen vanuit een user-gesture (klik).
 */
export const requestUsbPrinter = async () => {
  try {
    // Filters leeg laten toont alle apparaten, handig voor Zadig-drivers
    const device = await navigator.usb.requestDevice({ filters: [] });
    return device;
  } catch (err) {
    throw new Error(`USB Toegang Geweigerd: ${err.message}`, { cause: err });
  }
};

/**
 * Stuurt ZPL data naar het opgegeven USB-apparaat.
 * @param {USBDevice} device - Het verbonden USB apparaat
 * @param {string} zplData - De ZPL code string
 */
export const printRawUsb = async (device, zplData) => {
  if (!device) throw new Error("Geen printer geselecteerd.");

  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  try { await device.claimInterface(0); } catch { /* Interface vaak al geclaimd, negeren */ }

  const encoder = new window.TextEncoder();
  const data = encoder.encode(zplData);

  // Zoek het 'out' endpoint (waar we data naartoe kunnen sturen)
  const interface0 = device.configuration.interfaces[0];
  const endpoint = interface0?.alternate?.endpoints.find((endpointInfo) => endpointInfo.direction === "out");
  
  if (!endpoint) throw new Error("Geen schrijf-endpoint gevonden op dit apparaat.");

  await device.transferOut(endpoint.endpointNumber, data);
};