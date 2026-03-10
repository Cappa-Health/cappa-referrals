/**
 * landing-config.js
 * Centralized configuration for the Cappa Health landing page.
 * Edit the values below to customise the page for a specific deployment.
 */
const LANDING_CONFIG = {
  /**
   * stateSymbol — Two-letter US state abbreviation (e.g. "CA", "TX", "NY").
   * Used in the page title, footer licensing notice, and contact section.
   */
  stateSymbol: "CA",

  /** Full state name displayed alongside the symbol where needed. */
  stateName: "California",

  /** Organisation display name. */
  orgName: "Cappa Health",

  /** Contact e-mail address. */
  contactEmail: "info@cappahealth.com",

  /** Contact phone number (display format). */
  contactPhone: "1-800-555-0100",

  /** Contact phone number (href tel: format, digits only). */
  contactPhoneHref: "+18005550100",
};
