/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { useApp } from "../context/AppContext";
import {
  SupplierWarrantyRecord,
  getSupplierWarrantyTimeStatus,
  Receipt,
  getNormalizedStatus,
  getItemOrderIds,
  getLocalDatetimeInputValue,
  parseLocalDatetimeInput
} from "../types";
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  Search,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  Edit2,
  FileText,
  X,
  Zap,
  CheckSquare,
  Square
} from "lucide-react";

interface SupplierWarrantyViewProps {
  onSelectReceipt?: (receipt: Receipt) => void;
}

const getServiceSpecificReasons = (serviceName?: string): string[] => {
  if (!serviceName || !serviceName.trim()) {
    return [
      "Caída de seguidores / Drop",
      "No llegaron los likes / vistas",
      "El pedido no inició / Atascado",
      "Reposición solicitada por cliente",
      "Garantía de 30 días vigente",
      "Otro motivo (Escribir personalizado)"
    ];
  }

  const s = serviceName.toLowerCase();
  const options: string[] = [];

  if (s.includes("seguid") || s.includes("follower") || s.includes("member") || s.includes("suscript") || s.includes("subscri")) {
    options.push("Caída de seguidores / Drop");
    options.push("Seguidores no suben / Entrega incompleta");
    options.push("El pedido no inició / Atascado");
    options.push("Reposición solicitada por cliente");
    options.push("Garantía de 30 días vigente");
  } else if (s.includes("like") || s.includes("me gusta") || s.includes("reacc") || s.includes("love") || s.includes("voto")) {
    options.push("Caída de likes / Reacciones");
    options.push("No llegaron los likes / Entrega incompleta");
    options.push("El pedido no inició / Atascado");
    options.push("Reposición solicitada por cliente");
    options.push("Garantía de 30 días vigente");
  } else if (s.includes("vista") || s.includes("view") || s.includes("reproduc") || s.includes("repro") || s.includes("hora") || s.includes("watch")) {
    options.push("No suben las reproducciones / vistas");
    options.push("Caída de reproducciones / views");
    options.push("El pedido no inició / Atascado");
    options.push("Reposición solicitada por cliente");
    options.push("Garantía de 30 días vigente");
  } else if (s.includes("coment") || s.includes("comment")) {
    options.push("Comentarios no entregados / Incompletos");
    options.push("Caída de comentarios");
    options.push("El pedido no inició / Atascado");
    options.push("Reposición solicitada por cliente");
    options.push("Garantía de 30 días vigente");
  } else {
    options.push(`Caída de servicio / Drop (${serviceName})`);
    options.push(`Entrega incompleta / No llegó (${serviceName})`);
    options.push("El pedido no inició / Atascado");
    options.push("Reposición solicitada por cliente");
    options.push("Garantía de 30 días vigente");
  }

  options.push("Otro motivo (Escribir personalizado)");
  return options;
};

