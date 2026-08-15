import path from 'node:path';

const production = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET || (production ? '' : 'development-only-secret-change-me');

if (production && secret.length < 32) {
  throw new Error('SESSION_SECRET must contain at least 32 characters in production');
}

export const config = {
  production,
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  sessionSecret: secret,
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
  trustProxy: Number(process.env.TRUST_PROXY || 0),
};
