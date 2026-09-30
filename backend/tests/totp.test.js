'use strict';
const {
  base32Encode, base32Decode, hotp, totp, verifyTotp, generateSecret, otpauthUrl, stepAt,
} = require('../src/services/totp');

// RFC 6238 Appendix B / RFC 4226 Appendix D use the ASCII key "12345678901234567890"
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const RFC_KEY_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32 (RFC 4648)', () => {
  test('known vectors', () => {
    expect(base32Encode(Buffer.from(''))).toBe('');
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
    expect(base32Encode(Buffer.from('foo'))).toBe('MZXW6');
    expect(base32Encode(Buffer.from('foob'))).toBe('MZXW6YQ');
    expect(base32Encode(Buffer.from('fooba'))).toBe('MZXW6YTB');
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Encode(RFC_KEY)).toBe(RFC_KEY_B32);
  });

  test('decode is the inverse and tolerates padding, case and spaces', () => {
    expect(base32Decode('MZXW6YTBOI======').toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb oi').toString()).toBe('foobar');
    expect(base32Decode(RFC_KEY_B32).equals(RFC_KEY)).toBe(true);
    const rnd = require('crypto').randomBytes(37);
    expect(base32Decode(base32Encode(rnd)).equals(rnd)).toBe(true);
    expect(() => base32Decode('ABC1')).toThrow(/Invalid base32/);
  });
});

describe('HOTP (RFC 4226 Appendix D)', () => {
  test.each([
    [0, '755224'], [1, '287082'], [2, '359152'], [3, '969429'], [4, '338314'],
    [5, '254676'], [6, '287922'], [7, '162583'], [8, '399871'], [9, '520489'],
  ])('counter %i → %s', (counter, expected) => {
    expect(hotp(RFC_KEY, counter)).toBe(expected);
  });
});

describe('TOTP (RFC 6238 Appendix B, SHA1)', () => {
  test.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('T=%i → %s (8 digits) and its 6-digit suffix', (t, expected) => {
    expect(totp(RFC_KEY_B32, { timeMs: t * 1000, digits: 8 })).toBe(expected);
    expect(totp(RFC_KEY_B32, { timeMs: t * 1000 })).toBe(expected.slice(-6));
  });
});

describe('verifyTotp', () => {
  const t = 1234567890 * 1000;
  const secret = RFC_KEY_B32;

  test('accepts the current step and ±1 step, rejects ±2', () => {
    const s = stepAt(t);
    expect(verifyTotp(secret, totp(secret, { timeMs: t }), { timeMs: t })).toBe(s);
    expect(verifyTotp(secret, totp(secret, { timeMs: t - 30000 }), { timeMs: t })).toBe(s - 1);
    expect(verifyTotp(secret, totp(secret, { timeMs: t + 30000 }), { timeMs: t })).toBe(s + 1);
    expect(verifyTotp(secret, totp(secret, { timeMs: t - 60000 }), { timeMs: t })).toBeNull();
    expect(verifyTotp(secret, totp(secret, { timeMs: t + 60000 }), { timeMs: t })).toBeNull();
  });

  test('rejects malformed codes and replays at or before afterStep', () => {
    const code = totp(secret, { timeMs: t });
    expect(verifyTotp(secret, '', { timeMs: t })).toBeNull();
    expect(verifyTotp(secret, 'abcdef', { timeMs: t })).toBeNull();
    expect(verifyTotp(secret, `${code}0`, { timeMs: t })).toBeNull();
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, { timeMs: t })).toBe(stepAt(t));
    expect(verifyTotp(secret, code, { timeMs: t, afterStep: stepAt(t) })).toBeNull();
    expect(verifyTotp(secret, code, { timeMs: t, afterStep: stepAt(t) - 1 })).toBe(stepAt(t));
  });

  test('generateSecret gives 160-bit base32 secrets and otpauthUrl is well-formed', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
    const url = otpauthUrl({ secret: s, label: 'a+b@example.com' });
    const u = new URL(url);
    expect(u.protocol).toBe('otpauth:');
    expect(u.host).toBe('totp');
    expect(decodeURIComponent(u.pathname)).toBe('/ResQMe:a+b@example.com');
    expect(u.searchParams.get('secret')).toBe(s);
    expect(u.searchParams.get('issuer')).toBe('ResQMe');
    expect(u.searchParams.get('digits')).toBe('6');
    expect(u.searchParams.get('period')).toBe('30');
  });
});
