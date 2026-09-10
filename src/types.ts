/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BusinessConfig {
  businessName: string;
  logoUrl: string;
  whatsapp: string;
  warrantyDays: number;
  facebookSeeded?: boolean;
  costsUpdated2026?: boolean;
  costsUpdatedFinal2026?: boolean;
}

export interface TrmState {
  valor: number | null;
  fecha: string | null;
  loading: boolean;
  error: string | null;
}

export interface SocialNetwork {
  id: string; // e.g., 'instagram'
  name: string; // e.g., 'Instagram'
  icon: string; // lucide icon name
}

export interface ServiceQuantity {
  id: string; // Unique ID for quantity config
  quantity: number; // e.g., 1000
  providerCost: number;
  suggestedPrice: number;
  active: boolean;
}

export interface Service {
  id: string;
  socialNetworkId: string;
  name: string; // e.g., 'Seguidores', 'Likes'
  providerCostPer1000?: number; // Base provider cost per 1,000 units (COP)
  providerCostUSDPer1000?: number; // Base provider cost per 1,000 units (USD)
  suggestedPricePer1000?: number; // Base suggested selling price per 1,000 units (COP)
  customPresets?: number[]; // Quick preset quantities e.g. [1000, 2000, 5000, 10000]
  quantities?: ServiceQuantity[]; // Optional array for backward compatibility
}

export interface ReceiptItem {
  id: string; // Unique item ID
  socialNetworkId: string;
  socialNetworkName: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  suggestedPrice: number;
  chargedPrice: number;
  providerCostAtPurchase: number; // Snapshot of the provider cost in COP
  providerCostUSD?: number | null; // Snapshot of the provider cost in USD
  providerCostCOP?: number | null; // Snapshot of provider cost in COP at purchase time
  trmUsed?: number | null; // Historical TRM used for this item calculation
  trmDate?: string | null; // Date of the TRM used
  orderId: string; // ID del pedido
  orderIds?: string[]; // IDs multiples del pedido para soportar 2 o mas IDs
}

export interface Receipt {
  id: string; // Firestore document ID
  consecutive: number; // Consecutive order number
  clientName: string;
  clientPhone: string;
  date: string; // ISO string format
  services: ReceiptItem[];
  subtotal: number;
  totalCharged: number;
  totalProviderCost: number;
  totalProfit: number;
  trmUsed?: number | null; // Historical TRM at purchase
  trmDate?: string | null; // Date of TRM at purchase
  totalProviderCostUSD?: number | null;
  warranty: string; // e.g., "30 días"
  thankYouMessage: string;
  status?: "en_proceso" | "completado" | "garantia_en_proceso" | "cancelado" | "pendiente" | "finalizado" | "garantia_solicitada" | "garantia_finalizada";
  internalNotes?: string;
}

export interface Client {
  id: string; // Normalized name + phone
  clientCode?: string; // Unique 4-digit ID, e.g. "0001", "0002"
  name: string;
  phone: string;
  purchaseCount: number;
  totalSpent: number;
  lastPurchaseDate: string;
  receiptIds: string[];
  tag?: string; // e.g. "VIP", "Frecuente", "Mayorista", "Nuevo"
  createdAt?: string; // Registration date
}

export function getClientCode(client: Partial<Client>, fallbackIndex: number = 0): string {
  if (client.clientCode && client.clientCode.trim()) {
    return client.clientCode.trim().padStart(4, "0");
  }
  return String(fallbackIndex + 1).padStart(4, "0");
}

export function getNormalizedStatus(status?: string): "en_proceso" | "completado" | "garantia_en_proceso" | "cancelado" {
  if (!status) return "en_proceso";
  const s = status.trim().toLowerCase();
  if (s === "en_proceso" || s === "pendiente") return "en_proceso";
  if (s === "completado" || s === "finalizado" || s === "garantia_finalizada") return "completado";
  if (s === "garantia_en_proceso" || s === "garantia_solicitada") return "garantia_en_proceso";
  if (s === "cancelado") return "cancelado";
  return "en_proceso"; // default fallback
}

/**
 * Extracts all valid order IDs from a receipt item, maintaining 100% synchronization
 * between single and multiple order IDs and prioritizing user input.
 */
