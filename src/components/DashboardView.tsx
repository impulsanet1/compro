/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import {
  TrendingUp,
  DollarSign,
  FileText,
  Users,
  Calendar,
  Layers,
  ArrowUpRight,
  Target,
  ChevronRight,
  Search,
  Eye,
  EyeOff,
  Filter,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  Award
} from "lucide-react";
import { Receipt, getNormalizedStatus } from "../types";
import { motion } from "motion/react";

interface DashboardViewProps {
  onViewChange: (view: string) => void;
  onSelectReceipt?: (receipt: Receipt) => void;
}

// Robust helper to parse receipt date without UTC day shifts
function parseReceiptDate(dateInput?: string | Date | number | null): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  if (typeof dateInput === "number") return new Date(dateInput);

  const str = String(dateInput).trim();
  if (!str) return null;

  // Strict YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    return new Date(y, m, d, 12, 0, 0);
  }

  // YYYY-MM-DDTHH:mm
  const matchWithTime = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (matchWithTime && !str.includes("Z") && !str.includes("+")) {
    const y = parseInt(matchWithTime[1], 10);
    const m = parseInt(matchWithTime[2], 10) - 1;
    const d = parseInt(matchWithTime[3], 10);
    const h = parseInt(matchWithTime[4], 10);
    const min = parseInt(matchWithTime[5], 10);
    return new Date(y, m, d, h, min, 0);
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Helper to get total charged for a receipt
function getReceiptCharged(r: Partial<Receipt> | null | undefined): number {
  if (!r) return 0;
  if (typeof r.totalCharged === "number" && !isNaN(r.totalCharged) && r.totalCharged > 0) {
    return r.totalCharged;
  }
  if (typeof (r as any).salePrice === "number" && !isNaN((r as any).salePrice) && (r as any).salePrice > 0) {
    return (r as any).salePrice;
  }
  if (typeof (r as any).subtotal === "number" && !isNaN((r as any).subtotal) && (r as any).subtotal > 0) {
    return (r as any).subtotal;
  }
  if (Array.isArray(r.services) && r.services.length > 0) {
    return r.services.reduce((acc, s) => {
      const p = s.chargedPrice || ((s.suggestedPrice || 0) * (s.quantity || 1)) / 1000 || 0;
      return acc + (isNaN(p) ? 0 : p);
    }, 0);
  }
  return 0;
}

// Helper to get profit for a receipt
function getReceiptProfit(r: Partial<Receipt> | null | undefined): number {
  if (!r) return 0;
  const charged = getReceiptCharged(r);
  const cost =
    typeof r.totalProviderCost === "number" && !isNaN(r.totalProviderCost)
      ? r.totalProviderCost
      : (r as any)?.providerCostCOP || (r as any)?.providerCost || 0;

  if (typeof r.totalProfit === "number" && !isNaN(r.totalProfit) && r.totalProfit > 0) {
    return r.totalProfit;
  }
  if (typeof (r as any).profit === "number" && !isNaN((r as any).profit) && (r as any).profit > 0) {
    return (r as any).profit;
  }
  return Math.max(0, charged - cost);
}

// Helper to get provider cost for a receipt
function getReceiptCost(r: Partial<Receipt> | null | undefined): number {
  if (!r) return 0;
  if (typeof r.totalProviderCost === "number" && !isNaN(r.totalProviderCost)) {
    return r.totalProviderCost;
  }
  return (r as any)?.providerCostCOP || (r as any)?.providerCost || 0;
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

export const DashboardView: React.FC<DashboardViewProps> = ({ onViewChange, onSelectReceipt }) => {
  const { receipts, clients, services, isDarkMode } = useApp();

  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dashboard_hide_financials") === "true";
    } catch {
      return false;
    }
  });

  const toggleHideAmounts = () => {
    setHideAmounts((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("dashboard_hide_financials", String(next));
      } catch {}
      return next;
    });
  };

  const formatCOP = (val: number) => {
    if (hideAmounts) return "$ ••••••";
    return "$" + Math.round(val).toLocaleString("es-CO");
  };

  // Time Filter State
  const now = new Date();
  const [periodFilter, setPeriodFilter] = useState<
    "today" | "this_week" | "last_week" | "this_month" | "last_month" | "specific_month" | "custom" | "all"
  >("today");

  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().split("T")[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return now.toISOString().split("T")[0];
  });

  // Calculate available years based on receipts
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([now.getFullYear()]);
    receipts.forEach((r) => {
      if (r.date) {
        const d = parseReceiptDate(r.date);
        if (d) yearsSet.add(d.getFullYear());
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [receipts, now]);

  // Compute Active Period Date Range
  const { periodRange, periodLabel, prevPeriodRange } = useMemo(() => {
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const curDate = now.getDate();
    const curDay = now.getDay(); // 0 is Sunday, 1 is Monday...

    let start: Date;
    let end: Date;
    let label = "";

    let prevStart: Date | null = null;
    let prevEnd: Date | null = null;

    if (periodFilter === "today") {
      start = new Date(curYear, curMonth, curDate, 0, 0, 0, 0);
      end = new Date(curYear, curMonth, curDate, 23, 59, 59, 999);
      label = "Hoy";

      prevStart = new Date(curYear, curMonth, curDate - 1, 0, 0, 0, 0);
      prevEnd = new Date(curYear, curMonth, curDate - 1, 23, 59, 59, 999);
    } else if (periodFilter === "this_week") {
      // Monday of current week
      const diffToMonday = curDay === 0 ? -6 : 1 - curDay;
      start = new Date(curYear, curMonth, curDate + diffToMonday, 0, 0, 0, 0);
      end = new Date(curYear, curMonth, curDate + diffToMonday + 6, 23, 59, 59, 999);
      label = "Esta Semana";

      prevStart = new Date(curYear, curMonth, curDate + diffToMonday - 7, 0, 0, 0, 0);
      prevEnd = new Date(curYear, curMonth, curDate + diffToMonday - 1, 23, 59, 59, 999);
    } else if (periodFilter === "last_week") {
      const diffToMonday = curDay === 0 ? -6 : 1 - curDay;
      start = new Date(curYear, curMonth, curDate + diffToMonday - 7, 0, 0, 0, 0);
      end = new Date(curYear, curMonth, curDate + diffToMonday - 1, 23, 59, 59, 999);
      label = "Semana Pasada";

      prevStart = new Date(curYear, curMonth, curDate + diffToMonday - 14, 0, 0, 0, 0);
      prevEnd = new Date(curYear, curMonth, curDate + diffToMonday - 8, 23, 59, 59, 999);
    } else if (periodFilter === "this_month") {
      start = new Date(curYear, curMonth, 1, 0, 0, 0, 0);
      end = new Date(curYear, curMonth + 1, 0, 23, 59, 59, 999);
      label = `Este Mes (${MONTH_NAMES[curMonth]} ${curYear})`;

      prevStart = new Date(curYear, curMonth - 1, 1, 0, 0, 0, 0);
      prevEnd = new Date(curYear, curMonth, 0, 23, 59, 59, 999);
    } else if (periodFilter === "last_month") {
      start = new Date(curYear, curMonth - 1, 1, 0, 0, 0, 0);
      end = new Date(curYear, curMonth, 0, 23, 59, 59, 999);
      const prevMonthIdx = (curMonth - 1 + 12) % 12;
      const prevMonthYear = curMonth === 0 ? curYear - 1 : curYear;
      label = `Mes Pasado (${MONTH_NAMES[prevMonthIdx]} ${prevMonthYear})`;

      prevStart = new Date(curYear, curMonth - 2, 1, 0, 0, 0, 0);
      prevEnd = new Date(curYear, curMonth - 1, 0, 23, 59, 59, 999);
    } else if (periodFilter === "specific_month") {
      start = new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0);
      end = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);
      label = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

      prevStart = new Date(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0);
      prevEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
    } else if (periodFilter === "custom") {
      const s = parseReceiptDate(customStartDate) || new Date(curYear, curMonth, 1);
      const e = parseReceiptDate(customEndDate) || new Date(curYear, curMonth, curDate);
      start = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
      end = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
      label = `Rango: ${customStartDate} al ${customEndDate}`;
    } else {
      // "all"
      start = new Date(2020, 0, 1, 0, 0, 0, 0);
      end = new Date(2035, 11, 31, 23, 59, 59, 999);
      label = "Todo el Histórico";
    }

    return {
      periodRange: { start, end },
      periodLabel: label,
      prevPeriodRange: prevStart && prevEnd ? { start: prevStart, end: prevEnd } : null
    };
  }, [periodFilter, selectedMonth, selectedYear, customStartDate, customEndDate, now]);

  // General Status & Global Metrics
  const globalStatusCounts = useMemo(() => {
    let countEnProceso = 0;
    let countCompletado = 0;
    let countGarantiaEnProceso = 0;
    let countCancelado = 0;

    let countWarrantyActive = 0;
    let countWarrantySoon = 0;
    let countWarrantyExpired = 0;

    receipts.forEach((r) => {
      const normStatus = getNormalizedStatus(r.status);
      if (normStatus === "en_proceso") countEnProceso++;
      else if (normStatus === "completado") countCompletado++;
      else if (normStatus === "garantia_en_proceso") countGarantiaEnProceso++;
      else if (normStatus === "cancelado") countCancelado++;

      if (normStatus !== "cancelado" && r.date) {
        const rDate = parseReceiptDate(r.date);
        if (rDate) {
          const daysStr = r.warranty || "30 días";
          const daysMatch = daysStr.match(/\d+/);
          const days = daysMatch ? parseInt(daysMatch[0], 10) : 30;

          const expirationDate = new Date(rDate.getTime() + days * 24 * 60 * 60 * 1000);
          const msRemaining = expirationDate.getTime() - now.getTime();
          const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

          if (daysRemaining <= 0) {
            countWarrantyExpired++;
          } else if (daysRemaining <= 7) {
            countWarrantySoon++;
          } else {
            countWarrantyActive++;
          }
        }
      }
    });

    return {
      countEnProceso,
      countCompletado,
      countGarantiaEnProceso,
      countCancelado,
      countWarrantyActive,
      countWarrantySoon,
      countWarrantyExpired
    };
  }, [receipts, now]);

  // Aggregated Stats for Selected Period
  const periodStats = useMemo(() => {
    const { start, end } = periodRange;

    // Filter receipts in current period
    const inPeriodReceipts = receipts.filter((r) => {
      if (!r.date) return false;
      const rDate = parseReceiptDate(r.date);
      if (!rDate) return false;
      return rDate >= start && rDate <= end;
    });

    const inPeriodActive = inPeriodReceipts.filter((r) => getNormalizedStatus(r.status) !== "cancelado");

    let periodSales = 0;
    let periodProfit = 0;
    let periodCost = 0;

    let periodEnProceso = 0;
    let periodCompletado = 0;
    let periodGarantiaEnProceso = 0;
    let periodCancelado = 0;

    inPeriodReceipts.forEach((r) => {
      const normStatus = getNormalizedStatus(r.status);
      if (normStatus === "en_proceso") periodEnProceso++;
      else if (normStatus === "completado") periodCompletado++;
      else if (normStatus === "garantia_en_proceso") periodGarantiaEnProceso++;
      else if (normStatus === "cancelado") periodCancelado++;

      if (normStatus !== "cancelado") {
        periodSales += getReceiptCharged(r);
        periodProfit += getReceiptProfit(r);
        periodCost += getReceiptCost(r);
      }
    });

    // Top services & socials in period
    const serviceSales: Record<string, { name: string; quantity: number; total: number }> = {};
    const socialSales: Record<string, { name: string; total: number }> = {};

    inPeriodActive.forEach((r) => {
      (r.services || []).forEach((item) => {
        const sKey = `${item.socialNetworkName || "Otros"} - ${item.serviceName || "Servicio"}`;
        const itemCharged = item.chargedPrice || ((item.suggestedPrice || 0) * (item.quantity || 1)) / 1000 || 0;

        if (!serviceSales[sKey]) {
          serviceSales[sKey] = { name: sKey, quantity: 0, total: 0 };
        }
        serviceSales[sKey].quantity += item.quantity || 0;
        serviceSales[sKey].total += itemCharged;

        const snName = item.socialNetworkName || "Otros";
        if (!socialSales[snName]) {
          socialSales[snName] = { name: snName, total: 0 };
        }
        socialSales[snName].total += itemCharged;
      });
    });

    const topServices = Object.values(serviceSales)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const topSocials = Object.values(socialSales)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // Top clients in period (keyed by normalized phone if available, or clean name)
    const clientAggMap: Record<
      string,
      { name: string; phone: string; spent: number; count: number; lastDate: string; tag?: string; id?: string }
    > = {};

    inPeriodActive.forEach((r) => {
      const cleanPhone = (r.clientPhone || "").replace(/\D/g, "");
      const cleanName = (r.clientName || "Cliente").trim().toLowerCase();
      const key = cleanPhone.length >= 7 ? `phone_${cleanPhone.slice(-10)}` : `name_${cleanName}`;

      if (!clientAggMap[key]) {
        clientAggMap[key] = {
          name: r.clientName || "Cliente",
          phone: r.clientPhone || "",
          spent: 0,
          count: 0,
          lastDate: r.date || ""
        };
      }
      clientAggMap[key].spent += getReceiptCharged(r);
      clientAggMap[key].count += 1;
      if (!clientAggMap[key].phone && r.clientPhone) {
        clientAggMap[key].phone = r.clientPhone;
      }
      if (r.date && (!clientAggMap[key].lastDate || new Date(r.date) > new Date(clientAggMap[key].lastDate))) {
        clientAggMap[key].lastDate = r.date;
      }
    });

    // Tag and ID from registered clients list if available
    clients.forEach((c) => {
      const cPhone = (c.phone || "").replace(/\D/g, "");
      const cName = (c.name || "").trim().toLowerCase();
      const key = cPhone.length >= 7 ? `phone_${cPhone.slice(-10)}` : `name_${cName}`;

      if (clientAggMap[key]) {
        clientAggMap[key].tag = c.tag;
        clientAggMap[key].id = c.id;
        if (!clientAggMap[key].phone && c.phone) {
          clientAggMap[key].phone = c.phone;
        }
      }
    });

    const topClients = Object.values(clientAggMap)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 6);

    const averageSale = inPeriodActive.length > 0 ? periodSales / inPeriodActive.length : 0;
    const averageProfit = inPeriodActive.length > 0 ? periodProfit / inPeriodActive.length : 0;
    const profitMargin = periodSales > 0 ? (periodProfit / periodSales) * 100 : 0;

    // Previous period stats for comparison
    let prevSales = 0;
    let prevProfit = 0;
    let prevOrders = 0;

    if (prevPeriodRange) {
      receipts.forEach((r) => {
        if (!r.date || getNormalizedStatus(r.status) === "cancelado") return;
        const rDate = parseReceiptDate(r.date);
        if (rDate && rDate >= prevPeriodRange.start && rDate <= prevPeriodRange.end) {
          prevSales += getReceiptCharged(r);
          prevProfit += getReceiptProfit(r);
          prevOrders++;
        }
      });
    }

    const salesGrowth =
      prevSales > 0 ? ((periodSales - prevSales) / prevSales) * 100 : periodSales > 0 ? 100 : 0;
    const profitGrowth =
      prevProfit > 0 ? ((periodProfit - prevProfit) / prevProfit) * 100 : periodProfit > 0 ? 100 : 0;

    return {
      periodSales,
      periodProfit,
      periodCost,
      periodOrders: inPeriodReceipts.length,
      periodActiveOrders: inPeriodActive.length,
      averageSale,
      averageProfit,
      profitMargin,
      periodEnProceso,
      periodCompletado,
      periodGarantiaEnProceso,
      periodCancelado,
      topServices,
      topSocials,
      topClients,
      prevSales,
      prevProfit,
      prevOrders,
      salesGrowth,
      profitGrowth
    };
  }, [receipts, clients, periodRange, prevPeriodRange]);

  // Dynamic Chart Generation based on Period
  const chartData = useMemo(() => {
    const { start, end } = periodRange;
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const result: Array<{
      label: string;
      date: string;
      sales: number;
      profit: number;
    }> = [];

    // If period is <= 35 days (e.g. today, this week, last week, this month, specific month, custom <= 35 days)
    if (diffDays <= 35 && periodFilter !== "all") {
      const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
      const iter = new Date(start.getTime());

      while (iter <= end) {
        const iterYear = iter.getFullYear();
        const iterMonth = iter.getMonth();
        const iterDate = iter.getDate();
        const dayLabel = dayNames[iter.getDay()];

        let sales = 0;
        let profit = 0;

        receipts.forEach((r) => {
          if (!r.date || getNormalizedStatus(r.status) === "cancelado") return;
          const rDate = parseReceiptDate(r.date);
          if (
            rDate &&
            rDate.getFullYear() === iterYear &&
            rDate.getMonth() === iterMonth &&
            rDate.getDate() === iterDate
          ) {
            sales += getReceiptCharged(r);
            profit += getReceiptProfit(r);
          }
        });

        result.push({
          label: `${iterDate}`,
          date: `${dayLabel} ${iterDate}/${iterMonth + 1}`,
          sales,
          profit
        });

        iter.setDate(iter.getDate() + 1);
      }
    } else {
      // Monthly aggregation for long periods or "all"
      const targetYear = selectedYear;
      for (let m = 0; m < 12; m++) {
        let sales = 0;
        let profit = 0;

        receipts.forEach((r) => {
          if (!r.date || getNormalizedStatus(r.status) === "cancelado") return;
          const rDate = parseReceiptDate(r.date);
          if (rDate && rDate.getFullYear() === targetYear && rDate.getMonth() === m) {
            sales += getReceiptCharged(r);
            profit += getReceiptProfit(r);
          }
        });

        result.push({
          label: MONTH_NAMES[m].slice(0, 3),
          date: `${MONTH_NAMES[m]} ${targetYear}`,
          sales,
          profit
        });
      }
    }

    return result;
  }, [periodRange, periodFilter, receipts, selectedYear]);

  const maxChartVal = useMemo(() => {
    const maxVal = Math.max(...chartData.map((d) => Math.max(d.sales, d.profit)), 0);
    return maxVal > 0 ? Math.ceil(maxVal * 1.2) : 100000;
  }, [chartData]);

  const totalPeriodSalesInChart = useMemo(() => {
    return chartData.reduce((acc, d) => acc + d.sales, 0);
  }, [chartData]);

  const totalPeriodProfitInChart = useMemo(() => {
    return chartData.reduce((acc, d) => acc + d.profit, 0);
  }, [chartData]);

  const formattedTodayDate = useMemo(() => {
    const d = new Date();
    return d
      .toLocaleDateString("es-ES", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      })
      .replace(/^\w/, (c) => c.toUpperCase());
  }, []);

  return (
    <div className="space-y-7 max-w-7xl mx-auto px-4 sm:px-6 py-2 animate-fade-in">
      {/* Top Header & Fast Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2
            className={`text-xl font-bold tracking-tight flex items-center gap-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Panel de Control Financiero & Ventas
          </h2>
          <p className={`text-xs mt-0.5 ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
            Supervisión integral de facturación, utilidades, flujo operativo y garantías en ImpulsaNet
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Privacy Button: Hide / Show Financials */}
          <button
            type="button"
            id="btn-toggle-privacy"
            onClick={toggleHideAmounts}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition shadow-2xs cursor-pointer ${
              hideAmounts
                ? isDarkMode
                  ? "bg-amber-950/60 text-amber-300 border-amber-800"
                  : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                : isDarkMode
                ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900"
            }`}
            title={hideAmounts ? "Mostrar cifras de ventas y ganancias" : "Ocultar / tapar ingresos y ganancias"}
          >
            {hideAmounts ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-amber-500" />
                <span>Ingresos Ocultos</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-gray-400" />
                <span>Tapar Ingresos</span>
              </>
            )}
          </button>

          <div
            className={`flex items-center gap-2 text-xs font-semibold rounded-lg px-3 py-1.5 border shadow-2xs ${
              isDarkMode
                ? "bg-slate-800/90 border-slate-700 text-slate-300"
                : "bg-white border-gray-100 text-gray-500"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span>{formattedTodayDate}</span>
          </div>
        </div>
      </div>

      {/* COMPACT & DYNAMIC TIME FILTER BAR */}
      <div
        className={`px-3.5 py-2.5 sm:px-4 sm:py-3 rounded-xl border shadow-2xs transition ${
          isDarkMode
            ? "bg-slate-900/95 border-slate-800 text-slate-100"
            : "bg-white border-gray-200 text-gray-900"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Left: Active period tag & count */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold ${isDarkMode ? "text-indigo-300" : "text-indigo-700"}`}>
                {periodLabel}
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-slate-300"
                  : "bg-gray-50 border-gray-200 text-gray-600"
              }`}>
                {periodStats.periodActiveOrders} {periodStats.periodActiveOrders === 1 ? "orden" : "órdenes"}
              </span>
            </div>
          </div>

          {/* Right: Compact segmented filter pills & dropdown */}
          <div className="flex items-center gap-1 flex-wrap shrink-0">
            <div className={`inline-flex items-center p-0.5 rounded-lg border text-[11px] font-semibold ${
              isDarkMode ? "bg-slate-800/80 border-slate-700" : "bg-gray-100 border-gray-200"
            }`}>
              <button
                type="button"
                onClick={() => setPeriodFilter("today")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  periodFilter === "today"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-2xs font-bold"
                      : "bg-white text-indigo-700 shadow-2xs font-bold"
                    : isDarkMode
                    ? "text-slate-300 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Hoy
              </button>

              <button
                type="button"
                onClick={() => setPeriodFilter("this_week")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  periodFilter === "this_week"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-2xs font-bold"
                      : "bg-white text-indigo-700 shadow-2xs font-bold"
                    : isDarkMode
                    ? "text-slate-300 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                7 Días
              </button>

              <button
                type="button"
                onClick={() => setPeriodFilter("this_month")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  periodFilter === "this_month"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-2xs font-bold"
                      : "bg-white text-indigo-700 shadow-2xs font-bold"
                    : isDarkMode
                    ? "text-slate-300 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Este Mes
              </button>

              <button
                type="button"
                onClick={() => setPeriodFilter("last_month")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  periodFilter === "last_month"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-2xs font-bold"
                      : "bg-white text-indigo-700 shadow-2xs font-bold"
                    : isDarkMode
                    ? "text-slate-300 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Mes Ant.
              </button>

              <button
                type="button"
                onClick={() => setPeriodFilter("all")}
                className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                  periodFilter === "all"
                    ? isDarkMode
                      ? "bg-indigo-600 text-white shadow-2xs font-bold"
                      : "bg-white text-indigo-700 shadow-2xs font-bold"
                    : isDarkMode
                    ? "text-slate-300 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Todo
              </button>
            </div>

            {/* Custom Range / Specific Month dropdown selector */}
            <select
              value={periodFilter === "specific_month" || periodFilter === "custom" ? periodFilter : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "specific_month" || val === "custom") {
                  setPeriodFilter(val);
                }
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                periodFilter === "specific_month" || periodFilter === "custom"
                  ? isDarkMode
                    ? "bg-indigo-950 border-indigo-700 text-indigo-200"
                    : "bg-indigo-50 border-indigo-300 text-indigo-800"
                  : isDarkMode
                  ? "bg-slate-800 border-slate-700 text-slate-300"
                  : "bg-white border-gray-200 text-gray-700"
              }`}
            >
              <option value="">Más filtros...</option>
              <option value="specific_month">📅 Mes Específico</option>
              <option value="custom">🗓️ Rango de Fechas</option>
            </select>
          </div>
        </div>

        {/* Inline Compact Inputs when "specific_month" or "custom" is active */}
        {periodFilter === "specific_month" && (
          <div
            className={`mt-2.5 pt-2.5 border-t flex items-center gap-2 flex-wrap text-xs ${
              isDarkMode ? "border-slate-800" : "border-gray-100"
            }`}
          >
            <span className={`text-[11px] font-bold ${isDarkMode ? "text-slate-400" : "text-gray-600"}`}>
              Mes:
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-white"
                  : "bg-white border-gray-200 text-gray-800"
              }`}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx} value={idx}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-white"
                  : "bg-white border-gray-200 text-gray-800"
              }`}
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Año {yr}
                </option>
              ))}
            </select>
          </div>
        )}

        {periodFilter === "custom" && (
          <div
            className={`mt-2.5 pt-2.5 border-t flex items-center gap-2.5 flex-wrap text-xs ${
              isDarkMode ? "border-slate-800" : "border-gray-100"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-bold ${isDarkMode ? "text-slate-400" : "text-gray-600"}`}>Desde:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className={`px-2 py-0.5 rounded-lg border text-xs font-mono ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "bg-white border-gray-200 text-gray-800"
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-bold ${isDarkMode ? "text-slate-400" : "text-gray-600"}`}>Hasta:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className={`px-2 py-0.5 rounded-lg border text-xs font-mono ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700 text-white"
                    : "bg-white border-gray-200 text-gray-800"
                }`}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main KPI Bento Grid for Selected Period */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Vendido / Facturado */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className={`p-5 rounded-2xl border shadow-xs relative overflow-hidden ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-gray-400"
            }`}>
              Ventas del Período
            </span>
            <div className={`p-2 rounded-xl ${isDarkMode ? "bg-indigo-950/60" : "bg-indigo-50"}`}>
              <DollarSign className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className={`text-2xl font-bold tracking-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {formatCOP(periodStats.periodSales)}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                {periodStats.periodActiveOrders} {periodStats.periodActiveOrders === 1 ? "pedido" : "pedidos"}
              </span>
              {prevPeriodRange && periodStats.prevSales > 0 && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5 ${
                    periodStats.salesGrowth >= 0
                      ? isDarkMode
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : isDarkMode
                      ? "bg-rose-950 text-rose-400 border border-rose-800"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {periodStats.salesGrowth >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                  {Math.abs(Math.round(periodStats.salesGrowth))}% vs ant.
                </span>
              )}
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-indigo-500"></div>
        </motion.div>

        {/* Ganancia Neta */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className={`p-5 rounded-2xl border shadow-xs relative overflow-hidden ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-gray-400"
            }`}>
              Ganancia Neta
            </span>
            <div className={`p-2 rounded-xl ${isDarkMode ? "bg-emerald-950/60" : "bg-emerald-50"}`}>
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-bold text-emerald-400 tracking-tight">
              {formatCOP(periodStats.periodProfit)}
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className={`text-[10px] font-semibold ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                Margen: {periodStats.profitMargin.toFixed(0)}%
              </span>
              {prevPeriodRange && periodStats.prevProfit > 0 && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full flex items-center gap-0.5 ${
                    periodStats.profitGrowth >= 0
                      ? isDarkMode
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : isDarkMode
                      ? "bg-rose-950 text-rose-400 border border-rose-800"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {periodStats.profitGrowth >= 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                  {Math.abs(Math.round(periodStats.profitGrowth))}% vs ant.
                </span>
              )}
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-emerald-500"></div>
        </motion.div>

        {/* Costo Proveedor */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className={`p-5 rounded-2xl border shadow-xs relative overflow-hidden ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-gray-400"
            }`}>
              Costo Proveedores
            </span>
            <div className={`p-2 rounded-xl ${isDarkMode ? "bg-slate-800" : "bg-gray-100"}`}>
              <Layers className={`w-4 h-4 ${isDarkMode ? "text-slate-300" : "text-gray-600"}`} />
            </div>
          </div>
          <div className="mt-4">
            <h3 className={`text-2xl font-bold tracking-tight ${isDarkMode ? "text-slate-300" : "text-gray-800"}`}>
              {formatCOP(periodStats.periodCost)}
            </h3>
            <p className={`text-[10px] mt-1 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
              Costo de órdenes suministradas
            </p>
          </div>
          <div className={`absolute bottom-0 inset-x-0 h-1 ${isDarkMode ? "bg-slate-700" : "bg-gray-400"}`}></div>
        </motion.div>

        {/* Ticket Promedio */}
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          className={`p-5 rounded-2xl border shadow-xs relative overflow-hidden ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <div className="flex justify-between items-start">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              isDarkMode ? "text-slate-400" : "text-gray-400"
            }`}>
              Ticket Promedio
            </span>
            <div className={`p-2 rounded-xl ${isDarkMode ? "bg-indigo-950/60" : "bg-indigo-50"}`}>
              <Target className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className={`text-2xl font-bold tracking-tight ${isDarkMode ? "text-indigo-300" : "text-indigo-700"}`}>
              {formatCOP(periodStats.averageSale)}
            </h3>
            <p className={`text-[10px] mt-1 flex items-center gap-1 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
              <span>Ganancia media:</span>
              <span className="font-semibold">{formatCOP(periodStats.averageProfit)}</span>
            </p>
          </div>
          <div className="absolute bottom-0 inset-x-0 h-1 bg-indigo-600"></div>
        </motion.div>
      </div>

      {/* Main Grid: Chart and Side Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dynamic Chart Component */}
        <div
          className={`lg:col-span-2 rounded-2xl border p-6 shadow-xs ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <h3 className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-950"}`}>
                Comportamiento de Ventas & Ganancias
              </h3>
              <p className={`text-[11px] mt-0.5 flex items-center gap-1 flex-wrap ${isDarkMode ? "text-slate-400" : "text-gray-500"}`}>
                <span>Desglose para:</span>
                <strong className="font-semibold">{periodLabel}</strong>
                <span>• Total gráfico:</span>
                <span className="text-indigo-400 font-mono font-bold">{formatCOP(totalPeriodSalesInChart)}</span>
                <span>en ventas</span>
                <span className="text-emerald-400 font-mono font-bold">({formatCOP(totalPeriodProfitInChart)} ganancia)</span>
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold self-start sm:self-auto">
              <div className={`flex items-center gap-1.5 ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                <span className="w-3 h-3 rounded-md bg-indigo-500 shadow-xs"></span>
                <span>Ventas</span>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-3 h-3 rounded-md bg-emerald-400 shadow-xs"></span>
                <span>Ganancia</span>
              </div>
            </div>
          </div>

          {/* Render Graph with clean Y-axis grid and clear columns */}
          <div className="relative h-72 w-full flex flex-col justify-end pt-6 pb-6">
            {/* Horizontal Grid lines with dynamic Y-axis values */}
            <div
              className={`absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none text-[10px] font-mono z-0 ${
                isDarkMode ? "text-slate-500" : "text-gray-400"
              }`}
            >
              <div
                className={`border-b pb-1 flex justify-between items-center ${
                  isDarkMode ? "border-slate-800/80" : "border-gray-100"
                }`}
              >
                <span>{formatCOP(maxChartVal)}</span>
                <span className="text-[9px] uppercase tracking-wider opacity-60">Tope</span>
              </div>
              <div
                className={`border-b pb-1 flex justify-between items-center ${
                  isDarkMode ? "border-slate-800/80" : "border-gray-100"
                }`}
              >
                <span>{formatCOP(Math.round(maxChartVal * 0.75))}</span>
              </div>
              <div
                className={`border-b pb-1 flex justify-between items-center ${
                  isDarkMode ? "border-slate-800/80" : "border-gray-100"
                }`}
              >
                <span>{formatCOP(Math.round(maxChartVal * 0.5))}</span>
              </div>
              <div
                className={`border-b pb-1 flex justify-between items-center ${
                  isDarkMode ? "border-slate-800/80" : "border-gray-100"
                }`}
              >
                <span>{formatCOP(Math.round(maxChartVal * 0.25))}</span>
              </div>
              <div
                className={`border-b pb-1 flex justify-between items-center ${
                  isDarkMode ? "border-slate-800/80" : "border-gray-100"
                }`}
              >
                <span>$0</span>
                <span className="text-[9px] uppercase tracking-wider opacity-60">Base</span>
              </div>
            </div>

            {/* Visualizer Columns & labels */}
            <div className="relative z-10 w-full h-full flex items-end justify-between gap-1 sm:gap-2 px-1 overflow-x-auto">
              {chartData.map((item, idx) => {
                const salesHeight =
                  item.sales > 0
                    ? `${Math.max(6, Math.min(100, (item.sales / maxChartVal) * 100))}%`
                    : "0%";
                const profitHeight =
                  item.profit > 0
                    ? `${Math.max(6, Math.min(100, (item.profit / maxChartVal) * 100))}%`
                    : "0%";

                const hasData = item.sales > 0 || item.profit > 0;

                return (
                  <div
                    key={idx}
                    className="flex-1 min-w-[22px] sm:min-w-[28px] max-w-[58px] flex flex-col items-center justify-end h-full relative group cursor-pointer"
                  >
                    {/* Floating Info Tooltip on hover */}
                    <div className="absolute bottom-full mb-3 bg-slate-950 text-white rounded-xl p-3 shadow-2xl border border-slate-700/80 text-[11px] font-mono pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-30 w-36 text-left -translate-x-1/2 left-1/2">
                      <div className="font-bold text-indigo-300 border-b border-slate-800 pb-1 mb-1.5 text-center">
                        {item.date}
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-slate-400">Venta:</span>
                        <span className="font-bold text-indigo-300">{formatCOP(item.sales)}</span>
                      </div>
                      <div className="flex justify-between items-center py-0.5">
                        <span className="text-slate-400">Ganancia:</span>
                        <span className="font-bold text-emerald-400">{formatCOP(item.profit)}</span>
                      </div>
                      {item.sales > 0 && (
                        <div className="flex justify-between items-center py-0.5 border-t border-slate-800/80 mt-1 pt-1 text-[10px]">
                          <span className="text-slate-400">Margen:</span>
                          <span className="font-bold text-white">
                            {((item.profit / item.sales) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Column Bars container */}
                    <div className="w-full flex justify-center items-end h-full gap-0.5 sm:gap-1.5">
                      {/* Sales Bar */}
                      <div
                        className={`w-full max-w-[12px] sm:max-w-[16px] rounded-t-md transition-all duration-300 relative ${
                          item.sales > 0
                            ? "bg-indigo-600 group-hover:bg-indigo-400 shadow-xs shadow-indigo-500/20"
                            : isDarkMode
                            ? "bg-slate-800/30 h-[2px]"
                            : "bg-gray-100 h-[2px]"
                        }`}
                        style={{ height: salesHeight }}
                        title={`Venta: ${formatCOP(item.sales)}`}
                      >
                        {item.sales > 0 && (
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                            {item.sales >= 1000000
                              ? `$${(item.sales / 1000000).toFixed(1)}M`
                              : item.sales >= 1000
                              ? `$${Math.round(item.sales / 1000)}k`
                              : `$${item.sales}`}
                          </div>
                        )}
                      </div>

                      {/* Profit Bar */}
                      <div
                        className={`w-full max-w-[12px] sm:max-w-[16px] rounded-t-md transition-all duration-300 relative ${
                          item.profit > 0
                            ? "bg-emerald-500 group-hover:bg-emerald-300 shadow-xs shadow-emerald-500/20"
                            : isDarkMode
                            ? "bg-slate-800/30 h-[2px]"
                            : "bg-gray-100 h-[2px]"
                        }`}
                        style={{ height: profitHeight }}
                        title={`Ganancia: ${formatCOP(item.profit)}`}
                      >
                        {item.profit > 0 && (
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-mono font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                            {item.profit >= 1000000
                              ? `$${(item.profit / 1000000).toFixed(1)}M`
                              : item.profit >= 1000
                              ? `$${Math.round(item.profit / 1000)}k`
                              : `$${item.profit}`}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom X-Axis Label */}
                    <span
                      className={`mt-2 text-[9px] sm:text-[10px] font-bold uppercase truncate max-w-full text-center transition ${
                        hasData
                          ? isDarkMode
                            ? "text-slate-200 group-hover:text-indigo-400"
                            : "text-gray-800 group-hover:text-indigo-600"
                          : isDarkMode
                          ? "text-slate-600"
                          : "text-gray-400"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side Overview: Status & Operations */}
        <div
          className={`rounded-2xl border p-6 shadow-xs space-y-5 ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <div>
            <h3 className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-950"}`}>
              Flujo Operativo ({periodLabel})
            </h3>
            <p className={`text-[10px] mt-0.5 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
              Distribución de pedidos según su estado en el período
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div
              className={`p-3 rounded-xl border text-center ${
                isDarkMode ? "bg-slate-800/80 border-slate-700" : "bg-gray-50/70 border-gray-200/80"
              }`}
            >
              <div className={`text-[9px] font-bold uppercase ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                Comprobantes Período
              </div>
              <div className={`text-lg font-bold mt-0.5 ${isDarkMode ? "text-white" : "text-gray-950"}`}>
                {periodStats.periodOrders}
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border text-center ${
                isDarkMode ? "bg-slate-800/80 border-slate-700" : "bg-gray-50/70 border-gray-200/80"
              }`}
            >
              <div className={`text-[9px] font-bold uppercase ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                Completados
              </div>
              <div className="text-lg font-bold mt-0.5 text-blue-400">
                {periodStats.periodCompletado}
              </div>
            </div>
          </div>

          {/* Breakdown by state in period */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-800/50">
              <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                <span>🟢</span> En Proceso
              </span>
              <span className="font-mono font-bold">{periodStats.periodEnProceso}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-800/50">
              <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                <span>✅</span> Completados
              </span>
              <span className="font-mono font-bold">{periodStats.periodCompletado}</span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-slate-800/50">
              <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                <span>🟡</span> Garantía en Proceso
              </span>
              <span className="font-mono font-bold">{periodStats.periodGarantiaEnProceso}</span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className={`flex items-center gap-1.5 ${isDarkMode ? "text-slate-300" : "text-gray-700"}`}>
                <span>🔴</span> Cancelados
              </span>
              <span className="font-mono font-bold">{periodStats.periodCancelado}</span>
            </div>
          </div>

          {/* Global Warranties Access Card */}
          <div
            onClick={() => onViewChange("warranties")}
            className={`p-3.5 rounded-xl border transition cursor-pointer group ${
              isDarkMode
                ? "bg-slate-800/50 border-slate-700/80 hover:bg-slate-800"
                : "bg-gray-50 border-gray-200 hover:bg-gray-100"
            }`}
            title="Ir al Control de Garantías"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  Garantías con Proveedor
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-0.5 transition" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] mt-2.5">
              <div>
                <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Activas</span>
                <div className="font-bold text-emerald-400">{globalStatusCounts.countWarrantyActive}</div>
              </div>
              <div>
                <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Por vencer</span>
                <div className="font-bold text-amber-400">{globalStatusCounts.countWarrantySoon}</div>
              </div>
              <div>
                <span className={isDarkMode ? "text-slate-400" : "text-gray-400"}>Vencidas</span>
                <div className="font-bold text-rose-400">{globalStatusCounts.countWarrantyExpired}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Services, Social Networks & Top Period Clients */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Top Services (List ordering in period) */}
        <div
          className={`rounded-2xl border p-6 shadow-xs space-y-4 ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <h4
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b pb-3 ${
              isDarkMode ? "text-slate-400 border-slate-800" : "text-gray-400 border-gray-100"
            }`}
          >
            <Award className="w-3.5 h-3.5 text-yellow-500" />
            Servicios más Vendidos ({periodLabel})
          </h4>
          {periodStats.topServices.length === 0 ? (
            <p className={`text-xs italic py-6 text-center ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
              No se registran ventas en este período.
            </p>
          ) : (
            <div className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-gray-100"}`}>
              {periodStats.topServices.map((srv, index) => (
                <div key={index} className="flex justify-between items-center py-2.5 text-xs">
                  <div className="truncate pr-3">
                    <span className="font-mono font-bold text-indigo-400 mr-2">#{index + 1}</span>
                    <span className={`font-medium ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                      {srv.name}
                    </span>
                  </div>
                  <div className={`text-right font-mono font-semibold shrink-0 ${
                    isDarkMode ? "text-slate-300" : "text-gray-600"
                  }`}>
                    {formatCOP(srv.total)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Social Networks (List ordering in period) */}
        <div
          className={`rounded-2xl border p-6 shadow-xs space-y-4 ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <h4
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b pb-3 ${
              isDarkMode ? "text-slate-400 border-slate-800" : "text-gray-400 border-gray-100"
            }`}
          >
            <Target className="w-3.5 h-3.5 text-indigo-400" />
            Redes Más Rentables ({periodLabel})
          </h4>
          {periodStats.topSocials.length === 0 ? (
            <p className={`text-xs italic py-6 text-center ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
              No se registran redes en este período.
            </p>
          ) : (
            <div className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-gray-100"}`}>
              {periodStats.topSocials.map((sn, index) => (
                <div key={index} className="flex justify-between items-center py-2.5 text-xs">
                  <div className="truncate pr-3">
                    <span className="font-mono font-bold text-emerald-400 mr-2">#{index + 1}</span>
                    <span className={`font-medium ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                      {sn.name}
                    </span>
                  </div>
                  <div className={`text-right font-mono font-semibold shrink-0 ${
                    isDarkMode ? "text-slate-300" : "text-gray-600"
                  }`}>
                    {formatCOP(sn.total)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Period Buyers with WhatsApp Action */}
        <div
          className={`rounded-2xl border p-6 shadow-xs space-y-4 ${
            isDarkMode ? "bg-slate-900/95 border-slate-800" : "bg-white border-gray-200"
          }`}
        >
          <h4
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border-b pb-3 ${
              isDarkMode ? "text-slate-400 border-slate-800" : "text-gray-400 border-gray-100"
            }`}
          >
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            Clientes del Período
          </h4>
          {periodStats.topClients.length === 0 ? (
            <p className={`text-xs italic py-6 text-center ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
              No hay compras de clientes en este período.
            </p>
          ) : (
            <div className={`divide-y ${isDarkMode ? "divide-slate-800" : "divide-gray-100"}`}>
              {periodStats.topClients.map((client, idx) => (
                <div key={idx} className="flex justify-between items-center py-2.5 text-xs gap-2">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-indigo-400 shrink-0">#{idx + 1}</span>
                      <span className={`font-bold truncate ${isDarkMode ? "text-slate-200" : "text-gray-800"}`}>
                        {client.name}
                      </span>
                      {client.tag && (
                        <span className="text-[8px] px-1 py-0.2 rounded font-extrabold bg-indigo-500/20 text-indigo-300 shrink-0">
                          {client.tag}
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] font-mono mt-0.5 ${isDarkMode ? "text-slate-400" : "text-gray-400"}`}>
                      {client.count} {client.count === 1 ? "pedido" : "pedidos"} • {formatCOP(client.spent)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Call to Action Grid */}
      <div className="bg-indigo-950 text-white p-6 md:p-8 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-[0_10px_20px_rgba(79,70,229,0.15)] border border-indigo-900/60">
        <div className="space-y-1">
          <h3 className="text-lg font-bold tracking-tight">Generador de Comprobantes</h3>
          <p className="text-xs text-indigo-200 leading-relaxed max-w-lg">
            Emita comprobantes de compra profesionales con cálculo automático de costos del proveedor y ganancias, listos para descargar o imprimir al instante.
          </p>
        </div>
        <button
          id="btn-goto-generator"
          onClick={() => onViewChange("generator")}
          className="bg-white text-indigo-950 hover:bg-indigo-50 font-bold text-xs py-2.5 px-5 rounded-xl flex items-center gap-2 transition shadow-sm whitespace-nowrap self-start md:self-center cursor-pointer active:scale-95"
        >
          Nuevo Comprobante
          <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
        </button>
      </div>
    </div>
  );
};
