/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Client,
  Receipt,
  SupplierWarrantyRecord,
  buildReceiptsClientIndex,
  getItemOrderIds,
  matchContacts,
  getClientCode,
} from "../types";

export type IntegrityIssueCategory =
  | "orphan_receipt"
  | "dangling_receipt_id"
  | "bidirectional_link_mismatch"
  | "tracking_id_discrepancy"
  | "client_code_issue"
  | "client_stats_mismatch"
  | "warranty_link_discrepancy";

export type IntegrityIssueSeverity = "high" | "medium" | "low";

export interface IntegrityIssue {
  id: string;
  category: IntegrityIssueCategory;
  severity: IntegrityIssueSeverity;
  title: string;
  description: string;
  entityType: "receipt" | "client" | "warranty";
  entityId: string;
  entityLabel: string;
  suggestedFix: string;
  metadata?: Record<string, any>;
}

export interface IntegrityAuditSummary {
  totalClients: number;
  totalReceipts: number;
  totalWarranties: number;
  totalIssues: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  orphanReceiptsCount: number;
  danglingReceiptIdsCount: number;
  bidirectionalMismatchesCount: number;
  trackingIdDiscrepanciesCount: number;
  clientCodeIssuesCount: number;
  clientStatsMismatchesCount: number;
  warrantyDiscrepanciesCount: number;
  healthScore: number;
  checkedAt: string;
}

export interface IntegrityAuditReport {
  summary: IntegrityAuditSummary;
  issues: IntegrityIssue[];
}

/**
 * Ejecuta una auditoría completa de integridad referencial entre Clientes, Pedidos (Comprobantes)
 * y Garantías en Firestore, identificando registros huérfanos, enlaces rotos y discrepancias
 * en los IDs de seguimiento (orderId / orderIds / placeholders PED-).
 */