export function getItemOrderIds(item?: Partial<ReceiptItem> | null): string[] {
  if (!item) return [];

  const rawOrderId = (item.orderId || "").trim();
  const rawOrderIds = (item.orderIds || []).map((id) => (id || "").trim()).filter(Boolean);

  if (rawOrderId) {
    const splitFromOrderId = rawOrderId.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

    if (rawOrderIds.length === 0) {
      return splitFromOrderId;
    }

    // If orderIds has auto-generated placeholders while orderId has a real user-typed ID
    const orderIdsAreGenerated = rawOrderIds.every((id) => id.startsWith("PED-"));
    const orderIdIsCustom = splitFromOrderId.some((id) => !id.startsWith("PED-"));
    if (orderIdsAreGenerated && orderIdIsCustom) {
      return splitFromOrderId;
    }

    // If user edited orderId with multiple values (comma/space separated)
    if (splitFromOrderId.length > 1) {
      return splitFromOrderId;
    }

    // If orderIds contains orderId or vice versa, return orderIds if it has multiple
    if (rawOrderIds.includes(rawOrderId) && rawOrderIds.length > 1) {
      return rawOrderIds;
    }

    // If orderId was edited to a specific single value not in orderIds
    if (!rawOrderIds.includes(rawOrderId) && rawOrderIds.length <= 1) {
      return splitFromOrderId;
    }

    return rawOrderIds;
  }

  if (rawOrderIds.length > 0) {
    return rawOrderIds;
  }

  return [];
}

/**
 * Returns a human-friendly string of all order IDs for an item.
 */
export function getItemOrderIdDisplay(item?: Partial<ReceiptItem> | null): string {
  return getItemOrderIds(item).join(", ");
}

export function getPhoneDigits(phone?: string | null): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "");
}

export function matchPhones(phoneA?: string | null, phoneB?: string | null): boolean {
  if (!phoneA || !phoneB) return false;
  const digitsA = getPhoneDigits(phoneA);
  const digitsB = getPhoneDigits(phoneB);

  if (digitsA.length < 7 || digitsB.length < 7) return false;
  if (digitsA === digitsB) return true;

  // Compare standard 10-digit national number suffix
  const last10A = digitsA.length >= 10 ? digitsA.slice(-10) : digitsA;
  const last10B = digitsB.length >= 10 ? digitsB.slice(-10) : digitsB;
  if (last10A.length === 10 && last10B.length === 10 && last10A === last10B) return true;

  // In case one has country code (e.g. 57300... vs 300...)
  if (digitsA.length >= 10 && digitsB.length >= 10) {
    if (digitsA.endsWith(digitsB) || digitsB.endsWith(digitsA)) return true;
  }

  return false;
}

export type ContactType = "phone" | "handle" | "none";

export interface NormalizedContact {
  type: ContactType;
  key: string;
  raw: string;
  display: string;
}

/**
 * Normalizes contact string to distinguish between phone numbers, social media handles (e.g. @luisgimont), and empty contacts.
 */
export function normalizeContact(contact?: string | null): NormalizedContact {
  if (!contact) {
    return { type: "none", key: "no-contact", raw: "", display: "" };
  }
  const raw = String(contact).trim();
  const lower = raw.toLowerCase();
  if (
    !raw ||
    lower === "n/a" ||
    lower === "ninguno" ||
    lower === "ninguna" ||
    lower === "no-phone" ||
    lower === "no-contact"
  ) {
    return { type: "none", key: "no-contact", raw, display: "" };
  }

  // 1. Social handle: starts with @ or contains letters (e.g. @luisgimont, @LuisVillotaMejia, @BototaPickup)
  if (raw.startsWith("@") || /[a-zA-Z]/.test(raw)) {
    const handleClean = lower.replace(/^@+/, "").replace(/[^a-z0-9_.-]/g, "");
    if (handleClean) {
      return {
        type: "handle",
        key: `handle:${handleClean}`,
        raw,
        display: `@${handleClean}`,
      };
    }
  }

  // 2. Telephone number: extract digits
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 7) {
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    return {
      type: "phone",
      key: `phone:${last10}`,
      raw,
      display: raw,
    };
  }

  if (digits.length > 0) {
    return {
      type: "phone",
      key: `phone:${digits}`,
      raw,
      display: raw,
    };
  }

  return { type: "none", key: "no-contact", raw, display: "" };
}

