/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { AlertCircle, Sun, Moon, RefreshCw, Lock } from "lucide-react";
import { motion } from "motion/react";

export const LoginView: React.FC = () => {
  const { loginWithGoogle, isDarkMode, toggleDarkMode } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      let errMsg = "No se pudo iniciar sesión con Google.";
      if (err.code === "auth/popup-closed-by-user") {
        errMsg = "La ventana de inicio de sesión de Google fue cerrada antes de completar el acceso.";
      } else if (err.code === "auth/popup-blocked") {
        errMsg = "El navegador bloqueó la ventana emergente de Google. Por favor permita las ventanas emergentes en este sitio.";
      } else if (err.message) {
        errMsg = err.message;
      }
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4 relative transition-colors duration-200 ${
        isDarkMode ? "bg-[#0b0f19] text-slate-100" : "bg-gray-50 text-gray-900"
      }`}
    >
      {/* Theme toggle on Login page */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          id="btn-login-theme-toggle"
          type="button"
          onClick={toggleDarkMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
            isDarkMode
              ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300 shadow-sm"
              : "bg-white hover:bg-gray-100 border-gray-200 text-gray-700 shadow-2xs"
          }`}
          title={isDarkMode ? "Cambiar a Modo Día" : "Cambiar a Modo Noche"}
        >
          {isDarkMode ? (
            <>
              <Sun className="w-4 h-4 text-amber-300" />
              <span>Modo Día</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-700" />
              <span>Modo Noche</span>
            </>
          )}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md animate-fade-in">
        <div className="flex justify-center">
          <div className="w-13 h-13 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl tracking-tighter shadow-lg shadow-indigo-600/20">
            IN
          </div>
        </div>
        <h2
          className={`mt-5 text-center text-2xl font-black tracking-tight ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          Impulsa<span className="text-indigo-500">Net</span> Admin
        </h2>
        <p
          className={`mt-1.5 text-center text-xs font-medium ${
            isDarkMode ? "text-slate-400" : "text-gray-500"
          }`}
        >
          Panel de Control y Emisión de Comprobantes
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`py-8 px-6 sm:px-10 border rounded-2xl space-y-6 shadow-xl ${
            isDarkMode
              ? "bg-slate-900/95 border-slate-800 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
              : "bg-white border-gray-200 shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
          }`}
        >
          {/* Header Description */}
          <div
            className={`text-center space-y-2 pb-4 border-b ${
              isDarkMode ? "border-slate-800" : "border-gray-100"
            }`}
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 dark:border dark:border-indigo-800/60">
              <Lock className="w-3.5 h-3.5 text-indigo-500" />
              <span>Acceso Administrativo Seguro</span>
            </div>
            <p className={`text-xs ${isDarkMode ? "text-slate-300" : "text-gray-600"} leading-relaxed pt-1`}>
              Inicia sesión con tu cuenta de Google autorizada para acceder a todos los módulos y funciones.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              className={`p-3.5 rounded-xl flex items-start gap-2.5 text-xs animate-fade-in border ${
                isDarkMode
                  ? "bg-rose-950/50 border-rose-800 text-rose-200"
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          {/* Single Google Sign-in Action */}
          <div className="space-y-4 pt-1">
            <button
              id="btn-google-sign-in"
              type="button"
              disabled={isLoading}
              onClick={handleGoogleSignIn}
              className={`w-full py-3 px-4 border rounded-xl shadow-xs transition flex items-center justify-center gap-3 font-bold text-sm cursor-pointer active:scale-[0.99] disabled:opacity-50 ${
                isDarkMode
                  ? "bg-slate-800 hover:bg-slate-750 text-white border-slate-700 shadow-slate-950/50"
                  : "bg-white hover:bg-gray-50 text-gray-800 border-gray-300 shadow-gray-200/50"
              }`}
            >
              {isLoading ? (
                <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
              ) : (
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{isLoading ? "Conectando con Google..." : "Continuar con Google"}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
