export const generateFacturXXML = (devis, client, userProfile) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return new Date().toISOString().replace(/[-:]/g, '').substring(0, 8); // YYYYMMDD
    try {
      return new Date(dateStr).toISOString().replace(/[-:]/g, '').substring(0, 8);
    } catch (e) {
      return new Date().toISOString().replace(/[-:]/g, '').substring(0, 8);
    }
  };

  const invoiceId = devis.id;
  const issueDate = formatDate(devis.date);
  const typeCode = "380"; // 380 = Commercial Invoice
  const currency = "EUR";

  // Taxes
  const totalHT = devis.total_ht || 0;
  const totalTVA = devis.total_tva || 0;
  const totalTTC = devis.total_ttc || 0;

  // Amounts must had 2 decimals
  const formatAmount = (amt) => (amt || 0).toFixed(2);

  const guidFn = () => 'urn:factur-x.eu:1p0:minimum';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${guidFn()}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${invoiceId}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${issueDate}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escapeXml(userProfile.company_name || userProfile.full_name || 'Vendeur')}</ram:Name>
        ${userProfile.siret ? `
        <ram:SpecifiedLegalOrganization>
           <ram:ID schemeID="0009">${userProfile.siret}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${userProfile.postal_code || ''}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(userProfile.address || '')}</ram:LineOne>
          <ram:CityName>${escapeXml(userProfile.city || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${userProfile.tva_intracom ? `
        <ram:SpecifiedTaxRegistration>
           <ram:ID schemeID="VA">${userProfile.tva_intracom}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escapeXml(client.name || 'Client')}</ram:Name>
        ${client.siren ? `
        <ram:SpecifiedLegalOrganization>
           <ram:ID schemeID="0002">${client.siren}</ram:ID>
        </ram:SpecifiedLegalOrganization>` : ''}
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${client.postal_code || ''}</ram:PostcodeCode>
          <ram:LineOne>${escapeXml(client.address || '')}</ram:LineOne>
          <ram:CityName>${escapeXml(client.city || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${client.tva_intracom ? `
        <ram:SpecifiedTaxRegistration>
           <ram:ID schemeID="VA">${client.tva_intracom}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>
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

const escapeXml = (unsafe) => {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
};
