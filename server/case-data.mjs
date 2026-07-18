export const seedCase = Object.freeze({
  id: 'KIN-2024-0847',
  claimant: 'John Nowak',
  policy: 'PL-482913',
  policyType: 'Homeowner',
  lossType: 'Water damage',
  claimAmount: 18400,
  approvedAmount: 15200,
  deductible: 1000,
  adjuster: 'M. Kowalska',
  status: 'Review in progress',
});

export const letterTemplate = `
  <h1>Claim decision</h1>
  <p><strong>Claim:</strong> {{id}}</p>
  <p>{{claimant}}<br>Policy {{policy}}<br>{{email}}</p>
  <p>Dear {{claimant}},</p>
  <p>Thank you for submitting your {{lossType}} claim under your {{policyType}} policy. Pursuant to our review of the reported loss and supporting documents, we have approved \${{approvedAmount}} of your \${{claimAmount}} claim.</p>
  <p>After your \${{deductible}} deductible, we guarantee a net payment of \${{netPayment}}. This decision is final and non-negotiable based on the information currently available.</p>
  <p>If another party contributed to the damage, our subrogation team may contact you about recovery.</p>
  <p>Please contact me if you have questions about the assessment or payment.</p>
  <p>Sincerely,<br>{{adjuster}}<br>Claims Adjuster</p>
`;

function money(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function mergeLetter(caseData = seedCase) {
  const values = {
    ...caseData,
    email: 'j.nowak@example.com',
    claimAmount: money(caseData.claimAmount),
    approvedAmount: money(caseData.approvedAmount),
    deductible: money(caseData.deductible),
    netPayment: money(caseData.approvedAmount - caseData.deductible),
  };

  return letterTemplate.trim().replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
}
