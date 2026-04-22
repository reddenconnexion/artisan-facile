/**
 * Factur-X XML Generator — Profil EN 16931 (Confort)
 *
 * Norme : CEN EN 16931 / Factur-X v1.08
 * Guideline : urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931
 *
 * Changements par rapport à l'ancienne version :
 *  - Utilisation de quote_number comme identifiant de facture (plus l'UUID)
 *  - Profil passé de "minimum" à "EN 16931 (Confort)"
 *  - Ajout de la ventilation TVA par taux (ram:ApplicableTradeTax)
 *  - Ajout des lignes de détail (ram:IncludedSupplyChainTradeLineItem)
 *  - Ajout de la date d'échéance de paiement
 *  - Gestion de la franchise de TVA (art. 293B du CGI)
 *  - Support des taux 0%, 5.5%, 10%, 20%
 */

const escapeXml = (unsafe) => {
  if (unsafe == null) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

const formatDate = (dateStr) => {
  if (!dateStr) return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  try {
    return new Date(dateStr).toISOString().slice(0, 10).replace(/-/g, '');
  } catch {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }
};

const formatAmount = (amt) => (Number(amt) || 0).toFixed(2);

/**
 * Détermine le taux de TVA effectif d'une ligne.
 * Si l'app gagne un champ tva_rate par ligne dans le futur, il sera prioritaire.
 * Sinon on se base sur include_tva global.
 */
const getItemVatRate = (item, includeTva) => {
  if (item.tva_rate != null) return Number(item.tva_rate);
  return includeTva ? 20 : 0;
};

/**
 * Catégorie TVA EN 16931 selon le taux :
 *   S  = Standard rate
 *   AA = Lower rate (taux réduit)
 *   Z  = Zero rated
 *   E  = Exempt (franchise de base)
 */
const vatCategoryCode = (rate, includeTva) => {
  if (!includeTva) return 'E'; // franchise de TVA
  if (rate === 0) return 'Z';
  if (rate === 20) return 'S';
  return 'AA'; // 5.5%, 10%
};

/**
 * Motif d'exonération pour la franchise de TVA (art. 293B du CGI).
 * Utilisé uniquement quand include_tva === false.
 */
const vatExemptionReason = (includeTva) => {
  if (!includeTva) {
    return `<ram:ExemptionReason>TVA non applicable, art. 293 B du CGI</ram:ExemptionReason>`;
  }
  return '';
};

/**
 * Génère les blocs ram:ApplicableTradeTax (un par taux TVA distinct).
 */
const buildTaxBreakdown = (items, includeTva, totalHT, totalTVA) => {
  // Regrouper les lignes par taux TVA
  const groups = {};
  (items || []).forEach((item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    const lineHT = qty * price;
    const rate = getItemVatRate(item, includeTva);
    if (!groups[rate]) groups[rate] = { baseHT: 0, tva: 0 };
    groups[rate].baseHT += lineHT;
    groups[rate].tva += includeTva ? lineHT * (rate / 100) : 0;
  });

  // Si aucune ligne (ex: mode manuel), créer un groupe synthétique
  if (Object.keys(groups).length === 0) {
    const rate = includeTva ? 20 : 0;
    groups[rate] = { baseHT: totalHT, tva: totalTVA };
  }

  return Object.entries(groups)
    .map(([rate, { baseHT, tva }]) => {
      const r = Number(rate);
      const catCode = vatCategoryCode(r, includeTva);
      return `
    <ram:ApplicableTradeTax>
      <ram:CalculatedAmount>${formatAmount(tva)}</ram:CalculatedAmount>
      <ram:TypeCode>VAT</ram:TypeCode>
      ${vatExemptionReason(includeTva)}
      <ram:BasisAmount>${formatAmount(baseHT)}</ram:BasisAmount>
      <ram:CategoryCode>${catCode}</ram:CategoryCode>
      <ram:RateApplicablePercent>${r.toFixed(2)}</ram:RateApplicablePercent>
    </ram:ApplicableTradeTax>`;
    })
    .join('');
};

/**
 * Génère les lignes de facturation (ram:IncludedSupplyChainTradeLineItem).
 */
const buildLineItems = (items, includeTva) => {
  if (!items || items.length === 0) return '';

  return items
    .map((item, index) => {
      const lineId = index + 1;
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.price) || 0;
      const lineHT = qty * unitPrice;
      const rate = getItemVatRate(item, includeTva);
      const catCode = vatCategoryCode(rate, includeTva);

      return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${lineId}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${escapeXml(item.description || `Ligne ${lineId}`)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${formatAmount(unitPrice)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${qty.toFixed(2)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${catCode}</ram:CategoryCode>
          <ram:RateApplicablePercent>${rate.toFixed(2)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${formatAmount(lineHT)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join('');
};

/**
 * Point d'entrée principal.
 * @param {object} devis       - Objet facture (quote) depuis Supabase
 * @param {object} client      - Objet client
 * @param {object} userProfile - Profil vendeur
 */
export const generateFacturXXML = (devis, client, userProfile) => {
  // --- Identifiant de facture : numéro séquentiel, pas l'UUID ---
  const invoiceId = escapeXml(devis.quote_number || devis.id);

  const issueDate = formatDate(devis.date);
  // Date d'échéance : valid_until ou paid_at ou 30j après émission
  const dueDate = devis.valid_until
    ? formatDate(devis.valid_until)
    : devis.paid_at
    ? formatDate(devis.paid_at)
    : formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

  const typeCode = '380'; // 380 = Commercial Invoice
  const currency = 'EUR';

  const includeTva = devis.include_tva !== false;
  const totalHT = Number(devis.total_ht) || 0;
  const totalTVA = Number(devis.total_tva) || 0;
  const totalTTC = Number(devis.total_ttc) || 0;

  const items = Array.isArray(devis.items) ? devis.items : [];

  const taxBreakdown = buildTaxBreakdown(items, includeTva, totalHT, totalTVA);
  const lineItems = buildLineItems(items, includeTva);

  // Note de franchise TVA dans le document si applicable
  const franchiseNote = !includeTva
    ? `\n    <ram:IncludedNote>\n      <ram:Content>TVA non applicable, art. 293 B du CGI</ram:Content>\n    </ram:IncludedNote>`
    : '';

  // Note option TVA sur les débits (ABL = regulatory information, UN/EDIFACT)
  const vatOnDebitsNote = (includeTva && devis.vat_on_debits)
    ? `\n    <ram:IncludedNote>\n      <ram:Content>Option pour le paiement de la TVA d'après les débits</ram:Content>\n      <ram:SubjectCode>ABL</ram:SubjectCode>\n    </ram:IncludedNote>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${invoiceId}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>${franchiseNote}${vatOnDebitsNote}
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>

    ${lineItems}

    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(userProfile.company_name || userProfile.full_name || 'Vendeur')}</ram:Name>
        ${userProfile.siret ? `<ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0009">${escapeXml(userProfile.siret)}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(userProfile.postal_code || '')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(userProfile.address || '')}</ram:LineOne>
          <ram:CityName>${escapeXml(userProfile.city || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${userProfile.tva_intracom ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(userProfile.tva_intracom)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>

      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(client.name || 'Client')}</ram:Name>
        ${client.siren ? `<ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escapeXml(client.siren)}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(client.postal_code || '')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(client.address || '')}</ram:LineOne>
          <ram:CityName>${escapeXml(client.city || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${client.tva_intracom ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escapeXml(client.tva_intracom)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    ${devis.intervention_address
      ? `<ram:ApplicableHeaderTradeDelivery>
      <ram:ShipToTradeParty>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escapeXml(devis.intervention_postal_code || '')}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(devis.intervention_address)}</ram:LineOne>
          <ram:CityName>${escapeXml(devis.intervention_city || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:ShipToTradeParty>
    </ram:ApplicableHeaderTradeDelivery>`
      : `<ram:ApplicableHeaderTradeDelivery />`}

    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
      ${taxBreakdown}
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDate}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${formatAmount(totalHT)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${formatAmount(totalHT)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${formatAmount(totalTVA)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${formatAmount(totalTTC)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${formatAmount(totalTTC)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

  </rsm:SupplyChainTradeTransaction>

</rsm:CrossIndustryInvoice>`;
};
