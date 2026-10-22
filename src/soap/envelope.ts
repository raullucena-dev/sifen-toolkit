import { SIFEN_NAMESPACE } from "../invoice/builder.js";

export const SOAP12_NAMESPACE = "http://www.w3.org/2003/05/soap-envelope";

const escapeText = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function envelope(body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP12_NAMESPACE}"><soap:Header/>` +
    `<soap:Body>${body}</soap:Body></soap:Envelope>`
  );
}

function stripDeclaration(xml: string): string {
  return xml.replace(/^\s*<\?xml[^>]*\?>\s*/, "");
}

/** siRecepDE: one signed rDE, embedded as XML (not escaped) inside xDE. */
export function recepcionDEEnvelope(dId: string, signedRde: string): string {
  const rde = stripDeclaration(signedRde);
  if (!rde.startsWith("<rDE")) throw new TypeError("expected a signed rDE document");
  return envelope(
    `<rEnviDe xmlns="${SIFEN_NAMESPACE}"><dId>${dId}</dId><xDE>${rde}</xDE></rEnviDe>`,
  );
}

/** siConsDE: query one DE by CDC. */
export function consultaDEEnvelope(dId: string, cdc: string): string {
  return envelope(
    `<rEnviConsDeRequest xmlns="${SIFEN_NAMESPACE}"><dId>${dId}</dId>` +
      `<dCDC>${escapeText(cdc)}</dCDC></rEnviConsDeRequest>`,
  );
}

/** siConsRUC: query a taxpayer by RUC (without check digit). */
export function consultaRUCEnvelope(dId: string, ruc: string): string {
  return envelope(
    `<rEnviConsRUC xmlns="${SIFEN_NAMESPACE}"><dId>${dId}</dId>` +
      `<dRUCCons>${escapeText(ruc)}</dRUCCons></rEnviConsRUC>`,
  );
}
