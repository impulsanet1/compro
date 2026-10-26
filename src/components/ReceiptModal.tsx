/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import { X, ShieldCheck, Edit3, Save, Trash2, ShieldAlert, Calendar, ChevronDown, ChevronUp, MessageSquare, Send, PhoneCall, ExternalLink, Bell, Plus, DollarSign, Layers, Check, RotateCcw, AlertCircle, Clock, Sparkles, ArrowRight, Hash, RefreshCw } from "lucide-react";
import { Receipt, ReceiptItem, getNormalizedStatus, getItemOrderIds, getItemOrderIdDisplay, getOrderIdTypeLabel, isCustomServiceCode, resolveReceiptWarranty } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "../context/AppContext";

interface ReceiptModalProps {
  receipt: Receipt;
  onClose: () => void;
  businessName: string;
  whatsapp: string;
  initialIsEditing?: boolean;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receipt,
  onClose,
  businessName,
  whatsapp,
  initialIsEditing = false,
}) => {
  const { updateReceipt, socialNetworks, services, addSupplierWarranty, reopenOrResendWarrantyForCancelledOrder } = useApp();
  const receiptRef = useRef<HTMLDivElement>(null);
  
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
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isResendingWarranty, setIsResendingWarranty] = useState(false);

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
  const [quickReactivateStatus, setQuickReactivateStatus] = useState<"en_proceso" | "completado" | "garantia_en_proceso" | "cancelado">("en_proceso");
  const [isSavingQuickId, setIsSavingQuickId] = useState(false);
  const [quickIdSuccess, setQuickIdSuccess] = useState<string | null>(null);

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

    const itemsHtml = (receiptData.services || []).map((item) => {
      const orderIdsStr = getItemOrderIdDisplay(item);
      const title = item.socialNetworkName && item.socialNetworkName.toLowerCase() !== (item.serviceName || '').toLowerCase()
        ? `${item.socialNetworkName} - ${item.serviceName || ''}`
        : (item.serviceName || item.socialNetworkName || 'Servicio');
      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">
            ${title}
            ${orderIdsStr ? `<div style="font-size: 12px; font-weight: 400; color: #64748b; margin-top: 3px;">${getOrderIdTypeLabel(orderIdsStr, item.socialNetworkId === 'custom')}: ${orderIdsStr}</div>` : ''}
          </td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; text-align: center; color: #334155; font-weight: 500;">
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
      const cleanNewId = newProviderIdInput.trim();
      const currentServices = receipt.services || [];
      
      const updatedServices: ReceiptItem[] = currentServices.map((item) => {
        const existingIds = getItemOrderIds(item);
        const combined = Array.from(new Set([cleanNewId, ...existingIds]));
        return {
          ...item,
          orderId: cleanNewId,
          orderIds: combined,
        };
      });

      const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
      const noteEntry = `[${nowFormatted}] 🔄 Reordenado con nuevo ID Proveedor: ${cleanNewId}${claimReasonInput.trim() ? ` (${claimReasonInput.trim()})` : ""}`;
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
      setResendSuccess(`¡Pedido reordenado con ID ${cleanNewId} y reactivado a 'En proceso'!`);
      setNewProviderIdInput("");
      setClaimReasonInput("");
      setTimeout(() => setResendSuccess(null), 6000);
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
    setQuickNewOrderId(getItemOrderIdDisplay(service) || "");
    const curStatus = getNormalizedStatus(receipt.status);
    setQuickReactivateStatus(curStatus === "cancelado" ? "en_proceso" : curStatus);
    setError(null);
  };

  const handleSaveQuickOrderId = async () => {
    if (quickEditServiceIndex === null) return;
    const targetService = receipt?.services?.[quickEditServiceIndex];
    if (!targetService) return;

    const cleanId = quickNewOrderId.trim();
    if (!cleanId) {
      setError("Por favor ingresa un ID válido para el proveedor.");
      return;
    }

    setIsSavingQuickId(true);
    setError(null);
    try {
      const cleanIdsList = cleanId.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      const updatedServices = (receipt.services || []).map((s, idx) => {
        if (idx === quickEditServiceIndex) {
          return {
            ...s,
            orderId: cleanId,
            orderIds: cleanIdsList.length > 0 ? cleanIdsList : [cleanId]
          };
        }
        return s;
      });

      const nowFormatted = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
      const prevId = getItemOrderIdDisplay(targetService) || "sin ID previo";
      const noteEntry = `[${nowFormatted}] 🔄 Servicio "${targetService.serviceName}" reenviado con nuevo ID Proveedor: ${cleanId} (anterior: ${prevId})`;
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
      setQuickIdSuccess(`¡Servicio actualizado con nuevo ID #${cleanId}! Nueva factura lista.`);
      setQuickEditServiceIndex(null);
      setTimeout(() => setQuickIdSuccess(null), 5000);
    } catch (err: any) {
      console.error("Error al actualizar ID del servicio:", err);
      setError(err.message || "Error al actualizar el ID del proveedor.");
    } finally {
      setIsSavingQuickId(false);
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
            {/* Top Bar: Status + Consecutive Title + Close Button for Mobile */}
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isEditing ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse"}`}></span>
                <span className="text-xs sm:text-xs font-extrabold text-gray-900 tracking-wider uppercase truncate">
                  {isEditing ? "Editando Comprobante" : `Comprobante #${receipt.consecutive || ''}`}
                </span>
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
                  {showCancelConfirm ? (
                    <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1.5 rounded-xl animate-fade-in">
                      <span className="text-[11px] font-bold text-rose-800">¿Cancelar pedido?</span>
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
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-semibold text-rose-600 bg-rose-50/70 hover:bg-rose-100/70 border border-rose-200 transition px-2.5 py-2 rounded-xl cursor-pointer touch-manipulation"
                        title="Marcar pedido como cancelado"
                      >
                        <span>🔴 Cancelar Pedido</span>
                      </button>
                    )
                  )}
                  <button
                    id="btn-toggle-reorder-panel"
                    type="button"
                    onClick={() => {
                      setShowReorderPanel((prev) => !prev);
                      if (!showReorderPanel) {
                        setReorderActionType(getNormalizedStatus(receipt.status) === "cancelado" ? "reorder" : "warranty");
                      }
                    }}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold transition px-2.5 py-2 rounded-xl cursor-pointer border touch-manipulation ${
                      showReorderPanel
                        ? "bg-purple-600 text-white border-purple-700 shadow-2xs"
                        : "bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200"
                    }`}
                    title="Reordenar con nuevo proveedor o tramitar garantía"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reenviar / Garantía</span>
                  </button>
                  <button
                    id="btn-open-receipt-new-tab"
                    type="button"
                    onClick={() => openReceiptInNewTab(receipt, businessName, totals)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs font-bold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-300 transition px-3 py-2 rounded-xl shadow-2xs cursor-pointer touch-manipulation"
                    title="Abrir en pestaña nueva para ver o compartir"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-sky-700" />
                    <span>Pestaña</span>
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
                      const newStatus = e.target.value as "en_proceso" | "completado" | "garantia_en_proceso" | "cancelado";
                      setEditedStatus(newStatus);
                      try {
                        await updateReceipt(receipt.id, { status: newStatus });
                      } catch (err) {
                        console.error("Error updating status:", err);
                      }
                    }}
                    className="px-2 py-0.5 text-xs font-semibold rounded-md bg-white border border-gray-200 text-gray-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="en_proceso">🟢 En proceso</option>
                    <option value="completado">✅ Completado</option>
                    <option value="garantia_en_proceso">🟡 Garantía en proceso</option>
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

              {/* Centro Interactivo de Reenvío de Garantías y Reorden con Nuevo Proveedor */}
              {!isEditing && (showReorderPanel || getNormalizedStatus(receipt.status) === "cancelado") && (
                <div className={`no-print p-4 sm:p-5 rounded-2xl border transition-all duration-200 shadow-sm ${
                  getNormalizedStatus(receipt.status) === "cancelado"
                    ? "bg-rose-50/70 border-rose-200"
                    : "bg-purple-50/60 border-purple-200"
                }`}>
                  {/* Panel Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-gray-200/70">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        getNormalizedStatus(receipt.status) === "cancelado"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {getNormalizedStatus(receipt.status) === "cancelado" ? (
                          <ShieldAlert className="w-4.5 h-4.5" />
                        ) : (
                          <RotateCcw className="w-4.5 h-4.5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-xs sm:text-sm text-gray-900">
                            Centro de Reenvíos y Garantías de Proveedor
                          </h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            getNormalizedStatus(receipt.status) === "cancelado"
                              ? "bg-rose-200 text-rose-900"
                              : getNormalizedStatus(receipt.status) === "garantia_en_proceso"
                              ? "bg-amber-200 text-amber-900"
                              : "bg-purple-200 text-purple-900"
                          }`}>
                            {getNormalizedStatus(receipt.status) === "cancelado" ? "Cancelado" : receipt.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-600 mt-0.5">
                          {getNormalizedStatus(receipt.status) === "cancelado"
                            ? "El proveedor canceló esta orden. Reordénala con un servidor de respaldo o tramita la garantía."
                            : "Gestiona reposiciones (Refill) o cambios de proveedor para este comprobante."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {getNormalizedStatus(receipt.status) !== "cancelado" && (
                        <button
                          type="button"
                          onClick={() => setShowReorderPanel(false)}
                          className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                          title="Cerrar panel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="flex items-center gap-1.5 pt-3 pb-3">
                    <button
                      type="button"
                      onClick={() => setReorderActionType("reorder")}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                        reorderActionType === "reorder"
                          ? "bg-purple-700 text-white shadow-xs"
                          : "bg-white/80 text-gray-700 hover:bg-white border border-gray-200"
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>1. Reordenar con Nuevo Proveedor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReorderActionType("warranty")}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                        reorderActionType === "warranty"
                          ? "bg-indigo-700 text-white shadow-xs"
                          : "bg-white/80 text-gray-700 hover:bg-white border border-gray-200"
                      }`}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>2. Reclamar Garantía / Refill (Proveedor)</span>
                    </button>
                  </div>

                  {/* Tab 1 Content: Reorder with New Provider */}
                  {reorderActionType === "reorder" && (
                    <div className="space-y-3 bg-white/90 p-3.5 rounded-xl border border-purple-100">
                      <div className="text-[11px] text-gray-700">
                        <strong>¿Para qué sirve?</strong> Si tu proveedor canceló por problemas con el enlace, cuenta privada o saturación, ingresa el <strong>nuevo ID de orden</strong> generado en tu proveedor o servidor de respaldo. Al reactivar, se actualizarán los servicios y el pedido pasará a <strong>'En proceso'</strong>.
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                            Nuevo ID de Orden del Proveedor *
                          </label>
                          <input
                            type="text"
                            value={newProviderIdInput}
                            onChange={(e) => setNewProviderIdInput(e.target.value)}
                            placeholder="Ej: 1048291 ó 1048291, 1048292"
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                            Detalle / Proveedor Alternativo (Opcional)
                          </label>
                          <input
                            type="text"
                            value={claimReasonInput}
                            onChange={(e) => setClaimReasonInput(e.target.value)}
                            placeholder="Ej: Reenviado por servidor de respaldo B"
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-gray-500">
                          IDs anteriores guardados: {receipt.services?.map(s => getItemOrderIdDisplay(s)).filter(Boolean).join(", ") || "Ninguno"}
                        </span>
                        <button
                          type="button"
                          disabled={isSubmittingReorder || !newProviderIdInput.trim()}
                          onClick={handleExecuteReorder}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:bg-purple-300 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer active:scale-95"
                        >
                          {isSubmittingReorder ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Reactivando...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>⚡ Reactivar Pedido con Nuevo ID</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tab 2 Content: Supplier Warranty / Refill */}
                  {reorderActionType === "warranty" && (
                    <div className="space-y-3 bg-white/90 p-3.5 rounded-xl border border-indigo-100">
                      <div className="text-[11px] text-gray-700">
                        <strong>¿Para qué sirve?</strong> Si el cliente reporta que hubo caída de seguidores/likes dentro de sus días de garantía, radica aquí el reclamo para su seguimiento con cuenta regresiva. El pedido pasará a <strong>'Garantía en proceso'</strong>.
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-1">
                          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                            ID(s) de Orden a Reclamar
                          </label>
                          <input
                            type="text"
                            value={newProviderIdInput || (receipt.services || []).flatMap(s => getItemOrderIds(s)).join(", ")}
                            onChange={(e) => setNewProviderIdInput(e.target.value)}
                            placeholder="Ej: 1048291"
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-mono font-bold text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                          />
                        </div>

                        <div className="sm:col-span-1">
                          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                            Plazo Límite de Respuesta
                          </label>
                          <div className="flex items-center gap-1">
                            {[24, 48, 72].map((hrs) => (
                              <button
                                key={hrs}
                                type="button"
                                onClick={() => setWarrantyResponseHours(hrs)}
                                className={`flex-1 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                                  warrantyResponseHours === hrs
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                                }`}
                              >
                                {hrs}h
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="sm:col-span-1">
                          <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                            Motivo / Detalle Caída
                          </label>
                          <input
                            type="text"
                            value={claimReasonInput}
                            onChange={(e) => setClaimReasonInput(e.target.value)}
                            placeholder="Ej: Caída de 400 seguidores / Refill"
                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Se creará un registro con alerta regresiva en el panel de Garantías.</span>
                        </span>
                        <button
                          type="button"
                          disabled={isSubmittingReorder}
                          onClick={handleExecuteSupplierWarranty}
                          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:bg-indigo-300 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer active:scale-95"
                        >
                          {isSubmittingReorder ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Radicando...</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>🛡️ Radicar Garantía ante Proveedor ({warrantyResponseHours}h)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Immediate Action WhatsApp Notice Banner */}
                  {lastActionWhatsAppUrl && (
                    <div className="mt-3 bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2.5 animate-fade-in">
                      <div className="flex items-center gap-2 text-xs text-emerald-900 font-medium">
                        <MessageSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>¿Deseas enviar el aviso automático del estado al cliente?</span>
                      </div>
                      <a
                        href={lastActionWhatsAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full sm:w-auto px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Notificación por WhatsApp</span>
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100">
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
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Estado del Pedido</label>
                    <select
                      value={editedStatus}
                      onChange={(e) => setEditedStatus(e.target.value as any)}
                      className="mt-1 block w-full px-3.5 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition font-semibold text-gray-900 cursor-pointer"
                    >
                      <option value="en_proceso">🟢 En proceso</option>
                      <option value="completado">✅ Completado</option>
                      <option value="garantia_en_proceso">🟡 Garantía en proceso</option>
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
                  <div className="col-span-2 md:col-span-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Estado
                    </div>
                    <div className="mt-0.5">
                      {getNormalizedStatus(receipt.status) === "cancelado" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          🔴 Cancelado
                        </span>
                      ) : getNormalizedStatus(receipt.status) === "garantia_en_proceso" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          🟡 Garantía en proceso
                        </span>
                      ) : getNormalizedStatus(receipt.status) === "completado" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✅ Completado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          🟢 En proceso
                        </span>
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
                        (receipt?.services || []).map((item, index) => (
                          <tr 
                            key={item?.id || index} 
                            onClick={() => handleOpenQuickEditService(index)}
                            className="hover:bg-indigo-50/40 transition cursor-pointer group"
                            title="Tocar este servicio para cambiar su ID de proveedor y actualizar la factura"
                          >
                            <td className="py-3 px-3 sm:py-3.5 sm:px-4">
                              <div className="font-semibold text-gray-900 flex items-center justify-between">
                                <span>
                                  {item?.socialNetworkName && item.socialNetworkName.toLowerCase() !== (item?.serviceName || '').toLowerCase()
                                    ? `${item.socialNetworkName} - ${item.serviceName}`
                                    : (item?.serviceName || item?.socialNetworkName || 'Servicio')}
                                </span>
                                <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md transition border border-indigo-200">
                                  ✏️ Tocar para cambiar ID
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-md border font-medium transition ${
                                  getItemOrderIds(item).length > 0
                                    ? "bg-slate-50 text-slate-700 border-slate-200 group-hover:bg-indigo-50 group-hover:border-indigo-300 group-hover:text-indigo-800"
                                    : "bg-amber-50 text-amber-800 border-amber-200"
                                }`}>
                                  <Hash className="w-3 h-3 text-indigo-500" />
                                  <span>
                                    {getItemOrderIds(item).length > 0
                                      ? `${getOrderIdTypeLabel(getItemOrderIdDisplay(item), item?.socialNetworkId === "custom")}: ${getItemOrderIdDisplay(item)}`
                                      : "Sin ID de proveedor"}
                                  </span>
                                  <span className="text-[10px] text-indigo-600 underline ml-1 font-sans font-bold">
                                    (cambiar)
                                  </span>
                                </span>
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
                        ))
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

        {/* Modal Rápido: Tocar Servicio para Cambiar ID y Reenviar Factura */}
        {quickEditServiceIndex !== null && receipt?.services?.[quickEditServiceIndex] && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-60 flex items-center justify-center p-3 sm:p-4 animate-fade-in"
            onClick={() => setQuickEditServiceIndex(null)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-5 sm:p-6 space-y-4 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base shadow-2xs">
                    🔄
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Cambiar ID y Reenviar Pedido</h3>
                    <p className="text-[11px] text-gray-500">Actualiza el ID de este servicio específico</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickEditServiceIndex(null)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Servicio Info */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
                <div className="font-bold text-slate-800 text-sm">
                  {receipt.services[quickEditServiceIndex].socialNetworkName} - {receipt.services[quickEditServiceIndex].serviceName}
                </div>
                <div className="flex items-center justify-between text-slate-600 text-[11px]">
                  <span>Cantidad: <strong className="text-slate-800 font-mono">{Number(receipt.services[quickEditServiceIndex].quantity || 0).toLocaleString()}</strong></span>
                  <span>ID Actual: <strong className="text-slate-800 font-mono">{getItemOrderIdDisplay(receipt.services[quickEditServiceIndex]) || "Sin ID"}</strong></span>
                </div>
              </div>

              {/* Nuevo ID Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  Nuevo ID de Orden del Proveedor *
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-indigo-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    autoFocus
                    required
                    value={quickNewOrderId}
                    onChange={(e) => setQuickNewOrderId(e.target.value)}
                    placeholder="Ej: 1548293"
                    className="w-full pl-9 pr-3 py-2.5 border-2 border-indigo-200 rounded-xl text-sm font-mono font-bold text-gray-900 placeholder-gray-400 focus:outline-hidden focus:border-indigo-500 transition shadow-2xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveQuickOrderId();
                      }
                    }}
                  />
                </div>
                <p className="text-[10px] text-gray-500">
                  Ingresa el número de orden generado por el nuevo proveedor al reordenar.
                </p>
              </div>

              {/* Estado del pedido */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700">
                  Estado del Pedido en la Factura
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickReactivateStatus("en_proceso")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      quickReactivateStatus === "en_proceso"
                        ? "bg-amber-500 text-white border-amber-600 shadow-2xs"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span>⏳ En proceso</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickReactivateStatus("completado")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      quickReactivateStatus === "completado"
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span>✅ Completado</span>
                  </button>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickEditServiceIndex(null)}
                  className="flex-1 py-2.5 px-3 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSavingQuickId || !quickNewOrderId.trim()}
                  onClick={handleSaveQuickOrderId}
                  className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSavingQuickId ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Guardar y Entregar Factura</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
