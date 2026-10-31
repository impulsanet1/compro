/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Receipt, ReceiptItem, getItemOrderIds, formatProviderStatus } from "../types";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Package,
  Calendar,
  ArrowLeft,
  TrendingUp,
  MessageCircle,
  Search,
  Instagram,
  Youtube,
  ExternalLink,
  Zap
} from "lucide-react";

interface PublicTrackingViewProps {
  initialTrackingId?: string | null;
}

interface ItemTrackingMetrics {
  orderId: string;
  found: boolean;
  status: string;
  rawStatus: string;
  mappedStatus: "en_proceso" | "completado" | "cancelado";
  startCount: number | null;
  remains: number | null;
  delivered: number | null;
  progressPercent: number;
  estimatedDelivery: string;
  liveInstagram?: {
    username: string;
    currentFollowers: number | null;
    startFollowers: number | null;
    delivered: number | null;
    verified: boolean;
    source: string;
    error?: string;
  } | null;
}

type SupportedNetwork = "instagram" | "facebook" | "tiktok" | "youtube" | "generic";

function detectItemNetwork(
  item: ReceiptItem,
  receiptAccount?: string
): SupportedNetwork {
  const snId = (item.socialNetworkId || "").toLowerCase();
  const snName = (item.socialNetworkName || "").toLowerCase();
  const srvName = (item.serviceName || "").toLowerCase();
  const target = (item.targetAccount || receiptAccount || "").toLowerCase();

  // 1. Facebook checks
  if (
    target.includes("facebook.com") ||
    target.includes("fb.com") ||
    target.includes("fb.watch") ||
    snId.includes("facebook") ||
    snName.includes("facebook") ||
    srvName.includes("facebook")
  ) {
    return "facebook";
  }

  // 2. TikTok checks
  if (
    target.includes("tiktok.com") ||
    snId.includes("tiktok") ||
    snName.includes("tiktok") ||
    srvName.includes("tiktok")
  ) {
    return "tiktok";
  }

  // 3. YouTube checks
  if (
    target.includes("youtube.com") ||
    target.includes("youtu.be") ||
    snId.includes("youtube") ||
    snName.includes("youtube") ||
    srvName.includes("youtube")
  ) {
    return "youtube";
  }

  // 4. Instagram checks
  if (
    target.includes("instagram.com") ||
    snId.includes("instagram") ||
    snName.includes("instagram") ||
    srvName.includes("instagram") ||
    srvName.includes("insta")
  ) {
    return "instagram";
  }

  if (snId === "instagram") return "instagram";
  if (snId === "facebook") return "facebook";
  if (snId === "tiktok") return "tiktok";
  if (snId === "youtube") return "youtube";

  return "generic";
}

