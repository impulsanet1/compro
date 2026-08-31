/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  Search,
  User,
  Phone,
  FileText,
  Calendar,
  Inbox,
  MessageSquare,
  Copy,
  Check,
  Gift,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock
} from "lucide-react";
import { Receipt, getClientCode, getNormalizedStatus } from "../types";
import { RepurchaseModal } from "./RepurchaseModal";

interface ClientsViewProps {
  onSelectReceipt: (receipt: Receipt) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ onSelectReceipt }) => {
  const { clients, receipts, supplierWarranties, updateClientTag, isDarkMode } = useApp();
  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  const [searchText, setSearchText] = useState("");
  const [warrantyFilter, setWarrantyFilter] = useState<"all" | "eligible_10d" | "recent" | "active_warranty" | "with_history">("all");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showRepurchaseModal, setShowRepurchaseModal] = useState(false);

  // Search and enrich clients logic with complete warranty tracking
  const enrichedClients = useMemo(() => {
    return clients.map((c, index) => {
      const code = getClientCode(c, index);
      const cleanPhone = c.phone.replace(/\D/g, "");
      const cleanName = c.name.trim().toLowerCase();

      const actualReceipts = receipts.filter((r) => {
        const rPhone = (r.clientPhone || "").replace(/\D/g, "");
        const rName = (r.clientName || "").trim().toLowerCase();
        return (rPhone && rPhone === cleanPhone) || (rName && rName === cleanName);
      });
      
      const sortedReceipts = [...actualReceipts].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const lastDate = sortedReceipts.length > 0 ? sortedReceipts[0].date : c.lastPurchaseDate;

      // Calculate days since last purchase
      let daysSinceLastPurchase = -1;
      if (lastDate) {
        try {
          const lastD = new Date(lastDate).getTime();
          const nowD = new Date().getTime();
          if (!isNaN(lastD)) {
            daysSinceLastPurchase = Math.max(0, Math.floor((nowD - lastD) / (1000 * 60 * 60 * 24)));
          }
        } catch {
          daysSinceLastPurchase = -1;
        }
      }

      const isEligibleByDays = daysSinceLastPurchase >= 10;
      const isRecentPurchase = daysSinceLastPurchase >= 0 && daysSinceLastPurchase < 10;

      const sortedAscReceipts = [...actualReceipts].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const firstDate = sortedAscReceipts.length > 0 ? sortedAscReceipts[0].date : (c.lastPurchaseDate || "");

      const totalSpent = actualReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
      const profitGenerated = actualReceipts.reduce((sum, r) => sum + (r.totalProfit || 0), 0);
      const averagePurchase = actualReceipts.length > 0 ? totalSpent / actualReceipts.length : 0;
      const numServicesAcquired = actualReceipts.reduce((sum, r) => sum + (r.services?.length || 0), 0);

      // Match warranties for this client
      const matchedWarranties = supplierWarranties.filter((w) => {
        const wPhone = (w.clientPhone || "").replace(/\D/g, "");
        const wName = (w.clientName || "").trim().toLowerCase();
        const matchesPhone = cleanPhone && wPhone && cleanPhone === wPhone;
        const matchesName = cleanName && wName && cleanName === wName;
        const matchesReceipt = w.receiptId ? actualReceipts.some((r) => r.id === w.receiptId) : false;
        const matchesConsecutive = w.receiptConsecutive ? actualReceipts.some((r) => r.consecutive === w.receiptConsecutive) : false;

        return matchesPhone || matchesName || matchesReceipt || matchesConsecutive;
      });

      // Check active warranties (either in supplierWarranties active or receipts marked as garantia_en_proceso)
      const activeWarranties = matchedWarranties.filter(
        (w) => w.status === "en_espera" || w.status === "reclamado_nuevamente"
      );
      const receiptsInProcess = actualReceipts.filter(
        (r) => getNormalizedStatus(r.status) === "garantia_en_proceso"
      );

      const hasActiveWarranty = activeWarranties.length > 0 || receiptsInProcess.length > 0;
      const resolvedWarranties = matchedWarranties.filter((w) => w.status === "resuelto");
      const totalWarrantiesCount = matchedWarranties.length + (receiptsInProcess.length > 0 && activeWarranties.length === 0 ? receiptsInProcess.length : 0);
      const isPromoEligible = !hasActiveWarranty && isEligibleByDays;

      return {
        ...c,
        computedCode: code,
        actualPurchaseCount: actualReceipts.length,
        actualTotalSpent: totalSpent,
        actualLastPurchaseDate: lastDate,
        daysSinceLastPurchase,
        isEligibleByDays,
        isRecentPurchase,
        actualFirstPurchaseDate: firstDate,
        actualProfitGenerated: profitGenerated,
        actualAveragePurchase: averagePurchase,
        actualNumServicesAcquired: numServicesAcquired,
        actualReceipts,
        matchedWarranties,
        activeWarranties,
        resolvedWarranties,
        receiptsInProcess,
        hasActiveWarranty,
        totalWarrantiesCount,
        isPromoEligible
      };
    });
  }, [clients, receipts, supplierWarranties]);

  // Filter clients by search query and warranty/promo eligibility filter
  const filteredClients = useMemo(() => {
    const filtered = enrichedClients.filter((c) => {
      if (c.actualPurchaseCount <= 0) return false;

      // Filter by warranty/promo eligibility tab
      if (warrantyFilter === "eligible_10d" && !c.isPromoEligible) return false;
      if (warrantyFilter === "recent" && !c.isRecentPurchase) return false;
      if (warrantyFilter === "active_warranty" && !c.hasActiveWarranty) return false;
      if (warrantyFilter === "with_history" && c.totalWarrantiesCount === 0) return false;

      const search = searchText.toLowerCase().trim();
      return (
        search === "" ||
        c.computedCode.toLowerCase().includes(search) ||
        (c.clientCode && c.clientCode.toLowerCase().includes(search)) ||
        c.name.toLowerCase().includes(search) ||
        c.phone.includes(search)
      );
    });

    return filtered.sort((a, b) => {
      const dateA = a.actualLastPurchaseDate ? new Date(a.actualLastPurchaseDate).getTime() : 0;
      const dateB = b.actualLastPurchaseDate ? new Date(b.actualLastPurchaseDate).getTime() : 0;
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      const numA = parseInt(a.computedCode, 10) || 0;
      const numB = parseInt(b.computedCode, 10) || 0;
      return numB - numA;
    });
  }, [enrichedClients, searchText, warrantyFilter]);

  // Overall warranty & promo stats for quick summary bar
  const clientsWarrantyStats = useMemo(() => {
    const totalBuyers = enrichedClients.filter((c) => c.actualPurchaseCount > 0);
    const withActiveWarranty = totalBuyers.filter((c) => c.hasActiveWarranty);
    const withWarrantyHistory = totalBuyers.filter((c) => c.totalWarrantiesCount > 0 && !c.hasActiveWarranty);
    const eligible10Days = totalBuyers.filter((c) => c.isPromoEligible);
    const recentPurchases = totalBuyers.filter((c) => !c.hasActiveWarranty && c.isRecentPurchase);

    return {
      total: totalBuyers.length,
      withActiveWarranty: withActiveWarranty.length,
      withWarrantyHistory: withWarrantyHistory.length,
      eligible10Days: eligible10Days.length,
      recentPurchases: recentPurchases.length
    };
  }, [enrichedClients]);

  // Auto select first client (most recent buyer) if none is selected
  useEffect(() => {
    if (!selectedClientId && filteredClients.length > 0) {
      setSelectedClientId(filteredClients[0].id);
    }
  }, [filteredClients, selectedClientId]);

  // Compute WhatsApp Client Code tracking (only the last used code)
  const whatsappCodeStats = useMemo(() => {
    let maxCodeNum = 0;
    let lastClientName = "";

    enrichedClients.forEach((c) => {
      const num = parseInt(c.computedCode, 10);
      if (!isNaN(num) && num > maxCodeNum) {
        maxCodeNum = num;
        lastClientName = c.name;
      }
    });

    clients.forEach((c, idx) => {
      const codeStr = getClientCode(c, idx);
      const num = parseInt(codeStr, 10);
      if (!isNaN(num) && num > maxCodeNum) {
        maxCodeNum = num;
        lastClientName = c.name;
      }
    });

    const lastCodeStr = maxCodeNum > 0 ? String(maxCodeNum).padStart(4, "0") : "0000";

    return {
      lastCodeStr,
      lastClientName
    };
  }, [enrichedClients, clients]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Find currently selected client object
  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return enrichedClients.find((c) => c.id === selectedClientId) || null;
  }, [enrichedClients, selectedClientId]);

  // Find receipts that belong to the selected client (sorted by date descending)
  const clientReceipts = useMemo(() => {
    if (!selectedClient) return [];
    return [...selectedClient.actualReceipts].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.consecutive || 0) - (a.consecutive || 0);
    });
  }, [selectedClient]);

  // Format date helper
  const formatDateSimple = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className={`text-xl font-bold tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            Directorio e Historial de Clientes
          </h2>
          <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
            Control de compras, estado de garantías y aptitud para promociones
          </p>
        </div>
      </div>

      {/* Notice Card: WhatsApp Client Code Control */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 rounded-2xl p-4 sm:p-5 text-white shadow-md border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20 shadow-inner">
            <MessageSquare className="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200 bg-white/15 px-2 py-0.5 rounded-full">
                Control WhatsApp
              </span>
              <span className="text-xs text-emerald-100">
                Guardado de Contactos
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>Último Código Utilizado:</span>
              <span className="font-mono bg-white/20 px-2 py-0.5 rounded font-black text-white">#{whatsappCodeStats.lastCodeStr}</span>
              {whatsappCodeStats.lastClientName && (
                <span className="text-xs font-medium text-emerald-100 opacity-90">({whatsappCodeStats.lastClientName})</span>
              )}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleCopyCode(whatsappCodeStats.lastCodeStr)}
          className="flex items-center gap-1.5 text-xs font-extrabold bg-white text-emerald-800 hover:bg-emerald-50 active:scale-95 transition px-3.5 py-2 rounded-lg shadow-sm cursor-pointer shrink-0"
          title="Copiar último código utilizado"
        >
          {copiedCode === whatsappCodeStats.lastCodeStr ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span>¡Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copiar #{whatsappCodeStats.lastCodeStr}</span>
            </>
          )}
        </button>
      </div>

      {/* Promotional & Warranty Eligibility Filter Banner */}
      <div className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
        isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
      }`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
            Filtro de Promociones:
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setWarrantyFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              warrantyFilter === "all"
                ? "bg-indigo-600 text-white shadow-xs"
                : isDarkMode
                ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Todos ({clientsWarrantyStats.total})
          </button>

          <button
            type="button"
            onClick={() => setWarrantyFilter("eligible_10d")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              warrantyFilter === "eligible_10d"
                ? "bg-emerald-600 text-white shadow-xs"
                : isDarkMode
                ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800 hover:bg-emerald-900/80"
                : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
            }`}
            title="Clientes que compraron hace 10 o más días y no tienen garantías activas (100% listos para promo de recompra)"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>🟢 Listos Recompra (≥10d: {clientsWarrantyStats.eligible10Days})</span>
          </button>

          <button
            type="button"
            onClick={() => setWarrantyFilter("recent")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              warrantyFilter === "recent"
                ? "bg-sky-600 text-white shadow-xs"
                : isDarkMode
                ? "bg-sky-950/60 text-sky-300 border border-sky-800 hover:bg-sky-900/80"
                : "bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100"
            }`}
            title="Clientes que compraron recientemente (hace menos de 10 días). En período de entrega/servicio."
          >
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>🔵 Compras Recientes (&lt;10d: {clientsWarrantyStats.recentPurchases})</span>
          </button>

          <button
            type="button"
            onClick={() => setWarrantyFilter("active_warranty")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              warrantyFilter === "active_warranty"
                ? "bg-rose-600 text-white shadow-xs"
                : isDarkMode
                ? "bg-rose-950/60 text-rose-300 border border-rose-800 hover:bg-rose-900/80"
                : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100"
            }`}
            title="Clientes con garantía activa en curso (No recomendado enviar promociones)"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>🔴 Garantía Activa ({clientsWarrantyStats.withActiveWarranty})</span>
          </button>

          <button
            type="button"
            onClick={() => setWarrantyFilter("with_history")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              warrantyFilter === "with_history"
                ? "bg-amber-600 text-white shadow-xs"
                : isDarkMode
                ? "bg-amber-950/60 text-amber-300 border border-amber-800 hover:bg-amber-900/80"
                : "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
            }`}
            title="Clientes que han tenido garantías resueltas en el pasado"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>🟡 Con Historial ({clientsWarrantyStats.withWarrantyHistory})</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Clients List */}
        <div className={`lg:col-span-5 rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col h-[650px] ${
          isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
        }`}>
          {/* Search bar inside list */}
          <div className={`p-4 border-b ${
            isDarkMode ? "bg-slate-850 border-slate-800" : "bg-gray-50/50 border-gray-150"
          }`}>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-indigo-500" />
              </div>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar cliente por ID (ej. 0001), nombre o WhatsApp..."
                className={`block w-full pl-10 pr-3 py-1.5 border rounded-lg text-xs transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-400"
                    : "bg-white border-gray-200 text-gray-800 placeholder-gray-400 focus:border-indigo-500"
                }`}
              />
            </div>
          </div>

          {/* List items scrollable container */}
          <div className={`flex-1 overflow-y-auto divide-y ${
            isDarkMode ? "divide-slate-850" : "divide-gray-100"
          }`}>
            {filteredClients.length === 0 ? (
              <div className={`py-16 text-center text-xs ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
                <Inbox className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? "text-slate-600" : "text-gray-300"}`} />
                No se encontraron clientes con este filtro.
              </div>
            ) : (
              filteredClients.map((client) => {
                const isSelected = selectedClientId === client.id;
                return (
                  <div
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedClientId(client.id);
                      }
                    }}
                    className={`w-full text-left p-3.5 transition flex items-center justify-between group cursor-pointer ${
                      isSelected
                        ? isDarkMode
                          ? "bg-indigo-950/60 border-l-4 border-indigo-500"
                          : "bg-indigo-50/60 border-l-4 border-indigo-600"
                        : isDarkMode
                          ? "hover:bg-slate-850/60"
                          : "hover:bg-gray-50/50"
                    }`}
                  >
                    <div className="space-y-1.5 pr-3 truncate flex-1">
                      <div className={`text-xs font-bold flex items-center gap-1.5 flex-wrap ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}>
                        <span className={`font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${
                          isDarkMode
                            ? "text-indigo-300 bg-indigo-950 border-indigo-800"
                            : "text-indigo-700 bg-indigo-50 border-indigo-100/80"
                        }`}>
                          ID: {client.computedCode}
                        </span>
                        <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate">{client.name}</span>
                        {client.tag && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-sm font-extrabold border shrink-0 ${
                            client.tag === "VIP" ? (isDarkMode ? "bg-purple-950 text-purple-300 border-purple-800" : "bg-purple-100 text-purple-800 border-purple-200") :
                            client.tag === "Frecuente" ? (isDarkMode ? "bg-blue-950 text-blue-300 border-blue-800" : "bg-blue-100 text-blue-800 border-blue-200") :
                            client.tag === "Mayorista" ? (isDarkMode ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-emerald-100 text-emerald-800 border-emerald-200") :
                            (isDarkMode ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-gray-100 text-gray-700 border-gray-200")
                          }`}>
                            {client.tag}
                          </span>
                        )}
                      </div>

                      {/* Phone & Promo/Warranty Status Badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className={`text-[10px] font-mono flex items-center gap-1 ${
                          isDarkMode ? "text-slate-400" : "text-gray-500"
                        }`}>
                          <Phone className="w-3 h-3 text-gray-400" />
                          {client.phone}
                        </div>

                        {/* Warranty & Days Status Tag */}
                        {client.hasActiveWarranty ? (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${
                            isDarkMode ? "bg-rose-950/80 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            Garantía Activa
                          </span>
                        ) : client.isRecentPurchase ? (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            isDarkMode ? "bg-sky-950/60 text-sky-300 border-sky-800" : "bg-sky-50 text-sky-700 border-sky-200"
                          }`}>
                            <Clock className="w-2.5 h-2.5 text-sky-400" />
                            <span>Compra Reciente ({client.daysSinceLastPurchase}d)</span>
                          </span>
                        ) : client.isPromoEligible ? (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            isDarkMode ? "bg-emerald-950/50 text-emerald-400 border-emerald-800/80" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}>
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Listo Promo ({client.daysSinceLastPurchase}d)</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded border ${
                            isDarkMode ? "bg-slate-800 text-slate-400 border-slate-700" : "bg-gray-100 text-gray-600 border-gray-200"
                          }`}>
                            Sin compras recientes
                          </span>
                        )}

                        {client.totalWarrantiesCount > 0 && !client.hasActiveWarranty && (
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            isDarkMode ? "bg-amber-950/70 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}>
                            🟡 {client.resolvedWarranties.length} Resuelta{client.resolvedWarranties.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className={`text-xs font-mono font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}>
                          {formatCOP(client.actualTotalSpent)}
                        </div>
                        <div className={`text-[9px] uppercase tracking-wider font-semibold ${
                          isDarkMode ? "text-slate-400" : "text-gray-400"
                        }`}>
                          {client.actualPurchaseCount} {client.actualPurchaseCount === 1 ? "compra" : "compras"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClientId(client.id);
                          setShowRepurchaseModal(true);
                        }}
                        className={`p-1.5 rounded-lg border transition cursor-pointer shadow-2xs ${
                          client.hasActiveWarranty
                            ? isDarkMode
                              ? "bg-rose-950/70 hover:bg-rose-900 border-rose-800 text-rose-300"
                              : "bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-800"
                            : client.isRecentPurchase
                            ? isDarkMode
                              ? "bg-sky-950/70 hover:bg-sky-900 border-sky-800 text-sky-300"
                              : "bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-800"
                            : isDarkMode
                              ? "bg-emerald-950/70 hover:bg-emerald-900 border-emerald-800 text-emerald-300"
                              : "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800"
                        }`}
                        title={
                          client.hasActiveWarranty
                            ? `Atención: ${client.name} tiene una garantía activa en curso`
                            : client.isRecentPurchase
                            ? `Compra reciente (${client.daysSinceLastPurchase} días). Crear oferta o seguimiento para ${client.name}`
                            : `Crear oferta de recompra para ${client.name}`
                        }
                      >
                        <Gift className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Client details and order history */}
        <div className="lg:col-span-7 space-y-6">
          {selectedClient ? (
            <div className="space-y-6">
              {/* Client Profile Box */}
              <div className={`rounded-xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-5 ${
                isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
              }`}>
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold uppercase tracking-widest ${
                        isDarkMode ? "text-indigo-400" : "text-indigo-600"
                      }`}>Ficha de Cliente</span>
                      <span className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded-md border shadow-2xs ${
                        isDarkMode
                          ? "text-indigo-300 bg-indigo-950 border-indigo-800"
                          : "text-indigo-800 bg-indigo-50/80 border-indigo-200/60"
                      }`}>
                        ID: {selectedClient.computedCode}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-950"}`}>{selectedClient.name}</h3>
                      {selectedClient.tag && (
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                          selectedClient.tag === "VIP" ? (isDarkMode ? "bg-purple-950 text-purple-300 border-purple-800" : "bg-purple-100 text-purple-800 border-purple-200") :
                          selectedClient.tag === "Frecuente" ? (isDarkMode ? "bg-blue-950 text-blue-300 border-blue-800" : "bg-blue-100 text-blue-800 border-blue-200") :
                          selectedClient.tag === "Mayorista" ? (isDarkMode ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-emerald-100 text-emerald-800 border-emerald-200") :
                          (isDarkMode ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-gray-100 text-gray-700 border-gray-200")
                        }`}>
                          {selectedClient.tag}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs font-mono flex items-center gap-1 mt-0.5 ${
                      isDarkMode ? "text-slate-400" : "text-gray-500"
                    }`}>
                      <Phone className="w-3.5 h-3.5 text-gray-400" />
                      <span>{selectedClient.phone}</span>
                    </p>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <button
                        type="button"
                        id="btn-open-client-repurchase"
                        onClick={() => setShowRepurchaseModal(true)}
                        className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3.5 py-1.5 rounded-lg transition active:scale-95 cursor-pointer shadow-sm ${
                          selectedClient.hasActiveWarranty
                            ? "bg-rose-600 hover:bg-rose-700 text-white"
                            : selectedClient.isRecentPurchase
                            ? "bg-sky-600 hover:bg-sky-700 text-white"
                            : "bg-emerald-600 hover:bg-emerald-500 text-white"
                        }`}
                        title={
                          selectedClient.hasActiveWarranty
                            ? "Atención: este cliente tiene garantía activa"
                            : selectedClient.isRecentPurchase
                            ? `Compra reciente hace ${selectedClient.daysSinceLastPurchase} días (Recomendado esperar 10 días)`
                            : "Crear oferta promocional de recompra"
                        }
                      >
                        <Gift className="w-3.5 h-3.5" />
                        <span>Oferta de Recompra (Promo)</span>
                      </button>

                      <a
                        href={`https://wa.me/${selectedClient.phone.replace(/\D/g, '').length === 10 && !selectedClient.phone.replace(/\D/g, '').startsWith('57') ? '57' + selectedClient.phone.replace(/\D/g, '') : selectedClient.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${selectedClient.name.split(' ')[0]}! 👋 Te saludamos de ImpulsaNet. ¿En qué podemos ayudarte hoy?`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition active:scale-95 cursor-pointer shadow-2xs border ${
                          isDarkMode
                            ? "bg-slate-800 hover:bg-slate-750 border-slate-700 text-slate-300"
                            : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-700"
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>Chat Libre</span>
                      </a>

                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold uppercase ${
                          isDarkMode ? "text-slate-400" : "text-gray-400"
                        }`}>Etiqueta:</span>
                        <select
                          value={selectedClient.tag || ""}
                          onChange={async (e) => {
                            const newTag = e.target.value;
                            try {
                              await updateClientTag(selectedClient.id, newTag);
                            } catch (err) {
                              console.error("Error updating client tag:", err);
                            }
                          }}
                          className={`text-[11px] font-semibold rounded-md border px-2 py-0.5 focus:outline-hidden cursor-pointer ${
                            isDarkMode
                              ? "bg-slate-800 border-slate-700 text-slate-200"
                              : "bg-white border-gray-200 text-gray-800"
                          }`}
                        >
                          <option value="">Sin Etiqueta</option>
                          <option value="VIP">👑 VIP</option>
                          <option value="Frecuente">⭐ Frecuente</option>
                          <option value="Mayorista">💼 Mayorista</option>
                          <option value="Nuevo">🌱 Nuevo</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className={`rounded-xl p-3 text-center border ${
                    isDarkMode
                      ? "bg-indigo-950/80 text-indigo-300 border-indigo-800"
                      : "bg-indigo-50 text-indigo-700 border-indigo-100/50"
                  }`}>
                    <div className={`text-[9px] font-bold uppercase tracking-wider ${
                      isDarkMode ? "text-indigo-400" : "text-indigo-500"
                    }`}>Total Consumido</div>
                    <div className="text-lg font-bold mt-0.5">{formatCOP(selectedClient.actualTotalSpent)}</div>
                  </div>
                </div>

                {/* Promotional & Warranty Eligibility Alert Banner */}
                {selectedClient.hasActiveWarranty ? (
                  <div className={`p-4 rounded-xl border flex items-start gap-3 transition ${
                    isDarkMode ? "bg-rose-950/60 border-rose-800 text-rose-200" : "bg-rose-50 border-rose-200 text-rose-900"
                  }`}>
                    <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <div className="font-bold flex items-center gap-2">
                        <span>🔴 Cliente con Garantía Activa en Proceso</span>
                        <span className={`text-[10px] px-2 py-0.2 rounded-full font-extrabold border ${
                          isDarkMode ? "bg-rose-900 text-rose-200 border-rose-700" : "bg-rose-100 text-rose-800 border-rose-200"
                        }`}>
                          ⚠️ NO enviar promociones aún
                        </span>
                      </div>
                      <p className={`text-[11px] leading-relaxed ${isDarkMode ? "text-rose-300" : "text-rose-700"}`}>
                        Este cliente tiene un reclamo de reposición activo en el cronómetro de 48h. Se recomienda esperar a que el proveedor resuelva la garantía antes de enviarle promociones u ofertas de recompra.
                      </p>
                      {selectedClient.activeWarranties.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {selectedClient.activeWarranties.map((w) => (
                            <span key={w.id} className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                              isDarkMode ? "bg-rose-900/60 border-rose-700 text-rose-200" : "bg-white border-rose-300 text-rose-800"
                            }`}>
                              ID Proveedor: {w.providerOrderId} ({w.serviceName})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : selectedClient.isRecentPurchase ? (
                  <div className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                    isDarkMode ? "bg-sky-950/40 border-sky-800 text-sky-200" : "bg-sky-50 border-sky-200 text-sky-900"
                  }`}>
                    <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        <span>🔵 Compra Reciente (Hace {selectedClient.daysSinceLastPurchase} {selectedClient.daysSinceLastPurchase === 1 ? "día" : "días"})</span>
                        <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold border ${
                          isDarkMode ? "bg-sky-900/80 text-sky-200 border-sky-700" : "bg-sky-100 text-sky-800 border-sky-200"
                        }`}>
                          ⏳ En período de servicio / Esperar
                        </span>
                      </div>
                      <p className={`text-[11px] ${isDarkMode ? "text-sky-300" : "text-sky-700"}`}>
                        Este cliente compró recientemente. Se sugiere esperar a que transcurran mínimo 10 días desde su compra para ofrecerle promociones de recompra y no saturarlo.
                      </p>
                    </div>
                  </div>
                ) : selectedClient.totalWarrantiesCount > 0 ? (
                  <div className={`p-3.5 rounded-xl border flex items-start gap-3 transition ${
                    isDarkMode ? "bg-amber-950/40 border-amber-800 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-900"
                  }`}>
                    <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs">
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        <span>🟡 Apto para Promos ({selectedClient.resolvedWarranties.length} Garantía{selectedClient.resolvedWarranties.length !== 1 ? "s" : ""} Resuelta{selectedClient.resolvedWarranties.length !== 1 ? "s" : ""})</span>
                        <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold border ${
                          isDarkMode ? "bg-emerald-900/80 text-emerald-200 border-emerald-700" : "bg-emerald-100 text-emerald-800 border-emerald-200"
                        }`}>
                          🟢 Cumple {selectedClient.daysSinceLastPurchase} días
                        </span>
                      </div>
                      <p className={`text-[11px] ${isDarkMode ? "text-amber-300" : "text-amber-700"}`}>
                        Todas sus garantías previas fueron resueltas y superó los 10 días desde su compra. Es seguro y oportuno enviarle ofertas de recompra.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className={`p-3 rounded-xl border flex items-center gap-2.5 transition ${
                    isDarkMode ? "bg-emerald-950/30 border-emerald-800/80 text-emerald-200" : "bg-emerald-50 border-emerald-200 text-emerald-900"
                  }`}>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="text-xs">
                      <strong className="text-emerald-500 font-bold">🟢 Cliente 100% Óptimo para Recompra (Compró hace {selectedClient.daysSinceLastPurchase >= 0 ? `${selectedClient.daysSinceLastPurchase} días` : 'más de 10 días'}):</strong>
                      <span className={`ml-1 text-[11px] ${isDarkMode ? "text-emerald-300" : "text-emerald-800"}`}>
                        Cumple con el tiempo ideal (≥10 días) y no tiene reclamos de garantía. Candidato prioritario para campañas y ofertas de recompra.
                      </span>
                    </div>
                  </div>
                )}

                <div className={`grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 border-t pt-5 text-xs ${
                  isDarkMode ? "border-slate-800" : "border-gray-100"
                }`}>
                  <div>
                    <span className={isDarkMode ? "text-slate-400 block mb-0.5" : "text-gray-400 block mb-0.5"}>Total de Pedidos:</span>
                    <strong className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-800"}`}>{selectedClient.actualPurchaseCount} órdenes</strong>
                  </div>
                  <div>
                    <span className={isDarkMode ? "text-slate-400 block mb-0.5" : "text-gray-400 block mb-0.5"}>Total Gastado:</span>
                    <strong className="text-emerald-500 font-bold">{formatCOP(selectedClient.actualTotalSpent)}</strong>
                  </div>
                  <div>
                    <span className={isDarkMode ? "text-slate-400 block mb-0.5" : "text-gray-400 block mb-0.5"}>Ganancia Generada:</span>
                    <strong className={`font-bold ${isDarkMode ? "text-indigo-400" : "text-indigo-700"}`}>{formatCOP(selectedClient.actualProfitGenerated)}</strong>
                  </div>
                  <div>
                    <span className={isDarkMode ? "text-slate-400 block mb-0.5" : "text-gray-400 block mb-0.5"}>Primer Pedido:</span>
                    <strong className={`font-mono font-medium ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>{formatDateSimple(selectedClient.actualFirstPurchaseDate)}</strong>
                  </div>
                  <div>
                    <span className={isDarkMode ? "text-slate-400 block mb-0.5" : "text-gray-400 block mb-0.5"}>Última Compra:</span>
                    <strong className={`font-mono font-medium ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>{formatDateSimple(selectedClient.actualLastPurchaseDate)}</strong>
                  </div>
                  <div>
                    <span className={isDarkMode ? "text-slate-400 block mb-0.5" : "text-gray-400 block mb-0.5"}>Promedio de Compra:</span>
                    <strong className={`font-semibold ${isDarkMode ? "text-indigo-400" : "text-indigo-600"}`}>{formatCOP(selectedClient.actualAveragePurchase)}</strong>
                  </div>
                  <div className={`col-span-2 sm:col-span-3 border-t pt-3 flex justify-between items-center text-[11px] ${
                    isDarkMode ? "border-slate-800" : "border-gray-50"
                  }`}>
                    <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Total de servicios adquiridos:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md border ${
                      isDarkMode
                        ? "text-slate-200 bg-slate-800 border-slate-700"
                        : "text-gray-800 bg-gray-50 border-gray-100"
                    }`}>
                      {selectedClient.actualNumServicesAcquired} {selectedClient.actualNumServicesAcquired === 1 ? "servicio" : "servicios"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Client Receipts History List */}
              <div className={`rounded-xl border p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4 ${
                isDarkMode ? "bg-slate-900/95 border-slate-800 text-slate-100" : "bg-white border-gray-200 text-gray-900"
              }`}>
                <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b pb-3 ${
                  isDarkMode ? "text-slate-400 border-slate-800" : "text-gray-400 border-gray-100"
                }`}>
                  <FileText className="w-4 h-4 text-indigo-500" />
                  Historial de Compras de {selectedClient.name}
                </h4>

                {clientReceipts.length === 0 ? (
                  <p className={`text-xs italic py-6 text-center ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>Cargando compras...</p>
                ) : (
                  <div className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-gray-100"}`}>
                    {clientReceipts.map((receipt) => (
                      <div key={receipt.id} className={`flex justify-between items-center py-3.5 transition ${
                        isDarkMode ? "hover:bg-slate-850/40" : "hover:bg-gray-50/20"
                      }`}>
                        <div className="space-y-1">
                          <div className={`text-xs font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                            <span>Comprobante #{receipt.consecutive}</span>
                            {getNormalizedStatus(receipt.status) === "garantia_en_proceso" && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                isDarkMode ? "bg-rose-950 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}>
                                En Garantía
                              </span>
                            )}
                          </div>
                          <div className={`text-[10px] font-mono flex items-center gap-1 ${
                            isDarkMode ? "text-slate-400" : "text-gray-400"
                          }`}>
                            <Calendar className="w-3 h-3" />
                            {formatDateSimple(receipt.date)}
                            <span className={isDarkMode ? "text-slate-600" : "text-gray-200"}>|</span>
                            <span>{receipt.services.length} {receipt.services.length === 1 ? "servicio" : "servicios"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className={`text-xs font-bold ${isDarkMode ? "text-indigo-400" : "text-indigo-600"}`}>
                            {formatCOP(receipt.totalCharged)}
                          </span>
                          <button
                            id={`btn-view-client-receipt-${receipt.consecutive}`}
                            onClick={() => onSelectReceipt(receipt)}
                            className={`text-xs font-semibold border transition px-2.5 py-1.5 rounded-lg shadow-2xs cursor-pointer ${
                              isDarkMode
                                ? "bg-slate-800 border-indigo-500/50 text-indigo-300 hover:bg-slate-750"
                                : "bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900"
                            }`}
                          >
                            Ver
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`rounded-xl border p-12 text-center h-full flex flex-col justify-center items-center shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${
              isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
            }`}>
              <User className={`w-12 h-12 mb-3 ${isDarkMode ? "text-slate-700" : "text-indigo-200"}`} />
              <h3 className={`text-sm font-bold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>Seleccione un Cliente</h3>
              <p className={`text-xs max-w-sm mt-1 leading-relaxed ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
                Seleccione un cliente del listado de la izquierda para ver su historial completo de compras, estado de garantías y promociones.
              </p>
            </div>
          )}
        </div>
      </div>

      {showRepurchaseModal && selectedClient && (
        <RepurchaseModal
          initialClient={selectedClient}
          onClose={() => setShowRepurchaseModal(false)}
        />
      )}
    </div>
  );
};
