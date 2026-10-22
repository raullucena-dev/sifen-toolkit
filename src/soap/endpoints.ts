/** SIFEN test ("homologación") web services. Production URLs are intentionally absent. */
export const SIFEN_TEST_ENDPOINTS = {
  recepcionDE: "https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl",
  consultaDE: "https://sifen-test.set.gov.py/de/ws/consultas/consulta.wsdl",
  consultaRUC: "https://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc.wsdl",
} as const;

export type SifenEndpoints = Record<keyof typeof SIFEN_TEST_ENDPOINTS, string>;

export const SIFEN_TEST_HOST = new URL(SIFEN_TEST_ENDPOINTS.recepcionDE).host;
