/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  setLogLevel,
  doc,
  getDocFromServer,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Silence internal Firestore SDK diagnostic logs
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
      localCache: memoryLocalCache(),
    },
    targetDatabaseId
  );
} catch {
  try {
    db = getFirestore(app, targetDatabaseId);
  } catch {
    db = getFirestore(app);
  }
}

const auth = getAuth(app);

// Validate connection to Firestore on initial boot as required by skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export { app, db, auth };
