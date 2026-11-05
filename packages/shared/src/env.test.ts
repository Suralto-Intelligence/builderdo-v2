import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvValidationError, envFields, loadEnv } from './env';

const schema = z.object({
  NODE_ENV: envFields.nodeEnv,
  PORT: envFields.port(4000),
  DATABASE_URL: envFields.postgresUrl,
});

describe('loadEnv', () => {
  it('applies defaults and coerces numbers', () => {
    const env = loadEnv(schema, { DATABASE_URL: 'postgres://u:p@localhost:5432/db', PORT: '5000' });
    expect(env).toEqual({ NODE_ENV: 'development', PORT: 5000, DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
  });

  it('names every bad variable without echoing secret values', () => {
    const secret = 'mysql://root:supersecret@db';
    let error: unknown;
    try {
      loadEnv(schema, { DATABASE_URL: secret, PORT: 'abc' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(EnvValidationError);
    const message = (error as Error).message;
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('PORT');
    expect(message).not.toContain('supersecret');
  });

  it('fails when a required variable is missing', () => {
    expect(() => loadEnv(schema, {})).toThrow(/DATABASE_URL/);
  });
});
