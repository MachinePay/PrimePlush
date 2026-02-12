import express from "express";
import knex from "knex";
import path from "path";
const router = express.Router();

// 1. Configuração do Banco
const dbConfig = process.env.DATABASE_URL
  ? {
      client: "pg",
      connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      },
    }
  : {
      client: "sqlite3",
      connection: {
        filename: path.join(process.cwd(), "data", "kiosk.sqlite"),
      },
      useNullAsDefault: true,
    };

const db = knex(dbConfig);

// 2. Middleware de autenticação
function superAdminAuth(req, res, next) {
  const password = req.headers["x-super-admin-password"];
  if (!password || password !== process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// 3. Endpoint POST - Marcar como recebido
router.post(
  "/super-admin/receivables/mark-received",
  superAdminAuth,
  async (req, res) => {
    try {
      const { orderIds } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds obrigatório (array)" });
      }

      const now = new Date().toISOString();
      // Para cada pedido, calcular e salvar valorRecebido
      for (const orderId of orderIds) {
        const order = await db("orders").where({ id: orderId }).first();
        if (!order) continue;
        let items = [];
        try {
          items = Array.isArray(order.items)
            ? order.items
            : JSON.parse(order.items || "[]");
        } catch (e) {
          items = [];
        }
        let totalBruto = 0;
        items.forEach((item) => {
          const priceRaw = item.precoBruto || item.priceRaw || 0;
          totalBruto += priceRaw * (item.quantity || 1);
        });
        const valorTotal = order.total ? parseFloat(order.total) : 0;
        const valorRecebido = valorTotal - totalBruto;
        await db("orders").where({ id: orderId }).update({
          repassadoSuperAdmin: 1,
          dataRepasseSuperAdmin: now,
          valorRecebido: valorRecebido,
        });
      }

      return res.json({
        success: true,
        message: "Recebíveis marcados como recebidos",
        receivedOrderIds: orderIds,
        dataRepasse: now,
      });
    } catch (err) {
      console.error("[DEBUG] Erro no POST:", err);
      return res
        .status(500)
        .json({ error: "Erro interno", details: err.message });
    }
  },
);

// 4. Endpoint GET - Listar recebíveis
router.get("/super-admin/receivables", superAdminAuth, async (req, res) => {
  try {
    // A. Buscar IDs já processados na tabela de repasses
    const receivablesRows = await db("super_admin_receivables").select(
      "order_ids",
    );
    let alreadyProcessedIds = [];
    receivablesRows.forEach((row) => {
      if (row.order_ids) {
        try {
          const ids = JSON.parse(row.order_ids);
          if (Array.isArray(ids)) alreadyProcessedIds.push(...ids);
        } catch (e) {
          /* ignore */
        }
      }
    });

    // B. Buscar pedidos pagos que ainda não foram processados
    const paidOrders = await db("orders")
      .whereIn("paymentStatus", ["paid", "authorized"])
      .whereNotIn(
        "id",
        alreadyProcessedIds.length > 0 ? alreadyProcessedIds : [""],
      )
      .orderBy("timestamp", "desc");

    let totalBrutoReceber = 0;
    const detailedOrders = [];

    // C. Processar detalhes de cada pedido pendente
    for (const order of paidOrders) {
      let items = [];
      try {
        items = Array.isArray(order.items)
          ? order.items
          : JSON.parse(order.items || "[]");
      } catch (e) {
        items = [];
      }

      const detailedItems = [];
      let orderValueToReceive = 0;

      for (const item of items) {
        const prodId = item.productId || item.id;
        let precoBruto = 0;

        if (prodId) {
          const prod = await db("products").where({ id: prodId }).first();
          precoBruto = prod && prod.priceRaw ? parseFloat(prod.priceRaw) : 0;
        }

        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 1;
        const profit = (price - precoBruto) * quantity;

        orderValueToReceive += profit;
        detailedItems.push({
          name: item.name || "Produto",
          price,
          precoBruto,
          quantity,
          valueToReceive: profit,
        });
      }

      totalBrutoReceber += orderValueToReceive;
      detailedOrders.push({
        id: order.id,
        timestamp: order.timestamp,
        userName: order.userName || "Cliente",
        total: parseFloat(order.total) || 0,
        orderValueToReceive,
        items: detailedItems,
        paymentStatus: order.paymentStatus,
      });
    }

    // D. Buscar Histórico de Repasses
    const historyRows = await db("super_admin_receivables")
      .select("id", "amount", "received_at", "order_ids")
      .orderBy("received_at", "desc")
      .limit(20);

    const history = [];
    for (const h of historyRows) {
      let orderIds = [];
      try {
        orderIds = JSON.parse(h.order_ids || "[]");
      } catch (e) {
        orderIds = [];
      }

      if (orderIds.length > 0) {
        const relatedOrders = await db("orders").whereIn("id", orderIds);
        relatedOrders.forEach((o) => {
          let valorRecebido = null;
          if (o.valorRecebido !== undefined && o.valorRecebido !== null) {
            valorRecebido = parseFloat(o.valorRecebido);
          } else {
            let items = [];
            try {
              items = Array.isArray(o.items)
                ? o.items
                : JSON.parse(o.items || "[]");
            } catch (e) {
              items = [];
            }
            let totalBruto = 0;
            items.forEach((item) => {
              const priceRaw = item.precoBruto || item.priceRaw || 0;
              totalBruto += priceRaw * (item.quantity || 1);
            });
            const valorTotal = o.total ? parseFloat(o.total) : 0;
            valorRecebido = valorTotal - totalBruto;
          }
          const valorTotal = o.total ? parseFloat(o.total) : 0;
          history.push({
            repasseId: h.id,
            pedidoId: o.id,
            cliente: o.userName || "-",
            valorTotal,
            dataPedido: o.timestamp,
            dataRepasse: o.dataRepasseSuperAdmin || h.received_at,
            valorRecebido,
          });
        });
      } else {
        history.push({
          repasseId: h.id,
          pedidoId: "-",
          cliente: "N/A",
          valorTotal: parseFloat(h.amount) || 0,
          dataPedido: "-",
          dataRepasse: h.received_at,
          valorRecebido: parseFloat(h.amount),
        });
      }
    }

    const totalSum = await db("super_admin_receivables")
      .sum("amount as total")
      .first();

    return res.json({
      success: true,
      stats: {
        totalToReceive: Math.max(0, totalBrutoReceber),
        alreadyReceived: parseFloat(totalSum.total) || 0,
      },
      history,
      orders: detailedOrders,
    });
  } catch (err) {
    console.error("[ERROR GET]:", err);
    return res
      .status(500)
      .json({ error: "Erro ao buscar dados", details: err.message });
  }
});

export default router;
