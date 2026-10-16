import React, { useState } from "react";
import { Download, Smartphone, CheckCircle, ExternalLink, X, ShieldCheck, RefreshCw, Wifi, Sparkles, HelpCircle } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

interface PWAInstallButtonProps {
  className?: string;
  variant?: "header" | "floating" | "banner";
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = "",
  variant = "header",
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const { isOnline } = useOnlineStatus();
  const [showModal, setShowModal] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // If already running in standalone mode (already installed as PWA app), show minimal sync badge
  if (isInstalled && variant === "banner") {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  // Render modal with step-by-step instructions for Android Chrome / iOS / Desktop
  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-600 p-5 text-white">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md p-2 flex items-center justify-center border border-white/20 shadow-inner">
                <Smartphone className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Instalar ImpulsaNet en tu Celular</h3>
                <p className="text-xs text-blue-100 flex items-center gap-1 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Sincronizado en línea con el servidor en tiempo real
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl p-3.5 text-xs text-blue-900 dark:text-blue-200 leading-relaxed flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>¡Dile adiós al navegador!</strong> Al instalar la aplicación se abrirá a pantalla completa como una app normal, sin barras de Google ni pestañas que se borren, y se sincronizará automáticamente a la nube.
              </span>
            </div>

            {/* Direct button if browser allows immediate prompt */}
            {isInstallable && (
              <button
                onClick={async () => {
                  const res = await install();
                  if (res) setShowModal(false);
                }}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all transform active:scale-95"
              >
                <Download className="w-5 h-5" />
                Instalar Ahora Directamente
              </button>
            )}

            {/* Step-by-step for Android / Google Chrome */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-800 dark:text-slate-100 mb-2">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                En Google Chrome (Android / Celular):
              </div>
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside pl-1">
                <li>
                  Toca los <strong>tres puntos (⋮)</strong> en la esquina superior derecha de Google Chrome.
                </li>
                <li>
                  Busca y toca la opción <strong>&ldquo;Instalar aplicación&rdquo;</strong> o <strong>&ldquo;Agregar a la pantalla principal&rdquo;</strong>.
                </li>
                <li>
                  Confirma tocando <strong>&ldquo;Instalar&rdquo;</strong>. ¡La app aparecerá en tus aplicaciones de inmediato!
                </li>
              </ol>
            </div>

            {/* Step-by-step for iPhone / Safari */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-800 dark:text-slate-100 mb-2">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                En iPhone / iPad (Safari):
              </div>
              <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-2 list-decimal list-inside pl-1">
                <li>
                  Toca el botón <strong>Compartir</strong> (el ícono del cuadrado con la flecha hacia arriba) en la barra inferior.
                </li>
                <li>
                  Baja en el menú y selecciona <strong>&ldquo;Agregar al inicio&rdquo; (+)</strong>.
                </li>
                <li>
                  Toca <strong>&ldquo;Agregar&rdquo;</strong> arriba a la derecha.
                </li>
              </ol>
            </div>

            {/* Realtime Server Sync Guarantee */}
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-lg p-2.5">
              <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Sincronización en línea:</strong> Todos los cambios, recibos y garantías se guardan en la nube de Firebase al instante.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex justify-end">
            <button
              onClick={() => setShowModal(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 rounded-lg border border-slate-300 dark:border-slate-600 transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Header button variant
  if (variant === "header") {
    if (isInstalled) {
      return (
        <>
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 ${className}`}
            title="App instalada y conectada al servidor"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="hidden sm:inline">Servidor en línea</span>
            <span className="sm:hidden">En línea</span>
          </div>
          {renderModal()}
        </>
      );
    }

    return (
      <>
        <button
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer ${className}`}
          title="Instalar versión de app para el celular con sincronización en la nube"
        >
          <Smartphone className="w-4 h-4" />
          <span className="hidden md:inline">Instalar App Celular</span>
          <span className="md:hidden">Instalar App</span>
        </button>
        {renderModal()}
      </>
    );
  }

  // Floating or Banner variant for mobile screens
  if (variant === "banner" && !bannerDismissed) {
    return (
      <>
        <div className="no-print bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-4 py-2.5 border-b border-blue-500/30 flex items-center justify-between gap-3 text-xs shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-sky-400" />
            </div>
            <div className="truncate">
              <span className="font-bold text-sky-300">¿Usas el celular? </span>
              <span className="text-slate-200">
                Instala ImpulsaNet como App directa para no depender de la barra de Google y sincronizar al servidor.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg text-xs transition-colors flex items-center gap-1 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              Instalar
            </button>
            <button
              onClick={() => setBannerDismissed(true)}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              aria-label="Cerrar banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {renderModal()}
      </>
    );
  }

  return renderModal();
};

export const LiveServerSyncBadge: React.FC<{ isOnline: boolean; isSyncing?: boolean }> = ({
  isOnline,
  isSyncing,
}) => {
  if (!isOnline) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
        title="Sin conexión a internet. Los cambios se sincronizarán al recuperar señal."
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
        <span>Sin conexión (Guardando local)</span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
      title="Conectado al servidor de Firebase Firestore. Sincronización en línea activa."
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      <span className="hidden sm:inline">Servidor en Línea</span>
      {isSyncing && <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-500" />}
    </div>
  );
};
