export { modulo11 } from "./core/modulo11.js";
export { formatRuc, isValidRuc, parseRuc, rucCheckDigit, type Ruc } from "./core/ruc.js";
export {
  buildCdc,
  generateSecurityCode,
  isValidCdc,
  parseCdc,
  type CdcComponents,
  type ParsedCdc,
} from "./core/cdc.js";
export { Decimal } from "./core/decimal.js";
export {
  invoiceSchema,
  parseInvoice,
  type Invoice,
  type InvoiceInput,
  type InvoiceItem,
  type Receptor,
} from "./invoice/schema.js";
export {
  computeInvoiceAmounts,
  computeItem,
  computeTotals,
  type InvoiceTotals,
  type ItemAmounts,
} from "./invoice/totals.js";
export {
  buildInvoiceXml,
  FORMAT_VERSION,
  nowInAsuncion,
  SIFEN_NAMESPACE,
  type BuildOptions,
  type BuiltInvoice,
} from "./invoice/builder.js";
export { loadPem, loadPkcs12, type SigningCredentials } from "./signing/credentials.js";
export {
  ALGORITHMS,
  extractDigestValue,
  signInvoiceXml,
  verifyInvoiceSignature,
  type SignedDocument,
  type SignOptions,
  type VerificationResult,
} from "./signing/sign.js";
export { buildQrUrl, QR_BASE_URLS, type QrInput, type SifenEnvironment } from "./qr/qr.js";
export {
  createSignedInvoice,
  signBuiltInvoice,
  type CscConfig,
  type FinalizeOptions,
  type SignedInvoice,
} from "./invoice/finalize.js";
export { SIFEN_TEST_ENDPOINTS, type SifenEndpoints } from "./soap/endpoints.js";
export {
  consultaDEEnvelope,
  consultaRUCEnvelope,
  recepcionDEEnvelope,
  SOAP12_NAMESPACE,
} from "./soap/envelope.js";
export {
  parseConsultaDEResponse,
  parseConsultaRUCResponse,
  parseRecepcionResponse,
  SifenSoapError,
  type ConsultaDEResult,
  type ConsultaRUCResult,
  type RecepcionResult,
  type ResultMessage,
} from "./soap/parse.js";
export {
  httpsTransport,
  nextRequestId,
  SifenClient,
  type SifenClientOptions,
  type Transport,
  type TransportResponse,
} from "./soap/client.js";
