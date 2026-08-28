/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import { X, ShieldCheck, Edit3, Save, Trash2, ShieldAlert, Calendar, ChevronDown, ChevronUp, MessageSquare, Send, Bell, ExternalLink, PhoneCall } from "lucide-react";
import { Receipt, ReceiptItem, getNormalizedStatus, getItemOrderIds, getItemOrderIdDisplay } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "../context/AppContext";

interface ReceiptModalProps {
  receipt: Receipt;
  onClose: () => void;
  businessName: string;
  whatsapp: string;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  receipt,
  onClose,
  businessName,
  whatsapp,
}) => {
  const { updateReceipt } = useApp();
  const receiptRef = useRef<HTMLDivElement>(null);
  
  // Format utility
  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  // Network Emoji Helper
  const getNetworkEmoji = (networkName: string) => {
    const net = networkName.trim().toLowerCase();
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
    const daysStr = receipt.warranty || "30 días";
    const daysMatch = daysStr.match(/\d+/);
    const days = daysMatch ? parseInt(daysMatch[0], 10) : 0;
    
    if (days <= 0) {
      return (
        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
          Este comprobante incluye una garantía de <strong>{daysStr}</strong>. 
          Válida a partir de la fecha de generación para cualquier eventualidad o reposición de servicio.
        </p>
      );
    }

    try {
      const purchaseDate = new Date(receipt.date);
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedClientName, setEditedClientName] = useState(receipt.clientName || "");
  const [editedClientPhone, setEditedClientPhone] = useState(receipt.clientPhone || "");
  const [editedWarranty, setEditedWarranty] = useState(receipt.warranty || "30 días");
  const [editedThankYouMessage, setEditedThankYouMessage] = useState(receipt.thankYouMessage || "");
  const [editedServices, setEditedServices] = useState<ReceiptItem[]>(receipt.services || []);
  const [editedStatus, setEditedStatus] = useState(getNormalizedStatus(receipt.status));
  const [editedInternalNotes, setEditedInternalNotes] = useState(receipt.internalNotes || "");
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state with prop changes ONLY when opening a different receipt
  useEffect(() => {
    setEditedClientName(receipt.clientName || "");
    setEditedClientPhone(receipt.clientPhone || "");
    setEditedWarranty(receipt.warranty || "30 días");
    setEditedThankYouMessage(receipt.thankYouMessage || "¡Gracias por confiar en ImpulsaNet para potenciar sus redes!");
    setEditedServices(receipt.services || []);
    setEditedStatus(getNormalizedStatus(receipt.status));
    setEditedInternalNotes(receipt.internalNotes || "");
    setIsEditing(false);
    setError(null);
  }, [receipt.id]);

  // Recalculate totals in real time while editing
  const totals = useMemo(() => {
    const items = isEditing ? editedServices : receipt.services || [];
    const subtotal = items.reduce((acc, item) => acc + (item?.suggestedPrice || 0), 0);
    const totalCharged = items.reduce((acc, item) => acc + (Number(item?.chargedPrice) || 0), 0);
    const totalProviderCost = items.reduce((acc, item) => acc + (item?.providerCostAtPurchase || 0), 0);
    const totalProfit = totalCharged - totalProviderCost;
    return { subtotal, totalCharged, totalProviderCost, totalProfit };
  }, [isEditing, editedServices, receipt.services]);

  // Format date to local string
  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
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
      return `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-weight: 600; color: #0f172a;">
            ${item.socialNetworkName || ''} - ${item.serviceName || ''}
            ${orderIdsStr ? `<div style="font-size: 12px; font-weight: 400; color: #64748b; margin-top: 3px;">ID Pedido: ${orderIdsStr}</div>` : ''}
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
            <span>${receiptData.warranty || '30 días de garantía'}</span>
          </div>

          <div class="footer-note">
            "${receiptData.thankYouMessage || '¡Gracias por su preferencia!'}"
          </div>
        </div>

        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script>
          function downloadAsPngImage(e) {
            const card = document.querySelector('.receipt-card');
            if (!card) return;
            const btn = e ? e.currentTarget : null;
            let origText = '';
            if (btn) {
              origText = btn.innerHTML;
              btn.innerHTML = '⌛ Generando...';
              btn.disabled = true;
            }
            html2canvas(card, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#ffffff'
            }).then(function(canvas) {
              const link = document.createElement('a');
              link.download = 'comprobante_${receiptData.consecutive || receiptData.id.slice(0, 6)}.png';
              link.href = canvas.toDataURL('image/png');
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              if (btn) {
                btn.innerHTML = origText;
                btn.disabled = false;
              }
            }).catch(function(err) {
              alert('Error al descargar la imagen: ' + err.message);
              if (btn) {
                btn.innerHTML = origText;
                btn.disabled = false;
              }
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

      const updatedData: Partial<Receipt> = {
        clientName: editedClientName.trim(),
        clientPhone: editedClientPhone.trim(),
        warranty: editedWarranty.trim(),
        thankYouMessage: editedThankYouMessage.trim(),
        services: sanitizedServices,
        subtotal: totals.subtotal,
        totalCharged: totals.totalCharged,
        totalProviderCost: totals.totalProviderCost,
        totalProfit: totals.totalProfit,
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

  const getWhatsAppLink = (type: "confirm" | "warranty" | "followup") => {
    let rawDigits = (receipt.clientPhone || "").replace(/\D/g, "");
    if (rawDigits.length === 10 && !rawDigits.startsWith("57")) {
      rawDigits = "57" + rawDigits;
    }
    
    const clientFirstName = (receipt.clientName || "Cliente").split(" ")[0];
    const servicesList = (receipt.services || [])
      .map((s) => `• ${s.socialNetworkName} ${s.serviceName} (${s.quantity.toLocaleString()})`)
      .join("\n");
    const formattedTotal = formatCOP(totals.totalCharged);

    let text = "";
    if (type === "confirm") {
      text = `Hola ${clientFirstName}! 👋 Gracias por elegir ImpulsaNet.\n\n*Resumen de tu Pedido #${receipt.consecutive || ''}:*\n${servicesList}\n\n*Total Pagado:* ${formattedTotal}\n*Garantía Activa:* ${receipt.warranty || "30 días"}\n\n¡Cualquier inquietud estamos aquí para atenderte! 🚀`;
    } else if (type === "warranty") {
      text = `Hola ${clientFirstName}! 👋 Esperamos te encuentres muy bien.\n\nTe escribimos de ImpulsaNet para recordarte que tu garantía de *${receipt.warranty || "30 días"}* para el pedido *#${receipt.consecutive || ''}* está próxima a vencer.\n\nSi deseas renovar este servicio o potenciar tus redes con nuevos paquetes, ¡cuéntanos por aquí y te daremos un precio especial! 🎯`;
    } else if (type === "followup") {
      text = `Hola ${clientFirstName}! 👋 ¿Cómo van los resultados con tus redes tras tu pedido *#${receipt.consecutive || ''}*?\n\nEn ImpulsaNet estamos a tu disposición para ayudarte a seguir creciendo. ¡Escríbenos si necesitas un nuevo paquete o asesoría! 📲`;
    }

    return `https://wa.me/${rawDigits}?text=${encodeURIComponent(text)}`;
  };

  return (
    <AnimatePresence>
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
                      setEditedWarranty(receipt.warranty || "30 días");
                      setEditedThankYouMessage(receipt.thankYouMessage || "");
                      setEditedServices(receipt.services || []);
                      setError(null);
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition px-3 py-2 rounded-xl shadow-2xs cursor-pointer active:scale-95 touch-manipulation"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
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
                    onClick={() => setIsEditing(true)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition px-2.5 py-2 rounded-xl cursor-pointer border border-indigo-200 touch-manipulation"
                    title="Editar comprobante"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                  <button
                    id="btn-close-receipt-desktop"
                    type="button"
                    onClick={onClose}
                    className="hidden sm:flex text-gray-400 hover:text-gray-700 p-2 hover:bg-gray-100 transition rounded-xl cursor-pointer ml-1"
                    title="Cerrar"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </>
              )}
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
                      const newStatus = e.target.value;
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
                    {receipt.services.flatMap((s) => getItemOrderIds(s)).length === 0 ? (
                      <span className="text-gray-400 italic">Ninguno</span>
                    ) : (
                      receipt.services.flatMap((s) => getItemOrderIds(s)).map((id, index) => (
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <a
                    href={getWhatsAppLink("confirm")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirmación Pedido</span>
                  </a>
                  <a
                    href={getWhatsAppLink("warranty")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>Vencimiento / Garantía</span>
                  </a>
                  <a
                    href={getWhatsAppLink("followup")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-3 rounded-lg shadow-2xs transition active:scale-95 text-center cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Seguimiento Post-Venta</span>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-indigo-50/30 p-4 rounded-xl border border-indigo-100">
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
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
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
                </div>
              )}

              {/* Services Table */}
              <div className="space-y-3">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  Servicios Adquiridos
                </div>
                <div className="border border-gray-100 rounded-xl overflow-hidden shadow-2xs bg-white">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/75 border-b border-gray-100">
                        <th className="py-3 px-4 text-xs font-semibold text-gray-600">Servicio</th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-600 text-center">Cantidad</th>
                        <th className="py-3 px-4 text-xs font-semibold text-gray-600 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-sm">
                      {isEditing ? (
                        editedServices.map((item, index) => {
                          if (!item) return null;
                          return (
                            <tr key={item.id || index} className="hover:bg-gray-50/30 transition">
                              <td className="py-3 px-2 sm:py-3.5 sm:px-4">
                                <div className="font-semibold text-gray-900 text-xs">
                                  {item.socialNetworkName || "Red Social"} - {item.serviceName || "Servicio"}
                                </div>
                                <div className="mt-2">
                                  <label className="block text-[9px] font-bold text-gray-400 uppercase">ID de Pedido</label>
                                  <input
                                    type="text"
                                    value={item.orderId || ""}
                                    onChange={(e) => {
                                      const updatedVal = e.target.value;
                                      const cleanIds = updatedVal.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
                                      setEditedServices((prev) =>
                                        prev.map((it, idx) => (idx === index ? { ...it, orderId: updatedVal, orderIds: cleanIds } : it))
                                      );
                                    }}
                                    className="mt-0.5 block w-full max-w-xs px-2.5 py-1 border border-gray-200 rounded-md text-xs font-mono bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>
                              </td>
                              <td className="py-3 px-2 sm:py-3.5 sm:px-4 text-center">
                                <input
                                  type="number"
                                  value={item.quantity ?? 0}
                                  onChange={(e) => {
                                    const updatedVal = parseInt(e.target.value) || 0;
                                    setEditedServices((prev) =>
                                      prev.map((it, idx) => (idx === index ? { ...it, quantity: updatedVal } : it))
                                    );
                                  }}
                                  className="w-16 sm:w-20 px-1.5 py-1 border border-gray-200 rounded-md text-xs font-mono text-center bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="py-3 px-2 sm:py-3.5 sm:px-4 text-right">
                                <div className="flex flex-col items-end gap-1.5">
                                  <div className="relative rounded-md w-20 sm:w-24">
                                    <span className="absolute inset-y-0 left-0 pl-1.5 flex items-center text-[10px] text-gray-400 font-mono">$</span>
                                    <input
                                      type="number"
                                      value={item.chargedPrice ?? 0}
                                      onChange={(e) => {
                                        const updatedVal = parseFloat(e.target.value) || 0;
                                        setEditedServices((prev) =>
                                          prev.map((it, idx) => (idx === index ? { ...it, chargedPrice: updatedVal } : it))
                                        );
                                      }}
                                      className="block w-full pl-4 pr-1 py-1 border border-gray-200 rounded-md text-xs font-mono text-right bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                                    />
                                  </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditedServices((prev) => prev.filter((_, idx) => idx !== index));
                                  }}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition cursor-pointer"
                                  title="Remover servicio"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                      ) : (
                        (receipt.services || []).map((item, index) => (
                          <tr key={item.id || index} className="hover:bg-gray-50/30 transition">
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-gray-900">
                                {item.socialNetworkName} - {item.serviceName}
                              </div>
                              {getItemOrderIds(item).length > 0 && (
                                <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                                  ID Pedido: {getItemOrderIdDisplay(item)}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-center font-mono text-gray-600">
                              {item.quantity.toLocaleString()}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-medium text-gray-900">
                              {formatCOP(item.chargedPrice)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detalle del Pedido Section */}
              {!isEditing && (
                <div className="space-y-3 pt-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                    <span>Detalle del Pedido</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {(receipt.services || []).flatMap((item, itemIdx) => {
                      const ids = getItemOrderIds(item);
                      
                      if (ids.length <= 1) {
                        return (
                          <div key={`single-${itemIdx}`} className="bg-gray-50/40 p-4 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{getNetworkEmoji(item.socialNetworkName)}</span>
                              <div>
                                <div className="font-semibold text-gray-900">{item.socialNetworkName}</div>
                                <div className="text-gray-400 text-[11px] mt-0.5">{item.serviceName}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-semibold text-gray-800">Cant: {item.quantity.toLocaleString()}</div>
                              {ids[0] && (
                                <div className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-sm mt-1 border border-indigo-100/30">
                                  ID: {ids[0]}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      } else {
                        const splitQty = Math.floor(item.quantity / ids.length);
                        return ids.map((id, idIdx) => (
                          <div key={`split-${itemIdx}-${idIdx}`} className="bg-indigo-50/10 p-4 rounded-xl border border-indigo-100/30 relative overflow-hidden text-xs">
                            <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-md">
                              Registro {idIdx + 1}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-lg">{getNetworkEmoji(item.socialNetworkName)}</span>
                                <div>
                                  <div className="font-bold text-indigo-950">{item.socialNetworkName}</div>
                                  <div className="text-gray-400 text-[11px] mt-0.5">{item.serviceName}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono font-semibold text-gray-800">Cant: {splitQty.toLocaleString()}</div>
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
      </div>
    </AnimatePresence>
  );
};
