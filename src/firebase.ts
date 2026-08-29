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
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

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


