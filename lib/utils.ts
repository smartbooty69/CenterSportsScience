/**
 * Format a date string to a readable format
 * @param date - Date string or Date object
 * @returns Formatted date string (e.g., "January 15, 2024")
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const utcDate = new Date(
    Date.UTC(
      dateObj.getUTCFullYear(),
      dateObj.getUTCMonth(),
      dateObj.getUTCDate()
    )
  );

  return utcDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Parse server action response to ensure proper serialization
 * @param response - Response object from server action
 * @returns Parsed response
 */
export function parseServerActionResponse<T>(response: T): T {
  return JSON.parse(JSON.stringify(response));
}

