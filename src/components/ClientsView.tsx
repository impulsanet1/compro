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
  Sparkles,
  Percent
} from "lucide-react";
import { Client, Receipt, getClientCode } from "../types";
import { motion } from "motion/react";
import { RepurchaseModal } from "./RepurchaseModal";

interface ClientsViewProps {
  onSelectReceipt: (receipt: Receipt) => void;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ onSelectReceipt }) => {
  const { clients, receipts, updateClientTag, isDarkMode } = useApp();
  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  const [searchText, setSearchText] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showRepurchaseModal, setShowRepurchaseModal] = useState(false);

  // Search and enrich clients logic
  const enrichedClients = useMemo(() => {
    return clients.map((c, index) => {
      const code = getClientCode(c, index);
      const actualReceipts = receipts.filter(
        (r) =>
          r.clientName.trim().toLowerCase() === c.name.trim().toLowerCase() &&
          r.clientPhone.trim() === c.phone.trim()
      );
      
      const sortedReceipts = [...actualReceipts].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const lastDate = sortedReceipts.length > 0 ? sortedReceipts[0].date : c.lastPurchaseDate;

      const sortedAscReceipts = [...actualReceipts].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const firstDate = sortedAscReceipts.length > 0 ? sortedAscReceipts[0].date : (c.lastPurchaseDate || "");

      const totalSpent = actualReceipts.reduce((sum, r) => sum + (r.totalCharged || 0), 0);
      const profitGenerated = actualReceipts.reduce((sum, r) => sum + (r.totalProfit || 0), 0);
      const averagePurchase = actualReceipts.length > 0 ? totalSpent / actualReceipts.length : 0;
      const numServicesAcquired = actualReceipts.reduce((sum, r) => sum + (r.services?.length || 0), 0);

      return {
        ...c,
        computedCode: code,
        actualPurchaseCount: actualReceipts.length,
        actualTotalSpent: totalSpent,
        actualLastPurchaseDate: lastDate,
        actualFirstPurchaseDate: firstDate,
        actualProfitGenerated: profitGenerated,
        actualAveragePurchase: averagePurchase,
        actualNumServicesAcquired: numServicesAcquired,
        actualReceipts
      };
    });
  }, [clients, receipts]);

  // Sort clients strictly by MOST RECENT purchase date (newest purchase at the top)
  const filteredClients = useMemo(() => {
    const filtered = enrichedClients.filter((c) => {
      if (c.actualPurchaseCount <= 0) return false;
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
  }, [enrichedClients, searchText]);

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
            Clientes ordenados por última compra realizada (los más recientes arriba)
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Clients List */}
        <div className={`lg:col-span-5 rounded-xl border shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col h-[600px] ${
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
                No se encontraron clientes registrados.
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
                    className={`w-full text-left p-4 transition flex items-center justify-between group cursor-pointer ${
                      isSelected
                        ? isDarkMode
                          ? "bg-indigo-950/60 border-l-4 border-indigo-500"
                          : "bg-indigo-50/60 border-l-4 border-indigo-600"
                        : isDarkMode
                          ? "hover:bg-slate-850/60"
                          : "hover:bg-gray-50/50"
                    }`}
                  >
                    <div className="space-y-1 pr-4 truncate">
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
                      <div className={`text-[10px] font-mono flex items-center gap-1 ${
                        isDarkMode ? "text-slate-400" : "text-gray-500"
                      }`}>
                        <Phone className="w-3 h-3 text-gray-400" />
                        {client.phone}
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
                          isDarkMode
                            ? "bg-emerald-950/70 hover:bg-emerald-900 border-emerald-800 text-emerald-300"
                            : "bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800"
                        }`}
                        title={`Crear oferta de recompra para ${client.name}`}
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
                        className="inline-flex items-center gap-1.5 text-xs font-extrabold px-3.5 py-1.5 rounded-lg transition active:scale-95 cursor-pointer shadow-sm bg-emerald-600 hover:bg-emerald-500 text-white"
                        title="Crear oferta promocional de recompra calculada sobre su última compra"
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
                          <div className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                            Comprobante #{receipt.consecutive}
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
                Seleccione un cliente del listado de la izquierda para ver su historial completo de compras, detalles de contacto y facturación.
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
