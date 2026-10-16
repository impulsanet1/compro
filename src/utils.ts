/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Universal clipboard copy helper with fallback for sandboxed iframes.
 */
export async function safeCopyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard
  try {
    if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("navigator.clipboard.writeText failed or was blocked by iframe permissions, trying fallback:", err);
  }

  // 2. Fallback using temporary hidden textarea and execCommand
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    textArea.style.opacity = "0";
    textArea.setAttribute("readonly", "");
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (fallbackErr) {
    console.error("safeCopyToClipboard fallback failed:", fallbackErr);
    return false;
  }
}
