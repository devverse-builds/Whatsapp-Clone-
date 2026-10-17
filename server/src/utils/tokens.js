const jwt = require('jsonwebtoken');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'wac_access_secret_super_secure_random_key_2026_9876543210';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'wac_refresh_secret_super_secure_random_key_2026_1234567890';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

const generateAccessToken = (payload) => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, REFRESH_SECRET);
};

const getCookieOptions = (isRefreshToken = false) => {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = isRefreshToken
    ? 7 * 24 * 60 * 60 * 1000 // 7 days
    : 15 * 60 * 1000; // 15 mins

  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' || isProd,
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    maxAge,
    path: '/'
  };
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, getCookieOptions(false));
  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, getCookieOptions(true));
  }
};

const clearAuthCookies = (res) => {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getCookieOptions,
  setAuthCookies,
  clearAuthCookies
};
