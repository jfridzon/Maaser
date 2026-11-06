// Prints a new VAPID key pair for web push.
import { createECDH } from 'node:crypto';
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
console.log('Public: ', ecdh.getPublicKey().toString('base64url'));
console.log('Private:', ecdh.getPrivateKey().toString('base64url'));
