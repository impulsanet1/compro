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
  DollarSign,
  Eye,
  EyeOff,
  User,
  Phone,
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
  MessageSquare
} from "lucide-react";
import { ReceiptItem, Receipt, Client, getServiceBaseCosts, calculateServicePrices, getClientCode, calculateSupplierCostUSD, calculateSupplierCostCOP, getItemOrderIds } from "../types";
import { motion } from "motion/react";

interface GeneratorViewProps {
  onReceiptGenerated: (receipt: Receipt) => void;
}

export const GeneratorView: React.FC<GeneratorViewProps> = ({ onReceiptGenerated }) => {
  const { socialNetworks, services, createReceipt, businessConfig, clients, trmState, fetchTRM, isDarkMode } = useApp();
  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  // Client info state
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [selectedClientObj, setSelectedClientObj] = useState<Client | null>(null);

  // Client search results
  const matchingClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return [];
    const query = clientSearchQuery.trim().toLowerCase();
    return clients
      .map((c, idx) => ({ ...c, code: getClientCode(c, idx) }))
      .filter((c) => {
        return (
          c.code.toLowerCase().includes(query) ||
          (c.clientCode && c.clientCode.toLowerCase().includes(query)) ||
          c.name.toLowerCase().includes(query) ||
          c.phone.includes(query)
        );
      })
      .slice(0, 5);
  }, [clients, clientSearchQuery]);

  const handleSelectClient = (client: Client & { code: string }) => {
    setClientName(client.name);
    setClientPhone(client.phone);
    setSelectedClientObj(client);
    setClientSearchQuery("");
  };

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
  const [status, setStatus] = useState<"en_proceso" | "completado" | "garantia_en_proceso" | "cancelado">("completado");
  const [internalNotes, setInternalNotes] = useState("");

  // Receipt items array
  const [addedItems, setAddedItems] = useState<ReceiptItem[]>([]);

  // Toggle for hiding admin data (sensitive provider cost/profit)
  const [hideAdminData, setHideAdminData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    return { lastCodeStr };
  }, [clients]);

  // Filtered services for selected social network
  const availableServices = useMemo(() => {
    return services.filter((s) => s.socialNetworkId === selectedSocialId);
  }, [services, selectedSocialId]);

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

  // Auto-calculate suggested price and provider cost when quantity changes
  useEffect(() => {
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
  }, [selectedServiceObj, effectiveQuantity, isOverridingCost, trmState.valor]);

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

  // Totals calculations
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalCharged = 0;
    let totalProviderCost = 0;

    addedItems.forEach((item) => {
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
  }, [addedItems]);

  // Add Item to Receipt Draft
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedSocialId || !selectedServiceId || !selectedQtyMode) {
      setError("Por favor seleccione la Red Social, el Servicio y la Cantidad.");
      return;
    }

    if (effectiveQuantity <= 0) {
      setError("Por favor ingrese una cantidad numérica válida mayor a 0.");
      return;
    }

    const sn = socialNetworks.find((s) => s.id === selectedSocialId);
    const srv = selectedServiceObj;

    if (!sn || !srv) {
      setError("Error cargando la configuración del servicio seleccionado.");
      return;
    }

    const chargedPrice = parseFloat(customChargedPrice);
    if (isNaN(chargedPrice) || chargedPrice < 0) {
      setError("Por favor ingrese un precio cobrado válido.");
      return;
    }

    // Auto calculate default provider cost if not overridden
    const { providerCost: autoProvCost, suggestedPrice: autoSuggPrice } = calculateServicePrices(srv, effectiveQuantity);
    
    // TRM calculation if USD supplier cost exists
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
      const o1 = customOrderId.trim() || `PED-${Math.floor(100000 + Math.random() * 900000)}`;
      const o2 = customOrderId2.trim() || `PED-${Math.floor(100000 + Math.random() * 900000)}`;
      finalOrderIds = [o1, o2];
    } else {
      const raw = customOrderId.trim();
      if (raw) {
        const split = raw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
        finalOrderIds = split.length > 0 ? split : [raw];
      } else {
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
    };

    setAddedItems((prev) => [...prev, newItem]);

    // Reset selector inputs
    setSelectedQtyMode("");
    setCustomQtyValue("");
    setIsOverridingCost(false);
    setItemProviderCost("");
    setCustomOrderId("");
    setCustomOrderId2("");
    setCustomChargedPrice("");
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
    const split = orderIdInput.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const cleanOrderIds = split.length > 0 ? split : (orderIdInput.trim() ? [orderIdInput.trim()] : []);
    setAddedItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              orderId: orderIdInput,
              orderIds: cleanOrderIds
            }
          : item
      )
    );
  };

  const handleEmitReceipt = async () => {
    setError(null);

    if (!clientName.trim()) {
      setError("Por favor ingrese el nombre del cliente.");
      return;
    }

    if (!clientPhone.trim()) {
      setError("Por favor ingrese el teléfono de contacto del cliente.");
      return;
    }

    if (addedItems.length === 0) {
      setError("Debe agregar al menos un servicio al comprobante.");
      return;
    }

    setIsSubmitting(true);

    try {
      const sanitizedServices = addedItems.map((item) => {
        const ids = getItemOrderIds(item);
        return {
          ...item,
          orderId: ids.join(", "),
          orderIds: ids
        };
      });

      const receiptData = {
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        date: new Date().toISOString(),
        services: sanitizedServices,
        subtotal: totals.subtotal,
        totalCharged: totals.totalCharged,
        totalProviderCost: totals.totalProviderCost,
        totalProfit: totals.totalProfit,
        trmUsed: trmState.valor || undefined,
        trmDate: trmState.fecha || undefined,
        providerCostCOP: totals.totalProviderCost,
        salePrice: totals.totalCharged,
        profit: totals.totalProfit,
        warranty: `${businessConfig.warrantyDays} días`,
        thankYouMessage: "¡Gracias por confiar en ImpulsaNet para potenciar sus redes!",
        status: status,
        internalNotes: internalNotes.trim(),
      };

      const result = await createReceipt(receiptData);
      
      // Notify parent to open receipt modal
      onReceiptGenerated(result);

      // Reset form entirely
      setClientName("");
      setClientPhone("");
      setAddedItems([]);
      setStatus("completado");
      setInternalNotes("");
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
            Emisión de Comprobantes
          </h2>
          <p className={`text-xs mt-1 ${
            isDarkMode ? "text-slate-400" : "text-gray-500"
          }`}>
            Cree un comprobante con cantidades dinámicas o personalizadas
          </p>
        </div>
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
      </div>

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
                onClick={() => {
                  navigator.clipboard.writeText(whatsappCodeStats.lastCodeStr);
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
              </div>
            </div>
          </div>

          {/* Control Interno (Uso Administrativo) Section */}
          <div className={`rounded-xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4 ${
            isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-500" />
              Control Interno de Pedido
            </h3>

            <div className="space-y-3">
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
                  <option value="en_proceso">🟢 En proceso</option>
                  <option value="completado">✅ Completado</option>
                  <option value="garantia_en_proceso">🟡 Garantía en proceso</option>
                  <option value="cancelado">🔴 Cancelado</option>
                </select>
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
          </div>

          {/* Selector Form for Adding Service */}
          <div className={`rounded-xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${
            isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-4">
              <PlusCircle className="w-4 h-4 text-indigo-500" />
              Agregar Servicio al Borrador
            </h3>

            <form onSubmit={handleAddItem} className="space-y-4">
              {/* Select Social Network */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase ${
                  isDarkMode ? "text-slate-400" : "text-gray-600"
                }`}>
                  Red Social
                </label>
                <select
                  value={selectedSocialId}
                  onChange={(e) => setSelectedSocialId(e.target.value)}
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
                        disabled={effectiveQuantity <= 0}
                        checked={idCountType === "uno"}
                        onChange={() => {
                          setIdCountType("uno");
                          setCustomOrderId2("");
                        }}
                        className="text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
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
                        disabled={effectiveQuantity <= 0}
                        checked={idCountType === "dos"}
                        onChange={() => setIdCountType("dos")}
                        className="text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      <span>Dos IDs</span>
                    </label>
                  </div>
                </div>

                {idCountType === "uno" ? (
                  <div>
                    <label className={`block text-[11px] font-semibold uppercase ${
                      isDarkMode ? "text-slate-400" : "text-gray-600"
                    }`}>
                      ID del Pedido (Opcional)
                    </label>
                    <input
                      type="text"
                      disabled={effectiveQuantity <= 0}
                      value={customOrderId}
                      onChange={(e) => setCustomOrderId(e.target.value)}
                      placeholder="Auto-generar"
                      className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 disabled:bg-slate-850 disabled:text-slate-600 focus:border-indigo-400"
                          : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400 focus:border-indigo-500"
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
                        disabled={effectiveQuantity <= 0}
                        value={customOrderId}
                        onChange={(e) => setCustomOrderId(e.target.value)}
                        placeholder="Auto-generar"
                        className={`mt-1 block w-full px-3 py-2 border rounded-lg text-xs font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 disabled:bg-slate-850 disabled:text-slate-600 focus:border-indigo-400"
                            : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400 focus:border-indigo-500"
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
                        disabled={effectiveQuantity <= 0}
                        value={customOrderId2}
                        onChange={(e) => setCustomOrderId2(e.target.value)}
                        placeholder="Auto-generar"
                        className={`mt-1 block w-full px-3 py-2 border rounded-lg text-xs font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 disabled:bg-slate-850 disabled:text-slate-600 focus:border-indigo-400"
                            : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 disabled:bg-gray-50 disabled:text-gray-400 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={effectiveQuantity <= 0}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-hidden disabled:opacity-40 transition mt-2 cursor-pointer active:scale-[0.99]"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Agregar al Comprobante
              </button>
            </form>
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
                <div className={`text-[10px] font-bold uppercase tracking-wider px-1 ${
                  isDarkMode ? "text-slate-400" : "text-gray-400"
                }`}>
                  Servicios Incluidos ({addedItems.length})
                </div>

                {addedItems.length === 0 ? (
                  <div className={`text-center py-10 rounded-xl border border-dashed text-xs ${
                    isDarkMode
                      ? "bg-slate-800/40 border-slate-700 text-slate-500"
                      : "bg-gray-50/30 border-gray-200 text-gray-400"
                  }`}>
                    Aún no ha agregado servicios al borrador del comprobante.
                  </div>
                ) : (
                  <div className={`divide-y border rounded-xl overflow-hidden shadow-2xs ${
                    isDarkMode
                      ? "border-slate-700 divide-slate-700"
                      : "border-gray-200 divide-gray-100"
                  }`}>
                    {addedItems.map((item) => (
                      <div key={item.id} className={`p-3.5 transition space-y-2 ${
                        isDarkMode ? "hover:bg-slate-800/50 bg-slate-850/40" : "hover:bg-gray-50/50"
                      }`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                              {item.socialNetworkName} - {item.serviceName}
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
                            <label className={`block text-[9px] font-bold uppercase ${
                              isDarkMode ? "text-slate-400" : "text-gray-400"
                            }`}>
                              ID Pedido
                            </label>
                            <input
                              type="text"
                              value={item.orderId}
                              onChange={(e) => handleUpdateItemOrderId(item.id, e.target.value)}
                              className={`mt-0.5 w-full px-2 py-1 border rounded-md font-mono text-xs ${
                                isDarkMode
                                  ? "bg-slate-800 border-slate-700 text-slate-200"
                                  : "bg-white border-gray-200 text-gray-700"
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
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
                {!hideAdminData && addedItems.length > 0 && (
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
                onClick={handleEmitReceipt}
                disabled={isSubmitting || addedItems.length === 0}
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
    </div>
  );
};
