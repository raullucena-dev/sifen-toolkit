# Assumptions and verification status

This toolkit follows the SIFEN _Manual Técnico_ v150. Each rule the implementation depends
on is listed below with one of three statuses:

| Status                      | Meaning                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Confirmed in production** | Confirmed by the maintainer against a SIFEN integration running in production, whose documents are approved by the SET.                         |
| **Assumed**                 | Implemented from the manual, conservatively. Supporting evidence (XSD validation, the manual's example, tests) is given in the Evidence column. |
| **Not verified**            | Not checked against SIFEN yet. Treat it as a known risk.                                                                                        |

**XSD validation.** The CI job `xsd` downloads the official schemas at run time (they are
never committed) and validates two signed sample invoices, one per receiver type, with
`xmllint`. Both pass against `siRecepDE_v150.xsd`. Run it locally with
`pnpm xsd:download && pnpm xsd:validate [file.xml]`. The job is informational and
non-blocking because it depends on the SET website. XSD validation proves **structure**,
not the business rules SIFEN checks on reception. That is why "XSD-valid" is evidence
here, not a status.

## Check digits

| #   | Rule                                                                                                                                                        | Status       | Evidence                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| A1  | Módulo 11 for RUC and CDC: weights 2…11 from right to left, wrapping back to 2; `r = sum % 11`; DV = `11 - r` if `r > 1`, else `0`.                         | Assumed      | Reproduces the DV of the manual's example CDC (not committed because it contains a real RUC) |
| A2  | RUCs are 1–8 digits. SET's reference algorithm maps letters to character codes; RUCs containing letters are rejected here.                                  | Not verified | Letters are unsupported                                                                      |
| A3  | Digits weighted 11 (every 10th position from the right) are not protected by the DV, because 11 ≡ 0 (mod 11). This is a property of the official algorithm. | Assumed      | Asserted in `test/core.test.ts`                                                              |

## CDC

| #   | Rule                                                                                                                                                   | Status  | Evidence                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------------------------- |
| A4  | Layout: iTiDE(2) · RUC(8, zero-padded) · DV(1) · dEst(3) · dPunExp(3) · dNumDoc(7) · iTipCont(1) · YYYYMMDD(8) · iTipEmi(1) · dCodSeg(9) · DV(1) = 44. | Assumed | Matches the manual example |
| A5  | `dCodSeg` is a random 9-digit number; `000000000` is never generated.                                                                                  | Assumed | Conservative               |

## Factura Electrónica XML

| #   | Rule                                                                                                                                                                             | Status                  | Evidence                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| A6  | Root `rDE` in `http://ekuatia.set.gov.py/sifen/xsd` with `xsi:schemaLocation="… siRecepDE_v150.xsd"`; `dVerFor` = `150`; `DE/@Id` = CDC.                                         | Assumed                 | XSD-valid (CI)                                                                 |
| A7  | Only the fields needed for a basic invoice are emitted, in manual order: `dDVId, dFecFirma, dSisFact, gOpeDE, gTimb, gDatGralOpe, gDtipDE, gTotSub`.                             | Assumed                 | XSD-valid (CI)                                                                 |
| A8  | `dSisFact` = 1 (taxpayer's own system).                                                                                                                                          | Assumed                 |                                                                                |
| A9  | Fixed code→description tables (`dDes*`), including accents (`Factura electrónica`, `Venta de mercadería`, `Gravado IVA`, …) and `Guarani` without an accent.                     | Confirmed in production | Cross-checked against published reference constants in `test/catalogs.test.ts` |
| A10 | Department, district, city and economic-activity codes and descriptions are supplied by the caller (tables not bundled).                                                         | Assumed                 | Caller responsibility                                                          |
| A11 | `dTelEmi` and `dEmailE` are required for the emitter.                                                                                                                            | Assumed                 | Conservative                                                                   |
| A12 | Receiver: B2B/B2C only; receivers without RUC are B2C; country PRY; address omitted; "innominado" (`iTipIDRec=5`) requires `dNumIDRec = "0"`.                                    | Not verified            | The innominado rules in particular                                             |
| A13 | Payment: `iCondOpe = 1` (contado) with one `gPaConEIni` of `iTiPago = 1` (efectivo) for the full `dTotGralOpe`.                                                                  | Assumed                 | Scope limit                                                                    |
| A14 | Unit of measure: only `cUniMed = 77`, with `dDesUniMed = UNI`.                                                                                                                   | Confirmed in production | Covered by the catalog cross-check                                             |
| A15 | `gValorRestaItem` contains `dDescItem, dDescGloItem, dAntPreUniIt, dAntGloPreUniIt` = 0 and `dTotOpeItem`; `dPorcDesIt` is omitted (no discounts).                               | Assumed                 | XSD-valid (CI)                                                                 |
| A16 | `gCamIVA` includes `dBasExe` (v150), `0` for fully taxed and exempt items.                                                                                                       | Assumed                 | XSD-valid (CI)                                                                 |
| A17 | `gTotSub` emits every total field except `dRedon` (see A22b), including zeros. `dTotDescGlotem` keeps the manual's spelling.                                                     | Assumed                 | XSD-valid (CI)                                                                 |
| A18 | Dates are Paraguay local time without an offset. `dFecFirma` defaults to now in `America/Asuncion`. Only "emission date ≥ timbrado start" is checked, not the timbrado's expiry. | Assumed                 | Conservative                                                                   |
| A19 | Text length limits follow the manual where known; some are approximations. Control characters are always rejected.                                                               | Not verified            |                                                                                |

## Amounts and rounding (PYG)

| #    | Rule                                                                                                                                                                            | Status                  | Evidence                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------- |
| A20  | Unit prices are whole guaraníes. Quantities may have up to 4 decimals, but each line total must be a whole number of guaraníes.                                                 | Assumed                 | Stricter than necessary, on purpose |
| A21  | Item IVA with `dPropIVA = 100`: `dBasGravIVA = 100·dTotOpeItem·dPropIVA / (10000 + dTasaIVA·dPropIVA)`, `dLiqIVAItem = dBasGravIVA·dTasaIVA/100`, kept at 8 decimals (half-up). | Assumed                 | Formulas from the manual            |
| A22  | `gTotSub` amounts are sums of item values rounded half-up to whole guaraníes. `dLiqTotIVA5` and `dLiqTotIVA10` are `0`.                                                         | Assumed                 | `test/totals.test.ts`               |
| A22b | **`dRedon` is not emitted.** Totals are computed without any rounding-adjustment field.                                                                                         | Confirmed in production | Asserted in `test/builder.test.ts`  |
| A23  | Arithmetic uses a bigint fixed-point decimal (8 decimals), never binary floating point.                                                                                         | Assumed                 | Design decision, not a SIFEN rule   |

## Signature

| #    | Rule                                                                                                                                                         | Status                  | Evidence                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------ |
| A24  | Enveloped XMLDSig over `DE` (`Reference URI="#<CDC>"`) with transforms **enveloped-signature + exclusive c14n** (`http://www.w3.org/2001/10/xml-exc-c14n#`). | Confirmed in production | Asserted in `test/signing.test.ts`   |
| A24b | RSA-SHA256 signature, SHA-256 digest, `KeyInfo/X509Data/X509Certificate`; `Signature` follows `DE` inside `rDE` in the default xmldsig namespace.            | Assumed                 | Verified with `node:crypto` in tests |
| A25  | `SignedInfo/CanonicalizationMethod` is **exclusive c14n**. This is the default; it remains configurable (`signedInfoCanonicalization`) for other setups.     | Confirmed in production | Asserted in `test/signing.test.ts`   |

## QR (dCarQR)

| #    | Rule                                                                                                                                           | Status                  | Evidence                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------- |
| A26  | Parameter order: `nVersion, Id, dFeEmiDE, dRucRec \| dNumIDRec, dTotGralOpe, dTotIVA, cItems, DigestValue, IdCSC`, then `cHashQR`.             | Assumed                 | Fixed vector in `test/qr.test.ts`       |
| A27  | **`cHashQR = sha256(params + CSC)` in lowercase hex** (Node `digest("hex")`), where `params` is everything after `?`.                          | Confirmed in production | Lowercase asserted in `test/qr.test.ts` |
| A27b | `dFeEmiDE` and `DigestValue` are encoded as lowercase hex of their text.                                                                       | Assumed                 | Lowercase asserted in `test/qr.test.ts` |
| A28  | `dRucRec` is the receiver's RUC without its DV. Receivers without RUC use `dNumIDRec` (`0` for innominado).                                    | Not verified            | The innominado case                     |
| A29  | Base URLs `https://ekuatia.set.gov.py/consultas-test/qr?` (test) and `…/consultas/qr?` (production); `gCamFuFD` is appended after `Signature`. | Assumed                 | XSD-valid (CI)                          |

## SOAP

| #   | Rule                                                                                                                                                            | Status       | Evidence                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------- |
| A30 | SOAP 1.2 (`application/soap+xml; charset=utf-8`) over mutual TLS with the signing certificate.                                                                  | Assumed      | mTLS proven against a local server  |
| A31 | Test endpoints `https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl`, `…/de/ws/consultas/consulta.wsdl`, `…/de/ws/consultas/consulta-ruc.wsdl` (configurable). | Not verified | Integration test skipped by default |
| A32 | Requests `rEnviDe{dId, xDE{rDE}}`, `rEnviConsDeRequest{dId, dCDC}`, `rEnviConsRUC{dId, dRUCCons}` (RUC without DV); `dId` unique, up to 15 digits.              | Not verified | Mocked tests only                   |
| A33 | Responses parsed by local name (`rProtDe`, `gResProc`, `xContenDE`, `xContRUC`, …). A status starting with "Aprobado" counts as approved.                       | Not verified | Mocked tests only                   |