function resolveItemUrl(
  network: SupportedNetwork,
  targetAccount?: string
): string | null {
  if (!targetAccount) return null;
  const trimmed = targetAccount.trim();
  if (!trimmed) return null;

  // Direct valid URLs (do not modify if already a valid URL)
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  const clean = trimmed.replace(/^@+/, "").split(/[/?#\s]/)[0];
  if (!clean) return null;

  switch (network) {
    case "facebook":
      return `https://facebook.com/${clean}`;
    case "tiktok":
      return `https://tiktok.com/@${clean}`;
    case "instagram":
      return `https://instagram.com/${clean}`;
    case "youtube":
      return `https://youtube.com/@${clean}`;
    default:
      return null;
  }
}

function formatAccountDisplay(targetAccount?: string): string {
  if (!targetAccount) return "";
  const trimmed = targetAccount.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const cleanPath = u.pathname.length > 22 ? u.pathname.slice(0, 22) + "..." : u.pathname;
      return `${u.hostname}${cleanPath}`;
    } catch {
      return trimmed.length > 30 ? trimmed.slice(0, 30) + "..." : trimmed;
    }
  }
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export const PublicTrackingView: React.FC<PublicTrackingViewProps> = ({
  initialTrackingId
}) => {
  const [trackingId, setTrackingId] = useState<string>(initialTrackingId || "");
  const [searchInput, setSearchInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(Boolean(initialTrackingId));
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveMetrics, setLiveMetrics] = useState<Record<string, ItemTrackingMetrics>>({});
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [businessName, setBusinessName] = useState<string>("ImpulsaNet");
  const [supportWhatsapp, setSupportWhatsapp] = useState<string>("573208354198");

  // Load business contact info for WhatsApp support
  useEffect(() => {
    async function loadBusinessInfo() {
      try {
        const snap = await getDoc(doc(db, "config", "business"));
        if (snap.exists()) {
          const data = snap.data();
          if (data.businessName) setBusinessName(data.businessName);
          if (data.whatsapp) setSupportWhatsapp(data.whatsapp);
        }
      } catch {
        // Fallback to defaults
      }
    }
    loadBusinessInfo();
  }, []);

  // Function to load receipt safely
  const fetchReceipt = async (id: string) => {
    if (!id || !id.trim()) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const docRef = doc(db, "receipts", id.trim());
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() } as Receipt;
        setReceipt(data);
        await fetchLiveMetrics(data);
      } else {
        setError("No se encontró ningún comprobante con este identificador. Por favor verifica el enlace o código QR de tu factura.");
        setReceipt(null);
      }
    } catch (err: any) {
      console.error("Error loading tracking receipt:", err);
      setError("No se pudo cargar la información del pedido. Por favor intenta nuevamente.");
      setReceipt(null);
    } finally {
      setLoading(false);
      setLastUpdated(new Date());
    }
  };

  // Function to query MazSocialMarket provider status through safe server proxy with Instagram live verification
  const fetchLiveMetrics = async (receiptData: Receipt) => {
    const services = receiptData.services || [];
    const orderIds: string[] = [];

    services.forEach(item => {
      const ids = getItemOrderIds(item);
      ids.forEach(id => {
        if (id && /^\d+$/.test(id.trim())) {
          orderIds.push(id.trim());
        }
      });
    });

    try {
      const res = await fetch("/api/tracking/customer-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds,
          receiptTargetAccount: receiptData.targetAccount,
          items: services.map(item => ({
            orderId: item.orderId?.trim(),
            quantity: item.quantity,
            socialNetworkId: item.socialNetworkId,
            socialNetworkName: item.socialNetworkName,
            serviceName: item.serviceName,
            targetAccount: item.targetAccount || receiptData.targetAccount,
            startCount: item.startCount,
            description: `${item.socialNetworkName || ''} - ${item.serviceName || ''}`
          }))
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.tracking)) {
          const metricsMap: Record<string, ItemTrackingMetrics> = {};
          data.tracking.forEach((t: ItemTrackingMetrics) => {
            metricsMap[t.orderId] = t;
          });
          setLiveMetrics(metricsMap);
        }
      }
    } catch (err) {
      console.error("Error updating live provider tracking metrics:", err);
    }
  };

  useEffect(() => {
    if (trackingId) {
      fetchReceipt(trackingId);
    } else {
      setLoading(false);
    }
  }, [trackingId]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setTrackingId(searchInput.trim());
    fetchReceipt(searchInput.trim());
  };

  const handleRefresh = async () => {
    if (!receipt) return;
    setRefreshing(true);
    await fetchLiveMetrics(receipt);
    setLastUpdated(new Date());
    setRefreshing(false);
  };

  // Helper for overall status badge
  const getStatusBadge = (status?: string) => {
    const s = (status || "").toLowerCase();
    if (s === "completado") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Completado
        </span>
      );
    }
    if (s === "cancelado") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          Cancelado / En Garantía
        </span>
      );
    }
    if (s === "garantia_en_proceso") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300">
          <Clock className="w-4 h-4 text-amber-600" />
          Garantía en Proceso
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-800 border border-blue-300">
        <Clock className="w-4 h-4 text-blue-600 animate-spin" />
        En Curso
      </span>
    );
  };

  const folioNumber = receipt ? `IMP-${String(receipt.consecutive || 1).padStart(4, "0")}` : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/80 text-gray-900 pb-12 font-sans antialiased">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200/80 sticky top-0 z-30 shadow-2xs backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-15 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-xs">
              IN
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-gray-900 block leading-tight">
                Impulsa<span className="text-indigo-600">Net</span>
              </span>
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block">
                Seguimiento de Comprobante
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {receipt && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition cursor-pointer active:scale-95"
                title="Actualizar métricas en vivo"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Actualizar</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 pt-6 sm:pt-8">
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-12 text-center flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-9 h-9 text-indigo-600 animate-spin" />
            <h2 className="text-base font-bold text-gray-900">Consultando estado en vivo...</h2>
            <p className="text-xs text-gray-500 max-w-sm">
              Conectando con el servidor para obtener los datos de entrega y conteo de tu pedido.
            </p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 shadow-xs p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 mx-auto flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Comprobante no encontrado</h2>
            <p className="text-xs text-gray-600 max-w-md mx-auto mb-6">{error}</p>

            {/* Search fallback */}
            <form onSubmit={handleManualSearch} className="max-w-md mx-auto flex gap-2">
              <input
                type="text"
                placeholder="Ingresa tu ID de comprobante..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 px-3.5 py-2 border border-gray-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                Buscar
              </button>
            </form>
          </div>
        ) : receipt ? (
          <div className="space-y-6">
            {/* Header Hero Card */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-5 sm:p-6 relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
                      Factura {folioNumber}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {receipt.date || new Date().toLocaleDateString("es-ES")}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
                    Estado de tu Pedido
                  </h1>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Cliente: <strong className="text-gray-800">{receipt.clientName || "Cliente"}</strong>
                  </p>
                </div>

                <div className="sm:text-right">
                  <div className="mb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Estado General
                  </div>
                  {getStatusBadge(receipt.status)}
                </div>
              </div>

              {/* Live Info Banner */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-500 bg-slate-50/80 rounded-xl p-3 border border-slate-200/60 font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Sincronización en vivo con servidores de entrega</span>
                </div>
                <div>
                  Última consulta: {lastUpdated.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>

            {/* Service Items with Live Tracking Metrics */}
            <div className="space-y-4">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-wider flex items-center gap-2 px-1">
                <Package className="w-4 h-4 text-indigo-600" />
                Servicios y Progreso de Entrega
              </h2>

              {receipt.services && receipt.services.length > 0 ? (
                receipt.services.map((item: ReceiptItem, idx: number) => {
                  const ids = getItemOrderIds(item);
                  const pId = ids[0] || item.orderId;
                  const metrics = pId ? liveMetrics[pId] : null;
                  const itemStatus = metrics ? metrics.mappedStatus : (receipt.status === "completado" ? "completado" : "en_proceso");
                  const progress = metrics ? metrics.progressPercent : (itemStatus === "completado" ? 100 : 25);
                  const serviceTitle = item.socialNetworkName && item.socialNetworkName.toLowerCase() !== (item.serviceName || "").toLowerCase()
                    ? `${item.socialNetworkName} - ${item.serviceName}`
                    : (item.serviceName || item.socialNetworkName || "Servicio");

                  return (
                    <div
                      key={item.id || idx}
                      className="bg-white rounded-2xl border border-gray-200/90 shadow-xs p-5 transition hover:border-indigo-200"
                    >
                      {/* Item Title & Status */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-gray-400 font-mono">#{idx + 1}</span>
                            <h3 className="text-base font-bold text-gray-900 leading-snug">
                              {serviceTitle}
                            </h3>
                            {item.isResent && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                                🟡 Reenviado con Garantía
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Status Tag */}
                        <div className="shrink-0">
                          {itemStatus === "completado" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                              ✅ Completado
                            </span>
                          ) : itemStatus === "cancelado" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-800 border border-rose-300">
                              🔴 Cancelado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-800 border border-blue-300">
                              🔵 {metrics?.status ? formatProviderStatus(metrics.status) : (metrics?.rawStatus ? formatProviderStatus(metrics.rawStatus) : "En curso")}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Live Delivery Progress Bar */}
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 mb-4">
                        <div className="flex items-center justify-between text-xs font-semibold mb-2">
                          <span className="text-gray-700 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
                            Progreso de entrega:
                          </span>
                          <span className={`font-mono font-bold ${
                            itemStatus === "completado" ? "text-emerald-700" : "text-blue-700"
                          }`}>
                            {progress}%
                          </span>
                        </div>

                        {/* Progress track */}
                        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              itemStatus === "completado"
                                ? "bg-emerald-500"
                                : itemStatus === "cancelado"
                                ? "bg-rose-500"
                                : "bg-gradient-to-r from-blue-500 to-indigo-600 animate-pulse"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        {/* Estimated delivery time */}
                        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-gray-400" />
                            Tiempo estimado:
                          </span>
                          <span className="font-semibold text-gray-800">
                            {metrics?.estimatedDelivery || (itemStatus === "completado" ? "Completado con éxito" : "Aprox. 2 a 8 horas")}
                          </span>
                        </div>
                      </div>

                      {/* Live Counter Metrics (Conteo Inicial, Cantidad, Restante) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                        {/* Conteo Inicial */}
                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <span className="text-gray-400 block text-[10px] font-semibold uppercase tracking-wider">
                            Conteo Inicial:
                          </span>
                          <span className="font-mono font-black text-sm text-gray-800 mt-0.5 block">
                            {item.startCount !== null && item.startCount !== undefined
                              ? Number(item.startCount).toLocaleString("es-ES")
                              : metrics?.startCount !== null && metrics?.startCount !== undefined
                              ? Number(metrics.startCount).toLocaleString("es-ES")
                              : "—"}
                          </span>
                        </div>

                        {/* Cantidad Solicitada */}
                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <span className="text-gray-400 block text-[10px] font-semibold uppercase tracking-wider">
                            Cantidad:
                          </span>
                          <span className="font-mono font-black text-sm text-indigo-700 mt-0.5 block">
                            {Number(item.quantity || 0).toLocaleString("es-ES")}
                          </span>
                        </div>

                        {/* Entregados */}
                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <span className="text-gray-400 block text-[10px] font-semibold uppercase tracking-wider">
                            Entregados:
                          </span>
                          <span className={`font-mono font-black text-sm mt-0.5 block ${
                            itemStatus === "completado" ? "text-emerald-700" : "text-blue-700"
                          }`}>
                            {itemStatus === "completado"
                              ? Number(item.quantity || 0).toLocaleString("es-ES")
                              : metrics?.delivered !== null && metrics?.delivered !== undefined
                              ? Number(metrics.delivered).toLocaleString("es-ES")
                              : "En curso"}
                          </span>
                        </div>

                        {/* Restantes */}
                        <div className="bg-white p-2.5 rounded-xl border border-gray-200/80 shadow-2xs">
                          <span className="text-gray-400 block text-[10px] font-semibold uppercase tracking-wider">
                            Restantes:
                          </span>
                          <span className="font-mono font-black text-sm text-gray-700 mt-0.5 block">
                            {itemStatus === "completado"
                              ? "0"
                              : metrics?.remains !== null && metrics?.remains !== undefined
                              ? Number(metrics.remains).toLocaleString("es-ES")
                              : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Live Network Verification & Conteo en Vivo Card (Adapts to Facebook, TikTok, Instagram, YouTube, etc.) */}
                      {(() => {
                        const network = detectItemNetwork(item, receipt.targetAccount);
                        const rawTarget = item.targetAccount || receipt.targetAccount;
                        const targetUrl = resolveItemUrl(network, rawTarget);
                        const displayTarget = formatAccountDisplay(rawTarget);
                        const hasLiveIg = Boolean(network === "instagram" && metrics?.liveInstagram?.verified && metrics.liveInstagram.currentFollowers !== null);

                        if (!rawTarget && !metrics?.startCount && itemStatus !== "en_proceso") {
                          return null;
                        }

                        // Network-specific configuration
                        let config = {
                          title: "Conteo y Monitoreo en Vivo",
                          platformName: item.socialNetworkName || "Red Social",
                          badgeBg: "bg-indigo-600 text-white",
                          cardBg: "bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border-indigo-200/70",
                          btnClass: "text-indigo-700 bg-white hover:bg-indigo-50 border-indigo-200",
                          btnText: "Ver Enlace",
                          icon: <Zap className="w-4 h-4" />
                        };

                        if (network === "facebook") {
                          config = {
                            title: "Conteo y Monitoreo de Facebook",
                            platformName: "Facebook",
                            badgeBg: "bg-blue-600 text-white",
                            cardBg: "bg-gradient-to-r from-blue-50/90 via-sky-50/50 to-indigo-50/40 border-blue-200/90",
                            btnClass: "text-blue-700 bg-white hover:bg-blue-50 border-blue-200",
                            btnText: "Ver en Facebook",
                            icon: (
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                            )
                          };
                        } else if (network === "tiktok") {
                          config = {
                            title: "Conteo y Monitoreo de TikTok",
                            platformName: "TikTok",
                            badgeBg: "bg-slate-900 text-white",
                            cardBg: "bg-gradient-to-r from-slate-100 via-zinc-50 to-cyan-50/40 border-slate-300/80",
                            btnClass: "text-slate-900 bg-white hover:bg-slate-100 border-slate-300",
                            btnText: "Ver en TikTok",
                            icon: (
                              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-1.01-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                              </svg>
                            )
                          };
                        } else if (network === "instagram") {
                          config = {
                            title: "Conteo en Vivo de Instagram",
                            platformName: "Instagram",
                            badgeBg: "bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white",
                            cardBg: "bg-gradient-to-r from-purple-50 via-pink-50/60 to-indigo-50 border-purple-200/80",
                            btnClass: "text-purple-700 bg-white hover:bg-purple-100/80 border-purple-200",
                            btnText: "Ver en Instagram",
                            icon: <Instagram className="w-4 h-4" />
                          };
                        } else if (network === "youtube") {
                          config = {
                            title: "Conteo y Monitoreo de YouTube",
                            platformName: "YouTube",
                            badgeBg: "bg-red-600 text-white",
                            cardBg: "bg-gradient-to-r from-red-50 via-rose-50/50 to-amber-50/40 border-red-200/80",
                            btnClass: "text-red-700 bg-white hover:bg-red-50 border-red-200",
                            btnText: "Ver en YouTube",
                            icon: <Youtube className="w-4 h-4" />
                          };
                        }

                        return (
                          <div className={`mt-4 p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs ${config.cardBg}`}>
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-xs ${config.badgeBg}`}>
                                {config.icon}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                                  <span>{config.title}</span>
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    {hasLiveIg ? "Sincronizado en Vivo" : "Monitoreo Activo"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-gray-600 truncate">
                                  {hasLiveIg ? (
                                    <span>
                                      Perfil <strong className="text-purple-800">{displayTarget}</strong>: <strong className="font-mono text-purple-900 font-bold">{metrics?.liveInstagram?.currentFollowers?.toLocaleString('es-ES')}</strong> seguidores detectados en vivo.
                                    </span>
                                  ) : rawTarget ? (
                                    <span>
                                      Destino: <strong className="text-gray-900 font-medium">{displayTarget}</strong> ({config.platformName})
                                    </span>
                                  ) : (
                                    <span>
                                      Monitoreo de entrega en tiempo real para {config.platformName}.
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {targetUrl && (
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer shrink-0 ${config.btnClass}`}
                              >
                                <span>{config.btnText}</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              ) : (
                <div className="bg-white p-6 rounded-xl border border-gray-200 text-center text-xs text-gray-500">
                  No hay servicios detallados en este comprobante.
                </div>
              )}
            </div>

            {/* Warranty & Guarantee Card */}
            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Garantía ImpulsaNet Protegida
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    {receipt.warranty || "Tu compra cuenta con garantía y reposición ante caídas según los términos de servicio."}
                  </p>
                </div>
              </div>
            </div>

            {/* Direct Support & Actions */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-5 sm:p-6 text-center space-y-3">
              <h3 className="text-sm font-bold text-gray-900">¿Tienes alguna pregunta sobre tu pedido?</h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto">
                Nuestro equipo de atención está listo para asistirte con cualquier consulta sobre tu comprobante #{folioNumber}.
              </p>
              
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                {(() => {
                  let cleanWa = (supportWhatsapp || "573208354198").replace(/\D/g, "");
                  if (cleanWa.length === 10 && !cleanWa.startsWith("57")) {
                    cleanWa = "57" + cleanWa;
                  }
                  return (
                    <a
                      href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Hola ${businessName}, quisiera consultar el estado de mi pedido con comprobante ${folioNumber}.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer active:scale-95"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Consultar por WhatsApp</span>
                    </a>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <footer className="text-center pt-4 text-xs text-gray-400">
              <p>© {new Date().getFullYear()} {businessName} • Sistema de Seguimiento en Vivo</p>
            </footer>
          </div>
        ) : null}
      </main>
    </div>
  );
};
