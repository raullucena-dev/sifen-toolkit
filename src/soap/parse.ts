import { DOMParser, XMLSerializer, type Element } from "@xmldom/xmldom";

import { SOAP12_NAMESPACE } from "./envelope.js";

export class SifenSoapError extends Error {
  constructor(
    message: string,
    readonly details: { status?: number; faultCode?: string | undefined; body?: string } = {},
  ) {
    super(message);
    this.name = "SifenSoapError";
  }
}

export interface ResultMessage {
  code: string;
  message: string;
}

export interface RecepcionResult {
  cdc: string | undefined;
  /** dEstRes, e.g. "Aprobado", "Aprobado con observación", "Rechazado". */
  status: string | undefined;
  approved: boolean;
  processedAt: string | undefined;
  /** dProtAut (authorization protocol), when approved. */
  protocol: string | undefined;
  messages: ResultMessage[];
  rawXml: string;
}

export interface ConsultaDEResult {
  code: string | undefined;
  message: string | undefined;
  processedAt: string | undefined;
  /** Inner xContenDE payload as XML, when the document was found. */
  documentXml: string | undefined;
  rawXml: string;
}

export interface ConsultaRUCResult {
  code: string | undefined;
  message: string | undefined;
  taxpayer:
    | {
        ruc: string | undefined;
        name: string | undefined;
        statusCode: string | undefined;
        statusDescription: string | undefined;
        /** dRUCFactElec: whether the taxpayer is enabled for electronic invoicing. */
        electronicInvoicing: string | undefined;
      }
    | undefined;
  rawXml: string;
}

function parseBody(xml: string): Element {
  const doc = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") throw new SifenSoapError(`malformed SOAP response: ${message}`);
    },
  }).parseFromString(xml, "text/xml");
  const body = doc.getElementsByTagNameNS(SOAP12_NAMESPACE, "Body")[0];
  if (!body) throw new SifenSoapError("response is not a SOAP 1.2 envelope", { body: xml });
  const fault = body.getElementsByTagNameNS(SOAP12_NAMESPACE, "Fault")[0];
  if (fault) {
    const reason = first(fault, "Text") ?? "SOAP fault";
    throw new SifenSoapError(reason, { faultCode: first(fault, "Value"), body: xml });
  }
  return body;
}

function descendants(scope: Element, localName: string): Element[] {
  return Array.from(scope.getElementsByTagNameNS("*", localName));
}

function first(scope: Element, localName: string): string | undefined {
  const value = descendants(scope, localName)[0]?.textContent?.trim();
  return value === "" ? undefined : value;
}

export function parseRecepcionResponse(xml: string): RecepcionResult {
  const body = parseBody(xml);
  const prot = descendants(body, "rProtDe")[0] ?? body;
  const status = first(prot, "dEstRes");
  const messages = descendants(prot, "gResProc").map((group) => ({
    code: first(group, "dCodRes") ?? "",
    message: first(group, "dMsgRes") ?? "",
  }));
  return {
    cdc: first(prot, "Id"),
    status,
    approved: status?.toLowerCase().startsWith("aprobado") ?? false,
    processedAt: first(prot, "dFecProc"),
    protocol: first(prot, "dProtAut"),
    messages,
    rawXml: xml,
  };
}

export function parseConsultaDEResponse(xml: string): ConsultaDEResult {
  const body = parseBody(xml);
  const content = descendants(body, "xContenDE")[0];
  const documentXml = content
    ? Array.from(content.childNodes)
        .map((node) => new XMLSerializer().serializeToString(node))
        .join("")
        .trim() || undefined
    : undefined;
  return {
    code: first(body, "dCodRes"),
    message: first(body, "dMsgRes"),
    processedAt: first(body, "dFecProc"),
    documentXml,
    rawXml: xml,
  };
}

export function parseConsultaRUCResponse(xml: string): ConsultaRUCResult {
  const body = parseBody(xml);
  const content = descendants(body, "xContRUC")[0];
  return {
    code: first(body, "dCodRes"),
    message: first(body, "dMsgRes"),
    taxpayer: content
      ? {
          ruc: first(content, "dRUCCons"),
          name: first(content, "dRazCons"),
          statusCode: first(content, "dCodEstCons"),
          statusDescription: first(content, "dDesEstCons"),
          electronicInvoicing: first(content, "dRUCFactElec"),
        }
      : undefined,
    rawXml: xml,
  };
}
