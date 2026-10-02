const test = require('node:test');
const assert = require('node:assert/strict');
const requireAuth = require('../server/middleware/require-auth');

test('requireAuth returns a 503 configuration error when JWT_SECRET is missing or too short', () => {
  const previousSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  try {
    const req = {
      headers: {
        authorization: 'Bearer test-token'
      }
    };

    let statusCode;
    let responseBody;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseBody = data;
        return this;
      }
    };

    requireAuth(req, res, () => {
      throw new Error('next should not be called when JWT_SECRET is not configured');
    });

    assert.equal(statusCode, 503);
    assert.match(responseBody.error, /JWT_SECRET/i);
  } finally {
    if (previousSecret !== undefined) {
      process.env.JWT_SECRET = previousSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  }
});