/**
 * Checks if two contact strings refer to the exact same channel/identity.
 */
export function matchContacts(contactA?: string | null, contactB?: string | null): boolean {
  if (!contactA || !contactB) return false;
  const normA = normalizeContact(contactA);
  const normB = normalizeContact(contactB);

  if (normA.type === "none" || normB.type === "none") return false;
  if (normA.type !== normB.type) return false;

  if (normA.type === "handle") {
    return normA.key === normB.key;
  }

  if (normA.type === "phone") {
    return matchPhones(contactA, contactB);
  }

  return false;
}

/**
 * Generates a stable, unique client ID from client name and contact info (phone or social handle).
 */
export function generateClientId(name: string, contact?: string | null): string {
  const cleanName = (name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") || "cliente";
  const norm = normalizeContact(contact);
  const contactPart = norm.key.replace(":", "-");
  return `${cleanName}-${contactPart}`;
}

/**
 * Checks if a receipt strictly belongs to a given client:
 * 1. If BOTH have contacts (phone or handle):
 *    - If both are handles (e.g. @luisgimont vs @LuisVillotaMejia): they match ONLY if identical handle.
 *    - If both are phones: match via matchPhones.
 *    - If one is handle and other is phone: DO NOT MATCH.
 * 2. If ONE has a contact and the other has none:
 *    - Match ONLY if client explicitly lists this receipt ID or clean specific name matches.
 * 3. If NEITHER has contact:
 *    - Match strictly by exact clean non-generic name.
 */
export function isReceiptForClient(
  client: Partial<Client> | { name?: string; phone?: string; receiptIds?: string[]; id?: string; clientCode?: string } | null | undefined,
  receipt: Partial<Receipt> | null | undefined
): boolean {
  if (!client || !receipt) return false;

  const clientContact = normalizeContact(client.phone);
  const receiptContact = normalizeContact(receipt.clientPhone);

  const clientNameClean = (client.name || "").trim().toLowerCase().replace(/^@+/, "");
  const receiptNameClean = (receipt.clientName || "").trim().toLowerCase().replace(/^@+/, "");

  // 1. Both have contacts (handle or phone):
  if (clientContact.type !== "none" && receiptContact.type !== "none") {
    if (clientContact.type === receiptContact.type) {
      if (clientContact.type === "handle") {
        return clientContact.key === receiptContact.key;
      }
      if (clientContact.type === "phone") {
        return matchPhones(client.phone, receipt.clientPhone);
      }
    }
    // Different contact types (e.g. handle vs phone) -> do not match
    return false;
  }

  // 2. Direct receipt ID list check when one party has contact and other has none:
  if (receipt.id && client.receiptIds && client.receiptIds.includes(receipt.id)) {
    // If both have contacts, they must not conflict
    if (clientContact.type !== "none" && receiptContact.type !== "none") {
      return matchContacts(client.phone, receipt.clientPhone);
    }
    return true;
  }

  // 3. Neither has a contact:
  if (clientContact.type === "none" && receiptContact.type === "none") {
    if (clientNameClean && receiptNameClean && clientNameClean === receiptNameClean) {
      return clientNameClean !== "cliente" && clientNameClean.length >= 2;
    }
  }

  // 4. One has contact and other does not, but specific clean names match
  if (clientNameClean && receiptNameClean && clientNameClean === receiptNameClean) {
    if (clientNameClean !== "cliente" && clientNameClean.length >= 3) {
      if (receipt.id && client.receiptIds && client.receiptIds.includes(receipt.id)) {
        return true;
      }
    }
  }

  return false;
}

export interface ReceiptsClientIndex {
  clientToReceipts: Map<string, Receipt[]>;
  receiptToClient: Map<string, Client>;
}

/**
 * Builds a fast O(N + M) index mapping:
 * - clientId -> Receipt[]
 * - receiptId -> Client
 * This prevents O(N * M) nested loops across thousands of receipts and clients.
 */
export function buildReceiptsClientIndex(clients: Client[], receipts: Receipt[]): ReceiptsClientIndex {
  const receiptMap = new Map<string, Receipt>();
  receipts.forEach((r) => {
    if (r.id) receiptMap.set(r.id, r);
  });

  const clientToReceipts = new Map<string, Receipt[]>();
  const receiptToClient = new Map<string, Client>();
  const assignedReceiptIds = new Set<string>();

  // 1. Initial direct lookup via client.receiptIds
  clients.forEach((c) => {
    const list: Receipt[] = [];
    if (c.receiptIds && Array.isArray(c.receiptIds)) {
      c.receiptIds.forEach((rId) => {
        const r = receiptMap.get(rId);
        if (r && isReceiptForClient(c, r)) {
          list.push(r);
          receiptToClient.set(r.id, c);
          assignedReceiptIds.add(r.id);
        }
      });
    }
    clientToReceipts.set(c.id, list);
  });

  // 2. Map remaining unassigned receipts by contact/name in O(N + M)
  const remainingReceipts = receipts.filter((r) => !assignedReceiptIds.has(r.id));
  if (remainingReceipts.length > 0) {
    const handleMap = new Map<string, Client>();
    const phoneMap = new Map<string, Client>();
    const nameMap = new Map<string, Client>();

    clients.forEach((c) => {
      const norm = normalizeContact(c.phone);
      if (norm.type === "handle") handleMap.set(norm.key, c);
      else if (norm.type === "phone") phoneMap.set(norm.key, c);

      const cleanName = (c.name || "").trim().toLowerCase().replace(/^@+/, "");
      if (cleanName && cleanName !== "cliente" && cleanName.length >= 2) {
        if (!nameMap.has(cleanName)) nameMap.set(cleanName, c);
      }
    });

    remainingReceipts.forEach((r) => {
      let matchedClient: Client | undefined;
      const rNorm = normalizeContact(r.clientPhone);

      if (rNorm.type === "handle") {
        matchedClient = handleMap.get(rNorm.key);
      } else if (rNorm.type === "phone") {
        matchedClient = phoneMap.get(rNorm.key);
      }

      if (!matchedClient) {
        const rCleanName = (r.clientName || "").trim().toLowerCase().replace(/^@+/, "");
        if (rNorm.type === "none" && rCleanName && nameMap.has(rCleanName)) {
          matchedClient = nameMap.get(rCleanName);
        }
      }

      if (matchedClient) {
        const cur = clientToReceipts.get(matchedClient.id) || [];
        cur.push(r);
        clientToReceipts.set(matchedClient.id, cur);
        receiptToClient.set(r.id, matchedClient);
        assignedReceiptIds.add(r.id);
      }
    });
  }

  return { clientToReceipts, receiptToClient };
}

/**
 * Checks if a warranty record belongs to a given client
 */
export function isWarrantyForClient(
  client: Partial<Client> | { name?: string; phone?: string; receiptIds?: string[]; id?: string; clientCode?: string } | null | undefined,
  warranty: Partial<SupplierWarrantyRecord> | null | undefined,
  clientReceipts: Array<Partial<Receipt>> = []
): boolean {
  if (!client || !warranty) return false;

  // 1. Receipt ID or Consecutivo direct match from verified clientReceipts list
  if (warranty.receiptId && clientReceipts.some((r) => r.id === warranty.receiptId)) {
    return true;
  }
  if (warranty.receiptConsecutive && clientReceipts.some((r) => r.consecutive === warranty.receiptConsecutive)) {
    return true;
  }

  const clientPhone = (client.phone || "").trim();
  const warrantyPhone = (warranty.clientPhone || "").trim();
  const clientPhoneDigits = getPhoneDigits(clientPhone);
  const warrantyPhoneDigits = getPhoneDigits(warrantyPhone);

  const clientHasValidPhone = clientPhoneDigits.length >= 7;
  const warrantyHasValidPhone = warrantyPhoneDigits.length >= 7;

  if (clientHasValidPhone && warrantyHasValidPhone) {
    return matchPhones(clientPhone, warrantyPhone);
  }

  if (clientPhoneDigits.length > 0 && warrantyPhoneDigits.length > 0) {
    if (clientPhoneDigits !== warrantyPhoneDigits) return false;
  }

  const clientNameClean = (client.name || "").trim().toLowerCase();
  const warrantyNameClean = (warranty.clientName || "").trim().toLowerCase();

  if (clientNameClean && warrantyNameClean && clientNameClean === warrantyNameClean) {
    if (clientNameClean !== "cliente" && clientNameClean.length >= 3) {
      return true;
    }
  }

  return false;
}


/**
  * Extract base costs (per 1,000 units) and quick preset quantities for any Service,
  * seamlessly supporting both new smart cost center model and legacy quantities structure.
  */
export function getServiceBaseCosts(service: Service): {
  providerCostPer1000: number;
  suggestedPricePer1000: number;
  presets: number[];
} {
  let providerCostPer1000 = service.providerCostPer1000;
  let suggestedPricePer1000 = service.suggestedPricePer1000;

  // Fallback for legacy service format with quantities array
  if ((providerCostPer1000 === undefined || suggestedPricePer1000 === undefined) && service.quantities && service.quantities.length > 0) {
    const q1000 = service.quantities.find((q) => q.quantity === 1000) || service.quantities[0];
    if (q1000 && q1000.quantity > 0) {
      if (providerCostPer1000 === undefined) {
        providerCostPer1000 = (q1000.providerCost / q1000.quantity) * 1000;
      }
      if (suggestedPricePer1000 === undefined) {
        suggestedPricePer1000 = (q1000.suggestedPrice / q1000.quantity) * 1000;
      }
    }
  }

  // Fallback defaults if still undefined
  if (providerCostPer1000 === undefined || isNaN(providerCostPer1000)) providerCostPer1000 = 1810;
  if (suggestedPricePer1000 === undefined || isNaN(suggestedPricePer1000)) suggestedPricePer1000 = 15000;

  const presets = service.customPresets && service.customPresets.length > 0
    ? service.customPresets
    : [1000, 2000, 5000, 10000];

  return { providerCostPer1000, suggestedPricePer1000, presets };
}

/**
  * Calculates supplier cost in USD proportionally based on quantity and rate per 1,000 units.
  * Returns null if no USD cost configured.
  */
export function calculateSupplierCostUSD(providerCostUSDPer1000: number | undefined | null, quantity: number): number | null {
  if (providerCostUSDPer1000 === undefined || providerCostUSDPer1000 === null || isNaN(providerCostUSDPer1000) || providerCostUSDPer1000 <= 0) {
    return null;
  }
  const q = Math.max(0, quantity || 0);
  return (q / 1000) * providerCostUSDPer1000;
}

/**
  * Calculates supplier cost in COP based on USD cost and current TRM.
  * Formula: (quantity / 1000) * providerCostUSDPer1000 * TRM
  * Returns null if USD cost or TRM is missing/invalid.
  */
export function calculateSupplierCostCOP(providerCostUSDPer1000: number | undefined | null, quantity: number, trm: number | null): number | null {
  const costUSD = calculateSupplierCostUSD(providerCostUSDPer1000, quantity);
  if (costUSD === null || !trm || isNaN(trm) || trm <= 0) {
    return null;
  }
  return costUSD * trm;
}

/**
  * Automatically calculates provider cost and suggested selling price for any quantity based on service base prices.
  */
export function calculateServicePrices(service: Service, quantity: number): {
  providerCost: number;
  suggestedPrice: number;
} {
  const { providerCostPer1000, suggestedPricePer1000 } = getServiceBaseCosts(service);
  const q = Math.max(0, quantity || 0);

  // Simple, accurate proportional calculation
  const providerCost = Math.round((q / 1000) * providerCostPer1000);
  const suggestedPrice = Math.round((q / 1000) * suggestedPricePer1000);

  return { providerCost, suggestedPrice };
}

/**
  * Robust local-time date comparisons to eliminate UTC mismatch bugs.
  */
export function isSameDay(date1: Date | string, date2: Date | string): boolean {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  } catch {
    return false;
  }
}

