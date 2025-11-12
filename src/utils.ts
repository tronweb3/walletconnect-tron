import { CaipNetworkId } from '@reown/appkit';
import { AppKitNetwork, defineChain } from '@reown/appkit/networks';

export enum WalletConnectChainID {
  Mainnet = 'tron:0x2b6653dc',
  Shasta = 'tron:0x94a9059e',
  Nile = 'tron:0xcd8690dc'
}

export type ChainID = WalletConnectChainID | `tron:${string}`;

export const mainnet: AppKitNetwork = defineChain({
  id: '0x2b6653dc',
  caipNetworkId: 'tron:0x2b6653dc' as CaipNetworkId,
  chainNamespace: 'tron' as 'eip155',
  name: 'Tron Mainnet',
  nativeCurrency: {
    decimals: 6,
    name: 'TRX',
    symbol: 'TRX'
  },
  rpcUrls: {
    default: {
      http: ['https://api.trongrid.io/jsonrpc'],
      webSocket: ['']
    }
  },
  blockExplorers: {
    default: { name: 'Tron BlockChain Explorer', url: 'https://tronscan.org/' }
  },
  contracts: {}
});

export const nileTestnet: AppKitNetwork = defineChain({
  id: '0xcd8690dc',
  caipNetworkId: 'tron:0xcd8690dc' as CaipNetworkId,
  chainNamespace: 'tron' as 'eip155',
  name: 'Tron Nile Testnet',
  nativeCurrency: {
    decimals: 6,
    name: 'TRX',
    symbol: 'TRX'
  },
  rpcUrls: {
    default: {
      http: [''],
      webSocket: ['']
    }
  },
  blockExplorers: {
    default: { name: 'Tron BlockChain Explorer', url: 'https://nile.tronscan.org/' }
  },
  contracts: {}
});

export const shastaTestnet: AppKitNetwork = defineChain({
  id: '0x94a9059e',
  caipNetworkId: 'tron:0x94a9059e' as CaipNetworkId,
  chainNamespace: 'tron' as 'eip155',
  name: 'Tron Shasta Testnet',
  nativeCurrency: {
    decimals: 6,
    name: 'TRX',
    symbol: 'TRX'
  },
  rpcUrls: {
    default: {
      http: [''],
      webSocket: ['']
    }
  },
  blockExplorers: {
    default: { name: 'Tron BlockChain Explorer', url: 'https://shasta.tronscan.org/' }
  },
  contracts: {}
});

export interface ThemeVariables {
  /**
   * Base font family.
   */
  '--w3m-font-family'?: string;
  /**
   * Color used for buttons, icons, labels, etc.
   */
  '--w3m-accent'?: string;
  /**
   * The color that blends in with the default colors.
   */
  '--w3m-color-mix'?: string;
  /**
   * The percentage on how much “—w3m-color-mix” should blend in.
   */
  '--w3m-color-mix-strength'?: number;
  /**
   * The base pixel size for fonts.
   */
  '--w3m-font-size-master'?: string;
  /**
   * The base border radius in pixels.
   */
  '--w3m-border-radius-master'?: string;
  /**
   * The z-index of the modal.
   */
  '--w3m-z-index'?: number;
  /**
   * The color of the QRCode.
   */
  '--w3m-qr-color'?: string;
}
