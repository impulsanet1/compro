/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  Plus,
  Trash2,
  FileText,
  Eye,
  EyeOff,
  User,
  AlertCircle,
  PlusCircle,
  Search,
  Check,
  X,
  Copy,
  RefreshCw,
  Sparkles,
  Layers,
  Calculator,
  MessageSquare,
  CreditCard,
  Hash,
  PackageOpen,
  Instagram,
  Zap,
  ChevronDown,
  ChevronUp,
  Settings2,
  DollarSign
} from "lucide-react";
import {
  ReceiptItem,
  Receipt,
  ReceiptStatus,
  Client,
  Service,
  getServiceBaseCosts,
  calculateServicePrices,
  getClientCode,
  calculateSupplierCostUSD,
  calculateSupplierCostCOP,
  getItemOrderIds,
  generateCustomServiceCode,
  getOrderIdTypeLabel,
  getCustomServicePrefix,
  normalizeContact,
  matchPhones,
  matchContacts,
  getPhoneDigits,
  isTarjetaDigitalService,
  extractInstagramUsername,
  InstagramProfileData,
  formatProviderStatus
} from "../types";
import { motion } from "motion/react";
import { safeCopyToClipboard } from "../utils";
import { syncOrderWithProvider, fetchInstagramProfile } from "../services/providerApi";
import { QuoteCalculatorView } from "./QuoteCalculatorView";

export interface InitialClientDraft {
  id?: string;
  name: string;
  phone: string;
  targetAccount?: string;
  sourceConsecutive?: number;
}

interface GeneratorViewProps {
  onReceiptGenerated: (receipt: Receipt) => void;
  initialItems?: Partial<ReceiptItem>[];
  initialClient?: InitialClientDraft | null;
}

