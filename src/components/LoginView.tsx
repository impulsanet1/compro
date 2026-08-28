/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { AlertCircle, Lock, Mail, Eye, EyeOff, LogIn, RefreshCw, KeyRound, Info, ExternalLink, Sun, Moon } from "lucide-react";
import { motion } from "motion/react";

export const LoginView: React.FC = () => {
  const { login, isDarkMode, toggleDarkMode } = useApp();
  const [email, setEmail] = useState("sergioruizv04@gmail.com");
  const [password, setPassword] = useState("sergio11");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthNotAllowedError, setIsAuthNotAllowedError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Por favor, ingrese el correo y la contraseña.");
      return;
    }

    setError(null);
    setIsAuthNotAllowedError(false);
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      console.error("Login error details:", err);
      let errMsg = "Credenciales incorrectas o error en el servidor.";
      
      if (err.code === "auth/operation-not-allowed" || (err.message && err.message.includes("operation-not-allowed"))) {
        setIsAuthNotAllowedError(true);
        errMsg = "El método de inicio de sesión por Correo/Contraseña está desactivado en tu Firebase Console.";
      } else if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        errMsg = "El correo o la contraseña son incorrectos.";
      } else if (err.message) {
        errMsg = err.message;
      }
      setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4 relative transition-colors duration-200 ${
      isDarkMode ? "bg-[#0b0f19] text-slate-100" : "bg-gray-50 text-gray-900"
    }`}>
      {/* Absolute theme toggle on Login page */}
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
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl tracking-tighter shadow-md">
            IN
          </div>
        </div>
        <h2 className={`mt-6 text-center text-2xl font-bold tracking-tight ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}>
          ImpulsaNet Admin
        </h2>
        <p className={`mt-2 text-center text-xs ${
          isDarkMode ? "text-slate-400" : "text-gray-500"
        }`}>
          Uso administrativo exclusivo e interno
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`py-8 px-4 sm:px-10 border sm:rounded-2xl space-y-6 shadow-xl ${
            isDarkMode
              ? "bg-slate-900/95 border-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              : "bg-white border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]"
          }`}
        >
          <div className={`text-center space-y-2 pb-2 border-b ${
            isDarkMode ? "border-slate-800" : "border-gray-100"
          }`}>
            <h3 className={`text-sm font-bold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
              Acceso Seguro
            </h3>
            <p className={`text-xs ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
              Inicie sesión de forma segura utilizando sus credenciales administrativas.
            </p>
          </div>

          {error && (
            <div className={`p-4 rounded-xl flex flex-col gap-2 text-xs animate-fade-in border ${
              isDarkMode
                ? "bg-red-950/50 border-red-800 text-red-300"
                : "bg-red-50 border-red-150 text-red-700"
            }`}>
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                <span className="font-semibold">{error}</span>
              </div>
              
              {isAuthNotAllowedError && (
                <div className={`mt-2.5 rounded-lg p-3 border space-y-2 ${
                  isDarkMode
                    ? "bg-slate-800/90 border-red-900 text-slate-200"
                    : "bg-white border-red-200 text-gray-700"
                }`}>
                  <p className={`font-bold flex items-center gap-1 ${
                    isDarkMode ? "text-red-400" : "text-red-800"
                  }`}>
                    <KeyRound className="w-3.5 h-3.5" />
                    ¿Cómo solucionar esto en Firebase?
                  </p>
                  <ol className="list-decimal pl-4 space-y-1.5 text-[11px] leading-relaxed">
                    <li>
                      Ingresa a tu <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 font-bold underline inline-flex items-center gap-0.5">Firebase Console <ExternalLink className="w-3 h-3" /></a>.
                    </li>
                    <li>
                      En el menú lateral izquierdo, ve a la sección de <strong className={isDarkMode ? "text-white" : "text-gray-900"}>Build / Construcción</strong> y selecciona <strong className={isDarkMode ? "text-white" : "text-gray-900"}>Authentication</strong>.
                    </li>
                    <li>
                      Haz clic en la pestaña superior que dice <strong className={isDarkMode ? "text-white" : "text-gray-900"}>Sign-in method</strong> (Método de inicio de sesión).
                    </li>
                    <li>
                      Haz clic en el botón <strong className={isDarkMode ? "text-white" : "text-gray-900"}>Add new provider</strong> (Agregar nuevo proveedor) y selecciona <strong className={isDarkMode ? "text-white" : "text-gray-900"}>Email/Password</strong> (Correo electrónico/contraseña).
                    </li>
                    <li>
                      Activa el interruptor <strong className={isDarkMode ? "text-white" : "text-gray-900"}>Enable / Habilitar</strong> (el primero, no es necesario habilitar "Email link") y haz clic en <strong className={isDarkMode ? "text-white" : "text-gray-900"}>Save / Guardar</strong>.
                    </li>
                  </ol>
                  <div className={`p-2.5 rounded-md text-[10px] mt-2 flex gap-1.5 border ${
                    isDarkMode
                      ? "bg-amber-950/40 border-amber-800/60 text-amber-300"
                      : "bg-amber-50 border-amber-150 text-amber-800"
                  }`}>
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Una vez habilitado, vuelve aquí, refresca la página e intenta iniciar sesión de nuevo. Se creará automáticamente tu cuenta.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                isDarkMode ? "text-slate-400" : "text-gray-400"
              }`}>
                Correo Electrónico
              </label>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className={`h-4 w-4 ${isDarkMode ? "text-slate-500" : "text-gray-400"}`} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  className={`block w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm transition font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                      : "bg-white border-gray-200 text-gray-800 placeholder-gray-400"
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${
                isDarkMode ? "text-slate-400" : "text-gray-400"
              }`}>
                Contraseña
              </label>
              <div className="relative rounded-xl shadow-2xs">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className={`h-4 w-4 ${isDarkMode ? "text-slate-500" : "text-gray-400"}`} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={`block w-full pl-9 pr-10 py-2.5 border rounded-xl text-sm transition font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                      : "bg-white border-gray-200 text-gray-800 placeholder-gray-400"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer ${
                    isDarkMode ? "text-slate-400 hover:text-slate-200" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 transition cursor-pointer mt-2 active:scale-[0.99]"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <LogIn className="w-4 h-4 mr-2" />
              )}
              Iniciar Sesión
            </button>
          </form>

          <p className={`text-[10px] text-center ${
            isDarkMode ? "text-slate-500" : "text-gray-400"
          }`}>
            Este sistema requiere una cuenta autorizada en la organización. Las credenciales solicitadas ya están pre-completadas para facilitar el acceso.
          </p>
        </motion.div>
      </div>
    </div>
  );
};
