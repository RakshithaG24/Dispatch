/**
 * Business identity used on the legal pages and footer.
 * Values come from frontend/.env so nothing is hardcoded in source.
 */
export const site = {
  product: "Dispatch",
  company: import.meta.env.VITE_COMPANY_NAME ?? "Your Company Legal Name",
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL ?? "privacy@yourdomain.com",
  address: import.meta.env.VITE_COMPANY_ADDRESS ?? "",
  legalUpdated: "October 18, 2026",
} as const;
