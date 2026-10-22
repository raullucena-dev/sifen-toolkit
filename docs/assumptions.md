# Assumptions and open questions

This toolkit follows the SIFEN _Manual Técnico_ v150. Where I could not confirm a rule
with certainty, the implementation takes the **conservative** option: it rejects input
rather than guessing, or emits the most explicit form. Each such point is listed here
with a `TODO` to confirm against the official XSDs and the SIFEN test environment.

Run `pnpm xsd:download && pnpm xsd:validate` to check the generated XML against the
official schemas on your machine. The CI job `xsd` does the same, but it is
informational and non-blocking because it depends on the SET website. The XSDs could
not be downloaded from the environment this project was developed in, so **the output
has not yet been validated against them here**.

## Check digits

| #   | Assumption                                                                                                                                                                                                 | Status                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Módulo 11 for both RUC and CDC: weights 2…11 from right to left, wrapping back to 2; `r = sum % 11`; DV = `11 - r` if `r > 1`, else `0`.                                                                   | Cross-checked against the example CDC printed in the manual (its DV reproduces). That example is not committed because it contains a real RUC. |
| A2  | RUCs are 1–8 **digits**. SET's reference algorithm maps non-digit characters to their character codes, but RUCs containing letters are rejected here.                                                      | TODO: support letters if needed.                                                                                                               |
| A3  | Positions weighted 11 (every 10th digit from the right) are **not protected** by the DV, because 11 ≡ 0 (mod 11). This is a property of the official algorithm, not a bug; `test/core.test.ts` asserts it. | Confirmed by test                                                                                                                              |

## CDC

| #   | Assumption                                                                                                                                                  | Status                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| A4  | Layout: iTiDE(2) · RUC(8, zero-padded) · DV(1) · dEst(3) · dPunExp(3) · dNumDoc(7) · iTipCont(1) · date YYYYMMDD(8) · iTipEmi(1) · dCodSeg(9) · DV(1) = 44. | Matches the manual example |
| A5  | `dCodSeg` is a random 9-digit number. `000000000` is never generated.                                                                                       | Conservative               |

## Factura Electrónica XML

