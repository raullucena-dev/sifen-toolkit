import { buildQrUrl, type SifenEnvironment } from "../qr/qr.js";
import type { SigningCredentials } from "../signing/credentials.js";
import { signInvoiceXml, type SignOptions } from "../signing/sign.js";
import { parseRuc } from "../core/ruc.js";
import { buildInvoiceXml, type BuildOptions, type BuiltInvoice } from "./builder.js";

export interface CscConfig {
  id: string;
  value: string;
}

export interface FinalizeOptions extends BuildOptions, SignOptions {
  environment?: SifenEnvironment;
}

export interface SignedInvoice extends BuiltInvoice {
  /** Signed rDE including gCamFuFD/dCarQR, ready for siRecepDE. */
  signedXml: string;
  digestValue: string;
  qrUrl: string;
}

const escapeXml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Signs a built invoice and appends gCamFuFD with the QR URL (outside the signed DE). */
export function signBuiltInvoice(
  built: BuiltInvoice,
  credentials: SigningCredentials,
  csc: CscConfig,
  options: FinalizeOptions = {},
): SignedInvoice {
  const { xml: signedXml, digestValue } = signInvoiceXml(built.xml, credentials, options);
  const { receptor } = built.invoice;
  const qrUrl = buildQrUrl({
    cdc: built.cdc,
    fechaEmision: built.invoice.fechaEmision,
    receptor:
      receptor.tipo === "contribuyente"
        ? { ruc: parseRuc(receptor.ruc).base }
        : { numeroDocumento: receptor.numeroDocumento },
    totalGeneral: built.totals.dTotGralOpe.toString(),
    totalIva: built.totals.dTotIVA.toString(),
    cantidadItems: built.items.length,
    digestValue,
    cscId: csc.id,
    csc: csc.value,
    environment: options.environment ?? "test",
  });
  // Appended as text so the signed bytes are never re-serialised.
  const closing = signedXml.lastIndexOf("</rDE>");
  if (closing === -1) throw new Error("signed document has no closing rDE tag");
  const withQr =
    signedXml.slice(0, closing) +
    `<gCamFuFD><dCarQR>${escapeXml(qrUrl)}</dCarQR></gCamFuFD>` +
    signedXml.slice(closing);
  return { ...built, signedXml: withQr, digestValue, qrUrl };
}

/** Validate → build → sign → QR in one call. */
export function createSignedInvoice(
  input: unknown,
  credentials: SigningCredentials,
  csc: CscConfig,
  options: FinalizeOptions = {},
): SignedInvoice {
  return signBuiltInvoice(buildInvoiceXml(input, options), credentials, csc, options);
}
