// Exemplo de implementação de endpoint para o SuperAdmin detalhar pedidos e cálculo de recebíveis
const express = require('express');
const router = express.Router();
const { getAllOrders } = require('../services/paymentService');

// Middleware simples de autenticação por senha
function superAdminAuth(req, res, next) {
  const password = req.headers['x-super-admin-password'];
  if (!password || password !== process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Endpoint detalhado para recebíveis do SuperAdmin
router.get('/super-admin/receivables', superAdminAuth, async (req, res) => {
  try {
    // Busca todos os pedidos pagos ou autorizados (Mercado Pago)
      const orders = await getAllOrders({ paymentStatus: ['paid', 'authorized'] });

      let totalToReceive = 0;
      const detailedOrders = orders.map((order) => {
        // Informações básicas
        const { id, timestamp, userName, total } = order;
        // Parse dos itens
        let items = [];
        try {
          items = typeof order.items === 'string' ? JSON.parse(order.items) : Array.isArray(order.items) ? order.items : [];
        } catch (e) {
          items = [];
        }
        // Detalhes dos itens e cálculo
        let orderValueToReceive = 0;
        const itemDetails = items.map((item) => {
          const price = Number(item.price) || 0;
          const precoBruto = Number(item.precoBruto) || 0;
          const quantity = Number(item.quantity) || 1;
          const valueToReceive = (price - precoBruto) * quantity;
          orderValueToReceive += valueToReceive;
          return {
            name: item.name || '',
            price,
            precoBruto,
            quantity,
            valueToReceive
          };
        });
        totalToReceive += orderValueToReceive;
        return {
          id,
          timestamp,
          userName,
          total,
          orderValueToReceive,
          items: itemDetails
        };
      });

      // Simule valores já recebidos e recebidos no período
      const alreadyReceived = 0; // Busque do banco se necessário
      const totalReceived = 0; // Busque do banco se necessário
      // Histórico de recebimentos (mock)
      const history = [];
      res.json({
        success: true,
        stats: {
          totalToReceive,
          totalReceived,
          alreadyReceived
        },
        history,
        orders: detailedOrders
      });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dados', details: err.message });
  }
});

export default router;
