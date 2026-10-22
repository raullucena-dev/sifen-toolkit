import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { z, ZodError } from "zod";

import type { Decimal } from "../core/decimal.js";
import { isValidRuc } from "../core/ruc.js";
import { buildInvoiceXml } from "../invoice/builder.js";
import { createSignedInvoice, type CscConfig } from "../invoice/finalize.js";
import { invoiceSchema } from "../invoice/schema.js";
import type { InvoiceTotals } from "../invoice/totals.js";
import type { SigningCredentials } from "../signing/credentials.js";
import { SifenClient } from "../soap/client.js";
import { SifenSoapError, type ConsultaRUCResult } from "../soap/parse.js";

export interface RucLookup {
  queryRuc(ruc: string): Promise<ConsultaRUCResult>;
}

export interface AppOptions {
  credentials?: SigningCredentials | undefined;
  csc?: CscConfig | undefined;
  /** Defaults to a SifenClient for the test environment when credentials are present. */
  rucLookup?: RucLookup;
  logLevel?: string;
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const invoiceBodySchema = z.toJSONSchema(invoiceSchema, {
  io: "input",
  unrepresentable: "any",
  target: "draft-7",
});

const errorSchema = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        issues: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["code", "message"],
    },
  },
} as const;

const totalsSchema = { type: "object", additionalProperties: { type: "string" } } as const;

function serializeTotals(totals: InvoiceTotals): Record<string, string> {
  const entries = Object.entries(totals) as [string, Decimal][];
  return Object.fromEntries(entries.map(([key, value]) => [key, value.toString()]));
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: options.logLevel ?? "info",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
  });

  // zod is the single source of validation; JSON schemas below only document the API.
  app.setValidatorCompiler(() => (data: unknown) => ({ value: data }));

  await app.register(swagger, {
    openapi: {
      info: {
        title: "sifen-toolkit service",
        version: "0.1.0",
        description:
          "Build, validate and sign SIFEN Facturas Electrónicas (Manual Técnico v150). " +
          "Talks to the SIFEN **test** environment only.",
      },
      tags: [{ name: "invoices" }, { name: "ruc" }, { name: "health" }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  const rucLookup =
    options.rucLookup ??
    (options.credentials ? new SifenClient({ credentials: options.credentials }) : undefined);

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: "validation_error",
          message: "invoice input is invalid",
          issues: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }
    if (error instanceof HttpError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof SifenSoapError) {
      request.log.warn({ err: error.message }, "sifen request failed");
      return reply.status(502).send({ error: { code: "sifen_error", message: error.message } });
    }
    if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode < 500) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: "bad_request", message: error.message } });
    }
    request.log.error(error);
    return reply
      .status(500)
      .send({ error: { code: "internal_error", message: "unexpected error" } });
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: { status: { type: "string" }, signing: { type: "boolean" } },
          },
        },
      },
    },
    () => ({ status: "ok", signing: Boolean(options.credentials && options.csc) }),
  );

  app.post(
    "/invoices/preview",
    {
      schema: {
        tags: ["invoices"],
        summary: "Validate an invoice and build its unsigned XML (nothing is sent)",
        body: invoiceBodySchema,
        response: {
          200: {
            type: "object",
            properties: { cdc: { type: "string" }, xml: { type: "string" }, totals: totalsSchema },
          },
          422: errorSchema,
        },
      },
    },
    (request) => {
      const built = buildInvoiceXml(request.body);
      return { cdc: built.cdc, xml: built.xml, totals: serializeTotals(built.totals) };
    },
  );

  app.post(
    "/invoices/sign",
    {
      schema: {
        tags: ["invoices"],
        summary: "Validate, build, sign and add the QR (nothing is sent)",
        description:
          "Uses the certificate and CSC configured on the server. Key material is never " +
          "accepted in requests.",
        body: invoiceBodySchema,
        response: {
          200: {
            type: "object",
            properties: {
              cdc: { type: "string" },
              signedXml: { type: "string" },
              qrUrl: { type: "string" },
              digestValue: { type: "string" },
              totals: totalsSchema,
            },
          },
          422: errorSchema,
          503: errorSchema,
        },
      },
    },
    (request) => {
      if (!options.credentials || !options.csc) {
        throw new HttpError(503, "signing_not_configured", "no certificate or CSC configured");
      }
      const signed = createSignedInvoice(request.body, options.credentials, options.csc);
      return {
        cdc: signed.cdc,
        signedXml: signed.signedXml,
        qrUrl: signed.qrUrl,
        digestValue: signed.digestValue,
        totals: serializeTotals(signed.totals),
      };
    },
  );

  app.get<{ Params: { ruc: string } }>(
    "/ruc/:ruc",
    {
      schema: {
        tags: ["ruc"],
        summary: "Validate a RUC check digit and query it in SIFEN (siConsRUC, test env)",
        params: {
          type: "object",
          properties: { ruc: { type: "string", description: "NNNNNNNN-D" } },
          required: ["ruc"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              ruc: { type: "string" },
              code: { type: "string" },
              message: { type: "string" },
              taxpayer: { type: "object", additionalProperties: true, nullable: true },
            },
          },
          400: errorSchema,
          502: errorSchema,
          503: errorSchema,
        },
      },
    },
    async (request) => {
      const { ruc } = request.params;
      if (!isValidRuc(ruc)) {
        throw new HttpError(400, "invalid_ruc", "expected NNNNNNNN-D with a valid check digit");
      }
      if (!rucLookup) {
        throw new HttpError(503, "sifen_not_configured", "no certificate configured for SIFEN");
      }
      const result = await rucLookup.queryRuc(ruc);
      return {
        ruc,
        code: result.code,
        message: result.message,
        taxpayer: result.taxpayer ?? null,
      };
    },
  );

  return app;
}