| #   | Assumption                                                                                                                                                                                                                              | Status                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A6  | Root `rDE` in namespace `http://ekuatia.set.gov.py/sifen/xsd` with `xsi:schemaLocation="… siRecepDE_v150.xsd"`; `dVerFor` = `150`; `DE/@Id` = CDC.                                                                                      | TODO: XSD                          |
| A7  | Only the fields needed for a basic invoice are emitted, in manual order: `dDVId, dFecFirma, dSisFact, gOpeDE, gTimb, gDatGralOpe, gDtipDE, gTotSub`.                                                                                    | TODO: XSD                          |
| A8  | `dSisFact` = 1 (taxpayer's own system).                                                                                                                                                                                                 |                                    |
| A9  | Fixed descriptions (`dDes*`) are taken from the manual tables, including accents (e.g. `Factura electrónica`, `Venta de mercadería`) and `Guarani` without an accent. SIFEN validates descriptions against codes.                       | TODO: confirm exact strings        |
| A10 | Department, district, city and economic-activity **codes and descriptions are supplied by the caller**. The official tables are long and change over time, so they are not bundled.                                                     | Caller responsibility              |
| A11 | `dTelEmi` and `dEmailE` are required for the emitter.                                                                                                                                                                                   | Conservative                       |
| A12 | Receiver: only B2B (`iTiOpe=1`) and B2C (`iTiOpe=2`) are supported. Receivers without RUC are always B2C. Country is always PRY. The receiver's address is omitted (optional). "Innominado" (`iTipIDRec=5`) requires `dNumIDRec = "0"`. | TODO: confirm the innominado rules |
| A13 | Payment: `iCondOpe = 1` (contado) with a single `gPaConEIni` of `iTiPago = 1` (efectivo) for the full `dTotGralOpe`. Credit, cards and cheques need extra groups and are not supported.                                                 | Scope                              |
| A14 | Unit of measure: only `cUniMed = 77` (`UNI`).                                                                                                                                                                                           | TODO: add the table                |
| A15 | `gValorRestaItem` always contains `dDescItem, dDescGloItem, dAntPreUniIt, dAntGloPreUniIt` = 0 and `dTotOpeItem`. `dPorcDesIt` is omitted because discounts are not supported.                                                          | TODO: XSD                          |
| A16 | `gCamIVA` includes `dBasExe` (introduced in v150 for partially exempt items). It is `0` for both fully taxed and exempt items.                                                                                                          | TODO: XSD                          |
| A17 | All `gTotSub` fields are emitted, including zeros. `dTotDescGlotem` keeps the manual's spelling.                                                                                                                                        | TODO: XSD                          |
| A18 | Dates are Paraguay local time without an offset (`YYYY-MM-DDThh:mm:ss`). `dFecFirma` defaults to the current time in `America/Asuncion`. Only "emission date ≥ timbrado start" is checked; the timbrado's expiry is not.                | Conservative                       |
| A19 | Text limits follow the manual where known (e.g. names 4–255). Some limits are approximations. Control characters are always rejected.                                                                                                   | TODO                               |

## Amounts and rounding (PYG)

| #   | Assumption                                                                                                                                                                                                                                            | Status                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A20 | Unit prices are whole guaraníes. Quantities may have up to 4 decimals, but **each line total must be a whole number of guaraníes**; otherwise input is rejected.                                                                                      | Conservative, stricter than necessary                                                           |
| A21 | Item IVA uses the manual's formulas with `dPropIVA = 100`: `dBasGravIVA = 100·dTotOpeItem·dPropIVA / (10000 + dTasaIVA·dPropIVA)` and `dLiqIVAItem = dBasGravIVA·dTasaIVA/100`, kept at **8 decimals** (half-up), so they match the formulas exactly. | TODO: confirm SIFEN's tolerance                                                                 |
| A22 | `gTotSub` amounts in PYG are sums of item values **rounded half-up to whole guaraníes**. `dRedon`, `dLiqTotIVA5` and `dLiqTotIVA10` are `0`.                                                                                                          | TODO: confirm whether SIFEN expects the rounding to be booked in `dRedon`/`dLiqTotIVA*` instead |
| A23 | Arithmetic uses a bigint fixed-point decimal (8 decimals), never binary floating point.                                                                                                                                                               | Design decision                                                                                 |

## Signature

| #   | Assumption                                                                                                                                                                                                                                                         | Status                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| A24 | Enveloped XMLDSig over `DE` (Reference `URI="#<CDC>"`): RSA-SHA256, SHA-256 digest, transforms enveloped-signature + exclusive c14n. The `Signature` element follows `DE` inside `rDE`, in the default xmldsig namespace, with `KeyInfo/X509Data/X509Certificate`. | TODO: confirm with SIFEN test         |
| A25 | `SignedInfo` uses **exclusive c14n** by default. Some published SIFEN samples appear to use inclusive c14n (`REC-xml-c14n-20010315`) for `CanonicalizationMethod`, so this is configurable (`signedInfoCanonicalization`).                                         | TODO: confirm which one SIFEN expects |

## QR (dCarQR)

| #   | Assumption                                                                                                                                                                  | Status                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| A26 | Parameter order: `nVersion, Id, dFeEmiDE, dRucRec \| dNumIDRec, dTotGralOpe, dTotIVA, cItems, DigestValue, IdCSC`, then `cHashQR`.                                          | TODO: confirm             |
| A27 | `dFeEmiDE` and `DigestValue` are the **lowercase hex** of their text. `cHashQR = sha256_hex(params + CSC)`, lowercase, where `params` is everything after `?`.              | TODO: confirm letter case |
| A28 | `dRucRec` is the receiver's RUC without its DV. Receivers without RUC use `dNumIDRec` (`0` for innominado).                                                                 | TODO                      |
| A29 | Base URLs: `https://ekuatia.set.gov.py/consultas-test/qr?` (test) and `…/consultas/qr?` (production). `gCamFuFD` is appended after `Signature`, outside the signed content. |                           |

## SOAP

| #   | Assumption                                                                                                                                                                                                                                                                                                             | Status                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| A30 | SOAP 1.2 (`application/soap+xml; charset=utf-8`) over mutual TLS, using the same certificate as for signing.                                                                                                                                                                                                           |                                   |
| A31 | Test endpoints: `https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl`, `…/de/ws/consultas/consulta.wsdl` and `…/de/ws/consultas/consulta-ruc.wsdl`. They are configurable.                                                                                                                                            | TODO: confirm                     |
| A32 | Requests: `rEnviDe{dId, xDE{rDE}}` (rDE embedded as XML, not escaped), `rEnviConsDeRequest{dId, dCDC}`, `rEnviConsRUC{dId, dRUCCons}` with the RUC without its DV. `dId` is a unique number of up to 15 digits.                                                                                                        | TODO: confirm                     |
| A33 | Responses are parsed by **local name**, without relying on namespace prefixes: `rProtDe/{Id, dFecProc, dEstRes, dProtAut, gResProc{dCodRes, dMsgRes}}`, `dCodRes/dMsgRes/xContenDE` and `xContRUC/{dRUCCons, dRazCons, dCodEstCons, dDesEstCons, dRUCFactElec}`. A status starting with "Aprobado" counts as approved. | TODO: confirm with real responses |
