import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export const OfflineIndicator: React.FC = () => {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-amber-600 text-white px-4 py-2.5 text-xs font-semibold shadow-xl border border-amber-500/50 animate-bounce">
      <WifiOff className="w-4 h-4 shrink-0" />
      <div>
        <p className="font-bold">Modo Sin Conexión</p>
        <p className="text-[11px] text-amber-100 font-normal">
          Guardando datos localmente. Se sincronizarán con el servidor apenas regrese la conexión.
        </p>
      </div>
    </div>
  );
};
