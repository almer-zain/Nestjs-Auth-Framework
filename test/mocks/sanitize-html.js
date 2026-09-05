function sanitizeHtml(dirty) {
  if (typeof dirty !== 'string') return '';
  return dirty.replace(/<[^>]*>?/gm, '').trim();
}

module.exports = sanitizeHtml;
module.exports.default = sanitizeHtml;
