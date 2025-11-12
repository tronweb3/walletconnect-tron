# @tronweb3/walletconnect-tron

`@tronweb3/walletconnect-tron` helps dApps connect to the TRON network via WalletConnect.

# Get Started

### Installation

You can install `@tronweb3/walletconnect-tron` with npm, yarn, or pnpm:

```shell
npm i @tronweb3/walletconnect-tron
```

```shell
yarn add @tronweb3/walletconnect-tron
```

```shell
pnpm add @tronweb3/walletconnect-tron
```

# Create a WalletConnect wallet

### Request Parameters

| Argument       | Description                        | Type   |
| -------------- | ---------------------------------- | ------ |
| network        | The chain (Mainnet, Shasta, Nile)  | string |
| options        | WalletConnect client options       | object |
| themeMode      | Theme mode (`dark` &#124; `light`) | string |
| themeVariables | Theming variables (`--w3m-*`)      | object |

```typescript
interface WalletConnectAdapterConfig {
  network: WalletConnectChainID;
  options: SignClientTypes.Options;
  /**
   * Theme mode configuration flag. By default, `themeMode` follows the user's system setting.
   * @type `dark` | `light`
   * @see https://docs.reown.com/appkit/react/core/theming
   */
  themeMode?: 'dark' | 'light';
  /**
   * Theme variable configuration object.
   * @default undefined
   * @see https://docs.reown.com/appkit/react/core/theming#themevariables
   */
  themeVariables?: ThemeVariables;
}
```

### Example

```javascript
import { WalletConnectWallet, WalletConnectChainID } from '@tronweb3/walletconnect-tron';
const wallet = new WalletConnectWallet({
  network: WalletConnectChainID.Mainnet,
  options: {
    relayUrl: 'wss://relay.walletconnect.com',
    projectId: '....',
    metadata: {
      name: 'Your dApp name',
      description: 'Your dApp description',
      url: 'Your dApp url',
      icons: ['Your dApp icon']
    }
  },
  // Theming (optional)
  themeMode: 'dark',
  themeVariables: {
    '--w3m-z-index': 1000
    // More variables: https://docs.reown.com/appkit/react/core/theming#themevariables
  }
});
```

# Connect to the Wallet

Use `wallet.connect()` to establish a connection. If the dApp has previously connected, it will reconnect automatically; otherwise, a WalletConnect QR code will be displayed.

### Response

Returns an object containing the wallet address when connected (e.g., `{ address: string }`).

### Example

```javascript
const { address } = await wallet.connect();
```

# Disconnect from the Wallet

Use `wallet.disconnect()` to disconnect the wallet.

### Example

```javascript
try {
  await wallet.disconnect();
} catch (error) {
  console.log('disconnect:' + error);
}
```

# Sign Transaction

Signs the provided transaction object.

### Request Parameters

| Argument    | Description      | Type   |
| ----------- | ---------------- | ------ |
| transaction | TRON transaction | object |

### Response

Returns a signed transaction object.

### Examples

- TRX transfer (native TRX)

```javascript
import { TronWeb } from 'tronweb';

const tronWeb = new TronWeb({ fullHost: 'https://nile.trongrid.io' }); // Nile Testnet
const from = '<yourAddress>';
const to = '<recipientAddress>';
const amountSun = 1_000_000; // 1 TRX

// build
const tx = await tronWeb.transactionBuilder.sendTrx(to, amountSun, from);

// sign
const signedTransaction = await wallet.signTransaction(tx);

// optional: broadcast
// const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction)
```

- Contract call (USDT approve)

```javascript
import { TronWeb } from 'tronweb';

const tronWeb = new TronWeb({ fullHost: 'https://nile.trongrid.io' }); // Nile Testnet
const from = '<yourAddress>';
const usdt = '<usdtContract>';
const spender = '<spenderAddress>';
const amount = 100n * 1_000_000n; // 100 USDT, 6 decimals

// triggerSmartContract returns { transaction }
const { transaction } = await tronWeb.transactionBuilder.triggerSmartContract(
  usdt,
  'approve(address,uint256)',
  { feeLimit: 200000000 },
  [
    { type: 'address', value: spender },
    { type: 'uint256', value: amount.toString() }
  ],
  from
);

const signedTransaction = await wallet.signTransaction(transaction);
// optional: broadcast
// const receipt = await tronWeb.trx.sendRawTransaction(signedTransaction)
```

### Note

- For `triggerSmartContract`, pass the `transaction` field from its response, not the whole response object.
- `sendTrx` returns the transaction object directly; pass it to `wallet.signTransaction`.
- Some wallets auto-broadcast, others do not. If not, call `tronWeb.trx.sendRawTransaction(signedTransaction)` yourself.

# Sign Message

Signs a string message.

### Request Parameters

| Argument | Description         | Type   |
| -------- | ------------------- | ------ |
| message  | The message to sign | string |

### Example

```javascript
try {
  const signature = await wallet.signMessage('hello world');
} catch (error) {
  console.log('signMessage:' + error);
}
```

# Check Connection Status

Checks the connection status.

### Response

Returns `{ address: string }`. If not connected, returns `{ address: '' }`.

### Example

```javascript
const { address } = await wallet.checkConnectStatus();
```

# Event Listeners

The wallet supports event listeners to monitor connection state and account changes.

**Note:** The `on()` method returns a function that can be called to unsubscribe from the event. This is why the returned value is typically named `unsubscribe`.

## accountsChanged Event

Triggered when the connected account address changes (e.g., user switches accounts in the wallet).

### Parameters

| Parameter | Description                | Type     |
| --------- | -------------------------- | -------- |
| accounts  | Array of account addresses | string[] |

The first address in the array is the primary account address.

### Example

```javascript
// on() returns a function that can be called to unsubscribe
const unsubscribe = wallet.on('accountsChanged', accounts => {
  const primaryAddress = accounts[0];
  console.log('Primary address:', primaryAddress);
  console.log('All addresses:', accounts);
});

// Call the returned function to unsubscribe when done
unsubscribe();
```

## disconnect Event

Triggered when the wallet connection is disconnected (either by user action or network issues).

### Example

```javascript
// on() returns a function that can be called to unsubscribe
const unsubscribe = wallet.on('disconnect', () => {
  console.log('Wallet disconnected');
  // Clean up your app state
});

// Call the returned function to unsubscribe when done
unsubscribe();
```

## Remove Event Listeners

Recommended: use the unsubscribe function returned by `on()`. To remove a specific listener with `off()`, pass the same function reference:

```javascript
// Preferred
const fn = accounts => {
  /* ... */
};
const unsubscribe = wallet.on('accountsChanged', fn);
unsubscribe();

// Or remove by function reference
wallet.off('accountsChanged', fn);

// Cleanup
wallet.removeAllListeners('accountsChanged');
// wallet.removeAllListeners();
```

## Note

The connection uses the WalletConnect relay service specified by `relayUrl`. Network errors may occur occasionally, so dApp developers should handle network errors, connection errors, and timeout errors appropriately.

Refer to the [WalletConnect Error Definitions](https://github.com/WalletConnect/walletconnect-monorepo/blob/v2.0/packages/utils/src/errors.ts) for all error messages and codes.

## License

MIT