export function isSameMonth(date1: Date | string, date2: Date | string): boolean {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
  } catch {
    return false;
  }
}

/* ==========================================================================
   SUPPLIER WARRANTY TRACKING TYPES
   ========================================================================== */

export type SupplierWarrantyStatus =
  | "en_espera"
  | "resuelto"
  | "rechazado"
  | "reclamado_nuevamente";

export interface SupplierWarrantyRecord {
  id: string; // Firestore document ID
  providerOrderId: string; // ID del pedido con el proveedor (ej. "8492019" o "8492019, 8492020")
  providerOrderIds?: string[]; // Lista de IDs individuales
  receiptId?: string; // ID del comprobante asociado (opcional)
  receiptConsecutive?: number; // Consecutivo de comprobante ej. 45
  clientName: string; // Nombre del cliente
  clientPhone?: string;
  serviceName: string; // Servicio ej. "Instagram - Seguidores"
  quantity?: number;
  sentDate: string; // Fecha y hora de envío al proveedor (formato ISO o YYYY-MM-DDTHH:mm)
  expectedResponseHours: number; // Horas límite de respuesta del proveedor (ej. 24, 48, 72)
  status: SupplierWarrantyStatus;
  reason?: string; // Motivo de la garantía (ej. "Caída de seguidores", "No llegaron", "Reposición")
  targetAccountOrUrl?: string; // Usuario o URL de destino
  supplierNotes?: string; // Notas de seguimiento o respuesta del proveedor
  resolvedDate?: string; // Fecha de resolución
  claimedAgainCount?: number; // Contador de re-reclamos
  createdAt: string;
}

