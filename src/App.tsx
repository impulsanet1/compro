/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { LoginView } from "./components/LoginView";
import { DashboardView } from "./components/DashboardView";
import { GeneratorView } from "./components/GeneratorView";
import { HistoryView } from "./components/HistoryView";
import { ClientsView } from "./components/ClientsView";
import { ConfigView } from "./components/ConfigView";
import { SupplierWarrantyView } from "./components/SupplierWarrantyView";
import { QuoteCalculatorView } from "./components/QuoteCalculatorView";
import { ReceiptModal } from "./components/ReceiptModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Receipt, ReceiptItem, getSupplierWarrantyTimeStatus } from "./types";
import {
  TrendingUp,
  FileText,
  Users,
  Settings,
  PlusCircle,
  ShieldAlert,
  Sun,
  Moon,
  Calculator,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const Navigation: React.FC<{ activeTab: string; setActiveTab: (tab: string) => void }> = ({
  activeTab,
  setActiveTab
}) => {
  const { supplierWarranties, isDarkMode, toggleDarkMode } = useApp();

  // Count overdue or pending warranties for badge
  const overdueCount = React.useMemo(() => {
    return supplierWarranties.filter((w) => {
      if (w.status === "resuelto") return false;
      const info = getSupplierWarrantyTimeStatus(w);
      return info.isOverdue;
    }).length;
  }, [supplierWarranties]);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: TrendingUp },
    { id: "calculator", label: "Cotizador", icon: Calculator },
    { id: "generator", label: "Emitir", icon: PlusCircle },
    { id: "history", label: "Historial", icon: FileText },
    { id: "warranties", label: "Garantías", icon: ShieldAlert, badge: overdueCount > 0 ? overdueCount : undefined },
    { id: "clients", label: "Clientes", icon: Users },
    { id: "config", label: "Configuración", icon: Settings }
  ];

  return (
    <header className={`border-b sticky top-0 z-40 no-print transition-colors duration-200 shadow-2xs ${
      isDarkMode ? "bg-slate-900/95 border-slate-800 backdrop-blur-md" : "bg-white border-gray-200"
    }`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-5">
        <div className="flex justify-between h-13 sm:h-14 items-center">
          {/* Logo and Brand */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`font-black text-sm sm:text-base tracking-tight ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}>
              Impulsa<span className="text-indigo-500">Net</span>
            </span>
          </div>

          {/* Core Tabs Navigation */}
          <nav className="flex space-x-1 sm:space-x-1.5 overflow-x-auto py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-semibold transition relative cursor-pointer whitespace-nowrap touch-manipulation active:scale-95 ${
                    isActive
                      ? isDarkMode
                        ? "bg-indigo-950/90 text-indigo-300 font-bold border border-indigo-800/60 shadow-xs"
                        : "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100"
                      : isDarkMode
                      ? "text-slate-400 hover:text-white hover:bg-slate-800"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                  <span className="hidden md:inline">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className="ml-0.5 px-1.5 py-0.2 bg-red-600 text-white text-[10px] font-bold rounded-full animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Minimalist Theme Toggle Icon */}
          <div className="flex items-center shrink-0">
            <button
              id="btn-global-theme-toggle"
              type="button"
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg text-xs font-bold transition border cursor-pointer touch-manipulation active:scale-90 ${
                isDarkMode
                  ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-300 shadow-xs"
                  : "bg-gray-50 hover:bg-gray-100 border-gray-200 text-slate-700 shadow-2xs"
              }`}
              title={isDarkMode ? "Cambiar a Modo Día" : "Cambiar a Modo Noche"}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-300" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

const MainLayout: React.FC = () => {
  const { loadingData, businessConfig, receipts, isDarkMode } = useApp();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isEditModeModal, setIsEditModeModal] = useState<boolean>(false);
  const [transferredItemsFromQuote, setTransferredItemsFromQuote] = useState<Partial<ReceiptItem>[] | undefined>(undefined);

  // Handler to open receipt in view or edit mode
  const handleOpenReceipt = (receipt: Receipt, editMode: boolean = false) => {
    setSelectedReceipt(receipt);
    setIsEditModeModal(editMode);
  };

  // Handler to transfer quote items to Generator
  const handleTransferQuoteToReceipt = (items: Partial<ReceiptItem>[]) => {
    setTransferredItemsFromQuote(items);
    setActiveTab("generator");
  };

  // Sync selectedReceipt with latest data in receipts collection
  const activeSelectedReceipt = React.useMemo(() => {
    if (!selectedReceipt) return null;
    return receipts.find((r) => r.id === selectedReceipt.id) || selectedReceipt;
  }, [selectedReceipt, receipts]);

  if (loadingData) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-3 transition-colors ${
        isDarkMode ? "bg-[#0b0f19] text-slate-100" : "bg-white text-gray-900"
      }`}>
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className={`text-xs font-semibold tracking-wider uppercase ${
          isDarkMode ? "text-slate-400" : "text-gray-500"
        }`}>
          Sincronizando con Firebase...
        </span>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardView onViewChange={setActiveTab} onSelectReceipt={handleOpenReceipt} />;
      case "calculator":
        return <QuoteCalculatorView />;
      case "generator":
        return (
          <GeneratorView
            key={transferredItemsFromQuote ? "transferred_" + transferredItemsFromQuote.length : "normal"}
            initialItems={transferredItemsFromQuote}
            onReceiptGenerated={(r) => {
              setTransferredItemsFromQuote(undefined);
              handleOpenReceipt(r, false);
            }}
          />
        );
      case "history":
        return <HistoryView onSelectReceipt={handleOpenReceipt} />;
      case "warranties":
        return <SupplierWarrantyView onSelectReceipt={handleOpenReceipt} />;
      case "clients":
        return <ClientsView onSelectReceipt={handleOpenReceipt} />;
      case "config":
        return <ConfigView />;
      default:
        return <DashboardView onViewChange={setActiveTab} />;
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      isDarkMode ? "bg-[#0b0f19] text-slate-100" : "bg-gray-50/50 text-gray-900"
    }`}>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* View Wrapper */}
      <main className="flex-1 py-6 md:py-8">
        <ErrorBoundary key={activeTab}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15, ease: "easeInOut" }}
            >
              {renderActiveView()}
            </motion.div>
          </AnimatePresence>
        </ErrorBoundary>
      </main>

      {/* Floating Receipt Viewing Modal */}
      <AnimatePresence>
        {activeSelectedReceipt && (
          <ErrorBoundary key={activeSelectedReceipt.id}>
            <ReceiptModal
              receipt={activeSelectedReceipt}
              initialIsEditing={isEditModeModal}
              onClose={() => {
                setSelectedReceipt(null);
                setIsEditModeModal(false);
              }}
              businessName={businessConfig.businessName}
              whatsapp={businessConfig.whatsapp}
            />
          </ErrorBoundary>
        )}
      </AnimatePresence>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, loadingAuth, isDarkMode } = useApp();

  if (loadingAuth) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center gap-3 transition-colors ${
        isDarkMode ? "bg-[#0b0f19] text-slate-100" : "bg-white text-gray-900"
      }`}>
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className={`text-xs font-semibold tracking-wider uppercase ${
          isDarkMode ? "text-slate-400" : "text-gray-500"
        }`}>
          Verificando credenciales...
        </span>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
