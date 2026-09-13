/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setLogLevel,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Silence internal Firestore SDK diagnostic logs (such as sub-second multi-tab lease clock skew warnings)
try {
  setLogLevel("silent");
} catch {
  // Ignore if unsupported in environment
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const targetDatabaseId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    targetDatabaseId
  );
} catch (e) {
  try {
    db = getFirestore(app, targetDatabaseId);
  } catch (fallbackErr) {
    db = getFirestore(app);
  }
}

const auth = getAuth(app);

export { app, db, auth };


