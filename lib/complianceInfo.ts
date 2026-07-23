/**
 * Regulatory disclosure fields (SEBI/exchange registration numbers, office
 * address, compliance officer contact) shared by every client-facing report
 * export (MTF PDF, EOD Excel export, ...). Read from the environment rather
 * than hardcoded, so the real values live only in the gitignored .env.local
 * on the machine that actually generates client-facing reports -- the
 * source checked into version control ships safe placeholder defaults only.
 */
export const SEBI_REG_NUMBER = process.env.MTF_SEBI_REG_NUMBER ?? "INH000000000";
export const BSE_REG_NUMBER = process.env.MTF_BSE_REG_NUMBER ?? "INZ000000000";
export const NSE_REG_NUMBER = process.env.MTF_NSE_REG_NUMBER ?? "INZ000000000";
export const MSEI_REG_NUMBER = process.env.MTF_MSEI_REG_NUMBER ?? "INZ000000000";
export const COMPLIANCE_ADDRESS = process.env.MTF_COMPLIANCE_ADDRESS ?? "Registered office address (configure via MTF_COMPLIANCE_ADDRESS)";
export const COMPLIANCE_OFFICER_NAME = process.env.MTF_COMPLIANCE_OFFICER_NAME ?? "Compliance Officer Name";
export const COMPLIANCE_OFFICER_PHONE = process.env.MTF_COMPLIANCE_OFFICER_PHONE ?? "+91-00000-00000";
