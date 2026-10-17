/**
 * HTML Escape to prevent XSS attacks when serving or logging user content
 */
const escapeHtml = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Standard API JSON response structure
 */
const apiResponse = (res, statusCode, success, message, data = null) => {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString()
  };
  if (data !== null) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
};

module.exports = {
  escapeHtml,
  apiResponse
};
