const NS = 'xmlns="http://ekuatia.set.gov.py/sifen/xsd"';

export const soap = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">` +
  `<env:Header/><env:Body>${body}</env:Body></env:Envelope>`;

export const recepcionAprobada = (cdc: string) =>
  soap(
    `<ns2:rRetEnviDe xmlns:ns2="http://ekuatia.set.gov.py/sifen/xsd"><ns2:rProtDe>` +
      `<ns2:Id>${cdc}</ns2:Id><ns2:dFecProc>2026-10-22T10:00:10-03:00</ns2:dFecProc>` +
      `<ns2:dDigVal>abc=</ns2:dDigVal><ns2:dEstRes>Aprobado</ns2:dEstRes>` +
      `<ns2:dProtAut>1234567890</ns2:dProtAut>` +
      `<ns2:gResProc><ns2:dCodRes>0260</ns2:dCodRes><ns2:dMsgRes>Autorización del DE satisfactoria</ns2:dMsgRes></ns2:gResProc>` +
      `</ns2:rProtDe></ns2:rRetEnviDe>`,
  );

export const recepcionRechazada = (cdc: string) =>
  soap(
    `<rRetEnviDe ${NS}><rProtDe><Id>${cdc}</Id><dEstRes>Rechazado</dEstRes>` +
      `<gResProc><dCodRes>1000</dCodRes><dMsgRes>CDC no corresponde</dMsgRes></gResProc>` +
      `<gResProc><dCodRes>1001</dCodRes><dMsgRes>Otro error</dMsgRes></gResProc>` +
      `</rProtDe></rRetEnviDe>`,
  );

export const consultaDE = (cdc: string) =>
  soap(
    `<rEnviConsDeResponse ${NS}><dFecProc>2026-10-22T10:01:00-03:00</dFecProc>` +
      `<dCodRes>0422</dCodRes><dMsgRes>CDC encontrado</dMsgRes>` +
      `<xContenDE><rContDe><rDE><DE Id="${cdc}"/></rDE></rContDe></xContenDE></rEnviConsDeResponse>`,
  );

export const consultaDENoEncontrado = soap(
  `<rEnviConsDeResponse ${NS}><dCodRes>0420</dCodRes><dMsgRes>Documento No Existe</dMsgRes>` +
    `</rEnviConsDeResponse>`,
);

export const consultaRUC = soap(
  `<rResEnviConsRUC ${NS}><dCodRes>0502</dCodRes><dMsgRes>RUC encontrado</dMsgRes>` +
    `<xContRUC><dRUCCons>80000002</dRUCCons><dRazCons>CLIENTE FICTICIO S.R.L.</dRazCons>` +
    `<dCodEstCons>ACT</dCodEstCons><dDesEstCons>ACTIVO</dDesEstCons>` +
    `<dRUCFactElec>S</dRUCFactElec></xContRUC></rResEnviConsRUC>`,
);

export const soapFault = soap(
  `<env:Fault><env:Code><env:Value>env:Receiver</env:Value></env:Code>` +
    `<env:Reason><env:Text xml:lang="es">Error interno</env:Text></env:Reason></env:Fault>`,
);
