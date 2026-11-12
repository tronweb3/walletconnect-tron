import type { ChainID } from './utils.js';

const CHAIN_ID_PATTERN = /^(?:tron:)?(0x[0-9a-f]+|[0-9]+)$/i;

/**
 * Convert a hex or decimal chain ID, with or without the `tron:` prefix, to the lowercase
 * hex form (`tron:0x2b6653dc`) that wallets approve sessions for.
 * Other `tron:` values are returned unchanged; anything else throws.
 */
export const normalizeChainId = (network: ChainID | string | number): ChainID => {
  if (typeof network === 'number') {
    if (!Number.isSafeInteger(network) || network < 0) {
      throw new Error(`[WalletConnectWallet] Invalid network: ${network}. Expected a non-negative integer chain ID.`);
    }
    return `tron:0x${network.toString(16)}`;
  }
  const value = String(network).trim();
  const match = value.match(CHAIN_ID_PATTERN);
  if (match) {
    return `tron:0x${BigInt(match[1].toLowerCase()).toString(16)}`;
  }
  if (value.startsWith('tron:')) {
    return value as ChainID;
  }
  throw new Error(
    `[WalletConnectWallet] Invalid network: ${network}. Expected a TRON chain ID such as 'tron:0x2b6653dc', '0x2b6653dc' or '728126428'.`
  );
};
