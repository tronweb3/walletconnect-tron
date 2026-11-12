import { describe, expect, it } from 'vitest';
import { normalizeChainId } from '../src/chainId.js';
import { WalletConnectChainID } from '../src/utils.js';

describe('normalizeChainId', () => {
  it.each([
    [WalletConnectChainID.Mainnet, 'tron:0x2b6653dc'],
    [WalletConnectChainID.Shasta, 'tron:0x94a9059e'],
    [WalletConnectChainID.Nile, 'tron:0xcd8690dc']
  ])('keeps the enum value %s', (input, expected) => {
    expect(normalizeChainId(input)).toBe(expected);
  });

  it.each([
    [728126428, 'tron:0x2b6653dc'],
    [2494104990, 'tron:0x94a9059e'],
    [3448148188, 'tron:0xcd8690dc']
  ])('converts the number %s', (input, expected) => {
    expect(normalizeChainId(input)).toBe(expected);
  });

  it.each([
    ['728126428', 'tron:0x2b6653dc'],
    ['tron:728126428', 'tron:0x2b6653dc'],
    ['3448148188', 'tron:0xcd8690dc'],
    ['tron:3448148188', 'tron:0xcd8690dc']
  ])('converts the decimal string %s', (input, expected) => {
    expect(normalizeChainId(input)).toBe(expected);
  });

  it.each([
    ['0x2b6653dc', 'tron:0x2b6653dc'],
    ['0X2B6653DC', 'tron:0x2b6653dc'],
    ['tron:0x2B6653DC', 'tron:0x2b6653dc'],
    ['tron:0x02b6653dc', 'tron:0x2b6653dc'],
    [' tron:0xcd8690dc ', 'tron:0xcd8690dc']
  ])('normalizes the hex string %s', (input, expected) => {
    expect(normalizeChainId(input)).toBe(expected);
  });

  it('returns other tron: values unchanged', () => {
    expect(normalizeChainId('tron:abc')).toBe('tron:abc');
  });

  it.each(['Mainnet', '', '0x', 'eip155:1'])('throws for the string %j', input => {
    expect(() => normalizeChainId(input)).toThrow('Invalid network');
  });

  it.each([-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])('throws for the number %s', input => {
    expect(() => normalizeChainId(input)).toThrow('Invalid network');
  });
});