export function runReferentialIntegrityAudit(
  clients: Client[],
  receipts: Receipt[],
  supplierWarranties: SupplierWarrantyRecord[] = []
): IntegrityAuditReport {
  const issues: IntegrityIssue[] = [];

  const clientById = new Map<string, Client>();
  clients.forEach((c) => clientById.set(c.id, c));

  const receiptById = new Map<string, Receipt>();
  receipts.forEach((r) => receiptById.set(r.id, r));

  const { clientToReceipts, receiptToClient } = buildReceiptsClientIndex(clients, receipts);

  // ---------------------------------------------------------------------------
  // 1. Verificar códigos de clientes (duplicados, vacíos, #0097 o #0107 faltante)
  // ---------------------------------------------------------------------------
  const codeMap = new Map<string, Client[]>();
  clients.forEach((c) => {
    const raw = (c.clientCode || "").trim();
    if (!raw || raw === "0000" || isNaN(parseInt(raw, 10))) {
      issues.push({
        id: `code_missing_${c.id}`,
        category: "client_code_issue",
        severity: "medium",
        title: "Cliente sin código consecutivo válido",
        description: `El cliente "${c.name || "Sin nombre"}" (${c.phone || "Sin contacto"}) no tiene un código de 4 dígitos válido asignado.`,
        entityType: "client",
        entityId: c.id,
        entityLabel: `${c.name || "Cliente"} (${c.id})`,
        suggestedFix: "Asignar automáticamente el siguiente código secuencial disponible.",
      });
      return;
    }

    const normalized = raw.padStart(4, "0");
    if (normalized === "0097") {
      issues.push({
        id: `code_reserved_0097_${c.id}`,
        category: "client_code_issue",
        severity: "medium",
        title: "Cliente con código reservado #0097",
        description: `El cliente "${c.name}" tiene asignado el código deshabilitado #0097.`,
        entityType: "client",
        entityId: c.id,
        entityLabel: `#0097 - ${c.name}`,
        suggestedFix: "Reasignar a un código activo válido.",
      });
    }

    if (!codeMap.has(normalized)) codeMap.set(normalized, []);
    codeMap.get(normalized)!.push(c);
  });

  for (const [code, group] of codeMap.entries()) {
    if (group.length > 1) {
      const names = group.map((g) => `"${g.name}" (${g.id})`).join(", ");
      group.slice(1).forEach((dupClient) => {
        issues.push({
          id: `code_dup_${code}_${dupClient.id}`,
          category: "client_code_issue",
          severity: "high",
          title: `Código de cliente duplicado #${code}`,
          description: `El código #${code} está compartido por ${group.length} registros: ${names}.`,
          entityType: "client",
          entityId: dupClient.id,
          entityLabel: `#${code} - ${dupClient.name}`,
          suggestedFix: "Unificar si es la misma persona o reasignar un código único al registro duplicado.",
          metadata: { duplicateCode: code, clientIds: group.map((g) => g.id) },
        });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Verificar clientes: receiptIds huérfanos/inexistentes y discrepancias de estadísticas
  // ---------------------------------------------------------------------------
  clients.forEach((client, idx) => {
    const code = getClientCode(client, idx);
    const storedIds = Array.isArray(client.receiptIds) ? client.receiptIds : [];
    const danglingIds = storedIds.filter((rid) => !receiptById.has(rid));

    if (danglingIds.length > 0) {
      issues.push({
        id: `dangling_rids_${client.id}`,
        category: "dangling_receipt_id",
        severity: "medium",
        title: `IDs de pedidos inexistentes en Cliente #${code}`,
        description: `El cliente #${code} "${client.name}" referencia ${danglingIds.length} ID(s) de pedido en 'receiptIds' que ya no existen en la colección 'receipts': ${danglingIds.join(", ")}.`,
        entityType: "client",
        entityId: client.id,
        entityLabel: `#${code} - ${client.name}`,
        suggestedFix: "Limpiar los IDs inexistentes del arreglo 'receiptIds' del cliente.",
        metadata: { danglingIds },
      });
    }

    const indexedReceipts = clientToReceipts.get(client.id) || [];
    const indexedIds = indexedReceipts.map((r) => r.id);
    const missingInClientArray = indexedIds.filter((id) => !storedIds.includes(id));

    if (missingInClientArray.length > 0) {
      const consecList = indexedReceipts
        .filter((r) => missingInClientArray.includes(r.id))
        .map((r) => `#${r.consecutive}`)
        .join(", ");
      issues.push({
        id: `missing_in_client_rids_${client.id}`,
        category: "bidirectional_link_mismatch",
        severity: "medium",
        title: `Pedidos vinculados no registrados en receiptIds de Cliente #${code}`,
        description: `El cliente #${code} "${client.name}" tiene ${missingInClientArray.length} pedido(s) (${consecList}) que le pertenecen pero no están guardados en su lista 'receiptIds'.`,
        entityType: "client",
        entityId: client.id,
        entityLabel: `#${code} - ${client.name}`,
        suggestedFix: "Sincronizar 'receiptIds' del cliente para incluir todos sus pedidos reales.",
        metadata: { missingInClientArray },
      });
    }

    if (indexedReceipts.length > 0) {
      const actualCount = indexedReceipts.length;
      const actualSpent = indexedReceipts.reduce((sum, r) => sum + (Number(r.totalCharged) || 0), 0);
      const countMismatch = (client.purchaseCount || 0) !== actualCount;
      const spentMismatch = Math.abs((client.totalSpent || 0) - actualSpent) > 1;

      if (countMismatch || spentMismatch) {
        issues.push({
          id: `stats_mismatch_${client.id}`,
          category: "client_stats_mismatch",
          severity: "low",
          title: `Desfase de estadísticas en Cliente #${code}`,
          description: `Cliente #${code} "${client.name}" tiene guardado (${client.purchaseCount || 0} pedidos / $${Math.round(client.totalSpent || 0).toLocaleString("es-CO")}), pero sus comprobantes reales suman (${actualCount} pedidos / $${Math.round(actualSpent).toLocaleString("es-CO")}).`,
          entityType: "client",
          entityId: client.id,
          entityLabel: `#${code} - ${client.name}`,
          suggestedFix: "Recalcular y actualizar 'purchaseCount' y 'totalSpent' con base en los pedidos vinculados.",
          metadata: { actualCount, actualSpent },
        });
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Verificar Pedidos: Huérfanos, enlaces clientId rotos y Discrepancias en IDs de Seguimiento
  // ---------------------------------------------------------------------------
  receipts.forEach((receipt) => {
    const mappedClient = receiptToClient.get(receipt.id);
    const explicitClient = receipt.clientId ? clientById.get(receipt.clientId) : undefined;

    // 3A. Pedido completamente huérfano (no mapeado a ningún cliente)
    if (!mappedClient) {
      const candidateByContact = clients.find(
        (c) =>
          matchContacts(c.phone, receipt.clientPhone) ||
          (receipt.clientName &&
            c.name &&
            c.name.trim().toLowerCase() === receipt.clientName.trim().toLowerCase())
      );

      issues.push({
        id: `orphan_receipt_${receipt.id}`,
        category: "orphan_receipt",
        severity: "high",
        title: `Pedido Huérfano #${receipt.consecutive}`,
        description: receipt.clientId
          ? `El pedido #${receipt.consecutive} de "${receipt.clientName}" apunta a un clientId inexistente (${receipt.clientId}) y no aparece asignado a ningún cliente.`
          : `El pedido #${receipt.consecutive} de "${receipt.clientName}" (${receipt.clientPhone}) no tiene 'clientId' ni está vinculado a ningún cliente activo.`,
        entityType: "receipt",
        entityId: receipt.id,
        entityLabel: `Pedido #${receipt.consecutive} (${receipt.clientName})`,
        suggestedFix: candidateByContact
          ? `Vincular con el cliente existente #${candidateByContact.clientCode || "---"} "${candidateByContact.name}".`
          : `Crear o restaurar la ficha de cliente para "${receipt.clientName}" y vincular el pedido #${receipt.consecutive}.`,
        metadata: {
          consecutive: receipt.consecutive,
          candidateClientId: candidateByContact?.id,
        },
      });
    } else if (!receipt.clientId || receipt.clientId !== mappedClient.id || !explicitClient) {
      // 3B. Pedido mapeado por teléfono/receiptIds pero con llave foránea clientId desactualizada
      issues.push({
        id: `fk_mismatch_${receipt.id}`,
        category: "bidirectional_link_mismatch",
        severity: "medium",
        title: `Llave foránea clientId desincronizada en Pedido #${receipt.consecutive}`,
        description: !receipt.clientId
          ? `El pedido #${receipt.consecutive} pertenece al cliente #${mappedClient.clientCode || "---"} "${mappedClient.name}", pero no tiene guardado el campo 'clientId' en su documento.`
          : `El pedido #${receipt.consecutive} tiene clientId="${receipt.clientId}", pero está indexado bajo el cliente #${mappedClient.clientCode || "---"} "${mappedClient.name}" (id="${mappedClient.id}").`,
        entityType: "receipt",
        entityId: receipt.id,
        entityLabel: `Pedido #${receipt.consecutive} (${receipt.clientName})`,
        suggestedFix: `Actualizar 'clientId' del pedido #${receipt.consecutive} a "${mappedClient.id}".`,
        metadata: {
          currentClientId: receipt.clientId,
          expectedClientId: mappedClient.id,
        },
      });
    }

    // 3C. Discrepancias en los IDs de seguimiento (orderId vs orderIds, placeholders PED- mezclados, reenvíos falsos)
    const services = Array.isArray(receipt.services) ? receipt.services : [];
    services.forEach((srv, sIdx) => {
      const rawOrderId = String(srv.orderId || "").trim();
      const splitFromOrderId = rawOrderId
        ? rawOrderId.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean)
        : [];
      const rawOrderIds = Array.isArray(srv.orderIds)
        ? srv.orderIds.map((id) => String(id || "").trim()).filter(Boolean)
        : [];

      const combinedRaw = Array.from(new Set([...splitFromOrderId, ...rawOrderIds]));
      const realIds = combinedRaw.filter((id) => !/^PED-\d+$/i.test(id));
      const pedIds = combinedRaw.filter((id) => /^PED-\d+$/i.test(id));

      // Caso 1: Tiene ID real de proveedor mezclado con un placeholder temporal PED-xxxxxx
      if (realIds.length > 0 && pedIds.length > 0) {
        issues.push({
          id: `tracking_mixed_ped_${receipt.id}_${sIdx}`,
          category: "tracking_id_discrepancy",
          severity: "high",
          title: `ID de seguimiento real mezclado con código temporal PED- en Pedido #${receipt.consecutive}`,
          description: `El servicio "${srv.serviceName}" en el pedido #${receipt.consecutive} contiene tanto ID(s) reales del proveedor (${realIds.join(", ")}) como código(s) temporal(es) (${pedIds.join(", ")}).`,
          entityType: "receipt",
          entityId: receipt.id,
          entityLabel: `Pedido #${receipt.consecutive} - ${srv.serviceName}`,
          suggestedFix: `Conservar únicamente el ID real de seguimiento (${realIds.join(", ")}) y eliminar el placeholder temporal.`,
          metadata: { serviceIndex: sIdx, realIds, pedIds },
        });
      } else if (splitFromOrderId.length > 0 && rawOrderIds.length > 0) {
        // Caso 2: Discrepancia real entre 'orderId' y 'orderIds' cuando ambos existen
        // Nota: Si es un servicio reenviado/reordenado, es válido que 'orderId' tenga el ID nuevo activo
        // y 'orderIds' conserve [nuevoId, idAnterior] para historial de búsqueda.
        const isValidReorderHistory =
          (Boolean(srv.isResent) || Boolean(srv.previousOrderId) || rawOrderIds.length > splitFromOrderId.length) &&
          splitFromOrderId.every((id) => rawOrderIds.includes(id));

        const normalizedPrimaryTokens = splitFromOrderId.join(",");
        const normalizedArrayTokens = rawOrderIds.join(",");

        if (!isValidReorderHistory && normalizedPrimaryTokens !== normalizedArrayTokens) {
          const expectedPrimary = (realIds.length > 0 ? realIds : getItemOrderIds(srv)).join(", ");
          issues.push({
            id: `tracking_desync_${receipt.id}_${sIdx}`,
            category: "tracking_id_discrepancy",
            severity: "medium",
            title: `Desincronización entre orderId y orderIds en Pedido #${receipt.consecutive}`,
            description: `En el pedido #${receipt.consecutive} (${srv.serviceName}), el campo 'orderId' ("${rawOrderId}") tiene IDs distintos a la lista 'orderIds' ([${rawOrderIds.join(", ")}]).`,
            entityType: "receipt",
            entityId: receipt.id,
            entityLabel: `Pedido #${receipt.consecutive} - ${srv.serviceName}`,
            suggestedFix: `Unificar ambos campos de seguimiento a "${expectedPrimary}".`,
            metadata: { serviceIndex: sIdx, expectedPrimary },
          });
        }
      } else if (splitFromOrderId.length === 0 && rawOrderIds.length > 0) {
        // Tiene 'orderIds' pero 'orderId' está vacío
        const expectedPrimary = (realIds.length > 0 ? realIds : rawOrderIds).join(", ");
        issues.push({
          id: `tracking_desync_${receipt.id}_${sIdx}`,
          category: "tracking_id_discrepancy",
          severity: "low",
          title: `Campo primario orderId vacío en Pedido #${receipt.consecutive}`,
          description: `En el pedido #${receipt.consecutive} (${srv.serviceName}), 'orderIds' contiene [${rawOrderIds.join(", ")}] pero 'orderId' está vacío.`,
          entityType: "receipt",
          entityId: receipt.id,
          entityLabel: `Pedido #${receipt.consecutive} - ${srv.serviceName}`,
          suggestedFix: `Asignar "${expectedPrimary}" al campo 'orderId'.`,
          metadata: { serviceIndex: sIdx, expectedPrimary },
        });
      }

      // Caso 3: Marcado como reenvío por error cuando previousOrderId era un placeholder PED- o igual al orderId actual
      const currentActiveId = splitFromOrderId.join(", ");
      if (
        srv.isResent &&
        ((srv.previousOrderId && /^PED-\d+$/i.test(srv.previousOrderId.trim())) ||
          (srv.previousOrderId && srv.previousOrderId.trim() === currentActiveId))
      ) {
        issues.push({
          id: `tracking_false_resend_${receipt.id}_${sIdx}`,
          category: "tracking_id_discrepancy",
          severity: "medium",
          title: `Marca de reenvío inválida en Pedido #${receipt.consecutive}`,
          description: `El servicio "${srv.serviceName}" en el pedido #${receipt.consecutive} quedó marcado como reenviado teniendo como ID anterior "${srv.previousOrderId}".`,
          entityType: "receipt",
          entityId: receipt.id,
          entityLabel: `Pedido #${receipt.consecutive} - ${srv.serviceName}`,
          suggestedFix: "Limpiar la bandera 'isResent' y el 'previousOrderId' temporal.",
          metadata: { serviceIndex: sIdx },
        });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Verificar Garantías de Proveedor (supplier_warranties)
  // ---------------------------------------------------------------------------
  supplierWarranties.forEach((w) => {
    if (w.receiptId && !receiptById.has(w.receiptId)) {
      issues.push({
        id: `warranty_orphan_receipt_${w.id}`,
        category: "warranty_link_discrepancy",
        severity: "medium",
        title: `Garantía vinculada a un receiptId inexistente`,
        description: `La garantía del ID de orden #${w.providerOrderId} (${w.clientName}) apunta a un receiptId="${w.receiptId}" que no existe.`,
        entityType: "warranty",
        entityId: w.id,
        entityLabel: `Garantía #${w.providerOrderId} (${w.clientName})`,
        suggestedFix: "Vincular la garantía con el pedido correspondiente por consecutivo o ID de orden.",
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Resumen y puntaje de salud
  // ---------------------------------------------------------------------------
  const highSeverityCount = issues.filter((i) => i.severity === "high").length;
  const mediumSeverityCount = issues.filter((i) => i.severity === "medium").length;
  const lowSeverityCount = issues.filter((i) => i.severity === "low").length;

  const orphanReceiptsCount = issues.filter((i) => i.category === "orphan_receipt").length;
  const danglingReceiptIdsCount = issues.filter((i) => i.category === "dangling_receipt_id").length;
  const bidirectionalMismatchesCount = issues.filter((i) => i.category === "bidirectional_link_mismatch").length;
  const trackingIdDiscrepanciesCount = issues.filter((i) => i.category === "tracking_id_discrepancy").length;
  const clientCodeIssuesCount = issues.filter((i) => i.category === "client_code_issue").length;
  const clientStatsMismatchesCount = issues.filter((i) => i.category === "client_stats_mismatch").length;
  const warrantyDiscrepanciesCount = issues.filter((i) => i.category === "warranty_link_discrepancy").length;

  const penalty = highSeverityCount * 8 + mediumSeverityCount * 3 + lowSeverityCount * 1;
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));

  return {
    summary: {
      totalClients: clients.length,
      totalReceipts: receipts.length,
      totalWarranties: supplierWarranties.length,
      totalIssues: issues.length,
      highSeverityCount,
      mediumSeverityCount,
      lowSeverityCount,
      orphanReceiptsCount,
      danglingReceiptIdsCount,
      bidirectionalMismatchesCount,
      trackingIdDiscrepanciesCount,
      clientCodeIssuesCount,
      clientStatsMismatchesCount,
      warrantyDiscrepanciesCount,
      healthScore,
      checkedAt: new Date().toISOString(),
    },
    issues,
  };
}
