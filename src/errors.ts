export class ClientNotInitializedError extends Error {
  constructor(message = 'WalletConnect client is not initialized. Please call connect() first.') {
    super(message);
    this.name = 'ClientNotInitializedError';

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ClientNotInitializedError.prototype);
  }
}
