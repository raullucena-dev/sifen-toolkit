import { createHash } from "node:crypto";

export const QR_BASE_URLS = {
  test: "https://ekuatia.set.gov.py/consultas-test/qr?",
  production: "https://ekuatia.set.gov.py/consultas/qr?",
} as const;

export type SifenEnvironment = keyof typeof QR_BASE_URLS;

export interface QrInput {
  cdc: string;
  /** dFeEmiDE exactly as written in the XML (`YYYY-MM-DDThh:mm:ss`). */
  fechaEmision: string;
  /** dRucRec (RUC without DV) for contribuyentes, or dNumIDRec otherwise. */
  receptor: { ruc: string } | { numeroDocumento: string };
  /** dTotGralOpe as written in the XML. */
  totalGeneral: string;
  /** dTotIVA as written in the XML. */
  totalIva: string;
  /** Number of gCamItem elements. */
  cantidadItems: number;
  /** Base64 DigestValue from the signature. */
  digestValue: string;
  /** IdCSC, 4 digits (e.g. `0001`). */
  cscId: string;
  /** Código de Seguridad del Contribuyente issued by the SET. Never logged. */
  csc: string;
  /** Default: `test`. */
  environment?: SifenEnvironment;
}

/** Lowercase hex of the UTF-8 text (Buffer#toString("hex") is always lowercase). */
const toHex = (value: string) => Buffer.from(value, "utf8").toString("hex");

/**
 * Builds dCarQR. The parameter string (everything after `?`) is hashed together with the
 * CSC: `cHashQR = sha256_hex(params + CSC)` in lowercase hex, then appended as the last
 * parameter. Lowercase is confirmed against a production SIFEN integration.
 */
export function buildQrUrl(input: QrInput): string {
  if (!/^\d{44}$/.test(input.cdc)) throw new TypeError("cdc must be 44 digits");
  if (!/^\d{4}$/.test(input.cscId)) throw new TypeError("cscId must be 4 digits, e.g. 0001");
  if (!/^[A-Za-z0-9]{32}$/.test(input.csc)) {
    throw new TypeError("csc must be 32 alphanumeric characters");
  }
  if (!Number.isInteger(input.cantidadItems) || input.cantidadItems < 1) {
    throw new TypeError("cantidadItems must be a positive integer");
  }
  const receptor =
    "ruc" in input.receptor
      ? `dRucRec=${input.receptor.ruc}`
      : `dNumIDRec=${input.receptor.numeroDocumento}`;
  const params = [
    "nVersion=150",
    `Id=${input.cdc}`,
    `dFeEmiDE=${toHex(input.fechaEmision)}`,
    receptor,
    `dTotGralOpe=${input.totalGeneral}`,
    `dTotIVA=${input.totalIva}`,
    `cItems=${input.cantidadItems}`,
    `DigestValue=${toHex(input.digestValue)}`,
    `IdCSC=${input.cscId}`,
  ].join("&");
  const hash = createHash("sha256")
    .update(params + input.csc)
    .digest("hex")
    .toLowerCase();
  return `${QR_BASE_URLS[input.environment ?? "test"]}${params}&cHashQR=${hash}`;
}
