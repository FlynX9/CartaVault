// Release builds inject VITE_CARTAVAULT_VERSION. The fallback keeps local
// development aligned with the version bundled in this frontend.
const BUNDLED_RELEASE_VERSION = "1.0.0";

export const CARTAVAULT_VERSION =
  import.meta.env.VITE_CARTAVAULT_VERSION?.trim() || BUNDLED_RELEASE_VERSION;
