/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Send,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  Gift,
  Percent,
  ShieldCheck,
  Layers,
  Package,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Client, Receipt, ReceiptItem, getClientCode, getNormalizedStatus } from "../types";
import { useApp } from "../context/AppContext";

interface RepurchaseModalProps {
  initialClient?: Client | { name: string; phone: string; id?: string } | null;
  onClose: () => void;
}

export const RepurchaseModal: React.FC<RepurchaseModalProps> = ({ initialClient, onClose }) => {
  const { clients, receipts, supplierWarranties, businessConfig, isDarkMode } = useApp();

  const businessName = businessConfig?.businessName || "ImpulsaNet";

  // Build client list with enriched purchase and warranty info
  const enrichedClients = useMemo(() => {
    return clients.map((c, index) => {
      const code = getClientCode(c, index);
      const cleanPhone = (c.phone || "").replace(/\D/g, "");
      const cleanName = (c.name || "").trim().toLowerCase();

      const clientReceipts = receipts.filter((r) => {
        const rPhone = (r.clientPhone || "").replace(/\D/g, "");
        const rName = (r.clientName || "").trim().toLowerCase();
        return (cleanPhone && rPhone && cleanPhone === rPhone) || (cleanName && rName && cleanName === rName);
      });

      const sortedReceipts = [...clientReceipts].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      const lastReceipt = sortedReceipts[0] || null;
      const lastReceiptServices: ReceiptItem[] = lastReceipt && lastReceipt.services && lastReceipt.services.length > 0
        ? lastReceipt.services
        : [];

      let lastItem: ReceiptItem | null = null;
      let lastServiceName = "Servicios de Crecimiento";
      let lastSocialName = "Redes Sociales";
      let lastQuantity = 1000;
      let lastCharged = 15000;
      let lastCost = 0;

      if (lastReceiptServices.length > 0) {
        lastItem = lastReceiptServices[0];
        lastServiceName = lastItem.serviceName || "Seguidores";
        lastSocialName = lastItem.socialNetworkName || "Redes";
        lastQuantity = lastItem.quantity || 1000;
        lastCharged = lastItem.chargedPrice || (lastReceipt?.totalCharged ? Math.round(lastReceipt.totalCharged / lastReceiptServices.length) : 15000);
        lastCost =
          lastItem.providerCostCOP ||
          lastItem.providerCostAtPurchase ||
          (lastReceipt?.totalProviderCost ? Math.round(lastReceipt.totalProviderCost / lastReceiptServices.length) : Math.round(lastCharged * 0.4));
      } else if (lastReceipt) {
        lastCharged = lastReceipt.totalCharged || 15000;
        lastCost = lastReceipt.totalProviderCost || Math.round(lastCharged * 0.4);
      }

      const totalSpent = clientReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0);

      // Days since last purchase calculation
      const lastDateStr = lastReceipt ? lastReceipt.date : c.lastPurchaseDate || "";
      let daysSinceLastPurchase = -1;
      if (lastDateStr) {
        try {
          const lastD = new Date(lastDateStr).getTime();
          const nowD = new Date().getTime();
          if (!isNaN(lastD)) {
            daysSinceLastPurchase = Math.max(0, Math.floor((nowD - lastD) / (1000 * 60 * 60 * 24)));
          }
        } catch {
          daysSinceLastPurchase = -1;
        }
      }

      // 10 days condition for promo eligibility
      const isEligibleByDays = daysSinceLastPurchase >= 10;

      // Check active warranty for this client
      const hasActiveWarranty =
        supplierWarranties.some((w) => {
          const wPhone = (w.clientPhone || "").replace(/\D/g, "");
          const wName = (w.clientName || "").trim().toLowerCase();
          const matches =
            (cleanPhone && wPhone && cleanPhone === wPhone) ||
            (cleanName && wName && cleanName === wName) ||
            (w.receiptId && clientReceipts.some((r) => r.id === w.receiptId));
          return matches && (w.status === "en_espera" || w.status === "reclamado_nuevamente");
        }) ||
        clientReceipts.some((r) => getNormalizedStatus(r.status) === "garantia_en_proceso");

      // Loyalty tier estimation
      const isHighVolume =
        c.tag === "VIP" ||
        c.tag === "Mayorista" ||
        c.tag === "Frecuente" ||
        clientReceipts.length >= 4 ||
        totalSpent >= 100000;

      const isMediumVolume = clientReceipts.length >= 2 || totalSpent >= 40000;

      const suggestedDiscountPct = isHighVolume ? 20 : isMediumVolume ? 15 : 10;

      return {
        ...c,
        computedCode: code,
        receiptsCount: clientReceipts.length,
        lastReceipt,
        lastReceiptServices,
        lastDate: lastDateStr,
        daysSinceLastPurchase,
        isEligibleByDays,
        lastItem,
        lastServiceName,
        lastSocialName,
        lastQuantity,
        lastCharged,
        lastCost,
        totalSpent,
        hasActiveWarranty,
        isHighVolume,
        isMediumVolume,
        suggestedDiscountPct
      };
    });
  }, [clients, receipts, supplierWarranties]);

  // Selected client ID state
  const [selectedClientId, setSelectedClientId] = useState<string>(() => {
    if (initialClient?.id) return initialClient.id;
    if (initialClient?.name) {
      const match = enrichedClients.find(
        (c) =>
          c.name.trim().toLowerCase() === initialClient.name.trim().toLowerCase() ||
          (initialClient.phone && c.phone === initialClient.phone)
      );
      if (match) return match.id;
    }
    return enrichedClients.length > 0 ? enrichedClients[0].id : "";
  });

  const selectedClient = useMemo(() => {
    return enrichedClients.find((c) => c.id === selectedClientId) || enrichedClients[0] || null;
  }, [enrichedClients, selectedClientId]);

  // Target selection state: "combo" (all items in last receipt) or item index (0, 1, 2...)
  const [selectedTarget, setSelectedTarget] = useState<"combo" | number>("combo");

  // Reset target and discount when client changes
  useEffect(() => {
    setSelectedTarget("combo");
    if (selectedClient) {
      setDiscountPct(selectedClient.suggestedDiscountPct);
      setIsCustomPrice(false);
      setCustomPromoPrice(0);
    }
  }, [selectedClientId, selectedClient]);

  // Active Template Type (default to dynamic promo)
  const [templateType, setTemplateType] = useState<
    "smart_promo" | "satisfaction" | "discount_general" | "growth" | "catalog" | "custom"
  >("smart_promo");

  // Discount configuration
  const [discountPct, setDiscountPct] = useState<number>(() => {
    return selectedClient?.suggestedDiscountPct || 15;
  });

  const [isCustomPrice, setIsCustomPrice] = useState<boolean>(false);
  const [customPromoPrice, setCustomPromoPrice] = useState<number>(0);

  // Active Target Information Calculation
  const targetInfo = useMemo(() => {
    if (!selectedClient) {
      return {
        isCombo: false,
        title: "Servicios de Crecimiento",
        itemsList: [],
        previousCharged: 15000,
        providerCost: 4500,
        serviceName: "Seguidores",
        socialName: "Instagram",
        quantity: 1000,
        summaryText: "1.000 Seguidores para Instagram",
        bulletList: "• 1.000 Seguidores (Instagram)"
      };
    }

    const services = selectedClient.lastReceiptServices || [];
    const isMultiple = services.length > 1;

    if (selectedTarget === "combo" && isMultiple) {
      // Combo of all services in the receipt
      const itemsList = services.map((s) => {
        const charged = s.chargedPrice && s.chargedPrice > 0
          ? s.chargedPrice
          : (selectedClient.lastReceipt?.totalCharged ? Math.round(selectedClient.lastReceipt.totalCharged / services.length) : 5000);
        const cost = s.providerCostCOP && s.providerCostCOP > 0
          ? s.providerCostCOP
          : s.providerCostAtPurchase && s.providerCostAtPurchase > 0
          ? s.providerCostAtPurchase
          : (selectedClient.lastReceipt?.totalProviderCost ? Math.round(selectedClient.lastReceipt.totalProviderCost / services.length) : Math.round(charged * 0.4));
        return {
          id: s.id,
          name: s.serviceName,
          social: s.socialNetworkName,
          quantity: s.quantity,
          charged,
          cost
        };
      });

      const totalPrevCharged = selectedClient.lastReceipt?.totalCharged || itemsList.reduce((acc, it) => acc + it.charged, 0) || 15000;
      const totalCost = selectedClient.lastReceipt?.totalProviderCost || itemsList.reduce((acc, it) => acc + it.cost, 0) || Math.round(totalPrevCharged * 0.4);
      const bulletList = itemsList.map((it) => `• ${it.quantity.toLocaleString("es-CO")} ${it.name} (${it.social})`).join("\n");
      const summaryText = itemsList.map((it) => `${it.quantity.toLocaleString("es-CO")} ${it.name}`).join(" + ");

      return {
        isCombo: true,
        title: `Combo (${services.length} Servicios)`,
        itemsList,
        previousCharged: totalPrevCharged,
        providerCost: totalCost,
        serviceName: "Combo de Crecimiento",
        socialName: "Redes Sociales",
        quantity: 0,
        summaryText,
        bulletList
      };
    }

    // Individual item target
    const targetIdx = typeof selectedTarget === "number" ? selectedTarget : 0;
    const item = services[targetIdx] || services[0] || null;

    if (item) {
      const charged = item.chargedPrice && item.chargedPrice > 0
        ? item.chargedPrice
        : (services.length === 1 && selectedClient.lastReceipt?.totalCharged
            ? selectedClient.lastReceipt.totalCharged
            : (selectedClient.lastReceipt?.totalCharged ? Math.round(selectedClient.lastReceipt.totalCharged / (services.length || 1)) : 10000));

      const cost = item.providerCostCOP && item.providerCostCOP > 0
        ? item.providerCostCOP
        : item.providerCostAtPurchase && item.providerCostAtPurchase > 0
        ? item.providerCostAtPurchase
        : (services.length === 1 && selectedClient.lastReceipt?.totalProviderCost
            ? selectedClient.lastReceipt.totalProviderCost
            : Math.round(charged * 0.4));

      return {
        isCombo: false,
        title: `${item.quantity.toLocaleString("es-CO")} ${item.serviceName}`,
        itemsList: [{
          id: item.id,
          name: item.serviceName,
          social: item.socialNetworkName,
          quantity: item.quantity,
          charged,
          cost
        }],
        previousCharged: charged,
        providerCost: cost,
        serviceName: item.serviceName,
        socialName: item.socialNetworkName,
        quantity: item.quantity,
        summaryText: `${item.quantity.toLocaleString("es-CO")} ${item.serviceName} para ${item.socialNetworkName}`,
        bulletList: `• ${item.quantity.toLocaleString("es-CO")} ${item.serviceName} (${item.socialNetworkName})`
      };
    }

    // Fallback if no receipt or items
    const prevCharged = selectedClient.lastCharged || 15000;
    const cost = selectedClient.lastCost || Math.round(prevCharged * 0.4);
    return {
      isCombo: false,
      title: "Servicios de Crecimiento",
      itemsList: [],
      previousCharged: prevCharged,
      providerCost: cost,
      serviceName: "Seguidores",
      socialName: "Instagram",
      quantity: 1000,
      summaryText: "1.000 Seguidores para Instagram",
      bulletList: "• 1.000 Seguidores (Instagram)"
    };
  }, [selectedClient, selectedTarget]);

  // Dynamic calculations & 30% margin protection
  const {
    previousCharged,
    providerCost,
    minSafePrice30Margin,
    calculatedPromoPrice,
    actualDiscountPct,
    clientSavings,
    actualProfit,
    actualMarginPct,
    isMarginSafe
  } = useMemo(() => {
    const prevCharged = targetInfo.previousCharged > 0 ? targetInfo.previousCharged : 15000;
    const cost = targetInfo.providerCost > 0 ? targetInfo.providerCost : Math.round(prevCharged * 0.4);

    // Minimum price to guarantee at least 30% profit margin over sale price:
    // (Price - Cost) / Price >= 0.30  =>  Price >= Cost / 0.70
    const minSafePrice = Math.max(1000, Math.ceil(cost / 0.7 / 100) * 100);

    let promoPrice = 0;
    if (isCustomPrice && customPromoPrice > 0) {
      promoPrice = customPromoPrice;
    } else {
      const rawPrice = Math.round((prevCharged * (1 - discountPct / 100)) / 100) * 100;
      // Cap price so it never dips below minSafePrice if margin rule is active
      promoPrice = Math.max(rawPrice, minSafePrice);
    }

    const savings = Math.max(0, prevCharged - promoPrice);
    const realDiscount = prevCharged > 0 ? Math.round(((prevCharged - promoPrice) / prevCharged) * 100) : 0;
    const profit = Math.max(0, promoPrice - cost);
    const margin = promoPrice > 0 ? ((promoPrice - cost) / promoPrice) * 100 : 0;
    const safe = margin >= 30;

    return {
      previousCharged: prevCharged,
      providerCost: cost,
      minSafePrice30Margin: minSafePrice,
      calculatedPromoPrice: promoPrice,
      actualDiscountPct: realDiscount,
      clientSavings: savings,
      actualProfit: profit,
      actualMarginPct: Math.round(margin * 10) / 10,
      isMarginSafe: safe
    };
  }, [targetInfo, discountPct, isCustomPrice, customPromoPrice]);

  // Format helpers
  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  // Custom text override
  const [customMessage, setCustomMessage] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Generate message based on template
  const generatedMessage = useMemo(() => {
    if (!selectedClient) return "";

    const firstName = selectedClient.name.trim().split(" ")[0] || "Cliente";

    switch (templateType) {
      case "smart_promo":
        if (targetInfo.isCombo) {
          return `¡Hola ${firstName}! 👋 Te saludamos de ${businessName}.

Como ya confiaste en nosotros para tu combo de:
${targetInfo.bulletList}
(Total anterior: ${formatCOP(previousCharged)} COP), hoy tenemos una promoción especial y exclusiva para ti 🔥:

✨ Llévate de nuevo todo tu paquete completo por solo ${formatCOP(calculatedPromoPrice)} COP (¡Ahorras ${formatCOP(clientSavings)}!).

¿Te gustaría aprovechar este beneficio hoy mismo y recargar tus cuentas? Estamos listos para procesarlo de inmediato 📲🚀`;
        } else {
          const qtyStr = (targetInfo.quantity || 1000).toLocaleString("es-CO");
          return `¡Hola ${firstName}! 👋 Te saludamos de ${businessName}.

Como ya confiaste en nosotros para ${targetInfo.summaryText} (${formatCOP(previousCharged)} COP), hoy tenemos una promoción especial y exclusiva para ti 🔥:

✨ Llévate de nuevo ${qtyStr} ${targetInfo.serviceName} por solo ${formatCOP(calculatedPromoPrice)} COP (¡Ahorras ${formatCOP(clientSavings)}!).

¿Te gustaría aprovechar este beneficio hoy mismo y recargar tu cuenta? Estamos listos para procesarlo de inmediato 📲🚀`;
        }

      case "satisfaction":
        if (targetInfo.isCombo) {
          return `¡Hola ${firstName}! 👋 Te saludamos de ${businessName}.

Esperamos que estés teniendo un excelente día y que los resultados con tu paquete de ${targetInfo.summaryText} hayan sido geniales 🚀.

Pasábamos a saludarte y consultarte si te gustaría recargar o impulsar otra de tus cuentas o publicaciones esta semana. ¡Tenemos disponibilidad inmediata y atención prioritaria para ti! ✨`;
        } else {
          return `¡Hola ${firstName}! 👋 Te saludamos de ${businessName}.

Esperamos que estés teniendo un excelente día y que los resultados con tus ${targetInfo.serviceName} hayan sido geniales 🚀.

Pasábamos a saludarte y consultarte si te gustaría recargar o impulsar otra de tus cuentas o publicaciones esta semana. ¡Tenemos disponibilidad inmediata y atención prioritaria para ti! ✨`;
        }

      case "discount_general":
        return `¡Hola ${firstName}! 🎉 Te saludamos de ${businessName}.

Como agradecimiento por tu preferencia y compras anteriores, hoy tienes activo un cupón del ${actualDiscountPct}% de descuento para tu próxima orden en cualquiera de nuestros servicios de catálogo 🔥.

¿Te gustaría que te compartamos las opciones disponibles para hoy? 📲`;

      case "growth":
        return `¡Hola ${firstName}! 📈 Un saludo de parte de ${businessName}.

Recuerda que para mantener el algoritmo activo y constante en tus redes, la continuidad en las interacciones y el alcance es clave ⚡.

¿Revisamos qué estadísticas o métricas te gustaría reforzar esta semana en tus perfiles? Estamos listos para ayudarte.`;

      case "catalog":
        return `¡Hola ${firstName}! 🌟 Esperamos que te encuentres muy bien.

En ${businessName} acabamos de actualizar nuestros servidores con servicios de mayor velocidad, máxima estabilidad y mejor retención para tus redes sociales 🚀.

¿Deseas que te enviemos nuestro catálogo actualizado con las tarifas preferenciales para clientes?`;

      case "custom":
        return customMessage || `¡Hola ${firstName}! Te saludamos de ${businessName}...`;

      default:
        return "";
    }
  }, [
    selectedClient,
    templateType,
    customMessage,
    businessName,
    previousCharged,
    calculatedPromoPrice,
    clientSavings,
    actualDiscountPct,
    targetInfo
  ]);

  // Active editable message
  const [editableMessage, setEditableMessage] = useState<string>(generatedMessage);

  // Update editable text whenever template, client or calculated price changes
  useEffect(() => {
    setEditableMessage(generatedMessage);
  }, [generatedMessage]);

  // WhatsApp link generator
  const whatsappUrl = useMemo(() => {
    if (!selectedClient || !selectedClient.phone) return "";
    let cleanPhone = selectedClient.phone.replace(/\D/g, "");
    if (cleanPhone.length === 10 && !cleanPhone.startsWith("57")) {
      cleanPhone = "57" + cleanPhone;
    }
    const encodedText = encodeURIComponent(editableMessage);
    return `https://wa.me/${cleanPhone}?text=${encodedText}`;
  }, [selectedClient, editableMessage]);

  const handleCopy = () => {
    navigator.clipboard.writeText(editableMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const formatDate = (str?: string) => {
    if (!str) return "Sin compras registradas";
    try {
      const d = new Date(str);
      return isNaN(d.getTime())
        ? str
        : d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return str;
    }
  };

  const hasMultipleServices = selectedClient && selectedClient.lastReceiptServices && selectedClient.lastReceiptServices.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs overflow-y-auto animate-fade-in">
      <div
        className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden transition-all my-6 ${
          isDarkMode
            ? "bg-slate-900 border-slate-800 text-slate-100"
            : "bg-white border-gray-200 text-gray-900"
        }`}
      >
        {/* Modal Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between ${
            isDarkMode ? "bg-slate-850 border-slate-800" : "bg-emerald-50/60 border-emerald-100"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Propuesta de Recompra & Promoción
              </h3>
              <p className={`text-xs ${isDarkMode ? "text-slate-400" : "text-emerald-800/80"}`}>
                Ofertas dinámicas para combo o servicio individual con costos reales y margen ≥ 30%
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition cursor-pointer ${
              isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                : "hover:bg-gray-100 text-gray-400 hover:text-gray-700"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 max-h-[calc(85vh-110px)] overflow-y-auto">
          {/* Client Selection Row */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${
                isDarkMode ? "text-slate-300" : "text-gray-700"
              }`}>
                Cliente Seleccionado
              </label>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="opacity-70">Filtro de clientes:</span>
                <span className={`font-extrabold px-1.5 py-0.5 rounded ${
                  isDarkMode ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-emerald-100 text-emerald-800 border border-emerald-300"
                }`}>
                  ⏱️ {enrichedClients.filter((c) => c.isEligibleByDays).length} con ≥10 días
                </span>
              </div>
            </div>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold transition focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-white"
                  : "bg-white border-gray-200 text-gray-900"
              }`}
            >
              {enrichedClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isEligibleByDays ? "🟢 [≥10d]" : "⏳ [<10d]"} #{c.computedCode} - {c.name} ({c.phone}) • {c.daysSinceLastPurchase >= 0 ? `Hace ${c.daysSinceLastPurchase} días` : "Sin compras"} {c.tag ? `[${c.tag}]` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Client Info Summary Card & Active Warranty / Days Warning */}
          {selectedClient && (
            <div className="space-y-2">
              {/* 10 Days Eligibility Alert / Status */}
              {!selectedClient.isEligibleByDays && selectedClient.daysSinceLastPurchase >= 0 && (
                <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs transition ${
                  isDarkMode
                    ? "bg-amber-950/60 border-amber-800/80 text-amber-200"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}>
                  <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-[11px]">
                    <div className="font-extrabold flex items-center gap-1.5 text-amber-400">
                      <span>⏳ Compra Reciente (Hace {selectedClient.daysSinceLastPurchase} {selectedClient.daysSinceLastPurchase === 1 ? "día" : "días"})</span>
                    </div>
                    <p className={`leading-tight ${isDarkMode ? "text-amber-300/90" : "text-amber-800"}`}>
                      La recomendación es enviar promociones de recompra después de <strong>10 días</strong> para no saturar al cliente. Puedes enviarla si lo deseas o esperar {10 - selectedClient.daysSinceLastPurchase} {10 - selectedClient.daysSinceLastPurchase === 1 ? "día" : "días más"}.
                    </p>
                  </div>
                </div>
              )}

              {selectedClient.isEligibleByDays && (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                  isDarkMode
                    ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                    : "bg-emerald-50/70 border-emerald-200 text-emerald-800"
                }`}>
                  <div className="flex items-center gap-2 text-[11px] font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Tiempo Óptimo de Recompra (Compró hace {selectedClient.daysSinceLastPurchase} días)</span>
                  </div>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-500 text-white shadow-2xs">
                    Apto para promo
                  </span>
                </div>
              )}

              {selectedClient.hasActiveWarranty && (
                <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs transition ${
                  isDarkMode
                    ? "bg-rose-950/70 border-rose-800 text-rose-200"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}>
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-[11px]">
                    <div className="font-extrabold flex items-center gap-1.5 text-rose-400">
                      <span>⚠️ Cliente con Reclamo de Garantía en Curso</span>
                    </div>
                    <p className={`leading-tight ${isDarkMode ? "text-rose-300" : "text-rose-700"}`}>
                      Este cliente tiene una garantía pendiente en el cronómetro de 48h. Considera esperar a que se resuelva antes de enviarle ofertas de recompra.
                    </p>
                  </div>
                </div>
              )}

              <div
                className={`p-3.5 rounded-xl border grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs ${
                  isDarkMode
                    ? "bg-slate-800/50 border-slate-700/80"
                    : "bg-gray-50 border-gray-200/80"
                }`}
              >
                <div>
                  <span className={`text-[10px] block uppercase font-bold ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                    Historial / Volumen
                  </span>
                  <div className="font-bold mt-0.5 flex items-center gap-1 flex-wrap">
                    <span className={isDarkMode ? "text-white" : "text-gray-900"}>
                      {selectedClient.receiptsCount} {selectedClient.receiptsCount === 1 ? "pedido" : "pedidos"}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-extrabold border ${
                      selectedClient.isHighVolume
                        ? isDarkMode ? "bg-purple-950 text-purple-300 border-purple-800" : "bg-purple-100 text-purple-800 border-purple-200"
                        : isDarkMode ? "bg-blue-950 text-blue-300 border-blue-800" : "bg-blue-100 text-blue-800 border-blue-200"
                    }`}>
                      {selectedClient.isHighVolume ? "Frecuente / Alto" : "Ocasional"}
                    </span>
                  </div>
                </div>

                <div>
                  <span className={`text-[10px] block uppercase font-bold ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                    Última Compra
                  </span>
                  <div className="font-mono text-[11px] font-semibold text-emerald-400 mt-0.5">
                    {formatDate(selectedClient.lastDate)}
                  </div>
                  {selectedClient.daysSinceLastPurchase >= 0 && (
                    <span className={`text-[9px] font-bold block ${selectedClient.isEligibleByDays ? "text-emerald-400" : "text-amber-400"}`}>
                      Hace {selectedClient.daysSinceLastPurchase} {selectedClient.daysSinceLastPurchase === 1 ? "día" : "días"}
                    </span>
                  )}
                </div>

                <div className="col-span-2 sm:col-span-2">
                  <span className={`text-[10px] block uppercase font-bold ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                    Último Pedido Registrado
                  </span>
                  <div className={`font-bold mt-0.5 truncate flex items-center justify-between gap-1 ${
                    isDarkMode ? "text-indigo-300" : "text-indigo-700"
                  }`}>
                    <span className="truncate">
                      {selectedClient.lastReceiptServices.length > 1
                        ? `Paquete Combo (${selectedClient.lastReceiptServices.length} servicios)`
                        : `${selectedClient.lastQuantity.toLocaleString("es-CO")} ${selectedClient.lastServiceName} (${selectedClient.lastSocialName})`}
                    </span>
                    <span className="font-mono font-black text-xs shrink-0">
                      {formatCOP(selectedClient.lastReceipt?.totalCharged || selectedClient.lastCharged)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* OPTION 1: SMART COMBO VS. SINGLE SERVICE SELECTOR */}
          {hasMultipleServices && (
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 transition ${
                isDarkMode
                  ? "bg-slate-850 border-indigo-900/50"
                  : "bg-indigo-50/70 border-indigo-200/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDarkMode ? "text-indigo-300" : "text-indigo-900"
                }`}>
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  <span>¿Qué deseas promocionar de la última compra? ({selectedClient.lastReceiptServices.length} servicios)</span>
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  selectedTarget === "combo"
                    ? isDarkMode ? "bg-indigo-900 text-indigo-200" : "bg-indigo-100 text-indigo-800"
                    : isDarkMode ? "bg-emerald-900 text-emerald-200" : "bg-emerald-100 text-emerald-800"
                }`}>
                  {selectedTarget === "combo" ? "📦 Combo Completo" : "⚡ Servicio Individual"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {/* Option: Combo completo */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTarget("combo");
                    setIsCustomPrice(false);
                  }}
                  className={`p-2.5 rounded-xl border text-left font-semibold transition cursor-pointer flex flex-col justify-between ${
                    selectedTarget === "combo"
                      ? isDarkMode
                        ? "bg-indigo-950/80 border-indigo-400 text-white shadow-xs ring-2 ring-indigo-500/30"
                        : "bg-white border-indigo-600 text-gray-900 shadow-sm ring-2 ring-indigo-500/30"
                      : isDarkMode
                      ? "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-750"
                      : "bg-white/80 border-gray-200 text-gray-700 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-black text-xs flex items-center gap-1 text-indigo-400">
                      <Package className="w-3.5 h-3.5 shrink-0" />
                      <span>Combo Completo</span>
                    </span>
                    {selectedTarget === "combo" && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    )}
                  </div>
                  <div className={`text-[10px] mt-1 line-clamp-1 font-normal ${isDarkMode ? "text-slate-300" : "text-gray-600"}`}>
                    {selectedClient.lastReceiptServices.map((s) => `${s.quantity >= 1000 ? s.quantity / 1000 + 'k' : s.quantity} ${s.serviceName}`).join(" + ")}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-indigo-200/40 dark:border-indigo-900/50 flex items-center justify-between text-[11px] font-mono">
                    <span className="opacity-70 text-[10px]">Total Original:</span>
                    <span className="font-bold">{formatCOP(selectedClient.lastReceipt?.totalCharged || 0)}</span>
                  </div>
                </button>

                {/* Options: Individual items */}
                {selectedClient.lastReceiptServices.map((item, idx) => {
                  const isSelected = selectedTarget === idx;
                  const itemCharged = item.chargedPrice && item.chargedPrice > 0
                    ? item.chargedPrice
                    : Math.round((selectedClient.lastReceipt?.totalCharged || 10000) / selectedClient.lastReceiptServices.length);
                  const itemCost = item.providerCostCOP && item.providerCostCOP > 0
                    ? item.providerCostCOP
                    : item.providerCostAtPurchase && item.providerCostAtPurchase > 0
                    ? item.providerCostAtPurchase
                    : Math.round(itemCharged * 0.4);

                  return (
                    <button
                      key={item.id || idx}
                      type="button"
                      onClick={() => {
                        setSelectedTarget(idx);
                        setIsCustomPrice(false);
                      }}
                      className={`p-2.5 rounded-xl border text-left font-semibold transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? isDarkMode
                            ? "bg-indigo-950/80 border-indigo-400 text-white shadow-xs ring-2 ring-indigo-500/30"
                            : "bg-white border-indigo-600 text-gray-900 shadow-sm ring-2 ring-indigo-500/30"
                          : isDarkMode
                          ? "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-750"
                          : "bg-white/80 border-gray-200 text-gray-700 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs truncate">
                          {item.quantity.toLocaleString("es-CO")} {item.serviceName}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        )}
                      </div>
                      <div className={`text-[10px] mt-1 font-medium ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                        {item.socialNetworkName} • Costo real: {formatCOP(itemCost)}
                      </div>
                      <div className="mt-2 pt-1.5 border-t border-indigo-200/40 dark:border-indigo-900/50 flex items-center justify-between text-[11px] font-mono">
                        <span className="opacity-70 text-[10px]">Precio Original:</span>
                        <span className="font-bold">{formatCOP(itemCharged)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DYNAMIC PROMO CALCULATOR & MARGIN PROTECTION (FEATURED) */}
          <div
            className={`p-4 rounded-xl border transition ${
              isDarkMode
                ? "bg-emerald-950/20 border-emerald-800/70"
                : "bg-emerald-50/60 border-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-500 text-white shadow-2xs">
                  <Percent className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className={`text-xs font-extrabold uppercase tracking-wider ${
                    isDarkMode ? "text-emerald-300" : "text-emerald-900"
                  }`}>
                    Calculadora de Oferta de Recompra
                  </h4>
                  <span className={`text-[10px] font-semibold block ${isDarkMode ? "text-slate-400" : "text-gray-600"}`}>
                    Promocionando: <strong className="text-emerald-400">{targetInfo.title}</strong>
                  </span>
                </div>
              </div>

              {/* Safety Margin Badge */}
              <div
                className={`flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                  isMarginSafe
                    ? isDarkMode
                      ? "bg-emerald-900/60 text-emerald-300 border-emerald-700"
                      : "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : isDarkMode
                    ? "bg-amber-950 text-amber-300 border-amber-800"
                    : "bg-amber-100 text-amber-800 border-amber-300"
                }`}
              >
                {isMarginSafe ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span>Margen Seguro: {actualMarginPct}% (≥ 30%)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span>Margen Bajo: {actualMarginPct}%</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Discount Percentage Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className={`text-[11px] font-bold ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                  Seleccionar Descuento Promocional:
                </span>
                {selectedClient?.isHighVolume && (
                  <span className="text-[10px] font-semibold text-emerald-400">
                    💡 Sugerido para este cliente: {selectedClient.suggestedDiscountPct}% OFF
                  </span>
                )}
              </div>

              <div className="grid grid-cols-5 gap-1.5 text-xs">
                {[10, 15, 20, 25].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setIsCustomPrice(false);
                      setDiscountPct(pct);
                      if (templateType !== "smart_promo" && templateType !== "discount_general") {
                        setTemplateType("smart_promo");
                      }
                    }}
                    className={`py-1.5 rounded-lg border font-bold transition cursor-pointer text-center ${
                      !isCustomPrice && discountPct === pct
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                        : isDarkMode
                        ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {pct}% OFF
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setIsCustomPrice(true);
                    setCustomPromoPrice(calculatedPromoPrice);
                  }}
                  className={`py-1.5 rounded-lg border font-bold transition cursor-pointer text-center ${
                    isCustomPrice
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : isDarkMode
                      ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Precio Libre
                </button>
              </div>

              {isCustomPrice && (
                <div className="pt-2 flex items-center gap-2">
                  <span className={`text-xs font-semibold ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                    Precio Promocional Manual (COP):
                  </span>
                  <input
                    type="number"
                    value={customPromoPrice || ""}
                    onChange={(e) => setCustomPromoPrice(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    placeholder="Ej. 12000"
                    className={`w-36 px-2.5 py-1 text-xs font-mono font-bold rounded-lg border ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white"
                        : "bg-white border-gray-200 text-gray-900"
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Financial breakdown pills */}
            <div className={`mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs ${
              isDarkMode ? "border-emerald-900/50" : "border-emerald-200/80"
            }`}>
              <div className={`p-2 rounded-lg ${isDarkMode ? "bg-slate-850/80" : "bg-white"}`}>
                <span className={`text-[10px] uppercase font-bold block ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                  Precio Anterior
                </span>
                <span className="font-mono font-bold line-through text-red-400">
                  {formatCOP(previousCharged)}
                </span>
              </div>

              <div className={`p-2 rounded-lg border-2 ${
                isDarkMode ? "bg-emerald-950/60 border-emerald-500/60 text-emerald-300" : "bg-emerald-50 border-emerald-400 text-emerald-900"
              }`}>
                <span className="text-[10px] uppercase font-extrabold block text-emerald-500">
                  Precio Promo ({actualDiscountPct}% OFF)
                </span>
                <span className="font-mono text-sm font-black">
                  {formatCOP(calculatedPromoPrice)}
                </span>
              </div>

              <div className={`p-2 rounded-lg ${isDarkMode ? "bg-slate-850/80" : "bg-white"}`}>
                <span className={`text-[10px] uppercase font-bold block ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                  Costo Proveedor Real
                </span>
                <span className="font-mono font-semibold text-gray-400">
                  {formatCOP(providerCost)}
                </span>
              </div>

              <div className={`p-2 rounded-lg ${isDarkMode ? "bg-slate-850/80" : "bg-white"}`}>
                <span className={`text-[10px] uppercase font-bold block ${isDarkMode ? "text-indigo-400" : "text-indigo-600"}`}>
                  Tu Ganancia Neta
                </span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatCOP(actualProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Template Selector Pills */}
          <div className="space-y-1.5">
            <label className={`block text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isDarkMode ? "text-slate-300" : "text-gray-700"
            }`}>
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Estilo / Plantilla de Mensaje
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setTemplateType("smart_promo")}
                className={`p-2 rounded-xl border text-left font-semibold transition cursor-pointer ${
                  templateType === "smart_promo"
                    ? isDarkMode
                      ? "bg-emerald-950/70 border-emerald-500 text-emerald-200 shadow-sm"
                      : "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs"
                    : isDarkMode
                    ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="font-bold flex items-center gap-1">
                  <span>🔥</span>
                  <span>Promo {targetInfo.isCombo ? "Combo" : "Servicio"}</span>
                </div>
                <div className={`text-[10px] mt-0.5 font-normal ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                  Oferta directa con descuento
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTemplateType("satisfaction")}
                className={`p-2 rounded-xl border text-left font-semibold transition cursor-pointer ${
                  templateType === "satisfaction"
                    ? isDarkMode
                      ? "bg-emerald-950/70 border-emerald-500 text-emerald-200 shadow-sm"
                      : "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs"
                    : isDarkMode
                    ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="font-bold flex items-center gap-1">
                  <span>🚀</span>
                  <span>Seguimiento</span>
                </div>
                <div className={`text-[10px] mt-0.5 font-normal ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                  Satisfacción + nueva recarga
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTemplateType("growth")}
                className={`p-2 rounded-xl border text-left font-semibold transition cursor-pointer ${
                  templateType === "growth"
                    ? isDarkMode
                      ? "bg-emerald-950/70 border-emerald-500 text-emerald-200 shadow-sm"
                      : "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs"
                    : isDarkMode
                    ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="font-bold flex items-center gap-1">
                  <span>📈</span>
                  <span>Constancia</span>
                </div>
                <div className={`text-[10px] mt-0.5 font-normal ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                  Impulso del algoritmo
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTemplateType("catalog")}
                className={`p-2 rounded-xl border text-left font-semibold transition cursor-pointer ${
                  templateType === "catalog"
                    ? isDarkMode
                      ? "bg-emerald-950/70 border-emerald-500 text-emerald-200 shadow-sm"
                      : "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-xs"
                    : isDarkMode
                    ? "bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <div className="font-bold flex items-center gap-1">
                  <span>🌟</span>
                  <span>Catálogo Nuevo</span>
                </div>
                <div className={`text-[10px] mt-0.5 font-normal ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                  Novedades y servidores
                </div>
              </button>
            </div>
          </div>

          {/* Editable Text Area */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label className={`block text-[11px] font-bold uppercase tracking-wider ${
                isDarkMode ? "text-slate-300" : "text-gray-700"
              }`}>
                Mensaje para WhatsApp (Personalizable)
              </label>
              <span className={`text-[10px] ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                Puedes editar el texto libremente antes de enviar
              </span>
            </div>
            <textarea
              rows={6}
              value={editableMessage}
              onChange={(e) => {
                setEditableMessage(e.target.value);
                if (templateType !== "custom") setTemplateType("custom");
                setCustomMessage(e.target.value);
              }}
              className={`w-full p-3 rounded-xl border text-xs font-sans leading-relaxed transition focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500"
                  : "bg-white border-gray-200 text-gray-900"
              }`}
            />
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div
          className={`px-5 py-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-2.5 ${
            isDarkMode ? "bg-slate-850 border-slate-800" : "bg-gray-50 border-gray-200"
          }`}
        >
          <button
            type="button"
            onClick={handleCopy}
            className={`w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-bold transition cursor-pointer shadow-2xs ${
              copied
                ? "bg-emerald-500 text-white border-emerald-600"
                : isDarkMode
                ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>¡Mensaje Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Mensaje</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                isDarkMode
                  ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                  : "border-gray-200 text-gray-700 hover:bg-gray-100"
              }`}
            >
              Cerrar
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-extrabold px-5 py-2 rounded-xl transition shadow-md shadow-emerald-900/20 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>Abrir en WhatsApp</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

