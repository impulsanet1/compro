/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from "../firebase";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const current = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: current?.uid ?? null,
      email: current?.email ?? null,
      emailVerified: current?.emailVerified ?? null,
      isAnonymous: current?.isAnonymous ?? null,
      tenantId: current?.tenantId ?? null,
      providerInfo:
        current?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };

  const formattedMsg = JSON.stringify(errInfo);
  console.error("Firestore Error: ", formattedMsg);
  throw new Error(formattedMsg);
}
