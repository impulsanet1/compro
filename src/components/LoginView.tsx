/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useApp, AUTHORIZED_ADMIN_EMAIL } from "../context/AppContext";
import {
  AlertCircle,
  Sun,
  Moon,
  RefreshCw,
  Lock,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
  KeyRound,
  Mail,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const LoginView: React.FC = () => {
  const { loginWithGoogle, login, resetPassword, isDarkMode, toggleDarkMode } = useApp();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  // Backup direct access state
  const [showBackupLogin, setShowBackupLogin] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);

  const currentHostname = typeof window !== "undefined" ? window.location.hostname : "";
  const firebaseSettingsUrl = "https://console.firebase.google.com/project/gen-lang-client-0776513868/authentication/settings";

  const handleCopyDomain = async () => {
    try {
      await navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 3000);
    } catch {
      // Fallback if clipboard API restricted
      const textArea = document.createElement("textarea");
      textArea.value = currentHostname;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 3000);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsUnauthorizedDomain(false);
    setIsLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error("Google sign-in error:", err);
      const errCode = err?.code || "";
      const errMsgStr = err?.message || "";

      if (errCode === "auth/unauthorized-domain" || errMsgStr.includes("unauthorized-domain")) {
        setIsUnauthorizedDomain(true);
        setError("Este dominio aún no está autorizado en tu proyecto Firebase.");
      } else if (errCode === "auth/popup-closed-by-user") {
        setError("La ventana de inicio de sesión de Google fue cerrada antes de completar el acceso.");
      } else if (errCode === "auth/popup-blocked") {
        setError("El navegador bloqueó la ventana emergente de Google. Por favor permita las ventanas emergentes en este sitio.");
      } else if (err.message) {
        setError(err.message);
      } else {
        setError("No se pudo iniciar sesión con Google.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupPasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupPassword.trim()) {
      setError("Por favor ingresa tu contraseña de acceso.");
      return;
    }
    setError(null);
    setBackupSuccessMsg(null);
    setIsBackupLoading(true);
    try {
      await login(AUTHORIZED_ADMIN_EMAIL, backupPassword);
    } catch (err: any) {
      console.error("Backup password sign-in error:", err);
      let msg = "Contraseña incorrecta o cuenta no inicializada con clave.";
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        msg = "Contraseña incorrecta para estebanruiz.12vrgassergio@gmail.com.";
      } else if (err.code === "auth/user-not-found") {
        msg = "La cuenta aún no tiene contraseña configurada. Haz clic en 'Enviar enlace para crear contraseña'.";
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
    setError(null);
    setBackupSuccessMsg(null);
    setIsBackupLoading(true);
    try {
      await resetPassword(AUTHORIZED_ADMIN_EMAIL);
      setBackupSuccessMsg(
        `Se ha enviado un correo a ${AUTHORIZED_ADMIN_EMAIL}. Abre el enlace en tu correo para crear o restablecer tu contraseña y podrás entrar de inmediato desde cualquier dominio.`
      );
    } catch (err: any) {
      console.error("Send reset email error:", err);
      setError("No se pudo enviar el correo de recuperación. " + (err.message || ""));
    } finally {
      setIsBackupLoading(false);
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
          {error && !isUnauthorizedDomain && (
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

          {/* Success Message */}
          {backupSuccessMsg && (
            <div
              className={`p-3.5 rounded-xl flex items-start gap-2.5 text-xs animate-fade-in border ${
                isDarkMode
                  ? "bg-emerald-950/50 border-emerald-800 text-emerald-200"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}
            >
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              <div className="flex-1 font-medium leading-relaxed">{backupSuccessMsg}</div>
            </div>
          )}

          {/* Single Google Sign-in Action */}
          <div className="space-y-4 pt-1">
            <button
              id="btn-google-sign-in"
              type="button"
              disabled={isLoading || isBackupLoading}
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

          {/* SOLUTION FOR auth/unauthorized-domain */}
          {(isUnauthorizedDomain || showBackupLogin) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className={`p-4 rounded-xl border text-xs space-y-3.5 ${
                isDarkMode
                  ? "bg-amber-950/30 border-amber-800/80 text-amber-200"
                  : "bg-amber-50/90 border-amber-300 text-amber-900"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-sm text-amber-800 dark:text-amber-200">
                    Solución: Autorizar Dominio en Firebase
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300/90">
                    Al desplegar tu web, Firebase bloquea el acceso con Google hasta que agregues la URL de tu aplicación a los <strong>Dominios autorizados</strong>.
                  </p>
                </div>
              </div>

              {/* Detected Domain & Copy Button */}
              <div
                className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 font-mono text-[11px] ${
                  isDarkMode
                    ? "bg-slate-900/90 border-slate-700 text-slate-200"
                    : "bg-white border-amber-200 text-gray-800"
                }`}
              >
                <span className="truncate select-all font-semibold" title={currentHostname}>
                  {currentHostname || "localhost"}
                </span>
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    copiedDomain
                      ? "bg-emerald-600 text-white"
                      : isDarkMode
                      ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30"
                      : "bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300"
                  }`}
                >
                  {copiedDomain ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar dominio</span>
                    </>
                  )}
                </button>
              </div>

              {/* Steps Instructions */}
              <div className="space-y-1.5 text-[11px] leading-relaxed pl-1">
                <div className="font-bold text-amber-800 dark:text-amber-200">
                  Pasos para autorizarlo (tarda 30 segundos):
                </div>
                <ol className="list-decimal list-inside space-y-1 text-amber-700 dark:text-amber-300/80">
                  <li>
                    Haz clic en el botón de abajo para ir a la consola de Firebase.
                  </li>
                  <li>
                    Baja hasta la sección <strong>Dominios autorizados</strong> y haz clic en <strong>Agregar dominio</strong>.
                  </li>
                  <li>
                    Pega el dominio que copiaste y guarda los cambios.
                  </li>
                  <li>
                    Regresa aquí y haz clic en <strong>Continuar con Google</strong>.
                  </li>
                </ol>
              </div>

              {/* Direct Firebase Link Button */}
              <a
                href={firebaseSettingsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-3 rounded-lg font-bold text-xs bg-amber-600 hover:bg-amber-700 text-white flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99]"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Abrir Dominios Autorizados en Firebase</span>
              </a>

              {/* Instant Access Bypass */}
              <div className="pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
                <button
                  type="button"
                  onClick={() => setShowBackupLogin((prev) => !prev)}
                  className="w-full text-center text-[11px] font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>
                    {showBackupLogin
                      ? "Ocultar acceso directo por clave"
                      : "¿Deseas entrar ya mismo sin ir a la consola? Clic aquí"}
                  </span>
                  {showBackupLogin ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Backup Login Form */}
              <AnimatePresence>
                {showBackupLogin && (
                  <motion.form
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    onSubmit={handleBackupPasswordSignIn}
                    className="space-y-3 pt-2"
                  >
                    <div className="text-[11px] text-gray-600 dark:text-slate-400">
                      Acceso administrativo directo para <strong>{AUTHORIZED_ADMIN_EMAIL}</strong> (no depende de dominios autorizados de Google OAuth):
                    </div>
                    <div>
                      <input
                        type="password"
                        placeholder="Ingresa tu contraseña de administrador"
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                        className={`w-full px-3 py-2 text-xs rounded-lg border outline-none transition ${
                          isDarkMode
                            ? "bg-slate-900 border-slate-700 text-white focus:border-indigo-500"
                            : "bg-white border-gray-300 text-gray-900 focus:border-indigo-500"
                        }`}
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="submit"
                        disabled={isBackupLoading}
                        className="flex-1 py-2 px-3 rounded-lg font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                      >
                        {isBackupLoading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5" />
                        )}
                        <span>Iniciar Sesión con Clave</span>
                      </button>
                      <button
                        type="button"
                        disabled={isBackupLoading}
                        onClick={handleSendResetEmail}
                        className={`py-2 px-3 rounded-lg font-bold text-xs border flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer ${
                          isDarkMode
                            ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200"
                            : "bg-gray-100 hover:bg-gray-200 border-gray-200 text-gray-700"
                        }`}
                        title="Te envía un enlace al correo para crear tu clave si aún no la tienes"
                      >
                        <Mail className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Crear / Restablecer Clave</span>
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Quick Helper Toggle for First-time Deployers (when not already shown) */}
          {!isUnauthorizedDomain && !showBackupLogin && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsUnauthorizedDomain(true);
                  setShowBackupLogin(true);
                }}
                className={`text-[11px] font-medium transition cursor-pointer hover:underline ${
                  isDarkMode ? "text-slate-500 hover:text-slate-300" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                ¿La desplegaste y te sale error de dominio (auth/unauthorized-domain)? Ver solución
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
