/** v1: retain distinct meanings pending HQ review. Never silently translate legacy values. */
export const SECTOR_CATALOGUE = [
  'Agriculture & Agribusiness', 'Automotive', 'Aviation & Aerospace', 'Chemicals',
  'Construction & Engineering', 'Education & Research', 'Energy & Utilities',
  'Facility Management / Maintenance Services', 'Financial Services', 'Fishing & Aquaculture',
  'Food & Beverage', 'Healthcare & Pharma', 'Hospitality & Leisure', 'Infrastructure & Real Estate',
  'Manufacturing', 'Maritime & Ports', 'Metalworking', 'Mining & Materials', 'Oil & Gas',
  'Optical & Medical Devices', 'Other', 'Other Services', 'Packaging & Paper',
  'Plastics, Paper & Packaging', 'Public Administration', 'Retail & Distribution',
  'Security Services', 'Sport & Recreation', 'Telecommunications & ICT', 'Textile',
  'Transport & Logistics', 'Waste Management & Recycling', 'Water & Waste Treatment',
] as const;
export const LEGACY_SECTORS = ['Energy','Fleet','Food & Beverages','Infrastructures','Maintenance Providers','Metal Manufacturing','Optical','Public Institutions','Textiles'] as const;
export function isKnownSector(value: string | null | undefined): boolean {
  return !value || [...SECTOR_CATALOGUE, ...LEGACY_SECTORS].some(sector=>sector===value.trim());
}
export const SECTOR_REVIEW_PROPOSALS = [
  { from:'Food & Beverages', to:'Food & Beverage', reason:'Wording-only plural variation; validate mapping before migration.' },
  { from:'Textiles', to:'Textile', reason:'Wording-only plural variation; validate mapping before migration.' },
  { from:'Packaging & Paper', to:'Keep separate for now', reason:'Does not explicitly include plastics; review alongside Plastics, Paper & Packaging customer by customer.' },
  { from:'Other', to:'Review individual customers', reason:'An unknown classification is not automatically Other Services.' },
  { from:'Other Services', to:'Review individual customers', reason:'Confirm the actual activity before merging with Other.' },
] as const;
