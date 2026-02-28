/**
 * Template helper functions for DTU twin UIs.
 * Passed as template data to Eta templates by twin UI routes.
 */

/**
 * Format a Unix timestamp (seconds) to a human-readable date string.
 * Returns empty string for falsy values.
 */
export function formatDate(unixTimestamp: number | null | undefined): string {
  if (!unixTimestamp) return '';
  // StateManager stores timestamps as seconds (unixepoch())
  const date = new Date(unixTimestamp * 1000);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Format an object as indented JSON string, HTML-escaped for safe rendering.
 */
export function formatJson(obj: any): string {
  return JSON.stringify(obj, null, 2);
}

/**
 * Truncate a string to maxLen characters, appending ellipsis if truncated.
 */
export function truncate(str: string | null | undefined, maxLen: number = 50): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

/**
 * Escape HTML special characters for safe rendering in templates.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
