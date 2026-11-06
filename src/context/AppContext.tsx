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
  deleteDoc,
  onSnapshot,
  writeBatch
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
  ReopenWarrantyParams,
  ProviderOrderSyncResult
} from "../types";
import { DEFAULT_BUSINESS_CONFIG, DEFAULT_SOCIAL_NETWORKS, DEFAULT_SERVICES, DEFAULT_COMBOS } from "../defaultData";
import { syncOrderWithProvider, setCachedProviderCredentials, getCachedProviderCredentials } from "../services/providerApi";
import { runReferentialIntegrityAudit, IntegrityAuditReport } from "../utils/referentialIntegrityAudit";

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
  syncReceiptWithProvider: (receiptId: string) => Promise<{ updated: boolean; oldStatus?: string; newStatus?: string; rawStatus?: string; message?: string }>;
  syncAllInProcessOrdersWithProvider: () => Promise<{ checkedCount: number; updatedCount: number; details: string[] }>;
  updateClientTag: (clientId: string, tag: string) => Promise<void>;
  updateClient: (clientId: string, updates: Partial<Client>) => Promise<void>;
  reassignClientCode: (clientId: string, customCode?: string) => Promise<string>;
  resolveDuplicateClientCodes: () => Promise<{ resolvedCount: number; details: string[] }>;
  mergeDuplicateClients: () => Promise<{ mergedGroupsCount: number; deletedDocsCount: number; details: string[] }>;
  separateReceiptToNewClient: (receiptId: string, fromClientId?: string, newClientName?: string, newClientPhone?: string) => Promise<string>;
  
  // System Maintenance & Referential Integrity Audit
  restoreDefaults: () => Promise<void>;
  runIntegrityAudit: () => IntegrityAuditReport;
  repairReferentialIntegrity: () => Promise<{ fixedCount: number; details: string[]; reportAfter: IntegrityAuditReport }>;
}

export const AUTHORIZED_ADMIN_EMAIL = "estebanruiz.12vrgassergio@gmail.com";

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

function normalizeReceiptFromDb(id: string, raw: Record<string, any>): Receipt {
  const safeServices = Array.isArray(raw.services)
    ? raw.services.filter(Boolean).map((s: any, idx: number) => {
        const rawOrderId = s.orderId !== undefined && s.orderId !== null ? String(s.orderId).trim() : "";
        const splitFromOrderId = rawOrderId
          ? rawOrderId.split(/[\s,]+/).map((oid: string) => oid.trim()).filter(Boolean)
          : [];
        const rawOrderIds = Array.isArray(s.orderIds)
          ? s.orderIds.map((oid: any) => String(oid ?? "").trim()).filter(Boolean)
          : [];

        const combined = Array.from(new Set([...splitFromOrderId, ...rawOrderIds]));
        const realIds = combined.filter((oid) => !/^PED-\d+$/i.test(oid));
        const finalIds = realIds.length > 0 ? realIds : combined;

        const isValidReorderHistory =
          (Boolean(s.isResent) || Boolean(s.previousOrderId)) &&
          splitFromOrderId.length > 0 &&
          splitFromOrderId.every((oid) => finalIds.includes(oid));

        const normalizedOrderId = isValidReorderHistory
          ? splitFromOrderId.join(", ")
          : finalIds.length > 0
          ? finalIds.join(", ")
          : rawOrderId || undefined;

        const normalizedOrderIds = finalIds.length > 0 ? finalIds : undefined;

        return {
          ...s,
          id: String(s.id || `${id}_srv_${idx}`),
          socialNetworkId: String(s.socialNetworkId || "general"),
          socialNetworkName: String(s.socialNetworkName || "General"),
          serviceId: String(s.serviceId || "custom"),
          serviceName: String(s.serviceName || "Servicio"),
          quantity: Number(s.quantity) || 0,
          suggestedPrice: Number(s.suggestedPrice) || 0,
          chargedPrice: Number(s.chargedPrice) || 0,
          providerCostAtPurchase: Number(s.providerCostAtPurchase) || 0,
          orderId: normalizedOrderId,
          orderIds: normalizedOrderIds,
        };
      })
    : [];

  return {
    ...(raw as Receipt),
    id,
    consecutive: Number(raw.consecutive) || 0,
    clientName: String(raw.clientName ?? ""),
    clientPhone: String(raw.clientPhone ?? ""),
    date: String(raw.date || new Date().toISOString()),
    services: safeServices,
    subtotal: Number(raw.subtotal) || 0,
    totalCharged: Number(raw.totalCharged) || 0,
    totalProviderCost: Number(raw.totalProviderCost) || 0,
    totalProfit: Number(raw.totalProfit) || 0,
    warranty: String(raw.warranty ?? "30 días"),
    thankYouMessage: String(raw.thankYouMessage ?? ""),
    status: raw.status || "en_proceso",
  };
}

function normalizeClientFromDb(id: string, raw: Record<string, any>): Client {
  return {
    ...(raw as Client),
    id,
    clientCode: raw.clientCode !== undefined && raw.clientCode !== null ? String(raw.clientCode) : undefined,
    name: String(raw.name ?? ""),
    phone: String(raw.phone ?? ""),
    purchaseCount: Number(raw.purchaseCount) || 0,
    totalSpent: Number(raw.totalSpent) || 0,
    lastPurchaseDate: String(raw.lastPurchaseDate ?? ""),
    receiptIds: Array.isArray(raw.receiptIds) ? raw.receiptIds.filter(Boolean).map(String) : [],
  };
}

