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

    // Cálculo dos totais
    let totalPedidos = 0;
    let taxas = 0;
    const detailedOrders = orders.map((o) => {
      // Mercado Pago: paymentType = 'mercadopago' ou similar
      const isMercadoPago = o.paymentType && o.paymentType.toLowerCase().includes('mercado');
      const fee = o.fee || 0;
      const valorBruto = isMercadoPago ? o.total - fee : o.total;
      // Valor a receber = valorBruto
      totalPedidos += o.total;
      taxas += fee;
      return {
        ...o,
        valorBruto,
        fee,
        calculo: isMercadoPago ? `${o.total} - ${fee} = ${valorBruto}` : `${o.total}`,
        paymentType: o.paymentType || 'presencial',
      };
    });

    // Simule valores já recebidos e recebidos no período
    const alreadyReceived = 0; // Busque do banco se necessário
    const totalToReceive = totalPedidos - taxas - alreadyReceived;
    const totalReceived = 0; // Busque do banco se necessário
    // Histórico de recebimentos (mock)
    const history = [];
    res.json({
      stats: {
        totalToReceive,
        totalReceived,
        alreadyReceived
      },
      history,
      orders: detailedOrders // Lista detalhada dos pedidos
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dados', details: err.message });
  }
});

module.exports = router;
