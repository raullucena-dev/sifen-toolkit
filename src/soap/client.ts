import { Agent, request } from "node:https";

import { isValidCdc } from "../core/cdc.js";
import { parseRuc } from "../core/ruc.js";
import type { SigningCredentials } from "../signing/credentials.js";
import { SIFEN_TEST_ENDPOINTS, SIFEN_TEST_HOST, type SifenEndpoints } from "./endpoints.js";
import { consultaDEEnvelope, consultaRUCEnvelope, recepcionDEEnvelope } from "./envelope.js";
import {
  parseConsultaDEResponse,
  parseConsultaRUCResponse,
  parseRecepcionResponse,
  SifenSoapError,
  type ConsultaDEResult,
  type ConsultaRUCResult,
  type RecepcionResult,
} from "./parse.js";

export interface TransportResponse {
  status: number;
  body: string;
}

/** Sends a SOAP 1.2 request. Replaceable for tests or custom HTTP stacks. */
export type Transport = (url: string, envelope: string) => Promise<TransportResponse>;

export interface SifenClientOptions {
  /** Certificate used for mutual TLS (the same one issued for signing). */
  credentials: SigningCredentials;
  endpoints?: Partial<SifenEndpoints>;
  timeoutMs?: number;
  /**
   * Endpoints outside the SIFEN test host are refused unless this is set. This toolkit
   * is not production-hardened (see ADR 0003).
   */
  allowNonTestEndpoints?: boolean;
  /** Extra CA certificates (PEM) to trust, e.g. for a corporate proxy. */
  ca?: string | string[];
  transport?: Transport;
}

export function httpsTransport(options: {
  credentials: SigningCredentials;
  timeoutMs: number;
  ca?: string | string[];
}): Transport {
  const agent = new Agent({
    key: options.credentials.privateKeyPem,
    cert: options.credentials.certificatePem,
    keepAlive: true,
    minVersion: "TLSv1.2",
    ...(options.ca ? { ca: options.ca } : {}),
  });
  return (url, envelope) =>
    new Promise<TransportResponse>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "POST",
          agent,
          timeout: options.timeoutMs,
          headers: {
            "Content-Type": "application/soap+xml; charset=utf-8",
            "Content-Length": Buffer.byteLength(envelope),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
          });
          res.on("error", reject);
        },
      );
      req.on("timeout", () => {
        req.destroy(new SifenSoapError(`request to ${url} timed out`));
      });
      req.on("error", reject);
      req.end(envelope);
    });
}

let lastId = 0;

/** dId: request identifier, up to 15 digits, unique per request. */
export function nextRequestId(): string {
  const candidate = Date.now() * 100;
  lastId = candidate > lastId ? candidate : lastId + 1;
  return String(lastId).slice(-15);
}

export class SifenClient {
  private readonly endpoints: SifenEndpoints;
  private readonly transport: Transport;

  constructor(options: SifenClientOptions) {
    this.endpoints = { ...SIFEN_TEST_ENDPOINTS, ...options.endpoints };
    if (!options.allowNonTestEndpoints) {
      for (const [name, url] of Object.entries(this.endpoints)) {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || parsed.host !== SIFEN_TEST_HOST) {
          throw new Error(
            `${name} endpoint ${url} is not the SIFEN test environment; ` +
              "set allowNonTestEndpoints to use it",
          );
        }
      }
    }
    this.transport =
      options.transport ??
      httpsTransport({
        credentials: options.credentials,
        timeoutMs: options.timeoutMs ?? 30_000,
        ...(options.ca ? { ca: options.ca } : {}),
      });
  }

  /** siRecepDE: send one signed DE (synchronous reception). */
  async sendDocument(signedXml: string, dId = nextRequestId()): Promise<RecepcionResult> {
    const body = await this.call(this.endpoints.recepcionDE, recepcionDEEnvelope(dId, signedXml));
    return parseRecepcionResponse(body);
  }

  /** siConsDE: look up a DE by its CDC. */
  async queryDocument(cdc: string, dId = nextRequestId()): Promise<ConsultaDEResult> {
    if (!isValidCdc(cdc)) throw new TypeError("invalid CDC");
    const body = await this.call(this.endpoints.consultaDE, consultaDEEnvelope(dId, cdc));
    return parseConsultaDEResponse(body);
  }

  /** siConsRUC: look up a taxpayer. Accepts `NNNNNNNN-D` (DV is validated) or the base. */
  async queryRuc(ruc: string, dId = nextRequestId()): Promise<ConsultaRUCResult> {
    const { base } = parseRuc(ruc);
    const body = await this.call(this.endpoints.consultaRUC, consultaRUCEnvelope(dId, base));
    return parseConsultaRUCResponse(body);
  }

  private async call(url: string, envelope: string): Promise<string> {
    const response = await this.transport(url, envelope);
    // SOAP faults are returned with HTTP 500 and are parsed into a SifenSoapError.
    if (response.status >= 400 && !response.body.includes("Fault")) {
      throw new SifenSoapError(`SIFEN returned HTTP ${response.status}`, {
        status: response.status,
        body: response.body,
      });
    }
    return response.body;
  }
}
