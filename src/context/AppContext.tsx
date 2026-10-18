/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { User, onAuthStateChanged, signOut, sendPasswordResetEmail, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  BusinessConfig,
  SocialNetwork,
  Service,
  ServiceCombo,
  Receipt,
  Client,
  TrmState,
  getNormalizedStatus,
  SupplierWarrantyRecord,
  isReceiptForClient,
  generateClientId,
  normalizeContact,
  matchContacts,
  matchPhones,
  buildReceiptsClientIndex,
  getItemOrderIds,
  getClientCode,
  getClientTagForSpending,
  ReopenWarrantyParams
} from "../types";
import { DEFAULT_BUSINESS_CONFIG, DEFAULT_SOCIAL_NETWORKS, DEFAULT_SERVICES, DEFAULT_COMBOS } from "../defaultData";

interface AppContextType {
  user: User | null;
  loadingAuth: boolean;
  loadingData: boolean;
  businessConfig: BusinessConfig;
  socialNetworks: SocialNetwork[];
  services: Service[];
  combos: ServiceCombo[];
  receipts: Receipt[];
  clients: Client[];
  supplierWarranties: SupplierWarrantyRecord[];

  // TRM Colombia State
  trmState: TrmState;
  fetchTRM: () => Promise<void>;

  // Dark Mode
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Supplier Warranties Actions
  addSupplierWarranty: (record: Omit<SupplierWarrantyRecord, "id" | "createdAt">) => Promise<void>;
  updateSupplierWarranty: (id: string, updates: Partial<SupplierWarrantyRecord>) => Promise<void>;
  deleteSupplierWarranty: (id: string) => Promise<void>;
  resolveSupplierWarranty: (id: string, notes?: string) => Promise<void>;
  claimAgainSupplierWarranty: (id: string, notes?: string) => Promise<void>;
  resolveAllWarrantiesInProcess: () => Promise<{ updatedReceiptsCount: number; resolvedWarrantiesCount: number }>;
  reopenOrResendWarrantyForCancelledOrder: (params: ReopenWarrantyParams) => Promise<SupplierWarrantyRecord>;

  // Auth actions
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  
  // Settings actions
  updateBusinessConfig: (config: Partial<BusinessConfig>) => Promise<void>;
  
  // Social Networks actions
  addSocialNetwork: (sn: SocialNetwork) => Promise<void>;
  updateSocialNetwork: (sn: SocialNetwork) => Promise<void>;
  deleteSocialNetwork: (id: string) => Promise<void>;
  
  // Services actions
  addService: (service: Service) => Promise<void>;
  updateService: (service: Service) => Promise<void>;
  deleteService: (id: string) => Promise<void>;

  // Combos actions
  addCombo: (combo: ServiceCombo) => Promise<void>;
  updateCombo: (combo: ServiceCombo) => Promise<void>;
  deleteCombo: (id: string) => Promise<void>;
  
  // Receipts actions
  createReceipt: (receiptData: Omit<Receipt, "id" | "consecutive"> & { clientId?: string; forceNewClient?: boolean }) => Promise<Receipt>;
  deleteReceipt: (id: string) => Promise<void>;
  updateReceipt: (id: string, updatedData: Partial<Receipt>) => Promise<void>;
  markAllInProcessAsCompleted: () => Promise<{ updatedCount: number }>;
  updateClientTag: (clientId: string, tag: string) => Promise<void>;
  updateClient: (clientId: string, updates: Partial<Client>) => Promise<void>;
  reassignClientCode: (clientId: string, customCode?: string) => Promise<string>;
  resolveDuplicateClientCodes: () => Promise<{ resolvedCount: number; details: string[] }>;
  mergeDuplicateClients: () => Promise<{ mergedGroupsCount: number; deletedDocsCount: number; details: string[] }>;
  separateReceiptToNewClient: (receiptId: string, fromClientId?: string, newClientName?: string, newClientPhone?: string) => Promise<string>;
  