function normalizeWarrantyFromDb(id: string, raw: Record<string, any>): SupplierWarrantyRecord {
  return {
    ...(raw as SupplierWarrantyRecord),
    id,
    providerOrderId: String(raw.providerOrderId ?? ""),
    providerOrderIds: Array.isArray(raw.providerOrderIds) ? raw.providerOrderIds.filter(Boolean).map(String) : undefined,
    clientName: String(raw.clientName ?? ""),
    clientPhone: String(raw.clientPhone ?? ""),
    serviceName: String(raw.serviceName ?? ""),
    reason: String(raw.reason ?? ""),
    status: raw.status || "en_espera",
    sentDate: String(raw.sentDate || raw.createdAt || new Date().toISOString()),
    expectedResponseHours: Number(raw.expectedResponseHours) || 48,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
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
  const hasRunOneTimeRepairsRef = useRef(false);

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

  // 1. Listen to Auth State with strict single-admin authorization
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userEmail = (currentUser.email || "").toLowerCase().trim();
        if (userEmail !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
          console.warn("Unauthorized Google account attempted access:", currentUser.email);
          await signOut(auth);
          setUser(null);
          setLoadingAuth(false);
          return;
        }
      }
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
          const data = docSnap.data() as BusinessConfig;
          setBusinessConfig(data);
          if (data.providerApiUrl || data.providerApiKey) {
            setCachedProviderCredentials(data.providerApiUrl, data.providerApiKey);
          } else {
            const localCreds = getCachedProviderCredentials();
            if (localCreds.apiKey) {
              setDoc(
                configRef,
                { providerApiUrl: localCreds.providerUrl, providerApiKey: localCreds.apiKey },
                { merge: true }
              ).catch(() => {});
            }
          }
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
        }).filter((s) => s.id !== "ig-optimizacion" && s.id !== "ig-publicidad");

        const customServices = srvsFromDb.filter((s) => {
          if (DEFAULT_SERVICES.some((def) => def.id === s.id)) return false;
          if (s.id === "ig-optimizacion" || s.id === "ig-publicidad") return false;
          const sName = (s.name || "").toLowerCase();
          const sId = (s.id || "").toLowerCase();
          if (sName.includes("alerta") || sId.includes("alrt")) return false;

          // Instagram catalog strictly only allows Seguidores, Likes, Vistas, Comentarios
          if (s.socialNetworkId === "instagram") {
            if (
              sName.includes("optimiz") ||
              sName.includes("publicidad") ||
              sName.includes("tarjeta") ||
              sName.includes("diseño") ||
              sName.includes("personaliz") ||
              sName.includes("web")
            ) {
              return false;
            }
            const isSeg = sName.includes("seguidor") || sId.includes("follower");
            const isLik = sName.includes("like") || sName.includes("me gusta");
            const isVis = sName.includes("vista") || sName.includes("view") || sName.includes("reproducci");
            const isCom = sName.includes("comentario") || sId.includes("comment");
            if (!isSeg && !isLik && !isVis && !isCom) return false;
          }

          return true;
        });

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
        querySnap.forEach((docSnap) => {
          recs.push(normalizeReceiptFromDb(docSnap.id, docSnap.data()));
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
        querySnap.forEach((docSnap) => {
          cls.push(normalizeClientFromDb(docSnap.id, docSnap.data()));
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
          items.push(normalizeWarrantyFromDb(docSnap.id, docSnap.data()));
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

    const hasClient0107 = clients.some(
      (c) => String(c.clientCode || "").trim().padStart(4, "0") === "0107"
    );

    // Build quick fingerprint to avoid running sync when nothing structurally changed
    const currentFingerprint = `${clients.length}_${receipts.length}_${clients.filter((c) => !c.clientCode).length}_${duplicateCount}_${hasClient0107 ? "107ok" : "107missing"}`;
    if (lastSyncFingerprintRef.current === currentFingerprint) {
      return;
    }

    const syncClientStats = async () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      try {
        // Build fast O(N + M) index mapping clients to receipts
        const { clientToReceipts } = buildReceiptsClientIndex(clients, receipts);

        // ---------------------------------------------------------------------
        // REPAIR 0107: Restore missing Client #0107 and its orders if it was
        // renumbered (e.g. to 0130+ by legacy 0097 repair), merged, or unmapped
        // ---------------------------------------------------------------------
        if (!hasClient0107 && clients.length > 0) {
          // Helper: get earliest receipt timestamp and consecutive for a client
          const getFirstOrderStats = (c: Client) => {
            const recs = clientToReceipts.get(c.id) || [];
            let minMs = c.createdAt ? new Date(c.createdAt).getTime() : Infinity;
            if (isNaN(minMs)) minMs = Infinity;
            let minConsec = Infinity;
            recs.forEach((r) => {
              const t = r.date ? new Date(r.date).getTime() : Infinity;
              if (!isNaN(t) && t < minMs) minMs = t;
              const cs = Number(r.consecutive);
              if (!isNaN(cs) && cs > 0 && cs < minConsec) minConsec = cs;
            });
            if (minMs === Infinity && c.lastPurchaseDate) {
              const lp = new Date(c.lastPurchaseDate).getTime();
              if (!isNaN(lp)) minMs = lp;
            }
            return { minMs, minConsec, recs };
          };

          // 1. Check supplierWarranties for explicit clientCode 0107
          const w0107 = supplierWarranties.find(
            (w) => String(w.clientCode || "").trim().padStart(4, "0") === "0107"
          );
          if (w0107) {
            const matchedFromWarranty = clients.find(
              (c) =>
                (w0107.clientId && c.id === w0107.clientId) ||
                (w0107.receiptId && (c.receiptIds || []).includes(w0107.receiptId)) ||
                (w0107.clientPhone && matchContacts(c.phone, w0107.clientPhone)) ||
                (w0107.clientName &&
                  String(c.name || "").trim().toLowerCase() === String(w0107.clientName || "").trim().toLowerCase())
            );
            if (matchedFromWarranty) {
              console.log("Restoring Client #0107 from warranty record:", matchedFromWarranty.id);
              await setDoc(doc(db, "clients", matchedFromWarranty.id), { clientCode: "0107" }, { merge: true });
              return;
            }
          }

          // Find reference window around 0106 and 0108
          const findByCode = (num: number) =>
            clients.find((c) => parseInt(String(c.clientCode || "0"), 10) === num);

          const lowerNeighbor = findByCode(106) || findByCode(105) || findByCode(104) || findByCode(103);
          const upperNeighbor = findByCode(108) || findByCode(109) || findByCode(110) || findByCode(111);
          const lowerStats = lowerNeighbor ? getFirstOrderStats(lowerNeighbor) : null;
          const upperStats = upperNeighbor ? getFirstOrderStats(upperNeighbor) : null;

          const lowerMs = lowerStats && lowerStats.minMs !== Infinity ? lowerStats.minMs : 0;
          const upperMs = upperStats && upperStats.minMs !== Infinity ? upperStats.minMs : Infinity;
          const lowerConsec = lowerStats && lowerStats.minConsec !== Infinity ? lowerStats.minConsec : 0;
          const upperConsec = upperStats && upperStats.minConsec !== Infinity ? upperStats.minConsec : Infinity;

          const targetMidMs =
            lowerMs > 0 && upperMs !== Infinity
              ? (lowerMs + upperMs) / 2
              : lowerMs > 0
              ? lowerMs + 1000
              : upperMs !== Infinity
              ? upperMs - 1000
              : 0;

          const targetMidConsec =
            lowerConsec > 0 && upperConsec !== Infinity
              ? (lowerConsec + upperConsec) / 2
              : lowerConsec > 0
              ? lowerConsec + 1
              : upperConsec !== Infinity
              ? upperConsec - 1
              : 0;

          // 2. Check any client with code > 108 (e.g. renumbered to 0120+/0130+ or recreated at end) or unassigned
          // whose earliest order actually belongs in the 0107 slot (before 0108/0109)
          const shiftedCandidates = clients
            .filter((c) => {
              const num = parseInt(String(c.clientCode || "0"), 10);
              return num > 108 || num === 97 || !c.clientCode;
            })
            .map((c) => ({
              client: c,
              num: parseInt(String(c.clientCode || "0"), 10) || 9999,
              stats: getFirstOrderStats(c),
            }));

          // Priority 2A: Candidate whose earliest order consecutive or timestamp is strictly in [0106..0108] window
          const exactWindowCandidates = shiftedCandidates.filter(({ stats }) => {
            if (lowerConsec > 0 && upperConsec !== Infinity && stats.minConsec !== Infinity) {
              if (stats.minConsec >= lowerConsec && stats.minConsec <= upperConsec) {
                return true;
              }
            }
            if (lowerMs > 0 && upperMs !== Infinity && stats.minMs !== Infinity) {
              if (stats.minMs >= lowerMs && stats.minMs <= upperMs) {
                return true;
              }
            }
            return false;
          });

          if (exactWindowCandidates.length > 0) {
            exactWindowCandidates.sort((a, b) => {
              // Prefer higher/end-of-list reassigned codes (like 130+ or max code) first, then closest to midpoint
              if (targetMidConsec > 0 && a.stats.minConsec !== Infinity && b.stats.minConsec !== Infinity) {
                return Math.abs(a.stats.minConsec - targetMidConsec) - Math.abs(b.stats.minConsec - targetMidConsec);
              }
              if (targetMidMs > 0) {
                return Math.abs(a.stats.minMs - targetMidMs) - Math.abs(b.stats.minMs - targetMidMs);
              }
              return b.num - a.num;
            });
            const restoredClient = exactWindowCandidates[0].client;
            console.log("Restoring exact-window Client #0107:", restoredClient.id, restoredClient.name);
            await setDoc(doc(db, "clients", restoredClient.id), { clientCode: "0107" }, { merge: true });
            return;
          }

          // Priority 2B: Candidate with high code (>= 125 or unassigned) whose earliest order is older than neighbor 0110
          const broadWindowCandidates = shiftedCandidates.filter(({ num, stats }) => {
            if (num < 120 && cHasSequentialPlacement(num, stats.minConsec)) return false;
            if (upperConsec !== Infinity && stats.minConsec !== Infinity && stats.minConsec <= upperConsec + 3) {
              return true;
            }
            if (upperMs !== Infinity && stats.minMs !== Infinity) {
              const bufferMs = 7 * 24 * 60 * 60 * 1000;
              if (stats.minMs <= upperMs + bufferMs) return true;
            }
            return false;
          });

          function cHasSequentialPlacement(codeNum: number, minConsec: number): boolean {
            const prev = findByCode(codeNum - 1);
            if (!prev) return false;
            const prevSt = getFirstOrderStats(prev);
            return prevSt.minConsec !== Infinity && minConsec >= prevSt.minConsec;
          }

          if (broadWindowCandidates.length > 0) {
            broadWindowCandidates.sort((a, b) => {
              if (targetMidConsec > 0 && a.stats.minConsec !== Infinity && b.stats.minConsec !== Infinity) {
                return Math.abs(a.stats.minConsec - targetMidConsec) - Math.abs(b.stats.minConsec - targetMidConsec);
              }
              if (targetMidMs > 0) {
                return Math.abs(a.stats.minMs - targetMidMs) - Math.abs(b.stats.minMs - targetMidMs);
              }
              return a.stats.minMs - b.stats.minMs;
            });
            const restoredClient = broadWindowCandidates[0].client;
            console.log("Restoring broad-window Client #0107:", restoredClient.id, restoredClient.name);
            await setDoc(doc(db, "clients", restoredClient.id), { clientCode: "0107" }, { merge: true });
            return;
          }

          // 3. Check if Client #0107's receipts were merged into another client (< 130) or left unmapped
          const allMappedReceiptIds = new Set<string>();
          clientToReceipts.forEach((list) => list.forEach((r) => allMappedReceiptIds.add(r.id)));
          const orphanReceipts = receipts.filter((r) => !allMappedReceiptIds.has(r.id));

          if (orphanReceipts.length > 0) {
            // Sort orphan receipts closest to the 0107 window
            const sortedOrphans = [...orphanReceipts].sort((a, b) => {
              const tA = a.date ? new Date(a.date).getTime() : 0;
              const tB = b.date ? new Date(b.date).getTime() : 0;
              if (targetMidMs > 0) {
                return Math.abs(tA - targetMidMs) - Math.abs(tB - targetMidMs);
              }
              return tA - tB;
            });
            const targetSample = sortedOrphans[0];
            const matchingOrphans = orphanReceipts.filter(
              (r) =>
                r.id === targetSample.id ||
                (r.clientId && r.clientId === targetSample.clientId) ||
                matchContacts(r.clientPhone, targetSample.clientPhone) ||
                String(r.clientName || "").trim().toLowerCase() === String(targetSample.clientName || "").trim().toLowerCase()
            );
            const restoredId =
              targetSample.clientId && !clients.some((c) => c.id === targetSample.clientId)
                ? targetSample.clientId
                : generateClientId(targetSample.clientName, targetSample.clientPhone, true);
            const sortedRecs = [...matchingOrphans].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const totalSpent = matchingOrphans.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
            const restoredDoc: Client = {
              id: restoredId,
              clientCode: "0107",
              name: String(targetSample.clientName || "Cliente").trim(),
              phone: String(targetSample.clientPhone || "").trim(),
              purchaseCount: matchingOrphans.length,
              totalSpent,
              lastPurchaseDate: sortedRecs[0].date,
              receiptIds: matchingOrphans.map((r) => r.id),
              createdAt: sortedRecs[sortedRecs.length - 1].date,
              tag: getClientTagForSpending(totalSpent),
            };
            console.log("Recreating Client #0107 from orphan receipts:", restoredDoc);
            await setDoc(doc(db, "clients", restoredId), cleanForFirestore(restoredDoc));
            for (const r of matchingOrphans) {
              await setDoc(doc(db, "receipts", r.id), { clientId: restoredId }, { merge: true });
            }
            return;
          }

          // 4. Check if Client #0107 was merged into an older client (< 107) by mergeDuplicateClients
          // (where receipts created in the [0106..0108] window have a different clientId or clientName than the older client's initial order)
          for (const c of clients) {
            const num = parseInt(c.clientCode || "0", 10) || 0;
            if (num <= 0 || num >= 107) continue;
            const recs = clientToReceipts.get(c.id) || [];
            if (recs.length < 2) continue;

            const windowRecs = recs.filter((r) => {
              const consecNum = parseInt(String(r.consecutive || "").replace(/\D/g, ""), 10);
              const tMs = r.date ? new Date(r.date).getTime() : 0;
              const inConsec =
                lowerConsec > 0 &&
                upperConsec !== Infinity &&
                !isNaN(consecNum) &&
                consecNum >= lowerConsec &&
                consecNum <= upperConsec;
              const inMs =
                lowerMs > 0 && upperMs !== Infinity && tMs >= lowerMs && tMs <= upperMs;
              const hasDifferentIdentity =
                (r.clientId && r.clientId !== c.id) ||
                (r.clientName &&
                  c.name &&
                  r.clientName.trim().toLowerCase() !== c.name.trim().toLowerCase());
              return (inConsec || inMs) && hasDifferentIdentity;
            });

            if (windowRecs.length > 0) {
              const sample = windowRecs[0];
              const allFor0107 = recs.filter(
                (r) =>
                  windowRecs.some((w) => w.id === r.id) ||
                  (sample.clientId && sample.clientId !== c.id && r.clientId === sample.clientId) ||
                  (sample.clientName &&
                    r.clientName &&
                    r.clientName.trim().toLowerCase() === sample.clientName.trim().toLowerCase() &&
                    r.clientName.trim().toLowerCase() !== c.name.trim().toLowerCase())
              );
              if (allFor0107.length > 0 && allFor0107.length < recs.length) {
                const restoredId =
                  sample.clientId && sample.clientId !== c.id && !clients.some((cl) => cl.id === sample.clientId)
                    ? sample.clientId
                    : generateClientId(sample.clientName || c.name, sample.clientPhone || c.phone, true);
                const sorted0107 = [...allFor0107].sort(
                  (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
                );
                const totalSpent0107 = allFor0107.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
                const restoredDoc: Client = {
                  id: restoredId,
                  clientCode: "0107",
                  name: String(sample.clientName || c.name || "Cliente").trim(),
                  phone: String(sample.clientPhone || c.phone || "").trim(),
                  purchaseCount: allFor0107.length,
                  totalSpent: totalSpent0107,
                  lastPurchaseDate: sorted0107[0].date,
                  receiptIds: allFor0107.map((r) => r.id),
                  createdAt: sorted0107[sorted0107.length - 1].date,
                  tag: getClientTagForSpending(totalSpent0107),
                };
                const remainingIds = (c.receiptIds || []).filter(
                  (id) => !allFor0107.some((r) => r.id === id)
                );
                console.log("Unmerging Client #0107 from older client:", c.clientCode, restoredDoc);
                await setDoc(doc(db, "clients", restoredId), cleanForFirestore(restoredDoc));
                await setDoc(doc(db, "clients", c.id), { receiptIds: remainingIds }, { merge: true });
                for (const r of allFor0107) {
                  await setDoc(doc(db, "receipts", r.id), { clientId: restoredId }, { merge: true });
                }
                return;
              }
            }
          }

          // 5. Fallback: If any client with code >= 130 has multiple orders and its earliest order is older than client 0125's earliest order
          const highCodeRepeatCandidates = shiftedCandidates.filter(
            ({ num, stats }) => num >= 130 && stats.recs.length >= 1
          );
          if (highCodeRepeatCandidates.length > 0) {
            const ref125 = findByCode(125) || findByCode(120) || findByCode(115);
            const refMs = ref125 ? getFirstOrderStats(ref125).minMs : Infinity;
            const olderHighCandidates = highCodeRepeatCandidates.filter(
              ({ stats }) => stats.minMs < refMs
            );
            if (olderHighCandidates.length > 0) {
              olderHighCandidates.sort((a, b) => {
                if (targetMidMs > 0) {
                  return Math.abs(a.stats.minMs - targetMidMs) - Math.abs(b.stats.minMs - targetMidMs);
                }
                return a.stats.minMs - b.stats.minMs;
              });
              const restoredClient = olderHighCandidates[0].client;
              console.log("Restoring high-code repeat Client #0107:", restoredClient.id, restoredClient.name);
              await setDoc(doc(db, "clients", restoredClient.id), { clientCode: "0107" }, { merge: true });
              return;
            }
          }
        }

        // ---------------------------------------------------------------------
        // ONE-TIME SESSION REPAIRS (Run once per session to prevent repeated writes)
        // ---------------------------------------------------------------------
        if (!hasRunOneTimeRepairsRef.current && receipts.length > 0) {
          hasRunOneTimeRepairsRef.current = true;

          // REPAIR 1186: Clear accidental resend flag on new Order #1186 (and any order where previousOrderId was just a PED- placeholder)
          for (const rec of receipts) {
            const consecClean = String(rec.consecutive || "").replace(/\D/g, "");
            const is1186 = consecClean === "1186";
            const hasAccidentalResend = (rec.services || []).some(
              (s) =>
                (is1186 && (s.isResent || s.previousOrderId || s.resendNote || s.resendDate)) ||
                (s.isResent && s.previousOrderId && /^PED-\d+$/i.test(s.previousOrderId.trim()))
            );

            if (hasAccidentalResend) {
              const cleanedServices = (rec.services || []).map((s) => {
                const allIds = getItemOrderIds(s);
                const realIds = allIds.filter((id) => !/^PED-\d+$/i.test(id.trim()));
                const finalIds = realIds.length > 0 ? realIds : allIds;
                return {
                  ...s,
                  orderId: finalIds.join(", "),
                  orderIds: finalIds,
                  isResent: false,
                  previousOrderId: undefined,
                  resendDate: undefined,
                  resendNote: undefined,
                };
              });

              const cleanedNotes = rec.internalNotes
                ? rec.internalNotes
                    .split("\n")
                    .filter((line) => !line.includes("[REENVIADO]") && !line.includes("anterior: PED-"))
                    .join("\n")
                : undefined;

              await setDoc(
                doc(db, "receipts", rec.id),
                cleanForFirestore({
                  services: cleanedServices,
                  internalNotes: cleanedNotes ?? "",
                }),
                { merge: true }
              );
            }
          }

          // REPAIR 3: Remove deprecated Alertas Digitales from Firestore if exists
          const deprecatedServices = services.filter((s) => {
            const sName = (s.name || "").toLowerCase();
            const sId = (s.id || "").toLowerCase();
            return sName.includes("alerta") || sId.includes("alrt") || sId.includes("alerta");
          });
          for (const dep of deprecatedServices) {
            await deleteDoc(doc(db, "services", dep.id));
          }

          // REPAIR 4: Fix Pedido 1184 status from completado to procesando (once)
          const receipts1184 = receipts.filter((r) => {
            const isConsecutive1184 = String(r.consecutive || "").trim() === "1184";
            const hasOrderId1184 = (r.services || []).some((s) =>
              getItemOrderIds(s).some((id) => id.replace(/^#/, "").trim() === "1184")
            );
            return (
              (isConsecutive1184 || hasOrderId1184) &&
              getNormalizedStatus(r.status) === "completado" &&
              !(r.internalNotes || "").includes("[Ajuste Proveedor #1184]")
            );
          });
          for (const r1184 of receipts1184) {
            const note1184 = r1184.internalNotes
              ? `${r1184.internalNotes}\n[Ajuste Proveedor #1184] Estado actualizado a "procesando" según estado en proveedor.`
              : `[Ajuste Proveedor #1184] Estado actualizado a "procesando" según estado en proveedor.`;
            await setDoc(
              doc(db, "receipts", r1184.id),
              {
                status: "procesando",
                internalNotes: note1184,
              },
              { merge: true }
            );
          }
        }

        // Helper to compute earliest order timestamp for a client (so repeat purchases never alter client age sorting)
        const getClientEarliestMs = (c: Client): number => {
          const recs = clientToReceipts.get(c.id) || [];
          let minMs = c.createdAt ? new Date(c.createdAt).getTime() : Infinity;
          if (isNaN(minMs)) minMs = Infinity;
          for (const r of recs) {
            const t = r.date ? new Date(r.date).getTime() : Infinity;
            if (!isNaN(t) && t < minMs) minMs = t;
          }
          if (minMs === Infinity && c.lastPurchaseDate) {
            const lp = new Date(c.lastPurchaseDate).getTime();
            if (!isNaN(lp)) minMs = lp;
          }
          return minMs === Infinity ? 0 : minMs;
        };

        // Sort clients deterministically by earliest order/creation date
        const sortedClients = [...clients].sort((a, b) => {
          const dateA = getClientEarliestMs(a);
          const dateB = getClientEarliestMs(b);
          if (dateA !== dateB) return dateA - dateB;
          return (b.purchaseCount || 0) - (a.purchaseCount || 0);
        });

        // Gather all currently used valid codes without overwriting existing valid codes
        const usedCodes = new Set<number>();
        usedCodes.add(97);
        sortedClients.forEach((c) => {
          if (c.clientCode && c.clientCode.trim()) {
            const num = parseInt(c.clientCode.trim(), 10);
            if (!isNaN(num) && num > 0 && num !== 97) {
              usedCodes.add(num);
            }
          }
        });

        const validCodesArray = Array.from(usedCodes).filter((n) => n !== 97);
        let nextSequentialCode = validCodesArray.length > 0 ? Math.max(...validCodesArray) + 1 : 1;
        if (nextSequentialCode === 97) nextSequentialCode = 98;

        // Check which clients genuinely need document updates
        const updatesQueue: Array<{ id: string; payload: Record<string, any> }> = [];

        for (const client of sortedClients) {
          const updatePayload: Record<string, any> = {};

          const rawCode = (client.clientCode || "").trim();
          const paddedCode = rawCode ? rawCode.padStart(4, "0") : "";
          const needsNewCode = !paddedCode || paddedCode === "0000" || paddedCode === "0097" || isNaN(parseInt(paddedCode, 10));
          if (needsNewCode) {
            while (usedCodes.has(nextSequentialCode) || nextSequentialCode === 97) {
              nextSequentialCode++;
            }
            const assignedCode = String(nextSequentialCode).padStart(4, "0");
            usedCodes.add(nextSequentialCode);
            updatePayload.clientCode = assignedCode;
            nextSequentialCode++;
            if (nextSequentialCode === 97) nextSequentialCode = 98;
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

            const targetTag = getClientTagForSpending(actualSpent);
            if (client.tag !== targetTag) {
              updatePayload.tag = targetTag;
            }

            const actualReceiptIds = Array.from(
              new Set([...(client.receiptIds || []), ...matchingReceipts.map((r) => r.id).filter(Boolean)])
            );
            const currentIds = client.receiptIds || [];
            const idsChanged =
              currentIds.length !== actualReceiptIds.length ||
              !actualReceiptIds.every((id) => currentIds.includes(id));
            if (idsChanged) {
              updatePayload.receiptIds = actualReceiptIds;
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            updatesQueue.push({ id: client.id, payload: cleanForFirestore(updatePayload) });
          }
        }

        // Apply any needed client doc updates in a single atomic Firestore writeBatch for high scalability
        if (updatesQueue.length > 0) {
          try {
            const batch = writeBatch(db);
            for (const item of updatesQueue.slice(0, 250)) {
              batch.set(doc(db, "clients", item.id), item.payload, { merge: true });
            }
            await batch.commit();
          } catch (e) {
            console.warn("Failed to batch sync client docs:", e);
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

              while (usedCodes.has(nextSequentialCode) || nextSequentialCode === 97) {
                nextSequentialCode++;
              }
              const assignedCode = String(nextSequentialCode).padStart(4, "0");
              usedCodes.add(nextSequentialCode);
              nextSequentialCode++;
              if (nextSequentialCode === 97) nextSequentialCode = 98;

              const sortedRecs = [...recList].sort(
                (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
              );
              const totalSpent = recList.reduce((sum, r) => sum + (r.totalCharged || 0), 0);

              const newClientDoc: Client = {
                id: cId,
                clientCode: assignedCode,
                name: String(sample.clientName || "").trim(),
                phone: String(sample.clientPhone || "").trim(),
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
    const cleanEmail = (email || "").toLowerCase().trim();
    if (cleanEmail !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
      throw new Error(`Acceso denegado: solo el correo ${AUTHORIZED_ADMIN_EMAIL} está autorizado.`);
    }
    await signInWithEmailAndPassword(auth, cleanEmail, password);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(auth, provider);
    const userEmail = (result.user.email || "").toLowerCase().trim();
    if (userEmail !== AUTHORIZED_ADMIN_EMAIL.toLowerCase()) {
      await signOut(auth);
      setUser(null);
      throw new Error(
        `Acceso no autorizado: la cuenta ${result.user.email} no tiene permisos de administrador. Solo tiene acceso ${AUTHORIZED_ADMIN_EMAIL}.`
      );
    }
    setUser(result.user);
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
          .filter((n) => !isNaN(n) && n > 0 && n !== 97);
        const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
        let nextCode = maxCode + 1;
        if (nextCode === 97) nextCode = 98;
        existingCode = String(nextCode).padStart(4, "0");
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
        .filter((n) => !isNaN(n) && n > 0 && n !== 97);
      const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
      let nextCode = maxCode + 1;
      if (nextCode === 97) nextCode = 98;
      const newCode = String(nextCode).padStart(4, "0");

      const targetTag = getClientTagForSpending(receiptData.totalCharged);

      const newClient: Client = {
        id: clientId,
        clientCode: newCode,
        name: String(receiptData.clientName || "").trim(),
        phone: String(receiptData.clientPhone || "").trim(),
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
      .filter((n) => !isNaN(n) && n > 0 && n !== 97);
    const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    let nextCode = maxCode + 1;
    if (nextCode === 97) nextCode = 98;
    const newCode = String(nextCode).padStart(4, "0");

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
    const computeNextCode = () => {
      const existingCodes = clients
        .filter((c) => c.id !== clientId && c.clientCode && c.clientCode.trim().padStart(4, "0") !== "0097")
        .map((c) => parseInt(c.clientCode!, 10))
        .filter((n) => !isNaN(n) && n > 0 && n !== 97);
      const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
      let nextId = maxCode + 1;
      if (nextId === 97) nextId = 98;
      return String(nextId).padStart(4, "0");
    };

    let finalCode = "";
    const currentClient = clients.find((c) => c.id === clientId);
    if (customCode && customCode.trim()) {
      const normalized = customCode.trim().replace(/\D/g, "").padStart(4, "0");
      if (normalized === "0097") {
        throw new Error("El código #0097 está reservado y deshabilitado.");
      }
      if (normalized.length !== 4) {
        throw new Error("El código de cliente debe contener 4 dígitos numéricos (ej. 0083)");
      }
      const conflict = clients.find(
        (c) => c.id !== clientId && c.clientCode?.trim().padStart(4, "0") === normalized
      );
      if (conflict) {
        const fallbackForConflict =
          currentClient?.clientCode &&
          currentClient.clientCode.trim().padStart(4, "0") !== normalized &&
          currentClient.clientCode.trim().padStart(4, "0") !== "0097"
            ? currentClient.clientCode.trim().padStart(4, "0")
            : computeNextCode();
        await setDoc(doc(db, "clients", conflict.id), { clientCode: fallbackForConflict }, { merge: true });
      }
      finalCode = normalized;
    } else {
      finalCode = computeNextCode();
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

    for (const group of contactGroups.values()) {
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
        .filter((n) => !isNaN(n) && n > 0 && n !== 97)
    );

    const validNums = Array.from(usedCodes).filter((n) => n !== 97);
    let nextAvailable = validNums.length > 0 ? Math.max(...validNums) + 1 : 1;
    if (nextAvailable === 97) nextAvailable = 98;
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
          while (usedCodes.has(nextAvailable) || nextAvailable === 97) {
            nextAvailable++;
          }
          const newCode = String(nextAvailable).padStart(4, "0");
          usedCodes.add(nextAvailable);
          nextAvailable++;
          if (nextAvailable === 97) nextAvailable = 98;

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
      
      // Find all remaining receipts that still belong to this client
      const updatedReceiptIds = (clientData.receiptIds || []).filter((rId) => rId !== id);
      const remainingClientReceipts = receipts.filter(
        (r) =>
          r.id !== id &&
          (r.clientId === clientId || updatedReceiptIds.includes(r.id) || isReceiptForClient(clientData, r))
      );
      
      if (remainingClientReceipts.length === 0 && updatedReceiptIds.length === 0) {
        // Delete the client only if truly no receipts remain
        await deleteDoc(clientRef);
      } else {
        // Otherwise, update client purchaseCount, totalSpent, and receiptIds from remaining receipts
        const allRemainingIds = Array.from(
          new Set([...updatedReceiptIds, ...remainingClientReceipts.map((r) => r.id)])
        );
        const newPurchaseCount = Math.max(1, remainingClientReceipts.length || allRemainingIds.length);
        const newTotalSpent =
          remainingClientReceipts.length > 0
            ? remainingClientReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0)
            : Math.max(0, (clientData.totalSpent || 0) - (receiptData.totalCharged || 0));
        
        let lastPurchaseDate = clientData.lastPurchaseDate;
        if (remainingClientReceipts.length > 0) {
          remainingClientReceipts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          lastPurchaseDate = remainingClientReceipts[0].date;
        }

        await setDoc(clientRef, {
          ...clientData,
          purchaseCount: newPurchaseCount,
          totalSpent: newTotalSpent,
          receiptIds: allRemainingIds,
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
        if (norm === "en_proceso" || norm === "procesando" || norm === "parcial") {
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

  /**
   * Syncs a single receipt with MazSocialMarket API by querying its order IDs.
   * If provider status differs from current status, automatically updates receipt in Firestore.
   */
  const syncReceiptWithProvider = async (
    receiptId: string
  ): Promise<{ updated: boolean; oldStatus?: string; newStatus?: string; rawStatus?: string; message?: string }> => {
    const targetReceipt = receipts.find((r) => r.id === receiptId);
    if (!targetReceipt) {
      return { updated: false, message: "Comprobante no encontrado." };
    }

    const numericIds = (targetReceipt.services || [])
      .flatMap((s) => getItemOrderIds(s))
      .filter((id) => !/^PED-\d+$/i.test(id.trim()))
      .flatMap((id) => id.match(/\d{3,}/g) || []);

    if (numericIds.length === 0) {
      return { updated: false, message: "Sin IDs numéricos del proveedor registrados." };
    }

    try {
      const res = await syncOrderWithProvider(numericIds);
      if (!res.success || !res.results || res.results.length === 0) {
        return { updated: false, message: res.error || "No se pudo consultar el proveedor." };
      }

      const foundItems = res.results.filter((r) => r.found);
      if (foundItems.length === 0) {
        return { updated: false, message: "Ningún ID coincide aún con el proveedor." };
      }

      const allCompleted = foundItems.every((r) => r.mappedStatus === "completado");
      const anyPartial = foundItems.some((r) => r.mappedStatus === "parcial");
      const anyProcessing = foundItems.some((r) => r.mappedStatus === "procesando");
      const anyInProcess = foundItems.some((r) => r.mappedStatus === "en_proceso");
      const anyCanceled = foundItems.some((r) => r.mappedStatus === "cancelado");

      let determinedStatus: "completado" | "en_proceso" | "parcial" | "procesando" | "cancelado" = "en_proceso";
      if (allCompleted) determinedStatus = "completado";
      else if (anyPartial) determinedStatus = "parcial";
      else if (anyProcessing) determinedStatus = "procesando";
      else if (anyInProcess) determinedStatus = "en_proceso";
      else if (anyCanceled) determinedStatus = "cancelado";
      else determinedStatus = "en_proceso";

      const oldStatus = getNormalizedStatus(targetReceipt.status);
      const rawStatusSummary = foundItems.map((f) => `#${f.orderId}: ${f.rawStatus}`).join(", ");

      if (determinedStatus !== oldStatus) {
        const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
        const noteEntry = `[${nowFormatted}] 🔄 Sincronizado automáticamente con MazSocialMarket: ${rawStatusSummary}. Estado actualizado de "${oldStatus}" a "${determinedStatus}".`;
        const updatedNotes = targetReceipt.internalNotes ? `${targetReceipt.internalNotes}\n${noteEntry}` : noteEntry;

        await updateReceipt(targetReceipt.id, {
          status: determinedStatus,
          internalNotes: updatedNotes,
        });

        return {
          updated: true,
          oldStatus,
          newStatus: determinedStatus,
          rawStatus: rawStatusSummary,
          message: `Estado actualizado a "${determinedStatus}" (${rawStatusSummary}).`
        };
      }

      return {
        updated: false,
        oldStatus,
        newStatus: determinedStatus,
        rawStatus: rawStatusSummary,
        message: `Comprobante verificado con MazSocialMarket (${rawStatusSummary}).`
      };
    } catch (err: any) {
      return { updated: false, message: err.message || "Error al conectar con MazSocialMarket." };
    }
  };

  /**
   * Syncs all receipts that have numeric provider IDs with MazSocialMarket API in batch.
   * If any order status on provider differs from the app status (e.g. was marked completed but provider says In progress),
   * updates receipt in Firestore to match the provider reality.
   */
  const syncAllInProcessOrdersWithProvider = async (): Promise<{
    checkedCount: number;
    updatedCount: number;
    details: string[];
  }> => {
    // Select ALL receipts having numeric provider IDs, regardless of current status
    const targetReceipts = receipts.filter((r) => {
      const ids = (r.services || [])
        .flatMap((s) => getItemOrderIds(s))
        .map((id) => id.replace(/^#/, "").trim())
        .filter((id) => /^\d{3,}$/.test(id));
      return ids.length > 0;
    });

    if (targetReceipts.length === 0) {
      return {
        checkedCount: 0,
        updatedCount: 0,
        details: ["No se encontraron comprobantes con IDs numéricos de MazSocialMarket registrados. (Los IDs de prueba como PED-... no existen en el proveedor)."]
      };
    }

    const allOrderIds: string[] = [];
    const receiptToIds = new Map<string, string[]>();

    for (const r of targetReceipts) {
      const ids = (r.services || [])
        .flatMap((s) => getItemOrderIds(s))
        .map((id) => id.replace(/^#/, "").trim())
        .filter((id) => /^\d{3,}$/.test(id));

      if (ids.length > 0) {
        receiptToIds.set(r.id, ids);
        ids.forEach((id) => {
          if (!allOrderIds.includes(id)) {
            allOrderIds.push(id);
          }
        });
      }
    }

    if (allOrderIds.length === 0) {
      return { checkedCount: 0, updatedCount: 0, details: ["No hay IDs numéricos válidos para consultar."] };
    }

    try {
      // Chunk IDs into groups of 50 to respect SMM API URL constraints
      const chunkSize = 50;
      const resultMap = new Map<string, ProviderOrderSyncResult>();

      for (let i = 0; i < allOrderIds.length; i += chunkSize) {
        const chunk = allOrderIds.slice(i, i + chunkSize);
        const res = await syncOrderWithProvider(chunk);
        if (res.success && res.results) {
          res.results.forEach((item) => resultMap.set(item.orderId, item));
        }
      }

      let updatedCount = 0;
      const details: string[] = [];

      for (const r of targetReceipts) {
        const ids = receiptToIds.get(r.id) || [];
        if (ids.length === 0) continue;

        const orderResults = ids.map((id) => resultMap.get(id)).filter(Boolean) as ProviderOrderSyncResult[];
        const foundResults = orderResults.filter((item) => item.found);

        if (foundResults.length > 0) {
          const allCompleted = foundResults.every((item) => item.mappedStatus === "completado");
          const anyPartial = foundResults.some((item) => item.mappedStatus === "parcial");
          const anyProcessing = foundResults.some((item) => item.mappedStatus === "procesando");
          const anyInProcess = foundResults.some((item) => item.mappedStatus === "en_proceso");
          const anyCanceled = foundResults.some((item) => item.mappedStatus === "cancelado");

          let finalStatus: "completado" | "en_proceso" | "parcial" | "procesando" | "cancelado" = "en_proceso";
          if (allCompleted) finalStatus = "completado";
          else if (anyPartial) finalStatus = "parcial";
          else if (anyProcessing) finalStatus = "procesando";
          else if (anyInProcess) finalStatus = "en_proceso";
          else if (anyCanceled) finalStatus = "cancelado";
          else finalStatus = "en_proceso";

          const currentNormalized = getNormalizedStatus(r.status);
          if (finalStatus !== currentNormalized) {
            const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
            const summary = foundResults.map((f) => `#${f.orderId} (${f.rawStatus})`).join(", ");
            const noteEntry = `[${nowFormatted}] 🔄 Sincronizado automáticamente con MazSocialMarket: ${summary}. Estado actualizado de "${currentNormalized}" a "${finalStatus}".`;
            const updatedNotes = r.internalNotes ? `${r.internalNotes}\n${noteEntry}` : noteEntry;

            await updateReceipt(r.id, {
              status: finalStatus,
              internalNotes: updatedNotes,
            });

            updatedCount++;
            details.push(`Comprobante #${r.consecutive || r.id} (${r.clientName}): ${summary} -> Cambiado de "${currentNormalized}" a "${finalStatus}"`);
          }
        }
      }

      return {
        checkedCount: allOrderIds.length,
        updatedCount,
        details
      };
    } catch (err: any) {
      console.error("Error al sincronizar historial con proveedor:", err);
      throw err;
    }
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

  /**
   * Executes the referential integrity audit between clients, receipts, and warranties.
   */
  const runIntegrityAudit = (): IntegrityAuditReport => {
    return runReferentialIntegrityAudit(clients, receipts, supplierWarranties);
  };

  /**
   * Automatically repairs all referential integrity discrepancies in Firestore:
   * - Re-links or creates clients for orphan receipts
   * - Synchronizes bidirectional links (receipt.clientId <-> client.receiptIds)
   * - Removes dangling deleted receiptIds from client documents
   * - Normalizes tracking IDs (orderId <-> orderIds, strips temporary PED- placeholders when real IDs exist, clears false resend flags)
   * - Recalculates purchaseCount, totalSpent, and lastPurchaseDate
   */
  const repairReferentialIntegrity = async (): Promise<{
    fixedCount: number;
    details: string[];
    reportAfter: IntegrityAuditReport;
  }> => {
    const details: string[] = [];
    let fixedCount = 0;

    const receiptById = new Map<string, Receipt>();
    receipts.forEach((r) => receiptById.set(r.id, r));

    const { clientToReceipts, receiptToClient } = buildReceiptsClientIndex(clients, receipts);

    const usedCodes = new Set<number>([97]);
    clients.forEach((c) => {
      const n = parseInt((c.clientCode || "").trim(), 10);
      if (!isNaN(n) && n > 0 && n !== 97) usedCodes.add(n);
    });
    const getNextCode = () => {
      const valid = Array.from(usedCodes).filter((n) => n !== 97);
      let next = valid.length > 0 ? Math.max(...valid) + 1 : 1;
      while (usedCodes.has(next) || next === 97) next++;
      usedCodes.add(next);
      return String(next).padStart(4, "0");
    };

    const batch = writeBatch(db);
    let batchOps = 0;

    // 1. Repair receipts: orphan receipts, clientId foreign keys, and tracking ID discrepancies
    const newlyLinkedToClient = new Map<string, string[]>();

    for (const r of receipts) {
      const receiptPatch: Record<string, any> = {};
      let targetClient = receiptToClient.get(r.id);

      // If orphan, match by contact/name or create client
      if (!targetClient) {
        targetClient = clients.find(
          (c) =>
            matchContacts(c.phone, r.clientPhone) ||
            (r.clientName && c.name && c.name.trim().toLowerCase() === r.clientName.trim().toLowerCase())
        );

        if (targetClient) {
          receiptPatch.clientId = targetClient.id;
          if (!newlyLinkedToClient.has(targetClient.id)) newlyLinkedToClient.set(targetClient.id, []);
          newlyLinkedToClient.get(targetClient.id)!.push(r.id);
          details.push(`Pedido huérfano #${r.consecutive} vinculado al cliente existente #${targetClient.clientCode || "---"} "${targetClient.name}".`);
          fixedCount++;
        } else {
          const newId = r.clientId || generateClientId(r.clientName, r.clientPhone, true);
          const newCode = getNextCode();
          const newClient: Client = {
            id: newId,
            clientCode: newCode,
            name: (r.clientName || "Cliente").trim(),
            phone: (r.clientPhone || "").trim(),
            purchaseCount: 1,
            totalSpent: Number(r.totalCharged) || 0,
            lastPurchaseDate: r.date,
            receiptIds: [r.id],
            createdAt: r.date,
            tag: getClientTagForSpending(Number(r.totalCharged) || 0),
          };
          batch.set(doc(db, "clients", newId), cleanForFirestore(newClient), { merge: true });
          batchOps++;
          receiptPatch.clientId = newId;
          details.push(`Pedido huérfano #${r.consecutive}: se creó ficha de cliente #${newCode} "${newClient.name}" y se vinculó.`);
          fixedCount++;
        }
      } else if (r.clientId !== targetClient.id) {
        receiptPatch.clientId = targetClient.id;
        details.push(`Pedido #${r.consecutive}: actualizado clientId -> "${targetClient.id}" (Cliente #${targetClient.clientCode || "---"}).`);
        fixedCount++;
      }

      // Check tracking IDs on services
      let servicesModified = false;
      const cleanedServices = (r.services || []).map((srv) => {
        const rawOrderId = String(srv.orderId || "").trim();
        const splitFromOrderId = rawOrderId
          ? rawOrderId.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean)
          : [];
        const rawOrderIds = Array.isArray(srv.orderIds)
          ? srv.orderIds.map((id) => String(id || "").trim()).filter(Boolean)
          : [];

        const combined = Array.from(new Set([...splitFromOrderId, ...rawOrderIds]));
        const realIds = combined.filter((id) => !/^PED-\d+$/i.test(id));
        const pedIds = combined.filter((id) => /^PED-\d+$/i.test(id));
        const finalIds = realIds.length > 0 ? realIds : combined;

        const isValidReorderHistory =
          (Boolean(srv.isResent) || Boolean(srv.previousOrderId) || finalIds.length > splitFromOrderId.length) &&
          splitFromOrderId.length > 0 &&
          splitFromOrderId.every((id) => finalIds.includes(id));

        const expectedPrimary = isValidReorderHistory
          ? splitFromOrderId.join(", ")
          : finalIds.join(", ");

        const hasMixedPed = realIds.length > 0 && pedIds.length > 0;
        const hasDesync =
          finalIds.length > 0 &&
          !isValidReorderHistory &&
          (splitFromOrderId.join(",") !== finalIds.join(",") || (rawOrderIds.length > 0 && rawOrderIds.join(",") !== finalIds.join(",")));

        const falseResend =
          Boolean(srv.isResent) &&
          Boolean(
            (srv.previousOrderId && /^PED-\d+$/i.test(srv.previousOrderId.trim())) ||
              (srv.previousOrderId && srv.previousOrderId.trim() === expectedPrimary)
          );

        if (hasMixedPed || hasDesync || falseResend) {
          servicesModified = true;
          return {
            ...srv,
            orderId: expectedPrimary || srv.orderId,
            orderIds: finalIds.length > 0 ? finalIds : srv.orderIds,
            isResent: falseResend ? false : srv.isResent,
            previousOrderId: falseResend ? undefined : srv.previousOrderId,
            resendDate: falseResend ? undefined : srv.resendDate,
            resendNote: falseResend ? undefined : srv.resendNote,
          };
        }
        return srv;
      });

      if (servicesModified) {
        receiptPatch.services = cleanedServices;
        details.push(`Pedido #${r.consecutive}: normalizados IDs de seguimiento (orderId / orderIds).`);
        fixedCount++;
      }

      if (Object.keys(receiptPatch).length > 0 && batchOps < 420) {
        batch.set(doc(db, "receipts", r.id), cleanForFirestore(receiptPatch), { merge: true });
        batchOps++;
      }
    }

    // 2. Repair clients: dangling receiptIds, missing receiptIds, missing codes, and stats
    for (const c of clients) {
      const clientPatch: Record<string, any> = {};
      const rawCode = (c.clientCode || "").trim();
      const paddedCode = rawCode ? rawCode.padStart(4, "0") : "";
      if (!paddedCode || paddedCode === "0000" || paddedCode === "0097" || isNaN(parseInt(paddedCode, 10))) {
        const assigned = getNextCode();
        clientPatch.clientCode = assigned;
        details.push(`Cliente "${c.name}": asignado código válido #${assigned}.`);
        fixedCount++;
      }

      const storedValidIds = (c.receiptIds || []).filter((rid) => receiptById.has(rid));
      const danglingCount = (c.receiptIds || []).length - storedValidIds.length;
      const indexedRecs = clientToReceipts.get(c.id) || [];
      const extraLinked = newlyLinkedToClient.get(c.id) || [];

      const consolidatedIds = Array.from(
        new Set([...storedValidIds, ...indexedRecs.map((r) => r.id), ...extraLinked])
      ).filter((rid) => receiptById.has(rid));

      const currentIds = c.receiptIds || [];
      const idsChanged =
        danglingCount > 0 ||
        currentIds.length !== consolidatedIds.length ||
        !consolidatedIds.every((id) => currentIds.includes(id));

      if (idsChanged) {
        clientPatch.receiptIds = consolidatedIds;
        details.push(
          `Cliente #${c.clientCode || "---"} "${c.name}": sincronizada lista 'receiptIds' (${consolidatedIds.length} pedidos válidos${danglingCount > 0 ? `, ${danglingCount} IDs huérfanos eliminados` : ""}).`
        );
        fixedCount++;
      }

      const validReceipts = consolidatedIds.map((rid) => receiptById.get(rid)!).filter(Boolean);
      if (validReceipts.length > 0) {
        const actualCount = validReceipts.length;
        const actualSpent = validReceipts.reduce((sum, r) => sum + (Number(r.totalCharged) || 0), 0);
        const sortedRecs = [...validReceipts].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const actualLastDate = sortedRecs[0].date;

        if ((c.purchaseCount || 0) !== actualCount || Math.abs((c.totalSpent || 0) - actualSpent) > 1) {
          clientPatch.purchaseCount = actualCount;
          clientPatch.totalSpent = actualSpent;
          clientPatch.lastPurchaseDate = actualLastDate;
          clientPatch.tag = getClientTagForSpending(actualSpent);
          details.push(
            `Cliente #${c.clientCode || "---"} "${c.name}": estadísticas recalculadas (${actualCount} pedidos / $${Math.round(actualSpent).toLocaleString("es-CO")}).`
          );
          fixedCount++;
        }
      }

      if (Object.keys(clientPatch).length > 0 && batchOps < 450) {
        batch.set(doc(db, "clients", c.id), cleanForFirestore(clientPatch), { merge: true });
        batchOps++;
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    const reportAfter = runReferentialIntegrityAudit(clients, receipts, supplierWarranties);
    return { fixedCount, details, reportAfter };
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
        syncReceiptWithProvider,
        syncAllInProcessOrdersWithProvider,
        updateClientTag,
        updateClient,
        reassignClientCode,
        resolveDuplicateClientCodes,
        mergeDuplicateClients,
        separateReceiptToNewClient,
        restoreDefaults,
        runIntegrityAudit,
        repairReferentialIntegrity
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
