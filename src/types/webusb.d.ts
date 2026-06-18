export {};

declare global {
  interface USBDeviceFilter {
    vendorId?: number;
    productId?: number;
    classCode?: number;
    subclassCode?: number;
    protocolCode?: number;
    serialNumber?: string;
  }

  interface USBEndpoint {
    endpointNumber: number;
    direction: "in" | "out";
    type?: "bulk" | "interrupt" | "isochronous";
    packetSize?: number;
  }

  interface USBAlternateInterface {
    alternateSetting: number;
    interfaceClass?: number;
    interfaceSubclass?: number;
    interfaceProtocol?: number;
    interfaceName?: string;
    endpoints: USBEndpoint[];
  }

  interface USBInterface {
    interfaceNumber: number;
    alternates: USBAlternateInterface[];
    claimed?: boolean;
  }

  interface USBConfiguration {
    configurationValue: number;
    configurationName?: string;
    interfaces: USBInterface[];
  }

  interface USBOutTransferResult {
    status: "ok" | "stall" | "babble";
    bytesWritten?: number;
  }

  interface USBDevice {
    vendorId: number;
    productId: number;
    productName?: string;
    serialNumber?: string;
    opened: boolean;
    configuration: USBConfiguration | null;
    open(): Promise<void>;
    close(): Promise<void>;
    selectConfiguration(configurationValue: number): Promise<void>;
    claimInterface(interfaceNumber: number): Promise<void>;
    selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
    transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResult>;
  }

  interface USB {
    getDevices(): Promise<USBDevice[]>;
    requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
  }

  interface Navigator {
    usb: USB;
  }
}
