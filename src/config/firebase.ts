import * as admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { env } from './env';

let firebaseApp: admin.app.App | null = null;

try {
  const serviceAccountPath = path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[Firebase] Admin SDK successfully initialized.');
  } else {
    console.warn(`[Firebase] Service account file not found at ${serviceAccountPath}. Push notifications will run in mock mode.`);
  }
} catch (error) {
  console.error('[Firebase] Failed to initialize Firebase Admin SDK:', error);
}

export const firebaseAdmin = admin;
export { firebaseApp };
