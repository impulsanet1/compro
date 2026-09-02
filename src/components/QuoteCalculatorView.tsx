/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  Calculator,
  Plus,
  Trash2,
  Copy,
  Check,
  TrendingUp,
  DollarSign,
  Package,
  Layers,
  Smartphone
} from "lucide-react";
import {
  SocialNetwork,
  Service,
  ReceiptItem,
  getServiceBaseCosts
} from "../types";
import { motion, AnimatePresence } from "motion/react";

export interface QuoteItem {
  id: string;
  socialNetworkId: string;
  serviceId: string;
  quantity: number;
  providerCostPer1000COP: number;
  providerCostPer1000USD?: number;
  customMarginPercent?: number; // Optional item-specific margin % override
  // For budget distribution mode
  budgetPercentage?: number; // e.g. 50% of budget allocated
}

export const QuoteCalculatorView: React.FC = () => {
  const { socialNetworks, services, businessConfig, isDarkMode } = useApp();
  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  // Mode: "budget" (Customer has a total budget) vs "custom_items" (Build quote by specific quantities)
  const [calcMode, setCalcMode] = useState<"budget" | "custom_items">("budget");

  // Client info for quote
  const [clientName, setClientName] = useState("");
  
  // Total Client Budget in COP (for budget mode)
  const [totalBudgetStr, setTotalBudgetStr] = useState<string>("50000");

  // Global Margin Percent (e.g. 50% = 1.5x, 100% = 2x, 150% = 2.5x)
  const [globalMarginPercent, setGlobalMarginPercent] = useState<number>(60);

  // Quote items list
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>(() => {
    // Default initial item
    const ig = socialNetworks.find((sn) => sn.id === "instagram") || socialNetworks[0];
    const defaultSrv = services.find((s) => s.socialNetworkId === ig?.id) || services[0];
    const base = defaultSrv ? getServiceBaseCosts(defaultSrv) : null;
    return [
      {
        id: "item_init_1",
        socialNetworkId: ig?.id || "instagram",
        serviceId: defaultSrv?.id || "",
        quantity: 1000,
        providerCostPer1000COP: base?.providerCostPer1000 || 5000,
        providerCostPer1000USD: defaultSrv?.providerCostUSDPer1000 || 1.25,
        budgetPercentage: 100,
      }
    ];
  });

  const [copiedText, setCopiedText] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Helper to get Social Network object
  const getSocial = (id: string) => socialNetworks.find((sn) => sn.id === id);
  // Helper to get Service object
  const getService = (id: string) => services.find((s) => s.id === id);

  // Add a new item
  const handleAddItem = (socialId?: string) => {
    const targetSocialId = socialId || socialNetworks[0]?.id || "instagram";
    const available = services.filter((s) => s.socialNetworkId === targetSocialId);
    const targetService = available[0] || services[0];
    const base = targetService ? getServiceBaseCosts(targetService) : null;

    const newItem: QuoteItem = {
      id: "quote_" + Math.random().toString(36).substring(2, 9),
      socialNetworkId: targetSocialId,
      serviceId: targetService?.id || "",
      quantity: 1000,
      providerCostPer1000COP: base?.providerCostPer1000 || 5000,
      providerCostPer1000USD: targetService?.providerCostUSDPer1000 || 1.25,
      budgetPercentage: Math.max(10, Math.floor(100 / (quoteItems.length + 1))),
    };

    setQuoteItems([...quoteItems, newItem]);
  };

  // Remove item
  const handleRemoveItem = (id: string) => {
    if (quoteItems.length <= 1) return;
    setQuoteItems(quoteItems.filter((i) => i.id !== id));
  };

  // Update item fields
  const handleUpdateItem = (id: string, updates: Partial<QuoteItem>) => {
    setQuoteItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates };

        // If social network changed, update service to first available
        if (updates.socialNetworkId && updates.socialNetworkId !== item.socialNetworkId) {
          const avail = services.filter((s) => s.socialNetworkId === updates.socialNetworkId);
          const firstSrv = avail[0];
          if (firstSrv) {
            updated.serviceId = firstSrv.id;
            const base = getServiceBaseCosts(firstSrv);
            updated.providerCostPer1000COP = base.providerCostPer1000;
            updated.providerCostPer1000USD = firstSrv.providerCostUSDPer1000;
          }
        }

        // If service changed, update provider cost
        if (updates.serviceId && updates.serviceId !== item.serviceId) {
          const srvObj = services.find((s) => s.id === updates.serviceId);
          if (srvObj) {
            const base = getServiceBaseCosts(srvObj);
            updated.providerCostPer1000COP = base.providerCostPer1000;
            updated.providerCostPer1000USD = srvObj.providerCostUSDPer1000;
          }
        }

        return updated;
      })
    );
  };

  // Parse numeric total budget
  const numericTotalBudget = useMemo(() => {
    const raw = parseInt(totalBudgetStr.replace(/\D/g, ""), 10);
    return !isNaN(raw) && raw > 0 ? raw : 0;
  }, [totalBudgetStr]);

  // Round quantity to commercial friendly steps (e.g. multiples of 50, 100, or 250)
  const roundToCommercial = (rawQty: number): number => {
    if (rawQty <= 0) return 0;
    if (rawQty < 100) return Math.round(rawQty / 10) * 10 || 10;
    if (rawQty < 500) return Math.round(rawQty / 25) * 25;
    if (rawQty < 2000) return Math.round(rawQty / 50) * 50;
    if (rawQty < 10000) return Math.round(rawQty / 100) * 100;
    return Math.round(rawQty / 250) * 250;
  };

  // Calculations per item
  const calculatedItems = useMemo(() => {
    const count = quoteItems.length;
    if (count === 0) return [];

    // Sum of budget percentages
    const totalBudgetPct = quoteItems.reduce((acc, curr) => acc + (curr.budgetPercentage || 100 / count), 0);

    return quoteItems.map((item) => {
      const srv = getService(item.serviceId);
      const social = getSocial(item.socialNetworkId);
      const margin = item.customMarginPercent !== undefined ? item.customMarginPercent : globalMarginPercent;
      const marginMultiplier = 1 + margin / 100; // e.g. 60% margin => multiplier 1.6

      const costPer1000COP = item.providerCostPer1000COP || 5000;
      // Sale price per 1000 = costPer1000 * marginMultiplier
      const salePricePer1000 = costPer1000COP * marginMultiplier;

      let effectiveQty = item.quantity;
      let itemChargedPrice = 0;
      let itemProviderCost = 0;
      let allocatedBudget = 0;

      if (calcMode === "budget") {
        // Calculate based on allocated budget
        const normalizedPct = totalBudgetPct > 0 ? (item.budgetPercentage || 100 / count) / totalBudgetPct : 1 / count;
        allocatedBudget = Math.round(numericTotalBudget * normalizedPct);

        if (salePricePer1000 > 0 && allocatedBudget > 0) {
          const rawQty = (allocatedBudget / salePricePer1000) * 1000;
          effectiveQty = roundToCommercial(rawQty);
          // Recalculate cost & price with rounded quantity
          itemProviderCost = Math.round((effectiveQty / 1000) * costPer1000COP);
          itemChargedPrice = Math.round((effectiveQty / 1000) * salePricePer1000);
        } else {
          effectiveQty = 0;
          itemProviderCost = 0;
          itemChargedPrice = 0;
        }
      } else {
        // Custom items mode: quantity is set directly by user
        effectiveQty = item.quantity || 0;
        itemProviderCost = Math.round((effectiveQty / 1000) * costPer1000COP);
        itemChargedPrice = Math.round((effectiveQty / 1000) * salePricePer1000);
        allocatedBudget = itemChargedPrice;
      }

      const itemProfit = itemChargedPrice - itemProviderCost;
      const effectiveMarginPercent = itemProviderCost > 0 ? Math.round((itemProfit / itemProviderCost) * 100) : margin;

      return {
        ...item,
        serviceName: srv?.name || "Servicio",
        socialName: social?.name || "Red Social",
        effectiveQty,
        costPer1000COP,
        salePricePer1000,
        itemProviderCost,
        itemChargedPrice,
        itemProfit,
        effectiveMarginPercent,
        allocatedBudget,
      };
    });
  }, [quoteItems, calcMode, numericTotalBudget, globalMarginPercent, services, socialNetworks]);

  // Overall totals
  const overallTotals = useMemo(() => {
    let totalSale = 0;
    let totalCost = 0;
    let totalQty = 0;

    calculatedItems.forEach((it) => {
      totalSale += it.itemChargedPrice;
      totalCost += it.itemProviderCost;
      totalQty += it.effectiveQty;
    });

    const totalProfit = totalSale - totalCost;
    const avgMarginPercent = totalCost > 0 ? Math.round((totalProfit / totalCost) * 100) : globalMarginPercent;

    return {
      totalSale,
      totalCost,
      totalProfit,
      totalQty,
      avgMarginPercent,
    };
  }, [calculatedItems, globalMarginPercent]);

  // Generate clean WhatsApp message
  const generatedWhatsAppMessage = useMemo(() => {
    const greeting = clientName.trim() ? `¡Hola ${clientName.trim()}! 👋` : "¡Hola! 👋";
    const header = `${greeting}\nAquí tienes la cotización personalizada de *${businessConfig.businessName || "ImpulsaNet"}*:\n`;

    let itemsList = "";
    calculatedItems.forEach((it) => {
      itemsList += `\n🚀 *${it.socialName} - ${it.serviceName}*\n`;
      itemsList += `   • Cantidad: *${it.effectiveQty.toLocaleString("es-CO")}* unidades\n`;
      if (calcMode === "custom_items" && calculatedItems.length > 1) {
        itemsList += `   • Subtotal: ${formatCOP(it.itemChargedPrice)}\n`;
      }
    });

    const footer = `\n━━━━━━━━━━━━━━━\n💰 *VALOR TOTAL: ${formatCOP(overallTotals.totalSale)} COP*\n🛡️ *Garantía:* ${businessConfig.warrantyDays || 30} días de reposición\n⚡ *Entrega:* Activación rápida\n\n¿Deseas que activemos este paquete ahora mismo? Quedo atento/a para enviarte los medios de pago. 📲`;

    return header + itemsList + footer;
  }, [calculatedItems, overallTotals, clientName, businessConfig, calcMode]);

  // Copy WhatsApp message to clipboard
  const handleCopyWhatsApp = () => {
    navigator.clipboard.writeText(generatedWhatsAppMessage);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
      {/* Top Header Card */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition shadow-xs ${
        isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h1 className={`text-lg sm:text-xl font-bold tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Calculadora & Cotizador de Paquetes
              </h1>
              <p className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                Arma presupuestos rápidos, ajusta márgenes de ganancia y envía la cotización lista para WhatsApp.
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700/60 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setCalcMode("budget")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                calcMode === "budget"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : isDarkMode
                  ? "text-slate-400 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Por Presupuesto</span>
            </button>
            <button
              type="button"
              onClick={() => setCalcMode("custom_items")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                calcMode === "custom_items"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : isDarkMode
                  ? "text-slate-400 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Por Cantidades</span>
            </button>
          </div>
        </div>

        {/* Global Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5 pt-4 border-t border-gray-150 dark:border-slate-800/80">
          {/* Client Name Input */}
          <div>
            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
              isDarkMode ? "text-slate-300" : "text-gray-600"
            }`}>
              Nombre del Cliente (Opcional)
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ej. Juan Pérez"
              className={`w-full px-3 py-2 text-xs rounded-xl border font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition ${
                isDarkMode ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500" : "bg-gray-50 border-gray-200 text-gray-900"
              }`}
            />
          </div>

          {/* Budget Input (if in budget mode) */}
          {calcMode === "budget" ? (
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                isDarkMode ? "text-slate-300" : "text-gray-600"
              }`}>
                Presupuesto del Cliente (COP)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-gray-400">$</span>
                <input
                  type="text"
                  value={totalBudgetStr ? parseInt(totalBudgetStr.replace(/\D/g, "") || "0").toLocaleString("es-CO") : ""}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "");
                    setTotalBudgetStr(clean);
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="50.000"
                  className={`w-full pl-7 pr-3 py-2 text-xs font-mono font-bold rounded-xl border focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition ${
                    isDarkMode ? "bg-slate-800 border-slate-700 text-emerald-400" : "bg-gray-50 border-gray-200 text-emerald-700"
                  }`}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1 ${
                isDarkMode ? "text-slate-300" : "text-gray-600"
              }`}>
                Modalidad
              </label>
              <div className={`px-3 py-2 text-xs rounded-xl border font-semibold flex items-center gap-1.5 ${
                isDarkMode ? "bg-slate-800/60 border-slate-700 text-slate-300" : "bg-gray-50 border-gray-200 text-gray-700"
              }`}>
                <Package className="w-3.5 h-3.5 text-indigo-400" />
                <span>Cotización por Cantidades fijas</span>
              </div>
            </div>
          )}

          {/* Global Margin Slider / Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className={`text-[11px] font-bold uppercase tracking-wider ${
                isDarkMode ? "text-slate-300" : "text-gray-600"
              }`}>
                Margen de Ganancia Global
              </label>
              <span className="text-xs font-mono font-bold text-indigo-500">
                +{globalMarginPercent}% ({((1 + globalMarginPercent / 100)).toFixed(2)}x)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="10"
                max="300"
                step="5"
                value={globalMarginPercent}
                onChange={(e) => setGlobalMarginPercent(Number(e.target.value))}
                className="w-full accent-indigo-600 h-2 bg-gray-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
              <div className="flex gap-1 shrink-0">
                {[50, 75, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setGlobalMarginPercent(preset)}
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md border transition cursor-pointer ${
                      globalMarginPercent === preset
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                        : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Items Builder + Realtime Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Items Builder (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`text-sm font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>Servicios y Redes en la Cotización ({quoteItems.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => handleAddItem()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Servicio / Red</span>
            </button>
          </div>

          {/* List of Quote Items */}
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {calculatedItems.map((item, index) => {
                const availableForSocial = services.filter((s) => s.socialNetworkId === item.socialNetworkId);

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className={`p-4 rounded-2xl border transition ${
                      isDarkMode ? "bg-slate-900/80 border-slate-800" : "bg-white border-gray-200 shadow-2xs"
                    }`}
                  >
                    {/* Item Header & Delete */}
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-800"}`}>
                          {item.socialName} • {item.serviceName}
                        </span>
                      </div>

                      {quoteItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                          title="Eliminar este servicio de la cotización"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Inputs Matrix */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      {/* Social Network Selector */}
                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                          isDarkMode ? "text-slate-400" : "text-gray-500"
                        }`}>
                          Red Social
                        </label>
                        <select
                          value={item.socialNetworkId}
                          onChange={(e) => handleUpdateItem(item.id, { socialNetworkId: e.target.value })}
                          className={`w-full px-3 py-2 text-xs rounded-xl border font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition cursor-pointer ${
                            isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                          }`}
                        >
                          {socialNetworks.map((sn) => (
                            <option key={sn.id} value={sn.id}>
                              {sn.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Service Selector */}
                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                          isDarkMode ? "text-slate-400" : "text-gray-500"
                        }`}>
                          Tipo de Servicio
                        </label>
                        <select
                          value={item.serviceId}
                          onChange={(e) => handleUpdateItem(item.id, { serviceId: e.target.value })}
                          className={`w-full px-3 py-2 text-xs rounded-xl border font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition cursor-pointer ${
                            isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                          }`}
                        >
                          {availableForSocial.map((srv) => (
                            <option key={srv.id} value={srv.id}>
                              {srv.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Quantity or Distribution Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-slate-800/80">
                      {calcMode === "budget" ? (
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className={`text-[10px] font-bold uppercase tracking-wider ${
                              isDarkMode ? "text-slate-400" : "text-gray-500"
                            }`}>
                              {quoteItems.length > 1 ? "Repartición del Presupuesto" : "Presupuesto Asignado (100%)"}
                            </label>
                            <span className="text-xs font-mono font-bold text-indigo-400">
                              {quoteItems.length > 1 ? `${item.budgetPercentage || 50}% • ` : ""}{formatCOP(item.allocatedBudget)}
                            </span>
                          </div>
                          {quoteItems.length > 1 ? (
                            <div className="space-y-1">
                              <input
                                type="range"
                                min="5"
                                max="95"
                                step="5"
                                value={item.budgetPercentage || 50}
                                onChange={(e) => handleUpdateItem(item.id, { budgetPercentage: Number(e.target.value) })}
                                className="w-full accent-indigo-600 h-2 bg-gray-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                              />
                              <p className={`text-[10px] ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
                                Mueve la barra para darle más o menos parte de los {formatCOP(numericTotalBudget)} a este servicio.
                              </p>
                            </div>
                          ) : (
                            <div className={`py-1 px-2.5 rounded-lg text-[11px] font-medium ${
                              isDarkMode ? "bg-slate-800/80 text-slate-300" : "bg-gray-100 text-gray-600"
                            }`}>
                              Recibe el 100% del presupuesto ({formatCOP(numericTotalBudget)}). Si agregas otro servicio con el botón superior, podrás repartir la plata entre ambos (ej. 70% seguidores y 30% likes).
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                            isDarkMode ? "text-slate-400" : "text-gray-500"
                          }`}>
                            Cantidad a Vender
                          </label>
                          <input
                            type="number"
                            min="10"
                            step="50"
                            value={item.quantity || ""}
                            onChange={(e) => handleUpdateItem(item.id, { quantity: Math.max(0, parseInt(e.target.value) || 0) })}
                            onFocus={(e) => e.target.select()}
                            placeholder="1000"
                            className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition ${
                              isDarkMode ? "bg-slate-800 border-slate-700 text-indigo-300" : "bg-gray-50 border-gray-200 text-indigo-700"
                            }`}
                          />
                        </div>
                      )}

                      {/* Cost per 1,000 Override / Edit */}
                      <div>
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                          isDarkMode ? "text-slate-400" : "text-gray-500"
                        }`}>
                          Costo Proveedor x 1.000 (COP)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-xs text-gray-400">$</span>
                          <input
                            type="number"
                            min="100"
                            step="500"
                            value={item.providerCostPer1000COP || ""}
                            onChange={(e) => handleUpdateItem(item.id, { providerCostPer1000COP: Math.max(0, parseInt(e.target.value) || 0) })}
                            onFocus={(e) => e.target.select()}
                            placeholder="5000"
                            className={`w-full pl-6 pr-3 py-2 text-xs font-mono rounded-xl border focus:ring-2 focus:ring-indigo-500 focus:outline-hidden transition ${
                              isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-gray-50 border-gray-200 text-gray-800"
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Item Result Highlights */}
                    <div className="mt-3 p-2.5 rounded-xl bg-gray-50 dark:bg-slate-800/60 border border-gray-150 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500 dark:text-slate-400 text-[11px]">Entregar:</span>
                        <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold text-sm">
                          {item.effectiveQty.toLocaleString("es-CO")}
                        </strong>
                        <span className="text-gray-500 dark:text-slate-400 text-[11px]">unidades</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 block">Precio Cobro</span>
                          <span className="font-mono font-bold text-gray-900 dark:text-white">
                            {formatCOP(item.itemChargedPrice)}
                          </span>
                        </div>
                        <div className="text-right border-l pl-3 border-gray-200 dark:border-slate-700">
                          <span className="text-[10px] text-emerald-500 block font-semibold">Ganancia</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            +{formatCOP(item.itemProfit)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column: Cotización WhatsApp Preview & Total Breakdown (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Summary Card */}
          <div className={`p-5 rounded-2xl border transition shadow-sm ${
            isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
          }`}>
            <h2 className={`text-sm font-bold flex items-center justify-between mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span>Resumen Financiero</span>
              </span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">
                Margen {overallTotals.avgMarginPercent}%
              </span>
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-500 dark:text-slate-400">Total Unidades:</span>
                <span className="font-mono font-bold text-gray-900 dark:text-white">
                  {overallTotals.totalQty.toLocaleString("es-CO")} uds
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-500 dark:text-slate-400">Costo con Proveedores:</span>
                <span className="font-mono font-bold text-red-500 dark:text-red-400">
                  {formatCOP(overallTotals.totalCost)}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-gray-100 dark:border-slate-800">
                <span className="text-gray-500 dark:text-slate-400">Ganancia Neta Estimada:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  +{formatCOP(overallTotals.totalProfit)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="font-bold text-gray-800 dark:text-slate-200 text-sm">Total Venta al Cliente:</span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-lg">
                  {formatCOP(overallTotals.totalSale)}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 pt-3 border-t border-gray-150 dark:border-slate-800">
              <button
                id="btn-copy-quote-whatsapp"
                type="button"
                onClick={handleCopyWhatsApp}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer active:scale-95 touch-manipulation"
              >
                {copiedText ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-200" />
                    <span>¡Copiado al Portapapeles!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Cotización para WhatsApp</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Compact WhatsApp Message Preview Box */}
          <div className={`p-3 rounded-2xl border transition ${
            isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-emerald-50/40 border-emerald-200/60"
          }`}>
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[11px] font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Vista Previa del Mensaje</span>
              </span>
              <span className="text-[10px] text-gray-400 font-medium">Auto-formateado</span>
            </div>

            <pre className={`p-2.5 rounded-xl text-[10.5px] font-sans whitespace-pre-wrap leading-tight max-h-48 overflow-y-auto border select-all ${
              isDarkMode
                ? "bg-slate-950/70 border-slate-800 text-slate-300"
                : "bg-white border-emerald-200/60 text-gray-700 shadow-2xs"
            }`}>
              {generatedWhatsAppMessage}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
