import { AppKit, createAppKit } from '@reown/appkit';
import type { PublicStateControllerState, EventsControllerState } from '@reown/appkit';
import type WalletConnectClient from '@walletconnect/sign-client';
import { UniversalProvider } from '@walletconnect/universal-provider';
import type { EngineTypes, SessionTypes, SignClientTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { ClientNotInitializedError } from './errors.js';
import {
  ChainID,
  WalletConnectChainID,
  mainnet,
  nileTestnet,
  shastaTestnet,
  NETWORK_MAP,
  ThemeVariables
} from './utils.js';

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
  /**
   * Control the display of "All Wallets" button.
   * @default `HIDE` (recommended for Tron as most wallets don't support it)
   * @see https://docs.reown.com/appkit/react/core/options
   */
  allWallets?: 'SHOW' | 'HIDE' | 'ONLY_MOBILE';
  /**
   * List of featured wallet IDs to display first (in order).
   * @see https://walletguide.walletconnect.network/ to find wallet IDs
   */
  featuredWalletIds?: string[];
  /**
   * Whitelist of wallet IDs to include (if set, only these wallets will be shown).
   */
  includeWalletIds?: string[];
  /**
   * Blacklist of wallet IDs to exclude.
   */
  excludeWalletIds?: string[];
  /**
   * Custom wallets to add to the list.
   */
  customWallets?: any[];
  /**
   * Enable Reown cloud analytics.
   * @default true
   */
  enableAnalytics?: boolean;
  /**
   * Enable debug logs.
   * @default false
   */
  debug?: boolean;
  /**
   * Additional AppKit configuration options.
   * Any extra properties will be passed directly to createAppKit.
   */
  [key: string]: any;
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
  private modalStateUnsubscribers: Array<() => void> = [];
  private eventUnsubscribers: Array<() => void> = [];

  // Cache subscription requests before AppKit is created
  private pendingModalCallbacks: Array<{
    callback: (state: PublicStateControllerState) => void;
    unsubscribeRef: { fn?: () => void };
  }> = [];
  private pendingEventCallbacks: Array<{
    callback: (event: EventsControllerState) => void;
    unsubscribeRef: { fn?: () => void };
  }> = [];

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
    if (event) {
      this.eventListeners.delete(event);
    } else {
      this.eventListeners.clear();
    }
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

  private setupModalListeners(): void {
    if (!this.appKit) return;

    // Clean up existing subscriptions
    while (this.modalStateUnsubscribers.length > 0) {
      const unsubscribe = this.modalStateUnsubscribers.shift()!;
      unsubscribe();
    }

    // Clean up existing event subscriptions
    while (this.eventUnsubscribers.length > 0) {
      const unsubscribe = this.eventUnsubscribers.shift()!;
      unsubscribe();
    }

    // Process cached modal state subscriptions
    while (this.pendingModalCallbacks.length > 0) {
      const item = this.pendingModalCallbacks.shift()!;
      const unsubscribe = this.appKit.subscribeState(item.callback);
      this.modalStateUnsubscribers.push(unsubscribe);
      // Wire up the user's unsubscribe reference
      item.unsubscribeRef.fn = unsubscribe;
    }

    // Process cached event subscriptions
    while (this.pendingEventCallbacks.length > 0) {
      const item = this.pendingEventCallbacks.shift()!;
      const unsubscribe = this.appKit.subscribeEvents(item.callback);
      this.eventUnsubscribers.push(unsubscribe);
      // Wire up the user's unsubscribe reference
      item.unsubscribeRef.fn = unsubscribe;
    }
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
        // Extract known configuration properties
        const {
          network,
          options,
          themeMode,
          themeVariables,
          allWallets,
          featuredWalletIds,
          includeWalletIds,
          excludeWalletIds,
          customWallets,
          enableAnalytics,
          debug,
          ...extraAppKitConfig // Spread any additional AppKit config
        } = this._config;

        const selectedNetwork = NETWORK_MAP.get(this._network as WalletConnectChainID);

        this.appKit = createAppKit({
          projectId: this._options.projectId as string,
          networks: [mainnet, nileTestnet, shastaTestnet],
          defaultNetwork: selectedNetwork,
          themeMode,
          themeVariables,
          allWallets: allWallets ?? 'HIDE',
          featuredWalletIds,
          includeWalletIds,
          excludeWalletIds,
          customWallets,
          enableAnalytics,
          debug,
          manualWCControl: true,
          universalProvider: provider,
          ...extraAppKitConfig // Spread extra config options
        } as any);
        this.setupModalListeners();
      } // Auto-setup modal event listeners
      await this.appKit.open();

      try {
        let isConnected = false;
        let modalStateUnsubscribe: (() => void) | undefined;

        // Monitor modal close to abort connection if user closes it
        const connectPromise = provider.connect({
          pairingTopic: undefined,
          optionalNamespaces: (getConnectParams(this._network) as any).requiredNamespaces as any
        } as any);

        // Create a promise that rejects when modal is closed by user (before connection completes)
        const modalClosePromise = new Promise<never>((_, reject) => {
          let isModalOpen = true;
          modalStateUnsubscribe = this.appKit!.subscribeState(state => {
            // Detect modal closing before connection is established
            if (isModalOpen && !state.open && !isConnected) {
              // Don't delete proposals - just reject to inform dApp
              // If wallet confirms later, it will still work through session events
              reject(new Error('User closed the connection modal'));
            }
            isModalOpen = state.open;
          });
        });

        // Race between connection completing and modal being closed
        const session = await Promise.race([
          connectPromise.then(result => {
            isConnected = true; // Mark connection as successful
            return result;
          }),
          modalClosePromise
        ]).finally(() => {
          // Clean up modal state subscription
          modalStateUnsubscribe?.();
        });

        this._session = session as SessionTypes.Struct;
        this._client = client;
        this.address = this.extractAddressFromSession(this._session);
        this.setupSessionListeners();
        const addresses = this.extractAllAddressesFromSession(this._session);
        this.emit('accountsChanged', addresses);
        return { address: this.address };
      } catch (error) {
        throw error;
      } finally {
        await this.appKit?.close();
      }
    }
  }

  async disconnect() {
    try {
      // Clean up session handlers
      if (this._client) {
        this.sessionHandlers.update && this._client.off('session_update', this.sessionHandlers.update);
        this.sessionHandlers.delete && this._client.off('session_delete', this.sessionHandlers.delete);
        this.sessionHandlers = {};
      }

      // Cleanup modal listeners
      while (this.modalStateUnsubscribers.length > 0) {
        const unsubscribe = this.modalStateUnsubscribers.shift()!;
        unsubscribe();
      }

      // Cleanup event subscriptions
      while (this.eventUnsubscribers.length > 0) {
        const unsubscribe = this.eventUnsubscribers.shift()!;
        unsubscribe();
      }

      const reason = getSdkError('USER_DISCONNECTED');
      const topic = this._session?.topic || (this.provider as any)?.session?.topic;
      if (!topic) throw new ClientNotInitializedError();

      const client = (this.provider?.client as unknown as WalletConnectClient) || this._client;
      if (!client) throw new ClientNotInitializedError();

      await client.disconnect({ topic, reason } as any);
    } finally {
      // Always clean up session and address, even if disconnect fails
      this._session = undefined;
      this.address = undefined;
    }
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

  // ========== AppKit Method Pass-through ==========
  // The following methods expose AppKit functionality in manualWCControl mode.
  // Note: AppKit instance is created during the first connect() call.

  /**
   * Close the AppKit modal.
   * @throws {Error} If AppKit is not initialized
   */
  public async closeModal(): Promise<void> {
    if (!this.appKit) {
      throw new Error('[WalletConnectWallet] AppKit not initialized. Please call connect() first.');
    }
    await this.appKit.close();
  }

  /**
   * Set the theme mode (light or dark).
   * @param mode - 'light' or 'dark'
   * @throws {Error} If AppKit is not initialized
   */
  public setThemeMode(mode: 'light' | 'dark'): void {
    if (!this.appKit) {
      throw new Error('[WalletConnectWallet] AppKit not initialized. Please call connect() first.');
    }
    this.appKit.setThemeMode(mode);
  }

  /**
   * Subscribe to AppKit modal state changes.
   * @param callback - Callback function called when state changes
   * @returns Unsubscribe function
   * @note Can be called before connect(). Subscription will be active after AppKit is initialized.
   */
  public subscribeModalState(callback: (state: PublicStateControllerState) => void): () => void {
    if (!this.appKit) {
      // AppKit not created yet, cache the callback with an unsubscribe reference
      const unsubscribeRef: { fn?: () => void } = {};
      const item = { callback, unsubscribeRef };
      this.pendingModalCallbacks.push(item);

      // Return cleanup function that works both before and after AppKit initialization
      return () => {
        if (unsubscribeRef.fn) {
          // AppKit already initialized, call the real unsubscribe
          unsubscribeRef.fn();
          // Remove from array
          const index = this.modalStateUnsubscribers.indexOf(unsubscribeRef.fn);
          if (index > -1) {
            this.modalStateUnsubscribers.splice(index, 1);
          }
        } else {
          // AppKit not yet initialized, remove from pending
          const index = this.pendingModalCallbacks.indexOf(item);
          if (index > -1) {
            this.pendingModalCallbacks.splice(index, 1);
          }
        }
      };
    }

    // AppKit already exists, subscribe immediately
    const unsubscribe = this.appKit.subscribeState(callback);
    this.modalStateUnsubscribers.push(unsubscribe);
    return () => {
      unsubscribe();
      const index = this.modalStateUnsubscribers.indexOf(unsubscribe);
      if (index > -1) {
        this.modalStateUnsubscribers.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to all AppKit events.
   * @param callback - Callback function called on each event
   * @returns Unsubscribe function
   * @note Can be called before connect(). Subscription will be active after AppKit is initialized.
   */
  public subscribeEvents(callback: (event: EventsControllerState) => void): () => void {
    if (!this.appKit) {
      // AppKit not created yet, cache the callback with an unsubscribe reference
      const unsubscribeRef: { fn?: () => void } = {};
      const item = { callback, unsubscribeRef };
      this.pendingEventCallbacks.push(item);

      // Return cleanup function that works both before and after AppKit initialization
      return () => {
        if (unsubscribeRef.fn) {
          // AppKit already initialized, call the real unsubscribe
          unsubscribeRef.fn();
          // Remove from array
          const index = this.eventUnsubscribers.indexOf(unsubscribeRef.fn);
          if (index > -1) {
            this.eventUnsubscribers.splice(index, 1);
          }
        } else {
          // AppKit not yet initialized, remove from pending
          const index = this.pendingEventCallbacks.indexOf(item);
          if (index > -1) {
            this.pendingEventCallbacks.splice(index, 1);
          }
        }
      };
    }

    // AppKit already exists, subscribe immediately
    const unsubscribe = this.appKit.subscribeEvents(callback);
    this.eventUnsubscribers.push(unsubscribe);
    return () => {
      unsubscribe();
      const index = this.eventUnsubscribers.indexOf(unsubscribe);
      if (index > -1) {
        this.eventUnsubscribers.splice(index, 1);
      }
    };
  }
}
