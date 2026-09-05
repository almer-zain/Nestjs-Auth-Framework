import { TransformFnParams } from 'class-transformer';
import sanitizeHtml, { IOptions } from 'sanitize-html';

/**
 * Strips all HTML tags from an input string and trims trailing whitespace.
 *
 * @param value - Unknown input value to sanitize
 * @returns Sanitized string stripped of HTML tags, or empty string if input is invalid
 * @example
 * stripHtml('<script>alert("xss")</script>Hello') // Returns 'Hello'
 */
export function stripHtml(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  // Explicitly type options to prevent allowedTags from inferring as never[]
  const options: IOptions = {
    allowedTags: [] as string[],
    allowedAttributes: {},
  };

  const clean: string = sanitizeHtml(value, options);

  return clean.trim();
}

/**
 * Normalizes an email address by trimming whitespace and converting characters to lowercase.
 *
 * @param value - Unknown input value to normalize
 * @returns Normalized email string, or empty string if input is invalid
 * @example
 * normalizeEmail(' USER@Example.COM ') // Returns 'user@example.com'
 */
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

// =========================================================================
// CLASS-TRANSFORMER WRAPPERS
// These map cleanly inside @Transform(() => ...) to keep your DTOs readable.
// =========================================================================

/**
 * Class-transformer pipeline wrapper for stripping HTML tags from string values.
 *
 * @param params - Transformation parameters provided by class-transformer
 * @returns Sanitized string or unchanged non-string input
 */
export function transformSanitizeHtml({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return stripHtml(value);
}

/**
 * Class-transformer pipeline wrapper for stripping HTML tags, trimming, and lowercasing string values.
 *
 * @param params - Transformation parameters provided by class-transformer
 * @returns Sanitized, lowercased string or unchanged non-string input
 */
export function transformSanitizeHtmlClean({
  value,
}: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return stripHtml(value.trim().toLowerCase());
}

/**
 * Class-transformer pipeline wrapper for trimming whitespace from string values.
 *
 * @param params - Transformation parameters provided by class-transformer
 * @returns Trimmed string or unchanged non-string input
 */
export function transformTrim({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim();
}

/**
 * Class-transformer pipeline wrapper for trimming whitespace and converting string values to lowercase.
 *
 * @param params - Transformation parameters provided by class-transformer
 * @returns Trimmed and lowercased string or unchanged non-string input
 */
export function transformTrimAndLowercase({
  value,
}: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim().toLowerCase();
}

/**
 * Class-transformer pipeline wrapper for normalizing email input strings.
 *
 * @param params - Transformation parameters provided by class-transformer
 * @returns Normalized email string or unchanged non-string input
 */
export function transformEmail({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return normalizeEmail(value);
}
