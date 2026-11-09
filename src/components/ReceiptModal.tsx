/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import { X, ShieldCheck, Edit3, Save, Trash2, ShieldAlert, Calendar, ChevronDown, ChevronUp, MessageSquare, Send, PhoneCall, ExternalLink, Bell, Plus, Check, RotateCcw, AlertCircle, Clock, Hash, RefreshCw, QrCode, Instagram, Download, Zap } from "lucide-react";
import { Receipt, ReceiptItem, ReceiptStatus, getNormalizedStatus, getItemOrderIds, getItemOrderIdDisplay, getOrderIdTypeLabel, resolveReceiptWarranty, ProviderOrderSyncResult, formatProviderStatus } from "../types";
import { motion } from "motion/react";
import { useApp } from "../context/AppContext";
import { syncOrderWithProvider, saveProviderConfig } from "../services/providerApi";
import { getCustomerTrackingUrl } from "../utils/trackingUrl";

interface ReceiptModalProps {
  receipt: Receipt;
  onClose: () => void;
  businessName: string;
  whatsapp: string;
  initialIsEditing?: boolean;
  onRepeatOrder?: (receipt: Receipt) => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receipt: rawReceipt,
  onClose,
  businessName,
  whatsapp,
  initialIsEditing = false,
  onRepeatOrder,
}) => {
  const { businessConfig, providerCredentials, updateProviderCredentials, updateReceipt, addSupplierWarranty, reopenOrResendWarrantyForCancelledOrder, syncReceiptWithProvider, getReceiptPrivateData } = useApp();
  const receiptRef = useRef<HTMLDivElement>(null);

  // Merge public receipt with private fields from receipts_private/{receiptId}
  const privateDoc = getReceiptPrivateData(rawReceipt.id);
  const receipt = useMemo<Receipt>(() => {
    if (!privateDoc) return rawReceipt;
    const privMap = new Map(
      (privateDoc.servicesPrivate || []).map((ps) => [ps.id, ps])
    );
    const mergedServices = (rawReceipt.services || []).map((srv, idx) => {
      const ps = privMap.get(srv.id) || privateDoc.servicesPrivate?.[idx];
      if (!ps) return srv;
      return {
        ...srv,
        providerCostAtPurchase: ps.providerCostAtPurchase ?? srv.providerCostAtPurchase ?? 0,
        providerCostUSD: ps.providerCostUSD ?? srv.providerCostUSD ?? null,
        providerCostCOP: ps.providerCostCOP ?? srv.providerCostCOP ?? null,
        trmUsed: ps.trmUsed ?? srv.trmUsed ?? null,
        trmDate: ps.trmDate ?? srv.trmDate ?? null,
        suggestedPrice: ps.suggestedPrice ?? srv.suggestedPrice ?? srv.chargedPrice ?? 0,
        previousOrderId: ps.previousOrderId ?? srv.previousOrderId,
        resendDate: ps.resendDate ?? srv.resendDate,
        resendNote: ps.resendNote ?? srv.resendNote,
      };
    });
    return {
      ...rawReceipt,
      clientId: privateDoc.clientId ?? rawReceipt.clientId,
      internalNotes: privateDoc.internalNotes ?? rawReceipt.internalNotes ?? "",
      totalProviderCost: privateDoc.totalProviderCost ?? rawReceipt.totalProviderCost ?? 0,
      totalProviderCostUSD: privateDoc.totalProviderCostUSD ?? rawReceipt.totalProviderCostUSD ?? null,
      totalProfit: privateDoc.totalProfit ?? rawReceipt.totalProfit ?? 0,
      trmUsed: privateDoc.trmUsed ?? rawReceipt.trmUsed ?? null,
      trmDate: privateDoc.trmDate ?? rawReceipt.trmDate ?? null,
      services: mergedServices,
    };
  }, [rawReceipt, privateDoc]);
  
  // Format utility
  const formatCOP = (val?: number | null) => "$" + Math.round(Number(val) || 0).toLocaleString("es-CO");

  // Network Emoji Helper
  const getNetworkEmoji = (networkName?: string) => {
    const net = (networkName || "").trim().toLowerCase();
    if (net.includes("instagram")) return "📸";
    if (net.includes("facebook")) return "👥";
    if (net.includes("tiktok") || net.includes("tik tok")) return "🎵";
    if (net.includes("youtube")) return "📺";
    if (net.includes("twitter") || net.includes(" x ")) return "🐦";
    if (net.includes("telegram")) return "✈️";
    if (net.includes("spotify")) return "🎵";
    return "🌐";
  };

  // Dynamic Warranty Expiration helper
  const getWarrantyInfo = () => {
    const resolved = resolveReceiptWarranty(receipt, 30);
    if (resolved.isNoWarranty) {
      return (
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
          Este servicio se entrega a conformidad <strong>sin garantía</strong>.
        </p>
      );
    }
    const days = resolved.days;
    const daysStr = resolved.warrantyText;
    
    if (days <= 0) {
      return (
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
          Este comprobante incluye una garantía de <strong>{daysStr}</strong>. 
          Válida a partir de la fecha de generación para cualquier eventualidad o reposición de servicio.
        </p>
      );
    }

    try {
      const purchaseDate = receipt.date ? new Date(receipt.date) : new Date();
      if (isNaN(purchaseDate.getTime())) {
        return (
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            Este comprobante incluye una garantía de <strong>{daysStr}</strong>.
          </p>
        );
      }
      const expirationDate = new Date(purchaseDate.getTime() + days * 24 * 60 * 60 * 1000);
      
      const formattedExpiration = expirationDate.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });

      return (
        <div className="space-y-1">
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
            Este comprobante incluye una garantía automática de <strong>{daysStr}</strong>.
          </p>
          <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-100/30 border border-indigo-100/40 px-2.5 py-1 rounded-md inline-flex items-center gap-1 mt-1 no-print">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>Garantía válida hasta el {formattedExpiration}</span>
          </div>
        </div>
      );
    } catch {
      return (
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
          Este comprobante incluye una garantía de <strong>{daysStr}</strong>. 
          Válida a partir de la fecha de generación para cualquier eventualidad o reposición de servicio.
        </p>
      );
    }
  };

  // State for Editing Mode
  const [isEditing, setIsEditing] = useState(initialIsEditing);
  const [editedClientName, setEditedClientName] = useState(receipt.clientName || "");
  const [editedClientPhone, setEditedClientPhone] = useState(receipt.clientPhone || "");
  const [editedWarranty, setEditedWarranty] = useState(resolveReceiptWarranty(receipt, 30).warrantyText);
  const [editedThankYouMessage, setEditedThankYouMessage] = useState(receipt.thankYouMessage || "");
  const [editedServices, setEditedServices] = useState<ReceiptItem[]>(receipt.services || []);
  const [editedStatus, setEditedStatus] = useState(getNormalizedStatus(receipt.status));
  const [editedInternalNotes, setEditedInternalNotes] = useState(receipt.internalNotes || "");
  const [editedTargetAccount, setEditedTargetAccount] = useState(receipt.targetAccount || "");
  const [quickTargetAccount, setQuickTargetAccount] = useState(receipt.targetAccount || "");
  const [isSavingQuickAccount, setIsSavingQuickAccount] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);
  const [pngDownloadDone, setPngDownloadDone] = useState(false);

  const handleSaveQuickTargetAccount = async () => {
    const clean = quickTargetAccount.trim();
    if (!clean) return;
    setIsSavingQuickAccount(true);
    try {
      await updateReceipt(receipt.id, {
        targetAccount: clean
      });
      receipt.targetAccount = clean;
      setEditedTargetAccount(clean);
      setResendSuccess(`¡Cuenta de Instagram ${clean} vinculada al pedido exitosamente!`);
      setTimeout(() => setResendSuccess(null), 4000);
    } catch (err: any) {
      console.error("Error saving target account:", err);
      setError("Error al vincular cuenta: " + err.message);
    } finally {
      setIsSavingQuickAccount(false);
    }
  };

  // Quick Reorder & Supplier Warranty States
  const [showReorderPanel, setShowReorderPanel] = useState(getNormalizedStatus(receipt.status) === "cancelado");
  const [reorderActionType, setReorderActionType] = useState<"reorder" | "warranty">(
    getNormalizedStatus(receipt.status) === "cancelado" ? "reorder" : "warranty"
  );
  const [newProviderIdInput, setNewProviderIdInput] = useState("");
  const [claimReasonInput, setClaimReasonInput] = useState("");
  const [warrantyResponseHours, setWarrantyResponseHours] = useState<number>(48);
  const [isSubmittingReorder, setIsSubmittingReorder] = useState(false);
  const [lastActionWhatsAppUrl, setLastActionWhatsAppUrl] = useState<string | null>(null);

  // Quick Touch-to-Edit Service ID States
  const [quickEditServiceIndex, setQuickEditServiceIndex] = useState<number | null>(null);
  const [quickNewOrderId, setQuickNewOrderId] = useState<string>("");
  const [quickReactivateStatus, setQuickReactivateStatus] = useState<ReceiptStatus>("en_proceso");
  const [quickIsResent, setQuickIsResent] = useState<boolean>(false);
  const [quickResendNote, setQuickResendNote] = useState<string>("Servicio reenviado con nuevo ID del servidor para asegurar la entrega completa.");
  const [isSavingQuickId, setIsSavingQuickId] = useState(false);
  const [quickIdSuccess, setQuickIdSuccess] = useState<string | null>(null);

  // Provider API Sync States
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isSyncingProvider, setIsSyncingProvider] = useState(false);
  const [syncResults, setSyncResults] = useState<ProviderOrderSyncResult[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncNeedsApiKey, setSyncNeedsApiKey] = useState(false);
  const [inlineApiKeyInput, setInlineApiKeyInput] = useState("");
  const [isSavingInlineKey, setIsSavingInlineKey] = useState(false);
  const [syncIsSimulated, setSyncIsSimulated] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncTargetServiceName, setSyncTargetServiceName] = useState<string | null>(null);
  const [isApplyingSync, setIsApplyingSync] = useState(false);

  // Automatic Background Provider Sync State
  const [autoSyncStatus, setAutoSyncStatus] = useState<{
    loading: boolean;
    checkedAt?: Date;
    rawStatus?: string;
    mappedStatus?: string;
    message?: string;
    updated?: boolean;
  } | null>(null);

  // Helper to reliably detect if a service was explicitly marked as resent
  const getIsItemResent = (item: ReceiptItem, _rec?: Receipt): boolean => {
    if (!item) return false;
    return Boolean(item.isResent);
  };

  // Automatic Background Sync with MazSocialMarket when opening receipt
  useEffect(() => {
    let isCancelled = false;
    const executeAutoSync = async () => {
      const numericIds = (receipt.services || [])
        .flatMap((s) => getItemOrderIds(s))
        .filter((id) => !/^PED-\d+$/i.test(id.trim()))
        .flatMap((id) => id.match(/\d{3,}/g) || []);

      if (numericIds.length === 0) return;

      setAutoSyncStatus({ loading: true });
      try {
        const res = await syncReceiptWithProvider(receipt.id);
        if (isCancelled) return;

        setAutoSyncStatus({
          loading: false,
          checkedAt: new Date(),
          rawStatus: res.rawStatus,
          mappedStatus: res.newStatus || getNormalizedStatus(receipt.status),
          message: res.message,
          updated: res.updated
        });

        if (res.newStatus) {
          setEditedStatus(res.newStatus as any);
        }
      } catch (err: any) {
        if (isCancelled) return;
        setAutoSyncStatus({
          loading: false,
          message: err.message || "Error al verificar MazSocialMarket."
        });
      }
    };

    executeAutoSync();
    return () => {
      isCancelled = true;
    };
  }, [receipt.id]);

  // Sync state with prop changes when receipt or initial mode changes
  useEffect(() => {
    setIsEditing(initialIsEditing);
    setEditedClientName(receipt.clientName || "");
    setEditedClientPhone(receipt.clientPhone || "");
    setEditedWarranty(resolveReceiptWarranty(receipt, 30).warrantyText);
    setEditedThankYouMessage(receipt.thankYouMessage || "¡Gracias por confiar en ImpulsaNet para potenciar sus redes!");
    setEditedServices(receipt.services || []);
    setEditedStatus(getNormalizedStatus(receipt.status));
    setEditedInternalNotes(receipt.internalNotes || "");
    setError(null);
  }, [receipt.id, initialIsEditing]);

  // Recalculate totals in real time while editing
  const totals = useMemo(() => {
    const items = isEditing ? editedServices : (receipt.services || []);
    const subtotal = items.reduce((acc, item) => acc + (Number(item?.suggestedPrice) || 0), 0);
    const totalCharged = items.reduce((acc, item) => acc + (Number(item?.chargedPrice) || 0), 0);
    const totalProviderCost = items.reduce((acc, item) => acc + (Number(item?.providerCostAtPurchase) || 0), 0);
    const totalProfit = totalCharged - totalProviderCost;
    return { subtotal, totalCharged, totalProviderCost, totalProfit };
  }, [isEditing, editedServices, receipt.services]);

  // Format date to local string
  const formatDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };








    


  // Standalone printable window opener (100% immune to iframe restrictions)
  const openReceiptInNewTab = (receiptData: Receipt, bName: string, totalsData: { subtotal: number; totalCharged: number }) => {
    const newWin = window.open("", "_blank");
    if (!newWin) {
      alert("Su navegador bloqueó la ventana emergente. Por favor permita ventanas emergentes (popups) para ver el comprobante.");
      return false;
    }

    const resentServices = (receiptData.services || []).filter((s) => getIsItemResent(s, receiptData));
    const hasResentServices = resentServices.length > 0;

    const itemsHtml = (receiptData.services || []).map((item) => {
      const orderIdsStr = getItemOrderIdDisplay(item);
      const isResent = getIsItemResent(item, receiptData);
      const title = item.socialNetworkName && item.socialNetworkName.toLowerCase() !== (item.serviceName || '').toLowerCase()
        ? `${item.socialNetworkName} - ${item.serviceName || ''}`
        : (item.serviceName || item.socialNetworkName || 'Servicio');

      return `
        <tr style="${isResent ? 'background-color: #fffdf5;' : ''}">
          <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">
            <div style="font-size: 13.5px; font-weight: 700; color: #0f172a;">
              ${title}
              ${isResent ? `<span style="display: inline-block; margin-left: 6px; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 5px;">🔄 REENVIADO</span>` : ''}
            </div>
            <div style="margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${orderIdsStr ? `
                <span style="font-size: 11.5px; font-weight: 700; color: #0f172a; font-family: monospace;">
                  ID: #${orderIdsStr}
                </span>
              ` : ''}
              ${isResent && item.previousOrderId && item.previousOrderId !== orderIdsStr ? `
                <span style="font-size: 10.5px; color: #94a3b8; font-family: monospace;">
                  Antiguo: <s>#${item.previousOrderId}</s>
                </span>
              ` : ''}
              ${isResent && item.resendNote ? `
                <span style="font-size: 10.5px; color: #b45309; font-style: italic;">📌 ${item.resendNote}</span>
              ` : ''}
            </div>
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #334155; font-weight: 600;">
            ${(item.quantity || 0).toLocaleString()}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #0f172a;">
            $${Math.round(item.chargedPrice || 0).toLocaleString('es-CO')} COP
          </td>
        </tr>
      `;
    }).join("");

    const formattedDateStr = formatDate(receiptData.date);
    const waLink = getWhatsAppLink("confirm");

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Comprobante #${receiptData.consecutive || ''} - ${bName || 'ImpulsaNet'}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
          body { background-color: #f8fafc; color: #0f172a; padding: 24px 16px; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
          .top-bar { display: flex; gap: 10px; margin-bottom: 24px; width: 100%; max-width: 680px; flex-wrap: wrap; justify-content: center; }
          .btn { font-size: 13px; font-weight: 700; padding: 10px 18px; border-radius: 12px; border: none; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease; }
          .btn-primary { background-color: #4f46e5; color: #ffffff; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2); }
          .btn-primary:hover { background-color: #4338ca; }
          .btn-emerald { background-color: #059669; color: #ffffff; }
          .btn-emerald:hover { background-color: #047857; }
          .btn-secondary { background-color: #ffffff; color: #334155; border: 1px solid #cbd5e1; }
          .btn-secondary:hover { background-color: #f1f5f9; }
          .receipt-card { background: #ffffff; width: 100%; max-width: 680px; border-radius: 20px; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); padding: 36px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #f1f5f9; }
          .brand-title { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
          .brand-sub { font-size: 12px; color: #64748b; font-weight: 500; margin-top: 2px; }
          .receipt-num { text-align: right; font-size: 18px; font-weight: 800; color: #4f46e5; }
          .receipt-date { font-size: 12px; color: #64748b; margin-top: 4px; }
          .client-box { background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 16px; margin: 24px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .info-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-value { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; background: #f8fafc; padding: 10px 16px; text-align: left; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; }
          .totals-box { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding-top: 16px; border-top: 2px solid #f1f5f9; }
          .total-row { display: flex; justify-content: space-between; width: 260px; font-size: 14px; color: #64748b; }
          .total-main { font-size: 20px; font-weight: 800; color: #059669; }
          .warranty-box { background: #e0e7ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 14px 18px; margin-top: 24px; display: flex; align-items: center; justify-content: space-between; color: #3730a3; font-size: 13px; font-weight: 600; }
          .footer-note { text-align: center; margin-top: 24px; font-size: 13px; font-style: italic; color: #475569; }
          @media print {
            body { background: white; padding: 0; }
            .top-bar { display: none !important; }
            .receipt-card { box-shadow: none; border: none; padding: 0; width: 100%; max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="top-bar">
          <button onclick="downloadAsPngImage(event)" class="btn btn-primary" style="background-color: #0284c7;">
            📸 Descargar Imagen PNG
          </button>
          <a href="${waLink}" target="_blank" class="btn btn-emerald">
            📱 Enviar por WhatsApp
          </a>
          <button onclick="window.close()" class="btn btn-secondary">
            ✕ Cerrar
          </button>
        </div>

        <div class="receipt-card">
          <div class="header">
            <div>
              <div class="brand-title">${bName || 'ImpulsaNet'}</div>
              <div class="brand-sub">Comprobante de Compra Electrónico</div>
            </div>
            <div>
              <div class="receipt-num">Nº #${receiptData.consecutive || ''}</div>
              <div class="receipt-date">${formattedDateStr}</div>
            </div>
          </div>

          <div class="client-box">
            <div>
              <div class="info-label">Cliente</div>
              <div class="info-value">${receiptData.clientName || 'Cliente'}</div>
            </div>
            <div>
              <div class="info-label">Teléfono / WhatsApp</div>
              <div class="info-value">${receiptData.clientPhone || 'No especificado'}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Servicio / Producto</th>
                <th style="text-align: center;">Cantidad</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="totals-box">
            <div class="total-row">
              <span>Subtotal:</span>
              <span>$${Math.round(totalsData.subtotal).toLocaleString('es-CO')} COP</span>
            </div>
            <div class="total-row total-main">
              <span>Total Pagado:</span>
              <span>$${Math.round(totalsData.totalCharged).toLocaleString('es-CO')} COP</span>
            </div>
          </div>

          <div class="warranty-box">
            <span>🛡️ Garantía Activa del Servicio:</span>
            <span>${resolveReceiptWarranty(receiptData, 30).warrantyText}</span>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 16px; margin-top: 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; text-align: left;">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #1e1b4b; display: flex; align-items: center; gap: 6px;">
                <span>📲</span> Rastreo en Vivo
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px; max-width: 360px; line-height: 1.4;">
                Escanea el código QR con tu celular para consultar el estado y avance de tu pedido en tiempo real.
              </div>
            </div>
            <div style="background: #ffffff; padding: 6px; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=2&data=${encodeURIComponent(getCustomerTrackingUrl(receiptData.id, businessConfig?.customTrackingUrl))}" alt="QR Rastreo" style="width: 64px; height: 64px; border-radius: 6px;" crossOrigin="anonymous" />
              <span style="font-size: 8px; font-weight: 700; color: #4338ca; text-transform: uppercase; margin-top: 3px; letter-spacing: 0.5px;">Escanear</span>
            </div>
          </div>

          <div class="footer-note">
            "${receiptData.thankYouMessage || '¡Gracias por su preferencia!'}"
          </div>
        </div>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script>
          function downloadAsPngImage(e) {
            const btn = e.target;
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳ Generando imagen...';
            btn.disabled = true;

            const card = document.querySelector('.receipt-card');
            if (!card) {
              btn.innerHTML = originalText;
              btn.disabled = false;
              return;
            }

            html2canvas(card, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff'
            }).then(function(canvas) {
              const link = document.createElement('a');
              link.download = 'Comprobante_${receiptData.consecutive || 'pago'}.png';
              link.href = canvas.toDataURL('image/png');
              link.click();
              btn.innerHTML = '✅ ¡Descargado!';
              setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
              }, 2000);
            }).catch(function(err) {
              console.error('Error al generar imagen:', err);
              btn.innerHTML = originalText;
              btn.disabled = false;
            });
          }
        </script>
      </body>
      </html>
    `;

    newWin.document.write(htmlContent);
    newWin.document.close();
    return true;
  };

  // Direct 1-click PNG download inside the modal without requiring a popup window
  const handleDirectDownloadPng = async () => {
    if (isDownloadingPng) return;
    setIsDownloadingPng(true);
    setError(null);

    try {
      // Load html2canvas dynamically if not yet on window
      let h2c = (window as any).html2canvas;
      if (!h2c) {
        await new Promise<void>((resolve, reject) => {
          const existingScript = document.querySelector('script[data-html2canvas="true"]') as HTMLScriptElement | null;
          if (existingScript) {
            existingScript.addEventListener("load", () => resolve());
            existingScript.addEventListener("error", () => reject(new Error("No se pudo cargar generador de imagen.")));
            return;
          }
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          script.async = true;
          script.setAttribute("data-html2canvas", "true");
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("No se pudo cargar generador de imagen."));
          document.head.appendChild(script);
        });
        h2c = (window as any).html2canvas;
      }

      if (!h2c) {
        throw new Error("El generador de imagen no está disponible.");
      }

      // Build clean offscreen receipt card so admin controls / scrollbars are never captured
      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "680px";
      container.style.background = "#ffffff";
      container.style.zIndex = "-1";

      const itemsHtml = (receipt.services || []).map((item) => {
        const orderIdsStr = getItemOrderIdDisplay(item);
        const isResent = getIsItemResent(item, receipt);
        const title = item.socialNetworkName && item.socialNetworkName.toLowerCase() !== (item.serviceName || "").toLowerCase()
          ? `${item.socialNetworkName} - ${item.serviceName || ""}`
          : (item.serviceName || item.socialNetworkName || "Servicio");

        return `
          <tr style="${isResent ? "background-color: #fffdf5;" : ""}">
            <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">
              <div style="font-size: 13.5px; font-weight: 700; color: #0f172a;">
                ${title}
                ${isResent ? `<span style="display: inline-block; margin-left: 6px; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 5px;">🔄 REENVIADO</span>` : ""}
              </div>
              <div style="margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                ${orderIdsStr ? `<span style="font-size: 11.5px; font-weight: 700; color: #0f172a; font-family: monospace;">ID: #${orderIdsStr}</span>` : ""}
                ${isResent && item.previousOrderId && item.previousOrderId !== orderIdsStr ? `<span style="font-size: 10.5px; color: #94a3b8; font-family: monospace;">Antiguo: <s>#${item.previousOrderId}</s></span>` : ""}
                ${isResent && item.resendNote ? `<span style="font-size: 10.5px; color: #b45309; font-style: italic;">📌 ${item.resendNote}</span>` : ""}
              </div>
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #334155; font-weight: 600;">
              ${(item.quantity || 0).toLocaleString()}
            </td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #0f172a;">
              $${Math.round(item.chargedPrice || 0).toLocaleString("es-CO")} COP
            </td>
          </tr>
        `;
      }).join("");

      const formattedDateStr = formatDate(receipt.date);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=2&data=${encodeURIComponent(getCustomerTrackingUrl(receipt.id, businessConfig?.customTrackingUrl))}`;

      container.innerHTML = `
        <div style="background: #ffffff; width: 680px; border-radius: 20px; border: 1px solid #e2e8f0; padding: 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid #f1f5f9;">
            <div>
              <div style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${businessName || "ImpulsaNet"}</div>
              <div style="font-size: 12px; color: #64748b; font-weight: 500; margin-top: 2px;">Comprobante de Compra Electrónico</div>
            </div>
            <div>
              <div style="text-align: right; font-size: 18px; font-weight: 800; color: #4f46e5;">Nº #${receipt.consecutive || ""}</div>
              <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${formattedDateStr}</div>
            </div>
          </div>

          <div style="background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 16px; margin: 24px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Cliente</div>
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px;">${receipt.clientName || "Cliente"}</div>
            </div>
            <div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Teléfono / WhatsApp</div>
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px;">${receipt.clientPhone || "No especificado"}</div>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr>
                <th style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; background: #f8fafc; padding: 10px 16px; text-align: left; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">Servicio / Producto</th>
                <th style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; background: #f8fafc; padding: 10px 16px; text-align: center; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">Cantidad</th>
                <th style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; background: #f8fafc; padding: 10px 16px; text-align: right; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding-top: 16px; border-top: 2px solid #f1f5f9;">
            <div style="display: flex; justify-content: space-between; width: 260px; font-size: 14px; color: #64748b;">
              <span>Subtotal:</span>
              <span>$${Math.round(totals.subtotal).toLocaleString("es-CO")} COP</span>
            </div>
            <div style="display: flex; justify-content: space-between; width: 260px; font-size: 20px; font-weight: 800; color: #059669;">
              <span>Total Pagado:</span>
              <span>$${Math.round(totals.totalCharged).toLocaleString("es-CO")} COP</span>
            </div>
          </div>

          <div style="background: #e0e7ff; border: 1px solid #c7d2fe; border-radius: 12px; padding: 14px 18px; margin-top: 24px; display: flex; align-items: center; justify-content: space-between; color: #3730a3; font-size: 13px; font-weight: 600;">
            <span>🛡️ Garantía Activa del Servicio:</span>
            <span>${resolveReceiptWarranty(receipt, 30).warrantyText}</span>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 16px; margin-top: 18px; display: flex; align-items: center; justify-content: space-between; gap: 14px; text-align: left;">
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #1e1b4b;">📲 Rastreo en Vivo</div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px; max-width: 360px; line-height: 1.4;">
                Escanea el código QR con tu celular para consultar el estado y avance de tu pedido en tiempo real.
              </div>
            </div>
            <div style="background: #ffffff; padding: 6px; border-radius: 10px; border: 1px solid #cbd5e1; display: flex; flex-direction: column; align-items: center; flex-shrink: 0;">
              <img src="${qrUrl}" alt="QR Rastreo" style="width: 64px; height: 64px; border-radius: 6px;" crossOrigin="anonymous" />
              <span style="font-size: 8px; font-weight: 700; color: #4338ca; text-transform: uppercase; margin-top: 3px; letter-spacing: 0.5px;">Escanear</span>
            </div>
          </div>

          <div style="text-align: center; margin-top: 24px; font-size: 13px; font-style: italic; color: #475569;">
            "${receipt.thankYouMessage || "¡Gracias por su preferencia!"}"
          </div>
        </div>
      `;

      document.body.appendChild(container);
      // Wait briefly for QR image to load
      const qrImg = container.querySelector("img");
      if (qrImg && !qrImg.complete) {
        await new Promise<void>((res) => {
          const t = setTimeout(res, 1200);
          qrImg.onload = () => { clearTimeout(t); res(); };
          qrImg.onerror = () => { clearTimeout(t); res(); };
        });
      }

      const cardEl = container.firstElementChild as HTMLElement;
      const canvas = await h2c(cardEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      document.body.removeChild(container);

      const link = document.createElement("a");
      link.download = `Comprobante_${receipt.consecutive || "pago"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();

      setPngDownloadDone(true);
      setTimeout(() => setPngDownloadDone(false), 2500);
    } catch (err: any) {
      console.error("Error al descargar PNG directo:", err);
      setError("No se pudo generar el PNG directo. Puede usar el botón 'Pestaña'.");
    } finally {
      setIsDownloadingPng(false);
    }
  };



  const handleSaveChanges = async () => {
    if (!editedClientName.trim()) {
      setError("El nombre del cliente no puede estar vacío.");
      return;
    }
    if (!editedClientPhone.trim()) {
      setError("El teléfono del cliente no puede estar vacío.");
      return;
    }
    if (editedServices.length === 0) {
      setError("El comprobante debe contener al menos un servicio.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const sanitizedServices = editedServices.map((s) => {
        const ids = getItemOrderIds(s);
        return {
          ...s,
          orderId: ids.join(", "),
          orderIds: ids
        };
      });

      const resolvedWarranty = resolveReceiptWarranty({
        ...receipt,
        warranty: editedWarranty.trim(),
        services: sanitizedServices
      }, 30);

      const updatedData: Partial<Receipt> = {
        clientName: editedClientName.trim(),
        clientPhone: editedClientPhone.trim(),
        warranty: resolvedWarranty.warrantyText,
        thankYouMessage: editedThankYouMessage.trim(),
        services: sanitizedServices,
        subtotal: totals.subtotal,
        totalCharged: totals.totalCharged,
        totalProviderCost: totals.totalProviderCost,
        totalProfit: totals.totalProfit,
        status: editedStatus,
        internalNotes: editedInternalNotes.trim(),
        targetAccount: editedTargetAccount.trim() || undefined,
      };

      await updateReceipt(receipt.id, updatedData);
      setIsEditing(false);
    } catch (err: any) {
      console.error("Error saving receipt:", err);
      setError(err.message || "No se pudieron guardar los cambios en Firebase.");
    } finally {
      setIsSaving(false);
    }
  };

  const getWhatsAppLink = (type: "confirm" | "warranty" | "followup" | "reordered" | "warranty_claim") => {
    let rawDigits = (receipt?.clientPhone || "").replace(/\D/g, "");
    if (rawDigits.length === 10 && !rawDigits.startsWith("57")) {
      rawDigits = "57" + rawDigits;
    }
    
    const clientFirstName = (receipt?.clientName || "Cliente").trim().split(" ")[0] || "Cliente";
    const servicesList = (receipt?.services || [])
      .filter(Boolean)
      .map((s) => {
        const title = s?.socialNetworkName && s.socialNetworkName.toLowerCase() !== (s?.serviceName || '').toLowerCase()
          ? `${s.socialNetworkName} - ${s.serviceName}`
          : (s?.serviceName || s?.socialNetworkName || 'Servicio');
        return `• ${title} (${Number(s?.quantity || 0).toLocaleString()})`;
      })
      .join("\n");
    const formattedTotal = formatCOP(totals.totalCharged);

    const activeWarrantyStr = resolveReceiptWarranty(receipt, 30).warrantyText;

    let text = "";
    if (type === "confirm") {
      text = `Hola ${clientFirstName}! 👋 Gracias por elegir ImpulsaNet.\n\n*Resumen de tu Pedido #${receipt?.consecutive || ''}:*\n${servicesList}\n\n*Total Pagado:* ${formattedTotal}\n*Garantía Activa:* ${activeWarrantyStr}\n\n¡Cualquier inquietud estamos aquí para atenderte! 🚀`;
    } else if (type === "warranty") {
      text = `Hola ${clientFirstName}! 👋 Esperamos te encuentres muy bien.\n\nTe escribimos de ImpulsaNet para recordarte que tu garantía de *${activeWarrantyStr}* para el pedido *#${receipt?.consecutive || ''}* está próxima a vencer.\n\nSi deseas renovar este servicio o potenciar tus redes con nuevos paquetes, ¡cuéntanos por aquí y te daremos un precio especial! 🎯`;
    } else if (type === "followup") {
      text = `Hola ${clientFirstName}! 👋 ¿Cómo van los resultados con tus redes tras tu pedido *#${receipt?.consecutive || ''}*?\n\nEn ImpulsaNet estamos a tu disposición para ayudarte a seguir creciendo. ¡Escríbenos si necesitas un nuevo paquete o asesoría! 📲`;
    } else if (type === "reordered") {
      text = `Hola ${clientFirstName}! 👋 Te informamos que hemos activado nuestro servidor de respaldo prioritario para tu pedido *#${receipt?.consecutive || ''}* para asegurar la entrega óptima de tus servicios.\n\nTu orden ya se encuentra en marcha nuevamente. 🚀`;
    } else if (type === "warranty_claim") {
      text = `Hola ${clientFirstName}! 👋 Tu solicitud de garantía / reposición para el pedido *#${receipt?.consecutive || ''}* ha sido radicada formalmente ante nuestro proveedor con un plazo estimado de respuesta de 24 a 48 horas.\n\nTe notificaremos apenas quede finalizada al 100%. 🛡️`;
    }

    return `https://wa.me/${rawDigits}?text=${encodeURIComponent(text)}`;
  };

  const handleExecuteReorder = async () => {
    if (!newProviderIdInput.trim()) {
      setError("Por favor ingresa el nuevo ID de orden del proveedor.");
      return;
    }
    setIsSubmittingReorder(true);
    setError(null);
    try {
      const cleanIdsList = newProviderIdInput
        .trim()
        .split(/[\s,]+/)
        .map((s) => s.replace(/^#/, "").trim())
        .filter(Boolean);
      const cleanNewId = cleanIdsList.join(", ");
      const currentServices = receipt.services || [];
      
      const updatedServices: ReceiptItem[] = currentServices.map((item) => {
        const prevRealIds = getItemOrderIds(item).filter(
          (id) => !/^PED-\d+$/i.test(id.trim()) && !cleanIdsList.includes(id.trim())
        );
        const prevIdStr = prevRealIds.length > 0 ? prevRealIds.join(", ") : item.previousOrderId;
        return {
          ...item,
          orderId: cleanNewId,
          orderIds: cleanIdsList,
          isResent: true,
          previousOrderId: prevIdStr || undefined,
          resendDate: new Date().toISOString(),
          resendNote: claimReasonInput.trim() || undefined,
        };
      });

      const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
      const noteEntry = `[${nowFormatted}] 🔄 Nuevo ID Proveedor: ${cleanNewId}${claimReasonInput.trim() ? ` (${claimReasonInput.trim()})` : ""}`;
      const updatedNotes = editedInternalNotes ? `${editedInternalNotes}\n${noteEntry}` : noteEntry;

      const patch: Partial<Receipt> = {
        status: "en_proceso",
        services: updatedServices,
        internalNotes: updatedNotes,
      };

      await updateReceipt(receipt.id, patch);
      setEditedServices(updatedServices);
      setEditedStatus("en_proceso");
      setEditedInternalNotes(updatedNotes);
      
      const waUrl = getWhatsAppLink("reordered");
      setLastActionWhatsAppUrl(waUrl);
      setResendSuccess(`¡ID actualizado a #${cleanNewId}!`);
      setNewProviderIdInput("");
      setClaimReasonInput("");
      setShowReorderPanel(false);
      setTimeout(() => setResendSuccess(null), 5000);
    } catch (err: any) {
      console.error("Error al reordenar pedido:", err);
      setError("Error al reordenar: " + (err.message || String(err)));
    } finally {
      setIsSubmittingReorder(false);
    }
  };

  const handleExecuteSupplierWarranty = async () => {
    setIsSubmittingReorder(true);
    setError(null);
    try {
      const allExistingIds = (receipt.services || []).flatMap((s) => getItemOrderIds(s));
      const targetId = newProviderIdInput.trim() || (allExistingIds.length > 0 ? allExistingIds.join(", ") : `PED-${receipt.consecutive}`);
      const finalReason = claimReasonInput.trim() || (getNormalizedStatus(receipt.status) === "cancelado" ? "Reenvío / Reapertura de garantía por cancelación de proveedor" : "Garantía de reposición / Refill solicitado");

      if (getNormalizedStatus(receipt.status) === "cancelado") {
        await reopenOrResendWarrantyForCancelledOrder({
          receiptId: receipt.id,
          newProviderOrderId: newProviderIdInput.trim() || undefined,
          reason: finalReason,
          expectedResponseHours: warrantyResponseHours,
          reactivateOrderToInProcess: true
        });
      } else {
        const cleanIdsList = targetId.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
        const sLabel = receipt.services && receipt.services[0]
          ? `${receipt.services[0].socialNetworkName} - ${receipt.services[0].serviceName}`
          : "Servicio General";

        await addSupplierWarranty({
          providerOrderId: targetId,
          providerOrderIds: cleanIdsList.length > 0 ? cleanIdsList : [targetId],
          receiptId: receipt.id,
          receiptConsecutive: receipt.consecutive,
          clientId: receipt.clientId,
          clientName: receipt.clientName,
          clientPhone: receipt.clientPhone,
          serviceName: sLabel,
          quantity: receipt.services?.[0]?.quantity,
          sentDate: new Date().toISOString(),
          expectedResponseHours: warrantyResponseHours,
          status: "en_espera",
          reason: finalReason,
          claimedAgainCount: 0,
        });

        const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
        const noteEntry = `[${nowFormatted}] 🛡️ Garantía enviada a proveedor (${warrantyResponseHours}h) - ID: ${targetId} - Motivo: ${finalReason}`;
        const updatedNotes = editedInternalNotes ? `${editedInternalNotes}\n${noteEntry}` : noteEntry;

        await updateReceipt(receipt.id, {
          status: "garantia_en_proceso",
          internalNotes: updatedNotes,
        });
        setEditedInternalNotes(updatedNotes);
      }

      setEditedStatus("garantia_en_proceso");
      const waUrl = getWhatsAppLink("warranty_claim");
      setLastActionWhatsAppUrl(waUrl);
      setResendSuccess(`¡Garantía radicada (plazo ${warrantyResponseHours}h) y pedido reactivado con trazabilidad completa!`);
      setNewProviderIdInput("");
      setClaimReasonInput("");
      setTimeout(() => setResendSuccess(null), 6000);
    } catch (err: any) {
      console.error("Error al registrar garantía:", err);
      setError("Error al registrar garantía: " + (err.message || String(err)));
    } finally {
      setIsSubmittingReorder(false);
    }
  };

  const handleOpenQuickEditService = (index: number) => {
    const service = receipt?.services?.[index];
    if (!service) return;
    setQuickEditServiceIndex(index);
    const currentRealIds = getItemOrderIds(service).filter((id) => !/^PED-\d+$/i.test(id.trim()));
    // Leave input empty so the user enters the new ID directly without mixing with the old ID
    setQuickNewOrderId("");
    const curStatus = getNormalizedStatus(receipt.status);
    setQuickReactivateStatus(curStatus === "cancelado" ? "en_proceso" : curStatus);
    setQuickIsResent(currentRealIds.length > 0 ? true : Boolean(service.isResent));
    setQuickResendNote(service.resendNote || "");
    setError(null);
  };

  const handleSaveQuickOrderId = async () => {
    if (quickEditServiceIndex === null) return;
    const targetService = receipt?.services?.[quickEditServiceIndex];
    if (!targetService) return;

    const cleanId = quickNewOrderId.trim();
    if (!cleanId) {
      setError("Por favor ingresa el nuevo ID del proveedor.");
      return;
    }

    setIsSavingQuickId(true);
    setError(null);
    try {
      const cleanIdsList = cleanId
        .split(/[\s,]+/)
        .map((s) => s.replace(/^#/, "").trim())
        .filter(Boolean);
      const prevRealIds = getItemOrderIds(targetService).filter(
        (id) => !/^PED-\d+$/i.test(id.trim()) && !cleanIdsList.includes(id.trim())
      );
      const prevId = prevRealIds.length > 0 ? prevRealIds.join(", ") : "sin ID previo";

      const updatedServices = (receipt.services || []).map((s, idx) => {
        if (idx === quickEditServiceIndex) {
          if (!quickIsResent) {
            return {
              ...s,
              orderId: cleanIdsList.join(", "),
              orderIds: cleanIdsList,
              isResent: false,
              previousOrderId: undefined,
              resendDate: undefined,
              resendNote: undefined,
            };
          }
          return {
            ...s,
            orderId: cleanIdsList.join(", "),
            orderIds: cleanIdsList,
            isResent: true,
            previousOrderId:
              prevId !== "sin ID previo" && prevId !== cleanIdsList.join(", ")
                ? prevId
                : s.previousOrderId || undefined,
            resendDate: new Date().toISOString(),
            resendNote: quickResendNote.trim() ? quickResendNote.trim() : undefined,
          };
        }
        return s;
      });

      const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
      const resentLabel = quickIsResent ? " [REENVIADO]" : "";
      const noteEntry = `[${nowFormatted}] ${quickIsResent ? "🔄" : "🔢"} Servicio "${targetService.serviceName}"${resentLabel} -> Nuevo ID: ${cleanIdsList.join(", ")}${prevId !== "sin ID previo" ? ` (antiguo: ${prevId})` : ""}${quickIsResent && quickResendNote.trim() ? ` - Nota: ${quickResendNote.trim()}` : ""}`;
      const updatedNotes = receipt.internalNotes ? `${receipt.internalNotes}\n${noteEntry}` : noteEntry;

      const patch: Partial<Receipt> = {
        services: updatedServices,
        internalNotes: updatedNotes,
        status: quickReactivateStatus as any
      };

      await updateReceipt(receipt.id, patch);
      setEditedServices(updatedServices);
      setEditedStatus(quickReactivateStatus);
      setEditedInternalNotes(updatedNotes);
      setQuickIdSuccess(`¡Servicio actualizado con ID #${cleanIdsList.join(", ")}!`);
      setQuickEditServiceIndex(null);
      setTimeout(() => setQuickIdSuccess(null), 5000);
    } catch (err: any) {
      console.error("Error al actualizar ID del servicio:", err);
      setError(err.message || "Error al actualizar el ID del proveedor.");
    } finally {
      setIsSavingQuickId(false);
    }
  };

  const handleSyncOrders = async (targetOrderIds?: string[], serviceName?: string) => {
    let rawIds: string[] = [];
    if (targetOrderIds && targetOrderIds.length > 0) {
      rawIds = targetOrderIds;
    } else {
      rawIds = (receipt.services || []).flatMap((s) => getItemOrderIds(s)).filter(Boolean);
    }

    const numericCleaned = rawIds
      .filter((id) => !/^PED-\d+$/i.test(id.trim()))
      .flatMap((id) => id.match(/\d{3,}/g) || []);

    const idsToSync = numericCleaned.length > 0
      ? Array.from(new Set(numericCleaned))
      : Array.from(new Set(rawIds.map((id) => id.replace(/^#/, "").trim()).filter(Boolean)));

    if (idsToSync.length === 0) {
      setError("No hay IDs de orden de proveedor registrados en este comprobante para sincronizar.");
      return;
    }

    setShowSyncModal(true);
    setIsSyncingProvider(true);
    setSyncError(null);
    setSyncNeedsApiKey(false);
    setSyncSuccessMsg(null);
    setSyncTargetServiceName(serviceName || null);

    try {
      const response = await syncOrderWithProvider(idsToSync, false);
      if (!response.success) {
        setSyncError(response.error || "No se pudo consultar la API del proveedor.");
        setSyncNeedsApiKey(response.configured === false);
        setSyncResults([]);
      } else {
        const results = response.results || [];
        setSyncResults(results);
        setSyncIsSimulated(Boolean(response.simulated));

        // Automatically synchronize receipt status if valid provider statuses were returned
        const foundItems = results.filter((r) => r.found);
        if (foundItems.length > 0) {
          const allCompleted = foundItems.every((r) => r.mappedStatus === "completado");
          const anyPartial = foundItems.some((r) => r.mappedStatus === "parcial");
          const anyProcessing = foundItems.some((r) => r.mappedStatus === "procesando");
          const anyInProcess = foundItems.some((r) => r.mappedStatus === "en_proceso");
          const anyCanceled = foundItems.some((r) => r.mappedStatus === "cancelado");

          let determinedStatus: ReceiptStatus = "en_proceso";
          if (allCompleted) determinedStatus = "completado";
          else if (anyPartial) determinedStatus = "parcial";
          else if (anyProcessing) determinedStatus = "procesando";
          else if (anyInProcess) determinedStatus = "en_proceso";
          else if (anyCanceled) determinedStatus = "cancelado";

          const currentNorm = getNormalizedStatus(receipt.status);
          if (determinedStatus !== currentNorm) {
            const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
            const summaryList = foundItems.map((r) => `#${r.orderId}: ${r.rawStatus}`).join(", ");
            const statusLabel =
              determinedStatus === "completado"
                ? "Completado"
                : determinedStatus === "procesando"
                ? "Procesando"
                : determinedStatus === "parcial"
                ? "Parcial"
                : determinedStatus === "cancelado"
                ? "Cancelado"
                : "En curso";
            const noteEntry = `[${nowFormatted}] 📡 Sincronización API Proveedor: ${summaryList}. Estado actualizado automáticamente a "${statusLabel}".`;
            const updatedNotes = editedInternalNotes ? `${editedInternalNotes}\n${noteEntry}` : noteEntry;

            await updateReceipt(receipt.id, {
              status: determinedStatus,
              internalNotes: updatedNotes,
            });
            setEditedStatus(determinedStatus);
            setEditedInternalNotes(updatedNotes);
            setSyncSuccessMsg(`¡Estado actualizado automáticamente a "${statusLabel}" según el proveedor!`);
          }
        }
      }
    } catch (err: any) {
      setSyncError(err.message || "Error al sincronizar con el proveedor.");
      setSyncResults([]);
    } finally {
      setIsSyncingProvider(false);
    }
  };

  const handleSaveInlineApiKeyAndSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineApiKeyInput.trim()) return;
    setIsSavingInlineKey(true);
    setSyncError(null);
    try {
      const targetUrl = providerCredentials.providerApiUrl || "https://mazsocialmarket.com/api/v2";
      const targetKey = inlineApiKeyInput.trim();
      const saveRes = await saveProviderConfig(targetUrl, targetKey);
      if (!saveRes.success) {
        setSyncError(saveRes.error || "No se pudo verificar la clave API con MazSocialMarket.");
        setIsSavingInlineKey(false);
        return;
      }
      await updateProviderCredentials({
        providerApiUrl: targetUrl,
        providerApiKey: targetKey,
      });
      setSyncNeedsApiKey(false);
      setInlineApiKeyInput("");
      setIsSavingInlineKey(false);
      await handleSyncOrders(undefined, syncTargetServiceName || undefined);
    } catch (err: any) {
      setSyncError(err.message || "Error al guardar la clave API.");
      setIsSavingInlineKey(false);
    }
  };

  const handleApplySyncToReceipt = async (targetStatus: "procesando" | "en_proceso" | "parcial" | "completado" | "cancelado") => {
    setIsApplyingSync(true);
    try {
      const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
      const summaryList = syncResults.map((r) => `#${r.orderId}: ${r.rawStatus}`).join(", ");
      const simTag = syncIsSimulated ? " [Simulado]" : "";
      const statusLabel =
        targetStatus === "completado"
          ? "Completado"
          : targetStatus === "procesando"
          ? "Procesando"
          : targetStatus === "parcial"
          ? "Parcial"
          : targetStatus === "cancelado"
          ? "Cancelado"
          : "En curso";
      const noteEntry = `[${nowFormatted}] 📡 Sincronización API Proveedor${simTag}: ${summaryList}. Estado actualizado a "${statusLabel}".`;
      const updatedNotes = editedInternalNotes ? `${editedInternalNotes}\n${noteEntry}` : noteEntry;

      await updateReceipt(receipt.id, {
        status: targetStatus,
        internalNotes: updatedNotes
      });

      setEditedStatus(targetStatus);
      setEditedInternalNotes(updatedNotes);
      setSyncSuccessMsg(`¡Factura actualizada a "${statusLabel}" y sincronizada con el proveedor!`);
      setTimeout(() => {
        setShowSyncModal(false);
        setSyncSuccessMsg(null);
      }, 2000);
    } catch (err: any) {
      setSyncError(err.message || "Error al aplicar el estado.");
    } finally {
      setIsApplyingSync(false);
    }
  };

  return (
    <div 
      id="receipt-modal-overlay" 
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-1 sm:p-4 overflow-hidden cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-3xl w-full h-[95dvh] sm:h-auto sm:max-h-[90vh] flex flex-col my-auto cursor-default overflow-hidden relative"
      >
          {/* Header Controls (Pinned Top No Print - Responsive Mobile First) */}
          <div className="no-print bg-white px-3 sm:px-6 py-2.5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 z-30 shrink-0 shadow-2xs">
            {/* Top Bar: Status + Consecutive Title + Quick Status Selector + Close Button for Mobile */}
            <div className="flex items-center justify-between w-full sm:w-auto gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isEditing ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse"}`}></span>
                <span className="text-xs sm:text-xs font-extrabold text-gray-900 tracking-wider uppercase truncate">
                  {isEditing ? "Editando Comprobante" : `#${receipt.consecutive || ''}`}
                </span>
                {!isEditing && (
                  <select
                    id="select-quick-modal-status"
                    value={editedStatus}
                    onChange={async (e) => {
                      const newStatus = e.target.value as ReceiptStatus;
                      setEditedStatus(newStatus);
                      try {
                        await updateReceipt(receipt.id, { status: newStatus });
                      } catch (err) {
                        console.error("Error updating status:", err);
                      }
                    }}
                    title="Cambiar estado en 1 clic"
                    className="px-2 py-1 text-[11px] font-bold rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="procesando">⚙️ Procesando</option>
                    <option value="en_proceso">🔵 En curso</option>
                    <option value="parcial">🟠 Parcial</option>
                    <option value="garantia_en_proceso">🟡 Garantía</option>
                    <option value="completado">✅ Completado</option>
                    <option value="cancelado">🔴 Cancelado</option>
                  </select>
                )}
              </div>
              <button
                id="btn-close-receipt-mobile"
                type="button"
                onClick={onClose}
                className="sm:hidden text-gray-400 hover:text-gray-700 p-1.5 hover:bg-gray-100 transition rounded-lg cursor-pointer"
                title="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Action Buttons Row */}
            <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap justify-between sm:justify-end w-full sm:w-auto shrink-0">
              {isEditing ? (
                <>
                  <button
                    id="btn-save-edited-receipt"
                    type="button"
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 transition px-3 py-2 rounded-xl shadow-2xs cursor-pointer active:scale-95 touch-manipulation"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? "Guardando..." : "Guardar"}</span>
                  </button>
                  <button
                    id="btn-cancel-edited-receipt"
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditedClientName(receipt.clientName || "");
                      setEditedClientPhone(receipt.clientPhone || "");
                      setEditedWarranty(resolveReceiptWarranty(receipt, 30).warrantyText);
                      setEditedThankYouMessage(receipt.thankYouMessage || "¡Gracias por confiar en ImpulsaNet para potenciar sus redes!");
                      setEditedServices(receipt.services || []);
                      setEditedStatus(getNormalizedStatus(receipt.status));
                      setEditedInternalNotes(receipt.internalNotes || "");
                      setError(null);
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition px-3 py-2 rounded-xl shadow-2xs cursor-pointer active:scale-95 touch-manipulation"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  {/* 1-Click Direct PNG Download */}
                  <button
                    id="btn-direct-download-png"
                    type="button"
                    disabled={isDownloadingPng}
                    onClick={handleDirectDownloadPng}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs font-bold transition px-2.5 py-2 rounded-xl shadow-2xs cursor-pointer touch-manipulation border ${
                      pngDownloadDone
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300"
                    }`}
                    title="Descargar imagen PNG del comprobante en 1 clic sin abrir otra pestaña"
                  >
                    {pngDownloadDone ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5 text-emerald-700" />}
                    <span>{isDownloadingPng ? "Generando..." : pngDownloadDone ? "¡PNG Listo!" : "PNG"}</span>
                  </button>

                  {/* 1-Click Repeat Order */}
                  {onRepeatOrder && (
                    <button
                      id="btn-modal-repeat-order"
                      type="button"
                      onClick={() => {
                        onRepeatOrder(receipt);
                        onClose();
                      }}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 transition px-2.5 py-2 rounded-xl shadow-2xs cursor-pointer touch-manipulation"
                      title="Repetir este pedido en 1 clic (carga cliente y servicios en Emitir)"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      <span>Repetir</span>
                    </button>
                  )}

                  {showCancelConfirm ? (
                    <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl animate-fade-in">
                      <span className="text-[11px] font-bold text-rose-800">¿Cancelar?</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await updateReceipt(receipt.id, { status: "cancelado" });
                            setEditedStatus("cancelado");
                            setShowCancelConfirm(false);
                          } catch (err: any) {
                            setError(err.message || "Error al cancelar pedido");
                          }
                        }}
                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-2 py-0.5 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-[10px] font-bold rounded cursor-pointer transition"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    getNormalizedStatus(receipt.status) !== "cancelado" && (
                      <button
                        id="btn-quick-cancel-receipt"
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200 transition px-2 py-2 rounded-xl cursor-pointer touch-manipulation"
                        title="Marcar pedido como cancelado"
                      >
                        <span>🔴 Cancelar</span>
                      </button>
                    )
                  )}
                  <button
                    id="btn-toggle-reorder-panel"
                    type="button"
                    onClick={() => {
                      setShowReorderPanel((prev) => !prev);
                      if (!showReorderPanel) {
                        setReorderActionType("reorder");
                        setNewProviderIdInput("");
                      }
                    }}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold transition px-2.5 py-2 rounded-xl cursor-pointer border touch-manipulation ${
                      showReorderPanel
                        ? "bg-purple-600 text-white border-purple-700 shadow-2xs"
                        : "bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200"
                    }`}
                    title="Reenviar pedido con nuevo ID o radicar garantía"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reenviar</span>
                  </button>
                  <button
                    id="btn-sync-all-provider-api"
                    type="button"
                    onClick={() => handleSyncOrders()}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition px-2.5 py-2 rounded-xl cursor-pointer touch-manipulation shadow-2xs"
                    title="Sincronizar estado de las órdenes de este comprobante con el proveedor vía API"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncingProvider ? 'animate-spin' : ''}`} />
                    <span>API</span>
                  </button>
                  <button
                    id="btn-open-receipt-new-tab"
                    type="button"
                    onClick={() => openReceiptInNewTab(receipt, businessName, totals)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-300 transition px-2.5 py-2 rounded-xl shadow-2xs cursor-pointer touch-manipulation"
                    title="Abrir en pestaña nueva para ver o imprimir"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-700" />
                    <span>Pestaña</span>
                  </button>
                  <button
                    id="btn-copy-customer-tracking-link"
                    type="button"
                    onClick={() => {
                      const trackingUrl = getCustomerTrackingUrl(receipt.id, businessConfig?.customTrackingUrl);
                      if (navigator?.clipboard?.writeText) {
                        navigator.clipboard.writeText(trackingUrl);
                        setCopiedTracking(true);
                        setTimeout(() => setCopiedTracking(false), 2500);
                      }
                    }}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold transition px-2.5 py-2 rounded-xl shadow-2xs cursor-pointer touch-manipulation border ${
                      copiedTracking
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                    }`}
                    title="Copiar enlace de rastreo en vivo para el cliente"
                  >
                    {copiedTracking ? <Check className="w-3.5 h-3.5" /> : <QrCode className="w-3.5 h-3.5 text-indigo-600" />}
                    <span>{copiedTracking ? "¡Copiado!" : "Rastreo"}</span>
                  </button>
                  <button
                    id="btn-toggle-admin-panel"
                    type="button"
                    onClick={() => setShowAdminPanel((prev) => !prev)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold transition px-2.5 py-2 rounded-xl cursor-pointer border touch-manipulation ${showAdminPanel ? "bg-amber-50 text-amber-800 border-amber-300" : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"}`}
                    title="Ver/Ocultar control interno administrativo"
                  >
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Control</span>
                    {showAdminPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  <button
                    id="btn-edit-receipt-toggle"
                    type="button"
                    onClick={() => {
                      setEditedClientName(receipt.clientName || "");
                      setEditedClientPhone(receipt.clientPhone || "");
                      setEditedWarranty(receipt.warranty || "30 días");
                      setEditedThankYouMessage(receipt.thankYouMessage || "¡Gracias por confiar en ImpulsaNet para potenciar sus redes!");
                      setEditedServices(receipt.services || []);
                      setEditedStatus(getNormalizedStatus(receipt.status));
                      setEditedInternalNotes(receipt.internalNotes || "");
                      setIsEditing(true);
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition px-2.5 py-2 rounded-xl cursor-pointer border border-indigo-200 touch-manipulation"
                    title="Editar comprobante"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                </>
              )}
              <button
                id="btn-close-receipt-desktop"
                type="button"
                onClick={onClose}
                className="hidden sm:flex text-gray-400 hover:text-gray-700 p-2 hover:bg-gray-100 transition rounded-xl cursor-pointer ml-1"
                title="Cerrar"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Panel de Control Administrativo Collapsible (Uso Interno - No se imprime) */}
          {!isEditing && showAdminPanel && (
            <div className="no-print bg-gray-50 border-b border-gray-200 p-3 sm:p-5 space-y-3 shrink-0 max-h-[220px] sm:max-h-none overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-500" />
                  <h4 className="text-xs font-bold text-gray-900">Control y Seguimiento Administrativo</h4>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-gray-500">Estado:</label>
                  <select
                    value={editedStatus}
                    onChange={async (e) => {
                      const newStatus = e.target.value as any;
                      setEditedStatus(newStatus);
                      try {
                        await updateReceipt(receipt.id, { status: newStatus });
                      } catch (err) {
                        console.error("Error updating status:", err);
                      }
                    }}
                    className="px-2 py-0.5 text-xs font-semibold rounded-md bg-white border border-gray-200 text-gray-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="procesando">⚙️ Procesando</option>
                    <option value="en_proceso">🔵 En curso</option>
                    <option value="parcial">🟠 Parcial</option>
                    <option value="garantia_en_proceso">🟡 Garantía en proceso</option>
                    <option value="completado">✅ Completado</option>
                    <option value="cancelado">🔴 Cancelado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <span className="text-gray-400 block text-[10px] font-medium">Pagado:</span>
                  <strong className="text-emerald-700 font-bold">{formatCOP(receipt.totalCharged)}</strong>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <span className="text-gray-400 block text-[10px] font-medium">Costo:</span>
                  <strong className="text-gray-700 font-semibold">{formatCOP(receipt.totalProviderCost || 0)}</strong>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <span className="text-gray-400 block text-[10px] font-medium">Ganancia:</span>
                  <strong className="text-indigo-700 font-bold">{formatCOP(receipt.totalProfit || 0)}</strong>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <span className="text-gray-400 block text-[10px] font-medium">TRM Aplicada:</span>
                  <strong className="text-emerald-800 font-bold font-mono text-[11px]">
                    {receipt.trmUsed ? `$${receipt.trmUsed.toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP` : "Histórico Manual"}
                  </strong>
                  {receipt.trmDate && (
                    <span className="text-[9px] text-gray-400 block mt-0.5">{new Date(receipt.trmDate).toLocaleDateString("es-CO")}</span>
                  )}
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                  <span className="text-gray-400 block text-[10px] font-medium">ID Interno:</span>
                  <strong className="text-gray-800 font-mono text-[10px] truncate block" title={receipt.id}>{receipt.id}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-gray-200 space-y-1">
                  <span className="text-gray-400 font-semibold uppercase text-[9px] tracking-wider block">IDs de Pedido</span>
                  <div className="flex flex-wrap gap-1">
                    {(receipt?.services || []).flatMap((s) => getItemOrderIds(s)).length === 0 ? (
                      <span className="text-gray-400 italic">Ninguno</span>
                    ) : (
                      (receipt?.services || []).flatMap((s) => getItemOrderIds(s)).map((id, index) => (
                        <span key={index} className="bg-indigo-50 text-indigo-700 font-mono font-bold text-[10px] px-1.5 py-0.5 rounded border border-indigo-100">
                          {id}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-gray-200 flex flex-col gap-1">
                  <span className="text-gray-400 font-semibold uppercase text-[9px] tracking-wider block">Notas Privadas</span>
                  <textarea
                    placeholder="Escriba notas internas..."
                    value={editedInternalNotes}
                    onChange={(e) => setEditedInternalNotes(e.target.value)}
                    onBlur={async () => {
                      try {
                        await updateReceipt(receipt.id, { internalNotes: editedInternalNotes });
                      } catch (err) {
                        console.error("Error saving notes:", err);
                      }
                    }}
                    className="w-full flex-1 p-1.5 border border-gray-200 rounded text-xs bg-gray-50 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 resize-none h-10"
                  />
                </div>
              </div>

              {/* Quick Instagram Account Linking for In-Progress Orders */}
              <div className="bg-purple-50/80 border border-purple-200 p-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white shrink-0 shadow-2xs">
                    <Instagram className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 block leading-tight">Cuenta de Instagram Vinculada:</span>
                    <span className="text-[10px] text-gray-500">Permite al cliente ver en su QR los seguidores llegando en tiempo real.</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="text"
                    placeholder="Ej: @tienda_co"
                    value={quickTargetAccount}
                    onChange={(e) => setQuickTargetAccount(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-purple-200 rounded-lg text-xs font-semibold w-36 sm:w-44 focus:ring-1 focus:ring-purple-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleSaveQuickTargetAccount}
                    disabled={isSavingQuickAccount || !quickTargetAccount.trim() || quickTargetAccount === receipt.targetAccount}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-[11px] rounded-lg transition cursor-pointer"
                  >
                    {isSavingQuickAccount ? "..." : "Vincular"}
                  </button>
                </div>
              </div>

              {/* WhatsApp Quick Templates 1-Click */}
              <div className="pt-2.5 border-t border-gray-200">
                <span className="text-gray-700 font-bold uppercase text-[10px] tracking-wider block mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Plantillas Rápidas de WhatsApp al Cliente ({receipt.clientPhone || 'Sin teléfono'})</span>
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  <a
                    href={getWhatsAppLink("confirm")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-2.5 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Confirmación Pedido</span>
                  </a>
                  <a
                    href={getWhatsAppLink("warranty")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-2.5 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Vencimiento / Garantía</span>
                  </a>
                  <a
                    href={getWhatsAppLink("followup")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-2.5 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Seguimiento Post-Venta</span>
                  </a>
                  <a
                    href={getWhatsAppLink("reordered")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs py-2 px-2.5 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Aviso Reenvío Servidor</span>
                  </a>
                  <a
                    href={getWhatsAppLink("warranty_claim")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-2.5 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Aviso Garantía (48h)</span>
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Receipt Content Area */}
          <div className="p-4 sm:p-8 md:p-12 overflow-y-auto flex-1 min-h-0 bg-white" ref={receiptRef}>
            <div className="print-container max-w-xl mx-auto space-y-8">
              
              {/* Error Alert if any */}
              {error && (
                <div className="no-print bg-red-50 border border-red-100 p-3 rounded-xl flex items-start gap-2.5 text-xs text-red-600">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success Feedback for Resend Warranty / Status Change */}
              {resendSuccess && (
                <div className="no-print bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 font-semibold animate-fade-in shadow-2xs">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resendSuccess}</span>
                </div>
              )}

              {/* Success Feedback for Quick ID update & new invoice ready */}
              {quickIdSuccess && (
                <div className="no-print bg-emerald-50 border border-emerald-300 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-emerald-900 font-semibold animate-fade-in shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{quickIdSuccess}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openReceiptInNewTab(receipt, businessName, totals)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Ver / Descargar Nueva Factura</span>
                    </button>
                    <a
                      href={getWhatsAppLink("confirm")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                    >
                      <span>📱 WhatsApp</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Panel Simplificado de Reenvío y Garantía */}
              {!isEditing && (showReorderPanel || getNormalizedStatus(receipt.status) === "cancelado") && (
                <div className={`no-print p-3.5 rounded-2xl border transition-all duration-200 shadow-2xs space-y-3 ${
                  getNormalizedStatus(receipt.status) === "cancelado"
                    ? "bg-rose-50/70 border-rose-200"
                    : "bg-purple-50/60 border-purple-200"
                }`}>
                  {/* Compact Top Bar: Tabs + Close */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setReorderActionType("reorder");
                          setNewProviderIdInput("");
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                          reorderActionType === "reorder"
                            ? "bg-purple-700 text-white shadow-2xs"
                            : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                        }`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Cambiar ID / Reenviar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReorderActionType("warranty")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                          reorderActionType === "warranty"
                            ? "bg-indigo-700 text-white shadow-2xs"
                            : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Garantía / Refill</span>
                      </button>
                    </div>

                    {getNormalizedStatus(receipt.status) !== "cancelado" && (
                      <button
                        type="button"
                        onClick={() => setShowReorderPanel(false)}
                        className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                        title="Cerrar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Tab 1: Cambiar ID / Reenviar (Direct & Compact) */}
                  {reorderActionType === "reorder" && (
                    <div className="bg-white p-3 rounded-xl border border-purple-100 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 font-medium">
                          ID actual (se reemplazará):
                        </span>
                        <span className="font-mono font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          #{receipt.services?.map(s => getItemOrderIdDisplay(s)).filter(Boolean).join(", ") || "Sin ID"}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={newProviderIdInput}
                          onChange={(e) => setNewProviderIdInput(e.target.value)}
                          placeholder="Nuevo ID de orden (ej: 1548293)"
                          className="flex-1 px-3 py-2 bg-white border-2 border-purple-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:outline-hidden focus:border-purple-600"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newProviderIdInput.trim()) {
                              e.preventDefault();
                              handleExecuteReorder();
                            }
                          }}
                        />
                        <input
                          type="text"
                          value={claimReasonInput}
                          onChange={(e) => setClaimReasonInput(e.target.value)}
                          placeholder="Nota opcional..."
                          className="sm:w-44 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-hidden focus:border-purple-600"
                        />
                        <button
                          type="button"
                          disabled={isSubmittingReorder || !newProviderIdInput.trim()}
                          onClick={handleExecuteReorder}
                          className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-300 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer active:scale-95 shrink-0 flex items-center justify-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>{isSubmittingReorder ? "Guardando..." : "Guardar Nuevo ID"}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Garantía / Refill (Direct & Compact) */}
                  {reorderActionType === "warranty" && (
                    <div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={newProviderIdInput || (receipt.services || []).flatMap(s => getItemOrderIds(s)).join(", ")}
                          onChange={(e) => setNewProviderIdInput(e.target.value)}
                          placeholder="ID a reclamar"
                          className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:outline-hidden focus:border-indigo-600"
                        />

                        <div className="flex items-center gap-1">
                          {[24, 48, 72].map((hrs) => (
                            <button
                              key={hrs}
                              type="button"
                              onClick={() => setWarrantyResponseHours(hrs)}
                              className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                                warrantyResponseHours === hrs
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              {hrs}h
                            </button>
                          ))}
                        </div>

                        <input
                          type="text"
                          value={claimReasonInput}
                          onChange={(e) => setClaimReasonInput(e.target.value)}
                          placeholder="Motivo (ej: Caída / Refill)"
                          className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-hidden focus:border-indigo-600"
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={isSubmittingReorder}
                          onClick={handleExecuteSupplierWarranty}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:bg-indigo-300 text-white font-bold text-xs rounded-xl shadow-2xs transition cursor-pointer active:scale-95"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{isSubmittingReorder ? "Radicando..." : `Radicar Garantía (${warrantyResponseHours}h)`}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {lastActionWhatsAppUrl && (
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between gap-2 animate-fade-in">
                      <span className="text-xs text-emerald-900 font-medium">Notificar al cliente:</span>
                      <a
                        href={lastActionWhatsAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>Enviar WhatsApp</span>
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Receipt Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-8">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    {businessName}
                  </h1>
                  <p className="text-xs text-gray-500 mt-1">Comprobante de Compra Electrónico</p>
                </div>
                <div className="text-left md:text-right">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Nº Comprobante
                  </div>
                  <div className="text-xl font-mono font-bold text-gray-900">
                    #{receipt.consecutive}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatDate(receipt.date)}
                  </div>
                </div>
              </div>

              {/* Client Info (Conditional View/Edit) */}
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nombre del Cliente</label>
                    <input
                      type="text"
                      value={editedClientName}
                      onChange={(e) => setEditedClientName(e.target.value)}
                      className="mt-1 block w-full px-3.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition font-medium text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Teléfono / WhatsApp</label>
                    <input
                      type="text"
                      value={editedClientPhone}
                      onChange={(e) => setEditedClientPhone(e.target.value)}
                      className="mt-1 block w-full px-3.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition font-mono text-gray-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
                      <Instagram className="w-3 h-3 text-pink-500" />
                      Perfil Instagram
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. @tienda_co"
                      value={editedTargetAccount}
                      onChange={(e) => setEditedTargetAccount(e.target.value)}
                      className="mt-1 block w-full px-3.5 py-1.5 border border-purple-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/10 focus:border-purple-500 transition font-semibold text-purple-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Estado del Pedido</label>
                    <select
                      value={editedStatus}
                      onChange={(e) => setEditedStatus(e.target.value as any)}
                      className="mt-1 block w-full px-3.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition font-semibold text-gray-900 cursor-pointer"
                    >
                      <option value="procesando">⚙️ Procesando</option>
                      <option value="en_proceso">🔵 En curso</option>
                      <option value="parcial">🟠 Parcial</option>
                      <option value="garantia_en_proceso">🟡 Garantía en proceso</option>
                      <option value="completado">✅ Completado</option>
                      <option value="cancelado">🔴 Cancelado</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Cliente
                    </div>
                    <div className="text-sm font-semibold text-gray-900 mt-0.5">
                      {receipt.clientName}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Contacto
                    </div>
                    <div className="text-sm font-mono text-gray-700 mt-0.5">
                      {receipt.clientPhone || "No especificado"}
                    </div>
                  </div>
                  {receipt.targetAccount && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Perfil Instagram
                      </div>
                      <div className="text-sm font-semibold text-purple-700 mt-0.5 truncate">
                        {receipt.targetAccount}
                      </div>
                    </div>
                  )}
                  <div className="col-span-2 md:col-span-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Estado
                      </span>
                      {autoSyncStatus?.loading ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-blue-600">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          <span>MazSocialMarket...</span>
                        </span>
                      ) : autoSyncStatus?.rawStatus ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAutoSyncStatus({ loading: true });
                            syncReceiptWithProvider(receipt.id).then((res) => {
                              setAutoSyncStatus({
                                loading: false,
                                checkedAt: new Date(),
                                rawStatus: res.rawStatus,
                                mappedStatus: res.newStatus || getNormalizedStatus(receipt.status),
                                message: res.message,
                                updated: res.updated
                              });
                              if (res.newStatus) setEditedStatus(res.newStatus as any);
                            });
                          }}
                          className="inline-flex items-center gap-1 text-[9px] font-semibold text-gray-500 hover:text-indigo-600 transition cursor-pointer"
                          title="Volver a consultar MazSocialMarket"
                        >
                          <RefreshCw className="w-2.5 h-2.5" />
                          <span>API Proveedor</span>
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-col gap-1">
                      <div>
                        {(() => {
                          const norm = getNormalizedStatus(receipt.status);
                          if (norm === "cancelado") {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300">
                                🔴 Cancelado
                              </span>
                            );
                          }
                          if (norm === "garantia_en_proceso") {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300">
                                🟡 Garantía en proceso
                              </span>
                            );
                          }
                          if (norm === "completado") {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                ✅ Completado
                              </span>
                            );
                          }
                          if (norm === "parcial") {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-orange-50 text-orange-800 border border-orange-300">
                                🟠 Parcial
                              </span>
                            );
                          }
                          if (norm === "procesando") {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-sky-50 text-sky-800 border border-sky-300">
                                ⚙️ Procesando
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-300">
                              🔵 {autoSyncStatus?.rawStatus ? formatProviderStatus(autoSyncStatus.rawStatus) : "En curso"}
                            </span>
                          );
                        })()}
                      </div>

                      {autoSyncStatus && !autoSyncStatus.loading && autoSyncStatus.rawStatus && (
                        <div className="text-[10px] text-slate-600 bg-white/90 border border-slate-200/80 rounded px-2 py-0.5 flex items-center gap-1 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                          <span className="truncate">Proveedor: <strong>{formatProviderStatus(autoSyncStatus.rawStatus)}</strong></span>
                          {autoSyncStatus.updated && (
                            <span className="text-[9px] font-sans font-bold text-emerald-700 bg-emerald-50 px-1 rounded ml-auto">
                              ¡Actualizado!
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Services Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Servicios Adquiridos
                  </div>
                  {isEditing && (
                    <span className="text-[11px] font-medium text-indigo-600">
                      Modo edición: Puedes modificar nombres, cantidades, IDs y precios
                    </span>
                  )}
                </div>



                <div className="border border-gray-100 rounded-xl overflow-hidden shadow-2xs bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/75 border-b border-gray-100">
                        <th className="py-3 px-4 text-xs font-semibold text-gray-600">Servicio y Detalles</th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-600 text-center">Cantidad</th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-600 text-right">Precio Cobrado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {isEditing ? (
                        editedServices.map((item, index) => {
                          if (!item) return null;
                          return (
                            <tr key={item.id || index} className="hover:bg-gray-50/30 transition bg-indigo-50/10">
                              <td className="py-3 px-2 sm:py-3.5 sm:px-4 space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[9px] font-bold text-gray-400 uppercase">Red Social</label>
                                    <input
                                      type="text"
                                      value={item.socialNetworkName || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const updatedVal = e.target.value;
                                        setEditedServices((prev) =>
                                          prev.map((it, idx) => (idx === index ? { ...it, socialNetworkName: updatedVal } : it))
                                        );
                                      }}
                                      className="mt-0.5 block w-full px-2.5 py-1 border border-gray-200 rounded-md text-xs font-semibold text-gray-900 bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                      placeholder="Ej: Instagram"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[9px] font-bold text-gray-400 uppercase">Servicio / Paquete</label>
                                    <input
                                      type="text"
                                      value={item.serviceName || ""}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const updatedVal = e.target.value;
                                        setEditedServices((prev) =>
                                          prev.map((it, idx) => (idx === index ? { ...it, serviceName: updatedVal } : it))
                                        );
                                      }}
                                      className="mt-0.5 block w-full px-2.5 py-1 border border-gray-200 rounded-md text-xs text-gray-800 bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                      placeholder="Ej: Seguidores Latinos"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold text-gray-400 uppercase">ID de Pedido Proveedor</label>
                                  <input
                                    type="text"
                                    value={item.orderId || ""}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => {
                                      const updatedVal = e.target.value;
                                      const cleanIds = updatedVal.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
                                      setEditedServices((prev) =>
                                        prev.map((it, idx) => (idx === index ? { ...it, orderId: updatedVal, orderIds: cleanIds } : it))
                                      );
                                    }}
                                    placeholder="Ej: 142095, 142096"
                                    className="mt-0.5 block w-full px-2.5 py-1 border border-gray-200 rounded-md text-xs font-mono bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>
                              </td>
                              <td className="py-3 px-2 sm:py-3.5 sm:px-4 text-center align-top pt-5">
                                <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1">Cantidad</label>
                                <input
                                  type="number"
                                  value={item.quantity === undefined || isNaN(item.quantity) ? "" : item.quantity}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const valStr = e.target.value;
                                    const updatedVal = valStr === "" ? 0 : parseInt(valStr, 10);
                                    setEditedServices((prev) =>
                                      prev.map((it, idx) => (idx === index ? { ...it, quantity: isNaN(updatedVal) ? 0 : updatedVal } : it))
                                    );
                                  }}
                                  className="w-20 px-2 py-1.5 border border-gray-300 rounded-md text-xs font-mono text-center font-bold text-gray-800 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="py-3 px-2 sm:py-3.5 sm:px-4 text-right align-top pt-5">
                                <div className="flex flex-col items-end gap-2">
                                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Precio ($ COP)</label>
                                  <div className="relative rounded-md w-28 sm:w-32">
                                    <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-xs text-indigo-500 font-mono font-bold">$</span>
                                    <input
                                      type="number"
                                      value={item.chargedPrice === undefined || isNaN(item.chargedPrice) ? "" : item.chargedPrice}
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => {
                                        const valStr = e.target.value;
                                        const updatedVal = valStr === "" ? 0 : parseFloat(valStr);
                                        setEditedServices((prev) =>
                                          prev.map((it, idx) => (idx === index ? { ...it, chargedPrice: isNaN(updatedVal) ? 0 : updatedVal } : it))
                                        );
                                      }}
                                      className="block w-full pl-5 pr-2 py-1.5 border-2 border-indigo-300 rounded-lg text-xs font-mono font-bold text-right text-indigo-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                      placeholder="0"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditedServices((prev) => prev.filter((_, idx) => idx !== index));
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-md transition cursor-pointer"
                                    title="Remover servicio de este comprobante"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Eliminar fila</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        (receipt?.services || []).map((item, index) => {
                          const isResent = getIsItemResent(item, receipt);
                          const resentServices = (receipt?.services || []).filter((s) => getIsItemResent(s, receipt));
                          const hasResentServices = resentServices.length > 0;
                          const orderIdsStr = getItemOrderIdDisplay(item);

                          return (
                            <tr 
                              key={item?.id || index} 
                              onClick={() => handleOpenQuickEditService(index)}
                              className={`hover:bg-indigo-50/40 transition cursor-pointer group ${
                                isResent ? "bg-amber-50/50 border-l-4 border-l-amber-500" : ""
                              }`}
                              title="Tocar este servicio para cambiar su ID de proveedor y actualizar la factura"
                            >
                              <td className="py-3 px-3 sm:py-3.5 sm:px-4">
                                <div className="font-semibold text-gray-900 flex items-center justify-between">
                                  <span className="flex items-center gap-2 flex-wrap">
                                    <span>
                                      {item?.socialNetworkName && item.socialNetworkName.toLowerCase() !== (item?.serviceName || '').toLowerCase()
                                        ? `${item.socialNetworkName} - ${item.serviceName}`
                                        : (item?.serviceName || item?.socialNetworkName || 'Servicio')}
                                    </span>
                                    {isResent && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                                        🔄 REENVIADO
                                      </span>
                                    )}
                                  </span>
                                  <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md transition border border-indigo-200">
                                    ✏️ Cambiar ID
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <span className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md border font-bold transition ${
                                    isResent
                                      ? "bg-amber-100/80 text-amber-950 border-amber-300"
                                      : getItemOrderIds(item).length > 0
                                      ? "bg-slate-50 text-slate-800 border-slate-200 group-hover:bg-indigo-50 group-hover:border-indigo-300 group-hover:text-indigo-800"
                                      : "bg-amber-50 text-amber-800 border-amber-200"
                                  }`}>
                                    <Hash className="w-3 h-3 text-indigo-500" />
                                    <span>
                                      {orderIdsStr ? `ID: ${orderIdsStr}` : "Sin ID"}
                                    </span>
                                    <span className="text-[10px] text-indigo-600 underline ml-1 font-sans font-bold">
                                      (cambiar)
                                    </span>
                                  </span>

                                  {isResent && item.previousOrderId && item.previousOrderId !== orderIdsStr && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-md">
                                      <span>Antiguo:</span>
                                      <span className="line-through">#{item.previousOrderId}</span>
                                    </span>
                                  )}

                                  {getItemOrderIds(item).length > 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSyncOrders(getItemOrderIds(item), item?.serviceName || item?.socialNetworkName);
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded-md transition shadow-2xs cursor-pointer active:scale-95"
                                      title="Consultar estado de esta orden en el proveedor vía API"
                                    >
                                      <RefreshCw className="w-2.5 h-2.5 text-blue-600" />
                                      <span>Sincronizar API</span>
                                    </button>
                                  )}

                                  {isResent && item.resendNote && (
                                    <span className="text-[10.5px] text-amber-800 italic">
                                      📌 {item.resendNote}
                                    </span>
                                  )}

                                  {getNormalizedStatus(receipt.status) === "cancelado" && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md">
                                      🔴 Cancelado - Reenviar
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-2 sm:py-3.5 sm:px-4 text-center font-mono text-gray-600">
                                {Number(item?.quantity || 0).toLocaleString()}
                              </td>
                              <td className="py-3 px-3 sm:py-3.5 sm:px-4 text-right font-mono font-medium text-gray-900">
                                {formatCOP(item?.chargedPrice)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditedServices((prev) => [
                        ...prev,
                        {
                          id: `item-${Date.now()}`,
                          serviceId: "custom",
                          serviceName: "Servicio Adicional",
                          socialNetworkId: "custom",
                          socialNetworkName: "Red Social",
                          quantity: 1000,
                          suggestedPrice: 0,
                          chargedPrice: 0,
                          providerCostAtPurchase: 0,
                          orderId: "",
                          orderIds: []
                        }
                      ]);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-dashed border-indigo-300 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Agregar otro servicio al comprobante</span>
                  </button>
                )}
              </div>

              {/* Detalle del Pedido Section */}
              {!isEditing && (
                <div className="space-y-3 pt-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <span>Detalle del Pedido</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {(receipt?.services || []).flatMap((item, itemIdx) => {
                      if (!item) return [];
                      const ids = getItemOrderIds(item);
                      
                      if (ids.length <= 1) {
                        return (
                          <div key={`single-${itemIdx}`} className="bg-gray-50/40 p-4 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{getNetworkEmoji(item?.socialNetworkName)}</span>
                              <div>
                                <div className="font-semibold text-gray-900">{item?.socialNetworkName || 'Servicio'}</div>
                                <div className="text-gray-400 text-[11px] mt-0.5">{item?.serviceName || ''}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-semibold text-gray-800">Cant: {Number(item?.quantity || 0).toLocaleString()}</div>
                              {ids[0] && (
                                <div className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-sm mt-1 border border-indigo-100/30">
                                  ID: {ids[0]}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      } else {
                        const splitQty = Math.floor(Number(item?.quantity || 0) / (ids.length || 1));
                        return ids.map((id, idIdx) => (
                          <div key={`split-${itemIdx}-${idIdx}`} className="bg-indigo-50/10 p-4 rounded-xl border border-indigo-100/30 relative overflow-hidden text-xs">
                            <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-md">
                              Registro {idIdx + 1}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{getNetworkEmoji(item?.socialNetworkName)}</span>
                                <div>
                                  <div className="font-bold text-indigo-950">{item?.socialNetworkName || 'Servicio'}</div>
                                  <div className="text-gray-400 text-[11px] mt-0.5">{item?.serviceName || ''}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono font-semibold text-gray-800">Cant: {Number(splitQty || 0).toLocaleString()}</div>
                                <div className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-sm mt-1 border border-indigo-100/30 inline-block">
                                  ID: {id}
                                </div>
                              </div>
                            </div>
                          </div>
                        ));
                      }
                    })}
                  </div>
                </div>
              )}

              {/* Totals Section */}
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <div className="w-full md:w-64 space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-mono text-gray-700">{formatCOP(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-base font-bold text-gray-900 pt-2 border-t border-gray-100">
                    <span>Total Pagado</span>
                    <span className="font-mono text-lg text-emerald-600">
                      {formatCOP(totals.totalCharged)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Terms, Warranty, and Support */}
              <div className="border-t border-gray-100 pt-6 space-y-4">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 bg-indigo-50/40 p-3.5 rounded-xl border border-indigo-100/50">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4.5 h-4.5 text-indigo-600" />
                        <label className="text-xs font-bold text-gray-800 uppercase tracking-wider">Garantía del Servicio</label>
                      </div>
                      <input
                        type="text"
                        value={editedWarranty}
                        onChange={(e) => setEditedWarranty(e.target.value)}
                        placeholder="Ej. 30 días"
                        className="mt-1 block w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition text-gray-800"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mensaje de Agradecimiento</label>
                      <textarea
                        value={editedThankYouMessage}
                        onChange={(e) => setEditedThankYouMessage(e.target.value)}
                        rows={2}
                        className="block w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition text-gray-800 resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3 bg-indigo-50/40 p-3.5 rounded-xl border border-indigo-100/50">
                      <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">Garantía del Servicio</h4>
                        {getWarrantyInfo()}
                      </div>
                    </div>
                    {/* Simplified Live Tracking QR for Customer (No text link, clean QR only) */}
                    <div className="p-3 bg-gradient-to-r from-indigo-50/60 to-slate-50/60 rounded-xl border border-indigo-100/80 flex items-center justify-between gap-3 text-left">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                          <QrCode className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span>Rastreo en Vivo</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                          Escanea este código QR con tu celular para consultar el estado y avance de tu pedido en tiempo real.
                        </p>
                      </div>
                      <div className="shrink-0 bg-white p-1.5 rounded-xl border border-indigo-200/80 shadow-2xs flex flex-col items-center">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=2&data=${encodeURIComponent(getCustomerTrackingUrl(receipt.id, businessConfig?.customTrackingUrl))}`}
                          alt="QR Rastreo en Vivo"
                          className="w-16 h-16 sm:w-18 sm:h-18 rounded-lg"
                          crossOrigin="anonymous"
                        />
                        <span className="text-[8.5px] font-bold text-indigo-600 uppercase tracking-wider mt-1">Escanear</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-1">
                        <PhoneCall className="w-3 h-3 text-indigo-500" />
                        <span>WhatsApp Soporte: {whatsapp}</span>
                      </div>
                      <span>ImpulsaNet S.A.</span>
                    </div>
                  </>
                )}
              </div>

              {/* Thank You Footer (Conditional View) */}
              {!isEditing && (
                <div className="text-center pt-2">
                  <p className="text-xs font-medium text-gray-600 italic">
                    {receipt.thankYouMessage || "¡Gracias por su preferencia!"}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1">Este es un comprobante privado para uso administrativo.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Modal: Sincronización en Vivo con Proveedor vía API */}
        {showSyncModal && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-70 flex items-center justify-center p-3 sm:p-4 animate-fade-in cursor-pointer"
            onClick={() => {
              if (!isSyncingProvider && !isApplyingSync) setShowSyncModal(false);
            }}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full p-5 sm:p-6 space-y-4 relative max-h-[90vh] overflow-y-auto cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base shadow-2xs">
                    📡
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      Sincronización con Proveedor (API)
                    </h3>
                    <p className="text-[11px] text-gray-500">
                      {syncTargetServiceName
                        ? `Servicio: ${syncTargetServiceName}`
                        : `Comprobante #${receipt.consecutive || ''}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSyncingProvider || isApplyingSync}
                  onClick={() => setShowSyncModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Success Message Banner */}
              {syncSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fade-in">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{syncSuccessMsg}</span>
                </div>
              )}

              {/* Loading State */}
              {isSyncingProvider && (
                <div className="py-8 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                  <div className="text-sm font-bold text-gray-800">
                    Consultando API del Proveedor en tiempo real...
                  </div>
                  <p className="text-xs text-gray-500">
                    Verificando el estado de la orden, conteo de inicio y progreso.
                  </p>
                </div>
              )}

              {/* Error State */}
              {!isSyncingProvider && syncError && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 text-xs">
                  <div className="flex items-center gap-2 font-bold text-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Error al consultar la API del proveedor</span>
                  </div>
                  <p className="text-rose-700 leading-relaxed">{syncError}</p>

                  {syncNeedsApiKey && (
                    <form onSubmit={handleSaveInlineApiKeyAndSync} className="pt-2 border-t border-rose-200/80 space-y-2">
                      <label className="block text-[11px] font-bold text-rose-900">
                        🔑 Pega aquí tu API Key de MazSocialMarket para conectarla permanentemente:
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="password"
                          value={inlineApiKeyInput}
                          onChange={(e) => setInlineApiKeyInput(e.target.value)}
                          placeholder="Tu clave API de MazSocialMarket..."
                          className="flex-1 px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          disabled={isSavingInlineKey || !inlineApiKeyInput.trim()}
                          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-lg text-xs transition cursor-pointer shrink-0"
                        >
                          {isSavingInlineKey ? "Conectando..." : "Guardar y Sincronizar"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Results State */}
              {!isSyncingProvider && !syncError && syncResults.length > 0 && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                      Órdenes Consultadas en el Proveedor ({syncResults.length})
                    </label>

                    {syncResults.map((res) => {
                      const isCompleted = res.mappedStatus === "completado";
                      const isCanceled = res.mappedStatus === "cancelado";
                      const isPartial = res.mappedStatus === "parcial";
                      const isProcessing = res.mappedStatus === "procesando";

                      return (
                        <div 
                          key={res.orderId}
                          className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-slate-800 text-sm flex items-center gap-1.5">
                              <Hash className="w-3.5 h-3.5 text-blue-500" />
                              <span>Orden #{res.orderId}</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${
                              isCompleted
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : isCanceled
                                ? "bg-rose-100 text-rose-800 border-rose-300"
                                : isPartial
                                ? "bg-orange-100 text-orange-800 border-orange-300"
                                : isProcessing
                                ? "bg-sky-100 text-sky-800 border-sky-300"
                                : "bg-blue-100 text-blue-800 border-blue-300"
                            }`}>
                              {formatProviderStatus(res.rawStatus)} ({res.rawStatus})
                            </span>
                          </div>

                          {res.error ? (
                            <p className="text-rose-600 text-[11px] font-medium">{res.error}</p>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/70 text-[11px]">
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase font-bold">Inicio</span>
                                <span className="font-mono font-semibold text-slate-700">
                                  {res.startCount !== null ? Number(res.startCount).toLocaleString() : "-"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase font-bold">Restante</span>
                                <span className="font-mono font-semibold text-slate-700">
                                  {res.remains !== null ? Number(res.remains).toLocaleString() : "0"}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[9px] uppercase font-bold">Cobro</span>
                                <span className="font-mono font-semibold text-slate-700">
                                  {res.charge ? `$${res.charge} ${res.currency || 'USD'}` : "-"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions to apply status to receipt */}
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    <label className="text-[11px] font-bold text-gray-700 block">
                      ¿Deseas cambiar o confirmar manualmente el estado de este comprobante?
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isApplyingSync}
                        onClick={() => handleApplySyncToReceipt("procesando")}
                        className="py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <span>⚙️ Marcar como "Procesando"</span>
                      </button>

                      <button
                        type="button"
                        disabled={isApplyingSync}
                        onClick={() => handleApplySyncToReceipt("en_proceso")}
                        className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <span>🔵 Marcar como "En curso"</span>
                      </button>

                      <button
                        type="button"
                        disabled={isApplyingSync}
                        onClick={() => handleApplySyncToReceipt("parcial")}
                        className="py-2 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <span>🟠 Marcar como "Parcial"</span>
                      </button>

                      <button
                        type="button"
                        disabled={isApplyingSync}
                        onClick={() => handleApplySyncToReceipt("completado")}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Marcar como "Completado"</span>
                      </button>

                      {syncResults.some(r => r.mappedStatus === "cancelado") && (
                        <button
                          type="button"
                          disabled={isApplyingSync}
                          onClick={() => handleApplySyncToReceipt("cancelado")}
                          className="py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                        >
                          <span>🔴 Marcar como "Cancelado"</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSyncOrders(syncResults.map(r => r.orderId), syncTargetServiceName || undefined)}
                        disabled={isSyncingProvider || isApplyingSync}
                        className="py-2 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Volver a Consultar</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowSyncModal(false)}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Rápido Simplificado: Cambiar ID / Reenviar */}
        {quickEditServiceIndex !== null && receipt?.services?.[quickEditServiceIndex] && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-60 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
            onClick={() => setQuickEditServiceIndex(null)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full p-4 sm:p-5 space-y-3.5 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-gray-900">Cambiar ID / Reenviar</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickEditServiceIndex(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Servicio & ID Actual */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800 truncate">
                  {receipt.services[quickEditServiceIndex].socialNetworkName} - {receipt.services[quickEditServiceIndex].serviceName}
                </span>
                <span className="text-slate-500 shrink-0 font-mono text-[11px]">
                  Actual: <strong className="text-slate-700">#{getItemOrderIdDisplay(receipt.services[quickEditServiceIndex]) || "Sin ID"}</strong>
                </span>
              </div>

              {/* Nuevo ID Input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-gray-700">
                  Nuevo ID (reemplazará al anterior) *
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoFocus
                    required
                    value={quickNewOrderId}
                    onChange={(e) => setQuickNewOrderId(e.target.value)}
                    placeholder="Pega el nuevo ID aquí..."
                    className="w-full pl-9 pr-3 py-2 border-2 border-indigo-200 rounded-xl text-sm font-mono font-bold text-gray-900 placeholder-gray-400 focus:outline-hidden focus:border-indigo-500 transition"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveQuickOrderId();
                      }
                    }}
                  />
                </div>
              </div>

              {/* Estado */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setQuickReactivateStatus("en_proceso")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    quickReactivateStatus === "en_proceso"
                      ? "bg-amber-500 text-white border-amber-600"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  ⏳ En proceso
                </button>
                <button
                  type="button"
                  onClick={() => setQuickReactivateStatus("completado")}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    quickReactivateStatus === "completado"
                      ? "bg-emerald-600 text-white border-emerald-700"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  ✅ Completado
                </button>
              </div>

              {/* Checkbox simple */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickIsResent}
                    onChange={(e) => setQuickIsResent(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-amber-950">
                    Marcar como reenviado
                  </span>
                </label>

                {quickIsResent && (
                  <input
                    type="text"
                    value={quickResendNote}
                    onChange={(e) => setQuickResendNote(e.target.value)}
                    placeholder="Nota opcional..."
                    className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs text-gray-800 placeholder-gray-400 focus:outline-hidden"
                  />
                )}
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setQuickEditServiceIndex(null)}
                  className="flex-1 py-2 px-3 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSavingQuickId || !quickNewOrderId.trim()}
                  onClick={handleSaveQuickOrderId}
                  className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingQuickId ? "Guardando..." : "Guardar"}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
