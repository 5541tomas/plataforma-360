import QRCode from "qrcode";
/** QR code em SVG (servidor). */
export const qrSvg = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0B1B33", light: "#FFFFFF" } });
