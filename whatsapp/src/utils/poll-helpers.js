/**
 * Poll validation and preset option generators.
 * Extracted from Whatsapp/src/ReliableWhatsAppListener.js
 */

export const POLL_PRESETS = {
  "yes-no": ["Yes", "No"],
  rating: [
    "⭐ (1)",
    "⭐⭐ (2)",
    "⭐⭐⭐ (3)",
    "⭐⭐⭐⭐ (4)",
    "⭐⭐⭐⭐⭐ (5)",
  ],
  agreement: ["👍 Agree", "👎 Disagree", "🤷 Neutral"],
};

/**
 * Validate poll data before sending.
 * @param {string} question
 * @param {string[]} options
 * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}
 */
export function validatePollData(question, options) {
  const errors = [];
  const warnings = [];

  if (!question || typeof question !== "string") {
    errors.push("Question must be a non-empty string");
  } else if (question.trim().length === 0) {
    errors.push("Question cannot be empty");
  } else if (question.length > 255) {
    warnings.push("Question is very long and may be truncated");
  }

  if (!Array.isArray(options)) {
    errors.push("Options must be an array");
  } else {
    if (options.length < 2) {
      errors.push("Poll must have at least 2 options");
    } else if (options.length > 12) {
      errors.push("Poll cannot have more than 12 options");
    }

    options.forEach((option, index) => {
      if (typeof option !== "string") {
        errors.push(`Option ${index + 1} must be a string`);
      } else if (option.trim().length === 0) {
        errors.push(`Option ${index + 1} cannot be empty`);
      } else if (option.length > 100) {
        warnings.push(`Option ${index + 1} is very long and may be truncated`);
      }
    });

    const unique = new Set(options.map((o) => o.trim().toLowerCase()));
    if (unique.size < options.length) {
      warnings.push("Some options appear to be duplicates");
    }
  }

  return { isValid: errors.length === 0, errors, warnings };
}
