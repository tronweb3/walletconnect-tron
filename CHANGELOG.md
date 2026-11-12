## 4.0.4

- `network` now accepts the chain ID as a hex or decimal string, with or without the `tron:` prefix (e.g. `tron:0x2b6653dc`, `0x2b6653dc`, `tron:728126428`, `728126428`), or as a number (e.g. `728126428`). Hex strings are case-insensitive. All forms are converted to the lowercase hex form `tron:0x...`.
- An invalid `network` (e.g. `'Mainnet'`, an empty string or a negative number) now throws when `WalletConnectWallet` is created instead of failing later in `connect()`.
- Upgrade the development toolchain to Node.js 24.22.1 and pnpm 11.21.0.
- Fix security vulnerabilities in the repository lockfile via pnpm overrides, including `axios`, `form-data`, `ws` and `zod`. Published dependencies are unchanged.
- Add unit tests and run them in CI.

## 4.0.3

- Add ESLint, Prettier, and GitHub Actions CI for code quality
- Upgrade dependencies: `@reown/appkit` to 1.8.20, `@walletconnect/*` to 2.23.9
- Fix security vulnerabilities in transitive dependencies including `h3` and `picomatch`

## 4.0.2

- Add custom QR code rendering support via `onUri` callback in `connect()` options.
- When `onUri` is provided, the AppKit modal is automatically skipped, allowing developers to implement their own QR code UI.

## 4.0.1

- Add AppKit control methods: `closeModal()`, `setThemeMode()`, `subscribeModalState()`, and `subscribeEvents()`.
- Support dynamic theme mode switching after connection.
- Add modal state and event tracking capabilities.

## 4.0.0

- Update QR code modal from `@walletconnect/modal` to `@reown/appkit`.
- Change signing response structure to be compatible with both old and new wallets.
- Switch connection flow to use WalletConnect Universal Provider.
- Add event listeners support: `accountsChanged` and `disconnect` events.

## 3.0.0

- Replace `@web3modal/standalone` with `@walletconnect/modal`.

## 2.0.0

- Replace the original QRCodeModal with Web3Modal.
- Support `web3ModalConfig` when creating the WalletConnect Tron instance to customize the displayed wallet list for both desktop and mobile.

## 1.0.1

- Support `qrcodeModalOptions` when creating the WalletConnect Tron instance to customize the displayed wallet list for both desktop and mobile.

## 1.0.0

- Initial release: WalletConnect Tron SDK providing `connect`, `disconnect`, `signTransaction`, `signMessage`, and `checkConnectStatus` APIs.
