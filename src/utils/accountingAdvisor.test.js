import { describe, it, expect } from 'vitest';
import { analyzeFinancials, buildAdviceFacts, CA_LIMITS } from './accountingAdvisor';

const paidInvoice = (overrides = {}) => ({
  id: Math.random(),
  status: 'paid',
  type: 'invoice',
  total_ht: 1000,
  date: '2024-06-15',
  ...overrides,
});

describe('analyzeFinancials', () => {
  it('returns empty analysis when no paid invoices', () => {
    const res = analyzeFinancials([], { artisan_status: 'micro_entreprise' });
    expect(res.hasData).toBe(false);
    expect(res.years).toEqual([]);
  });

  it('aggregates paid invoices by year and ignores unpaid', () => {
    const invoices = [
      paidInvoice({ total_ht: 1000, date: '2023-03-01' }),
      paidInvoice({ total_ht: 2000, date: '2024-03-01' }),
      paidInvoice({ total_ht: 5000, date: '2024-09-01' }),
      paidInvoice({ status: 'sent', total_ht: 9999, date: '2024-09-01' }),
    ];
    const res = analyzeFinancials(invoices, { artisan_status: 'micro_entreprise', activity_type: 'services' }, new Date('2025-01-15'));
    expect(res.years).toHaveLength(2);
    const y2024 = res.years.find((y) => y.year === 2024);
    expect(y2024.caTotal).toBe(7000);
    expect(y2024.count).toBe(2);
  });

  it('splits services vs vente from item types', () => {
    const invoices = [
      paidInvoice({
        date: '2024-05-01',
        items: [
          { type: 'service', price: 100, quantity: 2 }, // 200 services
          { type: 'material', price: 50, quantity: 3 }, // 150 vente
        ],
      }),
    ];
    const res = analyzeFinancials(invoices, { artisan_status: 'micro_entreprise', activity_type: 'mixte' }, new Date('2025-01-15'));
    const y = res.years[0];
    expect(y.caServices).toBe(200);
    expect(y.caVente).toBe(150);
    expect(y.caTotal).toBe(350);
  });

  it('estimates micro social charges with the 2026 services rate', () => {
    const invoices = [paidInvoice({ total_ht: 10000, date: '2024-05-01' })];
    const res = analyzeFinancials(invoices, { artisan_status: 'micro_entreprise', activity_type: 'services' }, new Date('2025-01-15'));
    const y = res.years[0];
    expect(y.charges).toBeCloseTo(2120, 0); // 10000 * 21.2%
    expect(y.net).toBeCloseTo(7880, 0);
  });

  it('does not compute charges for non-micro statuses', () => {
    const invoices = [paidInvoice({ total_ht: 10000, date: '2024-05-01' })];
    const res = analyzeFinancials(invoices, { artisan_status: 'sasu', activity_type: 'services' }, new Date('2025-01-15'));
    expect(res.isMicro).toBe(false);
    expect(res.years[0].charges).toBeNull();
  });

  it('projects the current year linearly from elapsed months', () => {
    const invoices = [paidInvoice({ total_ht: 3000, date: '2025-01-10' })]; // 3 months elapsed at March
    const res = analyzeFinancials(invoices, { artisan_status: 'micro_entreprise', activity_type: 'services' }, new Date('2025-03-31'));
    expect(res.projection).not.toBeNull();
    expect(res.projection.monthsElapsed).toBe(3);
    expect(res.projection.caProjected).toBeCloseTo(12000, 0); // 3000 / 3 * 12
  });

  it('flags proximity to the services CA ceiling', () => {
    const invoices = [paidInvoice({ total_ht: 70000, date: '2024-05-01' })];
    const res = analyzeFinancials(invoices, { artisan_status: 'micro_entreprise', activity_type: 'services' }, new Date('2025-06-15'));
    expect(res.thresholds.caLimit).toBe(CA_LIMITS.services);
    expect(res.thresholds.nearCaLimit).toBe(true);
  });
});

describe('buildAdviceFacts', () => {
  it('produces a human-readable summary string with the year and CA', () => {
    const invoices = [paidInvoice({ total_ht: 5000, date: '2024-05-01' })];
    const analysis = analyzeFinancials(invoices, { artisan_status: 'micro_entreprise', activity_type: 'services' }, new Date('2025-01-15'));
    const facts = buildAdviceFacts(analysis);
    expect(facts).toContain('2024');
    expect(facts).toContain('Micro-entreprise');
    expect(facts).toMatch(/CA/);
  });
});
