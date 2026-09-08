import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

export function Sanitize() {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return sanitizeHtml(value, {
      allowedTags: [], // Allow NO tags (completely strip HTML)
      allowedAttributes: {},
    }).trim();
  });
}