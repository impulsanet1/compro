/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { useApp } from "../context/AppContext";
import {
  Save,
  Plus,
  Trash2,
  Edit2,
  Settings,
  Share2,
  Phone,
  ShieldAlert,
  Sliders,
  Check,
  AlertCircle,
  AlertTriangle,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Send,
  AtSign,
  Video,
  Calculator,
  Sparkles,
  X,
  DollarSign,
  RefreshCw,
  CreditCard,
  Smartphone,
  Globe,
  PackageOpen
} from "lucide-react";
import {
  BusinessConfig,
  SocialNetwork,
  Service,
  ServiceCombo,
  ServiceComboItem,
  getServiceBaseCosts,
  calculateServicePrices
} from "../types";
import { motion, AnimatePresence } from "motion/react";

export const ConfigView: React.FC = () => {
  const {
    businessConfig,
    socialNetworks,
    services,
    combos,
    trmState,
    updateBusinessConfig,
    addSocialNetwork,
    updateSocialNetwork,
    deleteSocialNetwork,
    addService,
    updateService,
    deleteService,
    addCombo,
    updateCombo,
    deleteCombo,
    restoreDefaults,
    isDarkMode
  } = useApp();

  const formatCOP = (val: number) => "$" + Math.round(val).toLocaleString("es-CO");

  // Tab systems or section selectors
  const [activeTab, setActiveTab] = useState<"general" | "services" | "combos">("general");

  // General Settings state
  const [bName, setBName] = useState(businessConfig.businessName);
  const [bLogoUrl, setBLogoUrl] = useState(businessConfig.logoUrl);
  const [bWhatsapp, setBWhatsapp] = useState(businessConfig.whatsapp);
  const [bWarranty, setBWarranty] = useState(businessConfig.warrantyDays.toString());

  // Message states
  const [generalSuccess, setGeneralSuccess] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Social network forms state
  const [editingSnId, setEditingSnId] = useState<string | null>(null);
  const [snNameInput, setSnNameInput] = useState("");
  const [snIconInput, setSnIconInput] = useState("Instagram");
  const [showAddSnForm, setShowAddSnForm] = useState(false);
  const [deletingSnId, setDeletingSnId] = useState<string | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [deletingComboId, setDeletingComboId] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  // Services state
  const [selectedSocialId, setSelectedSocialId] = useState(socialNetworks[0]?.id || "");
  const [showAddServiceForm, setShowAddServiceForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceCostPer1000, setNewServiceCostPer1000] = useState("1810");
  const [newServiceCostUSDPer1000, setNewServiceCostUSDPer1000] = useState("");
  const [newServicePricePer1000, setNewServicePricePer1000] = useState("15000");

  // Currently selected service in "Centro de Costos"
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  // Form states for selected service base costs
  const [editProviderCost, setEditProviderCost] = useState<string>("");
  const [editProviderCostUSD, setEditProviderCostUSD] = useState<string>("");
  const [editSuggestedPrice, setEditSuggestedPrice] = useState<string>("");
  const [editPresetsStr, setEditPresetsStr] = useState<string>("");
  const [serviceSavedSuccess, setServiceSavedSuccess] = useState<boolean>(false);
  const [serviceErrorMessage, setServiceErrorMessage] = useState<string | null>(null);

  // Live calculator test quantity
  const [testQuantity, setTestQuantity] = useState<string>("3250");

  // Combos tab state
  const [editingComboId, setEditingComboId] = useState<string | null>(null);
  const [comboNameInput, setComboNameInput] = useState("");
  const [comboDescInput, setComboDescInput] = useState("");
  const [comboSocialInput, setComboSocialInput] = useState("tiktok");
  const [comboPriceInput, setComboPriceInput] = useState("");
  const [comboItemsInput, setComboItemsInput] = useState<ServiceComboItem[]>([
    { socialNetworkId: "tiktok", serviceId: "tt-likes", quantity: 2000, allocatedPrice: 12000 },
    { socialNetworkId: "tiktok", serviceId: "tt-views", quantity: 5000, allocatedPrice: 6000 }
  ]);
  const [showAddComboForm, setShowAddComboForm] = useState(false);
  const [comboSuccessMessage, setComboSuccessMessage] = useState<string | null>(null);
  const [comboErrorMessage, setComboErrorMessage] = useState<string | null>(null);

  // Filtered services for the currently selected social network
  const currentServices = useMemo(() => {
    return services.filter((s) => s.socialNetworkId === selectedSocialId);
  }, [services, selectedSocialId]);

  // Ensure selectedSocialId defaults to first available social network
  useEffect(() => {
    if (!selectedSocialId && socialNetworks.length > 0) {
      setSelectedSocialId(socialNetworks[0].id);
    }
  }, [socialNetworks, selectedSocialId]);

  // Selected service object
  const selectedServiceObj = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || null;
  }, [services, selectedServiceId]);

  // Sync selected service form fields when selected service changes or TRM updates
  useEffect(() => {
    if (selectedServiceObj) {
      const baseCosts = getServiceBaseCosts(selectedServiceObj);
      const usdVal = selectedServiceObj.providerCostUSDPer1000;
      const hasUSD = usdVal !== undefined && usdVal !== null && !isNaN(usdVal) && usdVal > 0;
      setEditProviderCostUSD(hasUSD ? usdVal.toString() : "");

      if (hasUSD && trmState.valor && trmState.valor > 0) {
        setEditProviderCost(Math.round(usdVal * trmState.valor).toString());
      } else {
        setEditProviderCost(baseCosts.providerCostPer1000.toString());
      }

      setEditSuggestedPrice(baseCosts.suggestedPricePer1000.toString());
      setEditPresetsStr(baseCosts.presets.join(", "));
    }
  }, [selectedServiceObj, trmState.valor]);

  // Handler when user changes USD cost field
  const handleUSDChange = (val: string) => {
    setEditProviderCostUSD(val);
    const usdNum = parseFloat(val);
    if (!isNaN(usdNum) && usdNum > 0 && trmState.valor && trmState.valor > 0) {
      const calculatedCOP = Math.round(usdNum * trmState.valor);
      setEditProviderCost(calculatedCOP.toString());
    }
  };

  // Handler when user changes USD cost in new service modal
  const handleNewUSDChange = (val: string) => {
    setNewServiceCostUSDPer1000(val);
    const usdNum = parseFloat(val);
    if (!isNaN(usdNum) && usdNum > 0 && trmState.valor && trmState.valor > 0) {
      const calculatedCOP = Math.round(usdNum * trmState.valor);
      setNewServiceCostPer1000(calculatedCOP.toString());
    }
  };

  // Auto select first service when social network changes if none selected
  useEffect(() => {
    if (currentServices.length > 0 && (!selectedServiceId || !currentServices.some(s => s.id === selectedServiceId))) {
      setSelectedServiceId(currentServices[0].id);
    }
  }, [selectedSocialId, currentServices, selectedServiceId]);

  // Save General settings
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setGeneralSuccess(false);

    const wDays = parseInt(bWarranty);
    if (isNaN(wDays) || wDays < 0) {
      setGeneralError("La garantía debe ser un número entero de días válido.");
      return;
    }

    try {
      await updateBusinessConfig({
        businessName: bName.trim(),
        logoUrl: bLogoUrl.trim(),
        whatsapp: bWhatsapp.trim(),
        warrantyDays: wDays
      });
      setGeneralSuccess(true);
      setTimeout(() => setGeneralSuccess(false), 3000);
    } catch (err: any) {
      setGeneralError(err.message || "Error al actualizar la configuración general.");
    }
  };

  // Create or Update Social Network
  const handleSaveSocialNetwork = async () => {
    if (!snNameInput.trim()) return;

    const snId = editingSnId || snNameInput.trim().toLowerCase().replace(/\s+/g, "-");
    const newSn: SocialNetwork = {
      id: snId,
      name: snNameInput.trim(),
      icon: snIconInput
    };

    try {
      if (editingSnId) {
        await updateSocialNetwork(newSn);
      } else {
        await addSocialNetwork(newSn);
      }
      setSnNameInput("");
      setEditingSnId(null);
      setShowAddSnForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Create Service in Cost Center
  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServiceName.trim() || !selectedSocialId) return;

    const cost1000 = parseFloat(newServiceCostPer1000) || 1810;
    const costUSD1000 = parseFloat(newServiceCostUSDPer1000);
    const price1000 = parseFloat(newServicePricePer1000) || 15000;

    const srvId = `${selectedSocialId}-${newServiceName.trim().toLowerCase().replace(/\s+/g, "-")}`;
    const newSrv: Service = {
      id: srvId,
      socialNetworkId: selectedSocialId,
      name: newServiceName.trim(),
      providerCostPer1000: cost1000,
      providerCostUSDPer1000: !isNaN(costUSD1000) && costUSD1000 > 0 ? costUSD1000 : undefined,
      suggestedPricePer1000: price1000,
      customPresets: [1000, 2000, 5000, 10000],
      quantities: [
        { id: `${srvId}-1000`, quantity: 1000, providerCost: cost1000, suggestedPrice: price1000, active: true },
        { id: `${srvId}-2000`, quantity: 2000, providerCost: cost1000 * 2, suggestedPrice: price1000 * 2, active: true },
        { id: `${srvId}-5000`, quantity: 5000, providerCost: cost1000 * 5, suggestedPrice: price1000 * 5, active: true },
        { id: `${srvId}-10000`, quantity: 10000, providerCost: cost1000 * 10, suggestedPrice: price1000 * 10, active: true }
      ]
    };

    try {
      await addService(newSrv);
      setNewServiceName("");
      setNewServiceCostUSDPer1000("");
      setShowAddServiceForm(false);
      setSelectedServiceId(srvId);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Service
  const handleDeleteService = async (id: string) => {
    try {
      await deleteService(id);
      if (selectedServiceId === id) {
        setSelectedServiceId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Save changes to selected service base cost
  const handleSaveServiceBaseCosts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceObj) return;

    const pCostUSD = parseFloat(editProviderCostUSD);
    let pCost = parseFloat(editProviderCost);

    if (!isNaN(pCostUSD) && pCostUSD > 0 && trmState.valor && trmState.valor > 0) {
      pCost = Math.round(pCostUSD * trmState.valor);
    }

    const sPrice = parseFloat(editSuggestedPrice);

    if (isNaN(pCost) || pCost < 0 || isNaN(sPrice) || sPrice < 0) {
      setServiceErrorMessage("Por favor ingrese montos numéricos válidos por cada 1.000 unidades.");
      setTimeout(() => setServiceErrorMessage(null), 3500);
      return;
    }

    // Parse presets string e.g. "1000, 2000, 5000, 10000"
    const parsedPresets = editPresetsStr
      .split(/[,;\s]+/)
      .map((p) => parseInt(p))
      .filter((p) => !isNaN(p) && p > 0);

    const finalPresets = parsedPresets.length > 0 ? parsedPresets : [1000, 2000, 5000, 10000];

    // Build legacy quantities list for total compatibility
    const updatedQuantities = finalPresets.map((qty) => ({
      id: `${selectedServiceObj.id}-${qty}`,
      quantity: qty,
      providerCost: Math.round((qty / 1000) * pCost),
      suggestedPrice: Math.round((qty / 1000) * sPrice),
      active: true
    }));

    const finalCostUSD = !isNaN(pCostUSD) && pCostUSD > 0 ? pCostUSD : undefined;

    try {
      await updateService({
        ...selectedServiceObj,
        providerCostPer1000: pCost,
        providerCostUSDPer1000: finalCostUSD,
        suggestedPricePer1000: sPrice,
        customPresets: finalPresets,
        quantities: updatedQuantities
      });

      setServiceSavedSuccess(true);
      setTimeout(() => setServiceSavedSuccess(false), 2500);
    } catch (err) {
      console.error("Error al actualizar costos del servicio:", err);
    }
  };

  // Combos action helpers
  const handleOpenAddCombo = () => {
    setEditingComboId(null);
    setComboNameInput("");
    setComboDescInput("");
    setComboSocialInput(socialNetworks[0]?.id || "tiktok");
    setComboPriceInput("");
    setComboItemsInput([
      { socialNetworkId: "tiktok", serviceId: "tt-likes", quantity: 2000, allocatedPrice: 12000 },
      { socialNetworkId: "tiktok", serviceId: "tt-views", quantity: 5000, allocatedPrice: 6000 }
    ]);
    setShowAddComboForm(true);
  };

  const handleOpenEditCombo = (combo: ServiceCombo) => {
    setEditingComboId(combo.id);
    setComboNameInput(combo.name);
    setComboDescInput(combo.description || "");
    setComboSocialInput(combo.socialNetworkId);
    setComboPriceInput(combo.comboPrice.toString());
    setComboItemsInput(
      combo.items && combo.items.length > 0
        ? JSON.parse(JSON.stringify(combo.items))
        : [{ socialNetworkId: combo.socialNetworkId, serviceId: "", quantity: 1000, allocatedPrice: combo.comboPrice }]
    );
    setShowAddComboForm(true);
  };

  const handleSaveCombo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comboNameInput.trim()) return;

    const priceNum = parseFloat(comboPriceInput);
    if (isNaN(priceNum) || priceNum < 0) return;

    const comboId = editingComboId || `combo-${Date.now()}`;
    const newCombo: ServiceCombo = {
      id: comboId,
      name: comboNameInput.trim(),
      description: comboDescInput.trim() || undefined,
      socialNetworkId: comboSocialInput,
      comboPrice: priceNum,
      active: true,
      items: comboItemsInput.map((itm) => ({
        ...itm,
        quantity: Math.max(1, itm.quantity),
        allocatedPrice: itm.allocatedPrice || 0
      }))
    };

    try {
      if (editingComboId) {
        await updateCombo(newCombo);
        setComboSuccessMessage("¡Combo actualizado con éxito!");
      } else {
        await addCombo(newCombo);
        setComboSuccessMessage("¡Nuevo combo creado con éxito!");
      }
      setShowAddComboForm(false);
      setTimeout(() => setComboSuccessMessage(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCombo = async (id: string) => {
    try {
      await deleteCombo(id);
      setComboSuccessMessage("¡Combo eliminado exitosamente!");
      setTimeout(() => setComboSuccessMessage(null), 2500);
    } catch (err: any) {
      console.error("Error al eliminar combo:", err);
      setComboErrorMessage(err.message || "Error al eliminar combo.");
      setTimeout(() => setComboErrorMessage(null), 3500);
    }
  };

  // Render social network icon helper
  const renderSocialIcon = (iconName: string, className = "w-4 h-4") => {
    switch (iconName) {
      case "Instagram":
        return <Instagram className={className} />;
      case "Facebook":
        return <Facebook className={className} />;
      case "Youtube":
        return <Youtube className={className} />;
      case "Twitter":
        return <Twitter className={className} />;
      case "Send":
        return <Send className={className} />;
      case "AtSign":
        return <AtSign className={className} />;
      case "Video":
        return <Video className={className} />;
      case "CreditCard":
        return <CreditCard className={className} />;
      case "Smartphone":
        return <Smartphone className={className} />;
      case "Globe":
        return <Globe className={className} />;
      case "Sparkles":
        return <Sparkles className={className} />;
      default:
        return <Share2 className={className} />;
    }
  };

  return (
    <div className={`space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-2 transition-colors duration-200 ${isDarkMode ? "text-slate-100" : "text-gray-900"}`}>
      <div>
        <h2 className={`text-xl font-bold tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          Configuración del Sistema
        </h2>
        <p className={`text-xs mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
          Administre la información del negocio, redes de venta y el centro de costos por unidad
        </p>
      </div>

      {/* Selector Tabs */}
      <div className={`flex border-b gap-4 text-xs font-semibold ${isDarkMode ? "border-slate-800" : "border-gray-200"}`}>
        <button
          onClick={() => setActiveTab("general")}
          className={`pb-3 border-b-2 px-1 transition cursor-pointer ${
            activeTab === "general"
              ? "border-indigo-500 text-indigo-400 font-bold"
              : isDarkMode
              ? "border-transparent text-slate-400 hover:text-slate-200"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          General y Redes
        </button>
        <button
          onClick={() => {
            setActiveTab("services");
            if (socialNetworks.length > 0 && !selectedSocialId) {
              setSelectedSocialId(socialNetworks[0].id);
            }
          }}
          className={`pb-3 border-b-2 px-1 transition cursor-pointer ${
            activeTab === "services"
              ? "border-indigo-500 text-indigo-400 font-bold"
              : isDarkMode
              ? "border-transparent text-slate-400 hover:text-slate-200"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          Centro de Costos Inteligente
        </button>
        <button
          onClick={() => setActiveTab("combos")}
          className={`pb-3 border-b-2 px-1 transition cursor-pointer flex items-center gap-1.5 ${
            activeTab === "combos"
              ? "border-indigo-500 text-indigo-400 font-bold"
              : isDarkMode
              ? "border-transparent text-slate-400 hover:text-slate-200"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          <PackageOpen className="w-3.5 h-3.5" />
          <span>Combos y Paquetes</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tab 1: General Settings & Social Networks */}
        {activeTab === "general" && (
          <>
            {/* General Info Column */}
            <div className="lg:col-span-5 space-y-6">
              <form
                onSubmit={handleSaveGeneral}
                className={`rounded-xl border p-6 shadow-sm space-y-4 transition ${
                  isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
                }`}
              >
                <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b ${
                  isDarkMode ? "text-slate-400 border-slate-800" : "text-gray-400 border-gray-100"
                }`}>
                  <Settings className="w-4 h-4 text-indigo-400" />
                  Información del Negocio
                </h3>

                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${isDarkMode ? "text-slate-300" : "text-gray-600"}`}>
                    Nombre del Negocio
                  </label>
                  <input
                    type="text"
                    required
                    value={bName}
                    onChange={(e) => setBName(e.target.value)}
                    placeholder="Ej. ImpulsaNet"
                    className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                        : "bg-white border-gray-200 text-gray-900"
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${isDarkMode ? "text-slate-300" : "text-gray-600"}`}>
                    Enlace del Logo (Opcional)
                  </label>
                  <input
                    type="text"
                    value={bLogoUrl}
                    onChange={(e) => setBLogoUrl(e.target.value)}
                    placeholder="Dejar vacío para usar texto predeterminado"
                    className={`mt-1 block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                      isDarkMode
                        ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                        : "bg-white border-gray-200 text-gray-900"
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${isDarkMode ? "text-slate-300" : "text-gray-600"}`}>
                    WhatsApp de Soporte
                  </label>
                  <div className="mt-1 relative rounded-md shadow-2xs">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className={`h-4 w-4 ${isDarkMode ? "text-slate-500" : "text-gray-400"}`} />
                    </div>
                    <input
                      type="text"
                      required
                      value={bWhatsapp}
                      onChange={(e) => setBWhatsapp(e.target.value)}
                      placeholder="573208354198"
                      className={`block w-full pl-10 pr-3 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                          : "bg-white border-gray-200 text-gray-900"
                      }`}
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-[11px] font-semibold uppercase ${isDarkMode ? "text-slate-300" : "text-gray-600"}`}>
                    Garantía Predeterminada (Días)
                  </label>
                  <div className="mt-1 relative rounded-md shadow-2xs">
                    <input
                      type="number"
                      required
                      value={bWarranty}
                      onChange={(e) => setBWarranty(e.target.value)}
                      placeholder="30"
                      className={`block w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                        isDarkMode
                          ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500"
                          : "bg-white border-gray-200 text-gray-900"
                      }`}
                    />
                  </div>
                  <p className={`text-[10px] mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                    Este número se convertirá automáticamente en la garantía sugerida del comprobante.
                  </p>
                </div>

                {generalError && (
                  <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex items-start gap-2 text-xs text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{generalError}</span>
                  </div>
                )}

                {generalSuccess && (
                  <div className="bg-indigo-500/10 border border-indigo-500/30 p-3 rounded-lg flex items-center gap-1.5 text-xs text-indigo-300">
                    <Check className="w-4 h-4 text-indigo-400" />
                    <span>Cambios guardados con éxito en Firebase.</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition cursor-pointer"
                >
                  <Save className="w-4 h-4 mr-1.5" />
                  Guardar Información
                </button>
              </form>

              {/* Restore Defaults Block */}
              <div className={`rounded-xl p-5 space-y-3.5 border transition ${
                isDarkMode ? "bg-red-950/20 border-red-900/40" : "bg-red-50/40 border-red-100"
              }`}>
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className={`text-xs font-bold ${isDarkMode ? "text-red-300" : "text-gray-800"}`}>Zona de Restauración</h4>
                    <p className={`text-[10.5px] mt-0.5 leading-relaxed ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                      ¿Deseas restaurar la configuración completa de redes y centro de costos a los valores originales?
                    </p>
                  </div>
                </div>
                
                {showRestoreConfirm ? (
                  <div className={`space-y-2 p-3 rounded-lg border text-xs ${
                    isDarkMode ? "bg-red-950/60 border-red-800/60 text-red-200" : "bg-red-100/50 border-red-200 text-red-800"
                  }`}>
                    <p className="font-bold text-[10.5px] leading-snug">
                      ¿Estás seguro de restablecer el centro de costos a valores por defecto?
                    </p>
                    <div className="flex gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await restoreDefaults();
                            setShowRestoreConfirm(false);
                            window.location.reload();
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="flex-1 py-1.5 px-2 bg-red-600 hover:bg-red-700 text-white rounded text-[10.5px] font-bold cursor-pointer transition text-center"
                      >
                        Sí, Restablecer
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowRestoreConfirm(false)}
                        className={`flex-1 py-1.5 px-2 rounded text-[10.5px] font-semibold cursor-pointer transition text-center border ${
                          isDarkMode
                            ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                            : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirm(true)}
                    className={`w-full flex justify-center items-center py-2 px-4 border rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs ${
                      isDarkMode
                        ? "bg-slate-900 border-red-900/60 text-red-400 hover:bg-red-950/40"
                        : "bg-white border-red-200 text-red-700 hover:bg-red-50"
                    }`}
                  >
                    Restaurar Precios de Fábrica
                  </button>
                )}
              </div>
            </div>

            {/* Social Networks Admin Column */}
            <div className={`lg:col-span-7 rounded-xl border p-6 shadow-sm space-y-6 transition ${
              isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
            }`}>
              <div className={`flex justify-between items-center border-b pb-3 ${
                isDarkMode ? "border-slate-800" : "border-gray-100"
              }`}>
                <h3 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  isDarkMode ? "text-slate-400" : "text-gray-400"
                }`}>
                  <Share2 className="w-4 h-4 text-indigo-400" />
                  Redes Sociales y Categorías de Venta
                </h3>
                <button
                  onClick={() => {
                    setEditingSnId(null);
                    setSnNameInput("");
                    setSnIconInput("Instagram");
                    setShowAddSnForm(!showAddSnForm);
                  }}
                  className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Red o Categoría
                </button>
              </div>

              {/* Collapsible form to create/edit social networks */}
              <AnimatePresence>
                {showAddSnForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`rounded-xl p-4 border space-y-3 overflow-hidden ${
                      isDarkMode ? "bg-slate-800/80 border-slate-700" : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <h4 className={`text-xs font-bold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
                      {editingSnId ? "Editar Red o Categoría" : "Nueva Red o Categoría"}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className={`block text-[10px] font-semibold uppercase ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                          Nombre (Ej. Tarjetas Digitales, Instagram)
                        </label>
                        <input
                          type="text"
                          value={snNameInput}
                          onChange={(e) => setSnNameInput(e.target.value)}
                          placeholder="Ej. Tarjetas Digitales"
                          className={`mt-1 block w-full px-3 py-1.5 border rounded-lg transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                            isDarkMode
                              ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500"
                              : "bg-white border-gray-200 text-gray-900"
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`block text-[10px] font-semibold uppercase ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                          Icono
                        </label>
                        <select
                          value={snIconInput}
                          onChange={(e) => setSnIconInput(e.target.value)}
                          className={`mt-1 block w-full px-3 py-1.5 border rounded-lg transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                            isDarkMode
                              ? "bg-slate-900 border-slate-700 text-white"
                              : "bg-white border-gray-200 text-gray-900"
                          }`}
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="Facebook">Facebook</option>
                          <option value="Youtube">Youtube</option>
                          <option value="Twitter">X (Twitter)</option>
                          <option value="Send">Telegram</option>
                          <option value="AtSign">Threads</option>
                          <option value="Video">TikTok</option>
                          <option value="CreditCard">💳 Tarjeta Digital (NFC/Virtual)</option>
                          <option value="Globe">🌐 Web / Dominio</option>
                          <option value="Smartphone">📱 App / Móvil</option>
                          <option value="Sparkles">✨ Servicios Especiales</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-xs pt-1">
                      <button
                        onClick={() => setShowAddSnForm(false)}
                        className={`px-3 py-1 border rounded-md transition cursor-pointer ${
                          isDarkMode
                            ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-700"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveSocialNetwork}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition cursor-pointer"
                      >
                        {editingSnId ? "Actualizar" : "Crear"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Social Networks List Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {socialNetworks.map((sn) => (
                  <div
                    key={sn.id}
                    className={`p-4 border rounded-xl flex items-center justify-between transition ${
                      isDarkMode
                        ? "border-slate-800 bg-slate-800/40 hover:bg-slate-800/70"
                        : "border-gray-200 bg-white hover:bg-gray-50/40"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg border ${
                        isDarkMode ? "bg-indigo-950/60 text-indigo-400 border-indigo-900" : "bg-indigo-50 text-indigo-600 border-indigo-100/50"
                      }`}>
                        {renderSocialIcon(sn.icon)}
                      </div>
                      <span className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>{sn.name}</span>
                    </div>

                    {deletingSnId === sn.id ? (
                      <div className="flex items-center gap-1.5 animate-fade-in bg-red-500/10 p-1.5 rounded-lg border border-red-500/30">
                        <span className="text-[9px] font-bold text-red-400 uppercase">¿Borrar?</span>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await deleteSocialNetwork(sn.id);
                              if (selectedSocialId === sn.id) {
                                setSelectedSocialId(socialNetworks.find((s) => s.id !== sn.id)?.id || "");
                              }
                            } catch (err) {
                              console.error(err);
                            } finally {
                              setDeletingSnId(null);
                            }
                          }}
                          className="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer transition"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSnId(null)}
                          className={`border text-[10px] px-2 py-0.5 rounded font-bold cursor-pointer transition ${
                            isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-white border-gray-200 text-gray-700"
                          }`}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSnId(sn.id);
                            setSnNameInput(sn.name);
                            setSnIconInput(sn.icon);
                            setShowAddSnForm(true);
                          }}
                          className={`p-1 rounded-md transition cursor-pointer ${
                            isDarkMode ? "text-slate-400 hover:text-indigo-400 hover:bg-slate-800" : "text-gray-400 hover:text-indigo-600 hover:bg-gray-100"
                          }`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSnId(sn.id)}
                          className={`p-1 rounded-md transition cursor-pointer ${
                            isDarkMode ? "text-red-400 hover:text-red-300 hover:bg-slate-800" : "text-red-400 hover:text-red-600 hover:bg-red-50"
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Tab 2: Centro de Costos Inteligente */}
        {activeTab === "services" && (
          <>
            {/* Left selector sidebar (Services) */}
            <div className={`lg:col-span-4 rounded-xl border p-5 shadow-sm space-y-4 flex flex-col justify-between animate-fade-in min-h-[580px] transition ${
              isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
            }`}>
              <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                {/* Select Social Network */}
                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider ${
                    isDarkMode ? "text-slate-400" : "text-gray-400"
                  }`}>Red Activa</label>
                  <select
                    value={selectedSocialId}
                    onChange={(e) => {
                      setSelectedSocialId(e.target.value);
                      setSelectedServiceId(null);
                    }}
                    className={`mt-1 block w-full px-3 py-1.5 border rounded-lg text-xs transition font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                      isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-800"
                    }`}
                  >
                    {socialNetworks.map((sn) => (
                      <option key={sn.id} value={sn.id}>
                        {sn.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`border-t pt-3 flex-1 flex flex-col overflow-hidden ${
                  isDarkMode ? "border-slate-800" : "border-gray-150"
                }`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      isDarkMode ? "text-slate-400" : "text-gray-400"
                    }`}>Servicios ({currentServices.length})</span>
                    <button
                      onClick={() => setShowAddServiceForm(!showAddServiceForm)}
                      className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Nuevo Servicio
                    </button>
                  </div>

                  {/* Form to create service */}
                  <AnimatePresence>
                    {showAddServiceForm && (
                      <motion.form
                        onSubmit={handleAddService}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`rounded-xl p-3 border space-y-2 mb-3 overflow-hidden text-xs ${
                          isDarkMode ? "bg-slate-800/90 border-slate-700" : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <div>
                          <label className={`block text-[10px] font-semibold uppercase ${
                            isDarkMode ? "text-slate-400" : "text-gray-500"
                          }`}>Nombre Servicio</label>
                          <input
                            type="text"
                            required
                            value={newServiceName}
                            onChange={(e) => setNewServiceName(e.target.value)}
                            placeholder="Ej. Seguidores Reales, Likes..."
                            className={`w-full px-2.5 py-1.5 border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                              isDarkMode ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500" : "bg-white border-gray-200 text-gray-900"
                            }`}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <div>
                            <label className={`block text-[9px] font-semibold uppercase ${
                              isDarkMode ? "text-slate-400" : "text-gray-500"
                            }`}>Costo USD / 1K</label>
                            <input
                              type="number"
                              step="any"
                              value={newServiceCostUSDPer1000}
                              onChange={(e) => handleNewUSDChange(e.target.value)}
                              placeholder="1.07"
                              className={`w-full px-2 py-1 border rounded text-xs font-mono ${
                                isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
                              }`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[9px] font-semibold uppercase ${
                              isDarkMode ? "text-slate-400" : "text-gray-500"
                            }`}>Costo COP / 1K</label>
                            <input
                              type="number"
                              required
                              value={newServiceCostPer1000}
                              onChange={(e) => setNewServiceCostPer1000(e.target.value)}
                              className={`w-full px-2 py-1 border rounded text-xs font-mono ${
                                isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
                              }`}
                            />
                          </div>
                          <div>
                            <label className={`block text-[9px] font-semibold uppercase ${
                              isDarkMode ? "text-slate-400" : "text-gray-500"
                            }`}>Precio / 1K</label>
                            <input
                              type="number"
                              required
                              value={newServicePricePer1000}
                              onChange={(e) => setNewServicePricePer1000(e.target.value)}
                              className={`w-full px-2 py-1 border rounded text-xs font-mono ${
                                isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
                              }`}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-1.5 text-[10px] pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAddServiceForm(false)}
                            className={`px-2.5 py-1 border rounded cursor-pointer ${
                              isDarkMode ? "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-700" : "bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                            }`}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-2.5 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer font-bold"
                          >
                            Crear Servicio
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* Services List scrollable */}
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {currentServices.length === 0 ? (
                      <div className={`py-12 text-center italic text-xs ${
                        isDarkMode ? "text-slate-500" : "text-gray-400"
                      }`}>
                        No hay servicios para esta red.
                      </div>
                    ) : (
                      currentServices.map((srv) => {
                        const isSelected = selectedServiceId === srv.id;
                        const baseCosts = getServiceBaseCosts(srv);
                        return (
                          <div
                            key={srv.id}
                            className={`w-full flex items-center justify-between rounded-xl p-3 text-xs transition border ${
                              isSelected
                                ? isDarkMode
                                  ? "bg-indigo-950/70 border-indigo-600/60 text-white shadow-sm font-semibold ring-1 ring-indigo-500/30"
                                  : "bg-indigo-50/70 border-indigo-200 text-indigo-900 shadow-2xs font-semibold"
                                : isDarkMode
                                ? "bg-slate-800/40 border-slate-800 hover:bg-slate-800 text-slate-200"
                                : "bg-white border-gray-200/80 hover:bg-gray-50/60 text-gray-700"
                            }`}
                          >
                            <button
                              onClick={() => setSelectedServiceId(srv.id)}
                              className="flex-1 text-left cursor-pointer space-y-0.5"
                            >
                              <div className={`font-bold ${isSelected ? (isDarkMode ? "text-indigo-300" : "text-indigo-900") : isDarkMode ? "text-white" : "text-gray-900"}`}>
                                {srv.name}
                              </div>
                              <div className={`text-[10px] font-mono flex items-center gap-2 ${
                                isDarkMode ? "text-slate-400" : "text-gray-500"
                              }`}>
                                <span>Prov: {formatCOP(baseCosts.providerCostPer1000)} /1k</span>
                                <span className={`font-bold ${isDarkMode ? "text-emerald-400" : "text-emerald-600"}`}>
                                  Venta: {formatCOP(baseCosts.suggestedPricePer1000)} /1k
                                </span>
                              </div>
                            </button>
                            
                            {deletingServiceId === srv.id ? (
                              <div className="flex items-center gap-1 bg-red-500/10 p-1 rounded-md border border-red-500/30 shrink-0 animate-fade-in">
                                <span className="text-[8px] font-bold text-red-400 uppercase">¿Borrar?</span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await handleDeleteService(srv.id);
                                    setDeletingServiceId(null);
                                  }}
                                  className="bg-red-600 hover:bg-red-700 text-white text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingServiceId(null)}
                                  className={`border text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                                    isDarkMode ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-gray-200 text-gray-700"
                                  }`}
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingServiceId(srv.id)}
                                className={`p-1 rounded-md transition shrink-0 cursor-pointer ${
                                  isDarkMode ? "text-slate-500 hover:text-red-400 hover:bg-slate-800" : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right details board: Base Cost Configurator & Smart Calculator */}
            <div className={`lg:col-span-8 rounded-xl border p-6 shadow-sm min-h-[580px] flex flex-col justify-between animate-fade-in transition ${
              isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
            }`}>
              {selectedServiceObj ? (
                <div className="space-y-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-6">
                    {/* Header */}
                    <div className={`flex justify-between items-center border-b pb-3 ${
                      isDarkMode ? "border-slate-800" : "border-gray-100"
                    }`}>
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-bold uppercase tracking-wide">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Centro de Costos Inteligente</span>
                        </div>
                        <h3 className={`text-base font-extrabold mt-0.5 ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}>
                          {selectedServiceObj.name}
                        </h3>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                        isDarkMode
                          ? "bg-indigo-950/80 text-indigo-300 border-indigo-800"
                          : "bg-indigo-50 text-indigo-700 border-indigo-100"
                      }`}>
                        Costo Base por cada 1.000 unidades
                      </span>
                    </div>

                    {/* Single Cost Record Form */}
                    <form onSubmit={handleSaveServiceBaseCosts} className={`border rounded-xl p-4 space-y-4 ${
                      isDarkMode ? "bg-slate-800/50 border-slate-700/80" : "bg-gray-50/70 border-gray-200/80"
                    }`}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-wider ${
                            isDarkMode ? "text-slate-300" : "text-gray-700"
                          }`}>
                            Costo Proveedor / 1K (USD)
                          </label>
                          <div className="mt-1 relative rounded-lg shadow-2xs">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-mono text-gray-400 text-xs">US$</span>
                            <input
                              type="number"
                              step="any"
                              value={editProviderCostUSD}
                              onChange={(e) => handleUSDChange(e.target.value)}
                              placeholder="1.07"
                              className={`block w-full pl-10 pr-3 py-2 border rounded-lg text-sm font-mono font-semibold transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                                isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
                              }`}
                            />
                          </div>
                          <p className={`text-[10px] mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                            {editProviderCostUSD && parseFloat(editProviderCostUSD) > 0 ? (
                              trmState.valor ? (
                                <span className="text-indigo-400 font-bold">
                                  Equiv. TRM: ${(parseFloat(editProviderCostUSD) * trmState.valor).toLocaleString("es-CO", { maximumFractionDigits: 2 })} COP
                                </span>
                              ) : (
                                <span className="text-amber-400">TRM no disponible para cálculo en COP</span>
                              )
                            ) : (
                              "Costo en USD si proviene de proveedor internacional"
                            )}
                          </p>
                        </div>

                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-wider ${
                            isDarkMode ? "text-slate-300" : "text-gray-700"
                          }`}>
                            Costo Proveedor / 1K (COP)
                          </label>
                          <div className="mt-1 relative rounded-lg shadow-2xs">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-mono text-gray-400 text-xs">$</span>
                            <input
                              type="number"
                              required
                              step="any"
                              value={editProviderCost}
                              onChange={(e) => setEditProviderCost(e.target.value)}
                              placeholder="1810"
                              className={`block w-full pl-7 pr-3 py-2 border rounded-lg text-sm font-mono font-semibold transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                                isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
                              }`}
                            />
                          </div>
                          <p className={`text-[10px] mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                            Costo manual en pesos colombianos (se usa si no hay costo en USD)
                          </p>
                        </div>

                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-wider ${
                            isDarkMode ? "text-slate-300" : "text-gray-700"
                          }`}>
                            Precio Venta / 1K (COP)
                          </label>
                          <div className="mt-1 relative rounded-lg shadow-2xs">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-mono text-emerald-500 text-xs">$</span>
                            <input
                              type="number"
                              required
                              step="any"
                              value={editSuggestedPrice}
                              onChange={(e) => setEditSuggestedPrice(e.target.value)}
                              placeholder="15000"
                              className={`block w-full pl-7 pr-3 py-2 border rounded-lg text-sm font-mono font-bold text-emerald-400 transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                                isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-gray-200"
                              }`}
                            />
                          </div>
                          <p className={`text-[10px] mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                            Precio de venta cobrado al cliente (independiente de la TRM)
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider ${
                          isDarkMode ? "text-slate-300" : "text-gray-700"
                        }`}>
                          Cantidades Rápidas de Selección (Separadas por comas)
                        </label>
                        <input
                          type="text"
                          value={editPresetsStr}
                          onChange={(e) => setEditPresetsStr(e.target.value)}
                          placeholder="1000, 2000, 5000, 10000"
                          className={`mt-1 block w-full px-3 py-2 border rounded-lg text-xs font-mono transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                            isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-200 text-gray-900"
                          }`}
                        />
                        <p className={`text-[10px] mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                          Los botones rápidos de selección que aparecerán al crear un comprobante.
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        {serviceSavedSuccess ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 animate-fade-in">
                            <Check className="w-4 h-4" />
                            <span>¡Costo base guardado correctamente!</span>
                          </div>
                        ) : serviceErrorMessage ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 animate-fade-in">
                            <AlertTriangle className="w-4 h-4" />
                            <span>{serviceErrorMessage}</span>
                          </div>
                        ) : (
                          <div className={`text-[10.5px] italic ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                            Los cambios se aplicarán automáticamente a todos los cálculos de comprobantes nuevos.
                          </div>
                        )}

                        <button
                          type="submit"
                          className="flex items-center gap-1.5 py-2 px-5 border border-transparent rounded-lg shadow-sm text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Guardar Registro de Servicio
                        </button>
                      </div>
                    </form>

                    {/* Live Smart Simulator / Calculator */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Calculator className="w-4 h-4 text-indigo-400" />
                          <h4 className={`text-xs font-bold uppercase tracking-wider ${
                            isDarkMode ? "text-slate-200" : "text-gray-900"
                          }`}>
                            Simulador y Calculadora en Tiempo Real
                          </h4>
                        </div>
                        <span className={`text-[10.5px] ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                          Matemática proporcional activa
                        </span>
                      </div>

                      {/* Interactive Custom Quantity Test Input */}
                      <div className={`rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 border ${
                        isDarkMode ? "bg-indigo-950/40 border-indigo-900" : "bg-indigo-50/40 border-indigo-100"
                      }`}>
                        <div className="text-xs">
                          <span className={`font-bold block ${isDarkMode ? "text-indigo-300" : "text-indigo-900"}`}>
                            Probador de Cantidad Personalizada
                          </span>
                          <span className={`text-[10.5px] ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                            Pruebe el costo y precio para cualquier cantidad personalizada
                          </span>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <input
                            type="number"
                            value={testQuantity}
                            onChange={(e) => setTestQuantity(e.target.value)}
                            placeholder="Ej. 3250"
                            className={`w-28 px-3 py-1.5 border rounded-lg text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                              isDarkMode ? "bg-slate-900 border-indigo-800 text-white" : "bg-white border-indigo-200 text-gray-900"
                            }`}
                          />
                          <div className={`text-xs font-mono px-3 py-1.5 rounded-lg border shadow-2xs font-bold ${
                            isDarkMode
                              ? "bg-slate-900 border-indigo-800 text-indigo-300"
                              : "bg-white border-indigo-200 text-indigo-800"
                          }`}>
                            {formatCOP(
                              calculateServicePrices(
                                {
                                  ...selectedServiceObj,
                                  providerCostPer1000: parseFloat(editProviderCost) || 0,
                                  suggestedPricePer1000: parseFloat(editSuggestedPrice) || 0
                                },
                                parseInt(testQuantity) || 0
                              ).suggestedPrice
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Preset breakdown table */}
                      <div className={`border rounded-xl overflow-hidden shadow-2xs ${
                        isDarkMode ? "border-slate-800 bg-slate-900" : "border-gray-200 bg-white"
                      }`}>
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className={`border-b text-[10px] font-bold uppercase tracking-wider ${
                              isDarkMode ? "bg-slate-800/80 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-gray-400"
                            }`}>
                              <th className="py-2.5 px-4">Cantidad</th>
                              <th className="py-2.5 px-4 text-right">Costo Proveedor</th>
                              <th className="py-2.5 px-4 text-right">Precio Sugerido</th>
                              <th className="py-2.5 px-4 text-right">Ganancia Neta</th>
                              <th className="py-2.5 px-4 text-center">% Margen</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y text-xs font-mono ${
                            isDarkMode ? "divide-slate-800 text-slate-300" : "divide-gray-200 text-gray-700"
                          }`}>
                            {(() => {
                              const pCost = parseFloat(editProviderCost) || 0;
                              const sPrice = parseFloat(editSuggestedPrice) || 0;
                              const presets = editPresetsStr
                                .split(/[,;\s]+/)
                                .map((p) => parseInt(p))
                                .filter((p) => !isNaN(p) && p > 0);

                              const testQtyNum = parseInt(testQuantity);
                              const listToDisplay = [...presets];
                              if (!isNaN(testQtyNum) && testQtyNum > 0 && !listToDisplay.includes(testQtyNum)) {
                                listToDisplay.push(testQtyNum);
                                listToDisplay.sort((a, b) => a - b);
                              }

                              return listToDisplay.map((qty) => {
                                const cProv = Math.round((qty / 1000) * pCost);
                                const pSugg = Math.round((qty / 1000) * sPrice);
                                const profit = pSugg - cProv;
                                const margin = pSugg > 0 ? Math.round((profit / pSugg) * 100) : 0;
                                const isTestMatch = testQtyNum === qty && !presets.includes(testQtyNum);

                                return (
                                  <tr
                                    key={qty}
                                    className={
                                      isTestMatch
                                        ? isDarkMode
                                          ? "bg-amber-950/40 font-bold text-amber-300"
                                          : "bg-amber-50/60 font-bold text-amber-900"
                                        : isDarkMode
                                        ? "hover:bg-slate-800/40 transition"
                                        : "hover:bg-gray-50/40 transition"
                                    }
                                  >
                                    <td className={`py-2.5 px-4 font-bold flex items-center gap-1.5 ${
                                      isDarkMode ? "text-white" : "text-gray-900"
                                    }`}>
                                      <span>{qty.toLocaleString()}</span>
                                      {isTestMatch && (
                                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-sans uppercase ${
                                          isDarkMode ? "bg-amber-900 text-amber-200" : "bg-amber-200 text-amber-900"
                                        }`}>
                                          Prueba
                                        </span>
                                      )}
                                    </td>
                                    <td className={`py-2.5 px-4 text-right ${
                                      isDarkMode ? "text-slate-400" : "text-gray-600"
                                    }`}>
                                      {formatCOP(cProv)}
                                    </td>
                                    <td className={`py-2.5 px-4 text-right font-bold ${
                                      isDarkMode ? "text-indigo-400" : "text-indigo-600"
                                    }`}>
                                      {formatCOP(pSugg)}
                                    </td>
                                    <td className={`py-2.5 px-4 text-right font-bold ${
                                      isDarkMode ? "text-emerald-400" : "text-emerald-600"
                                    }`}>
                                      +{formatCOP(profit)}
                                    </td>
                                    <td className="py-2.5 px-4 text-center">
                                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                        isDarkMode
                                          ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
                                          : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                      }`}>
                                        {margin}%
                                      </span>
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center h-full flex flex-col justify-center items-center">
                  <Sliders className={`w-12 h-12 mb-3 ${isDarkMode ? "text-slate-700" : "text-indigo-300"}`} />
                  <h3 className={`text-sm font-semibold ${isDarkMode ? "text-slate-200" : "text-gray-700"}`}>
                    Seleccione un Servicio
                  </h3>
                  <p className={`text-xs max-w-sm mt-1 leading-relaxed ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                    Seleccione un servicio del panel izquierdo para configurar sus costos base por 1.000 unidades y visualizar las simulaciones de ganancias en tiempo real.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 3: Combos y Paquetes Manager */}
        {activeTab === "combos" && (
          <div className="col-span-1 lg:col-span-12 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${
                  isDarkMode ? "text-slate-200" : "text-gray-900"
                }`}>
                  <PackageOpen className="w-4 h-4 text-emerald-500" />
                  Gestión de Combos y Paquetes Especiales
                </h3>
                <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                  Cree paquetes combinados (ej. Likes + Vistas de TikTok) para emitir con un solo clic conservando IDs y costos independientes.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddCombo}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                Nuevo Combo
              </button>
            </div>

            {comboSuccessMessage && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{comboSuccessMessage}</span>
              </div>
            )}

            {comboErrorMessage && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>{comboErrorMessage}</span>
              </div>
            )}

            {/* List of Combos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {combos.map((combo) => {
                const sn = socialNetworks.find((s) => s.id === combo.socialNetworkId);
                const snName = sn?.name || (combo.socialNetworkId.charAt(0).toUpperCase() + combo.socialNetworkId.slice(1));

                return (
                  <div
                    key={combo.id}
                    className={`border rounded-xl p-4 flex flex-col justify-between transition shadow-xs ${
                      isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white border-gray-200"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-1.5 ${
                            isDarkMode ? "bg-slate-800 text-indigo-400" : "bg-indigo-50 text-indigo-700"
                          }`}>
                            {snName}
                          </span>
                          <h4 className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                            {combo.name}
                          </h4>
                        </div>
                        <span className="text-sm font-extrabold text-emerald-500 font-mono">
                          ${Math.round(combo.comboPrice).toLocaleString("es-CO")}
                        </span>
                      </div>

                      {combo.description && (
                        <p className={`text-xs mt-1.5 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                          {combo.description}
                        </p>
                      )}

                      {/* Items list */}
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-200 dark:border-slate-800 space-y-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                          isDarkMode ? "text-slate-400" : "text-gray-400"
                        }`}>
                          Servicios incluidos ({combo.items.length}):
                        </span>
                        {combo.items.map((itm, i) => {
                          const srv = services.find((s) => s.id === itm.serviceId);
                          return (
                            <div key={i} className="flex justify-between items-center text-xs">
                              <span className={isDarkMode ? "text-slate-300" : "text-gray-700"}>
                                • {itm.quantity.toLocaleString("es-CO")} {srv?.name || itm.serviceId}
                              </span>
                              {itm.allocatedPrice ? (
                                <span className={`font-mono text-[11px] ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                                  ${Math.round(itm.allocatedPrice).toLocaleString("es-CO")}
                                </span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800/80 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditCombo(combo)}
                        className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                          isDarkMode ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      {deletingComboId === combo.id ? (
                        <div className="flex items-center gap-1 bg-red-500/10 p-1 rounded-md border border-red-500/30 shrink-0 animate-fade-in">
                          <span className="text-[9px] font-bold text-red-400 uppercase">¿Borrar?</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await handleDeleteCombo(combo.id);
                              setDeletingComboId(null);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition"
                          >
                            Sí
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingComboId(null)}
                            className={`border text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer transition ${
                              isDarkMode ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-gray-200 text-gray-700"
                            }`}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingComboId(combo.id)}
                          className="p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal / Form to Add or Edit Combo */}
            <AnimatePresence>
              {showAddComboForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl ${
                      isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-gray-200 text-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
                      <h3 className="text-base font-bold flex items-center gap-2">
                        <PackageOpen className="w-5 h-5 text-emerald-500" />
                        {editingComboId ? "Editar Combo" : "Nuevo Combo de Servicios"}
                      </h3>
                      <button
                        onClick={() => setShowAddComboForm(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveCombo} className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-[11px] font-semibold uppercase mb-1 ${
                            isDarkMode ? "text-slate-400" : "text-gray-600"
                          }`}>
                            Nombre del Combo
                          </label>
                          <input
                            type="text"
                            required
                            value={comboNameInput}
                            onChange={(e) => setComboNameInput(e.target.value)}
                            placeholder="Ej. Combo TikTok 2k Likes + 5k Vistas"
                            className={`w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                              isDarkMode
                                ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                                : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                            }`}
                          />
                        </div>

                        <div>
                          <label className={`block text-[11px] font-semibold uppercase mb-1 ${
                            isDarkMode ? "text-slate-400" : "text-gray-600"
                          }`}>
                            Red Social Principal
                          </label>
                          <select
                            value={comboSocialInput}
                            onChange={(e) => setComboSocialInput(e.target.value)}
                            className={`w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                              isDarkMode
                                ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                                : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                            }`}
                          >
                            {socialNetworks.map((sn) => (
                              <option key={sn.id} value={sn.id}>
                                {sn.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-[11px] font-semibold uppercase mb-1 ${
                            isDarkMode ? "text-slate-400" : "text-gray-600"
                          }`}>
                            Precio del Combo al Cliente (COP)
                          </label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-xs font-bold">$</span>
                            <input
                              type="number"
                              required
                              value={comboPriceInput}
                              onChange={(e) => setComboPriceInput(e.target.value)}
                              placeholder="18000"
                              className={`w-full pl-7 pr-3 py-2 border rounded-lg text-sm font-semibold transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                                isDarkMode
                                  ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                                  : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                              }`}
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`block text-[11px] font-semibold uppercase mb-1 ${
                            isDarkMode ? "text-slate-400" : "text-gray-600"
                          }`}>
                            Descripción / Nota
                          </label>
                          <input
                            type="text"
                            value={comboDescInput}
                            onChange={(e) => setComboDescInput(e.target.value)}
                            placeholder="Ej. Promoción especial para TikTokers"
                            className={`w-full px-3.5 py-2 border rounded-lg text-sm transition focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 ${
                              isDarkMode
                                ? "bg-slate-800 border-slate-700 text-white focus:border-indigo-400"
                                : "bg-white border-gray-200 text-gray-800 focus:border-indigo-500"
                            }`}
                          />
                        </div>
                      </div>

                      {/* Items Builder in Combo */}
                      <div className="pt-2 border-t border-gray-100 dark:border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className={`block text-xs font-bold uppercase tracking-wider ${
                            isDarkMode ? "text-slate-300" : "text-gray-700"
                          }`}>
                            Servicios que componen el combo ({comboItemsInput.length})
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const firstSrv = services[0];
                              setComboItemsInput((prev) => [
                                ...prev,
                                {
                                  socialNetworkId: firstSrv?.socialNetworkId || "tiktok",
                                  serviceId: firstSrv?.id || "",
                                  quantity: 1000,
                                  allocatedPrice: 5000
                                }
                              ]);
                            }}
                            className="text-xs text-indigo-500 hover:text-indigo-600 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Agregar Servicio
                          </button>
                        </div>

                        <div className="space-y-2">
                          {comboItemsInput.map((itm, idx) => (
                            <div
                              key={idx}
                              className={`p-3 rounded-lg border grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs ${
                                isDarkMode ? "bg-slate-800/60 border-slate-700" : "bg-gray-50 border-gray-200"
                              }`}
                            >
                              <div className="sm:col-span-6">
                                <label className="block text-[10px] text-gray-400 mb-0.5">Servicio:</label>
                                <select
                                  value={itm.serviceId}
                                  onChange={(e) => {
                                    const sId = e.target.value;
                                    const srv = services.find((s) => s.id === sId);
                                    setComboItemsInput((prev) =>
                                      prev.map((c, i) =>
                                        i === idx
                                          ? {
                                              ...c,
                                              serviceId: sId,
                                              socialNetworkId: srv ? srv.socialNetworkId : c.socialNetworkId
                                            }
                                          : c
                                      )
                                    );
                                  }}
                                  className={`w-full px-2 py-1.5 border rounded text-xs transition ${
                                    isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-300 text-gray-900"
                                  }`}
                                >
                                  <option value="">-- Seleccionar --</option>
                                  {services.map((srv) => (
                                    <option key={srv.id} value={srv.id}>
                                      {srv.name} ({srv.socialNetworkId})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-3">
                                <label className="block text-[10px] text-gray-400 mb-0.5">Cantidad:</label>
                                <input
                                  type="number"
                                  value={itm.quantity}
                                  onChange={(e) => {
                                    const q = parseInt(e.target.value) || 0;
                                    setComboItemsInput((prev) =>
                                      prev.map((c, i) => (i === idx ? { ...c, quantity: q } : c))
                                    );
                                  }}
                                  className={`w-full px-2 py-1.5 border rounded text-xs transition font-mono ${
                                    isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-300 text-gray-900"
                                  }`}
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[10px] text-gray-400 mb-0.5">Precio Asig.:</label>
                                <input
                                  type="number"
                                  value={itm.allocatedPrice || 0}
                                  onChange={(e) => {
                                    const p = parseFloat(e.target.value) || 0;
                                    setComboItemsInput((prev) =>
                                      prev.map((c, i) => (i === idx ? { ...c, allocatedPrice: p } : c))
                                    );
                                  }}
                                  className={`w-full px-2 py-1.5 border rounded text-xs transition font-mono ${
                                    isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-gray-300 text-gray-900"
                                  }`}
                                />
                              </div>

                              <div className="sm:col-span-1 flex justify-end pt-3 sm:pt-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setComboItemsInput((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                  disabled={comboItemsInput.length <= 1}
                                  className="text-red-400 hover:text-red-500 disabled:opacity-30 p-1 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => setShowAddComboForm(false)}
                          className={`px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                            isDarkMode ? "text-slate-300 hover:bg-slate-800" : "text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition cursor-pointer"
                        >
                          {editingComboId ? "Guardar Cambios" : "Crear Combo"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};
