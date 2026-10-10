/** Site name. Appended to every page title and used as `og:site_name`. */
export const SITE_NAME = "Clift’s Home & Air Services LLC";
/** Fallback meta description for pages that don't set their own. */
export const SITE_DESCRIPTION =
  "Residential HVAC repair, preventive maintenance and honest system guidance in LaPlace, Louisiana. Call (985) 210-1659.";
/** Canonical origin. Resolves canonical URLs, social images, and the sitemap. */
export const SITE_URL =
  import.meta.env.PUBLIC_SITE_URL || "http://localhost:4321";
/** BCP 47 locale tag used to format dates and numbers. */
export const SITE_LOCALE = "en-US";
/** Routes excluded from search and the sitemap. Surrounding slashes are ignored. */
export const NOINDEX_ROUTES: string[] = ["/404", "/example-components"];
