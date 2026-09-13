import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence non-critical transport warnings from internal WebChannel logger
setLogLevel('error');

const app = initializeApp(firebaseConfig);

// Configure Firestore with long-polling transport for cloud container & proxy compatibility
// and persistent multi-tab local caching for offline resilience.
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (
      errorMsg.includes('the client is offline') ||
      errorMsg.includes('unavailable') ||
      errorMsg.includes('Failed to get document')
    ) {
      console.warn('Firebase connection: backend syncing or running in offline mode.');
      return false;
    }
    // Any permission or missing doc error is fine, confirms backend is reached
    return true;
  }
}

// Initial connection validation
testConnection();

export interface AlisLinkData {
  id: string;
  owner: string;
  createdAt: string;
  expiresAt: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
  verificationId?: string;
}

export interface VerificationRecordData {
  id: string;
  status: 'VALID' | 'INVALID' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
  browser: string;
  platform: string;
  screen: string;
  referrer: string;
  alisId: string;
}
