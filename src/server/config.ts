import { readFileSync } from "node:fs";

import type { CscConfig } from "../invoice/finalize.js";
import { loadPem, loadPkcs12, type SigningCredentials } from "../signing/credentials.js";

export interface ServerConfig {
  host: string;
  port: number;
  logLevel: string;
  credentials: SigningCredentials | undefined;
  csc: CscConfig | undefined;
}

/**
 * Reads configuration from environment variables. Key material is read from files given
 * by path (mounted secrets), never from inline env values or request bodies.
 *
 *   SIFEN_CERT_P12_PATH + SIFEN_CERT_P12_PASSWORD   or
 *   SIFEN_CERT_PEM_PATH + SIFEN_KEY_PEM_PATH
 *   SIFEN_CSC_ID + SIFEN_CSC
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: env["HOST"] ?? "0.0.0.0",
    port: Number(env["PORT"] ?? 3000),
    logLevel: env["LOG_LEVEL"] ?? "info",
    credentials: loadCredentials(env),
    csc:
      env["SIFEN_CSC_ID"] && env["SIFEN_CSC"]
        ? { id: env["SIFEN_CSC_ID"], value: env["SIFEN_CSC"] }
        : undefined,
  };
}

function loadCredentials(env: NodeJS.ProcessEnv): SigningCredentials | undefined {
  const p12Path = env["SIFEN_CERT_P12_PATH"];
  if (p12Path) {
    return loadPkcs12(readFileSync(p12Path), env["SIFEN_CERT_P12_PASSWORD"] ?? "");
  }
  const certPath = env["SIFEN_CERT_PEM_PATH"];
  const keyPath = env["SIFEN_KEY_PEM_PATH"];
  if (certPath && keyPath) {
    return loadPem(readFileSync(keyPath, "utf8"), readFileSync(certPath, "utf8"));
  }
  return undefined;
}
