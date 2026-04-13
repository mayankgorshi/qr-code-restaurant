import QRCode from "qrcode"

const qrOptions = {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 1,
  color: {
    dark: "#111827",
    light: "#ffffff"
  }
}

export async function createQrSvg(value, width = 220) {
  return QRCode.toString(value, {
    ...qrOptions,
    width
  })
}

export async function createQrDataUrl(value, width = 220) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width,
    color: {
      dark: "#111827",
      light: "#ffffff"
    }
  })
}
