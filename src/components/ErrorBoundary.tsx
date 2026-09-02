import React, { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Globe } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message || "";
      const isDomMutationError =
        errMsg.includes("insertBefore") ||
        errMsg.includes("removeChild") ||
        errMsg.includes("Node") ||
        errMsg.includes("NotFoundError");

      return (
        <div className="min-h-[280px] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              {isDomMutationError ? <Globe className="w-6 h-6 text-indigo-500" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {isDomMutationError ? "Conflicto de renderizado en el navegador" : "Ocurrió un error al cargar esta sección"}
              </h3>
              <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed">
                {isDomMutationError
                  ? "El traductor automático de Chrome o una extensión modificó el texto de la pantalla. Hemos bloqueado la auto-traducción para proteger la vista."
                  : this.props.fallbackMessage || errMsg || "Se ha producido un problema inesperado."}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reintentar</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer active:scale-95"
              >
                Recargar Página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


