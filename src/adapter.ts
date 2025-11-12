import { AppKit, createAppKit } from '@reown/appkit';
import type WalletConnectClient from '@walletconnect/sign-client';
import { UniversalProvider } from '@walletconnect/universal-provider';
import type { EngineTypes, SessionTypes, SignClientTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { ClientNotInitializedError } from './errors.js';
import { ChainID, mainnet, nileTestnet, shastaTestnet, ThemeVariables } from './utils.js';

export interface WalletConnectAdapterConfig {
  network: ChainID;
  options: SignClientTypes.Options;
  /**
   * Theme mode configuration flag. By default themeMode option will be set to user system settings.
   * @default `system`
   * @type `dark` | `light`
   * @see https://docs.reown.com/appkit/react/core/theming
   */
  themeMode?: `dark` | `light`;
  /**
   * Theme variable configuration object.
   * @default undefined
   * @see https://docs.reown.com/appkit/react/core/theming#themevariables
   */
  themeVariables?: ThemeVariables;
}

export enum WalletConnectMethods {
  signTransaction = 'tron_signTransaction',
  signMessage = 'tron_signMessage'
}

interface WalletConnectWalletInit {
  address: string;
}

const getConnectParams = (chainId: ChainID, pairingTopic?: string) =>
  ({
    requiredNamespaces: {
      tron: {
        chains: [chainId],
        methods: [WalletConnectMethods.signTransaction, WalletConnectMethods.signMessage],
        events: []
      }
    },
    pairingTopic: pairingTopic
  } as unknown as Required<EngineTypes.ConnectParams>);

export class WalletConnectWallet {
  private _client: WalletConnectClient | undefined;
  private _session: SessionTypes.Struct | undefined;
  private readonly _network: ChainID;
  private readonly _options: SignClientTypes.Options;
  private readonly _config: WalletConnectAdapterConfig;
  private appKit: AppKit | undefined;
  private provider: InstanceType<typeof UniversalProvider> | undefined;
  private providerPromise: Promise<InstanceType<typeof UniversalProvider>> | null = null;
  private address: string | undefined;
  private eventListeners = new Map<string, Set<Function>>();
  private sessionHandlers: { update?: (args: any) => void; delete?: (args: any) => void } = {};

  constructor(config: WalletConnectAdapterConfig) {
    this._options = config.options;
    this._network = config.network;
    this._config = config;
  }

  private async getProvider(): Promise<InstanceType<typeof UniversalProvider>> {
    if (this.provider) return this.provider;
    if (!this.providerPromise) {
      const projectId = this._options.projectId as string;
      if (!projectId) {
        throw new Error('[WalletConnectWallet] projectId is required to initialize UniversalProvider');
      }
      this.providerPromise = UniversalProvider.init({
        projectId: projectId,
        logger: (this._options as any)?.logger,
        relayUrl: (this._options as any)?.relayUrl,
        metadata: (this._options as any)?.metadata
      }).catch(error => {
        // Reset providerPromise on failure to allow retry
        this.providerPromise = null;
        throw error;
      });
    }
    const provider = await this.providerPromise;
    this.provider = provider;
    this._client = provider.client as unknown as WalletConnectClient;
    return provider;
  }

  private extractAddressFromSession(session: SessionTypes.Struct): string {
    const accounts = Object.values(session.namespaces).flatMap(namespace => namespace.accounts);

    const account = accounts[0];
    if (!account) {
      throw new Error('[WalletConnectWallet] No accounts found in session');
    }

    // Account format: chainId:namespace:address (e.g., "tron:0x2b6653dc:Txxxxxxxxxxxxxxx")
    const address = account.split(':')[2];
    if (!address) {
      throw new Error(`[WalletConnectWallet] Invalid account format: ${account}`);
    }

    return address;
  }

  private extractAllAddressesFromSession(session: SessionTypes.Struct): string[] {
    const accounts = Object.values(session.namespaces).flatMap(namespace => namespace.accounts);

    if (!accounts || accounts.length === 0) {
      return [];
    }

    // Account format: chainId:namespace:address (e.g., "tron:0x2b6653dc:Txxxxxxxxxxxxxxx")
    return accounts.map(account => account.split(':')[2]).filter((addr): addr is string => !!addr);
  }

  private emit(event: string, ...args: any[]): void {
    this.eventListeners.get(event)?.forEach(listener => {
      try {
        listener(...args);
      } catch (error) {
        console.error(`[WalletConnectWallet] Error in ${event} listener:`, error);
      }
    });
  }

  on(event: 'accountsChanged', listener: (accounts: string[]) => void): () => void;
  on(event: 'disconnect', listener: () => void): () => void;
  on(event: string, listener: Function): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Function): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  removeAllListeners(event?: string): void {
    event ? this.eventListeners.delete(event) : this.eventListeners.clear();
  }

  private setupSessionListeners(): void {
    if (!this._client || !this._session) return;

    const cleanup = () => {
      if (this._client) {
        this.sessionHandlers.update && this._client.off('session_update', this.sessionHandlers.update);
        this.sessionHandlers.delete && this._client.off('session_delete', this.sessionHandlers.delete);
      }
      this.sessionHandlers = {};
    };

    cleanup();

    this.sessionHandlers.update = ({ topic, params }: any) => {
      if (!this._session || this._session.topic !== topic) return;
      let updated: SessionTypes.Struct | undefined;
      try {
        updated = this._client?.session.get(topic) as unknown as SessionTypes.Struct;
      } catch (_) {
        // Session was already removed; ignore late update
        return;
      }
      if (!updated) return;

      const oldAddresses = this.extractAllAddressesFromSession(this._session);
      this._session = { ...updated, namespaces: params?.namespaces || updated.namespaces };
      this.address = this.extractAddressFromSession(this._session);
      const newAddresses = this.extractAllAddressesFromSession(this._session);

      const addressesChanged = JSON.stringify(oldAddresses) !== JSON.stringify(newAddresses);
      if (addressesChanged) {
        this.emit('accountsChanged', newAddresses);
      }
    };

    this.sessionHandlers.delete = ({ topic }: any) => {
      if (this._session?.topic === topic) {
        this._session = undefined;
        this.address = undefined;
        this.emit('disconnect');
        cleanup();
      }
    };

    this._client.on('session_update', this.sessionHandlers.update);
    this._client.on('session_delete', this.sessionHandlers.delete);
  }

  async connect(): Promise<WalletConnectWalletInit> {
    const provider = await this.getProvider();
    const client = provider.client as unknown as WalletConnectClient;

    const sessions = client.find(getConnectParams(this._network)).filter(s => s.acknowledged);
    if (sessions.length) {
      // select last matching session
      this._session = sessions[sessions.length - 1];
      // We assign this variable only after we're sure we've received approval
      this._client = client;
      this.address = this.extractAddressFromSession(this._session);
      this.setupSessionListeners();
      const addresses = this.extractAllAddressesFromSession(this._session);
      this.emit('accountsChanged', addresses);

      return {
        address: this.address
      };
    } else {
      if (!this.appKit) {
        this.appKit = createAppKit({
          projectId: this._options.projectId as string,
          networks: [mainnet, nileTestnet, shastaTestnet],
          themeMode: (this._config as any).themeMode,
          themeVariables: (this._config as any).themeVariables,
          allWallets: 'HIDE',
          manualWCControl: true,
          universalProvider: provider
        });
      }
      this.appKit.open();
      try {
        const session = await provider.connect({
          pairingTopic: undefined,
          optionalNamespaces: (getConnectParams(this._network) as any).requiredNamespaces as any
        } as any);
        this._session = session as SessionTypes.Struct;
        this._client = client;
        this.address = this.extractAddressFromSession(this._session);
        this.setupSessionListeners();
        const addresses = this.extractAllAddressesFromSession(this._session);
        this.emit('accountsChanged', addresses);
        return { address: this.address };
      } finally {
        this.appKit?.close();
      }
    }
  }

  async disconnect() {
    if (this._client) {
      this.sessionHandlers.update && this._client.off('session_update', this.sessionHandlers.update);
      this.sessionHandlers.delete && this._client.off('session_delete', this.sessionHandlers.delete);
      this.sessionHandlers = {};
    }

    const reason = getSdkError('USER_DISCONNECTED');
    const topic = this._session?.topic || (this.provider as any)?.session?.topic;
    if (!topic) throw new ClientNotInitializedError();

    const client = (this.provider?.client as unknown as WalletConnectClient) || this._client;
    if (!client) throw new ClientNotInitializedError();

    await client.disconnect({ topic, reason } as any);

    this._session = undefined;
    this.address = undefined;
  }

  get client(): WalletConnectClient {
    if (this._client) return this._client;
    throw new ClientNotInitializedError();
  }

  async checkConnectStatus(): Promise<WalletConnectWalletInit> {
    const provider = await this.getProvider();
    const client = provider.client as unknown as WalletConnectClient;

    const sessions = client.find(getConnectParams(this._network)).filter(s => s.acknowledged);
    if (sessions.length) {
      // select last matching session
      this._session = sessions[sessions.length - 1];
      // We assign this variable only after we're sure we've received approval
      this._client = client;
      this.address = this.extractAddressFromSession(this._session);
      this.setupSessionListeners();
      const addresses = this.extractAllAddressesFromSession(this._session);
      this.emit('accountsChanged', addresses);

      return {
        address: this.address
      };
    } else {
      return {
        address: ''
      };
    }
  }

  async signTransaction(transaction: any): Promise<any> {
    if (this._client && this._session) {
      const sessionProperties = this._session.sessionProperties;
      const isV1Method = sessionProperties?.tron_method_version === 'v1';

      const result = await this._client.request({
        chainId: this._network,
        topic: this._session.topic,
        request: {
          method: WalletConnectMethods.signTransaction,
          params: isV1Method
            ? {
                address: this.address,
                transaction
              }
            : {
                address: this.address,
                transaction: { transaction }
              }
        }
      });
      return (result as any)?.result ? (result as any).result : result;
    } else {
      throw new ClientNotInitializedError();
    }
  }

  async signMessage(message: string): Promise<any> {
    if (this._client && this._session) {
      const { signature } = await this._client.request<{ signature: string }>({
        chainId: this._network,
        topic: this._session.topic,
        request: {
          method: WalletConnectMethods.signMessage,
          params: {
            address: this.address,
            message
          }
        }
      });

      return signature;
    } else {
      throw new ClientNotInitializedError();
    }
  }
}
