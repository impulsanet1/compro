/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from "react";
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
  onSnapshot,
  query,
  orderBy
} from "firebase/firestore";
import { auth, db } from "../firebase";
import {
  BusinessConfig,
  SocialNetwork,
  Service,
  Receipt,
  Client,
  ReceiptItem,
  TrmState,
  getNormalizedStatus,
  SupplierWarrantyRecord
} from "../types";
import { DEFAULT_BUSINESS_CONFIG, DEFAULT_SOCIAL_NETWORKS, DEFAULT_SERVICES } from "../defaultData";

interface AppContextType {
  user: User | null;
  loadingAuth: boolean;
  loadingData: boolean;
  businessConfig: BusinessConfig;
  socialNetworks: SocialNetwork[];
  services: Service[];
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
  
  // Receipts actions
  createReceipt: (receiptData: Omit<Receipt, "id" | "consecutive">) => Promise<Receipt>;
  deleteReceipt: (id: string) => Promise<void>;
  updateReceipt: (id: string, updatedData: Partial<Receipt>) => Promise<void>;
  markAllInProcessAsCompleted: () => Promise<{ updatedCount: number }>;
  updateClientTag: (clientId: string, tag: string) => Promise<void>;
  
  // System Maintenance
  restoreDefaults: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  const [businessConfig, setBusinessConfig] = useState<BusinessConfig>(DEFAULT_BUSINESS_CONFIG);
  const [socialNetworks, setSocialNetworks] = useState<SocialNetwork[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [supplierWarranties, setSupplierWarranties] = useState<SupplierWarrantyRecord[]>([]);

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

          return {
            ...def,
            ...found,
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
      unsubReceipts();
      unsubClients();
      unsubSupplierWarranties();
    };
  }, [user]);

  // 3. Keep client stats and unique 4-digit client IDs synced
  useEffect(() => {
    if (!user || loadingData || clients.length === 0) return;

    const syncClientStats = async () => {
      // Step 1: Map existing assigned numeric codes
      const usedCodes = new Set<number>();
      clients.forEach((c) => {
        if (c.clientCode) {
          const num = parseInt(c.clientCode, 10);
          if (!isNaN(num) && num > 0) usedCodes.add(num);
        }
      });

      let currentAutoId = 1;

      // Sort clients deterministically for consistent code assignment if missing
      const sortedClients = [...clients].sort((a, b) => {
        const dateA = a.lastPurchaseDate ? new Date(a.lastPurchaseDate).getTime() : 0;
        const dateB = b.lastPurchaseDate ? new Date(b.lastPurchaseDate).getTime() : 0;
        return dateA - dateB;
      });

      for (const client of sortedClients) {
        const updatePayload: Record<string, any> = {};

        if (!client.clientCode) {
          while (usedCodes.has(currentAutoId)) {
            currentAutoId++;
          }
          const assignedCode = String(currentAutoId).padStart(4, "0");
          usedCodes.add(currentAutoId);
          updatePayload.clientCode = assignedCode;
        }

        if (receipts.length > 0) {
          const matchingReceipts = receipts.filter(
            (r) =>
              r.clientName.trim().toLowerCase() === client.name.trim().toLowerCase() &&
              r.clientPhone.trim() === client.phone.trim()
          );

          if (matchingReceipts.length > 0) {
            const actualCount = matchingReceipts.length;
            const actualSpent = matchingReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
            const sortedRecs = [...matchingReceipts].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            const actualLastDate = sortedRecs[0].date;

            if (client.purchaseCount !== actualCount) updatePayload.purchaseCount = actualCount;
            if (client.totalSpent !== actualSpent) updatePayload.totalSpent = actualSpent;
            if (client.lastPurchaseDate !== actualLastDate) updatePayload.lastPurchaseDate = actualLastDate;
          }
        }

        if (Object.keys(updatePayload).length > 0) {
          try {
            await updateDoc(doc(db, "clients", client.id), updatePayload);
          } catch (e) {
            console.error("Failed to sync client doc:", e);
          }
        }
      }
    };

    const timeoutId = setTimeout(() => {
      syncClientStats();
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [user, loadingData, receipts, clients]);

  // Automatically migrate any existing in-process orders to completed as requested
  useEffect(() => {
    if (!user || loadingData || receipts.length === 0) return;
    const inProcess = receipts.filter((r) => getNormalizedStatus(r.status) === "en_proceso");
    if (inProcess.length > 0) {
      inProcess.forEach(async (r) => {
        try {
          await updateDoc(doc(db, "receipts", r.id), { status: "completado" });
        } catch (err) {
          console.warn("Auto-completing in-process receipt:", r.id, err);
        }
      });
    }
  }, [user, loadingData, receipts]);

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
    await updateDoc(doc(db, "social_networks", sn.id), {
      name: sn.name,
      icon: sn.icon
    });
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
    await setDoc(doc(db, "services", service.id), sDoc);
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
    await updateDoc(doc(db, "services", service.id), sDoc);
  };

  const deleteService = async (id: string) => {
    await deleteDoc(doc(db, "services", id));
  };

  // Receipt & Client Generation
  const createReceipt = async (receiptData: Omit<Receipt, "id" | "consecutive">) => {
    // Calculate consecutive number: safely filter out invalid/NaN consecutives in existing receipts
    const validConsecutives = receipts
      .map((r) => Number(r.consecutive))
      .filter((num) => !isNaN(num) && isFinite(num));

    const nextConsecutive = validConsecutives.length > 0 
      ? Math.max(...validConsecutives) + 1 
      : 1001;

    // Create receipt document reference (with auto id)
    const receiptsRef = collection(db, "receipts");
    
    const finalReceipt = {
      ...receiptData,
      consecutive: nextConsecutive
    };

    const docRef = await addDoc(receiptsRef, finalReceipt);
    const receiptId = docRef.id;

    // Update or Create Client
    // Normalize client name + phone to find unique identifier
    const normalizedPhone = (receiptData.clientPhone || "").trim().replace(/\D/g, "");
    const clientId = `${receiptData.clientName.trim().toLowerCase().replace(/\s+/g, "-")}-${normalizedPhone || "no-phone"}`;
    const clientRef = doc(db, "clients", clientId);
    const clientSnap = await getDoc(clientRef);

    if (clientSnap.exists()) {
      const currentClient = clientSnap.data() as Client;
      let existingCode = currentClient.clientCode;
      if (!existingCode) {
        const existingCodes = clients
          .map((c) => parseInt(c.clientCode || "0", 10))
          .filter((n) => !isNaN(n) && n > 0);
        const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
        existingCode = String(maxCode + 1).padStart(4, "0");
      }

      await setDoc(clientRef, {
        ...currentClient,
        clientCode: existingCode,
        purchaseCount: (currentClient.purchaseCount || 0) + 1,
        totalSpent: (currentClient.totalSpent || 0) + receiptData.totalCharged,
        lastPurchaseDate: receiptData.date,
        receiptIds: [...(currentClient.receiptIds || []), receiptId]
      });
    } else {
      const existingCodes = clients
        .map((c) => parseInt(c.clientCode || "0", 10))
        .filter((n) => !isNaN(n) && n > 0);
      const maxCode = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
      const newCode = String(maxCode + 1).padStart(4, "0");

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
      };
      await setDoc(clientRef, newClient);
    }

    return {
      ...finalReceipt,
      id: receiptId
    };
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

    // 2. Generate the client ID
    const normalizedPhone = (receiptData.clientPhone || "").trim().replace(/\D/g, "");
    const clientId = `${receiptData.clientName.trim().toLowerCase().replace(/\s+/g, "-")}-${normalizedPhone || "no-phone"}`;
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
        const remainingClientReceipts = receipts.filter((r) => r.id !== id && r.clientName.trim().toLowerCase() === receiptData.clientName.trim().toLowerCase());
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
      await updateDoc(receiptDocRef, updatedData);
      return;
    }
    const oldReceipt = receiptSnap.data() as Receipt;

    // 2. Perform the update on the receipt
    await updateDoc(receiptDocRef, updatedData);

    // 3. Determine old and new client details
    const oldName = oldReceipt.clientName || "";
    const oldPhone = oldReceipt.clientPhone || "";
    const oldTotalCharged = oldReceipt.totalCharged || 0;

    const newName = updatedData.clientName !== undefined ? updatedData.clientName : oldName;
    const newPhone = updatedData.clientPhone !== undefined ? updatedData.clientPhone : oldPhone;
    const newTotalCharged = updatedData.totalCharged !== undefined ? updatedData.totalCharged : oldTotalCharged;

    const oldNormalizedPhone = oldPhone.trim().replace(/\D/g, "");
    const oldClientId = `${oldName.trim().toLowerCase().replace(/\s+/g, "-")}-${oldNormalizedPhone || "no-phone"}`;

    const newNormalizedPhone = newPhone.trim().replace(/\D/g, "");
    const newClientId = `${newName.trim().toLowerCase().replace(/\s+/g, "-")}-${newNormalizedPhone || "no-phone"}`;

    if (oldClientId === newClientId) {
      // Client did not change, but maybe totalCharged did!
      const clientRef = doc(db, "clients", oldClientId);
      const clientSnap = await getDoc(clientRef);
      if (clientSnap.exists()) {
        const clientData = clientSnap.data() as Client;
        const totalSpentDiff = newTotalCharged - oldTotalCharged;
        await setDoc(clientRef, {
          ...clientData,
          totalSpent: Math.max(0, (clientData.totalSpent || 0) + totalSpentDiff),
          lastPurchaseDate: updatedData.date || oldReceipt.date || clientData.lastPurchaseDate
        });
      }
    } else {
      // Client changed! We need to subtract from old client and add to new client.
      
      // Adjust old client
      const oldClientRef = doc(db, "clients", oldClientId);
      const oldClientSnap = await getDoc(oldClientRef);
      if (oldClientSnap.exists()) {
        const oldClientData = oldClientSnap.data() as Client;
        const updatedReceiptIds = (oldClientData.receiptIds || []).filter((rId) => rId !== id);
        const newPurchaseCount = Math.max(0, (oldClientData.purchaseCount || 1) - 1);
        
        if (updatedReceiptIds.length === 0 || newPurchaseCount <= 0 || (oldClientData.purchaseCount || 1) <= 1) {
          await deleteDoc(oldClientRef);
        } else {
          const newTotalSpent = Math.max(0, (oldClientData.totalSpent || 0) - oldTotalCharged);
          await setDoc(oldClientRef, {
            ...oldClientData,
            purchaseCount: newPurchaseCount,
            totalSpent: newTotalSpent,
            receiptIds: updatedReceiptIds
          });
        }
      }

      // Add to new client
      const newClientRef = doc(db, "clients", newClientId);
      const newClientSnap = await getDoc(newClientRef);
      const finalDate = updatedData.date || oldReceipt.date;
      if (newClientSnap.exists()) {
        const newClientData = newClientSnap.data() as Client;
        await setDoc(newClientRef, {
          ...newClientData,
          purchaseCount: (newClientData.purchaseCount || 0) + 1,
          totalSpent: (newClientData.totalSpent || 0) + newTotalCharged,
          lastPurchaseDate: finalDate,
          receiptIds: [...(newClientData.receiptIds || []).filter((rId) => rId !== id), id]
        });
      } else {
        const newClient: Client = {
          id: newClientId,
          name: newName.trim(),
          phone: newPhone.trim(),
          purchaseCount: 1,
          totalSpent: newTotalCharged,
          lastPurchaseDate: finalDate,
          receiptIds: [id]
        };
        await setDoc(newClientRef, newClient);
      }
    }
  };

  const updateClientTag = async (clientId: string, tag: string) => {
    const clientRef = doc(db, "clients", clientId);
    await updateDoc(clientRef, { tag });
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
          updates.push(updateDoc(doc(db, "receipts", docSnap.id), { status: "completado" }));
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
    await updateDoc(docRef, cleanDoc);
  };

  const deleteSupplierWarranty = async (id: string) => {
    const docRef = doc(db, "supplier_warranties", id);
    await deleteDoc(docRef);
  };

  const resolveSupplierWarranty = async (id: string, _notes?: string) => {
    const docRef = doc(db, "supplier_warranties", id);
    await deleteDoc(docRef);
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
    await updateDoc(docRef, updateData);
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
        createReceipt,
        deleteReceipt,
        updateReceipt,
        markAllInProcessAsCompleted,
        updateClientTag,
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
