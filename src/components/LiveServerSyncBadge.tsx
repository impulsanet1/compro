import React from "react";
import { RefreshCw } from "lucide-react";

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
