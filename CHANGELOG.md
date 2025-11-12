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