  // System Maintenance
  restoreDefaults: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function cleanForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => cleanForFirestore(item)) as unknown as T;
  }
  if (typeof data === "object") {
    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        cleanObj[key] = cleanForFirestore(val);
      }
    }
    return cleanObj as T;
  }
  return data;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  const [businessConfig, setBusinessConfig] = useState<BusinessConfig>(DEFAULT_BUSINESS_CONFIG);
  const [socialNetworks, setSocialNetworks] = useState<SocialNetwork[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [combos, setCombos] = useState<ServiceCombo[]>(DEFAULT_COMBOS);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [supplierWarranties, setSupplierWarranties] = useState<SupplierWarrantyRecord[]>([]);

  // Guards to prevent runaway loops under large client/receipt volume
  const isSyncingRef = useRef(false);
  const lastSyncFingerprintRef = useRef("");

  // TRM Colombia State
  const [trmState, setTrmState] = useState<TrmState>({
    valor: null,
    fecha: null,
    loading: true,
    error: null,
  });

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("supplier_warranty_dark_mode");
      if (saved !== null) return saved === "true";
      const globalSaved = localStorage.getItem("app_dark_mode");
      return globalSaved === "true";
    } catch {
      return false;
    }
  });

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("supplier_warranty_dark_mode", String(next));
        localStorage.setItem("app_dark_mode", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add("dark");
        document.body.style.backgroundColor = "#0b0f19";
      } else {
        document.documentElement.classList.remove("dark");
        document.body.style.backgroundColor = "#f9fafb";
      }
    } catch {}
  }, [isDarkMode]);

  const fetchTRM = async () => {
    setTrmState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch("https://co.dolarapi.com/v1/trm");
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      if (data && typeof data.valor === "number" && !isNaN(data.valor) && data.valor > 0) {
        setTrmState({
          valor: data.valor,
          fecha: data.fecha || new Date().toISOString(),
          loading: false,
          error: null,
        });
      } else {
        throw new Error("Respuesta de TRM inválida");
      }
    } catch (err: any) {
      console.warn("Error consultando TRM de Colombia:", err);
      setTrmState({
        valor: null,
        fecha: null,
        loading: false,
        error: "TRM no disponible",
      });
    }
  };

  useEffect(() => {
    fetchTRM();
  }, []);

  // 1. Listen to Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

  // 2. Listen & Sync Firestore Data when Logged In
  useEffect(() => {
    if (!user) {
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    // Sync business config
    const configRef = doc(db, "config", "business");
    const unsubConfig = onSnapshot(
      configRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setBusinessConfig(docSnap.data() as BusinessConfig);
        } else {
          setBusinessConfig(DEFAULT_BUSINESS_CONFIG);
        }
      },
      (error) => {
        console.warn("Firestore config error:", error);
      }
    );

    // Sync social networks
    const socialNetworksRef = collection(db, "social_networks");
    const unsubSocial = onSnapshot(
      socialNetworksRef,
      (querySnap) => {
        const snsFromDb: SocialNetwork[] = [];
        querySnap.forEach((doc) => {
          snsFromDb.push({ id: doc.id, ...doc.data() } as SocialNetwork);
        });

        const mergedSns = DEFAULT_SOCIAL_NETWORKS.map((def) => {
          const found = snsFromDb.find((s) => s.id === def.id);
          return found ? { ...def, ...found } : def;
        });

        const customSns = snsFromDb.filter(
          (s) => !DEFAULT_SOCIAL_NETWORKS.some((def) => def.id === s.id)
        );

        setSocialNetworks([...mergedSns, ...customSns]);
      },
      (error) => {
        console.warn("Firestore social networks error:", error);
        setSocialNetworks(DEFAULT_SOCIAL_NETWORKS);
      }
    );

    // Sync services
    const servicesRef = collection(db, "services");
    const unsubServices = onSnapshot(
      servicesRef,
      (querySnap) => {
        const srvsFromDb: Service[] = [];
        querySnap.forEach((doc) => {
          srvsFromDb.push({ id: doc.id, ...doc.data() } as Service);
        });

        const mergedServices = DEFAULT_SERVICES.map((def) => {
          const found = srvsFromDb.find((s) => s.id === def.id);
          if (!found) return def;

          const sanitizedName =
            def.id === "fb-likes" && (found.name === "Likes de Página" || found.name === "Likes de Pagina")
              ? "Likes"
              : found.name || def.name;

          return {
            ...def,
            ...found,
            name: sanitizedName,
            providerCostPer1000: found.providerCostPer1000 || def.providerCostPer1000,
            quantities:
              found.quantities && found.quantities.length > 0 ? found.quantities : def.quantities
          };
        });

        const customServices = srvsFromDb.filter(
          (s) => !DEFAULT_SERVICES.some((def) => def.id === s.id)
        );

        setServices([...mergedServices, ...customServices]);
      },
      (error) => {
        console.warn("Firestore services error:", error);
        setServices(DEFAULT_SERVICES);
      }
    );

    // Sync combos
    const combosRef = collection(db, "combos");
    const unsubCombos = onSnapshot(
      combosRef,
      (querySnap) => {
        const combosFromDb: ServiceCombo[] = [];
        querySnap.forEach((doc) => {
          combosFromDb.push({ id: doc.id, ...doc.data() } as ServiceCombo);
        });

        if (combosFromDb.length === 0) {
          setCombos(DEFAULT_COMBOS);
        } else {
          // Merge defaults with custom/updated
          const merged = DEFAULT_COMBOS.map((def) => {
            const found = combosFromDb.find((c) => c.id === def.id);
            return found ? { ...def, ...found } : def;
          });
          const customOnly = combosFromDb.filter(
            (c) => !DEFAULT_COMBOS.some((def) => def.id === c.id)
          );
          setCombos([...merged, ...customOnly]);
        }
      },
      (error) => {
        console.warn("Firestore combos error:", error);
        setCombos(DEFAULT_COMBOS);
      }
    );

    // Sync receipts
    const receiptsRef = collection(db, "receipts");
    const unsubReceipts = onSnapshot(
      receiptsRef,
      (querySnap) => {
        const recs: Receipt[] = [];
        querySnap.forEach((doc) => {
          recs.push({ id: doc.id, ...doc.data() } as Receipt);
        });
        recs.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
        setReceipts(recs);
      },
      (error) => {
        console.warn("Firestore receipts error:", error);
      }
    );

    // Sync clients
    const clientsRef = collection(db, "clients");
    const unsubClients = onSnapshot(
      clientsRef,
      (querySnap) => {
        const cls: Client[] = [];
        querySnap.forEach((doc) => {
          cls.push({ id: doc.id, ...doc.data() } as Client);
        });
        setClients(cls);
        setLoadingData(false);
      },
      (error) => {
        console.warn("Firestore clients error:", error);
        setLoadingData(false);
      }
    );

    // Sync supplier warranty records
    const supplierWarrantiesRef = collection(db, "supplier_warranties");
    const unsubSupplierWarranties = onSnapshot(
      supplierWarrantiesRef,
      (querySnap) => {
        const items: SupplierWarrantyRecord[] = [];
        querySnap.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as SupplierWarrantyRecord);
        });
        items.sort((a, b) => new Date(b.sentDate || b.createdAt || 0).getTime() - new Date(a.sentDate || a.createdAt || 0).getTime());
        setSupplierWarranties(items);
      },
      (error) => console.warn("Firestore supplier_warranties error:", error)
    );

    return () => {
      unsubConfig();
      unsubSocial();
      unsubServices();
      unsubCombos();
      unsubReceipts();
      unsubClients();
      unsubSupplierWarranties();
    };
  }, [user]);

  // 3. Keep client stats, unique 4-digit client IDs, and auto-sync clients from receipts
  useEffect(() => {
    if (!user || loadingData || clients.length === 0) return;

    // Count duplicate codes to ensure fingerprint triggers sync if collisions exist
    const codeCounts = new Map<string, number>();
    clients.forEach((c) => {
      if (c.clientCode && c.clientCode.trim()) {
        const normalized = c.clientCode.trim().padStart(4, "0");
        codeCounts.set(normalized, (codeCounts.get(normalized) || 0) + 1);
      }
    });
    const duplicateCount = Array.from(codeCounts.values()).filter((cnt) => cnt > 1).length;

    // Build quick fingerprint to avoid running sync when nothing structurally changed
    const currentFingerprint = `${clients.length}_${receipts.length}_${clients.filter((c) => !c.clientCode).length}_${duplicateCount}`;
    if (lastSyncFingerprintRef.current === currentFingerprint) {
      return;
    }

    const syncClientStats = async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        // Build fast O(N + M) index mapping clients to receipts
        const { clientToReceipts } = buildReceiptsClientIndex(clients, receipts);

        // Step 0: Auto-merge any duplicate client documents sharing the same phone/handle
        const contactGroups = new Map<string, Client[]>();
        clients.forEach((c) => {
          const norm = normalizeContact(c.phone);
          if (norm.type !== "none") {
            const gKey = `${norm.type}:${norm.key}`;
            if (!contactGroups.has(gKey)) contactGroups.set(gKey, []);
            contactGroups.get(gKey)!.push(c);
          }
        });

        for (const [gKey, group] of contactGroups.entries()) {
          if (group.length > 1) {
            console.log(`Auto-merging duplicate clients for ${gKey}:`, group.map((c) => c.id));
            await mergeDuplicateClients();
            return;
          }
        }

        // Sort clients deterministically: older clients or clients with earlier dates keep their assigned code
        const sortedClients = [...clients].sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : (a.lastPurchaseDate ? new Date(a.lastPurchaseDate).getTime() : 0);
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : (b.lastPurchaseDate ? new Date(b.lastPurchaseDate).getTime() : 0);
          if (dateA !== dateB) return dateA - dateB;
          return (b.purchaseCount || 0) - (a.purchaseCount || 0);
        });

        // Detect duplicate codes (e.g., if two distinct people share ID 0083) and map unique codes
        const codeOwners = new Map<string, string>(); // code -> clientId
        const duplicateClientIds = new Set<string>();
        const usedCodes = new Set<number>();

        sortedClients.forEach((c) => {
          if (c.clientCode && c.clientCode.trim()) {
            const cleanCode = c.clientCode.trim().padStart(4, "0");
            const existingOwner = codeOwners.get(cleanCode);
            if (!existingOwner) {
              codeOwners.set(cleanCode, c.id);
              const num = parseInt(cleanCode, 10);
              if (!isNaN(num) && num > 0) usedCodes.add(num);
            } else {
              console.warn(`Duplicate clientCode #${cleanCode} detected between ${existingOwner} and ${c.id}`);
              duplicateClientIds.add(c.id);
            }
          }
        });

        let currentAutoId = 1;

        // Check which clients genuinely need document updates
        const updatesQueue: Array<{ id: string; payload: Record<string, any> }> = [];

        for (const client of sortedClients) {
          const updatePayload: Record<string, any> = {};

          const needsNewCode = !client.clientCode || !client.clientCode.trim() || duplicateClientIds.has(client.id);
          if (needsNewCode) {
            while (usedCodes.has(currentAutoId)) {
              currentAutoId++;
            }
            const assignedCode = String(currentAutoId).padStart(4, "0");
            usedCodes.add(currentAutoId);
            codeOwners.set(assignedCode, client.id);
            updatePayload.clientCode = assignedCode;
          }

          const matchingReceipts = clientToReceipts.get(client.id) || [];
          if (matchingReceipts.length > 0) {
            const actualCount = matchingReceipts.length;
            const actualSpent = matchingReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
            const sortedRecs = [...matchingReceipts].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const actualLastDate = sortedRecs[0].date;

            if (client.purchaseCount !== actualCount) updatePayload.purchaseCount = actualCount;
            if (Math.abs((client.totalSpent || 0) - actualSpent) > 0.01) updatePayload.totalSpent = actualSpent;
            if (client.lastPurchaseDate !== actualLastDate) updatePayload.lastPurchaseDate = actualLastDate;

            // Automatically assign tier tags: >300k => VIP, >150k => Frecuente, else => Nuevo
            const targetTag = getClientTagForSpending(actualSpent);
            if (client.tag !== targetTag) {
              updatePayload.tag = targetTag;
            }

            const actualReceiptIds = matchingReceipts.map((r) => r.id).filter(Boolean);
            const currentIds = client.receiptIds || [];
            const idsChanged =
              currentIds.length !== actualReceiptIds.length ||
              !actualReceiptIds.every((id) => currentIds.includes(id));
            if (idsChanged) {
              updatePayload.receiptIds = actualReceiptIds;
            }
          } else {
            const currentSpent = client.totalSpent || 0;
            const targetTag = getClientTagForSpending(currentSpent);
            if (client.tag === "Mayorista" || client.tag !== targetTag) {
              updatePayload.tag = targetTag;
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            updatesQueue.push({ id: client.id, payload: updatePayload });
          }
        }

        // Apply any needed client doc updates in small controlled batches
        for (const item of updatesQueue.slice(0, 10)) {
          try {
            await setDoc(doc(db, "clients", item.id), item.payload, { merge: true });
          } catch (e) {
            console.warn("Failed to sync client doc:", e);
          }
        }

        // Step 1.5: Auto-separate mistakenly merged clients
        // If a client has multiple receipts where one is for a Tarjeta Digital / base service
        // and another is for social media (TikTok/Instagram/etc.), separate the tarjeta receipt into its own client!
        for (const client of clients) {
          const clientRecs = clientToReceipts.get(client.id) || [];
          if (clientRecs.length > 1) {
            const tarjetaRec = clientRecs.find((r) => {
              return (r.services || []).some((s) => {
                const sName = (s.serviceName || "").toLowerCase();
                const sCat = (s.customCategory || "").toLowerCase();
                const sCode = (s.serviceCode || "").toUpperCase();
                return sName.includes("tarjeta") || sName.includes("nfc") || sCat.includes("tarjeta") || sCode.startsWith("TDIG");
              });
            });

            const socialRec = clientRecs.find((r) => {
              if (tarjetaRec && r.id === tarjetaRec.id) return false;
              return (r.services || []).some((s) => {
                const sName = (s.serviceName || "").toLowerCase();
                return sName.includes("tiktok") || sName.includes("instagram") || sName.includes("facebook") || sName.includes("seguidor");
              });
            });

            if (tarjetaRec && socialRec) {
              console.log("Auto-separating erroneously merged tarjeta order into independent client:", tarjetaRec.id);
              await separateReceiptToNewClient(tarjetaRec.id, client.id);
              return; // Allow the database change to trigger the next clean sync cycle
            }
          }
        }

        // Step 2: Discover receipts not belonging to any known client
        if (receipts.length > 0) {
          const allAssignedReceiptIds = new Set<string>();
          clientToReceipts.forEach((list) => {
            list.forEach((r) => allAssignedReceiptIds.add(r.id));
          });

          const unmappedReceipts = receipts.filter((r) => !allAssignedReceiptIds.has(r.id));

          if (unmappedReceipts.length > 0) {
            const groupedByClient = new Map<string, Receipt[]>();
            unmappedReceipts.forEach((r) => {
              const cId = generateClientId(r.clientName, r.clientPhone);
              if (!groupedByClient.has(cId)) groupedByClient.set(cId, []);
              groupedByClient.get(cId)!.push(r);
            });

            for (const [cId, recList] of groupedByClient.entries()) {
              const sample = recList[0];

              // Check if a client document already exists for this person (by ID, contact match, or receipt match)
              const existing = clients.find(
                (c) =>
                  c.id === cId ||
                  isReceiptForClient(c, sample) ||
                  matchContacts(c.phone, sample.clientPhone)
              );

              if (existing) {
                // Safely link unmapped receipts to the verified existing client
                const existingRecIds = new Set(existing.receiptIds || []);
                recList.forEach((r) => existingRecIds.add(r.id));
                const addedSpent = recList.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
                await setDoc(
                  doc(db, "clients", existing.id),
                  {
                    receiptIds: Array.from(existingRecIds),
                    purchaseCount: (existing.purchaseCount || 0) + recList.length,
                    totalSpent: (existing.totalSpent || 0) + addedSpent,
                  },
                  { merge: true }
                );
                for (const r of recList) {
                  if (r.clientId !== existing.id) {
                    await setDoc(doc(db, "receipts", r.id), { clientId: existing.id }, { merge: true });
                  }
                }
                continue;
              }

              while (usedCodes.has(currentAutoId)) {
                currentAutoId++;
              }
              const assignedCode = String(currentAutoId).padStart(4, "0");
              usedCodes.add(currentAutoId);

              const sortedRecs = [...recList].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
              );
              const totalSpent = recList.reduce((sum, r) => sum + (r.totalCharged || 0), 0);

              const newClientDoc: Client = {
                id: cId,
                clientCode: assignedCode,
                name: sample.clientName.trim(),
                phone: sample.clientPhone.trim(),
                purchaseCount: recList.length,
                totalSpent,
                lastPurchaseDate: sortedRecs[0].date,
                receiptIds: recList.map((r) => r.id),
                createdAt: sortedRecs[sortedRecs.length - 1].date,
                tag: "Nuevo",
              };

              try {
                await setDoc(doc(db, "clients", cId), cleanForFirestore(newClientDoc));
              } catch (err) {
                console.warn("Failed to auto-create client for unmapped receipts:", err);
              }
            }
          }
        }

        lastSyncFingerprintRef.current = currentFingerprint;
      } finally {
        isSyncingRef.current = false;
      }
    };

    const timeoutId = setTimeout(() => {
      syncClientStats();
    }, 1200);

    return () => clearTimeout(timeoutId);
  }, [user, loadingData, receipts.length, clients.length]);

  // Auth Operations
  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      // If it's a first time launch, let's automatically check if there are no registered users in authentication,
      // and if the credentials are the default ones, create the account. This is a robust fallback for sandboxed runtimes.
      if (
        (email === "admin@impulsanet.com" && password === "impulsa2026") ||
        (email === "sergioruizv04@gmail.com" && password === "sergio11")
      ) {
        const { createUserWithEmailAndPassword } = await import("firebase/auth");
        try {
          await createUserWithEmailAndPassword(auth, email, password);
          return;
        } catch (createErr) {
          // If creation fails (e.g. user already exists but password was changed), throw original error
          throw error;
        }
      }
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  // Settings Operations
  const updateBusinessConfig = async (config: Partial<BusinessConfig>) => {
    const configRef = doc(db, "config", "business");
    await setDoc(configRef, config, { merge: true });
  };

  // Social Networks Operations
  const addSocialNetwork = async (sn: SocialNetwork) => {
    await setDoc(doc(db, "social_networks", sn.id), {
      name: sn.name,
      icon: sn.icon
    });
  };

  const updateSocialNetwork = async (sn: SocialNetwork) => {
    await setDoc(doc(db, "social_networks", sn.id), {
      name: sn.name,
      icon: sn.icon
    }, { merge: true });
  };

  const deleteSocialNetwork = async (id: string) => {
    // Delete social network doc
    await deleteDoc(doc(db, "social_networks", id));
    
    // Also delete associated services
    const associatedServices = services.filter((s) => s.socialNetworkId === id);
    for (const s of associatedServices) {
      await deleteService(s.id);
    }
  };

  // Services Operations
  const addService = async (service: Service) => {
    const sDoc: Record<string, any> = {
      socialNetworkId: service.socialNetworkId,
      name: service.name,
      providerCostPer1000: service.providerCostPer1000 ?? 1810,
      suggestedPricePer1000: service.suggestedPricePer1000 ?? 15000,
      customPresets: service.customPresets || [1000, 2000, 5000, 10000],
      quantities: service.quantities || []
    };
    if (service.providerCostUSDPer1000 !== undefined && service.providerCostUSDPer1000 !== null && !isNaN(service.providerCostUSDPer1000)) {
      sDoc.providerCostUSDPer1000 = service.providerCostUSDPer1000;
    }
    await setDoc(doc(db, "services", service.id), sDoc, { merge: true });
  };

  const updateService = async (service: Service) => {
    const sDoc: Record<string, any> = {
      socialNetworkId: service.socialNetworkId,
      name: service.name,
      providerCostPer1000: service.providerCostPer1000 ?? 1810,
      suggestedPricePer1000: service.suggestedPricePer1000 ?? 15000,
      customPresets: service.customPresets || [1000, 2000, 5000, 10000],
      quantities: service.quantities || []
    };
    if (service.providerCostUSDPer1000 !== undefined && service.providerCostUSDPer1000 !== null && !isNaN(service.providerCostUSDPer1000)) {
      sDoc.providerCostUSDPer1000 = service.providerCostUSDPer1000;
    } else {
      sDoc.providerCostUSDPer1000 = null;
    }
    await setDoc(doc(db, "services", service.id), sDoc, { merge: true });
  };

  const deleteService = async (id: string) => {
    await deleteDoc(doc(db, "services", id));
  };

  // Combos Operations
  const addCombo = async (combo: ServiceCombo) => {
    const cDoc = cleanForFirestore({
      name: combo.name,
      description: combo.description || "",
      socialNetworkId: combo.socialNetworkId || "general",
      comboPrice: Number(combo.comboPrice) || 0,
      items: combo.items || [],
      active: combo.active !== false,
      updatedAt: new Date().toISOString()
    });
    await setDoc(doc(db, "combos", combo.id), cDoc, { merge: true });
  };

  const updateCombo = async (combo: ServiceCombo) => {
    const cDoc = cleanForFirestore({
      name: combo.name,
      description: combo.description || "",
      socialNetworkId: combo.socialNetworkId || "general",
      comboPrice: Number(combo.comboPrice) || 0,
      items: combo.items || [],
      active: combo.active !== false,
      updatedAt: new Date().toISOString()
    });
    await setDoc(doc(db, "combos", combo.id), cDoc, { merge: true });
  };

  const deleteCombo = async (id: string) => {
    await deleteDoc(doc(db, "combos", id));
  };

  // Receipt & Client Generation
  const createReceipt = async (
    receiptData: Omit<Receipt, "id" | "consecutive"> & { clientId?: string; forceNewClient?: boolean }
  ) => {
    // Calculate consecutive number: safely filter out invalid/NaN consecutives in existing receipts
    const validConsecutives = receipts
      .map((r) => Number(r.consecutive))
      .filter((num) => !isNaN(num) && isFinite(num));

    const nextConsecutive = validConsecutives.length > 0 
      ? Math.max(...validConsecutives) + 1 
      : 1001;

    // Find if client already exists in our client list or by exact ID / contact match
    let targetClientId = receiptData.clientId;
    let existingClient: Client | undefined;

    if (!receiptData.forceNewClient) {
      if (targetClientId) {
        existingClient = clients.find((c) => c.id === targetClientId);
      } else {
        const normInput = normalizeContact(receiptData.clientPhone);
        if (normInput.type !== "none") {
          existingClient = clients.find((c) => {
            const normC = normalizeContact(c.phone);
            if (normC.type === normInput.type) {
              if (normInput.type === "handle") return normC.key === normInput.key;
              if (normInput.type === "phone") {
                if (matchPhones(c.phone, receiptData.clientPhone)) {
                  // Ensure name isn't completely distinct person on shared phone
                  const cClean = (c.name || "").trim().toLowerCase();
                  const rClean = (receiptData.clientName || "").trim().toLowerCase();
                  if (cClean && rClean && cClean !== "cliente" && rClean !== "cliente") {
                    const cWords = cClean.split(/\s+/).filter((w) => w.length >= 3);
                    const rWords = rClean.split(/\s+/).filter((w) => w.length >= 3);
                    if (cWords.length > 0 && rWords.length > 0) {
                      return cWords.some((cw) => rWords.some((rw) => cw === rw || cw.includes(rw) || rw.includes(cw)));
                    }
                  }
                  return true;
                }
              }
            }
            return false;
          });
        }
      }
    }

    // Determine final clientId:
    // If existingClient found: reuse its verified document ID
    // If new client: force a unique ID so it never overwrites another client
    const clientId = existingClient 
      ? existingClient.id 
      : generateClientId(receiptData.clientName, receiptData.clientPhone, true);

    const clientRef = doc(db, "clients", clientId);

    // Create receipt document reference with auto ID and linked clientId
    const receiptsRef = collection(db, "receipts");
    
    const finalReceipt: Omit<Receipt, "id"> = {
      ...receiptData,
      clientId,
      consecutive: nextConsecutive
    };

    const sanitizedReceipt = cleanForFirestore(finalReceipt);
    const docRef = await addDoc(receiptsRef, sanitizedReceipt);
    const receiptId = docRef.id;

    if (existingClient) {
      let existingCode = existingClient.clientCode;
      if (!existingCode) {
        const existingCodes = clients
          .map((c) => parseInt(c.clientCode || "0", 10))
          .filter((n) => !isNaN(n) && n > 0);
        const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
        existingCode = String(maxCode + 1).padStart(4, "0");
      }

      const newTotal = (existingClient.totalSpent || 0) + receiptData.totalCharged;
      const targetTag = getClientTagForSpending(newTotal);

      await setDoc(clientRef, cleanForFirestore({
        ...existingClient,
        clientCode: existingCode,
        purchaseCount: (existingClient.purchaseCount || 0) + 1,
        totalSpent: newTotal,
        lastPurchaseDate: receiptData.date,
        tag: targetTag,
        receiptIds: [...(existingClient.receiptIds || []).filter((rId) => rId !== receiptId), receiptId]
      }));
    } else {
      const existingCodes = clients
        .map((c) => parseInt(c.clientCode || "0", 10))
        .filter((n) => !isNaN(n) && n > 0);
      const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
      const newCode = String(maxCode + 1).padStart(4, "0");

      const targetTag = getClientTagForSpending(receiptData.totalCharged);

      const newClient: Client = {
        id: clientId,
        clientCode: newCode,
        name: receiptData.clientName.trim(),
        phone: receiptData.clientPhone.trim(),
        purchaseCount: 1,
        totalSpent: receiptData.totalCharged,
        lastPurchaseDate: receiptData.date,
        receiptIds: [receiptId],
        createdAt: receiptData.date,
        tag: targetTag,
      };
      await setDoc(clientRef, cleanForFirestore(newClient));
    }

    return {
      ...finalReceipt,
      id: receiptId
    };
  };

  /**
   * Separates a mistakenly merged receipt into its own brand new independent client document.
   */
  const separateReceiptToNewClient = async (
    receiptId: string,
    fromClientId?: string,
    newClientName?: string,
    newClientPhone?: string
  ): Promise<string> => {
    const targetReceipt = receipts.find((r) => r.id === receiptId);
    if (!targetReceipt) throw new Error("Recibo no encontrado");

    const clientName = (newClientName || targetReceipt.clientName || "Cliente").trim();
    const clientPhone = (newClientPhone || targetReceipt.clientPhone || "").trim();
    const newClientId = generateClientId(clientName, clientPhone, true);

    const existingCodes = clients
      .map((c) => parseInt(c.clientCode || "0", 10))
      .filter((n) => !isNaN(n) && n > 0);
    const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    const newCode = String(maxCode + 1).padStart(4, "0");

    const newClientDoc: Client = {
      id: newClientId,
      clientCode: newCode,
      name: clientName,
      phone: clientPhone,
      purchaseCount: 1,
      totalSpent: targetReceipt.totalCharged || 0,
      lastPurchaseDate: targetReceipt.date,
      receiptIds: [targetReceipt.id],
      createdAt: targetReceipt.date,
      tag: "Nuevo",
    };

    await setDoc(doc(db, "clients", newClientId), cleanForFirestore(newClientDoc));

    await setDoc(doc(db, "receipts", targetReceipt.id), {
      clientId: newClientId,
      clientName: clientName,
      clientPhone: clientPhone,
    }, { merge: true });

    const prevClients = clients.filter(
      (c) => (fromClientId && c.id === fromClientId) || (c.receiptIds && c.receiptIds.includes(receiptId))
    );

    for (const prev of prevClients) {
      if (prev.id === newClientId) continue;
      const remainingReceiptIds = (prev.receiptIds || []).filter((id) => id !== receiptId);
      const remainingReceipts = receipts.filter((r) => r.id !== receiptId && remainingReceiptIds.includes(r.id));
      const newPurchaseCount = remainingReceipts.length;
      const newTotalSpent = remainingReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
      const sortedRecs = [...remainingReceipts].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const newLastDate = sortedRecs.length > 0 ? sortedRecs[0].date : prev.lastPurchaseDate;

      await setDoc(doc(db, "clients", prev.id), cleanForFirestore({
        receiptIds: remainingReceiptIds,
        purchaseCount: newPurchaseCount,
        totalSpent: newTotalSpent,
        lastPurchaseDate: newLastDate,
      }), { merge: true });
    }

    return newClientId;
  };

  const updateClient = async (clientId: string, updates: Partial<Client>) => {
    const clientRef = doc(db, "clients", clientId);
    await setDoc(clientRef, cleanForFirestore(updates), { merge: true });

    const cleanName = updates.name !== undefined ? updates.name.trim() : undefined;
    const cleanPhone = updates.phone !== undefined ? updates.phone.trim() : undefined;

    // If name or phone was updated, propagate to all associated receipts in Firestore so that HistoryView and Invoices stay 100% in sync
    if (cleanName !== undefined || cleanPhone !== undefined) {
      const currentClient = clients.find((c) => c.id === clientId);

      // Find all receipts belonging to this client
      const matchingReceipts = receipts.filter((r) => {
        if (r.clientId && r.clientId === clientId) return true;
        if (currentClient?.receiptIds && currentClient.receiptIds.includes(r.id)) return true;
        if (currentClient && isReceiptForClient(currentClient, r)) return true;
        return false;
      });

      if (matchingReceipts.length > 0) {
        const updatePromises = matchingReceipts.map(async (r) => {
          const receiptDocRef = doc(db, "receipts", r.id);
          const patch: Partial<Receipt> = {
            clientId: clientId,
          };
          if (cleanName !== undefined) {
            patch.clientName = cleanName;
          }
          if (cleanPhone !== undefined) {
            patch.clientPhone = cleanPhone;
          }
          await setDoc(receiptDocRef, cleanForFirestore(patch), { merge: true });
        });

        // Ensure all associated receipt IDs are saved in the client's receiptIds array
        const allReceiptIds = Array.from(
          new Set([...(currentClient?.receiptIds || []), ...matchingReceipts.map((r) => r.id)])
        );
        updatePromises.push(setDoc(clientRef, { receiptIds: allReceiptIds }, { merge: true }));

        await Promise.all(updatePromises);
      }
    }
  };

  /**
   * Reassigns or manually sets a client's 4-digit code, checking for uniqueness and updating Firestore.
   */
  const reassignClientCode = async (clientId: string, customCode?: string): Promise<string> => {
    let finalCode = "";
    if (customCode && customCode.trim()) {
      const normalized = customCode.trim().replace(/\D/g, "").padStart(4, "0");
      if (normalized.length !== 4) {
        throw new Error("El código de cliente debe contener 4 dígitos numéricos (ej. 0083)");
      }
      const conflict = clients.find(
        (c) => c.id !== clientId && c.clientCode?.trim().padStart(4, "0") === normalized
      );
      if (conflict) {
        throw new Error(`El código #${normalized} ya está asignado al cliente "${conflict.name}".`);
      }
      finalCode = normalized;
    } else {
      const usedCodes = new Set<number>(
        clients
          .filter((c) => c.id !== clientId && c.clientCode)
          .map((c) => parseInt(c.clientCode!, 10))
          .filter((n) => !isNaN(n) && n > 0)
      );
      let nextId = 1;
      while (usedCodes.has(nextId)) {
        nextId++;
      }
      finalCode = String(nextId).padStart(4, "0");
    }

    const clientRef = doc(db, "clients", clientId);
    await setDoc(clientRef, { clientCode: finalCode }, { merge: true });
    return finalCode;
  };

  /**
   * Automatically detects and merges duplicate client documents sharing the same phone,
   * WhatsApp number, or social handle into a single authoritative client document.
   * Merges receipt history, updates all receipts in Firestore, and safely removes ghost duplicate documents.
   */
  const mergeDuplicateClients = async (): Promise<{ mergedGroupsCount: number; deletedDocsCount: number; details: string[] }> => {
    const contactGroups = new Map<string, Client[]>();
    clients.forEach((c) => {
      const norm = normalizeContact(c.phone);
      if (norm.type !== "none") {
        const key = `${norm.type}:${norm.key}`;
        if (!contactGroups.has(key)) contactGroups.set(key, []);
        contactGroups.get(key)!.push(c);
      }
    });

    let mergedGroupsCount = 0;
    let deletedDocsCount = 0;
    const details: string[] = [];

    const receiptsByClientId = new Map<string, Receipt[]>();
    receipts.forEach((r) => {
      if (r.clientId) {
        if (!receiptsByClientId.has(r.clientId)) receiptsByClientId.set(r.clientId, []);
        receiptsByClientId.get(r.clientId)!.push(r);
      }
    });

    for (const [key, group] of contactGroups.entries()) {
      if (group.length <= 1) continue;

      mergedGroupsCount++;

      // Sort to determine keeper:
      // 1. Linked by r.clientId in receipts
      // 2. Has receiptIds in stored array
      // 3. Lowest assigned clientCode
      // 4. Shorter doc ID
      const sorted = [...group].sort((a, b) => {
        const recsA = (receiptsByClientId.get(a.id) || []).length;
        const recsB = (receiptsByClientId.get(b.id) || []).length;
        if (recsB !== recsA) return recsB - recsA;

        const storedA = (a.receiptIds || []).length;
        const storedB = (b.receiptIds || []).length;
        if (storedB !== storedA) return storedB - storedA;

        const codeA = parseInt(a.clientCode || "9999", 10);
        const codeB = parseInt(b.clientCode || "9999", 10);
        if (codeA !== codeB) return codeA - codeB;

        return a.id.length - b.id.length;
      });

      const keeper = sorted[0];
      const duplicates = sorted.slice(1);

      // Preserve lowest / earliest assigned clientCode
      const allCodes = [keeper, ...duplicates]
        .map((c) => parseInt(c.clientCode || "9999", 10))
        .filter((n) => !isNaN(n) && n > 0);
      const bestCodeNum = allCodes.length > 0 ? Math.min(...allCodes) : 9999;
      const finalCode = bestCodeNum < 9999 ? String(bestCodeNum).padStart(4, "0") : (keeper.clientCode || "0001");

      const combinedReceiptIds = new Set<string>(keeper.receiptIds || []);
      duplicates.forEach((d) => {
        (d.receiptIds || []).forEach((rid) => combinedReceiptIds.add(rid));
      });

      receipts.forEach((r) => {
        if (r.clientId === keeper.id || duplicates.some((d) => d.id === r.clientId)) {
          combinedReceiptIds.add(r.id);
        }
      });

      const allPersonReceipts = receipts.filter((r) => combinedReceiptIds.has(r.id));
      const totalSpent = allPersonReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
      const purchaseCount = allPersonReceipts.length;

      const sortedRecs = [...allPersonReceipts].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const lastPurchaseDate = sortedRecs.length > 0 ? sortedRecs[0].date : (keeper.lastPurchaseDate || "");

      // 1. Update any receipts referencing duplicate doc IDs
      for (const d of duplicates) {
        const referencingReceipts = receipts.filter((r) => r.clientId === d.id);
        for (const r of referencingReceipts) {
          await setDoc(doc(db, "receipts", r.id), { clientId: keeper.id }, { merge: true });
        }
      }

      // 2. Update keeper document with consolidated stats
      await setDoc(doc(db, "clients", keeper.id), cleanForFirestore({
        receiptIds: Array.from(combinedReceiptIds),
        purchaseCount,
        totalSpent,
        lastPurchaseDate,
        name: keeper.name || duplicates[0].name,
        phone: keeper.phone || duplicates[0].phone,
        clientCode: finalCode
      }), { merge: true });

      // 3. Delete duplicate client documents
      for (const d of duplicates) {
        await deleteDoc(doc(db, "clients", d.id));
        deletedDocsCount++;
        details.push(`Cliente duplicado "${d.name}" (${d.id}) unificado en #${finalCode} "${keeper.name}" (${keeper.id})`);
      }
    }

    return { mergedGroupsCount, deletedDocsCount, details };
  };

  /**
   * Automatically resolves all duplicate client codes across the database in one pass.
   */
  const resolveDuplicateClientCodes = async (): Promise<{ resolvedCount: number; details: string[] }> => {
    // Step 1: Merge any duplicate client records of the same person first
    const mergeRes = await mergeDuplicateClients();
    const details: string[] = [...mergeRes.details];

    const codeGroups = new Map<string, Client[]>();
    clients.forEach((c) => {
      const code = (c.clientCode || "").trim().padStart(4, "0");
      if (code && code !== "0000") {
        if (!codeGroups.has(code)) codeGroups.set(code, []);
        codeGroups.get(code)!.push(c);
      }
    });

    const usedCodes = new Set<number>(
      clients
        .map((c) => parseInt(c.clientCode || "0", 10))
        .filter((n) => !isNaN(n) && n > 0)
    );

    let nextAvailable = 1;
    let resolvedCount = mergeRes.deletedDocsCount;

    for (const [code, group] of codeGroups.entries()) {
      if (group.length > 1) {
        const sorted = [...group].sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (dateA !== dateB) return dateA - dateB;
          return (b.purchaseCount || 0) - (a.purchaseCount || 0);
        });

        const keeper = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          const dup = sorted[i];
          while (usedCodes.has(nextAvailable)) {
            nextAvailable++;
          }
          const newCode = String(nextAvailable).padStart(4, "0");
          usedCodes.add(nextAvailable);

          await setDoc(doc(db, "clients", dup.id), { clientCode: newCode }, { merge: true });
          resolvedCount++;
          details.push(`Cliente "${dup.name}" reasignado de #${code} a nuevo ID #${newCode} (se mantuvo #${code} para "${keeper.name}")`);
        }
      }
    }

    return { resolvedCount, details };
  };

  const deleteReceipt = async (id: string) => {
    // 1. Get receipt details
    const receiptDocRef = doc(db, "receipts", id);
    const receiptSnap = await getDoc(receiptDocRef);
    if (!receiptSnap.exists()) {
      // Just in case, try deleting and return
      await deleteDoc(receiptDocRef);
      return;
    }
    const receiptData = receiptSnap.data() as Receipt;

    // 2. Find the client document (by receipt.clientId or fallback receiptIds)
    const matchingClient = clients.find((c) => c.id === receiptData.clientId || (c.receiptIds && c.receiptIds.includes(id)));
    const clientId = matchingClient ? matchingClient.id : generateClientId(receiptData.clientName, receiptData.clientPhone);
    const clientRef = doc(db, "clients", clientId);
    const clientSnap = await getDoc(clientRef);

    if (clientSnap.exists()) {
      const clientData = clientSnap.data() as Client;
      
      // Filter out this receipt ID from client's receiptIds
      const updatedReceiptIds = (clientData.receiptIds || []).filter((rId) => rId !== id);
      const newPurchaseCount = Math.max(0, (clientData.purchaseCount || 1) - 1);
      
      if (updatedReceiptIds.length === 0 || newPurchaseCount <= 0 || (clientData.purchaseCount || 1) <= 1) {
        // Delete the client if no receipts are left or purchase count becomes 0
        await deleteDoc(clientRef);
      } else {
        // Otherwise, update client purchaseCount, totalSpent, and receiptIds
        const newTotalSpent = Math.max(0, (clientData.totalSpent || 0) - (receiptData.totalCharged || 0));
        
        // Find new lastPurchaseDate by looking up the remaining receipts of this client
        let lastPurchaseDate = clientData.lastPurchaseDate;
        const remainingClientReceipts = receipts.filter((r) => r.id !== id && isReceiptForClient(clientData, r));
        if (remainingClientReceipts.length > 0) {
          remainingClientReceipts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          lastPurchaseDate = remainingClientReceipts[0].date;
        }

        await setDoc(clientRef, {
          ...clientData,
          purchaseCount: newPurchaseCount,
          totalSpent: newTotalSpent,
          receiptIds: updatedReceiptIds,
          lastPurchaseDate: lastPurchaseDate
        });
      }
    }

    // 3. Delete the receipt
    await deleteDoc(receiptDocRef);
  };

  const updateReceipt = async (id: string, updatedData: Partial<Receipt>) => {
    // 1. Get the current receipt before update
    const receiptDocRef = doc(db, "receipts", id);
    const receiptSnap = await getDoc(receiptDocRef);
    if (!receiptSnap.exists()) {
      await setDoc(receiptDocRef, cleanForFirestore(updatedData), { merge: true });
      return;
    }
    const oldReceipt = receiptSnap.data() as Receipt;

    // 2. Perform the update on the receipt
    await setDoc(receiptDocRef, cleanForFirestore(updatedData), { merge: true });

    // 3. Find the client associated with this receipt
    const linkedClient = clients.find((c) =>
      (oldReceipt.clientId && c.id === oldReceipt.clientId) ||
      (c.receiptIds && c.receiptIds.includes(id)) ||
      isReceiptForClient(c, oldReceipt)
    );

    const cleanNewName = updatedData.clientName !== undefined ? updatedData.clientName.trim() : undefined;
    const cleanNewPhone = updatedData.clientPhone !== undefined ? updatedData.clientPhone.trim() : undefined;
    const oldTotalCharged = oldReceipt.totalCharged || 0;
    const newTotalCharged = updatedData.totalCharged !== undefined ? updatedData.totalCharged : oldTotalCharged;
    const totalDiff = newTotalCharged - oldTotalCharged;

    if (linkedClient) {
      const clientRef = doc(db, "clients", linkedClient.id);
      const clientPatch: Partial<Client> = {};

      if (cleanNewName !== undefined && cleanNewName !== "") {
        clientPatch.name = cleanNewName;
      }
      if (cleanNewPhone !== undefined && cleanNewPhone !== "") {
        clientPatch.phone = cleanNewPhone;
      }
      if (totalDiff !== 0) {
        clientPatch.totalSpent = Math.max(0, (linkedClient.totalSpent || 0) + totalDiff);
      }
      if (updatedData.date || oldReceipt.date) {
        clientPatch.lastPurchaseDate = updatedData.date || oldReceipt.date;
      }
      // Ensure this receipt ID is tracked in client's receiptIds
      const clientReceiptIds = Array.from(new Set([...(linkedClient.receiptIds || []), id]));
      clientPatch.receiptIds = clientReceiptIds;

      await setDoc(clientRef, cleanForFirestore(clientPatch), { merge: true });

      // Also ensure receipt document explicitly stores clientId foreign key
      await setDoc(receiptDocRef, { clientId: linkedClient.id }, { merge: true });

      // If name or phone changed, also propagate to any other receipts of this client
      if (cleanNewName !== undefined || cleanNewPhone !== undefined) {
        const otherReceipts = receipts.filter(
          (r) =>
            r.id !== id &&
            (r.clientId === linkedClient.id ||
              (linkedClient.receiptIds && linkedClient.receiptIds.includes(r.id)) ||
              isReceiptForClient(linkedClient, r))
        );

        if (otherReceipts.length > 0) {
          await Promise.all(
            otherReceipts.map(async (other) => {
              const otherPatch: Partial<Receipt> = { clientId: linkedClient.id };
              if (cleanNewName !== undefined) otherPatch.clientName = cleanNewName;
              if (cleanNewPhone !== undefined) otherPatch.clientPhone = cleanNewPhone;
              await setDoc(doc(db, "receipts", other.id), cleanForFirestore(otherPatch), { merge: true });
            })
          );
        }
      }
    } else {
      // Receipt has no matching client yet; create one and link it
      const targetName = (cleanNewName !== undefined ? cleanNewName : oldReceipt.clientName || "").trim();
      const targetPhone = (cleanNewPhone !== undefined ? cleanNewPhone : oldReceipt.clientPhone || "").trim();
      const targetClientId = generateClientId(targetName, targetPhone);
      const newClientRef = doc(db, "clients", targetClientId);
      const newClientSnap = await getDoc(newClientRef);
      const finalDate = updatedData.date || oldReceipt.date || new Date().toISOString();

      if (newClientSnap.exists()) {
        const existingData = newClientSnap.data() as Client;
        await setDoc(newClientRef, {
          name: targetName,
          phone: targetPhone,
          totalSpent: Math.max(0, (existingData.totalSpent || 0) + newTotalCharged),
          purchaseCount: (existingData.purchaseCount || 0) + 1,
          lastPurchaseDate: finalDate,
          receiptIds: Array.from(new Set([...(existingData.receiptIds || []), id])),
        }, { merge: true });
      } else {
        const existingCodes = clients
          .map((c) => parseInt(c.clientCode || "0", 10))
          .filter((n) => !isNaN(n) && n > 0);
        const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
        const newCode = String(maxCode + 1).padStart(4, "0");

        const newClient: Client = {
          id: targetClientId,
          clientCode: newCode,
          name: targetName,
          phone: targetPhone,
          purchaseCount: 1,
          totalSpent: newTotalCharged,
          lastPurchaseDate: finalDate,
          receiptIds: [id],
          createdAt: finalDate,
          tag: "Nuevo",
        };
        await setDoc(newClientRef, cleanForFirestore(newClient));
      }
      await setDoc(receiptDocRef, { clientId: targetClientId }, { merge: true });
    }
  };

  const updateClientTag = async (clientId: string, tag: string) => {
    const clientRef = doc(db, "clients", clientId);
    await setDoc(clientRef, { tag }, { merge: true });
  };

  const markAllInProcessAsCompleted = async (): Promise<{ updatedCount: number }> => {
    let count = 0;
    try {
      const snap = await getDocs(collection(db, "receipts"));
      const updates: Promise<void>[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Receipt;
        const norm = getNormalizedStatus(data.status);
        if (norm === "en_proceso") {
          count++;
          updates.push(setDoc(doc(db, "receipts", docSnap.id), { status: "completado" }, { merge: true }));
        }
      });
      await Promise.all(updates);
    } catch (e) {
      console.error("Error bulk updating in-process receipts to completed:", e);
    }
    return { updatedCount: count };
  };

  const restoreDefaults = async () => {
    // Re-initialize default social networks
    const socialQuery = await getDocs(collection(db, "social_networks"));
    for (const sDoc of socialQuery.docs) {
      await deleteDoc(doc(db, "social_networks", sDoc.id));
    }
    for (const sn of DEFAULT_SOCIAL_NETWORKS) {
      await setDoc(doc(db, "social_networks", sn.id), {
        name: sn.name,
        icon: sn.icon
      });
    }

    // Re-initialize default services
    const servicesQuery = await getDocs(collection(db, "services"));
    for (const sDoc of servicesQuery.docs) {
      await deleteDoc(doc(db, "services", sDoc.id));
    }
    for (const srv of DEFAULT_SERVICES) {
      await setDoc(doc(db, "services", srv.id), {
        socialNetworkId: srv.socialNetworkId,
        name: srv.name,
        providerCostPer1000: srv.providerCostPer1000,
        suggestedPricePer1000: srv.suggestedPricePer1000,
        customPresets: srv.customPresets || [1000, 2000, 5000, 10000],
        quantities: srv.quantities || []
      });
    }

    // Re-initialize default combos
    const combosQuery = await getDocs(collection(db, "combos"));
    for (const cDoc of combosQuery.docs) {
      await deleteDoc(doc(db, "combos", cDoc.id));
    }
    for (const combo of DEFAULT_COMBOS) {
      await setDoc(doc(db, "combos", combo.id), cleanForFirestore(combo));
    }

    // Reset config
    const configRef = doc(db, "config", "business");
    const initialConfig = { ...DEFAULT_BUSINESS_CONFIG, facebookSeeded: true };
    await setDoc(configRef, initialConfig);
    setBusinessConfig(initialConfig);
  };

  // Supplier Warranties CRUD
  const addSupplierWarranty = async (record: Omit<SupplierWarrantyRecord, "id" | "createdAt">) => {
    const colRef = collection(db, "supplier_warranties");
    const cleanDoc: Record<string, any> = {};
    Object.entries(record).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanDoc[key] = value;
      }
    });
    const newDoc = {
      ...cleanDoc,
      createdAt: new Date().toISOString()
    };
    await addDoc(colRef, newDoc);
  };

  const updateSupplierWarranty = async (id: string, updates: Partial<SupplierWarrantyRecord>) => {
    const docRef = doc(db, "supplier_warranties", id);
    const cleanDoc: Record<string, any> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanDoc[key] = value;
      }
    });
    await setDoc(docRef, cleanDoc, { merge: true });
  };

  const deleteSupplierWarranty = async (id: string) => {
    const docRef = doc(db, "supplier_warranties", id);
    await deleteDoc(docRef);
  };

  const resolveSupplierWarranty = async (id: string, notes?: string) => {
    const docRef = doc(db, "supplier_warranties", id);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as SupplierWarrantyRecord;
        if (data.receiptId) {
          try {
            await setDoc(doc(db, "receipts", data.receiptId), { status: "completado" }, { merge: true });
          } catch (recErr) {
            console.warn("Could not update receipt on resolve warranty:", recErr);
          }
        }
      }
    } catch (err) {
      console.warn("Error getting supplier warranty record before resolve:", err);
    }

    // Persist as resolved in background database history
    const updateData: Record<string, any> = {
      status: "resuelto",
      resolvedDate: new Date().toISOString()
    };
    if (notes) {
      updateData.supplierNotes = notes;
    }
    await setDoc(docRef, updateData, { merge: true });
  };

  const resolveAllWarrantiesInProcess = async () => {
    let updatedReceiptsCount = 0;
    let resolvedWarrantiesCount = 0;

    // 1. Resolve warranty receipts
    const warrantyReceipts = receipts.filter(
      (r) => getNormalizedStatus(r.status) === "garantia_en_proceso"
    );
    for (const r of warrantyReceipts) {
      try {
        await setDoc(doc(db, "receipts", r.id), { status: "completado" }, { merge: true });
        updatedReceiptsCount++;
      } catch (err) {
        console.error("Error completing warranty receipt:", r.id, err);
      }
    }

    // 2. Resolve active supplier warranty records in background
    const activeWarranties = supplierWarranties.filter(
      (w) => w.status === "en_espera" || w.status === "reclamado_nuevamente"
    );
    for (const w of activeWarranties) {
      try {
        await setDoc(doc(db, "supplier_warranties", w.id), {
          status: "resuelto",
          resolvedDate: new Date().toISOString()
        }, { merge: true });
        resolvedWarrantiesCount++;
      } catch (err) {
        console.error("Error resolving warranty record:", w.id, err);
      }
    }

    return { updatedReceiptsCount, resolvedWarrantiesCount };
  };

  const claimAgainSupplierWarranty = async (id: string, notes?: string) => {
    const docRef = doc(db, "supplier_warranties", id);
    const snap = await getDoc(docRef);
    const prevClaimCount = snap.exists() ? ((snap.data() as SupplierWarrantyRecord).claimedAgainCount || 0) : 0;
    
    const updateData: Record<string, any> = {
      status: "reclamado_nuevamente",
      sentDate: new Date().toISOString(), // Reset timer to now
      claimedAgainCount: prevClaimCount + 1
    };
    if (notes) {
      updateData.supplierNotes = notes;
    }
    await setDoc(docRef, updateData, { merge: true });
  };

  /**
   * Reabre o reenvía una garantía de un pedido cancelado, asociando todo el historial del
   * comprobante original (consecutivo, servicios, clientes, IDs anteriores del proveedor)
   * con una nueva solicitud de garantía en supplierWarranties, preservando la trazabilidad
   * y actualizando las notas y estado del comprobante.
   */
  const reopenOrResendWarrantyForCancelledOrder = async (
    params: ReopenWarrantyParams
  ): Promise<SupplierWarrantyRecord> => {
    const {
      receiptId,
      newProviderOrderId,
      reason,
      expectedResponseHours = 48,
      previousWarrantyId,
      customNotes,
      reactivateOrderToInProcess = true
    } = params;

    const receipt = receipts.find((r) => r.id === receiptId);
    if (!receipt) {
      throw new Error(`No se encontró el comprobante con ID: ${receiptId}`);
    }

    const allOldIds = (receipt.services || []).flatMap((s) => getItemOrderIds(s));
    const previousIdsStr = allOldIds.join(", ") || (receipt.consecutive ? `PED-${receipt.consecutive}` : "");
    const targetProviderId = (newProviderOrderId && newProviderOrderId.trim())
      ? newProviderOrderId.trim()
      : previousIdsStr;
    const cleanIdsList = targetProviderId.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

    // Resolve client
    const client = clients.find(
      (c) =>
        c.id === receipt.clientId ||
        c.receiptIds?.includes(receipt.id) ||
        (receipt.clientPhone && matchContacts(c.phone, receipt.clientPhone))
    );
    const clientCode = client ? getClientCode(client) : undefined;

    // Service label and quantity
    const sLabel = receipt.services && receipt.services[0]
      ? `${receipt.services[0].socialNetworkName} - ${receipt.services[0].serviceName}`
      : "Servicio General";
    const quantity = receipt.services && receipt.services[0] ? receipt.services[0].quantity : undefined;

    const nowIso = new Date().toISOString();
    const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

    // Build complete traceability timeline entry
    const traceEntry = [
      `[${nowFormatted}] 🔄 GARANTÍA REABIERTA / REENVIADA`,
      `• Pedido Original: Factura #${receipt.consecutive} (${receipt.clientName})`,
      `• ID(s) Originales Proveedor: ${previousIdsStr || "Sin ID previo"}`,
      `• Nuevo ID de Orden Proveedor: ${targetProviderId}`,
      `• Motivo: ${reason}`,
      customNotes ? `• Detalle Adicional: ${customNotes}` : null,
      `• Plazo de Respuesta: ${expectedResponseHours}h`
    ].filter(Boolean).join("\n");

    // Create the new warranty record linked to the original receipt
    const colRef = collection(db, "supplier_warranties");
    const newWarrantyPayload: Record<string, any> = {
      providerOrderId: targetProviderId,
      providerOrderIds: cleanIdsList.length > 0 ? cleanIdsList : [targetProviderId],
      receiptId: receipt.id,
      receiptConsecutive: receipt.consecutive,
      clientId: receipt.clientId || client?.id,
      clientCode,
      clientName: receipt.clientName,
      clientPhone: receipt.clientPhone,
      serviceName: sLabel,
      quantity,
      sentDate: nowIso,
      expectedResponseHours,
      status: "en_espera",
      reason: reason.trim(),
      isReopenedFromCancelled: true,
      originalReceiptConsecutive: receipt.consecutive,
      originalReceiptId: receipt.id,
      previousProviderOrderId: previousIdsStr,
      previousWarrantyId: previousWarrantyId || undefined,
      reopenReason: reason.trim(),
      reopenDate: nowIso,
      traceabilityNotes: traceEntry,
      createdAt: nowIso
    };

    const docRef = await addDoc(colRef, cleanForFirestore(newWarrantyPayload));

    // Update original receipt without losing data or history
    const existingNotes = receipt.internalNotes || "";
    const updatedNotes = existingNotes ? `${existingNotes}\n\n${traceEntry}` : traceEntry;

    // If a new provider order ID was given, update the services items preserving full traceability
    let updatedServices = receipt.services;
    if (newProviderOrderId && newProviderOrderId.trim()) {
      const cleanNewId = newProviderOrderId.trim();
      updatedServices = (receipt.services || []).map((s, idx) => {
        if (idx === 0) {
          const ids = cleanIdsList;
          return {
            ...s,
            orderId: cleanNewId,
            orderIds: ids.length > 0 ? ids : [cleanNewId]
          };
        }
        return s;
      });
    }

    const receiptPatch: Partial<Receipt> = {
      internalNotes: updatedNotes,
      services: updatedServices
    };

    if (reactivateOrderToInProcess) {
      receiptPatch.status = "garantia_en_proceso";
    }

    await setDoc(doc(db, "receipts", receipt.id), cleanForFirestore(receiptPatch), { merge: true });

    return {
      id: docRef.id,
      ...newWarrantyPayload
    } as SupplierWarrantyRecord;
  };

  return (
    <AppContext.Provider
      value={{
        user,
        loadingAuth,
        loadingData,
        businessConfig,
        socialNetworks,
        services,
        combos,
        receipts,
        clients,
        supplierWarranties,
        trmState,
        fetchTRM,
        isDarkMode,
        toggleDarkMode,
        addSupplierWarranty,
        updateSupplierWarranty,
        deleteSupplierWarranty,
        resolveSupplierWarranty,
        claimAgainSupplierWarranty,
        resolveAllWarrantiesInProcess,
        reopenOrResendWarrantyForCancelledOrder,
        login,
        loginWithGoogle,
        logout,
        resetPassword,
        updateBusinessConfig,
        addSocialNetwork,
        updateSocialNetwork,
        deleteSocialNetwork,
        addService,
        updateService,
        deleteService,
        addCombo,
        updateCombo,
        deleteCombo,
        createReceipt,
        deleteReceipt,
        updateReceipt,
        markAllInProcessAsCompleted,
        updateClientTag,
        updateClient,
        reassignClientCode,
        resolveDuplicateClientCodes,
        mergeDuplicateClients,
        separateReceiptToNewClient,
        restoreDefaults
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
