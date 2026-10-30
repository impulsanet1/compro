/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolves the public, customer-facing tracking URL.
 * Automatically converts internal Google AI Studio development container URLs (ais-dev-...)
 * to the publicly accessible, standalone Cloud Run URL (ais-pre-...) so customers never see
 * Google Studio or developer interfaces.
 */
export function getCustomerTrackingUrl(receiptId: string, customBaseUrl?: string): string {
  const cleanId = (receiptId || "").trim();
  if (!cleanId) return "/";

  // 1. If the business has configured a custom public domain or base URL
  if (customBaseUrl && customBaseUrl.trim()) {
    const cleanBase = customBaseUrl.trim().replace(/\/+$/, "");
    return `${cleanBase}/?rastreo=${encodeURIComponent(cleanId)}`;
  }

  // 2. Resolve browser origin
  if (typeof window !== "undefined") {
    let origin = window.location.origin;

    // In AI Studio environment:
    // 'ais-dev-' is the private development instance that can prompt for Google Studio login.
    // 'ais-pre-' is the public standalone deployment URL accessible by anyone without authentication.
    if (origin.includes("ais-dev-")) {
      origin = origin.replace("ais-dev-", "ais-pre-");
    }

    return `${origin}/?rastreo=${encodeURIComponent(cleanId)}`;
  }

  return `/?rastreo=${encodeURIComponent(cleanId)}`;
}