export const GeneratorView: React.FC<GeneratorViewProps> = ({ onReceiptGenerated, initialItems, initialClient }) => {
  const { socialNetworks, services, combos, createReceipt, businessConfig, clients, trmState, isDarkMode } = useApp();
  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  // Client info state
  const [clientName, setClientName] = useState(() => initialClient?.name || "");
  const [clientPhone, setClientPhone] = useState(() => initialClient?.phone || "");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [selectedClientObj, setSelectedClientObj] = useState<Client | null>(() => {
    if (initialClient?.id) {
      return clients.find((c) => c.id === initialClient.id) || null;
    }
    return null;
  });

  // Client search results with strict deduplication
  const matchingClients = useMemo(() => {
    if (!(clientSearchQuery || "").trim()) return [];
    const query = (clientSearchQuery || "").trim().toLowerCase();
    const queryClean = query.replace(/^@+/, "");

    // Find all matching clients with defensive null checks
    const matched = clients
      .map((c, idx) => ({ ...c, code: getClientCode(c, idx) }))
      .filter((c) => {
        const codeStr = String(c.code || "").toLowerCase();
        const clientCodeStr = String(c.clientCode || "").toLowerCase();
        const nameStr = String(c.name || "").toLowerCase();
        const phoneStr = String(c.phone || "").toLowerCase();
        const phoneClean = phoneStr.replace(/^@+/, "");
        const idStr = String(c.id || "").toLowerCase();

        return (
          codeStr.includes(query) ||
          clientCodeStr.includes(query) ||
          nameStr.includes(query) ||
          nameStr.includes(queryClean) ||
          phoneStr.includes(query) ||
          phoneClean.includes(queryClean) ||
          idStr.includes(queryClean)
        );
      });

    // Deduplicate: If multiple records represent the same contact or same clientCode, keep the authoritative one
    const uniqueList: (Client & { code: string })[] = [];

    for (const c of matched) {
      const isDuplicate = uniqueList.some((existing) => {
        // 1. Same client code or consecutive
        if (c.code && existing.code && c.code !== "0000" && c.code === existing.code) return true;
        if (c.clientCode && existing.clientCode && String(c.clientCode).trim() === String(existing.clientCode).trim()) return true;

        // 2. Same contact (handle or phone)
        if (matchContacts(c.phone, existing.phone)) return true;

        // 3. Same phone digits
        const cDigits = getPhoneDigits(c.phone);
        const exDigits = getPhoneDigits(existing.phone);
        if (cDigits.length >= 7 && exDigits.length >= 7 && (cDigits === exDigits || matchPhones(c.phone, existing.phone))) {
          return true;
        }

        // 4. Same exact client name and phone
        const cName = String(c.name || "").trim().toLowerCase();
        const exName = String(existing.name || "").trim().toLowerCase();
        if (cName && exName && cName === exName) {
          if (!cDigits || !exDigits || cDigits === exDigits || matchPhones(c.phone, existing.phone)) {
            return true;
          }
        }

        return false;
      });

      if (!isDuplicate) {
        uniqueList.push(c);
      }
      if (uniqueList.length >= 6) break;
    }

    return uniqueList;
  }, [clients, clientSearchQuery]);

  const handleSelectClient = (client: Client & { code: string }) => {
    setClientName(client.name || "");
    setClientPhone(client.phone || "");
    setSelectedClientObj(client);
    setForceNewClient(false);
    setClientSearchQuery("");
  };

  // Entry mode: "catalog" | "combo" | "budget" (cotizador directo por presupuesto) | "custom"
  const [serviceEntryMode, setServiceEntryMode] = useState<"catalog" | "combo" | "budget" | "custom">("catalog");
  const [showMultiQuoteView, setShowMultiQuoteView] = useState<boolean>(false);

  // Quick Budget Calculator State (Proposal 3)
  const [budgetAmountInput, setBudgetAmountInput] = useState<string>("30000");
  const [budgetPricingMode, setBudgetPricingMode] = useState<"catalog" | "margin">("catalog");
  const [budgetMarginPercent, setBudgetMarginPercent] = useState<number>(80);

  // Combo Selection State
  const [selectedComboId, setSelectedComboId] = useState<string>("");
  const [customComboPrice, setCustomComboPrice] = useState<string>("");
  const [comboItemOrderIds, setComboItemOrderIds] = useState<Record<number, string>>({});
  const [customItemCategory, setCustomItemCategory] = useState("Tarjetas Digitales");
  const [customItemName, setCustomItemName] = useState("");
  const [customItemQty, setCustomItemQty] = useState("1");
  const [customItemChargedPrice, setCustomItemChargedPrice] = useState("");
  const [autoServiceCode, setAutoServiceCode] = useState<string>(() => generateCustomServiceCode("Tarjetas Digitales", ""));
  const [useAutoServiceCode, setUseAutoServiceCode] = useState<boolean>(true);

  // Current adding item state
  const [selectedSocialId, setSelectedSocialId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  
  // Quantity selector state: preset quantity OR "custom"
  const [selectedQtyMode, setSelectedQtyMode] = useState<string>(""); // e.g. "1000", "5000" or "custom"
  const [customQtyValue, setCustomQtyValue] = useState<string>(""); // Custom number e.g. 3250, 7500

  // Custom provider cost override for this specific order/item
  const [itemProviderCost, setItemProviderCost] = useState<string>("");
  const [isOverridingCost, setIsOverridingCost] = useState<boolean>(false);

  // Custom charged price & order IDs
  const [customChargedPrice, setCustomChargedPrice] = useState("");
  const [customOrderId, setCustomOrderId] = useState("");
  const [customOrderId2, setCustomOrderId2] = useState("");
  const [idCountType, setIdCountType] = useState<"uno" | "dos">("uno");
  const [status, setStatus] = useState<ReceiptStatus>("completado");
  const [internalNotes, setInternalNotes] = useState("");

  // Live Instagram Verification & Start Count State (Option A)
  const [itemTargetAccount, setItemTargetAccount] = useState(() => initialClient?.targetAccount || "");
  const [itemStartCount, setItemStartCount] = useState<string>("");
  const [isCheckingIg, setIsCheckingIg] = useState<boolean>(false);
  const [igProfileFeedback, setIgProfileFeedback] = useState<InstagramProfileData | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

  // Sync initialClient if prop changes
  useEffect(() => {
    if (initialClient) {
      setClientName(initialClient.name || "");
      setClientPhone(initialClient.phone || "");
      if (initialClient.targetAccount) {
        setItemTargetAccount(initialClient.targetAccount);
      }
      if (initialClient.id) {
        const found = clients.find((c) => c.id === initialClient.id) || null;
        setSelectedClientObj(found);
      }
    }
  }, [initialClient, clients]);

  // Auto-sync target account from client phone or contact if it looks like an Instagram handle
  useEffect(() => {
    if (!itemTargetAccount && clientPhone) {
      const u = extractInstagramUsername(clientPhone);
      if (u) {
        setItemTargetAccount(`@${u}`);
      }
    }
  }, [clientPhone, itemTargetAccount]);

  const handleVerifyInstagramInitialCount = async () => {
    if (!(itemTargetAccount || "").trim()) return;
    setIsCheckingIg(true);
    setIgProfileFeedback(null);
    try {
      const res = await fetchInstagramProfile(itemTargetAccount);
      if (res.success && res.profile) {
        setIgProfileFeedback(res.profile as any);
        if (res.profile.followersCount !== null && res.profile.followersCount !== undefined) {
          setItemStartCount(String(res.profile.followersCount));
        }
      } else {
        setIgProfileFeedback({
          username: extractInstagramUsername(itemTargetAccount) || itemTargetAccount,
          followersCount: null,
          source: 'not_found',
          error: res.error || 'No se pudo consultar el conteo en vivo de este perfil.',
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err: any) {
      setIgProfileFeedback({
        username: extractInstagramUsername(itemTargetAccount) || itemTargetAccount,
        followersCount: null,
        source: 'not_found',
        error: err.message || 'Error de conexión.',
        updatedAt: new Date().toISOString()
      });
    } finally {
      setIsCheckingIg(false);
    }
  };

  // Live Provider Sync Feedback State (MazSocialMarket)
  const [providerSyncChecking, setProviderSyncChecking] = useState(false);
  const [providerOrderFeedback, setProviderOrderFeedback] = useState<{
    orderId: string;
    found: boolean;
    rawStatus: string;
    mappedStatus: ReceiptStatus;
    autoCostCOP?: number | null;
    autoStartCount?: string | number | null;
    autoQuantity?: number | null;
    error?: string;
  } | null>(null);

  // Debounced auto-sync as soon as user types or pastes ID in Emitir comprobante
  useEffect(() => {
    const rawId = (customOrderId || customOrderId2 || "").trim();
    const matches = rawId.match(/\d{3,}/g);
    if (!matches || matches.length === 0) {
      setProviderOrderFeedback(null);
      setProviderSyncChecking(false);
      return;
    }

    const targetId = matches[0];
    setProviderSyncChecking(true);

    const timer = setTimeout(async () => {
      try {
        const res = await syncOrderWithProvider(targetId);
        if (res.success && res.results && res.results.length > 0) {
          const item = res.results[0];
          if (item.found) {
            const safeMappedStatus: ReceiptStatus =
              item.mappedStatus === "desconocido" ? "en_proceso" : item.mappedStatus;

            // 1. Auto-fill provider cost if returned by MazSocialMarket
            let detectedCostCOP: number | null = null;
            if (item.charge !== null && item.charge !== undefined) {
              const rawCharge = parseFloat(String(item.charge));
              if (!isNaN(rawCharge) && rawCharge > 0) {
                const curr = String(item.currency || "USD").toUpperCase();
                if (curr === "COP" || rawCharge > 100) {
                  detectedCostCOP = Math.round(rawCharge);
                } else {
                  detectedCostCOP = Math.round(rawCharge * (trmState.valor || 4200));
                }
                setIsOverridingCost(true);
                setItemProviderCost(String(detectedCostCOP));
              }
            }

            // 2. Auto-fill startCount if returned by MazSocialMarket
            let detectedStartCount: string | number | null = null;
            if (
              item.startCount !== null &&
              item.startCount !== undefined &&
              String(item.startCount).trim() !== "" &&
              !isNaN(Number(item.startCount)) &&
              Number(item.startCount) >= 0
            ) {
              detectedStartCount = Number(item.startCount);
              setItemStartCount(String(detectedStartCount));
            }

            // 3. Auto-fill quantity if returned by MazSocialMarket and no quantity chosen yet
            let detectedQty: number | null = null;
            if (item.quantity !== null && item.quantity !== undefined) {
              const qNum = parseInt(String(item.quantity), 10);
              if (!isNaN(qNum) && qNum > 0) {
                detectedQty = qNum;
                setSelectedQtyMode((prevMode) => {
                  if (prevMode) return prevMode;
                  setCustomQtyValue(String(qNum));
                  return "custom";
                });
              }
            }

            setProviderOrderFeedback({
              orderId: item.orderId,
              found: true,
              rawStatus: item.rawStatus,
              mappedStatus: safeMappedStatus,
              autoCostCOP: detectedCostCOP,
              autoStartCount: detectedStartCount,
              autoQuantity: detectedQty,
            });
            // Automatically update receipt status to what the provider reports!
            setStatus(safeMappedStatus);
          } else {
            setProviderOrderFeedback({
              orderId: targetId,
              found: false,
              rawStatus: item.rawStatus || "No encontrado",
              mappedStatus: "en_proceso",
              error: item.error || "ID aún no registrado en MazSocialMarket"
            });
          }
        } else {
          setProviderOrderFeedback({
            orderId: targetId,
            found: false,
            rawStatus: "Sin respuesta",
            mappedStatus: "en_proceso",
            error: res.error || "No encontrado en MazSocialMarket"
          });
        }
      } catch (err: any) {
        setProviderOrderFeedback({
          orderId: targetId,
          found: false,
          rawStatus: "Error",
          mappedStatus: "en_proceso",
          error: err.message
        });
      } finally {
        setProviderSyncChecking(false);
      }
    }, 550);

    return () => clearTimeout(timer);
  }, [customOrderId, customOrderId2, trmState.valor]);

  // Receipt items array
  const [addedItems, setAddedItems] = useState<ReceiptItem[]>(() => {
    if (initialItems && initialItems.length > 0) {
      return initialItems.map((item, idx) => ({
        id: "item_quote_" + Date.now() + "_" + idx,
        socialNetworkId: item.socialNetworkId || "instagram",
        socialNetworkName: item.socialNetworkName || "Instagram",
        serviceId: item.serviceId || "",
        serviceName: item.serviceName || "Servicio",
        quantity: item.quantity || 1000,
        suggestedPrice: item.suggestedPrice || 0,
        chargedPrice: item.chargedPrice || 0,
        providerCostAtPurchase: item.providerCostAtPurchase || 0,
        providerCostUSD: item.providerCostUSD || null,
        providerCostCOP: item.providerCostCOP ?? item.providerCostAtPurchase ?? 0,
        orderId: item.orderId || "",
        orderIds: item.orderIds || [],
        trmUsed: item.trmUsed || null,
        targetAccount: item.targetAccount || initialClient?.targetAccount || undefined,
        startCount: item.startCount,
      }));
    }
    return [];
  });

  // Track provider sync feedback for draft items (e.g. when pasting a new ID in Repeat Order mode)
  const [draftItemSyncFeedback, setDraftItemSyncFeedback] = useState<Record<string, {
    checking: boolean;
    found?: boolean;
    rawStatus?: string;
    mappedStatus?: ReceiptStatus;
    autoCostCOP?: number | null;
  }>>({});

  // Toggle for hiding admin data (sensitive provider cost/profit)
  const [hideAdminData, setHideAdminData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Force new client independence toggle
  const [forceNewClient, setForceNewClient] = useState(false);

  // Warranty options: standard days from config, none (for base services like tarjetas), or custom
  const [warrantyOption, setWarrantyOption] = useState<"standard" | "none" | "custom">("standard");
  const [customWarrantyDays, setCustomWarrantyDays] = useState<number>(30);

  // Calculate WhatsApp Client Code tracking (only the last used code)
  const whatsappCodeStats = useMemo(() => {
    let maxCodeNum = 0;
    clients.forEach((c, idx) => {
      const codeStr = getClientCode(c, idx);
      const num = parseInt(codeStr, 10);
      if (!isNaN(num) && num > maxCodeNum) {
        maxCodeNum = num;
      }
    });

    const lastCodeStr = maxCodeNum > 0 ? String(maxCodeNum).padStart(4, "0") : "0000";
    const nextCodeStr = String(maxCodeNum + 1).padStart(4, "0");
    return { lastCodeStr, nextCodeStr };
  }, [clients]);

  // Real-time client matching indicator
  const detectedClient = useMemo(() => {
    if (selectedClientObj) return selectedClientObj;
    const safeName = (clientName || "").trim();
    const safePhone = (clientPhone || "").trim();
    if (!safeName && !safePhone) return null;
    const normInput = normalizeContact(safePhone);
    return clients.find((c) => {
      const normC = normalizeContact(c.phone);
      if (normInput.type !== "none" && normC.type === normInput.type) {
        if (normInput.type === "handle") return normC.key === normInput.key;
        if (normInput.type === "phone" && matchPhones(c.phone, safePhone)) {
          const cClean = String(c.name || "").trim().toLowerCase();
          const rClean = safeName.toLowerCase();
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
      return false;
    }) || null;
  }, [selectedClientObj, clientName, clientPhone, clients]);

  // Detect if selected network is Instagram
  const isInstagramSelected = useMemo(() => {
    if (!selectedSocialId) return false;
    if (selectedSocialId.toLowerCase() === "instagram") return true;
    const sn = socialNetworks.find((n) => n.id === selectedSocialId);
    return (sn?.name || "").toLowerCase().includes("instagram");
  }, [selectedSocialId, socialNetworks]);

  // Filtered services for selected social network
  // For Instagram: STRICTLY ONLY "Seguidores", "Likes", "Vistas", "Comentarios" are allowed.
  // Any custom services (tarjetas, optimización, publicidad, diseño, etc.) are strictly excluded.
  const availableServices = useMemo(() => {
    const rawServices = services.filter((s) => s.socialNetworkId === selectedSocialId);
    if (!isInstagramSelected) {
      return rawServices;
    }

    const filtered = rawServices.filter((s) => {
      const name = (s.name || "").toLowerCase().trim();
      const id = (s.id || "").toLowerCase();

      // Disallow any custom or non-core services
      if (
        name.includes("optimiz") ||
        name.includes("publicidad") ||
        name.includes("tarjeta") ||
        name.includes("diseño") ||
        name.includes("personaliz") ||
        name.includes("web") ||
        name.includes("servicio") ||
        id.includes("opt") ||
        id.includes("pub")
      ) {
        return false;
      }

      const isSeguidores = name.includes("seguidor") || id.includes("follower");
      const isLikes = name.includes("like") || name.includes("me gusta");
      const isVistas = name.includes("vista") || name.includes("view") || name.includes("reproducci");
      const isComentarios = name.includes("comentario") || id.includes("comment");

      return isSeguidores || isLikes || isVistas || isComentarios;
    });

    // Sort in consistent standard order: Seguidores -> Likes -> Vistas -> Comentarios
    const orderScore = (s: Service) => {
      const name = (s.name || "").toLowerCase();
      const id = (s.id || "").toLowerCase();
      if (name.includes("seguidor") || id.includes("follower")) return 1;
      if (name.includes("like") || name.includes("me gusta")) return 2;
      if (name.includes("vista") || name.includes("view") || name.includes("reproducci")) return 3;
      if (name.includes("comentario") || id.includes("comment")) return 4;
      return 5;
    };

    return [...filtered].sort((a, b) => orderScore(a) - orderScore(b));
  }, [services, selectedSocialId, isInstagramSelected]);

  // Clear selectedServiceId if it becomes invalid under the filtered list
  useEffect(() => {
    if (selectedServiceId && availableServices.length > 0) {
      const exists = availableServices.some((s) => s.id === selectedServiceId);
      if (!exists) {
        setSelectedServiceId("");
        setSelectedQtyMode("");
        setCustomQtyValue("");
      }
    }
  }, [availableServices, selectedServiceId]);

  // Selected Service object
  const selectedServiceObj = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  // Quick preset quantities for selected service
  const presetQuantities = useMemo(() => {
    if (!selectedServiceObj) return [];
    const baseCosts = getServiceBaseCosts(selectedServiceObj);
    return baseCosts.presets;
  }, [selectedServiceObj]);

  // Active numeric quantity calculated from mode
  const effectiveQuantity = useMemo(() => {
    if (!selectedServiceObj || !selectedQtyMode) return 0;
    if (selectedQtyMode === "custom") {
      const q = parseInt(customQtyValue);
      return !isNaN(q) && q > 0 ? q : 0;
    }
    const q = parseInt(selectedQtyMode);
    return !isNaN(q) && q > 0 ? q : 0;
  }, [selectedServiceObj, selectedQtyMode, customQtyValue]);

  // Auto-calculate quantity & price when in "budget" mode (Cotizador Rápido por Presupuesto)
  useEffect(() => {
    if (serviceEntryMode !== "budget") return;
    const budgetNum = parseFloat(budgetAmountInput);
    if (!selectedServiceObj || isNaN(budgetNum) || budgetNum <= 0) {
      setSelectedQtyMode("");
      setCustomQtyValue("");
      setCustomChargedPrice("");
      return;
    }

    const baseCosts = getServiceBaseCosts(selectedServiceObj);
    let unitCostPer1000COP = baseCosts.providerCostPer1000 || 3500;
    if (selectedServiceObj.providerCostUSDPer1000 && trmState.valor) {
      unitCostPer1000COP = selectedServiceObj.providerCostUSDPer1000 * trmState.valor;
    }

    let rawQty = 0;
    if (budgetPricingMode === "catalog") {
      const pricePer1000 = baseCosts.suggestedPricePer1000 || Math.max(unitCostPer1000COP * 3, 10000);
      rawQty = (budgetNum / pricePer1000) * 1000;
    } else {
      const safeMargin = Math.min(98, Math.max(10, budgetMarginPercent));
      const allowedCost = budgetNum * (1 - safeMargin / 100);
      rawQty = unitCostPer1000COP > 0 ? (allowedCost / unitCostPer1000COP) * 1000 : 1000;
    }

    let cleanQty = Math.floor(rawQty);
    if (cleanQty >= 1000) {
      cleanQty = Math.floor(cleanQty / 100) * 100;
    } else if (cleanQty >= 100) {
      cleanQty = Math.floor(cleanQty / 50) * 50;
    }
    cleanQty = Math.max(10, cleanQty);

    const calcCostCOP = Math.round((cleanQty / 1000) * unitCostPer1000COP);
    setSelectedQtyMode("custom");
    setCustomQtyValue(String(cleanQty));
    setCustomChargedPrice(String(Math.round(budgetNum)));
    if (!isOverridingCost) {
      setItemProviderCost(String(calcCostCOP));
    }
  }, [
    serviceEntryMode,
    budgetAmountInput,
    budgetPricingMode,
    budgetMarginPercent,
    selectedServiceObj,
    trmState.valor,
    isOverridingCost
  ]);

  // Auto-calculate suggested price and provider cost when quantity changes (in catalog mode)
  useEffect(() => {
    if (serviceEntryMode === "budget") return;
    if (selectedServiceObj && effectiveQuantity > 0) {
      const { providerCost, suggestedPrice } = calculateServicePrices(selectedServiceObj, effectiveQuantity);
      
      let calculatedProviderCost = providerCost;
      if (selectedServiceObj.providerCostUSDPer1000 && trmState.valor) {
        const copCost = calculateSupplierCostCOP(selectedServiceObj.providerCostUSDPer1000, effectiveQuantity, trmState.valor);
        if (copCost !== null) {
          calculatedProviderCost = Math.round(copCost);
        }
      }

      setCustomChargedPrice(suggestedPrice.toString());
      if (!isOverridingCost) {
        setItemProviderCost(calculatedProviderCost.toString());
      }
    } else {
      if (!isOverridingCost) setItemProviderCost("");
      setCustomChargedPrice("");
    }
  }, [serviceEntryMode, selectedServiceObj, effectiveQuantity, isOverridingCost, trmState.valor]);

  // Selected combo object
  const selectedComboObj = useMemo(() => {
    return combos.find((c) => c.id === selectedComboId) || null;
  }, [combos, selectedComboId]);

  // When combo is chosen, sync customComboPrice and initialize empty/auto order IDs
  useEffect(() => {
    if (selectedComboObj) {
      setCustomComboPrice(selectedComboObj.comboPrice.toString());
      const initialIds: Record<number, string> = {};
      selectedComboObj.items.forEach((_, idx) => {
        initialIds[idx] = "";
      });
      setComboItemOrderIds(initialIds);
    } else {
      setCustomComboPrice("");
      setComboItemOrderIds({});
    }
  }, [selectedComboObj]);

  // Reset service and quantity fields when social network changes
  useEffect(() => {
    setSelectedServiceId("");
    setSelectedQtyMode("");
    setCustomQtyValue("");
    setIsOverridingCost(false);
  }, [selectedSocialId]);

  // Reset quantity fields when service changes
  useEffect(() => {
    setSelectedQtyMode("");
    setCustomQtyValue("");
    setIsOverridingCost(false);
  }, [selectedServiceId]);

  // Auto-set warranty:
  // - If only Tarjetas Digitales / NFC are in draft: auto-set to 'none' (Sin garantía).
  // - If ANY social media service (seguidores, likes, vistas, comentarios, etc.) is in draft:
  //   auto-set to 'standard' (30 días).
  useEffect(() => {
    if (addedItems.length > 0) {
      const isOnlyCards = addedItems.every(isTarjetaDigitalService);
      if (isOnlyCards) {
        setWarrantyOption("none");
      } else {
        // If it was 'none', restore to 'standard' because this order contains social media services with warranty
        if (warrantyOption === "none") {
          setWarrantyOption("standard");
        }
      }
    } else {
      setWarrantyOption("standard");
    }
  }, [addedItems]);

  // Helper to build pending item(s) from the active form without requiring user to click "Agregar al Borrador" first
  const buildPendingItemsFromActiveForm = (generateIdsIfEmpty: boolean = true): { items: ReceiptItem[]; error?: string } => {
    if (serviceEntryMode === "custom") {
      if (!(customItemName || "").trim()) {
        return { items: [], error: "Por favor ingrese el nombre del servicio o producto (ej. Tarjeta Digital NFC)." };
      }
      const qtyNum = parseFloat(customItemQty);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        return { items: [], error: "Por favor ingrese una cantidad válida mayor a 0." };
      }
      const chargedPrice = parseFloat(customItemChargedPrice);
      if (isNaN(chargedPrice) || chargedPrice < 0) {
        return { items: [], error: "Por favor ingrese el precio cobrado al cliente." };
      }

      const providerCostToSave = 0;
      let finalOrderIds: string[] = [];
      const autoCode = autoServiceCode || generateCustomServiceCode(customItemCategory, customItemName);

      if (useAutoServiceCode) {
        finalOrderIds = [autoCode];
      } else {
        const raw = (customOrderId || "").trim();
        if (raw) {
          const split = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
          finalOrderIds = split.length > 0 ? split : [raw];
        } else {
          finalOrderIds = [autoCode];
        }
      }
      const primaryOrderId = finalOrderIds.join(", ");
      const categoryName = (customItemCategory || "").trim() || "Servicio Digital";

      const newItem: ReceiptItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        socialNetworkId: "custom",
        socialNetworkName: categoryName,
        serviceId: `custom_${Date.now()}`,
        serviceName: (customItemName || "").trim(),
        quantity: Math.round(qtyNum),
        suggestedPrice: chargedPrice,
        chargedPrice: chargedPrice,
        providerCostAtPurchase: providerCostToSave,
        providerCostUSD: null,
        providerCostCOP: providerCostToSave,
        trmUsed: trmState.valor || undefined,
        trmDate: trmState.fecha || undefined,
        orderId: primaryOrderId,
        orderIds: finalOrderIds,
      };
      return { items: [newItem] };
    }

    if (serviceEntryMode === "combo") {
      if (!selectedComboObj) {
        return { items: [], error: "Por favor seleccione un combo de la lista." };
      }
      const totalComboCharged = parseFloat(customComboPrice);
      if (isNaN(totalComboCharged) || totalComboCharged < 0) {
        return { items: [], error: "Por favor ingrese un precio válido para el combo." };
      }
      if (!selectedComboObj.items || selectedComboObj.items.length === 0) {
        return { items: [], error: "El combo seleccionado no contiene servicios configurados." };
      }

      const totalAllocatedSum = selectedComboObj.items.reduce(
        (sum, itm) => sum + (itm.allocatedPrice || 0),
        0
      );

      const generatedItems: ReceiptItem[] = selectedComboObj.items.map((comboItem, index) => {
        const srv = services.find((s) => s.id === comboItem.serviceId);
        const sn = socialNetworks.find((s) => s.id === comboItem.socialNetworkId) ||
          (srv ? socialNetworks.find((s) => s.id === srv.socialNetworkId) : null);

        const srvName = srv?.name || "Servicio";
        const snName = sn?.name || (comboItem.socialNetworkId.charAt(0).toUpperCase() + comboItem.socialNetworkId.slice(1));
        const snId = sn?.id || comboItem.socialNetworkId || "general";

        let autoProvCost = 0;
        let autoSuggPrice = 0;
        if (srv) {
          const prices = calculateServicePrices(srv, comboItem.quantity);
          autoProvCost = prices.providerCost;
          autoSuggPrice = prices.suggestedPrice;
        }

        let calculatedCostCOP = autoProvCost;
        const itemCostUSD = srv?.providerCostUSDPer1000
          ? calculateSupplierCostUSD(srv.providerCostUSDPer1000, comboItem.quantity)
          : null;

        if (srv?.providerCostUSDPer1000 && trmState.valor) {
          const copCost = calculateSupplierCostCOP(srv.providerCostUSDPer1000, comboItem.quantity, trmState.valor);
          if (copCost !== null) {
            calculatedCostCOP = Math.round(copCost);
          }
        }

        let itemCharged = 0;
        if (selectedComboObj.items.length === 1) {
          itemCharged = totalComboCharged;
        } else if (totalAllocatedSum > 0) {
          const ratio = (comboItem.allocatedPrice || 0) / totalAllocatedSum;
          itemCharged = Math.round(totalComboCharged * ratio);
        } else {
          itemCharged = Math.round(totalComboCharged / selectedComboObj.items.length);
        }

        const rawOrderId = (comboItemOrderIds[index] || "").trim();
        let finalOrderIds: string[] = [];
        if (rawOrderId) {
          const split = rawOrderId.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
          finalOrderIds = split.length > 0 ? split : [rawOrderId];
        } else if (generateIdsIfEmpty) {
          finalOrderIds = [`PED-${Math.floor(100000 + Math.random() * 900000)}`];
        }
        const primaryOrderId = finalOrderIds.join(", ");

        return {
          id: `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
          socialNetworkId: snId,
          socialNetworkName: snName,
          serviceId: comboItem.serviceId,
          serviceName: srvName,
          quantity: comboItem.quantity,
          suggestedPrice: autoSuggPrice || itemCharged,
          chargedPrice: itemCharged,
          providerCostAtPurchase: calculatedCostCOP,
          providerCostUSD: itemCostUSD,
          providerCostCOP: calculatedCostCOP,
          trmUsed: trmState.valor || undefined,
          trmDate: trmState.fecha || undefined,
          orderId: primaryOrderId,
          orderIds: finalOrderIds,
        };
      });

      const currentSum = generatedItems.reduce((acc, itm) => acc + itm.chargedPrice, 0);
      const diff = totalComboCharged - currentSum;
      if (diff !== 0 && generatedItems.length > 0) {
        generatedItems[0].chargedPrice += diff;
      }

      return { items: generatedItems };
    }

    // Catalog mode
    if (!selectedSocialId || !selectedServiceId || !selectedQtyMode) {
      return { items: [], error: "Por favor seleccione la Red Social, el Servicio y la Cantidad." };
    }
    if (effectiveQuantity <= 0) {
      return { items: [], error: "Por favor ingrese una cantidad numérica válida mayor a 0." };
    }

    const sn = socialNetworks.find((s) => s.id === selectedSocialId);
    const srv = selectedServiceObj;
    if (!sn || !srv) {
      return { items: [], error: "Error cargando la configuración del servicio seleccionado." };
    }

    const chargedPrice = parseFloat(customChargedPrice);
    if (isNaN(chargedPrice) || chargedPrice < 0) {
      return { items: [], error: "Por favor ingrese un precio cobrado válido." };
    }

    const { providerCost: autoProvCost, suggestedPrice: autoSuggPrice } = calculateServicePrices(srv, effectiveQuantity);
    let calculatedCostCOP = autoProvCost;
    const itemCostUSD = calculateSupplierCostUSD(srv.providerCostUSDPer1000, effectiveQuantity);

    if (srv.providerCostUSDPer1000 && trmState.valor) {
      const copCost = calculateSupplierCostCOP(srv.providerCostUSDPer1000, effectiveQuantity, trmState.valor);
      if (copCost !== null) {
        calculatedCostCOP = Math.round(copCost);
      }
    }

    const finalProviderCost = parseFloat(itemProviderCost);
    const providerCostToSave = !isNaN(finalProviderCost) && finalProviderCost >= 0 ? finalProviderCost : calculatedCostCOP;

    let finalOrderIds: string[] = [];
    if (idCountType === "dos") {
      const o1 = (customOrderId || "").trim() || (generateIdsIfEmpty ? `PED-${Math.floor(100000 + Math.random() * 900000)}` : "");
      const o2 = (customOrderId2 || "").trim() || (generateIdsIfEmpty ? `PED-${Math.floor(100000 + Math.random() * 900000)}` : "");
      finalOrderIds = [o1, o2].filter(Boolean);
    } else {
      const raw = (customOrderId || "").trim();
      if (raw) {
        const split = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
        finalOrderIds = split.length > 0 ? split : [raw];
      } else if (generateIdsIfEmpty) {
        finalOrderIds = [`PED-${Math.floor(100000 + Math.random() * 900000)}`];
      }
    }
    const primaryOrderId = finalOrderIds.join(", ");

    const newItem: ReceiptItem = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      socialNetworkId: sn.id,
      socialNetworkName: sn.name,
      serviceId: srv.id,
      serviceName: srv.name,
      quantity: effectiveQuantity,
      suggestedPrice: autoSuggPrice,
      chargedPrice: chargedPrice,
      providerCostAtPurchase: providerCostToSave,
      providerCostUSD: itemCostUSD,
      providerCostCOP: providerCostToSave,
      trmUsed: trmState.valor || undefined,
      trmDate: trmState.fecha || undefined,
      orderId: primaryOrderId,
      orderIds: finalOrderIds,
      targetAccount: (itemTargetAccount || "").trim() || undefined,
      startCount: itemStartCount ? Number(itemStartCount) : undefined,
    };

    return { items: [newItem] };
  };

  // Live preview of pending form item when draft is empty (enables 1-step Quick Emission)
  const pendingFormPreviewItems = useMemo(() => {
    const res = buildPendingItemsFromActiveForm(false);
    return res.items;
  }, [
    serviceEntryMode,
    customItemName,
    customItemQty,
    customItemChargedPrice,
    customItemCategory,
    autoServiceCode,
    useAutoServiceCode,
    selectedComboObj,
    customComboPrice,
    comboItemOrderIds,
    selectedSocialId,
    selectedServiceId,
    selectedQtyMode,
    effectiveQuantity,
    selectedServiceObj,
    customChargedPrice,
    itemProviderCost,
    idCountType,
    customOrderId,
    customOrderId2,
    itemTargetAccount,
    itemStartCount,
    trmState.valor,
    services,
    socialNetworks
  ]);

  const effectiveDraftItems = useMemo(() => {
    return addedItems.length > 0 ? addedItems : pendingFormPreviewItems;
  }, [addedItems, pendingFormPreviewItems]);

  // Totals calculations (includes live form preview if addedItems is empty)
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalCharged = 0;
    let totalProviderCost = 0;

    effectiveDraftItems.forEach((item) => {
      subtotal += item.suggestedPrice;
      totalCharged += item.chargedPrice;
      totalProviderCost += item.providerCostAtPurchase;
    });

    const totalProfit = totalCharged - totalProviderCost;

    return {
      subtotal,
      totalCharged,
      totalProviderCost,
      totalProfit,
    };
  }, [effectiveDraftItems]);

  const resetActiveServiceForm = () => {
    setSelectedQtyMode("");
    setCustomQtyValue("");
    setIsOverridingCost(false);
    setItemProviderCost("");
    setCustomOrderId("");
    setCustomOrderId2("");
    setCustomChargedPrice("");
    setCustomItemName("");
    setCustomItemChargedPrice("");
    setCustomItemQty("1");
    setAutoServiceCode(generateCustomServiceCode(customItemCategory, ""));
    setSelectedComboId("");
    setCustomComboPrice("");
    setComboItemOrderIds({});
  };

  // Add Item to Receipt Draft
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const built = buildPendingItemsFromActiveForm(true);
    if (built.error || built.items.length === 0) {
      setError(built.error || "Complete los datos del servicio.");
      return;
    }

    setAddedItems((prev) => [...prev, ...built.items]);
    resetActiveServiceForm();
  };

  // Add Combo Items (Option B: Expands into separate individual items with separate provider IDs)
  const handleAddComboItems = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const built = buildPendingItemsFromActiveForm(true);
    if (built.error || built.items.length === 0) {
      setError(built.error || "Complete los datos del combo.");
      return;
    }

    setAddedItems((prev) => [...prev, ...built.items]);
    resetActiveServiceForm();
  };

  const handleRemoveItem = (id: string) => {
    setAddedItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateItemChargedPrice = (id: string, priceStr: string) => {
    const price = parseFloat(priceStr);
    if (isNaN(price)) return;
    setAddedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, chargedPrice: price } : item))
    );
  };

  const handleUpdateItemProviderCost = (id: string, costStr: string) => {
    const cost = parseFloat(costStr);
    if (isNaN(cost)) return;
    setAddedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, providerCostAtPurchase: cost, providerCostCOP: cost } : item))
    );
  };

  const handleUpdateItemOrderId = (id: string, orderIdInput: string) => {
    const safeInput = String(orderIdInput || "");
    const split = safeInput.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const cleanOrderIds = split.length > 0 ? split : (safeInput.trim() ? [safeInput.trim()] : []);
    setAddedItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              orderId: safeInput,
              orderIds: cleanOrderIds
            }
          : item
      )
    );

    // Live sync with MazSocialMarket when pasting an order ID into a draft item (e.g., Repeat Order)
    const matches = safeInput.match(/\d{3,}/g);
    if (matches && matches.length > 0) {
      const targetId = matches[0];
      setDraftItemSyncFeedback((prev) => ({
        ...prev,
        [id]: { checking: true }
      }));
      syncOrderWithProvider(targetId)
        .then((res) => {
          if (res.success && res.results && res.results.length > 0) {
            const pItem = res.results[0];
            if (pItem.found) {
              const safeMapped: ReceiptStatus =
                pItem.mappedStatus === "desconocido" ? "en_proceso" : pItem.mappedStatus;
              let detectedCostCOP: number | null = null;
              if (pItem.charge !== null && pItem.charge !== undefined) {
                const rawCharge = parseFloat(String(pItem.charge));
                if (!isNaN(rawCharge) && rawCharge > 0) {
                  const curr = String(pItem.currency || "USD").toUpperCase();
                  detectedCostCOP =
                    curr === "COP" || rawCharge > 100
                      ? Math.round(rawCharge)
                      : Math.round(rawCharge * (trmState.valor || 4200));
                }
              }

              setAddedItems((prev) =>
                prev.map((item) => {
                  if (item.id !== id) return item;
                  return {
                    ...item,
                    providerCostAtPurchase: detectedCostCOP ?? item.providerCostAtPurchase,
                    providerCostCOP: detectedCostCOP ?? item.providerCostCOP,
                    startCount:
                      pItem.startCount !== null &&
                      pItem.startCount !== undefined &&
                      !isNaN(Number(pItem.startCount))
                        ? Number(pItem.startCount)
                        : item.startCount,
                  };
                })
              );
              setStatus(safeMapped);
              setDraftItemSyncFeedback((prev) => ({
                ...prev,
                [id]: {
                  checking: false,
                  found: true,
                  rawStatus: pItem.rawStatus,
                  mappedStatus: safeMapped,
                  autoCostCOP: detectedCostCOP
                }
              }));
              return;
            }
          }
          setDraftItemSyncFeedback((prev) => ({
            ...prev,
            [id]: { checking: false, found: false }
          }));
        })
        .catch(() => {
          setDraftItemSyncFeedback((prev) => ({
            ...prev,
            [id]: { checking: false, found: false }
          }));
        });
    } else {
      setDraftItemSyncFeedback((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleEmitReceipt = async (includePendingForm: boolean = false) => {
    setError(null);

    if (!(clientName || "").trim()) {
      setError("Por favor ingrese el nombre del cliente.");
      return;
    }

    if (!(clientPhone || "").trim()) {
      setError("Por favor ingrese el teléfono de contacto del cliente.");
      return;
    }

    let itemsToEmit: ReceiptItem[] = [...addedItems];

    // 1-Step Quick Emit: if addedItems is empty OR user clicked "⚡ Emitir Directo" with a valid pending form item
    if (itemsToEmit.length === 0 || includePendingForm) {
      const built = buildPendingItemsFromActiveForm(true);
      if (itemsToEmit.length === 0) {
        if (built.error || built.items.length === 0) {
          setError(built.error || "Debe configurar o agregar al menos un servicio al comprobante.");
          return;
        }
        itemsToEmit = built.items;
      } else if (built.items.length > 0 && !built.error) {
        itemsToEmit = [...itemsToEmit, ...built.items];
      }
    }

    setIsSubmitting(true);

    try {
      const sanitizedServices = itemsToEmit.map((item) => {
        const ids = getItemOrderIds(item);
        const finalIds = ids.length > 0 ? ids : [`PED-${Math.floor(100000 + Math.random() * 900000)}`];
        return {
          ...item,
          orderId: finalIds.join(", "),
          orderIds: finalIds
        };
      });

      const isOnlyCards = sanitizedServices.length > 0 && sanitizedServices.every(isTarjetaDigitalService);
      let chosenWarranty: string;
      if (warrantyOption === "custom") {
        chosenWarranty = `${customWarrantyDays} días`;
      } else if (warrantyOption === "none" && isOnlyCards) {
        chosenWarranty = "Sin garantía";
      } else {
        chosenWarranty = `${businessConfig.warrantyDays || 30} días`;
      }

      const targetClientId = forceNewClient
        ? undefined
        : (selectedClientObj?.id || detectedClient?.id);

      // Verify provider status for any numeric order IDs before emitting so status matches provider
      let finalReceiptStatus: ReceiptStatus = status;
      const numericOrderIds = sanitizedServices
        .flatMap((s) => s.orderIds || [])
        .filter((id) => !/^PED-\d+$/i.test(String(id || "").trim()))
        .flatMap((id) => String(id || "").match(/\d{3,}/g) || []);

      if (numericOrderIds.length > 0) {
        try {
          const syncRes = await syncOrderWithProvider(Array.from(new Set(numericOrderIds)), false);
          if (syncRes.success && syncRes.results) {
            const foundItems = syncRes.results.filter((r) => r.found);
            if (foundItems.length > 0) {
              const allCompleted = foundItems.every((r) => r.mappedStatus === "completado");
              const anyPartial = foundItems.some((r) => r.mappedStatus === "parcial");
              const anyProcessing = foundItems.some((r) => r.mappedStatus === "procesando");
              const anyInProcess = foundItems.some((r) => r.mappedStatus === "en_proceso");
              const anyCanceled = foundItems.some((r) => r.mappedStatus === "cancelado");

              if (allCompleted) finalReceiptStatus = "completado";
              else if (anyPartial) finalReceiptStatus = "parcial";
              else if (anyProcessing) finalReceiptStatus = "procesando";
              else if (anyInProcess) finalReceiptStatus = "en_proceso";
              else if (anyCanceled) finalReceiptStatus = "cancelado";
            }
          }
        } catch {
          // Keep user-selected status if provider check fails
        }
      }

      let finalSubtotal = 0;
      let finalTotalCharged = 0;
      let finalTotalProviderCost = 0;
      sanitizedServices.forEach((itm) => {
        finalSubtotal += itm.suggestedPrice || 0;
        finalTotalCharged += itm.chargedPrice || 0;
        finalTotalProviderCost += itm.providerCostAtPurchase || 0;
      });
      const finalTotalProfit = finalTotalCharged - finalTotalProviderCost;

      const receiptData = {
        clientId: targetClientId,
        forceNewClient: forceNewClient,
        clientName: (clientName || "").trim(),
        clientPhone: (clientPhone || "").trim(),
        date: new Date().toISOString(),
        services: sanitizedServices,
        subtotal: finalSubtotal,
        totalCharged: finalTotalCharged,
        // Campos internos que createReceipt guarda atómicamente en receipts_private/{receiptId} mediante writeBatch
        totalProviderCost: finalTotalProviderCost,
        totalProfit: finalTotalProfit,
        trmUsed: trmState.valor || undefined,
        trmDate: trmState.fecha || undefined,
        warranty: chosenWarranty,
        thankYouMessage: "¡Gracias por confiar en ImpulsaNet para potenciar sus redes!",
        status: finalReceiptStatus,
        internalNotes: (internalNotes || "").trim(),
        targetAccount: (sanitizedServices.find(i => i.targetAccount)?.targetAccount || (itemTargetAccount || "").trim() || undefined),
        initialFollowers: (sanitizedServices.find(i => i.startCount !== undefined)?.startCount || (itemStartCount ? Number(itemStartCount) : undefined)),
      };

      const result = await createReceipt(receiptData);
      
      // Notify parent to open receipt modal
      onReceiptGenerated(result);

      // Reset form entirely
      setClientName("");
      setClientPhone("");
      setSelectedClientObj(null);
      setClientSearchQuery("");
      setForceNewClient(false);
      setAddedItems([]);
      resetActiveServiceForm();
      setStatus("completado");
      setInternalNotes("");
      setWarrantyOption("standard");
      setShowAdvancedOptions(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudo emitir el comprobante en Firebase.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-2">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`text-xl font-bold tracking-tight ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            {showMultiQuoteView ? "Cotizador Multi-Servicio y Presupuestos" : "Emisión de Comprobantes"}
          </h2>
          <p className={`text-xs mt-1 ${
            isDarkMode ? "text-slate-400" : "text-gray-500"
          }`}>
            {showMultiQuoteView
              ? "Cotice varios servicios a la vez y páselos al comprobante en 1 clic"
              : "Emita directo en 1 paso, por catálogo, combos o presupuesto del cliente"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-toggle-multi-quote-view"
            type="button"
            onClick={() => setShowMultiQuoteView((prev) => !prev)}
            className={`flex items-center gap-1.5 text-xs font-bold rounded-lg px-3.5 py-2 shadow-2xs transition shrink-0 cursor-pointer border ${
              showMultiQuoteView
                ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500"
                : isDarkMode
                ? "bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border-indigo-800"
                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
            }`}
          >
            {showMultiQuoteView ? (
              <>
                <Zap className="w-4 h-4 text-amber-300" />
                <span>⚡ Volver a Emitir Comprobante</span>
              </>
            ) : (
              <>
                <Calculator className="w-4 h-4 text-indigo-500" />
                <span>🧮 Cotizador Multi-Servicio</span>
              </>
            )}
          </button>
          {!showMultiQuoteView && (
            <button
              id="btn-toggle-admin-data"
              onClick={() => setHideAdminData(!hideAdminData)}
              className={`flex items-center gap-1.5 text-xs font-semibold rounded-lg px-3.5 py-2 shadow-2xs transition shrink-0 cursor-pointer border ${
                isDarkMode
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                  : "bg-white hover:bg-gray-50 text-gray-600 border-gray-200"
              }`}
            >
              {hideAdminData ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {hideAdminData ? "Mostrar Costos / Ganancias" : "Ocultar Costos / Ganancias"}
            </button>
          )}
        </div>
      </div>

      {showMultiQuoteView ? (
        <QuoteCalculatorView
          onTransferToReceipt={(items, quotedClientName) => {
            if (quotedClientName && !clientName.trim()) {
              setClientName(quotedClientName);
            }
            const mapped: ReceiptItem[] = items.map((item, idx) => ({
              id: `item_quote_${Date.now()}_${idx}`,
              socialNetworkId: item.socialNetworkId || "instagram",
              socialNetworkName: item.socialNetworkName || "Instagram",
              serviceId: item.serviceId || "",
              serviceName: item.serviceName || "Servicio",
              quantity: item.quantity || 1000,
              suggestedPrice: item.suggestedPrice ?? item.chargedPrice ?? 0,
              chargedPrice: item.chargedPrice ?? 0,
              providerCostAtPurchase: item.providerCostAtPurchase ?? 0,
              providerCostUSD: item.providerCostUSD ?? null,
              providerCostCOP: item.providerCostCOP ?? item.providerCostAtPurchase ?? 0,
              orderId: item.orderId || "",
              orderIds: item.orderIds || [],
              trmUsed: trmState.valor || null,
            }));
            setAddedItems(mapped);
            setShowMultiQuoteView(false);
          }}
        />
      ) : (
        <>

      {initialClient && (
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-xs font-semibold shadow-2xs ${
          isDarkMode
            ? "bg-indigo-950/60 border-indigo-700/80 text-indigo-200"
            : "bg-indigo-50 border-indigo-200 text-indigo-900"
        }`}>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Modo Repetir Pedido{initialClient.sourceConsecutive ? ` (#${initialClient.sourceConsecutive})` : ""}:</strong>{" "}
              Cliente y servicio(s) precargados para <strong>{initialClient.name}</strong>. Solo pegue el nuevo ID de MazSocialMarket en el borrador y pulse <strong>Emitir Comprobante</strong>.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Client & Adding Services Form */}
        <div className="lg:col-span-5 space-y-6">
          {/* Client Details Section */}
          <div className={`rounded-xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4 ${
            isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-indigo-500" />
              Información del Cliente
            </h3>

            {/* WhatsApp Client Code Helper Banner */}
            <div className={`border rounded-xl p-3 flex items-center justify-between text-xs shadow-2xs ${
              isDarkMode
                ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
                : "bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50/30 border-emerald-200/80 text-emerald-950"
            }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  isDarkMode ? "bg-emerald-900/80 border-emerald-700 text-emerald-300" : "bg-emerald-100 border-emerald-200 text-emerald-700"
                }`}>
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <span className={`text-[10px] uppercase font-extrabold block tracking-wider ${
                    isDarkMode ? "text-emerald-400" : "text-emerald-700"
                  }`}>
                    Código WhatsApp para Guardar Contacto
                  </span>
                  <div className="text-xs font-semibold flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span className={isDarkMode ? "text-slate-300" : "text-gray-600"}>
                      Último código utilizado: <strong className={`font-mono px-2 py-0.5 rounded border font-black ${
                        isDarkMode
                          ? "text-emerald-300 bg-emerald-900/60 border-emerald-700"
                          : "text-emerald-900 bg-emerald-100 border-emerald-300"
                      }`}>#{whatsappCodeStats.lastCodeStr}</strong>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await safeCopyToClipboard(whatsappCodeStats.lastCodeStr);
                  setCopiedCode(whatsappCodeStats.lastCodeStr);
                  setTimeout(() => setCopiedCode(null), 2000);
                }}
                className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 active:scale-95 shrink-0 shadow-2xs border ${
                  isDarkMode
                    ? "bg-emerald-900/80 hover:bg-emerald-800 border-emerald-700 text-emerald-200"
                    : "bg-white hover:bg-emerald-100/60 border-emerald-300 text-emerald-800"
                }`}
                title="Copiar último código utilizado"
              >
                {copiedCode === whatsappCodeStats.lastCodeStr ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copiar #{whatsappCodeStats.lastCodeStr}</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-3">
              {/* Search Existing Client Field */}
              <div className="relative">
                <label className={`block text-[11px] font-bold uppercase flex items-center justify-between ${
                  isDarkMode ? "text-indigo-400" : "text-indigo-700"
                }`}>
                  <span>Buscar Cliente Registrado</span>
                  <span className={`text-[9px] font-mono lowercase ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
                    id, nombre o whatsapp
                  </span>
                </label>
                <div className="mt-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-indigo-500" />
                  </div>
                  <input
                    type="text"
                    value={clientSearchQuery}
                    onChange={(e) => {
                      setClientSearchQuery(e.target.value);
                      if (selectedClientObj) setSelectedClientObj(null);
                    }}
                    placeholder="Buscar por ID (0001), Nombre o WhatsApp..."
                    className={`block w-full pl-9 pr-8 py-2 border rounded-lg text-xs transition font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                        : "bg-indigo-50/20 border-indigo-200 text-gray-900 placeholder-gray-400 focus:border-indigo-500"
                    }`}
                  />
                  {clientSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setClientSearchQuery("")}
                      className={`absolute inset-y-0 right-0 pr-2.5 flex items-center ${
                        isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown Results */}
                {matchingClients.length > 0 && (
                  <div className={`absolute z-20 left-0 right-0 mt-1 rounded-xl shadow-xl overflow-hidden divide-y max-h-56 overflow-y-auto border ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 divide-slate-700 text-slate-100"
                      : "bg-white border-gray-200 divide-gray-100 text-gray-900"
                  }`}>
                    {matchingClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => handleSelectClient(client)}
                        className={`w-full text-left p-2.5 transition flex items-center justify-between group cursor-pointer ${
                          isDarkMode ? "hover:bg-slate-700/80" : "hover:bg-indigo-50/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${
                            isDarkMode
                              ? "bg-indigo-950 text-indigo-300 border-indigo-800"
                              : "bg-indigo-50 text-indigo-700 border-indigo-100"
                          }`}>
                            ID: {client.code}
                          </span>
                          <div>
                            <div className={`text-xs font-bold ${
                              isDarkMode ? "text-white group-hover:text-indigo-300" : "text-gray-900 group-hover:text-indigo-900"
                            }`}>
                              {client.name}
                            </div>
                            <div className={`text-[10px] font-mono ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                              {client.phone}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-indigo-400 font-semibold opacity-0 group-hover:opacity-100 transition">
                          Seleccionar
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick 1-click apply when typing a new client in the search box */}
                {clientSearchQuery.trim().length >= 2 && matchingClients.length === 0 && (
                  <div className={`mt-1.5 p-2 rounded-lg border flex items-center justify-between gap-2 text-xs ${
                    isDarkMode ? "bg-slate-800/90 border-slate-700 text-slate-300" : "bg-indigo-50/50 border-indigo-100 text-gray-700"
                  }`}>
                    <span className="truncate text-[11px]">
                      Sin coincidencias para <strong>"{clientSearchQuery.trim()}"</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const q = clientSearchQuery.trim();
                        const digits = q.replace(/\D/g, "");
                        if (q.startsWith("@") || digits.length >= 7) {
                          setClientPhone(q);
                        } else {
                          setClientName(q);
                        }
                        setSelectedClientObj(null);
                        setClientSearchQuery("");
                      }}
                      className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] shrink-0 cursor-pointer transition"
                    >
                      ⚡ Usar como cliente nuevo
                    </button>
                  </div>
                )}
              </div>

              {selectedClientObj && (
                <div className={`border rounded-lg p-2.5 flex items-center justify-between text-xs shadow-2xs ${
                  isDarkMode
                    ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-200"
                    : "bg-emerald-50 border-emerald-200/80 text-emerald-900"
                }`}>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <span className="font-bold">{selectedClientObj.name}</span>
                      <span className={`ml-1.5 font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                        isDarkMode
                          ? "bg-emerald-900/80 text-emerald-200 border-emerald-700"
                          : "bg-white/80 text-emerald-700 border-emerald-200"
                      }`}>
                        ID: {getClientCode(selectedClientObj)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClientObj(null);
                      setClientName("");
                      setClientPhone("");
                    }}
                    className={`text-[10px] underline font-medium cursor-pointer ${
                      isDarkMode ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-700 hover:text-emerald-900"
                    }`}
                  >
                    Cambiar
                  </button>
                </div>
              )}

              <div>
                <label className={`block text-[11px] font-semibold uppercase ${
                  isDarkMode ? "text-slate-400" : "text-gray-600"
                }`}>
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    if (selectedClientObj) setSelectedClientObj(null);
                  }}
                  placeholder="Ej. Juan Pérez"
                  className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                      : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                  }`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-semibold uppercase ${
                  isDarkMode ? "text-slate-400" : "text-gray-600"
                }`}>
                  Teléfono / WhatsApp
                </label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => {
                    setClientPhone(e.target.value);
                    if (selectedClientObj) setSelectedClientObj(null);
                  }}
                  placeholder="Ej. 573208354198"
                  className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                      : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                  }`}
                />

                {/* Live Client Status Indicator */}
                {((clientName || "").trim() || (clientPhone || "").trim()) && (
                  <div className={`mt-2.5 p-3 rounded-xl border text-xs transition space-y-2.5 ${
                    detectedClient && !forceNewClient
                      ? isDarkMode
                        ? "bg-indigo-950/40 border-indigo-800 text-indigo-200"
                        : "bg-indigo-50/70 border-indigo-200 text-indigo-900"
                      : isDarkMode
                      ? "bg-emerald-950/40 border-emerald-800 text-emerald-200"
                      : "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {detectedClient && !forceNewClient ? (
                          <User className="w-4 h-4 text-indigo-400 shrink-0" />
                        ) : (
                          <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold flex items-center gap-1.5 flex-wrap">
                            <span>
                              {detectedClient && !forceNewClient
                                ? `Cliente Encontrado: ${detectedClient.name}`
                                : forceNewClient
                                ? `Nuevo Cliente Independiente: ${clientName || "Nuevo Cliente"}`
                                : "Nuevo Cliente"}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold border ${
                              detectedClient && !forceNewClient
                                ? isDarkMode
                                  ? "bg-indigo-900/80 border-indigo-700 text-indigo-200"
                                  : "bg-white border-indigo-200 text-indigo-800"
                                : isDarkMode
                                ? "bg-emerald-900/80 border-emerald-700 text-emerald-200"
                                : "bg-white border-emerald-200 text-emerald-800"
                            }`}>
                              ID: #{detectedClient && !forceNewClient ? getClientCode(detectedClient) : whatsappCodeStats.nextCodeStr}
                            </span>
                          </div>
                          <div className={`text-[10px] mt-0.5 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                            {detectedClient && !forceNewClient
                              ? "Se vinculará a este cliente existente en la base de datos."
                              : "Se creará un nuevo perfil independiente sin compartir garantías ni historial."}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Toggle between existing client and brand-new independent client */}
                    {detectedClient && (
                      <div className="pt-2 border-t border-indigo-200/40 dark:border-indigo-800/40 flex flex-wrap gap-2 items-center">
                        <button
                          type="button"
                          onClick={() => setForceNewClient(false)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                            !forceNewClient
                              ? isDarkMode
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-indigo-600 text-white shadow-xs"
                              : isDarkMode
                              ? "bg-slate-800/80 text-slate-300 hover:bg-slate-750"
                              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <span>✓ Asignar a {detectedClient.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setForceNewClient(true)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                            forceNewClient
                              ? isDarkMode
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-emerald-600 text-white shadow-xs"
                              : isDarkMode
                              ? "bg-slate-800/80 text-slate-300 hover:bg-slate-750"
                              : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Crear como NUEVO cliente independiente</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Control Interno / Opciones Avanzadas (Collapsible Accordion) */}
          <div className={`rounded-xl border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all ${
            isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <button
              type="button"
              onClick={() => setShowAdvancedOptions((prev) => !prev)}
              className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Settings2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Opciones Avanzadas
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border truncate ${
                  isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-gray-50 border-gray-200 text-gray-600"
                }`}>
                  {status === "completado" ? "✅ Completado" : status === "en_proceso" ? "🔵 En curso" : status === "procesando" ? "⚙️ Procesando" : status === "parcial" ? "🟠 Parcial" : status === "cancelado" ? "🔴 Cancelado" : "🟡 Garantía"}
                  {" • "}
                  {warrantyOption === "none" ? "🚫 Sin garantía" : warrantyOption === "custom" ? `🛡️ ${customWarrantyDays}d` : `🛡️ ${businessConfig.warrantyDays || 30}d`}
                  {(internalNotes || "").trim() ? " • 📝 Con nota" : ""}
                </span>
              </div>
              <div className={`p-1 rounded-md ${isDarkMode ? "text-slate-400 hover:bg-slate-800" : "text-gray-400 hover:bg-gray-100"}`}>
                {showAdvancedOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showAdvancedOptions && (
              <div className="space-y-3 pt-4 mt-3 border-t border-gray-100 dark:border-slate-800">
                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${
                    isDarkMode ? "text-slate-400" : "text-gray-600"
                  }`}>
                    Estado del Pedido
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                        : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                    }`}
                  >
                    <option value="procesando">⚙️ Procesando</option>
                    <option value="en_proceso">🔵 En curso</option>
                    <option value="parcial">🟠 Parcial</option>
                    <option value="completado">✅ Completado</option>
                    <option value="garantia_en_proceso">🟡 Garantía en proceso</option>
                    <option value="cancelado">🔴 Cancelado</option>
                  </select>
                </div>

                {/* Warranty Selector */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className={`block text-[11px] font-semibold uppercase ${
                      isDarkMode ? "text-slate-400" : "text-gray-600"
                    }`}>
                      Garantía del Comprobante
                    </label>
                    {warrantyOption === "none" && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        (Servicio base sin garantía)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setWarrantyOption("standard")}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        warrantyOption === "standard"
                          ? isDarkMode
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-xs"
                            : "bg-indigo-600 border-indigo-700 text-white shadow-xs"
                          : isDarkMode
                          ? "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span>🛡️ Estándar ({businessConfig.warrantyDays}d)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWarrantyOption("none")}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        warrantyOption === "none"
                          ? isDarkMode
                            ? "bg-slate-700 border-slate-500 text-white shadow-xs"
                            : "bg-slate-800 border-slate-900 text-white shadow-xs"
                          : isDarkMode
                          ? "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span>🚫 Sin garantía (Tarjetas)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWarrantyOption("custom")}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        warrantyOption === "custom"
                          ? isDarkMode
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-xs"
                            : "bg-indigo-600 border-indigo-700 text-white shadow-xs"
                          : isDarkMode
                          ? "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                          : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span>⚙️ Personalizada</span>
                    </button>
                  </div>
                  {warrantyOption === "custom" && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        value={customWarrantyDays}
                        onChange={(e) => setCustomWarrantyDays(Math.max(1, parseInt(e.target.value) || 1))}
                        className={`w-24 px-3 py-1.5 border rounded-lg text-xs ${
                          isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
                        }`}
                        min={1}
                      />
                      <span className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                        días de reposición para este comprobante
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${
                    isDarkMode ? "text-slate-400" : "text-gray-600"
                  }`}>
                    Notas Privadas (Opcional)
                  </label>
                  <textarea
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Ej. Pedido urgente entregado parcialmente."
                    rows={2}
                    className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-xs transition resize-none focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                        : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                    }`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Selector Form for Adding Service */}
          <div className={`rounded-xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${
            isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4 text-indigo-500" />
                Agregar Servicio al Borrador
              </h3>
            </div>

            {/* Mode Switcher: Catálogo vs Combos vs Presupuesto vs Personalizado */}
            <div className={`grid grid-cols-2 sm:grid-cols-4 p-1 rounded-xl mb-4 text-xs font-semibold gap-1 ${
              isDarkMode ? "bg-slate-800 text-slate-400" : "bg-gray-100 text-gray-600"
            }`}>
              <button
                type="button"
                onClick={() => {
                  setServiceEntryMode("catalog");
                  setError(null);
                }}
                className={`py-2 px-2 rounded-lg transition text-center cursor-pointer flex items-center justify-center gap-1 ${
                  serviceEntryMode === "catalog"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-xs font-bold"
                      : "bg-white text-indigo-900 shadow-xs font-bold"
                    : "hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Catálogo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setServiceEntryMode("combo");
                  setError(null);
                }}
                className={`py-2 px-2 rounded-lg transition text-center cursor-pointer flex items-center justify-center gap-1 ${
                  serviceEntryMode === "combo"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-xs font-bold"
                      : "bg-white text-indigo-900 shadow-xs font-bold"
                    : "hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <PackageOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Combos</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setServiceEntryMode("budget");
                  setError(null);
                }}
                className={`py-2 px-2 rounded-lg transition text-center cursor-pointer flex items-center justify-center gap-1 ${
                  serviceEntryMode === "budget"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-xs font-bold"
                      : "bg-white text-indigo-900 shadow-xs font-bold"
                    : "hover:text-gray-900 dark:hover:text-white"
                }`}
                title="Calcular cantidad automáticamente según el presupuesto del cliente"
              >
                <DollarSign className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Presupuesto</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setServiceEntryMode("custom");
                  setError(null);
                }}
                className={`py-2 px-2 rounded-lg transition text-center cursor-pointer flex items-center justify-center gap-1 ${
                  serviceEntryMode === "custom"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-xs font-bold"
                      : "bg-white text-indigo-900 shadow-xs font-bold"
                    : "hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Personalizado</span>
              </button>
            </div>

            {serviceEntryMode === "custom" ? (
              /* Freeform Custom / Other Service Form (Tarjetas Digitales, Diseño, etc.) */
              <form onSubmit={handleAddItem} className="space-y-4">
                {/* Category selector / quick pills */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className={`block text-[11px] font-semibold uppercase ${
                      isDarkMode ? "text-slate-400" : "text-gray-600"
                    }`}>
                      Categoría / Tipo de Servicio
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {["Tarjetas Digitales", "Diseño Gráfico", "Optimización", "Publicidad", "Servicios Digitales", "Páginas Web", "Otro"].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCustomItemCategory(cat);
                          if (useAutoServiceCode) {
                            setAutoServiceCode(generateCustomServiceCode(cat, customItemName));
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-md transition cursor-pointer border font-medium ${
                          customItemCategory === cat
                            ? isDarkMode
                              ? "bg-indigo-950/70 text-indigo-300 border-indigo-700"
                              : "bg-indigo-50 text-indigo-700 border-indigo-200"
                            : isDarkMode
                            ? "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    required
                    value={customItemCategory}
                    onChange={(e) => {
                      const newCat = e.target.value;
                      setCustomItemCategory(newCat);
                      if (useAutoServiceCode) {
                        setAutoServiceCode(generateCustomServiceCode(newCat, customItemName));
                      }
                    }}
                    placeholder="Ej. Tarjetas Digitales, Diseño Gráfico o Páginas Web"
                    className={`block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                        : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                    }`}
                  />
                </div>

                {/* Service / Product Name */}
                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${
                    isDarkMode ? "text-slate-400" : "text-gray-600"
                  }`}>
                    Nombre del Servicio o Producto
                  </label>
                  <input
                    type="text"
                    required
                    value={customItemName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomItemName(val);
                      if (useAutoServiceCode) {
                        setAutoServiceCode(generateCustomServiceCode(customItemCategory, val));
                      }
                    }}
                    placeholder="Ej. Tarjeta Digital NFC con Código QR y Perfil Web"
                    className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                        : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                    }`}
                  />
                </div>

                {/* Quantity & Price Charged */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-[11px] font-semibold uppercase ${
                      isDarkMode ? "text-slate-400" : "text-gray-600"
                    }`}>
                      Cantidad
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={customItemQty}
                      onChange={(e) => setCustomItemQty(e.target.value)}
                      placeholder="1"
                      className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm font-medium transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                          : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[11px] font-semibold uppercase ${
                      isDarkMode ? "text-slate-400" : "text-gray-600"
                    }`}>
                      Precio Cobrado (COP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={customItemChargedPrice}
                      onChange={(e) => setCustomItemChargedPrice(e.target.value)}
                      placeholder="Ej. 65000"
                      className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm font-bold transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 text-emerald-400 placeholder-slate-500 focus:border-indigo-400"
                          : "bg-white border-gray-200 text-emerald-600 placeholder-gray-400 focus:border-indigo-500"
                      }`}
                    />
                  </div>
                </div>

                {/* 100% Ganancia Neta (Servicios personalizados sin costo de inversión) */}
                {parseFloat(customItemChargedPrice) > 0 ? (
                  <div className={`p-3 rounded-xl border text-xs flex justify-between items-center ${
                    isDarkMode ? "bg-emerald-950/30 border-emerald-900/50 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}>
                    <span className="font-semibold flex items-center gap-1.5">
                      <span>✨ Ganancia neta (100%):</span>
                    </span>
                    <span className="font-bold font-mono text-emerald-500 text-sm">
                      {formatCOP(parseFloat(customItemChargedPrice) || 0)}
                      <span className="text-[10px] ml-1.5 font-normal text-emerald-600 dark:text-emerald-400">(Sin costo de inversión)</span>
                    </span>
                  </div>
                ) : (
                  <div className={`text-[11px] px-3 py-2 rounded-lg border ${
                    isDarkMode ? "bg-slate-800/40 border-slate-700/60 text-slate-400" : "bg-gray-50 border-gray-200/70 text-gray-500"
                  }`}>
                    ℹ️ Los servicios personalizados no llevan costo de inversión (100% ganancia).
                  </div>
                )}

                {/* Automatic Differentiated Service Code Section */}
                <div className={`p-3.5 rounded-xl border transition-all ${
                  isDarkMode ? "bg-slate-850/80 border-slate-700/80" : "bg-slate-50/80 border-slate-200"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Hash className={`w-3.5 h-3.5 ${isDarkMode ? "text-amber-400" : "text-amber-600"}`} />
                      <label className={`text-[11px] font-bold uppercase tracking-wider ${
                        isDarkMode ? "text-slate-300" : "text-gray-700"
                      }`}>
                        Código Automático de Servicio
                      </label>
                    </div>
                    {/* Mode switcher: Auto vs Manual */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUseAutoServiceCode(true);
                          setCustomOrderId("");
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          useAutoServiceCode
                            ? isDarkMode
                              ? "bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-2xs"
                              : "bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs"
                            : isDarkMode
                            ? "text-slate-400 hover:text-slate-200"
                            : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        Automático
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseAutoServiceCode(false)}
                        className={`text-[10px] px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          !useAutoServiceCode
                            ? isDarkMode
                              ? "bg-indigo-900/50 text-indigo-300 border border-indigo-700"
                              : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                            : isDarkMode
                            ? "text-slate-400 hover:text-slate-200"
                            : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        Manual
                      </button>
                    </div>
                  </div>

                  {useAutoServiceCode ? (
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 flex items-center justify-between px-3.5 py-2 rounded-lg border font-mono text-sm font-bold shadow-2xs ${
                        isDarkMode
                          ? "bg-slate-900 border-slate-700 text-amber-300"
                          : "bg-white border-amber-200/90 text-amber-900"
                      }`}>
                        <span>{autoServiceCode}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-sans font-semibold uppercase tracking-wider ${
                          isDarkMode ? "bg-amber-400/10 text-amber-400" : "bg-amber-50 text-amber-700 border border-amber-200/50"
                        }`}>
                          {getCustomServicePrefix(customItemCategory, customItemName)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoServiceCode(generateCustomServiceCode(customItemCategory, customItemName))}
                        title="Generar otro código"
                        className={`p-2 rounded-lg border transition cursor-pointer flex items-center gap-1 text-xs font-semibold ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750 hover:text-white"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span className="text-[11px] hidden sm:inline">Nuevo</span>
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={customOrderId}
                        onChange={(e) => setCustomOrderId(e.target.value)}
                        placeholder={`Ej. ${autoServiceCode}`}
                        className={`block w-full px-3.5 py-2 border rounded-lg text-sm font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                            : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                  )}

                  <p className={`text-[10px] mt-1.5 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                    {useAutoServiceCode
                      ? `Código único automático (${getCustomServicePrefix(customItemCategory, customItemName)}-XXXXX). Exclusivo para este servicio, sin mezclarse nunca con seguidores ni redes.`
                      : "Modo manual activo: puede escribir su propia referencia o volver a Automático."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    disabled={isSubmitting || !(customItemName || "").trim() || !customItemChargedPrice || parseFloat(customItemChargedPrice) < 0 || !(clientName || "").trim() || !(clientPhone || "").trim()}
                    onClick={() => handleEmitReceipt(true)}
                    className="w-full flex justify-center items-center py-2.5 px-3 border border-transparent rounded-lg shadow-sm text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 focus:outline-hidden disabled:opacity-40 transition cursor-pointer active:scale-[0.99]"
                    title="Emitir comprobante directamente en 1 clic sin pasar por el borrador"
                  >
                    <Zap className="w-4 h-4 mr-1.5" />
                    ⚡ Emitir Directo Ahora
                  </button>
                  <button
                    type="submit"
                    disabled={!(customItemName || "").trim() || !customItemChargedPrice || parseFloat(customItemChargedPrice) < 0}
                    className={`w-full flex justify-center items-center py-2.5 px-3 border rounded-lg shadow-2xs text-xs font-bold transition cursor-pointer active:scale-[0.99] disabled:opacity-40 ${
                      isDarkMode
                        ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-indigo-300"
                        : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                    }`}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    + Agregar al Borrador
                  </button>
                </div>
              </form>
            ) : serviceEntryMode === "combo" ? (
              /* Automated Combos & Packages Form */
              <form onSubmit={handleAddComboItems} className="space-y-4">
                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${
                    isDarkMode ? "text-slate-400" : "text-gray-600"
                  }`}>
                    Seleccionar Combo
                  </label>
                  <select
                    value={selectedComboId}
                    onChange={(e) => setSelectedComboId(e.target.value)}
                    className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                        : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                    }`}
                  >
                    <option value="">-- Seleccionar Paquete Combo --</option>
                    {combos
                      .filter((c) => c.active !== false)
                      .map((combo) => (
                        <option key={combo.id} value={combo.id}>
                          {combo.name} — ${Math.round(combo.comboPrice).toLocaleString("es-CO")}
                        </option>
                      ))}
                  </select>
                </div>

                {selectedComboObj && (
                  <div className="space-y-3.5">
                    {/* Combo Breakdown summary */}
                    <div className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      isDarkMode ? "bg-slate-800/60 border-slate-700/80" : "bg-indigo-50/50 border-indigo-100"
                    }`}>
                      <div className="flex items-center justify-between font-semibold">
                        <span className={isDarkMode ? "text-indigo-300" : "text-indigo-900"}>
                          Contenido del Combo:
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isDarkMode ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-emerald-100 text-emerald-800"
                        }`}>
                          {selectedComboObj.items.length} servicios automáticos
                        </span>
                      </div>

                      <div className="space-y-1.5 pt-1">
                        {selectedComboObj.items.map((item, idx) => {
                          const srv = services.find((s) => s.id === item.serviceId);
                          const srvName = srv?.name || item.serviceId;
                          const snName = item.socialNetworkId.charAt(0).toUpperCase() + item.socialNetworkId.slice(1);
                          return (
                            <div key={idx} className="flex items-center justify-between text-[11px]">
                              <span className={isDarkMode ? "text-slate-300" : "text-gray-700"}>
                                • <strong className="font-semibold">{item.quantity.toLocaleString("es-CO")}</strong> {srvName} ({snName})
                              </span>
                              <span className={`font-mono text-[10px] ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                                ID Proveedor #{idx + 1}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Combo Price Charged */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className={`block text-[11px] font-semibold uppercase ${
                          isDarkMode ? "text-slate-400" : "text-gray-600"
                        }`}>
                          Precio Total del Combo al Cliente (COP)
                        </label>
                        <span className="text-[10px] text-emerald-500 font-bold font-mono">
                          Editable
                        </span>
                      </div>
                      <div className="relative rounded-lg shadow-2xs">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center font-bold text-gray-400 text-sm">
                          $
                        </span>
                        <input
                          type="number"
                          required
                          value={customComboPrice}
                          onChange={(e) => setCustomComboPrice(e.target.value)}
                          placeholder="18000"
                          className={`block w-full pl-8 pr-3.5 py-2 border rounded-lg text-sm font-semibold transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                            isDarkMode
                              ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                              : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                          }`}
                        />
                      </div>
                      <p className={`text-[10px] mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                        Se distribuirá automáticamente en {selectedComboObj.items.length} renglones separados con el mismo formato estándar.
                      </p>
                    </div>

                    {/* Order IDs for each item in the combo */}
                    <div className="space-y-2 pt-1 border-t border-dashed border-gray-200 dark:border-slate-800">
                      <label className={`block text-[11px] font-semibold uppercase ${
                        isDarkMode ? "text-slate-400" : "text-gray-600"
                      }`}>
                        IDs de Proveedor por Servicio (Opcionales)
                      </label>
                      <div className="space-y-2">
                        {selectedComboObj.items.map((item, idx) => {
                          const srv = services.find((s) => s.id === item.serviceId);
                          const srvName = srv?.name || item.serviceId;
                          return (
                            <div key={idx} className="flex items-center gap-2">
                              <span className={`text-[11px] font-medium w-28 truncate ${
                                isDarkMode ? "text-slate-300" : "text-gray-700"
                              }`}>
                                {item.quantity} {srvName}:
                              </span>
                              <input
                                type="text"
                                value={comboItemOrderIds[idx] || ""}
                                onChange={(e) =>
                                  setComboItemOrderIds((prev) => ({
                                    ...prev,
                                    [idx]: e.target.value,
                                  }))
                                }
                                placeholder="Auto-generar ID"
                                className={`flex-1 px-3 py-1.5 border rounded-lg text-xs font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                                  isDarkMode
                                    ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                                    : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    disabled={isSubmitting || !selectedComboId || !customComboPrice || parseFloat(customComboPrice) < 0 || !(clientName || "").trim() || !(clientPhone || "").trim()}
                    onClick={() => handleEmitReceipt(true)}
                    className="w-full flex justify-center items-center py-2.5 px-3 border border-transparent rounded-lg shadow-sm text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 focus:outline-hidden disabled:opacity-40 transition cursor-pointer active:scale-[0.99]"
                  >
                    <Zap className="w-4 h-4 mr-1.5" />
                    ⚡ Emitir Combo Ahora
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedComboId || !customComboPrice || parseFloat(customComboPrice) < 0}
                    className={`w-full flex justify-center items-center py-2.5 px-3 border rounded-lg shadow-2xs text-xs font-bold transition cursor-pointer active:scale-[0.99] disabled:opacity-40 ${
                      isDarkMode
                        ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-indigo-300"
                        : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                    }`}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    + Agregar al Borrador
                  </button>
                </div>
              </form>
            ) : (
              /* Standard Catalog OR Quick Budget Mode Form */
              <form onSubmit={handleAddItem} className="space-y-4">
              {serviceEntryMode === "budget" && (
                <div className={`p-3.5 rounded-xl border space-y-3 ${
                  isDarkMode
                    ? "bg-emerald-950/30 border-emerald-800/60 text-emerald-200"
                    : "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Presupuesto del Cliente (COP)</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setBudgetPricingMode("catalog")}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                          budgetPricingMode === "catalog"
                            ? "bg-emerald-600 text-white"
                            : isDarkMode ? "text-slate-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        Tarifa Catálogo
                      </button>
                      <button
                        type="button"
                        onClick={() => setBudgetPricingMode("margin")}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                          budgetPricingMode === "margin"
                            ? "bg-emerald-600 text-white"
                            : isDarkMode ? "text-slate-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        Por Margen %
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-mono font-bold text-emerald-500">$</span>
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      value={budgetAmountInput}
                      onChange={(e) => setBudgetAmountInput(e.target.value)}
                      placeholder="Ej. 30000"
                      className={`w-full pl-7 pr-3 py-2 border rounded-lg text-sm font-mono font-extrabold focus:outline-hidden focus:ring-2 ${
                        isDarkMode
                          ? "bg-slate-900 border-emerald-700 text-emerald-300 focus:ring-emerald-500/30"
                          : "bg-white border-emerald-300 text-emerald-900 focus:ring-emerald-500/20"
                      }`}
                    />
                  </div>

                  {/* Quick Budget Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[15000, 20000, 30000, 50000, 100000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setBudgetAmountInput(String(amt))}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold border transition cursor-pointer ${
                          Number(budgetAmountInput) === amt
                            ? "bg-emerald-600 text-white border-emerald-500"
                            : isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                            : "bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-100/50"
                        }`}
                      >
                        ${(amt / 1000).toFixed(0)}k
                      </button>
                    ))}
                  </div>

                  {budgetPricingMode === "margin" && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] font-bold uppercase">Margen deseado:</span>
                      <div className="flex items-center gap-1">
                        {[70, 75, 80, 85].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setBudgetMarginPercent(m)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer border ${
                              budgetMarginPercent === m
                                ? "bg-indigo-600 text-white border-indigo-500"
                                : isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-white border-gray-200 text-gray-700"
                            }`}
                          >
                            {m}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedServiceObj && effectiveQuantity > 0 && (
                    <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                      isDarkMode ? "bg-slate-900/90 border-emerald-800/70" : "bg-white border-emerald-200"
                    }`}>
                      <div>
                        <span className="text-[10px] uppercase font-bold block opacity-75">Cantidad Calculada:</span>
                        <strong className="font-mono text-sm text-emerald-500">
                          {effectiveQuantity.toLocaleString("es-CO")} unidades
                        </strong>
                      </div>
                      {!hideAdminData && (
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold block opacity-75">Ganancia Est.:</span>
                          <strong className="font-mono text-xs text-indigo-400">
                            {formatCOP((parseFloat(customChargedPrice) || 0) - (parseFloat(itemProviderCost) || 0))}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* Select Social Network */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase ${
                  isDarkMode ? "text-slate-400" : "text-gray-600"
                }`}>
                  Red Social
                </label>
                <select
                  value={selectedSocialId}
                  onChange={(e) => {
                    setSelectedSocialId(e.target.value);
                    setSelectedServiceId("");
                    setSelectedQtyMode("");
                    setCustomQtyValue("");
                  }}
                  className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                      : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                  }`}
                >
                  <option value="">-- Seleccionar Red Social --</option>
                  {socialNetworks.map((sn) => (
                    <option key={sn.id} value={sn.id}>
                      {sn.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Service Type */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase ${
                  isDarkMode ? "text-slate-400" : "text-gray-600"
                }`}>
                  Tipo de Servicio
                </label>
                <select
                  value={selectedServiceId}
                  disabled={!selectedSocialId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-white disabled:bg-slate-850 disabled:text-slate-600 focus:border-indigo-400"
                      : "bg-white border-gray-200 text-gray-800 disabled:bg-gray-50 disabled:text-gray-400 focus:border-indigo-500"
                  }`}
                >
                  <option value="">-- Seleccionar Servicio --</option>
                  {availableServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Quantity or Custom Quantity */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase ${
                  isDarkMode ? "text-slate-400" : "text-gray-600"
                }`}>
                  Cantidad
                </label>
                <select
                  value={selectedQtyMode}
                  disabled={!selectedServiceId}
                  onChange={(e) => {
                    setSelectedQtyMode(e.target.value);
                    if (e.target.value !== "custom") {
                      setCustomQtyValue("");
                    }
                  }}
                  className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm font-medium transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-white disabled:bg-slate-850 disabled:text-slate-600 focus:border-indigo-400"
                      : "bg-white border-gray-200 text-gray-800 disabled:bg-gray-50 disabled:text-gray-400 focus:border-indigo-500"
                  }`}
                >
                  <option value="">-- Seleccionar Cantidad --</option>
                  {presetQuantities.map((q) => {
                    const price = selectedServiceObj ? calculateServicePrices(selectedServiceObj, q).suggestedPrice : 0;
                    return (
                      <option key={q} value={q.toString()}>
                        {q.toLocaleString()} ({formatCOP(price)})
                      </option>
                    );
                  })}
                  <option value="custom" className="font-bold text-indigo-400">
                    ✨ Cantidad personalizada...
                  </option>
                </select>
              </div>

              {/* Input for Custom Quantity if "custom" is selected */}
              {selectedQtyMode === "custom" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`border rounded-xl p-3.5 space-y-2 ${
                    isDarkMode
                      ? "bg-indigo-950/40 border-indigo-800/60 text-indigo-200"
                      : "bg-indigo-50/40 border-indigo-100 text-indigo-900"
                  }`}
                >
                  <label className={`block text-[11px] font-bold uppercase tracking-wide ${
                    isDarkMode ? "text-indigo-300" : "text-indigo-900"
                  }`}>
                    Escriba la cantidad exacta:
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      value={customQtyValue}
                      onChange={(e) => setCustomQtyValue(e.target.value)}
                      placeholder="Ej. 3250, 7500, 18300..."
                      className={`w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold focus:outline-hidden focus:ring-2 ${
                        isDarkMode
                          ? "bg-slate-800 border-indigo-500/50 text-white focus:ring-indigo-500/40"
                          : "bg-white border-indigo-200 text-indigo-900 focus:ring-indigo-500/20"
                      }`}
                    />
                  </div>
                  <p className={`text-[10px] font-medium ${
                    isDarkMode ? "text-indigo-300" : "text-indigo-600"
                  }`}>
                    El sistema calculará automáticamente el costo e importe de venta en base al precio por 1.000 unidades.
                  </p>
                </motion.div>
              )}

              {/* Editable Provider Cost for this specific receipt */}
              {effectiveQuantity > 0 && !hideAdminData && (
                <div className={`rounded-xl p-3.5 border space-y-2 text-xs ${
                  isDarkMode
                    ? "bg-slate-800/80 border-slate-700"
                    : "bg-gray-50 border-gray-200"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`font-bold text-[11px] uppercase tracking-wide flex items-center gap-1 ${
                      isDarkMode ? "text-slate-300" : "text-gray-700"
                    }`}>
                      <Calculator className="w-3.5 h-3.5 text-indigo-400" />
                      Costo Proveedor para este pedido:
                    </span>
                    {!isOverridingCost ? (
                      <button
                        type="button"
                        onClick={() => setIsOverridingCost(true)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                      >
                        Modificar costo
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsOverridingCost(false);
                          if (selectedServiceObj) {
                            setItemProviderCost(calculateServicePrices(selectedServiceObj, effectiveQuantity).providerCost.toString());
                          }
                        }}
                        className={`text-[10px] font-medium cursor-pointer ${
                          isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        Restablecer
                      </button>
                    )}
                  </div>

                  <div className="relative rounded-md shadow-2xs">
                    <span className={`absolute inset-y-0 left-0 pl-2.5 flex items-center text-xs font-mono ${
                      isDarkMode ? "text-slate-500" : "text-gray-400"
                    }`}>$</span>
                    <input
                      type="number"
                      step="any"
                      value={itemProviderCost}
                      onChange={(e) => {
                        setIsOverridingCost(true);
                        setItemProviderCost(e.target.value);
                      }}
                      placeholder="Costo proveedor"
                      className={`block w-full pl-6 pr-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold transition ${
                        isOverridingCost
                          ? isDarkMode
                            ? "border-amber-500/60 bg-amber-950/40 text-amber-200 focus:ring-amber-500/20"
                            : "border-amber-300 bg-amber-50/50 text-amber-900 focus:ring-amber-500/20"
                          : isDarkMode
                          ? "border-slate-700 bg-slate-800 text-slate-100"
                          : "border-gray-200 bg-white text-gray-800"
                      }`}
                    />
                  </div>
                  {isOverridingCost && (
                    <p className={`text-[10px] font-medium ${
                      isDarkMode ? "text-amber-300" : "text-amber-700"
                    }`}>
                      Modificando el costo únicamente para este comprobante (no altera la configuración global).
                    </p>
                  )}
                </div>
              )}

              {/* Price Charged & Order IDs */}
              <div className="space-y-3.5">
                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${
                    isDarkMode ? "text-slate-400" : "text-gray-600"
                  }`}>
                    Precio Cobrado al Cliente (COP)
                  </label>
                  <div className="mt-1 relative rounded-md shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                      <span className="text-xs font-mono text-emerald-500 font-bold">$</span>
                    </div>
                    <input
                      type="number"
                      step="any"
                      disabled={effectiveQuantity <= 0}
                      value={customChargedPrice}
                      onChange={(e) => setCustomChargedPrice(e.target.value)}
                      placeholder="0"
                      className={`block w-full pl-6 pr-2.5 py-2 border rounded-lg text-sm font-mono font-bold text-emerald-500 transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 disabled:bg-slate-850 disabled:text-slate-600 focus:border-indigo-400"
                          : "bg-white border-gray-200 disabled:bg-gray-50 disabled:text-gray-400 focus:border-indigo-500"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold uppercase mb-1.5 ${
                    isDarkMode ? "text-slate-400" : "text-gray-600"
                  }`}>
                    Cantidad de IDs del Pedido
                  </label>
                  <div className="flex gap-4 items-center">
                    <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${
                      isDarkMode ? "text-slate-300" : "text-gray-700"
                    }`}>
                      <input
                        type="radio"
                        name="idCountType"
                        value="uno"
                        checked={idCountType === "uno"}
                        onChange={() => {
                          setIdCountType("uno");
                          setCustomOrderId2("");
                        }}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Un ID</span>
                    </label>
                    <label className={`flex items-center gap-1.5 text-xs cursor-pointer ${
                      isDarkMode ? "text-slate-300" : "text-gray-700"
                    }`}>
                      <input
                        type="radio"
                        name="idCountType"
                        value="dos"
                        checked={idCountType === "dos"}
                        onChange={() => setIdCountType("dos")}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Dos IDs</span>
                    </label>
                  </div>
                </div>

                {idCountType === "uno" ? (
                  <div>
                    <label className={`block text-[11px] font-semibold uppercase flex items-center justify-between ${
                      isDarkMode ? "text-slate-400" : "text-gray-600"
                    }`}>
                      <span>ID del Pedido MazSocialMarket (Opcional)</span>
                      <span className="text-[9px] text-indigo-400 font-bold">Autocompleta costo y estado</span>
                    </label>
                    <input
                      type="text"
                      value={customOrderId}
                      onChange={(e) => setCustomOrderId(e.target.value)}
                      placeholder="Pegar ID de MazSocialMarket o dejar vacío para auto-generar"
                      className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                          : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                      }`}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[11px] font-semibold uppercase font-mono ${
                        isDarkMode ? "text-slate-400" : "text-gray-600"
                      }`}>
                        ID 1 (Opcional)
                      </label>
                      <input
                        type="text"
                        value={customOrderId}
                        onChange={(e) => setCustomOrderId(e.target.value)}
                        placeholder="Pegar ID 1 o auto-generar"
                        className={`mt-1 block w-full px-3 py-2 border rounded-lg text-xs font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                            : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-[11px] font-semibold uppercase font-mono ${
                        isDarkMode ? "text-slate-400" : "text-gray-600"
                      }`}>
                        ID 2 (Opcional)
                      </label>
                      <input
                        type="text"
                        value={customOrderId2}
                        onChange={(e) => setCustomOrderId2(e.target.value)}
                        placeholder="Pegar ID 2 o auto-generar"
                        className={`mt-1 block w-full px-3 py-2 border rounded-lg text-xs font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                            : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* Live MazSocialMarket Provider Feedback Banner */}
                {providerSyncChecking && (
                  <div className="flex items-center gap-1.5 text-[11px] text-indigo-500 font-semibold py-1 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                    <span>Consultando orden en MazSocialMarket...</span>
                  </div>
                )}
                {providerOrderFeedback && !providerSyncChecking && (
                  <div className={`mt-1.5 p-2.5 rounded-lg border text-xs space-y-1 ${
                    providerOrderFeedback.found
                      ? providerOrderFeedback.mappedStatus === "completado"
                        ? isDarkMode ? "bg-emerald-950/40 border-emerald-800 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : providerOrderFeedback.mappedStatus === "cancelado"
                        ? isDarkMode ? "bg-rose-950/40 border-rose-800 text-rose-300" : "bg-rose-50 border-rose-200 text-rose-800"
                        : isDarkMode ? "bg-blue-950/40 border-blue-800 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-800"
                      : isDarkMode ? "bg-slate-800/80 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-gray-500"
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs">
                          {providerOrderFeedback.found
                            ? (providerOrderFeedback.mappedStatus === "completado" ? "✅" : providerOrderFeedback.mappedStatus === "cancelado" ? "🔴" : "🔵")
                            : "ℹ️"}
                        </span>
                        <span className="truncate">
                          <strong>MazSocialMarket:</strong> {formatProviderStatus(providerOrderFeedback.rawStatus)}
                        </span>
                      </div>
                      {providerOrderFeedback.found && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/10 shrink-0">
                          Auto-sincronizado
                        </span>
                      )}
                    </div>
                    {providerOrderFeedback.found && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-mono font-bold">
                        {providerOrderFeedback.autoCostCOP !== null && providerOrderFeedback.autoCostCOP !== undefined && (
                          <span className="px-1.5 py-0.5 rounded bg-black/10">
                            Costo: {formatCOP(providerOrderFeedback.autoCostCOP)}
                          </span>
                        )}
                        {providerOrderFeedback.autoStartCount !== null && providerOrderFeedback.autoStartCount !== undefined && (
                          <span className="px-1.5 py-0.5 rounded bg-black/10">
                            Conteo Inicial: {Number(providerOrderFeedback.autoStartCount).toLocaleString()}
                          </span>
                        )}
                        {providerOrderFeedback.autoQuantity !== null && providerOrderFeedback.autoQuantity !== undefined && (
                          <span className="px-1.5 py-0.5 rounded bg-black/10">
                            Cant. Proveedor: {Number(providerOrderFeedback.autoQuantity).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Customer Account / Target Post Link input (Active for all networks, with Live Instagram lookup) */}
                {selectedSocialId && (() => {
                  const currentSn = socialNetworks.find((s) => s.id === selectedSocialId);
                  const isIg = selectedSocialId === "instagram" || (currentSn && currentSn.name.toLowerCase().includes("instagram"));
                  const netName = currentSn?.name || "Red Social";

                  return (
                    <div className={`p-3.5 rounded-xl border space-y-2.5 transition ${
                      isDarkMode 
                        ? "bg-slate-800/90 border-slate-700" 
                        : isIg
                        ? "bg-gradient-to-br from-pink-50/50 via-purple-50/30 to-indigo-50/40 border-purple-200/80 shadow-2xs"
                        : "bg-indigo-50/40 border-indigo-100 text-gray-800 shadow-2xs"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                          isDarkMode ? "text-purple-300" : isIg ? "text-purple-900" : "text-indigo-900"
                        }`}>
                          {isIg ? <Instagram className="w-3.5 h-3.5 text-pink-500" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-500" />}
                          {isIg ? "Enlace o Cuenta de Instagram (Link o @perfil)" : `Enlace o Cuenta de ${netName} (Link de publicación o @perfil)`}
                        </span>
                        {itemStartCount && isIg && (
                          <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Inicial: {Number(itemStartCount).toLocaleString()} seg.
                          </span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={itemTargetAccount}
                          onChange={(e) => {
                            setItemTargetAccount(e.target.value);
                            setIgProfileFeedback(null);
                          }}
                          placeholder={isIg ? "Ej. @juanperez o instagram.com/juanperez" : `Ej. Enlace de la publicación o cuenta de ${netName}`}
                          className={`flex-1 px-3 py-1.5 border rounded-lg text-xs font-medium focus:outline-hidden focus:ring-2 ${
                            isDarkMode
                              ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-purple-400 focus:ring-purple-500/20"
                              : "bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:ring-indigo-500/20"
                          }`}
                        />
                        {isIg && (
                          <button
                            type="button"
                            disabled={isCheckingIg || !(itemTargetAccount || "").trim()}
                            onClick={handleVerifyInstagramInitialCount}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs shrink-0"
                            title="Consultar número actual de seguidores en vivo"
                          >
                            <RefreshCw className={`w-3 h-3 ${isCheckingIg ? "animate-spin" : ""}`} />
                            <span>{isCheckingIg ? "Consultando..." : "Consultar Inicial"}</span>
                          </button>
                        )}
                      </div>

                      {/* Manual start count adjustment (for Instagram follower orders) */}
                      {isIg && (
                        <div className="flex items-center gap-2 pt-0.5 text-xs">
                          <span className={`text-[10px] uppercase font-semibold ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                            Conteo Inicial:
                          </span>
                          <input
                            type="number"
                            value={itemStartCount}
                            onChange={(e) => setItemStartCount(e.target.value)}
                            placeholder="Ej. 1420"
                            className={`w-24 px-2 py-1 border rounded text-xs font-mono font-bold ${
                              isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-300 text-gray-800"
                            }`}
                          />
                          <span className={`text-[10px] ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                            (Permite calcular en vivo los seguidores que van llegando)
                          </span>
                        </div>
                      )}

                      {isIg && igProfileFeedback && (
                        <div className={`text-xs p-2.5 rounded-lg border flex items-center justify-between ${
                          igProfileFeedback.followersCount !== null
                            ? isDarkMode
                              ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                              : "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : isDarkMode
                            ? "bg-amber-950/40 border-amber-800 text-amber-300"
                            : "bg-amber-50 border-amber-200 text-amber-800"
                        }`}>
                          <div>
                            <span className="font-bold">@{igProfileFeedback.username}:</span>{" "}
                            {igProfileFeedback.followersCount !== null
                              ? `${igProfileFeedback.followersCount.toLocaleString()} seguidores detectados en vivo.`
                              : igProfileFeedback.error || "Perfil no detectado o privado."}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
            </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  disabled={isSubmitting || effectiveQuantity <= 0 || !(clientName || "").trim() || !(clientPhone || "").trim()}
                  onClick={() => handleEmitReceipt(true)}
                  className="w-full flex justify-center items-center py-2.5 px-3 border border-transparent rounded-lg shadow-sm text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 focus:outline-hidden disabled:opacity-40 transition cursor-pointer active:scale-[0.99]"
                  title="Emitir comprobante directamente en 1 clic sin pasar por el borrador"
                >
                  <Zap className="w-4 h-4 mr-1.5" />
                  ⚡ Emitir Directo Ahora
                </button>
                <button
                  type="submit"
                  disabled={effectiveQuantity <= 0}
                  className={`w-full flex justify-center items-center py-2.5 px-3 border rounded-lg shadow-2xs text-xs font-bold transition cursor-pointer active:scale-[0.99] disabled:opacity-40 ${
                    isDarkMode
                      ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-indigo-300"
                      : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                  }`}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  + Agregar al Borrador
                </button>
              </div>
            </form>
          )}
          </div>
        </div>

        {/* Right Column: Receipt Layout and draft preview */}
        <div className="lg:col-span-7 flex flex-col space-y-6">
          {/* Invoice draft board */}
          <div className={`rounded-xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex-1 flex flex-col justify-between ${
            isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <div className="space-y-6">
              <div className={`flex justify-between items-center border-b pb-4 ${
                isDarkMode ? "border-slate-800" : "border-gray-100"
              }`}>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-500" />
                  <h3 className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-950"}`}>
                    Borrador de Comprobante
                  </h3>
                </div>
                <div className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md border ${
                  isDarkMode
                    ? "bg-indigo-950/60 text-indigo-300 border-indigo-800/60"
                    : "bg-indigo-50/50 text-indigo-700 border-indigo-100/50"
                }`}>
                  {businessConfig.businessName || "ImpulsaNet"}
                </div>
              </div>

              {/* Draft Customer Card */}
              {clientName ? (
                <div className={`rounded-xl p-3.5 border flex justify-between items-center text-xs ${
                  isDarkMode
                    ? "bg-slate-800/80 border-slate-700 text-slate-200"
                    : "bg-gray-50/50 border-gray-100 text-gray-800"
                }`}>
                  <div>
                    <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Cliente:</span>
                    <strong className={`ml-1.5 ${isDarkMode ? "text-white" : "text-gray-800"}`}>{clientName}</strong>
                  </div>
                  {clientPhone && (
                    <div>
                      <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Teléfono:</span>
                      <strong className={`ml-1.5 font-mono ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>{clientPhone}</strong>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`text-center py-4 rounded-xl border border-dashed text-xs ${
                  isDarkMode
                    ? "bg-slate-800/40 border-slate-700 text-slate-500"
                    : "bg-gray-50/30 border-gray-200 text-gray-400"
                }`}>
                  Complete los datos del cliente a la izquierda.
                </div>
              )}

              {/* Added items list */}
              <div className="space-y-2">
                <div className={`text-[10px] font-bold uppercase tracking-wider px-1 flex items-center justify-between ${
                  isDarkMode ? "text-slate-400" : "text-gray-400"
                }`}>
                  <span>Servicios Incluidos ({effectiveDraftItems.length})</span>
                  {addedItems.length === 0 && pendingFormPreviewItems.length > 0 && (
                    <span className="text-emerald-500 font-extrabold flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      Listo para emisión directa en 1 clic
                    </span>
                  )}
                </div>

                {addedItems.length === 0 ? (
                  pendingFormPreviewItems.length > 0 ? (
                    <div className={`divide-y border rounded-xl overflow-hidden shadow-2xs ${
                      isDarkMode
                        ? "border-emerald-800/70 divide-slate-700 bg-emerald-950/15"
                        : "border-emerald-200 divide-gray-100 bg-emerald-50/30"
                    }`}>
                      {pendingFormPreviewItems.map((item) => (
                        <div key={item.id} className="p-3.5 space-y-1.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className={`text-xs font-bold flex items-center gap-1.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                                <span>
                                  {item.socialNetworkName && (item.socialNetworkName || "").toLowerCase() !== (item.serviceName || "").toLowerCase()
                                    ? `${item.socialNetworkName} - ${item.serviceName}`
                                    : (item.serviceName || item.socialNetworkName)}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500 font-extrabold uppercase">
                                  Vista previa en vivo
                                </span>
                              </div>
                              <div className={`text-[11px] font-mono font-bold mt-0.5 ${
                                isDarkMode ? "text-indigo-400" : "text-indigo-700"
                              }`}>
                                {item.quantity.toLocaleString()} unidades • Cobrado: {formatCOP(item.chargedPrice)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`text-center py-10 rounded-xl border border-dashed text-xs ${
                      isDarkMode
                        ? "bg-slate-800/40 border-slate-700 text-slate-500"
                        : "bg-gray-50/30 border-gray-200 text-gray-400"
                    }`}>
                      Seleccione un servicio a la izquierda para emitir directo o agregar al borrador.
                    </div>
                  )
                ) : (
                  <div className={`divide-y border rounded-xl overflow-hidden shadow-2xs ${
                    isDarkMode
                      ? "border-slate-700 divide-slate-700"
                      : "border-gray-200 divide-gray-100"
                  }`}>
                    {addedItems.map((item) => {
                      const syncInfo = draftItemSyncFeedback[item.id];
                      return (
                        <div key={item.id} className={`p-3.5 transition space-y-2 ${
                          isDarkMode ? "hover:bg-slate-800/50 bg-slate-850/40" : "hover:bg-gray-50/50"
                        }`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <div className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                                {item.socialNetworkName && (item.socialNetworkName || "").toLowerCase() !== (item.serviceName || "").toLowerCase()
                                  ? `${item.socialNetworkName} - ${item.serviceName}`
                                  : (item.serviceName || item.socialNetworkName)}
                              </div>
                              <div className={`text-[11px] font-mono font-bold mt-0.5 ${
                                isDarkMode ? "text-indigo-400" : "text-indigo-700"
                              }`}>
                                {item.quantity.toLocaleString()} unidades
                              </div>
                            </div>

                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className={`p-1 rounded-md transition cursor-pointer ${
                                isDarkMode ? "text-rose-400 hover:text-rose-300 hover:bg-rose-950/40" : "text-red-400 hover:text-red-600 hover:bg-red-50"
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Inline controls for charged price, custom provider cost & order ID */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                            <div>
                              <label className={`block text-[9px] font-bold uppercase ${
                                isDarkMode ? "text-slate-400" : "text-gray-400"
                              }`}>
                                Precio Cobrado
                              </label>
                              <div className="relative mt-0.5">
                                <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-[10px] text-emerald-500 font-mono font-bold">$</span>
                                <input
                                  type="number"
                                  step="any"
                                  value={item.chargedPrice}
                                  onChange={(e) => handleUpdateItemChargedPrice(item.id, e.target.value)}
                                  className={`w-full pl-5 pr-1.5 py-1 border rounded-md font-mono font-bold text-emerald-500 ${
                                    isDarkMode
                                      ? "bg-slate-800 border-slate-700 text-emerald-400 focus:ring-1 focus:ring-emerald-500"
                                      : "bg-white border-gray-200"
                                  }`}
                                />
                              </div>
                            </div>

                            {!hideAdminData && (
                              <div>
                                <label className={`block text-[9px] font-bold uppercase ${
                                  isDarkMode ? "text-slate-400" : "text-gray-400"
                                }`}>
                                  Costo Prov. (Editable)
                                </label>
                                <div className="relative mt-0.5">
                                  <span className={`absolute inset-y-0 left-0 pl-2 flex items-center text-[10px] font-mono ${
                                    isDarkMode ? "text-slate-500" : "text-gray-400"
                                  }`}>$</span>
                                  <input
                                    type="number"
                                    step="any"
                                    value={item.providerCostAtPurchase}
                                    onChange={(e) => handleUpdateItemProviderCost(item.id, e.target.value)}
                                    className={`w-full pl-5 pr-1.5 py-1 border rounded-md font-mono ${
                                      isDarkMode
                                        ? "bg-slate-800 border-slate-700 text-slate-200"
                                        : "bg-white border-gray-200 text-gray-800"
                                    }`}
                                  />
                                </div>
                              </div>
                            )}

                            <div>
                              <label className={`block text-[9px] font-bold uppercase truncate ${
                                isDarkMode ? "text-slate-400" : "text-gray-400"
                              }`}>
                                {getOrderIdTypeLabel(item.orderId, item.socialNetworkId === "custom")}
                              </label>
                              <input
                                type="text"
                                value={item.orderId}
                                onChange={(e) => handleUpdateItemOrderId(item.id, e.target.value)}
                                placeholder="Pegar nuevo ID o dejar auto"
                                className={`mt-0.5 w-full px-2 py-1 border rounded-md font-mono text-xs ${
                                  isDarkMode
                                    ? "bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500"
                                    : "bg-white border-gray-200 text-gray-700 placeholder-gray-400"
                                }`}
                              />
                            </div>
                          </div>

                          {syncInfo && (
                            <div className={`text-[10px] font-semibold flex items-center justify-between px-2 py-1 rounded ${
                              syncInfo.checking
                                ? "text-indigo-400"
                                : syncInfo.found
                                ? isDarkMode ? "bg-emerald-950/50 text-emerald-300" : "bg-emerald-50 text-emerald-800"
                                : isDarkMode ? "text-slate-400" : "text-gray-500"
                            }`}>
                              <span>
                                {syncInfo.checking
                                  ? "Sincronizando ID con MazSocialMarket..."
                                  : syncInfo.found
                                  ? `✅ MazSocialMarket: ${formatProviderStatus(syncInfo.rawStatus || "")}${syncInfo.autoCostCOP ? ` • Costo: ${formatCOP(syncInfo.autoCostCOP)}` : ""}`
                                  : "ℹ️ ID aún no reportado en MazSocialMarket"}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Calculations and Emit Button */}
            <div className={`pt-6 border-t mt-6 space-y-4 ${
              isDarkMode ? "border-slate-800" : "border-gray-100"
            }`}>
              <div className={`rounded-xl p-4 space-y-2 border ${
                isDarkMode ? "bg-slate-800/80 border-slate-700 text-slate-200" : "bg-gray-50/80 border-gray-150 text-gray-900"
              }`}>
                <div className={`flex justify-between items-center text-xs ${
                  isDarkMode ? "text-slate-400" : "text-gray-500"
                }`}>
                  <span>Subtotal sugerido</span>
                  <span className="font-mono">{formatCOP(totals.subtotal)}</span>
                </div>

                <div className={`flex justify-between items-center text-sm font-bold pt-1.5 border-t ${
                  isDarkMode ? "border-slate-700 text-white" : "border-gray-200 text-gray-950"
                }`}>
                  <span>Total Cobrado al Cliente</span>
                  <span className={`font-mono text-base font-bold ${
                    isDarkMode ? "text-indigo-400" : "text-indigo-600"
                  }`}>
                    {formatCOP(totals.totalCharged)}
                  </span>
                </div>

                {/* Administrative Stats (Show/Hide) */}
                {!hideAdminData && effectiveDraftItems.length > 0 && (
                  <div className={`mt-2.5 pt-2.5 border-t border-dashed grid grid-cols-2 gap-4 text-xs ${
                    isDarkMode ? "border-slate-700" : "border-gray-200"
                  }`}>
                    <div className={`p-2.5 rounded-lg border ${
                      isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200"
                    }`}>
                      <span className={`uppercase tracking-wider text-[9px] font-bold ${
                        isDarkMode ? "text-slate-400" : "text-gray-400"
                      }`}>
                        Costo del Proveedor
                      </span>
                      <div className={`font-mono font-semibold mt-0.5 ${
                        isDarkMode ? "text-slate-300" : "text-gray-700"
                      }`}>
                        {formatCOP(totals.totalProviderCost)}
                      </div>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${
                      isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200"
                    }`}>
                      <span className={`uppercase tracking-wider text-[9px] font-bold ${
                        isDarkMode ? "text-slate-400" : "text-gray-400"
                      }`}>
                        Ganancia Neta
                      </span>
                      <div className="font-mono text-emerald-400 font-bold mt-0.5">
                        {formatCOP(totals.totalProfit)}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className={`p-3 rounded-lg flex items-start gap-2 text-xs border ${
                  isDarkMode
                    ? "bg-red-950/50 border-red-800 text-red-300"
                    : "bg-red-50 border-red-100 text-red-600"
                }`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                id="btn-emit-receipt"
                onClick={() => handleEmitReceipt(false)}
                disabled={isSubmitting || effectiveDraftItems.length === 0}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-hidden disabled:opacity-50 transition cursor-pointer active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-1">
                    Emitiendo...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    Emitir Comprobante de Pago
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