export function getLocalDatetimeInputValue(dateInput?: Date | string | number): string {
  if (!dateInput) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  let d: Date;
  if (dateInput instanceof Date) {
    d = dateInput;
  } else if (typeof dateInput === "string") {
    // If it's already a simple local datetime-local format "YYYY-MM-DDTHH:mm" without timezone info
    if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(dateInput) && !dateInput.includes("Z") && !dateInput.includes("+")) {
      return dateInput.slice(0, 16).replace(" ", "T");
    }
    d = new Date(dateInput);
  } else {
    d = new Date(dateInput);
  }

  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseLocalDatetimeInput(value: string): Date {
  if (!value) return new Date();
  if (value.includes("Z") || value.includes("+") || (value.length > 19 && value.includes("-", 10))) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hours = parseInt(match[4], 10);
    const minutes = parseInt(match[5], 10);
    const seconds = match[6] ? parseInt(match[6], 10) : 0;
    return new Date(year, month, day, hours, minutes, seconds);
  }
  
  const fallback = new Date(value);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function getSupplierWarrantyTimeStatus(record: SupplierWarrantyRecord): {
  hoursElapsed: number;
  daysElapsed: number;
  hoursRemaining: number;
  isOverdue: boolean;
  deadlineDate: Date;
  statusLabel: string;
  statusColor: string;
  badgeBg: string;
} {
  const sent = new Date(record.sentDate);
  const now = new Date();
  
  const diffMs = now.getTime() - sent.getTime();
  const hoursElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const daysElapsed = Math.floor(hoursElapsed / 24);
  
  const expectedHours = record.expectedResponseHours || 48;
  const expectedMs = expectedHours * 60 * 60 * 1000;
  const deadlineDate = new Date(sent.getTime() + expectedMs);
  
  const remainingMs = deadlineDate.getTime() - now.getTime();
  let hoursRemaining = Math.round(remainingMs / (1000 * 60 * 60));

  // Cap at expected hours if sent date was set in the slight future due to local timezone drift
  if (hoursRemaining > expectedHours && diffMs < 0) {
    hoursRemaining = expectedHours;
  }
  
  const isPending = record.status === "en_espera" || record.status === "reclamado_nuevamente";
  const isOverdue = isPending && hoursRemaining <= 0;
  
  let statusLabel = "";
  let statusColor = "";
  let badgeBg = "";
  
  if (record.status === "resuelto") {
    statusLabel = "Resuelto por Proveedor";
    statusColor = "text-emerald-700";
    badgeBg = "bg-emerald-50 text-emerald-800 border-emerald-200";
  } else if (record.status === "rechazado") {
    statusLabel = "Rechazado por Proveedor";
    statusColor = "text-rose-700";
    badgeBg = "bg-rose-50 text-rose-800 border-rose-200";
  } else if (isOverdue) {
    const overdueHours = Math.abs(hoursRemaining);
    const overdueDays = Math.floor(overdueHours / 24);
    const overdueStr = overdueDays > 0 ? `${overdueDays}d ${overdueHours % 24}h` : `${overdueHours}h`;
    statusLabel = `¡Tiempo Excedido! (+${overdueStr})`;
    statusColor = "text-red-700 font-bold";
    badgeBg = "bg-red-50 text-red-800 border-red-200 animate-pulse";
  } else if (hoursRemaining <= 6) {
    statusLabel = `Por vencer (${hoursRemaining}h restantes)`;
    statusColor = "text-amber-700 font-bold";
    badgeBg = "bg-amber-50 text-amber-800 border-amber-200";
  } else {
    statusLabel = `En tiempo (${hoursRemaining}h restantes)`;
    statusColor = "text-blue-700";
    badgeBg = "bg-blue-50 text-blue-800 border-blue-200";
  }
  
  return {
    hoursElapsed,
    daysElapsed,
    hoursRemaining,
    isOverdue,
    deadlineDate,
    statusLabel,
    statusColor,
    badgeBg
  };
}

