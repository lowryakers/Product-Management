/**
 * Prints a fresh VAPID key pair for web push.
 *
 *   npx tsx scripts/gen-vapid.ts
 *
 * Paste both values into Railway → Variables, then redeploy. Rotating them
 * invalidates every existing push subscription, so generate once and keep them.
 */

import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('');
console.log('Add these to Railway → your service → Variables:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('');
console.log('Keep the private key secret. Do not commit it.');
console.log('');