export const SupplierWarrantyView: React.FC<SupplierWarrantyViewProps> = ({ onSelectReceipt }) => {
  const {
    supplierWarranties,
    receipts,
    businessConfig,
    addSupplierWarranty,
    updateSupplierWarranty,
    deleteSupplierWarranty,
    resolveSupplierWarranty,
    updateReceipt,
    isDarkMode
  } = useApp();

  // Navigation & View state
  const [activeSubTab, setActiveSubTab] = useState<"tracking" | "active_ids">("tracking");
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "pending">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copySuccessMsg, setCopySuccessMsg] = useState<string | null>(null);

  // Simplified Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SupplierWarrantyRecord | null>(null);
  
  // Registration Flow State (Simplified)
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Receipt | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [manualOrderIdInput, setManualOrderIdInput] = useState("");
  const [formSentDate, setFormSentDate] = useState(getLocalDatetimeInputValue());
  const [formReason, setFormReason] = useState("Caída de seguidores / Drop");
  const [customReasonInput, setCustomReasonInput] = useState("");
  const [formClientNameManual, setFormClientNameManual] = useState("");
  const [formServiceNameManual, setFormServiceNameManual] = useState("");

  // Copy helper
  const copyToClipboard = (text: string, idForState?: string, customMsg?: string) => {
    navigator.clipboard.writeText(text);
    if (idForState) {
      setCopiedId(idForState);
      setTimeout(() => setCopiedId(null), 2000);
    }
    if (customMsg) {
      setCopySuccessMsg(customMsg);
      setTimeout(() => setCopySuccessMsg(null), 3000);
    }
  };

  // 1. Calculate stats for active tracking records (excluding resolved records)
  const activeSupplierWarranties = useMemo(() => {
    return supplierWarranties.filter((w) => w.status !== "resuelto");
  }, [supplierWarranties]);

  const warrantyRecordsWithStatus = useMemo(() => {
    return activeSupplierWarranties.map((record) => {
      const timeInfo = getSupplierWarrantyTimeStatus({
        ...record,
        expectedResponseHours: 48 // Fixed to 48 hours
      });
      return {
        ...record,
        expectedResponseHours: 48,
        timeInfo
      };
    });
  }, [activeSupplierWarranties]);

  const countOverdue = useMemo(() => {
    return warrantyRecordsWithStatus.filter((r) => r.timeInfo.isOverdue).length;
  }, [warrantyRecordsWithStatus]);

  const countPending = useMemo(() => {
    return warrantyRecordsWithStatus.filter(
      (r) => (r.status === "en_espera" || r.status === "reclamado_nuevamente") && !r.timeInfo.isOverdue
    ).length;
  }, [warrantyRecordsWithStatus]);

  // 2. Calculate All Active Client Warranty IDs from Receipts
  const activeClientWarrantyItems = useMemo(() => {
    const defaultWarrantyDays = businessConfig.warrantyDays || 30;
    const now = new Date().getTime();
    const list: Array<{
      receipt: Receipt;
      orderId: string;
      serviceName: string;
      socialNetworkName: string;
      quantity: number;
      purchaseDate: string;
      warrantyDays: number;
      daysRemaining: number;
      isExpired: boolean;
      trackingRecord?: SupplierWarrantyRecord;
      isInWarrantyStatus: boolean;
    }> = [];

    receipts.forEach((r) => {
      let wDays = defaultWarrantyDays;
      if (r.warranty) {
        const match = r.warranty.match(/\d+/);
        if (match) wDays = parseInt(match[0], 10);
      }

      const receiptDate = new Date(r.date).getTime();
      const expDate = receiptDate + wDays * 24 * 60 * 60 * 1000;
      const remainingMs = expDate - now;
      const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      const isExpired = daysRemaining <= 0;
      const normStatus = getNormalizedStatus(r.status);
      const isInWarrantyStatus = normStatus === "garantia_en_proceso";

      // Extract all provider order IDs in this receipt
      r.services.forEach((item) => {
        const idsToProcess = getItemOrderIds(item);

        idsToProcess.forEach((orderId) => {
          // Check if this ID is already in active supplier tracking
          const trackingRecord = supplierWarranties.find((w) =>
            w.status !== "resuelto" &&
            (w.providerOrderId.includes(orderId) || (w.providerOrderIds && w.providerOrderIds.includes(orderId)))
          );

          list.push({
            receipt: r,
            orderId,
            serviceName: item.serviceName,
            socialNetworkName: item.socialNetworkName,
            quantity: item.quantity,
            purchaseDate: r.date,
            warrantyDays: wDays,
            daysRemaining,
            isExpired,
            trackingRecord,
            isInWarrantyStatus
          });
        });
      });
    });

    return list;
  }, [receipts, businessConfig, supplierWarranties]);

  // Active items only (not expired for client warranty)
  const activeUnexpiredClientWarrantyItems = useMemo(() => {
    return activeClientWarrantyItems.filter((item) => !item.isExpired);
  }, [activeClientWarrantyItems]);

  // Filter tracking records
  const filteredTrackingRecords = useMemo(() => {
    return warrantyRecordsWithStatus.filter((record) => {
      // Never show resolved records (completely eliminated per user directive)
      if (record.status === "resuelto") return false;

      // 1. Status Filter
      if (statusFilter === "overdue" && !record.timeInfo.isOverdue) return false;
      if (statusFilter === "pending" && (record.status === "rechazado" || record.timeInfo.isOverdue)) return false;

      // 2. Search Term
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matchesId = record.providerOrderId.toLowerCase().includes(term);
        const matchesClient = record.clientName.toLowerCase().includes(term);
        const matchesService = record.serviceName.toLowerCase().includes(term);
        const matchesReason = (record.reason || "").toLowerCase().includes(term);
        const matchesConsecutive = (record.receiptConsecutive?.toString() || "").includes(term);

        if (!matchesId && !matchesClient && !matchesService && !matchesReason && !matchesConsecutive) {
          return false;
        }
      }

      return true;
    });
  }, [warrantyRecordsWithStatus, statusFilter, searchTerm]);

  // Filter active client IDs
  const filteredClientWarrantyItems = useMemo(() => {
    return activeClientWarrantyItems.filter((item) => {
      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const matchesId = item.orderId.toLowerCase().includes(term);
        const matchesClient = item.receipt.clientName.toLowerCase().includes(term);
        const matchesService = item.serviceName.toLowerCase().includes(term);
        const matchesConsecutive = item.receipt.consecutive.toString().includes(term);
        return matchesId || matchesClient || matchesService || matchesConsecutive;
      }
      return true;
    });
  }, [activeClientWarrantyItems, searchTerm]);

  // Invoices filtered by search query in the simplified modal
  const modalInvoiceSearchResults = useMemo(() => {
    if (!invoiceSearchQuery.trim()) {
      return receipts.slice(0, 8); // Return 8 most recent
    }
    const q = invoiceSearchQuery.toLowerCase().trim();
    return receipts.filter((r) => {
      const matchConsecutive = r.consecutive.toString().includes(q) || `#${r.consecutive}`.includes(q);
      const matchClient = r.clientName.toLowerCase().includes(q);
      const matchPhone = (r.clientPhone || "").includes(q);
      const matchService = r.services.some((s) => s.serviceName.toLowerCase().includes(q));
      const matchOrderId = r.services.some((s) =>
        getItemOrderIds(s).some((id) => id.toLowerCase().includes(q))
      );
      return matchConsecutive || matchClient || matchPhone || matchService || matchOrderId;
    }).slice(0, 10);
  }, [receipts, invoiceSearchQuery]);

  // Extract all available IDs from the selected invoice
  const selectedInvoiceOrderIds = useMemo(() => {
    if (!selectedInvoice) return [];
    const items: Array<{ id: string; serviceName: string; quantity: number }> = [];
    selectedInvoice.services.forEach((s) => {
      const label = `${s.socialNetworkName} - ${s.serviceName}`;
      const ids = getItemOrderIds(s);
      ids.forEach((id) => {
        items.push({ id, serviceName: label, quantity: s.quantity });
      });
    });
    return items;
  }, [selectedInvoice]);

  // Active service name context for the modal
  const activeModalServiceName = useMemo(() => {
    if (selectedInvoice) {
      if (selectedOrderIds.length > 0) {
        const found = selectedInvoice.services.find((s) => {
          const ids = getItemOrderIds(s);
          return selectedOrderIds.some((selId) => ids.includes(selId));
        });
        if (found) return `${found.socialNetworkName} - ${found.serviceName}`;
      }
      if (selectedInvoice.services.length > 0) {
        return `${selectedInvoice.services[0].socialNetworkName} - ${selectedInvoice.services[0].serviceName}`;
      }
    }
    return formServiceNameManual.trim() || "";
  }, [selectedInvoice, selectedOrderIds, formServiceNameManual]);

  const contextualReasons = useMemo(() => {
    return getServiceSpecificReasons(activeModalServiceName);
  }, [activeModalServiceName]);

  // Computed time preview for the modal form
  const modalTimePreview = useMemo(() => {
    const sent = formSentDate ? parseLocalDatetimeInput(formSentDate) : new Date();
    const now = new Date();
    const diffMs = now.getTime() - sent.getTime();
    const hoursElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    const daysElapsed = Math.floor(hoursElapsed / 24);
    const expectedMs = 48 * 60 * 60 * 1000;
    const remainingMs = expectedMs - diffMs;
    const rawHoursRemaining = Math.round(remainingMs / (1000 * 60 * 60));
    const hoursRemaining = Math.max(0, rawHoursRemaining);
    const overdueHours = rawHoursRemaining < 0 ? Math.abs(rawHoursRemaining) : 0;
    const isOverdue = rawHoursRemaining <= 0;

    return {
      hoursElapsed,
      daysElapsed,
      hoursRemaining: hoursRemaining > 48 && diffMs < 0 ? 48 : hoursRemaining,
      overdueHours,
      isOverdue
    };
  }, [formSentDate]);

  // Open modal for creating new record
  const handleOpenNewModal = (prefillReceipt?: Receipt, prefillOrderId?: string) => {
    setEditingRecord(null);
    setInvoiceSearchQuery("");
    setManualOrderIdInput("");
    setFormSentDate(getLocalDatetimeInputValue());
    setCustomReasonInput("");

    if (prefillReceipt) {
      setSelectedInvoice(prefillReceipt);
      if (prefillOrderId) {
        setSelectedOrderIds([prefillOrderId]);
      } else {
        // Do NOT select all IDs automatically. User selects them manually.
        setSelectedOrderIds([]);
      }
      const sName = prefillReceipt.services[0]
        ? `${prefillReceipt.services[0].socialNetworkName} - ${prefillReceipt.services[0].serviceName}`
        : "";
      const reasons = getServiceSpecificReasons(sName);
      setFormReason(reasons[0]);
    } else {
      setSelectedInvoice(null);
      setSelectedOrderIds([]);
      setFormClientNameManual("");
      setFormServiceNameManual("");
      setFormReason("Caída de seguidores / Drop");
    }
    setIsModalOpen(true);
  };

  // Select an invoice from the search in modal
  const handleSelectInvoiceInModal = (receipt: Receipt) => {
    setSelectedInvoice(receipt);
    // Do NOT select all IDs automatically. User selects them manually.
    setSelectedOrderIds([]);
    const sName = receipt.services[0]
      ? `${receipt.services[0].socialNetworkName} - ${receipt.services[0].serviceName}`
      : "";
    const reasons = getServiceSpecificReasons(sName);
    setFormReason(reasons[0]);
  };

  // Toggle selection of an ID in the modal (tachar / incluir)
  const toggleOrderIdSelection = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      // If user selected an ID and invoice is present, update reason default if not customized
      if (selectedInvoice && next.length > 0) {
        const matchingS = selectedInvoice.services.find((s) => {
          const ids = getItemOrderIds(s);
          return next.some((nid) => ids.includes(nid));
        });
        if (matchingS) {
          const sLabel = `${matchingS.socialNetworkName} - ${matchingS.serviceName}`;
          const reasons = getServiceSpecificReasons(sLabel);
          if (!customReasonInput) {
            setFormReason(reasons[0]);
          }
        }
      }
      return next;
    });
  };

  // Toggle select all IDs
  const handleToggleSelectAllIds = () => {
    const allAvailable = selectedInvoiceOrderIds.map((item) => item.id);
    if (selectedOrderIds.length === allAvailable.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(allAvailable);
    }
  };

  // Open modal for editing existing record
  const handleOpenEditModal = (record: SupplierWarrantyRecord) => {
    setEditingRecord(record);
    const targetRec = receipts.find((r) => r.id === record.receiptId);
    setSelectedInvoice(targetRec || null);
    setSelectedOrderIds(record.providerOrderIds && record.providerOrderIds.length > 0 ? record.providerOrderIds : [record.providerOrderId]);
    setManualOrderIdInput(record.providerOrderId);
    setFormClientNameManual(record.clientName);
    setFormServiceNameManual(record.serviceName);
    setFormSentDate(
      record.sentDate ? getLocalDatetimeInputValue(record.sentDate) : getLocalDatetimeInputValue()
    );
    setFormReason(record.reason || "Caída de seguidores / Drop");
    setCustomReasonInput(record.reason || "");
    setIsModalOpen(true);
  };

  // Save simplified record
  const handleSaveSimplifiedWarranty = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalOrderIds = [...selectedOrderIds];
    if (finalOrderIds.length === 0 && manualOrderIdInput.trim()) {
      finalOrderIds = manualOrderIdInput
        .split(/[\s,]+/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
    }

    if (finalOrderIds.length === 0) {
      alert("Por favor selecciona o escribe al menos un ID de pedido.");
      return;
    }

    const clientName = selectedInvoice ? selectedInvoice.clientName : formClientNameManual.trim() || "Cliente";
    const clientPhone = selectedInvoice ? selectedInvoice.clientPhone : undefined;
    
    // Find matching service for the selected IDs if invoice exists
    const matchingService = selectedInvoice
      ? selectedInvoice.services.find((s) => {
          const sIds = getItemOrderIds(s);
          return finalOrderIds.some((fid) => sIds.includes(fid));
        }) || selectedInvoice.services[0]
      : null;

    const serviceName = matchingService
      ? `${matchingService.socialNetworkName} - ${matchingService.serviceName}`
      : formServiceNameManual.trim() || "Servicio General";
    const quantity = matchingService ? matchingService.quantity : undefined;

    const idsCombinedString = finalOrderIds.join(", ");

    const parsedSentDate = parseLocalDatetimeInput(formSentDate);

    if (editingRecord) {
      await updateSupplierWarranty(editingRecord.id, {
        providerOrderId: idsCombinedString,
        providerOrderIds: finalOrderIds,
        receiptId: selectedInvoice ? selectedInvoice.id : undefined,
        receiptConsecutive: selectedInvoice ? selectedInvoice.consecutive : undefined,
        clientName,
        clientPhone,
        serviceName,
        quantity,
        sentDate: parsedSentDate.toISOString(),
        expectedResponseHours: 48, // Fixed 48 hours
        reason: formReason.trim()
      });
    } else {
      await addSupplierWarranty({
        providerOrderId: idsCombinedString,
        providerOrderIds: finalOrderIds,
        receiptId: selectedInvoice ? selectedInvoice.id : undefined,
        receiptConsecutive: selectedInvoice ? selectedInvoice.consecutive : undefined,
        clientName,
        clientPhone,
        serviceName,
        quantity,
        sentDate: parsedSentDate.toISOString(),
        expectedResponseHours: 48, // Fixed 48 hours
        status: "en_espera",
        reason: formReason.trim(),
        claimedAgainCount: 0
      });

      // Update invoice status to 'garantia_en_proceso' automatically
      if (selectedInvoice) {
        await updateReceipt(selectedInvoice.id, {
          status: "garantia_en_proceso"
        });
      }
    }

    setIsModalOpen(false);
    copyToClipboard(idsCombinedString, undefined, `¡${finalOrderIds.length} ID(s) registrados con plazo de 48h!`);
  };

  // Direct Delete handler
  const handleDeleteWarranty = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deleteSupplierWarranty(id);
      if (isModalOpen) {
        setIsModalOpen(false);
      }
      copyToClipboard("", undefined, "¡Registro de garantía eliminado!");
    } catch (err) {
      console.error("Error deleting supplier warranty:", err);
    }
  };

  // Direct Resolve handler (1-click, marks resolved and stores in background history, updates linked receipt to completado, and hides from active timer list)
  const handleQuickResolve = async (record: SupplierWarrantyRecord) => {
    try {
      await resolveSupplierWarranty(record.id);
      copyToClipboard("", undefined, "¡Garantía resuelta y archivada con éxito!");
    } catch (err) {
      console.error("Error resolving supplier warranty:", err);
    }
  };

  // Copy all pending provider IDs
  const copyAllPendingIds = () => {
    const pending = warrantyRecordsWithStatus.filter(
      (r) => r.status === "en_espera" || r.status === "reclamado_nuevamente"
    );
    if (pending.length === 0) {
      alert("No hay IDs pendientes de garantía actualmente.");
      return;
    }
    const allIds = pending.map((r) => r.providerOrderId).join(", ");
    copyToClipboard(allIds, undefined, `¡Copiados ${pending.length} IDs pendientes al portapapeles!`);
  };

  // Copy all active client warranty IDs
  const copyAllActiveClientIds = () => {
    const ids = activeUnexpiredClientWarrantyItems.map((i) => i.orderId);
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      alert("No hay IDs en garantía activa de clientes actualmente.");
      return;
    }
    copyToClipboard(
      uniqueIds.join(", "),
      undefined,
      `¡Copiados ${uniqueIds.length} IDs de pedidos en garantía activa!`
    );
  };

  return (
    <div className={`max-w-7xl mx-auto px-4 sm:px-6 space-y-6 pb-12 transition-colors duration-200 ${isDarkMode ? "text-slate-100" : "text-gray-900"}`}>
      {/* Toast feedback */}
      {copySuccessMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900 dark:bg-slate-800 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce border border-gray-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{copySuccessMsg}</span>
        </div>
      )}

      {/* Main Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border shadow-sm transition ${
        isDarkMode ? "bg-slate-800/90 border-slate-700" : "bg-white border-gray-200"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
            isDarkMode ? "bg-indigo-950/60 border-indigo-800 text-indigo-400" : "bg-indigo-50 border-indigo-100 text-indigo-600"
          }`}>
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className={`text-lg font-bold tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Garantías con Proveedor
            </h1>
            <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
              Seguimiento de reposiciones con límite estándar de 48 horas y consulta de IDs vigentes.
            </p>
          </div>
        </div>

        <button
          id="btn-new-warranty-claim"
          onClick={() => handleOpenNewModal()}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl font-bold text-xs transition shadow-sm cursor-pointer shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>+ Registrar Envío (Buscar Factura)</span>
        </button>
      </div>

      {/* Overdue Alert Banner (Only when there are overdue items) */}
      {countOverdue > 0 && (
        <div className={`p-3.5 px-4 rounded-xl border flex items-center justify-between gap-3 text-xs transition ${
          isDarkMode
            ? "bg-red-950/60 border-red-800/80 text-red-200"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span>
              Tienes <strong className="font-black text-red-500">{countOverdue}</strong> pedido(s) que superaron las 48 horas de espera con el proveedor.
            </span>
          </div>
          <button
            onClick={() => {
              setActiveSubTab("tracking");
              setStatusFilter("overdue");
            }}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-[11px] shrink-0 cursor-pointer transition"
          >
            Ver retrasados
          </button>
        </div>
      )}

      {/* Unified Toolbar: Tabs, Filters & Search */}
      <div className={`p-3.5 rounded-2xl border shadow-sm space-y-3 transition ${
        isDarkMode ? "bg-slate-800/90 border-slate-700" : "bg-white border-gray-200"
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Tabs */}
          <div className={`flex items-center gap-1 p-1 rounded-xl flex-wrap ${
            isDarkMode ? "bg-slate-900/90" : "bg-gray-100"
          }`}>
            <button
              onClick={() => setActiveSubTab("tracking")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeSubTab === "tracking"
                  ? isDarkMode ? "bg-slate-700 text-white shadow-xs" : "bg-white text-gray-900 shadow-xs"
                  : isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reclamos en Espera ({activeSupplierWarranties.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab("active_ids")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeSubTab === "active_ids"
                  ? isDarkMode ? "bg-slate-700 text-white shadow-xs" : "bg-white text-gray-900 shadow-xs"
                  : isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>IDs en Cobertura ({activeUnexpiredClientWarrantyItems.length})</span>
            </button>
          </div>

          {/* Quick Copy */}
          <div className="flex items-center gap-2 shrink-0">
            {activeSubTab === "tracking" ? (
              <button
                onClick={copyAllPendingIds}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border ${
                  isDarkMode
                    ? "bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
                    : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
                }`}
                title="Copiar todos los IDs pendientes"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-400" />
                <span>Copiar IDs Pendientes</span>
              </button>
            ) : (
              <button
                onClick={copyAllActiveClientIds}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer border ${
                  isDarkMode
                    ? "bg-indigo-950/60 hover:bg-indigo-900/80 border-indigo-800 text-indigo-300"
                    : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                }`}
                title="Copiar todos los IDs activos"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-400" />
                <span>Copiar IDs Activos</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Status Filters */}
        <div className={`flex flex-col sm:flex-row items-center gap-2.5 pt-2.5 border-t ${
          isDarkMode ? "border-slate-700" : "border-gray-100"
        }`}>
          <div className="relative flex-1 w-full">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`} />
            <input
              type="text"
              placeholder="Buscar por # de factura, ID de proveedor, cliente o servicio..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9.5 pr-8 py-2 border rounded-xl text-xs outline-none transition focus:ring-2 focus:ring-indigo-500 ${
                isDarkMode
                  ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500"
                  : "bg-gray-50/50 border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white"
              }`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {activeSubTab === "tracking" && (
            <div className="flex items-center gap-1 shrink-0 overflow-x-auto w-full sm:w-auto">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statusFilter === "all"
                    ? isDarkMode ? "bg-white text-gray-900" : "bg-gray-900 text-white"
                    : isDarkMode ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Todos ({warrantyRecordsWithStatus.length})
              </button>
              <button
                onClick={() => setStatusFilter("overdue")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                  statusFilter === "overdue"
                    ? "bg-red-600 text-white"
                    : isDarkMode
                    ? "bg-red-950/60 text-red-300 border border-red-800 hover:bg-red-900/80"
                    : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Excedieron 48h ({countOverdue})</span>
              </button>
              <button
                onClick={() => setStatusFilter("pending")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statusFilter === "pending"
                    ? "bg-blue-600 text-white"
                    : isDarkMode
                    ? "bg-blue-950/60 text-blue-300 border border-blue-800 hover:bg-blue-900/80"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                En tiempo ({countPending})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* VIEW: 1. TRACKING RECORDS WITH 48H TIME COUNTERS */}
      {activeSubTab === "tracking" && (
        <div className="space-y-4">
          {filteredTrackingRecords.length === 0 ? (
            <div className={`rounded-2xl border p-12 text-center shadow-sm transition ${
              isDarkMode ? "bg-slate-800/90 border-slate-700" : "bg-white border-gray-200"
            }`}>
              <ShieldCheck className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-slate-600" : "text-gray-300"}`} />
              <h3 className={`text-base font-bold ${isDarkMode ? "text-white" : "text-gray-800"}`}>
                {searchTerm
                  ? "No se encontraron envíos a garantía con esa búsqueda"
                  : statusFilter === "overdue"
                  ? "¡Excelente! No hay reclamos con más de 48 horas de espera"
                  : "No hay envíos a garantía pendientes actualmente"}
              </h3>
              <p className={`text-xs max-w-md mx-auto mt-1 mb-5 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                {searchTerm
                  ? "Prueba buscando por otro número de factura, ID de pedido o nombre de cliente."
                  : "Registra los IDs que envías al proveedor para controlar el límite de 48h."}
              </p>
              <button
                onClick={() => handleOpenNewModal()}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Registrar Envío (Buscar Factura)</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTrackingRecords.map((record) => {
                const isOverdue = record.timeInfo.isOverdue;

                return (
                  <div
                    key={record.id}
                    className={`rounded-2xl border shadow-sm transition hover:shadow-md flex flex-col justify-between overflow-hidden relative ${
                      isOverdue
                        ? isDarkMode
                          ? "bg-red-950/30 border-red-800 ring-1 ring-red-700"
                          : "border-red-300 ring-1 ring-red-300 bg-red-50/20"
                        : isDarkMode
                        ? "bg-slate-800/95 border-slate-700"
                        : "bg-white border-gray-200"
                    }`}
                  >
                    {/* Header Card Status */}
                    <div className="p-4 space-y-3">
                      {/* Top row: Status Badge + Factura Number + Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold border ${record.timeInfo.badgeBg}`}
                            >
                              {record.timeInfo.statusLabel}
                            </span>
                            {/* Prominent Factura Number */}
                            {record.receiptConsecutive ? (
                              <button
                                onClick={() => {
                                  const r = receipts.find((rec) => rec.id === record.receiptId);
                                  if (r && onSelectReceipt) onSelectReceipt(r);
                                }}
                                className={`font-mono font-black text-[11px] px-2 py-0.5 rounded-md border flex items-center gap-1 cursor-pointer transition hover:underline ${
                                  isDarkMode
                                    ? "bg-indigo-950/80 text-indigo-300 border-indigo-800 hover:bg-indigo-900/80"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                                }`}
                                title="Ver comprobante original"
                              >
                                <FileText className="w-3 h-3 text-indigo-500" />
                                <span>Factura #{String(record.receiptConsecutive).padStart(4, "0")}</span>
                              </button>
                            ) : (
                              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                                isDarkMode ? "bg-slate-900 text-slate-500 border-slate-800" : "bg-gray-100 text-gray-400 border-gray-200"
                              }`}>
                                Sin factura
                              </span>
                            )}
                          </div>
                          <div className={`text-[10px] ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                            Límite: <strong className={isDarkMode ? "text-slate-200" : "text-gray-700"}>48 horas</strong>
                          </div>
                        </div>

                        {/* Actions menu */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleOpenEditModal(record)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isDarkMode ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            }`}
                            title="Editar datos"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteWarranty(record.id, e)}
                            className={`p-1.5 rounded-lg transition cursor-pointer ${
                              isDarkMode ? "text-slate-400 hover:text-red-400 hover:bg-red-950/50" : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                            }`}
                            title="Eliminar registro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Main IDs Block */}
                      <div className={`border rounded-xl p-3 space-y-1 ${
                        isDarkMode ? "bg-slate-900/90 border-slate-700" : "bg-gray-50 border-gray-200"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${
                            isDarkMode ? "text-slate-400" : "text-gray-400"
                          }`}>
                            ID(s) del Proveedor
                          </span>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                record.providerOrderId,
                                record.id,
                                `¡ID(s) ${record.providerOrderId} copiado(s)!`
                              )
                            }
                            className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                          >
                            {copiedId === record.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400">Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar ID</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className={`font-mono font-black text-sm tracking-tight break-all ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}>
                          {record.providerOrderId}
                        </div>
                      </div>

                      {/* Order and Client Information */}
                      <div className={`space-y-1.5 text-xs pt-1 ${isDarkMode ? "text-slate-300" : "text-gray-600"}`}>
                        <div className="flex items-center justify-between">
                          <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Cliente:</span>
                          <span className={`font-bold truncate ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>{record.clientName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Servicio:</span>
                          <span className={`font-semibold truncate ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                            {record.serviceName} {record.quantity ? `(${record.quantity.toLocaleString()} un.)` : ""}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Enviado:</span>
                          <span className={`font-semibold ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                            {new Date(record.sentDate).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true
                            })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Motivo:</span>
                          <span className={`font-medium px-1.5 py-0.2 rounded border text-[10px] ${
                            isDarkMode
                              ? "bg-amber-950/60 text-amber-300 border-amber-800"
                              : "text-amber-800 bg-amber-50 border-amber-150"
                          }`}>
                            {record.reason || "Caída / Drop"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer: 1-Click Direct Resolve (eliminates record) */}
                    <div className={`p-3 border-t transition ${
                      isDarkMode ? "bg-slate-900/60 border-slate-700" : "bg-gray-50 border-gray-100"
                    }`}>
                      <button
                        onClick={() => handleQuickResolve(record)}
                        className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        title="Marcar como resuelto (eliminar de la lista para no congestionar)"
                      >
                        <Check className="w-4 h-4" />
                        <span>Resuelto</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW: 2. ALL ACTIVE CLIENT IDS TABLE */}
      {activeSubTab === "active_ids" && (
        <div className="space-y-4">
          <div className={`border rounded-2xl p-4 flex items-start gap-3 transition ${
            isDarkMode ? "bg-emerald-950/40 border-emerald-800" : "bg-emerald-50 border-emerald-200"
          }`}>
            <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <h3 className={`text-xs font-bold ${isDarkMode ? "text-emerald-300" : "text-emerald-900"}`}>
                Todos los IDs de Pedidos con Garantía Activa ({filteredClientWarrantyItems.length})
              </h3>
              <p className={`text-[11px] mt-0.5 ${isDarkMode ? "text-emerald-400" : "text-emerald-700"}`}>
                Consolidado de IDs de proveedores emitidos en facturas con menos de 30 días. Haz clic en "⚡ Enviar a Garantía" para iniciar el cronómetro de 48 horas.
              </p>
            </div>
          </div>

          {filteredClientWarrantyItems.length === 0 ? (
            <div className={`rounded-2xl border p-12 text-center shadow-sm transition ${
              isDarkMode ? "bg-slate-800/90 border-slate-700" : "bg-white border-gray-200"
            }`}>
              <ShieldAlert className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-slate-600" : "text-gray-300"}`} />
              <h3 className={`text-base font-bold ${isDarkMode ? "text-white" : "text-gray-800"}`}>
                No se encontraron IDs de pedidos con esa búsqueda
              </h3>
              <p className={`text-xs max-w-md mx-auto mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                Verifica el término ingresado en el buscador o emite nuevos comprobantes.
              </p>
            </div>
          ) : (
            <div className={`rounded-2xl border shadow-sm overflow-hidden transition ${
              isDarkMode ? "bg-slate-800/90 border-slate-700" : "bg-white border-gray-200"
            }`}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                      isDarkMode
                        ? "bg-slate-900/90 border-slate-700 text-slate-400"
                        : "bg-gray-50/80 border-gray-200 text-gray-500"
                    }`}>
                      <th className="py-3 px-4">ID Proveedor</th>
                      <th className="py-3 px-4">Factura</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Servicio</th>
                      <th className="py-3 px-4 text-center">Garantía Cliente</th>
                      <th className="py-3 px-4 text-center">Estado Proveedor</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? "divide-slate-700" : "divide-gray-150"}`}>
                    {filteredClientWarrantyItems.map((item, index) => {
                      const tracking = item.trackingRecord;

                      return (
                        <tr key={index} className={`transition ${
                          isDarkMode ? "hover:bg-slate-700/50" : "hover:bg-indigo-50/30"
                        }`}>
                          {/* ID Proveedor */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-mono font-black text-sm px-2 py-0.5 rounded border ${
                                isDarkMode
                                  ? "bg-slate-900 text-white border-slate-700"
                                  : "bg-gray-100 text-gray-900 border-gray-200"
                              }`}>
                                {item.orderId}
                              </span>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    item.orderId,
                                    `active-${index}`,
                                    `¡ID ${item.orderId} copiado!`
                                  )
                                }
                                className="text-gray-400 hover:text-indigo-400 p-1 cursor-pointer"
                                title="Copiar ID"
                              >
                                {copiedId === `active-${index}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Factura */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => onSelectReceipt?.(item.receipt)}
                              className="font-mono font-bold text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              <span>#{String(item.receipt.consecutive).padStart(4, "0")}</span>
                            </button>
                          </td>

                          {/* Cliente */}
                          <td className="py-3 px-4">
                            <div className={`font-semibold ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>{item.receipt.clientName}</div>
                          </td>

                          {/* Servicio */}
                          <td className="py-3 px-4">
                            <div className={`font-medium ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                              {item.socialNetworkName} - {item.serviceName}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono">
                              {item.quantity ? `${item.quantity.toLocaleString()} un.` : ""}
                            </div>
                          </td>

                          {/* Cobertura Cliente */}
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                item.isExpired
                                  ? isDarkMode
                                    ? "bg-rose-950/60 text-rose-300 border-rose-800"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                                  : item.daysRemaining <= 5
                                  ? isDarkMode
                                    ? "bg-amber-950/60 text-amber-300 border-amber-800"
                                    : "bg-amber-50 text-amber-800 border-amber-200"
                                  : isDarkMode
                                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              }`}
                            >
                              {item.isExpired ? "Vencida" : `${item.daysRemaining} d restantes`}
                            </span>
                          </td>

                          {/* Estado con Proveedor */}
                          <td className="py-3 px-4 text-center">
                            {tracking ? (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  isDarkMode
                                    ? "bg-blue-950/80 text-blue-300 border-blue-800 animate-pulse"
                                    : "bg-blue-50 text-blue-700 border-blue-200 animate-pulse"
                                }`}
                              >
                                ⏳ En Cronómetro (48h)
                              </span>
                            ) : item.isInWarrantyStatus ? (
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                isDarkMode
                                  ? "bg-amber-950/80 text-amber-300 border-amber-800"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              }`}>
                                🟡 En Garantía
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400 italic">No enviado</span>
                            )}
                          </td>

                          {/* Acción */}
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenNewModal(item.receipt, item.orderId)}
                              className={`px-2.5 py-1.5 border rounded-lg text-xs font-bold transition flex items-center gap-1 ml-auto cursor-pointer ${
                                isDarkMode
                                  ? "bg-indigo-950/60 hover:bg-indigo-900 border-indigo-800 text-indigo-300"
                                  : "bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                              }`}
                            >
                              <Zap className="w-3 h-3 text-indigo-400" />
                              <span>Enviar a Garantía (48h)</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ULTRA-SIMPLIFIED MODAL: BUSCAR FACTURA Y TACHAR IDS */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className={`rounded-2xl max-w-lg w-full p-6 shadow-2xl border relative my-8 animate-fade-in transition ${
            isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
          }`}>
            {/* Modal Header */}
            <div className={`flex items-center justify-between pb-4 border-b ${
              isDarkMode ? "border-slate-700" : "border-gray-100"
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isDarkMode ? "bg-indigo-950 text-indigo-300 border border-indigo-800" : "bg-indigo-50 text-indigo-600"
                }`}>
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`text-base font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                    {editingRecord ? "Editar Envío a Garantía" : "Registrar Envío a Garantía"}
                  </h3>
                  <p className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                    Busca la factura y tacha los IDs a reclamar (Plazo: <strong>48 horas</strong>).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-1.5 rounded-lg cursor-pointer transition ${
                  isDarkMode ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSimplifiedWarranty} className="space-y-4 pt-4">
              {/* PASO 1: BUSCADOR DE FACTURA */}
              {!editingRecord && (
                <div className="space-y-2">
                  <label className={`block text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                    1. Buscar Factura / Comprobante
                  </label>
                  <div className="relative">
                    <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`} />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Escribe el # de Factura (ej: 45) o nombre del cliente..."
                      value={invoiceSearchQuery}
                      onChange={(e) => {
                        setInvoiceSearchQuery(e.target.value);
                      }}
                      className={`w-full pl-9.5 pr-4 py-2.5 border rounded-xl text-xs font-medium outline-none transition focus:ring-2 focus:ring-indigo-500 ${
                        isDarkMode
                          ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500"
                          : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:bg-white"
                      }`}
                    />
                  </div>

                  {/* Search Results list if no invoice selected yet or searching */}
                  {(!selectedInvoice || invoiceSearchQuery.trim() !== "") && (
                    <div className={`max-h-44 overflow-y-auto border rounded-xl divide-y ${
                      isDarkMode
                        ? "border-slate-700 divide-slate-700 bg-slate-900"
                        : "border-gray-150 divide-gray-100 bg-white"
                    }`}>
                      {modalInvoiceSearchResults.length === 0 ? (
                        <div className="p-3 text-center text-xs text-gray-400">
                          No se encontraron facturas con ese número o nombre.
                        </div>
                      ) : (
                        modalInvoiceSearchResults.map((r) => {
                          const isPicked = selectedInvoice?.id === r.id;
                          const idsCount = r.services.reduce((acc, s) => {
                            if (s.orderIds) return acc + s.orderIds.length;
                            return acc + (s.orderId ? 1 : 0);
                          }, 0);

                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                handleSelectInvoiceInModal(r);
                                setInvoiceSearchQuery("");
                              }}
                              className={`w-full text-left p-2.5 transition flex items-center justify-between gap-2 text-xs cursor-pointer ${
                                isPicked
                                  ? isDarkMode
                                    ? "bg-indigo-950/80 text-white font-bold border-l-4 border-indigo-500"
                                    : "bg-indigo-50 text-indigo-900 font-bold border-l-4 border-indigo-600"
                                  : isDarkMode
                                  ? "hover:bg-slate-800 text-slate-300"
                                  : "hover:bg-gray-50 text-gray-800"
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-indigo-400">
                                    #{String(r.consecutive).padStart(4, "0")}
                                  </span>
                                  <span className="font-bold">{r.clientName}</span>
                                </div>
                                <div className={`text-[10px] mt-0.5 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                                  {r.services[0]?.serviceName || "Servicio"} • {idsCount} ID(s) de proveedor
                                </div>
                              </div>
                              <span className="text-[10px] text-indigo-400 font-bold shrink-0">
                                {isPicked ? "✓ Seleccionado" : "Seleccionar"}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* PASO 2: TACHA / SELECCIONA LOS IDS */}
              {selectedInvoice && (
                <div className={`border rounded-xl p-3.5 space-y-3 transition ${
                  isDarkMode
                    ? "bg-indigo-950/30 border-indigo-800/80"
                    : "bg-indigo-50/40 border-indigo-150"
                }`}>
                  <div className={`flex items-center justify-between border-b pb-2 ${
                    isDarkMode ? "border-indigo-800/60" : "border-indigo-100"
                  }`}>
                    <div>
                      <div className={`text-xs font-bold flex items-center gap-2 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}>
                        <span>Factura #{String(selectedInvoice.consecutive).padStart(4, "0")}</span>
                        <span className="text-gray-400">•</span>
                        <span>{selectedInvoice.clientName}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedInvoice(null);
                        setSelectedOrderIds([]);
                      }}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      Cambiar Factura
                    </button>
                  </div>

                  {/* List of checkable IDs */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className={`text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                        2. Tacha o Marca los IDs que vas a reclamar:
                      </label>
                      {selectedInvoiceOrderIds.length > 1 && (
                        <button
                          type="button"
                          onClick={handleToggleSelectAllIds}
                          className="text-[10px] font-bold text-indigo-400 hover:underline cursor-pointer"
                        >
                          {selectedOrderIds.length === selectedInvoiceOrderIds.length
                            ? "Desmarcar Todos"
                            : "Marcar Todos"}
                        </button>
                      )}
                    </div>

                    {selectedInvoiceOrderIds.length === 0 ? (
                      <div className={`p-3 rounded-lg border text-xs space-y-2 ${
                        isDarkMode ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-gray-200 text-gray-500"
                      }`}>
                        <p className={`text-[11px] ${isDarkMode ? "text-amber-300" : "text-amber-800"}`}>
                          Esta factura no tenía IDs guardados. Escribe el ID del proveedor manualmente:
                        </p>
                        <input
                          type="text"
                          placeholder="Ej: 8940291, 8940292"
                          value={manualOrderIdInput}
                          onChange={(e) => setManualOrderIdInput(e.target.value)}
                          className={`w-full px-3 py-2 border rounded-lg text-xs font-mono font-bold outline-none ${
                            isDarkMode
                              ? "bg-slate-800 border-slate-600 text-white"
                              : "bg-gray-50 border-gray-200 text-gray-900"
                          }`}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {selectedInvoiceOrderIds.map((item, idx) => {
                          const isChecked = selectedOrderIds.includes(item.id);

                          return (
                            <div
                              key={idx}
                              onClick={() => toggleOrderIdSelection(item.id)}
                              className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition select-none ${
                                isChecked
                                  ? isDarkMode
                                    ? "bg-slate-800 border-indigo-500 ring-1 ring-indigo-500 shadow-2xs"
                                    : "bg-white border-indigo-300 ring-1 ring-indigo-300 shadow-2xs"
                                  : isDarkMode
                                  ? "bg-slate-900/60 border-slate-800 hover:border-slate-700 opacity-40 line-through"
                                  : "bg-white/60 border-gray-200 hover:border-gray-300 opacity-60 line-through"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                                )}
                                <div>
                                  <div className={`font-mono text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                                    ID: {item.id}
                                  </div>
                                  <div className={`text-[10px] ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                                    {item.serviceName} ({item.quantity.toLocaleString()} un.)
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                  isChecked
                                    ? isDarkMode
                                      ? "bg-indigo-950 text-indigo-300 border border-indigo-800"
                                      : "bg-indigo-50 text-indigo-700 border border-indigo-150"
                                    : isDarkMode
                                    ? "bg-slate-800 text-slate-500"
                                    : "bg-gray-100 text-gray-400"
                                }`}
                              >
                                {isChecked ? "✓ A Garantía" : "Tachado / No incluir"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Si no seleccionó factura, opción manual sencilla de IDs */}
              {!selectedInvoice && (
                <div className="space-y-1.5 pt-1">
                  <label className={`block text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
                    O escribe el/los ID(s) del Proveedor Directamente:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 1049281, 1049282"
                    value={manualOrderIdInput}
                    onChange={(e) => setManualOrderIdInput(e.target.value)}
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDarkMode
                        ? "bg-slate-900 border-slate-700 text-white"
                        : "bg-gray-50 border-gray-200 text-gray-900 focus:bg-white"
                    }`}
                  />
                  <p className={`text-[10px] ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
                    Puedes separar varios IDs por comas o espacios.
                  </p>
                </div>
              )}

              {/* Motivo */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
                    Motivo del Reclamo:
                  </label>
                  {activeModalServiceName && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border max-w-[200px] truncate ${
                      isDarkMode
                        ? "text-indigo-300 bg-indigo-950/80 border-indigo-800"
                        : "text-indigo-700 bg-indigo-50 border-indigo-100"
                    }`} title={activeModalServiceName}>
                      {activeModalServiceName}
                    </span>
                  )}
                </div>
                <select
                  value={contextualReasons.includes(formReason) ? formReason : "Otro motivo (Escribir personalizado)"}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "Otro motivo (Escribir personalizado)") {
                      setFormReason(customReasonInput || "Otro motivo");
                    } else {
                      setFormReason(val);
                    }
                  }}
                  className={`w-full px-3 py-2 border rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500 ${
                    isDarkMode
                      ? "bg-slate-900 border-slate-700 text-white"
                      : "bg-gray-50 border-gray-200 text-gray-900 focus:bg-white"
                  }`}
                >
                  {contextualReasons.map((reason, rIdx) => (
                    <option key={rIdx} value={reason} className={isDarkMode ? "bg-slate-900 text-white" : "bg-white text-gray-900"}>
                      {reason}
                    </option>
                  ))}
                </select>

                {(!contextualReasons.includes(formReason) || formReason === "Otro motivo (Escribir personalizado)" || formReason === "Otro motivo") && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="Escribe el motivo específico del reclamo..."
                      value={formReason === "Otro motivo (Escribir personalizado)" || formReason === "Otro motivo" ? customReasonInput : formReason}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomReasonInput(val);
                        setFormReason(val || "Otro motivo");
                      }}
                      className={`w-full px-3 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isDarkMode
                          ? "bg-slate-900 border-indigo-500 text-white"
                          : "bg-white border-indigo-300 text-gray-900"
                      }`}
                    />
                  </div>
                )}
              </div>

              {/* Fecha y Hora de Envío al Proveedor */}
              <div className={`border rounded-xl p-3 space-y-2.5 transition ${
                isDarkMode ? "bg-slate-900/70 border-slate-700" : "bg-slate-50 border-slate-200"
              }`}>
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-1.5 text-xs font-bold ${
                    isDarkMode ? "text-slate-200" : "text-slate-800"
                  }`}>
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Fecha y Hora de Envío al Proveedor</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormSentDate(getLocalDatetimeInputValue())}
                    className="text-[10px] font-bold text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                    title="Fijar con la fecha y hora de este momento"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Poner hora actual</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="datetime-local"
                    value={formSentDate}
                    onChange={(e) => setFormSentDate(e.target.value)}
                    className={`flex-1 px-3 py-1.5 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white"
                        : "bg-white border-slate-300 text-slate-800"
                    }`}
                  />
                  <div
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1.5 shrink-0 ${
                      modalTimePreview.isOverdue
                        ? isDarkMode
                          ? "bg-red-950/80 border-red-800 text-red-300"
                          : "bg-red-50 border-red-200 text-red-700"
                        : isDarkMode
                        ? "bg-indigo-950/80 border-indigo-800 text-indigo-300"
                        : "bg-indigo-50 border-indigo-200 text-indigo-800"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    <span>
                      {modalTimePreview.isOverdue
                        ? `Excedido (+${modalTimePreview.overdueHours}h)`
                        : `Plazo: ${modalTimePreview.hoursRemaining}h restantes (48h)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className={`flex items-center justify-between gap-3 pt-3 border-t ${
                isDarkMode ? "border-slate-700" : "border-gray-100"
              }`}>
                {editingRecord ? (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteWarranty(editingRecord.id, e)}
                    className={`px-3 py-2 text-xs font-bold rounded-xl transition flex items-center gap-1.5 border cursor-pointer ${
                      isDarkMode
                        ? "text-red-400 hover:bg-red-950/60 border-red-800"
                        : "text-red-600 hover:bg-red-50 border-red-200"
                    }`}
                    title="Eliminar este registro"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Registro</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className={`px-4 py-2 text-xs font-semibold transition cursor-pointer ${
                      isDarkMode ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>
                      {editingRecord
                        ? "Guardar Cambios"
                        : `⚡ Enviar ${
                            selectedOrderIds.length > 0 ? selectedOrderIds.length : ""
                          } ID(s) a Garantía (48h)`}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