/**
 * Prefix determination for custom/differentiated services
 * (Tarjetas Digitales, Alertas Digitales, Diseño, Web, etc.)
 * Completely distinct from standard SMM follower order IDs.
 */
export function getCustomServicePrefix(category: string = "", serviceName: string = ""): string {
  const text = `${category} ${serviceName}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  if (text.includes("alerta") || text.includes("notificacion")) {
    return "ALRT"; // Alertas Digitales
  }
  if (text.includes("tarjeta") || text.includes("card") || text.includes("nfc") || text.includes("perfil")) {
    return "TDIG"; // Tarjetas Digitales
  }
  if (text.includes("diseno") || text.includes("logo") || text.includes("banner") || text.includes("flyer")) {
    return "DSGN"; // Diseño Gráfico
  }
  if (text.includes("web") || text.includes("dominio") || text.includes("hosting") || text.includes("landing")) {
    return "WEB"; // Páginas Web
  }
  if (text.includes("app") || text.includes("software") || text.includes("bot")) {
    return "SOFT"; // Software / App
  }
  if (text.includes("servicio digital") || text.includes("digital")) {
    return "SDIG"; // Servicios Digitales
  }
  return "ESP"; // Servicios Especiales / Otros
}

/**
 * Generates an automatic, unique, differentiated code for custom services.
 * Format: PREFIX-XXXXX (e.g. TDIG-48201, ALRT-93821)
 * Never overlaps or collides with SMM follower order numbers.
 */
export function generateCustomServiceCode(category: string = "", serviceName: string = ""): string {
  const prefix = getCustomServicePrefix(category, serviceName);
  const randomNum = Math.floor(10000 + Math.random() * 90000); // 5 digits
  return `${prefix}-${randomNum}`;
}

/**
 * Checks if a given code or item belongs to a custom/differentiated service.
 */
export function isCustomServiceCode(code: string = ""): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper.startsWith("TDIG-") ||
    upper.startsWith("ALRT-") ||
    upper.startsWith("DSGN-") ||
    upper.startsWith("WEB-") ||
    upper.startsWith("SOFT-") ||
    upper.startsWith("SDIG-") ||
    upper.startsWith("ESP-") ||
    upper.startsWith("SRV-")
  );
}

/**
 * Returns human-readable label for the code (e.g., Cód. Tarjeta Digital, Cód. Alerta Digital, ID Pedido)
 */
export function getOrderIdTypeLabel(code: string = "", isCustomItem?: boolean): string {
  if (isCustomItem || isCustomServiceCode(code)) {
    const upper = code.trim().toUpperCase();
    if (upper.startsWith("TDIG-")) return "Cód. Tarjeta Digital";
    if (upper.startsWith("ALRT-")) return "Cód. Alerta Digital";
    if (upper.startsWith("WEB-")) return "Cód. Servicio Web";
    if (upper.startsWith("DSGN-")) return "Cód. Diseño";
    if (upper.startsWith("SDIG-")) return "Cód. Servicio Digital";
    return "Cód. Servicio";
  }
  return "ID Pedido";
}

