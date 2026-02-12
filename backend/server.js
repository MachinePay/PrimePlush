// ...existing code...
// ...existing code...
// ...existing code...
// Atualizar informações do usuário (incluindo senha)

import { sendOrderPdfEmail } from "./services/orderPdfEmail.js";
import express from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";
import OpenAI from "openai";
import knex from "knex";
import jwt from "jsonwebtoken";
import { createClient } from "redis";
import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import paymentRoutes from "./routes/payment.js";
import * as paymentService from "./services/paymentService.js";
import PDFDocument from "pdfkit";
import superAdminRoutes from "./routes/superadmin.js";

// Corrige importação para compatibilidade CommonJS/ESM
// Se der erro, tente:
// import superAdminRoutes = require('./routes/superadmin.js');
// ou
// import * as superAdminRoutes from './routes/superadmin.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Configuração CORS para permitir frontend local e produção
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://primeplush.vercel.app",
      "https://primeplush.com.br",
    ],
    credentials: true,
  }),
);

// Centraliza as rotas de Super Admin
app.use("/api", superAdminRoutes);

// Endpoint: contagem de pedidos dos últimos 30 dias
app.get("/api/orders/last30days-count", async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const count = await db("orders")
      .where("timestamp", ">=", thirtyDaysAgo.toISOString())
      .count({ total: "id" })
      .first();
    res.json({ count: Number(count.total) || 0 });
  } catch (err) {
    console.error("Erro ao buscar contagem dos últimos 30 dias:", err);
    res
      .status(500)
      .json({ error: "Erro ao buscar contagem dos últimos 30 dias" });
  }
});
// --- Configurações ---
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const MP_DEVICE_ID = process.env.MP_DEVICE_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const KITCHEN_PASSWORD = process.env.KITCHEN_PASSWORD;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
const REDIS_URL = process.env.REDIS_URL;

// Inicializa SDK do Mercado Pago
let mercadopago = null;
let paymentClient = null;
let preferenceClient = null;

if (MP_ACCESS_TOKEN) {
  const client = new MercadoPagoConfig({
    accessToken: MP_ACCESS_TOKEN,
    options: { timeout: 5000 },
  });
  mercadopago = client;
  paymentClient = new Payment(client);
  preferenceClient = new Preference(client);
  console.log("✅ SDK MercadoPago inicializado com sucesso!");
} else {
  console.warn("⚠️ MP_ACCESS_TOKEN não configurado - SDK desabilitado");
}

// --- Banco de Dados ---
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

const parseJSON = (data) => {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }
  return data || [];
};

const dbType = process.env.DATABASE_URL
  ? "PostgreSQL (Render)"
  : "SQLite (Local)";
console.log(`🗄️ Usando banco: ${dbType}`);

// --- Configuração Redis para Cache ---
let redisClient = null;
let useRedis = false;

// Cache de pagamentos confirmados - Fallback Map para quando Redis não disponível
const confirmedPayments = new Map();

// Função para inicializar Redis (chamada junto com initDatabase)
async function initRedis() {
  if (REDIS_URL) {
    try {
      console.log("⏳ Conectando ao Redis...");
      redisClient = createClient({ url: REDIS_URL });

      redisClient.on("error", (err) => {
        console.error("❌ Erro Redis:", err.message);
        useRedis = false;
        console.log("⚠️ Usando Map em memória como fallback");
      });

      redisClient.on("connect", () => {
        console.log("✅ Redis conectado com sucesso!");
        useRedis = true;
      });

      // Conecta ao Redis
      await redisClient.connect();
    } catch (error) {
      console.error("❌ Falha ao conectar Redis:", error.message);
      console.log("⚠️ Usando Map em memória como fallback");
      redisClient = null;
      useRedis = false;
    }
  } else {
    console.log("ℹ️ REDIS_URL não configurado - usando Map em memória");
  }
}

// Funções auxiliares para cache unificado (Redis ou Map)
const cachePayment = async (key, value) => {
  if (useRedis && redisClient) {
    try {
      await redisClient.setEx(key, 3600, JSON.stringify(value)); // Expira em 1 hora
      return true;
    } catch (error) {
      console.error("❌ Erro ao salvar no Redis, usando Map:", error.message);
      confirmedPayments.set(key, value);
      return true;
    }
  } else {
    confirmedPayments.set(key, value);
    return true;
  }
};

const getCachedPayment = async (key) => {
  if (useRedis && redisClient) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error("❌ Erro ao ler do Redis, usando Map:", error.message);
      return confirmedPayments.get(key) || null;
    }
  } else {
    return confirmedPayments.get(key) || null;
  }
};

const deleteCachedPayment = async (key) => {
  if (useRedis && redisClient) {
    try {
      await redisClient.del(key);
    } catch (error) {
      console.error("❌ Erro ao deletar do Redis:", error.message);
    }
  }
  confirmedPayments.delete(key);
};

// ⚠️ CRON JOBS MOVIDOS PARA WORKER SEPARADO
// Ver: workers/cronJobs.js (node-cron) ou workers/bullQueue.js (Bull + Redis)
//
// Benefícios:
// - ✅ Não bloqueia o servidor HTTP
// - ✅ Pode ser escalado independentemente
// - ✅ Reinicia automaticamente em caso de erro
// - ✅ Logs isolados e estruturados
//
// Para iniciar o worker:
// - Desenvolvimento: npm run worker
// - Produção: pm2 start workers/cronJobs.js --name worker-cron

// Função para limpar cache antigo (a cada 1 hora) - apenas para Map (Redis tem TTL automático)
// Este permanece no servidor principal pois precisa acessar o Map em memória
setInterval(() => {
  if (!useRedis) {
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, value] of confirmedPayments.entries()) {
      if (value.timestamp < oneHourAgo) {
        confirmedPayments.delete(key);
      }
    }
  }
}, 3600000);

// --- Inicialização do Banco (SEED) ---
async function initDatabase() {
  // Adiciona colunas extras para pagamento se não existirem
  const paymentCols = [
    { name: "paymentType", type: "string" },
    { name: "paymentMethod", type: "string" },
    { name: "installments", type: "integer" },
    { name: "fee", type: "decimal" },
  ];
  for (const col of paymentCols) {
    const hasCol = await db.schema.hasColumn("orders", col.name);
    if (!hasCol) {
      await db.schema.table("orders", (table) => {
        if (col.type === "string") table.string(col.name);
        if (col.type === "integer") table.integer(col.name);
        if (col.type === "decimal") table.decimal(col.name, 8, 2);
      });
      console.log(`✅ Coluna '${col.name}' adicionada à tabela orders`);
    }
  }
  console.log("⏳ Verificando tabelas...");

  // ========== TABELA DE RECEBIMENTOS DO SUPER ADMIN ==========
  const hasReceivables = await db.schema.hasTable("super_admin_receivables");
  if (!hasReceivables) {
    await db.schema.createTable("super_admin_receivables", (table) => {
      table.increments("id").primary();
      table.decimal("amount", 10, 2).notNullable();
      table.text("order_ids");
      table.timestamp("received_at").defaultTo(db.fn.now());
    });
    console.log("✅ Tabela 'super_admin_receivables' criada com sucesso");
  } else {
    // Adiciona a coluna order_ids se não existir
    const hasOrderIds = await db.schema.hasColumn(
      "super_admin_receivables",
      "order_ids",
    );
    if (!hasOrderIds) {
      await db.schema.alterTable("super_admin_receivables", (table) => {
        table.text("order_ids");
      });
      console.log(
        "✅ Coluna 'order_ids' adicionada à tabela 'super_admin_receivables'",
      );
    }
  }

  const hasProducts = await db.schema.hasTable("products");
  if (!hasProducts) {
    await db.schema.createTable("products", (table) => {
      table.string("id").primary();
      table.string("name").notNullable();
      table.decimal("price", 8, 2).notNullable();
      table.decimal("priceRaw", 8, 2).notNullable().defaultTo(0); // Preço bruto
      table.string("category").notNullable();
      table.string("videoUrl");
      table.string("imageUrl"); // URL da imagem do produto
      table.boolean("popular").defaultTo(false);
      table.integer("stock"); // NULL = estoque ilimitado, 0 = esgotado
      table.integer("stock_reserved").defaultTo(0); // Estoque reservado temporariamente
      table.integer("minStock").defaultTo(0); // Estoque mínimo
    });
    // Adiciona coluna imageUrl se não existir
    const hasImageUrl = await db.schema.hasColumn("products", "imageUrl");
    if (!hasImageUrl) {
      await db.schema.table("products", (table) => {
        table.string("imageUrl");
      });
      console.log("✅ Coluna imageUrl adicionada");
    }
  } else {
    // Remover coluna description se existir
    const hasDescription = await db.schema.hasColumn("products", "description");
    if (hasDescription) {
      try {
        await db.schema.table("products", (table) => {
          table.dropColumn("description");
        });
        console.log("✅ Coluna description removida");
      } catch (e) {
        console.warn(
          "⚠️ Não foi possível remover coluna description (pode ser limitação do SQLite)",
        );
      }
    }
    // Adiciona coluna priceRaw se não existir
    const hasPriceRaw = await db.schema.hasColumn("products", "priceRaw");
    if (!hasPriceRaw) {
      await db.schema.table("products", (table) => {
        table.decimal("priceRaw", 8, 2).notNullable().defaultTo(0);
      });
      console.log("✅ Coluna priceRaw adicionada");
    }
    // Adiciona coluna minStock se não existir
    const hasMinStock = await db.schema.hasColumn("products", "minStock");
    if (!hasMinStock) {
      await db.schema.table("products", (table) => {
        table.integer("minStock").defaultTo(0);
      });
      console.log("✅ Coluna minStock adicionada");
    }
    // ...existing code para stock_reserved e stock...
    const hasReservedColumn = await db.schema.hasColumn(
      "products",
      "stock_reserved",
    );
    if (!hasReservedColumn) {
      await db.schema.table("products", (table) => {
        table.integer("stock_reserved").defaultTo(0);
      });
      console.log("✅ Coluna stock_reserved adicionada");
    }
    const hasStock = await db.schema.hasColumn("products", "stock");
    if (!hasStock) {
      await db.schema.table("products", (table) => {
        table.integer("stock");
      });
      console.log("✅ Coluna stock adicionada à tabela products");
    }
  }

  const hasUsers = await db.schema.hasTable("users");
  if (!hasUsers) {
    await db.schema.createTable("users", (table) => {
      table.string("id").primary();
      table.string("name").notNullable();
      table.string("email").unique();
      table.string("cpf").unique();
      table.json("historico").defaultTo("[]");
      table.integer("pontos").defaultTo(0);
    });
  }

  const hasOrders = await db.schema.hasTable("orders");
  if (!hasOrders) {
    await db.schema.createTable("orders", (table) => {
      table.string("id").primary();
      table
        .string("userId")
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");
      table.string("userName");
      table.decimal("total", 8, 2).notNullable();
      table.string("timestamp").notNullable();
      table.string("status").defaultTo("active");
      table.string("paymentStatus").defaultTo("pending");
      table.string("paymentId");
      table.json("items").notNullable();
      table.timestamp("completedAt");
    });
  }

  // Adiciona a coluna 'observation' se ela não existir
  const hasObservationColumn = await db.schema.hasColumn(
    "orders",
    "observation",
  );
  if (!hasObservationColumn) {
    await db.schema.table("orders", (table) => {
      table.text("observation"); // Usando text para permitir observações mais longas
    });
    console.log("✅ Coluna 'observation' adicionada à tabela orders");
  }

  // ========== TABELA DE CATEGORIAS (Multi-tenancy) ==========
  if (!(await db.schema.hasTable("categories"))) {
    await db.schema.createTable("categories", (table) => {
      table.string("id").primary();
      table.string("name").notNullable();
      table.string("icon").defaultTo("📦"); // Emoji da categoria
      table.integer("order").defaultTo(0); // Ordem de exibição
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
    console.log("✅ Tabela 'categories' criada com sucesso");
  }

  // Modo single-tenant: não cria tabela de lojas
  // Configure as credenciais Mercado Pago no .env
  // ...existing code...

  // Endpoint para gerar e baixar o PDF do pedido
  app.get("/api/orders/:id/receipt-pdf", async (req, res) => {
    try {
      const orderId = req.params.id;
      // Buscar o pedido no banco de dados
      const order = await db("orders").where({ id: orderId }).first();
      if (!order) {
        return res.status(404).json({ error: "Pedido não encontrado" });
      }
      // Buscar itens do pedido a partir da tabela order_products
      const orderProducts = await db("order_products").where({
        order_id: order.id,
      });
      // Buscar dados dos produtos para cada item
      const items = [];
      for (const op of orderProducts) {
        const product = await db("products")
          .where({ id: op.product_id })
          .first();
        items.push({
          id: op.product_id,
          name: product ? product.name : "-",
          price: op.price,
          quantity: op.quantity,
        });
      }
      order.items = items;

      // Buscar dados do usuário
      let user = null;
      if (order.userId) {
        user = await db("users").where({ id: order.userId }).first();
      }
      if (user) {
        order.userName = user.name || order.userName;
        order.email = user.email || order.email;
        order.cpf = user.cpf || order.cpf;
        // Adicione outros campos conforme necessário (telefone, endereço, etc.)
        // Exemplo:
        order.phone = user.phone || order.phone;
        order.address = user.address || order.address;
        order.cep = user.cep || order.cep;
      }

      // PDF estilizado
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename=pedido-${order.id}.pdf`,
      );
      const { generateStyledOrderPdf } =
        await import("./services/styledOrderPdf.js");
      generateStyledOrderPdf(order, res);
    } catch (error) {
      console.error("Erro ao gerar PDF do pedido:", error);
      res.status(500).json({ error: "Erro ao gerar PDF do pedido" });
    }
  });
  // ...existing code...
  // ========== LOGIN POR CPF E SENHA ===========
  app.post("/api/users/login", async (req, res) => {
    const { cpf, password } = req.body;
    if (!cpf || !password) {
      return res.status(400).json({ error: "CPF e senha obrigatórios" });
    }
    const cpfClean = String(cpf).replace(/\D/g, "");
    try {
      const user = await db("users").where({ cpf: cpfClean }).first();
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }
      if (user.password !== password) {
        return res.status(401).json({ error: "Senha incorreta" });
      }
      res.json({
        success: true,
        user: { ...user, historico: parseJSON(user.historico) },
      });
    } catch (e) {
      console.error("❌ Erro ao autenticar usuário:", e);
      res.status(500).json({ error: "Erro ao autenticar usuário" });
    }
  });

  const result = await db("products").count("id as count").first();
  if (Number(result.count) === 0) {
    try {
      const menuDataPath = path.join(process.cwd(), "data", "menu.json");
      const rawData = await fs.readFile(menuDataPath, "utf-8");
      await db("products").insert(JSON.parse(rawData));
      console.log("✅ Menu carregado com sucesso!");
    } catch (e) {
      console.error("⚠️ Erro ao carregar menu.json:", e.message);
    }
  } else {
    console.log(`✅ O banco já contém ${result.count} produtos.`);
  }

  // Verifica OpenAI
  if (openai) {
    console.log("🤖 OpenAI configurada - IA disponível");
  } else {
    console.log("⚠️ OpenAI NÃO configurada - OPENAI_API_KEY não encontrada");
  }
}

// ...a definição da rota PUT /api/users/:id deve ser movida para depois dos middlewares, logo após app.use(express.json()) e app.use(cors(...))

// --- Middlewares ---

// Permissões CORS para web e apps móveis (Capacitor)

const allowedOrigins = [
  "http://localhost:3000",
  "https://primeplush.com.br",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Permite requisições sem origin (apps móveis nativos)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        console.warn(`CORS bloqueado para origem: ${origin}`);
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
    credentials: true,
  }),
);
app.use(express.json());

// --- Rotas de Pagamento Multi-tenant ---
// TEMPORARIAMENTE DESABILITADO - Usando rotas antigas funcionais (linhas 1807+)
// app.use("/api/payment", paymentRoutes);

// --- Rotas Básicas ---
app.get("/", (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 20px;">
      <h1>Pastelaria Backend Online 🚀</h1>
      <p>Banco: <strong>${dbType}</strong></p>
      <p>Status: <strong>OPERACIONAL (Modo Busca por Valor)</strong></p>
    </div>
  `);
});

app.get("/health", (req, res) =>
  res.status(200).json({ status: "ok", db: dbType }),
);

// Endpoint de debug removido: store_id não é mais utilizado

// Rota de teste do webhook (para verificar se está acessível)
app.get("/api/webhooks/mercadopago", (req, res) => {
  console.log("📋 GET recebido no webhook - Teste manual ou verificação do MP");
  res.status(200).json({
    message: "Webhook endpoint ativo! Use POST para enviar notificações.",
    ready: true,
    method: "GET - Para receber notificações reais, o MP deve usar POST",
  });
});

// --- Rota de Autenticação Segura ---
app.post("/api/auth/login", (req, res) => {
  const { role, password } = req.body;

  if (!role || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Role e senha são obrigatórios" });
  }

  let correctPassword;
  if (role === "admin") {
    correctPassword = ADMIN_PASSWORD;
  } else if (role === "kitchen") {
    correctPassword = KITCHEN_PASSWORD;
  } else if (role === "superadmin") {
    correctPassword = SUPER_ADMIN_PASSWORD;
  } else {
    return res.status(400).json({ success: false, message: "Role inválido" });
  }

  if (!correctPassword) {
    console.error(
      `⚠️ A senha para a role '${role}' não está configurada nas variáveis de ambiente.`,
    );
    return res
      .status(500)
      .json({ success: false, message: "Erro de configuração no servidor." });
  }

  if (password === correctPassword) {
    if (!JWT_SECRET) {
      console.error(
        "🚨 JWT_SECRET não está configurado! Não é possível gerar token.",
      );
      return res
        .status(500)
        .json({ success: false, message: "Erro de configuração no servidor." });
    }
    // Gera o token JWT com a role do usuário, válido por 8 horas
    const token = jwt.sign({ role }, JWT_SECRET, { expiresIn: "8h" });
    console.log(`✅ Login bem-sucedido para a role: ${role}`);
    res.json({ success: true, token });
  } else {
    console.log(`❌ Tentativa de login falhou para a role: ${role}`);
    res.status(401).json({ success: false, message: "Senha inválida" });
  }
});

// MODO SINGLE-TENANT

// --- Rotas da API (Menu, Usuários, Pedidos) ---

app.get("/api/menu", async (req, res) => {
  try {
    // SINGLE-TENANT: Retorna todos os produtos
    const products = await db("products").select("*").orderBy("id");
    console.log(
      `✅ [GET /api/menu] Retornando ${products.length} produtos (single-tenant)`,
    );

    res.json(
      products.map((p) => {
        const stockAvailable =
          p.stock === null
            ? null // ilimitado
            : Math.max(0, p.stock - (p.stock_reserved || 0)); // disponível = total - reservado

        return {
          ...p,
          price: parseFloat(p.price),
          priceRaw: p.priceRaw !== undefined ? parseFloat(p.priceRaw) : 0,
          stock: p.stock,
          stock_reserved: p.stock_reserved || 0,
          stock_available: stockAvailable,
          isAvailable: stockAvailable === null || stockAvailable > 0,
        };
      }),
    );
  } catch (e) {
    console.error(`❌ [GET /api/menu] ERRO ao buscar menu:`, e.message);
    console.error(`❌ [GET /api/menu] Stack:`, e.stack);
    res.status(500).json({
      error: "Erro ao buscar menu",
      details: e.message,
    });
  }
});

// --- Middlewares de Autenticação e Autorização ---

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Formato: "Bearer TOKEN"

  if (token == null) {
    return res
      .status(401)
      .json({ error: "Acesso negado. Token não fornecido." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log(`❌ Token inválido: ${err.message}`);
      return res.status(403).json({ error: "Token inválido ou expirado." });
    }
    req.user = user; // Adiciona o payload do token (ex: { role: 'admin' }) à requisição
    next();
  });
};

const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ error: "Acesso negado. Requer permissão de administrador." });
  }
  next();
};

const authorizeKitchen = (req, res, next) => {
  if (req.user.role !== "kitchen" && req.user.role !== "admin") {
    return res.status(403).json({
      error: "Acesso negado. Requer permissão da cozinha ou de administrador.",
    });
  }
  next();
};

// CRUD de Produtos (Admin)

app.post(
  "/api/products",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    const {
      id,
      name,
      price,
      priceRaw,
      category,
      videoUrl,
      popular,
      stock,
      minStock,
    } = req.body;

    if (!name || !price || !category) {
      return res
        .status(400)
        .json({ error: "Nome, preço e categoria são obrigatórios" });
    }

    try {
      const newProduct = {
        id: id || `prod_${Date.now()}`,
        name,
        price: parseFloat(price),
        priceRaw: priceRaw !== undefined ? parseFloat(priceRaw) : 0,
        category,
        videoUrl: videoUrl || "",
        popular: popular || false,
        stock: stock !== undefined ? parseInt(stock) : null, // null = ilimitado
        minStock: minStock !== undefined ? parseInt(minStock) : 0,
      };

      await db("products").insert(newProduct);
      res.status(201).json({
        ...newProduct,
        isAvailable: newProduct.stock === null || newProduct.stock > 0,
      });
    } catch (e) {
      console.error("Erro ao criar produto:", e);
      res.status(500).json({ error: "Erro ao criar produto" });
    }
  },
);

app.put(
  "/api/products/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    const { id } = req.params;
    const {
      name,
      price,
      priceRaw,
      category,
      imageUrl,
      videoUrl,
      popular,
      stock,
      minStock,
    } = req.body;

    try {
      // MULTI-TENANCY: Busca produto apenas da loja específica
      const exists = await db("products").where({ id }).first();
      if (!exists) {
        return res
          .status(404)
          .json({ error: "Produto não encontrado nesta loja" });
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (price !== undefined) updates.price = parseFloat(price);
      if (priceRaw !== undefined) updates.priceRaw = parseFloat(priceRaw);
      if (category !== undefined) updates.category = category;
      if (imageUrl !== undefined) updates.imageUrl = imageUrl;
      if (videoUrl !== undefined) updates.videoUrl = videoUrl;
      if (popular !== undefined) updates.popular = popular;
      if (stock !== undefined)
        updates.stock = stock === null ? null : parseInt(stock);
      if (minStock !== undefined) updates.minStock = parseInt(minStock);

      // MULTI-TENANCY: Atualiza apenas se pertencer à loja
      await db("products").where({ id }).update(updates);

      const updated = await db("products").where({ id }).first();
      res.json({
        ...updated,
        price: parseFloat(updated.price),
        isAvailable: updated.stock === null || updated.stock > 0,
      });
    } catch (e) {
      console.error("Erro ao atualizar produto:", e);
      res.status(500).json({ error: "Erro ao atualizar produto" });
    }
  },
);

app.delete(
  "/api/products/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    const { id } = req.params;

    try {
      // MULTI-TENANCY: Busca produto apenas da loja específica
      const exists = await db("products").where({ id }).first();
      if (!exists) {
        return res
          .status(404)
          .json({ error: "Produto não encontrado nesta loja" });
      }

      // MULTI-TENANCY: Deleta apenas se pertencer à loja
      await db("products").where({ id }).del();
      res.json({ success: true, message: "Produto deletado com sucesso" });
    } catch (e) {
      console.error("Erro ao deletar produto:", e);
      res.status(500).json({ error: "Erro ao deletar produto" });
    }
  },
);

// ========== CRUD DE CATEGORIAS (Single-tenant) ==========

// Listar categorias
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await db("categories")
      .select("id", "name", "icon", "order", "created_at")
      .orderBy("order", "asc")
      .orderBy("name", "asc");
    res.json(categories);
  } catch (e) {
    console.error("❌ Erro ao buscar categorias:", e);
    res.status(500).json({ error: "Erro ao buscar categorias" });
  }
});

// Criar nova categoria
app.post(
  "/api/categories",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    const { name, icon, order } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Nome da categoria é obrigatório" });
    }
    try {
      // Verifica se categoria já existe
      const exists = await db("categories")
        .where({ name: name.trim() })
        .first();
      if (exists) {
        return res.status(409).json({
          error: "Categoria já existe",
          category: exists,
        });
      }
      const newCategory = {
        id: `cat_${Date.now()}`,
        name: name.trim(),
        icon: icon || "📦",
        order: order || 0,
      };
      await db("categories").insert(newCategory);
      res.status(201).json(newCategory);
    } catch (e) {
      console.error("❌ Erro ao criar categoria:", e);
      res.status(500).json({ error: "Erro ao criar categoria" });
    }
  },
);

// Atualizar categoria
app.put(
  "/api/categories/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { name, icon, order } = req.body;
    try {
      // Verifica se categoria existe
      const exists = await db("categories").where({ id }).first();
      if (!exists) {
        return res.status(404).json({ error: "Categoria não encontrada" });
      }
      const updates = {};
      if (name !== undefined) updates.name = name.trim();
      if (icon !== undefined) updates.icon = icon;
      if (order !== undefined) updates.order = order;
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Nenhum campo para atualizar" });
      }
      await db("categories").where({ id }).update(updates);
      const updated = await db("categories").where({ id }).first();
      res.json(updated);
    } catch (e) {
      console.error("❌ Erro ao atualizar categoria:", e);
      res.status(500).json({ error: "Erro ao atualizar categoria" });
    }
  },
);

// Deletar categoria
app.delete(
  "/api/categories/:id",
  authenticateToken,
  authorizeAdmin,
  async (req, res) => {
    const { id } = req.params;
    try {
      // Verifica se categoria existe
      const exists = await db("categories").where({ id }).first();
      if (!exists) {
        return res.status(404).json({ error: "Categoria não encontrada" });
      }
      // Verifica se há produtos usando essa categoria
      const productsCount = await db("products")
        .where({ category: exists.name })
        .count("id as count")
        .first();
      if (Number(productsCount.count) > 0) {
        return res.status(409).json({
          error: `Não é possível deletar. Existem ${productsCount.count} produtos usando esta categoria.`,
          productsCount: Number(productsCount.count),
        });
      }
      await db("categories").where({ id }).del();
      res.json({ success: true, message: "Categoria deletada com sucesso" });
    } catch (e) {
      console.error("❌ Erro ao deletar categoria:", e);
      res.status(500).json({ error: "Erro ao deletar categoria" });
    }
  },
);

// Buscar usuário por CPF
app.get("/api/users/cpf/:cpf", async (req, res) => {
  try {
    const cpfClean = String(req.params.cpf).replace(/\D/g, "");

    if (cpfClean.length !== 11) {
      return res.status(400).json({ error: "CPF inválido" });
    }

    const user = await db("users").where({ cpf: cpfClean }).first();

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({
      ...user,
      historico: parseJSON(user.historico),
    });
  } catch (e) {
    console.error("Erro ao buscar usuário por CPF:", e);
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
});

app.get("/api/users", authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const users = await db("users").select("*");
    res.json(users.map((u) => ({ ...u, historico: parseJSON(u.historico) })));
  } catch (e) {
    res.status(500).json({ error: "Erro ao buscar usuários" });
  }
});

// ========== PASSO 1: Verificar se CPF existe (NÃO cria usuário) ==========
app.post("/api/users/check-cpf", async (req, res) => {
  const { cpf } = req.body;
  console.log(`🔍 [CHECK-CPF] CPF: ${cpf}`);

  if (!cpf) {
    return res.status(400).json({ error: "CPF obrigatório" });
  }

  const cpfClean = String(cpf).replace(/\D/g, "");

  if (cpfClean.length !== 11) {
    return res.status(400).json({ error: "CPF inválido" });
  }

  try {
    // Busca usuário no sistema (single-tenant)
    const user = await db("users").where({ cpf: cpfClean }).first();

    if (user) {
      console.log(`✅ CPF encontrado: ${user.name} (${cpfClean})`);
      return res.json({
        exists: true,
        requiresRegistration: false,
        user: {
          ...user,
          historico: parseJSON(user.historico),
        },
      });
    }

    console.log(`📋 CPF não encontrado: ${cpfClean} - necessário cadastro`);
    return res.json({
      exists: false,
      requiresRegistration: true,
      cpf: cpfClean,
    });
  } catch (e) {
    console.error("❌ Erro ao verificar CPF:", e);
    res.status(500).json({ error: "Erro ao verificar CPF" });
  }
});

// ========== PASSO 2: Cadastrar novo usuário (APENAS se não existir) ==========
app.post("/api/users/register", async (req, res) => {
  const { cpf, name, email, cep, address, phone, password } = req.body;
  console.log(`📝 [REGISTER] Nome: ${name}, CPF: ${cpf}`);

  if (!cpf || !name || !email || !cep || !address || !phone || !password) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  }

  const cpfClean = String(cpf).replace(/\D/g, "");

  if (cpfClean.length !== 11) {
    return res.status(400).json({ error: "CPF inválido" });
  }

  try {
    // Verifica se já existe (single-tenant)
    const exists = await db("users").where({ cpf: cpfClean }).first();

    if (exists) {
      console.log(`⚠️ Tentativa de cadastro duplicado: ${cpfClean}`);
      return res.status(409).json({
        error: "CPF já cadastrado",
        user: {
          ...exists,
          historico: parseJSON(exists.historico),
        },
      });
    }

    // Cria novo usuário (single-tenant)
    console.log(`📝 Cadastrando novo usuário: ${name} (${cpfClean})`);

    const newUser = {
      password: password,
      id: `user_${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      cpf: cpfClean,
      cep: cep.trim(),
      address: address.trim(),
      phone: phone.trim(),
      historico: JSON.stringify([]),
      pontos: 0,
      role: "customer",
    };

    await db("users").insert(newUser);

    console.log(`✅ Usuário cadastrado com sucesso: ${newUser.id}`);

    res.status(201).json({
      success: true,
      user: {
        ...newUser,
        historico: [],
      },
    });
  } catch (e) {
    console.error("❌ Erro ao cadastrar usuário:", e);
    res.status(500).json({ error: "Erro ao cadastrar usuário" });
  }
});

app.post("/api/users", async (req, res) => {
  const { cpf, name, email, id } = req.body;
  if (!cpf) return res.status(400).json({ error: "CPF obrigatório" });
  const cpfClean = String(cpf).replace(/\D/g, "");

  try {
    // Verifica se usuário já existe
    const exists = await db("users").where({ cpf: cpfClean }).first();

    if (exists) {
      console.log(
        `ℹ️ CPF ${cpfClean} já cadastrado - retornando usuário existente`,
      );
      return res.json({
        ...exists,
        historico: parseJSON(exists.historico),
        message: "Usuário já existe - login realizado",
      });
    }

    // Cria novo usuário
    const newUser = {
      id: id || `user_${Date.now()}`,
      name: name || "Sem Nome",
      email: email || "",
      cpf: cpfClean,
      historico: JSON.stringify([]),
      pontos: 0,
    };
    await db("users").insert(newUser);
    res.status(201).json({ ...newUser, historico: [] });
  } catch (e) {
    res.status(500).json({ error: "Erro ao salvar usuário" });
  }
});

// ========== DEBUG: Endpoint temporário para ver TODOS os pedidos ==========
app.get("/api/debug/orders", async (req, res) => {
  try {
    const allOrders = await db("orders")
      .select("id", "status", "paymentStatus", "timestamp")
      .orderBy("timestamp", "desc")
      .limit(20);

    console.log(`🔍 [DEBUG] Total de pedidos no banco: ${allOrders.length}`);

    const summary = {
      total: allOrders.length,
      porStatus: {},
      pedidos: allOrders,
    };

    allOrders.forEach((order) => {
      // Conta por status
      const statusKey = `${order.status}/${order.paymentStatus}`;
      summary.porStatus[statusKey] = (summary.porStatus[statusKey] || 0) + 1;
    });

    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get(
  "/api/orders",
  authenticateToken,
  authorizeKitchen,
  async (req, res) => {
    console.log(`🍳 [GET /api/orders] Requisição recebida!`);
    console.log(`🍳 [GET /api/orders] user role: ${req.user?.role}`);

    try {
      // SINGLE-TENANT: Retorna todos os pedidos pagos e ativos
      const orders = await db("orders")
        .whereIn("status", ["active", "preparing"])
        .whereIn("paymentStatus", ["paid", "authorized"])
        .orderBy("timestamp", "asc");

      console.log(`🍳 Cozinha: ${orders.length} pedido(s) PAGOS na fila`);

      if (orders.length > 0) {
        console.log(`📋 IDs dos pedidos:`, orders.map((o) => o.id).join(", "));
      }

      res.json(
        orders.map((o) => ({
          ...o,
          items: parseJSON(o.items),
          total: parseFloat(o.total),
        })),
      );
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar pedidos" });
    }
  },
);

app.post("/api/orders", async (req, res) => {
  const {
    userId,
    userName,
    items,
    total,
    paymentId,
    observation,
    paymentType,
    paymentMethod,
    installments,
    fee,
  } = req.body;

  try {
    // Iniciamos uma transação para garantir integridade dos dados
    await db.transaction(async (trx) => {
      // 1. Garante que o usuário existe
      const userExists = await trx("users").where({ id: userId }).first();
      if (!userExists) {
        await trx("users").insert({
          id: userId,
          name: userName || "Convidado",
          email: null,
          cpf: null,
          historico: "[]",
          pontos: 0,
        });
      }

      // 2. Checagem de estoque
      for (const item of items) {
        const product = await trx("products").where({ id: item.id }).first();
        if (!product) {
          throw new Error(`Produto ${item.id} não encontrado no estoque!`);
        }
        if (product.stock !== null && product.stock < item.quantity) {
          throw new Error(
            `Estoque insuficiente para ${item.name}. Disponível: ${product.stock}, Solicitado: ${item.quantity}`,
          );
        }
      }

      // 3. Garante precoBruto em todos os itens
      const itemsWithPrecoBruto = Array.isArray(items)
        ? items.map((item) => ({
            ...item,
            precoBruto:
              item.precoBruto !== undefined ? Number(item.precoBruto) : 0,
          }))
        : [];

      const newOrder = {
        id: `order_${Date.now()}`,
        userId: userId,
        userName: userName || "Cliente",
        total: total,
        timestamp: new Date().toISOString(),
        status: "pending",
        paymentStatus: "pending",
        paymentId: paymentId || null,
        paymentType: paymentType || null,
        paymentMethod: paymentMethod || null,
        items: JSON.stringify(itemsWithPrecoBruto),
        observation: observation || null,
        installments: installments || null,
        fee: fee || null,
        created_at: new Date(),
      };

      // 4. Salva o pedido
      await trx("orders").insert(newOrder);

      // 5. Salva os itens do pedido na tabela order_products
      if (Array.isArray(items) && items.length > 0) {
        const orderProducts = items.map((item) => ({
          order_id: newOrder.id,
          product_id: item.id,
          quantity: item.quantity || 1,
          price: item.price !== undefined ? item.price : 0,
        }));
        await trx("order_products").insert(orderProducts);
      }

      console.log(`✅ Pedido ${newOrder.id} criado com sucesso!`);
      res.status(201).json({ ...newOrder, items: items || [] });
    });
  } catch (e) {
    console.error("❌ Erro ao salvar pedido:", e);
    res.status(500).json({ error: e.message || "Erro ao salvar ordem" });
  }
});

// Atualizar pedido (adicionar paymentId após pagamento aprovado)
// Endpoint para marcar pedido como pago (presencial)
app.put("/api/orders/:id/mark-paid", async (req, res) => {
  const { id } = req.params;
  try {
    const order = await db("orders").where({ id }).first();
    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    // Parse items from order
    let items = [];
    try {
      items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
    } catch (err) {
      console.error("❌ Erro ao parsear itens do pedido:", err);
      return res.status(500).json({ error: "Erro ao processar itens do pedido" });
    }

    // Decrement stock for each product in the order
    for (const item of items) {
      const product = await db("products").where({ id: item.id }).first();
      if (product && product.stock !== null) {
        const newStock = Math.max(0, product.stock - item.quantity);
        const newReserved = Math.max(0, (product.stock_reserved || 0) - item.quantity);
        await db("products").where({ id: item.id }).update({
          stock: newStock,
          stock_reserved: newReserved,
        });
        console.log(
          `  ✅ [Manual] ${item.name}: ${product.stock} → ${newStock} (-${item.quantity}), reserva: ${product.stock_reserved} → ${newReserved}`
        );
      }
    }

    await db("orders").where({ id }).update({ paymentStatus: "paid" });
    res.json({ success: true, message: "Pedido marcado como pago e estoque atualizado" });
  } catch (e) {
    console.error("❌ Erro ao marcar pedido como pago:", e);
    res.status(500).json({ error: "Erro ao marcar pedido como pago" });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  let { paymentId, paymentStatus } = req.body;
  // Importa serviço de pagamento para validação
  const { checkPaymentStatus } = await import("./services/paymentService.js");

  try {
    console.log(`📝 Atualizando pedido ${id} com payment ${paymentId}...`);

    // SINGLE-TENANT: Busca pedido apenas pelo id
    const order = await db("orders").where({ id }).first();

    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    // Validação: paymentId deve ser string ou null
    if (paymentId !== undefined && paymentId !== null) {
      if (typeof paymentId !== "string") {
        paymentId = String(paymentId);
      }
      // Se vier objeto/array, zera
      if (
        typeof paymentId !== "string" ||
        paymentId === "[object Object]" ||
        Array.isArray(paymentId)
      ) {
        paymentId = null;
      }
    }

    const updates = {};
    if (paymentId !== undefined) updates.paymentId = paymentId;
    if (paymentStatus) updates.paymentStatus = paymentStatus;

    // 🎯 Validação real do pagamento antes de liberar pedido
    let isPaymentApproved = false;
    if (
      paymentId &&
      paymentStatus === "paid" &&
      order.status === "pending_payment"
    ) {
      try {
        // Consulta status real do pagamento
        const paymentResult = await checkPaymentStatus(paymentId, {
          mp_access_token: process.env.MP_ACCESS_TOKEN,
        });
        if (
          paymentResult &&
          (paymentResult.status === "approved" ||
            paymentResult.status === "authorized")
        ) {
          isPaymentApproved = true;
        }
      } catch (err) {
        console.error(
          "❌ Erro ao validar pagamento com Mercado Pago:",
          err.message,
        );
      }
      if (isPaymentApproved) {
        updates.status = "active";
        console.log(
          `🍳 Pedido ${id} liberado para COZINHA! (Pagamento REAL aprovado)`,
        );
      } else {
        console.warn(
          `⚠️ Pagamento não aprovado pelo Mercado Pago. Pedido NÃO liberado.`,
        );
        updates.status = "pending_payment";
      }
    }

    // Se pagamento foi aprovado, CONFIRMA a dedução do estoque
    if (isPaymentApproved && order.paymentStatus === "pending") {
      console.log(`✅ Pagamento aprovado! Confirmando dedução do estoque...`);

      const items = parseJSON(order.items);

      for (const item of items) {
        const product = await db("products").where({ id: item.id }).first();

        if (product && product.stock !== null) {
          // Deduz do estoque real e libera da reserva
          const newStock = Math.max(0, product.stock - item.quantity);
          const newReserved = Math.max(
            0,
            (product.stock_reserved || 0) - item.quantity,
          );

          await db("products").where({ id: item.id }).update({
            stock: newStock,
            stock_reserved: newReserved,
          });

          console.log(
            `  ✅ ${item.name}: ${product.stock} → ${newStock} (-${item.quantity}), reserva: ${product.stock_reserved} → ${newReserved}`,
          );
        }
      }

      console.log(`🎉 Estoque confirmado e deduzido!`);
    }

    await db("orders").where({ id }).update(updates);

    const updated = await db("orders").where({ id }).first();
    console.log(`✅ Pedido ${id} atualizado!`);

    res.json({
      ...updated,
      items: parseJSON(updated.items),
      total: parseFloat(updated.total),
    });
  } catch (e) {
    console.error("❌ Erro ao atualizar pedido:", e);
    res.status(500).json({ error: "Erro ao atualizar pedido" });
  }
});

app.delete(
  "/api/orders/:id",
  authenticateToken,
  authorizeKitchen,
  async (req, res) => {
    try {
      console.log(`🗑️ DELETE pedido ${req.params.id}`);

      // Verifica se o pedido existe
      const order = await db("orders").where({ id: req.params.id }).first();
      console.log(`📦 Pedido existe?`, order ? `SIM` : "NÃO");

      if (!order) {
        console.log(`❌ Pedido não encontrado`);
        return res.status(404).json({ error: "Pedido não encontrado" });
      }

      console.log(`✅ Pedido encontrado:`, {
        id: order.id,
        status: order.status,
      });

      // Se estava pendente, libera a reserva de estoque
      if (order.paymentStatus === "pending") {
        console.log(
          `🔓 Liberando reserva de estoque do pedido ${req.params.id}...`,
        );

        const items = parseJSON(order.items);

        for (const item of items) {
          const product = await db("products").where({ id: item.id }).first();

          if (product && product.stock !== null && product.stock_reserved > 0) {
            const newReserved = Math.max(
              0,
              product.stock_reserved - item.quantity,
            );

            await db("products")
              .where({ id: item.id })
              .update({ stock_reserved: newReserved });

            console.log(
              `  ↩️ ${item.name}: reserva ${product.stock_reserved} → ${newReserved}`,
            );
          }
        }

        console.log(`✅ Reserva liberada!`);
      }

      await db("orders")
        .where({ id: req.params.id })
        .update({ status: "completed", completedAt: new Date().toISOString() });

      res.json({ ok: true });
    } catch (e) {
      console.error("❌ Erro ao finalizar pedido:", e);
      res.status(500).json({ error: "Erro ao finalizar" });
    }
  },
);

app.get("/api/user-orders", async (req, res) => {
  try {
    const { userId } = req.query;
    console.log(`📋 [GET /api/user-orders] userId: ${userId}`);

    let query = db("orders")
      .whereIn("paymentStatus", ["paid", "authorized"])
      .orderBy("timestamp", "desc");
    if (userId) {
      query = query.where({ userId });
    }
    const allOrders = await query.select("*");
    console.log(
      `📋 [GET /api/user-orders] ${allOrders.length} pedidos encontrados`,
    );

    res.json(
      allOrders.map((o) => ({
        ...o,
        items: parseJSON(o.items),
        total: parseFloat(o.total),
      })),
    );
  } catch (err) {
    console.error("❌ Erro em /api/user-orders:", err);
    res.status(500).json({ error: "Erro histórico" });
  }
});

// Endpoint para histórico de pedidos com filtros de data
app.get("/api/orders/history", async (req, res) => {
  try {
    console.log(
      "📋 [GET /api/orders/history] Buscando histórico de pedidos...",
    );
    const { start, end } = req.query;
    let query = db("orders")
      .where(function () {
        this.whereIn("paymentStatus", ["paid", "authorized"]).orWhere(
          function () {
            this.where("paymentType", "presencial");
          },
        );
      })
      .orderBy("timestamp", "desc");
    if (start) query = query.where("timestamp", ">=", start);
    if (end) query = query.where("timestamp", "<=", end);
    const orders = await query;
    console.log(
      `📋 [GET /api/orders/history] Encontrados ${orders.length} pedidos`,
    );
    const parsedOrders = orders.map((o) => ({
      ...o,
      items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
      total: parseFloat(o.total),
      paymentMethod:
        o.paymentMethod ||
        o.payment_method ||
        o.payment_method_id ||
        o.paymentType ||
        "-",
    }));
    res.json(parsedOrders);
  } catch (e) {
    console.error("❌ [GET /api/orders/history] Erro:", e);
    res.status(500).json({
      error: "Erro ao buscar histórico de pedidos",
      message: e.message,
    });
  }
});

// Verificar se pedido existe (útil para debug)
app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await db("orders").where({ id: req.params.id }).first();
    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }
    res.json({
      ...order,
      items: parseJSON(order.items),
      total: parseFloat(order.total),
    });
  } catch (e) {
    res.status(500).json({ error: "Erro ao buscar pedido" });
  }
});

// --- IPN MERCADO PAGO (Para pagamentos físicos Point) ---

app.post("/api/notifications/mercadopago", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔔 [${timestamp}] IPN RECEBIDO DO MERCADO PAGO (Point)`);
  console.log(`${"=".repeat(60)}`);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Query Params:", JSON.stringify(req.query, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log(`${"=".repeat(60)}\n`);

  try {
    // IPN pode vir via query params (?id=X&topic=Y) ou body webhook
    let id = req.query.id || req.body?.data?.id || req.body?.resource;
    let topic = req.query.topic || req.body?.type;

    console.log(`🔍 IPN extraído: ID=${id}, Topic=${topic}`);

    // Responde rápido ao MP (obrigatório - SEMPRE 200 OK)
    res.status(200).send("OK");

    // Processa notificação em background
    if (topic === "point_integration_ipn" && id) {
      console.log(`📨 Processando IPN do Point: ${id}`);

      // Single-tenant: utilize credenciais globais
      let intent = null;
      // Single-tenant: utilize apenas credenciais globais
      // Exemplo: buscar intent usando process.env.MP_ACCESS_TOKEN
      // ...existing code...

      // Se foi cancelado, já processa aqui
      if (intent.state === "CANCELED") {
        console.log(`❌ Payment Intent CANCELADO via IPN`);

        // Limpa a fila
        try {
          await paymentService.clearPaymentQueue({
            mp_access_token: MP_ACCESS_TOKEN,
            mp_device_id: MP_DEVICE_ID,
          });
          console.log(`🧹 Fila limpa após cancelamento via IPN`);
        } catch (e) {
          console.warn(`⚠️ Erro ao limpar fila: ${e.message}`);
        }

        // Cancela o pedido no banco
        if (orderId) {
          try {
            const order = await db("orders").where({ id: orderId }).first();
            if (order && order.paymentStatus === "pending") {
              // Libera estoque
              const items = parseJSON(order.items);
              for (const item of items) {
                const product = await db("products")
                  .where({ id: item.id })
                  .first();
                if (
                  product &&
                  product.stock !== null &&
                  product.stock_reserved > 0
                ) {
                  const newReserved = Math.max(
                    0,
                    product.stock_reserved - item.quantity,
                  );
                  await db("products")
                    .where({ id: item.id })
                    .update({ stock_reserved: newReserved });
                  console.log(
                    `  ↩️ Estoque liberado: ${item.name} (${product.stock_reserved} → ${newReserved})`,
                  );
                }
              }

              // Atualiza pedido
              await db("orders").where({ id: orderId }).update({
                paymentStatus: "canceled",
                status: "canceled",
              });
              console.log(`✅ Pedido ${orderId} cancelado via IPN`);
            }
          } catch (dbError) {
            console.error(
              `❌ Erro ao cancelar pedido ${orderId}:`,
              dbError.message,
            );
          }
        }
        return;
      }

      // Se tem payment.id, busca o pagamento real
      if (intent.payment && intent.payment.id) {
        const paymentId = intent.payment.id;
        console.log(`💳 Buscando detalhes do pagamento real: ${paymentId}`);

        const paymentUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;
        const paymentResp = await fetch(paymentUrl, {
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
        });

        if (paymentResp.ok) {
          const payment = await paymentResp.json();
          console.log(`💳 Pagamento ${paymentId} | Status: ${payment.status}`);

          if (
            payment.status === "approved" ||
            payment.status === "authorized"
          ) {
            // Atualiza pedido no banco
            if (orderId) {
              try {
                const order = await db("orders").where({ id: orderId }).first();
                if (order && order.paymentStatus === "pending") {
                  await db("orders")
                    .where({ id: orderId })
                    .update({
                      paymentStatus: "paid",
                      status: "preparing",
                      paymentType: "online",
                      paymentMethod: payment.payment_method_id || "unknown",
                    });
                  console.log(
                    `✅ Pedido ${orderId} marcado como PAGO via IPN Card`,
                  );
                }
              } catch (dbError) {
                console.error(
                  `❌ Erro ao atualizar pedido ${orderId}:`,
                  dbError.message,
                );
              }
            }

            // Limpa a fila
            try {
              await paymentService.clearPaymentQueue({
                mp_access_token: MP_ACCESS_TOKEN,
                mp_device_id: MP_DEVICE_ID,
              });
              console.log(`🧹 Fila limpa após aprovação via IPN`);
            } catch (e) {
              console.warn(`⚠️ Erro ao limpar fila: ${e.message}`);
            }

            const amountInCents = Math.round(payment.transaction_amount * 100);
            const cacheKey = `amount_${amountInCents}`;

            await cachePayment(cacheKey, {
              paymentId: payment.id,
              amount: payment.transaction_amount,
              status: payment.status,
              timestamp: Date.now(),
            });

            console.log(
              `✅ Pagamento ${paymentId} confirmado via IPN! Valor: R$ ${payment.transaction_amount}`,
            );
            console.log(
              `ℹ️ External reference: ${
                payment.external_reference || "não informado"
              }`,
            );
          } else if (
            payment.status === "rejected" ||
            payment.status === "cancelled" ||
            payment.status === "refunded"
          ) {
            // Cancela o pedido no banco
            if (orderId) {
              try {
                const order = await db("orders").where({ id: orderId }).first();
                if (order && order.paymentStatus === "pending") {
                  // Libera estoque
                  const items = parseJSON(order.items);
                  for (const item of items) {
                    const product = await db("products")
                      .where({ id: item.id })
                      .first();
                    if (
                      product &&
                      product.stock !== null &&
                      product.stock_reserved > 0
                    ) {
                      const newReserved = Math.max(
                        0,
                        product.stock_reserved - item.quantity,
                      );
                      await db("products")
                        .where({ id: item.id })
                        .update({ stock_reserved: newReserved });
                      console.log(
                        `↩️ Estoque liberado: ${item.name} (${product.stock_reserved} → ${newReserved})`,
                      );
                    }
                  }

                  // Atualiza pedido
                  await db("orders").where({ id: orderId }).update({
                    paymentStatus: "canceled",
                    status: "canceled",
                  });
                  console.log(`✅ Pedido ${orderId} cancelado via IPN Card`);
                }
              } catch (dbError) {
                console.error(
                  `❌ Erro ao cancelar pedido ${orderId}:`,
                  dbError.message,
                );
              }
            }

            // Limpa a fila
            try {
              await paymentService.clearPaymentQueue({
                mp_access_token: MP_ACCESS_TOKEN,
                mp_device_id: MP_DEVICE_ID,
              });
              console.log(`🧹 Fila limpa após rejeição via IPN`);
            } catch (e) {
              console.warn(`⚠️ Erro ao limpar fila: ${e.message}`);
            }

            console.log(
              `❌ Pagamento ${paymentId} REJEITADO via IPN! Status: ${payment.status}`,
            );
            console.log(
              `ℹ️ External reference: ${
                payment.external_reference || "não informado"
              }`,
            );

            // Remove do cache se existir
            const amountInCents = Math.round(payment.transaction_amount * 100);
            const cacheKey = `amount_${amountInCents}`;
            await deleteCachedPayment(cacheKey);
            console.log(`🧹 Cache limpo para ${cacheKey}`);
          } else {
            console.log(
              `⏳ Pagamento ${paymentId} com status: ${payment.status} - aguardando`,
            );
          }
        }
      }
      return;
    }

    // Fallback: payment PIX
    if (topic === "payment" && id) {
      console.log(`📨 Processando IPN de pagamento PIX: ${id}`);

      // Single-tenant: utilize credenciais globais
      let payment = null;
      let storeUsed = null;
      // ...implemente aqui a lógica single-tenant se necessário...
      // Exemplo: buscar payment usando process.env.MP_ACCESS_TOKEN
      // ...existing code...

      if (payment.status === "approved") {
        console.log(`✅ Pagamento PIX ${id} APROVADO via IPN!`);

        // Atualiza pedido no banco
        const orderId = payment.external_reference;
        if (orderId) {
          try {
            const order = await db("orders").where({ id: orderId }).first();
            if (order && order.paymentStatus === "pending") {
              await db("orders").where({ id: orderId }).update({
                paymentStatus: "paid",
                status: "preparing",
              });
              console.log(`✅ Pedido ${orderId} marcado como PAGO via IPN PIX`);
            }
          } catch (dbError) {
            console.error(
              `❌ Erro ao atualizar pedido ${orderId}:`,
              dbError.message,
            );
          }
        }
      } else if (
        payment.status === "cancelled" ||
        payment.status === "rejected"
      ) {
        console.log(
          `❌ Pagamento PIX ${id} ${payment.status.toUpperCase()} via IPN`,
        );

        // Cancela pedido e libera estoque
        const orderId = payment.external_reference;
        if (orderId) {
          try {
            const order = await db("orders").where({ id: orderId }).first();
            if (order && order.paymentStatus === "pending") {
              // Libera estoque
              const items = parseJSON(order.items);
              for (const item of items) {
                const product = await db("products")
                  .where({ id: item.id })
                  .first();
                if (
                  product &&
                  product.stock !== null &&
                  product.stock_reserved > 0
                ) {
                  const newReserved = Math.max(
                    0,
                    product.stock_reserved - item.quantity,
                  );
                  await db("products")
                    .where({ id: item.id })
                    .update({ stock_reserved: newReserved });
                  console.log(
                    `↩️ Estoque liberado: ${item.name} (${product.stock_reserved} → ${newReserved})`,
                  );
                }
              }

              await db("orders").where({ id: orderId }).update({
                paymentStatus: "canceled",
                status: "canceled",
              });
              console.log(`✅ Pedido ${orderId} cancelado via IPN PIX`);
            }
          } catch (dbError) {
            console.error(
              `❌ Erro ao cancelar pedido ${orderId}:`,
              dbError.message,
            );
          }
        }
      }
      return;
    }

    console.log(`⚠️ IPN ignorado - Topic: ${topic}, ID: ${id}`);
  } catch (error) {
    console.error("❌ Erro processando IPN:", error.message);
  }
});

// Endpoint teste para validar IPN
app.get("/api/notifications/mercadopago", (req, res) => {
  res.json({
    status: "ready",
    message: "IPN endpoint pronto",
  });
});

// --- WEBHOOK MERCADO PAGO (Notificação Instantânea) ---

app.post("/api/webhooks/mercadopago", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔔 [${timestamp}] WEBHOOK RECEBIDO DO MERCADO PAGO`);
  console.log(`${"=".repeat(60)}`);
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));
  console.log(`${"=".repeat(60)}\n`);

  try {
    const { action, data, type } = req.body;

    // Responde rápido ao MP (obrigatório - SEMPRE 200 OK)
    res.status(200).json({ success: true, received: true });

    // Processa notificação em background
    if (action === "payment.created" || action === "payment.updated") {
      const paymentId = data?.id;

      if (!paymentId) {
        console.log("⚠️ Webhook sem payment ID");
        return;
      }

      console.log(`📨 Processando notificação de pagamento: ${paymentId}`);

      // Busca detalhes do pagamento
      const urlPayment = `https://api.mercadopago.com/v1/payments/${paymentId}`;
      const respPayment = await fetch(urlPayment, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const payment = await respPayment.json();

      console.log(
        `💳 Pagamento ${paymentId} | Status: ${payment.status} | Valor: R$ ${payment.transaction_amount}`,
      );

      // Processa status do pagamento
      if (payment.status === "approved" || payment.status === "authorized") {
        const amountInCents = Math.round(payment.transaction_amount * 100);
        const cacheKey = `amount_${amountInCents}`;

        await cachePayment(cacheKey, {
          paymentId: payment.id,
          amount: payment.transaction_amount,
          status: payment.status,
          timestamp: Date.now(),
        });

        console.log(
          `✅ Pagamento ${paymentId} confirmado via Webhook! Valor: R$ ${payment.transaction_amount}`,
        );

        // DESCONTA DO ESTOQUE usando external_reference (ID do pedido)
        const externalRef = payment.external_reference;
        if (externalRef) {
          console.log(
            `📦 Processando desconto de estoque para pedido: ${externalRef}`,
          );

          try {
            // Busca o pedido no banco
            const order = await db("orders").where({ id: externalRef }).first();

            if (order) {
              const items = parseJSON(order.items);
              console.log(`  🛒 ${items.length} item(ns) no pedido`);

              // Desconta cada produto
              for (const item of items) {
                const product = await db("products")
                  .where({ id: item.id })
                  .first();

                if (product && product.stock !== null) {
                  const newStock = product.stock - item.quantity;

                  await db("products")
                    .where({ id: item.id })
                    .update({ stock: Math.max(0, newStock) });

                  console.log(
                    `  ✅ ${item.name}: ${product.stock} → ${Math.max(
                      0,
                      newStock,
                    )} (${item.quantity} vendido)`,
                  );
                } else if (product) {
                  console.log(`  ℹ️ ${item.name}: estoque ilimitado`);
                }
              }

              // Atualiza o pedido para pago e ativo, salvando forma de pagamento
              await db("orders")
                .where({ id: externalRef })
                .update({
                  paymentStatus: "paid",
                  status: "active",
                  paymentType: "online",
                  paymentMethod: payment.payment_method_id || "unknown",
                });
              // Envia PDF por email para o cliente, se houver email
              if (order.email) {
                try {
                  await sendOrderPdfEmail({ order, email: order.email });
                  console.log(`📧 PDF enviado para ${order.email}`);
                } catch (e) {
                  console.error("Erro ao enviar PDF do pedido:", e);
                }
              }

              console.log(
                `🎉 Estoque atualizado com sucesso e pedido marcado como pago!`,
              );
            } else {
              console.log(`⚠️ Pedido ${externalRef} não encontrado no banco`);
            }
          } catch (err) {
            console.error(`❌ Erro ao descontar estoque: ${err.message}`);
          }
        }
      } else if (
        payment.status === "rejected" ||
        payment.status === "cancelled" ||
        payment.status === "refunded"
      ) {
        console.log(
          `❌ Pagamento ${paymentId} REJEITADO/CANCELADO via Webhook! Status: ${payment.status}`,
        );
        console.log(
          `ℹ️ External reference: ${
            payment.external_reference || "não informado"
          }`,
        );

        // Remove do cache se existir
        const amountInCents = Math.round(payment.transaction_amount * 100);
        const cacheKey = `amount_${amountInCents}`;
        await deleteCachedPayment(cacheKey);
        console.log(`🧹 Cache limpo para ${cacheKey}`);
      } else {
        console.log(
          `⏳ Pagamento ${paymentId} com status: ${payment.status} - aguardando confirmação`,
        );
      }
    }
  } catch (error) {
    console.error("❌ Erro processando webhook:", error.message);
  }
});

// ============================================================================
// ⚠️ DEPRECATED: Endpoints de pagamento antigos (sem Multi-tenancy)
// ============================================================================
// ESTES ENDPOINTS FORAM REFATORADOS PARA:
// - services/paymentService.js (lógica de negócio)
// - controllers/paymentController.js (validação e controle)
// - routes/payment.js (rotas de pagamento)
//
// Agora usa apenas credenciais globais do Mercado Pago (mp_access_token, mp_device_id)
// Os endpoints estão em: /api/payment/*
//
// MANTER COMENTADO PARA REFERÊNCIA - REMOVER APÓS VALIDAÇÃO EM PRODUÇÃO
// ============================================================================

// --- INTEGRAÇÃO MERCADO PAGO POINT (Orders API Unificada) - COM MULTI-TENANCY ---

// CRIAR PAGAMENTO PIX (QR Code na tela)
app.post("/api/payment/create-pix", async (req, res) => {
  const { amount, description, orderId } = req.body;

  // Usa apenas credenciais globais (single-tenant)
  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const MP_DEVICE_ID = process.env.MP_DEVICE_ID;

  if (!MP_ACCESS_TOKEN) {
    console.error("Faltam credenciais do Mercado Pago");
    return res.json({ id: `mock_pix_${Date.now()}`, status: "pending" });
  }

  try {
    console.log(`💚 Criando pagamento PIX (QR Code) de R$ ${amount}...`);
    console.log(`📦 Payload: amount=${amount}, orderId=${orderId}`);

    const paymentPayload = {
      transaction_amount: parseFloat(amount),
      description: description || `Pedido ${orderId}`,
      payment_method_id: "pix",
      external_reference: orderId,
      notification_url:
        "https://backendkioskpro.onrender.com/api/notifications/mercadopago",
      payer: {
        email: "cliente@kiosk.com",
      },
    };

    console.log(
      `📤 Enviando para MP:`,
      JSON.stringify(paymentPayload, null, 2),
    );

    // Gera chave idempotente única para esta transação PIX
    const idempotencyKey = `pix_${orderId}_${Date.now()}`;

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const data = await response.json();

    console.log(
      `📥 Resposta MP (status ${response.status}):`,
      JSON.stringify(data, null, 2),
    );

    if (!response.ok) {
      console.error("❌ Erro ao criar pagamento PIX:", data);
      return res.status(response.status).json({
        error: data.message || "Erro ao criar PIX",
        details: data,
      });
    }

    console.log(`✅ PIX criado! Payment ID: ${data.id}`);
    console.log(
      `📱 QR Code: ${data.point_of_interaction?.transaction_data?.qr_code}`,
    );

    const pixResponse = {
      id: data.id,
      status: data.status || "pending",
      qr_code: data.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64:
        data.point_of_interaction?.transaction_data?.qr_code_base64,
      ticket_url: data.point_of_interaction?.transaction_data?.ticket_url,
      type: "pix",
    };

    console.log(
      `📤 Enviando resposta ao frontend:`,
      JSON.stringify(pixResponse, null, 2),
    );
    res.json(pixResponse);
  } catch (error) {
    console.error("Erro ao criar PIX:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint legado para compatibilidade - redireciona para create-card
app.post("/api/payment/create", async (req, res) => {
  console.log(
    "⚠️ Endpoint legado /api/payment/create chamado - redirecionando para /create-card",
  );
  // Encaminha a requisição para o handler correto
  req.url = "/api/payment/create-card";
  return app._router.handle(req, res);
});

// ==========================================
// --- ROTAS EXCLUSIVAS PIX (QR Code na Tela) ---
// ==========================================

app.post("/api/pix/create", async (req, res) => {
  const { amount, description, email, payerName, orderId } = req.body;

  if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: "Sem token MP" });

  try {
    console.log(`💠 Gerando PIX QR Code de R$ ${amount}...`);

    const idempotencyKey = `pix_${orderId || Date.now()}_${Date.now()}`;

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: parseFloat(amount),
        description: description || "Pedido Kiosk",
        payment_method_id: "pix",
        payer: {
          email: email || "cliente@kiosk.com",
          first_name: payerName || "Cliente",
        },
        external_reference: orderId,
        notification_url:
          "https://backendkioskpro.onrender.com/api/notifications/mercadopago",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Erro ao gerar PIX:", data);
      throw new Error(data.message || "Erro ao gerar PIX");
    }

    const qrCodeBase64 =
      data.point_of_interaction?.transaction_data?.qr_code_base64;
    const qrCodeCopyPaste =
      data.point_of_interaction?.transaction_data?.qr_code;
    const paymentId = data.id;

    console.log(`✅ PIX gerado! Payment ID: ${paymentId}`);

    res.json({
      paymentId,
      qrCodeBase64,
      qrCodeCopyPaste,
      status: "pending",
      type: "pix",
    });
  } catch (error) {
    console.error("❌ Erro ao criar PIX:", error);
    res.status(500).json({ error: error.message || "Falha ao gerar PIX" });
  }
});

app.get("/api/pix/status/:id", async (req, res) => {
  const { id } = req.params;

  if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: "Sem token" });

  try {
    console.log(`💠 Verificando status PIX: ${id}`);

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${id}`,
      {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      },
    );

    const data = await response.json();

    console.log(`💠 Status PIX (${id}): ${data.status}`);

    if (data.status === "approved") {
      return res.json({ status: "approved", paymentId: id });
    }

    res.json({ status: data.status || "pending" });
  } catch (error) {
    console.error("❌ Erro ao verificar PIX:", error);
    res.json({ status: "pending" });
  }
});

// ==========================================

// CRIAR PAGAMENTO NA MAQUININHA (Point Integration API - volta ao original)
app.post("/api/payment/create-card", async (req, res) => {
  const { amount, description, orderId, paymentMethod } = req.body;
  // Usa apenas credenciais globais (single-tenant)
  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const MP_DEVICE_ID = process.env.MP_DEVICE_ID;

  // ✅ DETECÇÃO AUTOMÁTICA: Se for PIX, gera QR Code (Payments API) - NÃO DEVERIA CHEGAR AQUI
  if (paymentMethod === "pix") {
    console.log(
      `🔀 PIX detectado - redirecionando para /api/payment/create-pix`,
    );
    return res.status(400).json({
      error: "Use o endpoint /api/payment/create-pix para pagamentos PIX.",
    });
  }

  // ✅ CARTÕES: Segue para maquininha
  if (!MP_ACCESS_TOKEN || !MP_DEVICE_ID) {
    console.error("Faltam credenciais do Mercado Pago");
    return res.json({ id: `mock_pay_${Date.now()}`, status: "pending" });
  }

  try {
    console.log(`💳 Criando payment intent na Point ${MP_DEVICE_ID}...`);
    console.log(`💰 Método solicitado: ${paymentMethod || "todos"}`);

    // Payload simplificado para Point Integration API
    const payload = {
      amount: Math.round(parseFloat(amount) * 100), // Centavos
      description: description || `Pedido ${orderId}`,
      additional_info: {
        external_reference: orderId,
        print_on_terminal: true,
      },
    };

    // Se método especificado (crédito/débito), adiciona filtro
    if (paymentMethod) {
      const paymentTypeMap = {
        debit: "debit_card",
        credit: "credit_card",
      };

      const type = paymentTypeMap[paymentMethod];

      if (type) {
        payload.payment = {
          type: type,
          installments: paymentMethod === "credit" ? 1 : undefined,
          installments_cost: paymentMethod === "credit" ? "buyer" : undefined,
        };
        console.log(`🎯 Filtro ativo: ${type}`);
      }
    }

    console.log(
      `📤 Payload Point Integration:`,
      JSON.stringify(payload, null, 2),
    );

    const url = `https://api.mercadopago.com/point/integration-api/devices/${MP_DEVICE_ID}/payment-intents`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "❌ Erro ao criar payment intent:",
        JSON.stringify(data, null, 2),
      );
      console.error(`📡 Status HTTP: ${response.status}`);
      throw new Error(data.message || JSON.stringify(data.errors || data));
    }

    console.log(`✅ Payment intent criado! ID: ${data.id}`);
    console.log(`📱 Status: ${data.state}`);

    res.json({
      id: data.id,
      status: "open",
      type: "point",
    });
  } catch (error) {
    console.error("❌ Erro Pagamento Point:", error);
    console.error("❌ Stack trace:", error.stack);
    res
      .status(500)
      .json({ error: error.message || "Falha ao comunicar com maquininha" });
  }
});

// Verificar status PAGAMENTO (híbrido: Order PIX ou Payment Intent Point)
app.get("/api/payment/status/:paymentId", async (req, res) => {
  const { paymentId } = req.params;

  if (paymentId.startsWith("mock_")) return res.json({ status: "approved" });

  try {
    console.log(`🔍 [STATUS] Verificando pagamento: ${paymentId}`);

    // Usa apenas credenciais globais (single-tenant)
    const storeConfig = {
      mp_access_token: MP_ACCESS_TOKEN,
      mp_device_id: MP_DEVICE_ID,
    };

    if (!storeConfig.mp_access_token) {
      return res.status(500).json({ error: "Credenciais MP não configuradas" });
    }

    // 1. Tenta buscar como Payment Intent (Point Integration API)

    const intentUrl = `https://api.mercadopago.com/point/integration-api/payment-intents/${paymentId}`;
    const intentResponse = await fetch(intentUrl, {
      headers: { Authorization: `Bearer ${storeConfig.mp_access_token}` },
    });

    if (intentResponse.ok) {
      // É um Payment Intent (maquininha)
      const intent = await intentResponse.json();
      console.log(`💳 Payment Intent ${paymentId} | State: ${intent.state}`);

      // Verifica se tem payment.id (pagamento aprovado)
      if (intent.payment && intent.payment.id) {
        const realPaymentId = intent.payment.id;
        console.log(`✅ Payment Intent APROVADO! Payment ID: ${realPaymentId}`);

        // Busca detalhes do pagamento real para confirmar status
        try {
          const paymentDetailsUrl = `https://api.mercadopago.com/v1/payments/${realPaymentId}`;
          const paymentDetailsResp = await fetch(paymentDetailsUrl, {
            headers: { Authorization: `Bearer ${storeConfig.mp_access_token}` },
          });

          if (paymentDetailsResp.ok) {
            const paymentDetails = await paymentDetailsResp.json();
            console.log(`💳 Pagamento real status: ${paymentDetails.status}`);

            if (
              paymentDetails.status === "approved" ||
              paymentDetails.status === "authorized"
            ) {
              console.log(`✅ PAGAMENTO CONFIRMADO COMO APROVADO!`);

              // 🧹 Limpa a fila após aprovação
              try {
                console.log(`🧹 Limpando fila após aprovação...`);
                await paymentService.clearPaymentQueue({
                  mp_access_token: MP_ACCESS_TOKEN,
                  mp_device_id: MP_DEVICE_ID,
                });
              } catch (queueError) {
                console.warn(`⚠️ Erro ao limpar fila: ${queueError.message}`);
              }

              return res.json({
                status: "approved",
                paymentId: realPaymentId,
                paymentStatus: paymentDetails.status,
              });
            }

            // Verifica se foi rejeitado/cancelado
            if (
              paymentDetails.status === "rejected" ||
              paymentDetails.status === "cancelled" ||
              paymentDetails.status === "refunded"
            ) {
              console.log(
                `❌ PAGAMENTO REJEITADO/CANCELADO: ${paymentDetails.status}`,
              );

              // 🧹 Limpa a fila após rejeição
              try {
                console.log(`🧹 Limpando fila após rejeição...`);
                await paymentService.clearPaymentQueue({
                  mp_access_token: MP_ACCESS_TOKEN,
                  mp_device_id: MP_DEVICE_ID,
                });
              } catch (queueError) {
                console.warn(`⚠️ Erro ao limpar fila: ${queueError.message}`);
              }

              // Busca external_reference para liberar pedido
              const orderId = intent.additional_info?.external_reference;

              return res.json({
                status: "rejected",
                paymentId: realPaymentId,
                paymentStatus: paymentDetails.status,
                reason: "rejected_by_terminal",
                orderId: orderId || null,
              });
            }

            // Outros status (pending, in_process, etc)
            console.log(`⏳ PAGAMENTO PENDENTE: ${paymentDetails.status}`);
            return res.json({
              status: "pending",
              paymentId: realPaymentId,
              paymentStatus: paymentDetails.status,
            });
          }
        } catch (e) {
          console.log(`⚠️ Erro ao buscar detalhes do pagamento: ${e.message}`);
        }

        // Fallback: se não conseguiu buscar detalhes, retorna pending (não approved!)
        console.log(
          `⚠️ Fallback: não foi possível confirmar status do pagamento ${realPaymentId}`,
        );
        return res.json({ status: "pending", paymentId: realPaymentId });
      }

      // Estados finalizados - NÃO assume approved automaticamente!
      // FINISHED pode ser rejected, cancelled, refunded, etc
      if (intent.state === "FINISHED") {
        console.log(
          `⚠️ Intent FINISHED mas sem payment.id - precisa verificar manualmente`,
        );

        // Tenta buscar pelo external_reference se houver
        if (intent.additional_info?.external_reference) {
          const orderId = intent.additional_info.external_reference;
          console.log(
            `🔍 Tentando buscar pagamento por external_reference: ${orderId}`,
          );

          try {
            const searchUrl = `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}`;
            const searchResp = await fetch(searchUrl, {
              headers: {
                Authorization: `Bearer ${storeConfig.mp_access_token}`,
              },
            });

            if (searchResp.ok) {
              const searchData = await searchResp.json();
              if (searchData.results && searchData.results.length > 0) {
                const payment = searchData.results[0];
                console.log(
                  `💳 Pagamento encontrado via search: ${payment.id} | Status: ${payment.status}`,
                );

                if (
                  payment.status === "approved" ||
                  payment.status === "authorized"
                ) {
                  return res.json({
                    status: "approved",
                    paymentId: payment.id,
                  });
                } else if (
                  payment.status === "rejected" ||
                  payment.status === "cancelled" ||
                  payment.status === "refunded"
                ) {
                  return res.json({
                    status: "rejected",
                    paymentId: payment.id,
                  });
                } else {
                  return res.json({ status: "pending", paymentId: payment.id });
                }
              }
            }
          } catch (searchError) {
            console.log(
              `⚠️ Erro ao buscar por external_reference: ${searchError.message}`,
            );
          }
        }

        // Se não encontrou nada, retorna pending (não approved!)
        console.log(
          `⚠️ Intent FINISHED mas status do pagamento desconhecido - retornando pending`,
        );
        return res.json({ status: "pending", paymentId: paymentId });
      }

      if (intent.state === "CANCELED" || intent.state === "ERROR") {
        const isCanceled = intent.state === "CANCELED";
        const isError = intent.state === "ERROR";

        console.log(
          `❌ Intent ${intent.state}${
            isCanceled
              ? " (cancelado pelo usuário na maquininha)"
              : " (erro no processamento)"
          }`,
        );

        // 🧹 Limpa a fila após cancelamento/erro
        try {
          console.log(`🧹 Limpando fila após ${intent.state}...`);
          await paymentService.clearPaymentQueue({
            mp_access_token: MP_ACCESS_TOKEN,
            mp_device_id: MP_DEVICE_ID,
          });
        } catch (queueError) {
          console.warn(`⚠️ Erro ao limpar fila: ${queueError.message}`);
        }

        // --- LÓGICA DE CANCELAMENTO DO PEDIDO NO BANCO ---
        const orderId = intent.additional_info?.external_reference;
        if (orderId) {
          console.log(`  -> Pedido associado: ${orderId}. Cancelando...`);
          try {
            const order = await db("orders").where({ id: orderId }).first();

            // Apenas cancela se o pedido ainda estiver pendente
            if (order && order.paymentStatus === "pending") {
              // 1. Libera o estoque reservado
              const items = parseJSON(order.items);
              for (const item of items) {
                const product = await db("products")
                  .where({ id: item.id })
                  .first();
                if (
                  product &&
                  product.stock !== null &&
                  product.stock_reserved > 0
                ) {
                  const newReserved = Math.max(
                    0,
                    product.stock_reserved - item.quantity,
                  );
                  await db("products")
                    .where({ id: item.id })
                    .update({ stock_reserved: newReserved });
                  console.log(
                    `    ↩️ Estoque liberado para ${item.name}: ${product.stock_reserved} → ${newReserved}`,
                  );
                }
              }

              // 2. Atualiza o status do pedido para 'canceled'
              await db("orders")
                .where({ id: orderId })
                .update({ paymentStatus: "canceled", status: "canceled" });

              console.log(
                `  ✅ Pedido ${orderId} e estoque atualizados com sucesso!`,
              );
            } else {
              console.log(
                `  ⚠️ Pedido ${orderId} não está mais pendente ou não foi encontrado. Nenhuma ação necessária.`,
              );
            }
          } catch (dbError) {
            console.error(
              `  ❌ Erro ao cancelar o pedido ${orderId} no banco:`,
              dbError.message,
            );
          }
        }
        // --- FIM DA LÓGICA ---

        return res.json({
          status: "canceled",
          reason: isCanceled ? "canceled_by_user" : "payment_error",
          orderId: orderId || null,
          message: isCanceled
            ? "Pagamento cancelado na maquininha pelo usuário"
            : "Erro ao processar pagamento na maquininha",
        });
      }

      // Ainda pendente
      console.log(`⏳ Intent pendente (${intent.state})`);
      return res.json({ status: "pending" });
    }

    // 2. Se não é Payment Intent, tenta como Payment PIX
    console.log(`🔄 Não é Payment Intent, tentando como Payment PIX...`);

    const paymentUrl = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const paymentResponse = await fetch(paymentUrl, {
      headers: { Authorization: `Bearer ${storeConfig.mp_access_token}` },
    });

    if (paymentResponse.ok) {
      const payment = await paymentResponse.json();
      console.log(`💚 Payment ${paymentId} | Status: ${payment.status}`);

      if (payment.status === "approved") {
        console.log(`✅ Payment PIX APROVADO!`);
        return res.json({ status: "approved", paymentId: payment.id });
      } else if (
        payment.status === "cancelled" ||
        payment.status === "rejected"
      ) {
        console.log(`❌ Payment ${payment.status.toUpperCase()}`);
        return res.json({
          status: "canceled",
          reason: "canceled_by_system",
          paymentStatus: payment.status,
          message:
            payment.status === "cancelled"
              ? "Pagamento PIX cancelado"
              : "Pagamento PIX rejeitado",
        });
      }

      console.log(`⏳ Payment ainda pendente (${payment.status})`);
      return res.json({ status: "pending" });
    }

    // 3. Não encontrado em nenhum lugar
    console.log(`⚠️ Pagamento ${paymentId} não encontrado`);
    res.json({ status: "pending" });
  } catch (error) {
    console.error("❌ Erro ao verificar status:", error.message);
    res.json({ status: "pending" });
  }
});

// ENDPOINT LEGADO (para compatibilidade temporária com antigo sistema)
app.get("/api/payment/status-pix/:orderId", async (req, res) => {
  console.log(
    `⚠️ Endpoint legado /status-pix chamado - redirecionando para /status`,
  );
  return res.redirect(307, `/api/payment/status/${req.params.orderId}`);
});

// ==========================================
// --- CANCELAMENTO E LIMPEZA ---
// ==========================================

// Cancelar pagamento específico (Point Intent ou PIX Payment)
app.delete("/api/payment/cancel/:paymentId", async (req, res) => {
  const { paymentId } = req.params;
  // Usa apenas credenciais globais (single-tenant)
  const MP_ACCESS_TOKEN_LOCAL = MP_ACCESS_TOKEN;
  const MP_DEVICE_ID_LOCAL = MP_DEVICE_ID;

  if (!MP_ACCESS_TOKEN_LOCAL) {
    return res.json({ success: true, message: "Mock cancelado" });
  }

  try {
    console.log(`🛑 Tentando cancelar pagamento: ${paymentId}`);

    // 1. Tenta cancelar como um Payment Intent da maquininha (Point)
    if (MP_DEVICE_ID_LOCAL) {
      const urlIntent = `https://api.mercadopago.com/point/integration-api/devices/${MP_DEVICE_ID_LOCAL}/payment-intents/${paymentId}`;

      console.log(`  -> Enviando DELETE para a maquininha: ${urlIntent}`);
      const intentResponse = await fetch(urlIntent, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}` },
      });

      // Se a requisição foi bem-sucedida (200, 204) ou se o recurso não foi encontrado (404, já foi cancelado), consideramos sucesso.
      if (intentResponse.ok || intentResponse.status === 404) {
        console.log(
          `✅ Comando de cancelamento para a maquininha enviado com sucesso para ${paymentId}.`,
        );
        return res.json({
          success: true,
          message: "Pagamento na maquininha cancelado.",
        });
      }
      // Se a API retornar 409, significa que o pagamento está sendo processado e não pode ser cancelado.
      if (intentResponse.status === 409) {
        console.log(
          `⚠️ Não foi possível cancelar ${paymentId} na maquininha: já está sendo processado.`,
        );
        return res.status(409).json({
          success: false,
          message: "Pagamento em processamento, não pode ser cancelado.",
        });
      }
    }

    // 2. Se não for um pagamento de maquininha ou se falhou, tenta cancelar como um pagamento PIX.
    console.log(`  -> Tentando cancelar como Payment PIX...`);
    const urlPayment = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const response = await fetch(urlPayment, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    });

    if (response.ok) {
      console.log(`✅ Payment PIX ${paymentId} cancelado`);
      return res.json({ success: true, message: "PIX cancelado" });
    }

    // Se chegou aqui, não conseguiu cancelar
    console.log(`⚠️ Não foi possível cancelar ${paymentId} como PIX ou Point.`);
    return res.json({
      success: false,
      message: "Não foi possível cancelar - pode já estar finalizado",
    });
  } catch (error) {
    console.error("❌ Erro ao cancelar pagamento:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Limpar TODA a fila da maquininha (útil para logout/sair)
app.post("/api/payment/clear-all", async (req, res) => {
  // Usa apenas credenciais globais (single-tenant)
  const MP_ACCESS_TOKEN_LOCAL = MP_ACCESS_TOKEN;
  const MP_DEVICE_ID_LOCAL = MP_DEVICE_ID;

  if (!MP_ACCESS_TOKEN_LOCAL || !MP_DEVICE_ID_LOCAL) {
    return res.json({ success: true, cleared: 0 });
  }

  try {
    console.log(`🧹 [CLEAR ALL] Limpando TODA a fila da maquininha...`);

    const listUrl = `https://api.mercadopago.com/point/integration-api/devices/${MP_DEVICE_ID_LOCAL}/payment-intents`;
    const listResp = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}` },
    });

    if (!listResp.ok) {
      return res.json({ success: false, error: "Erro ao listar intents" });
    }

    const listData = await listResp.json();
    const events = listData.events || [];

    console.log(`🔍 Encontradas ${events.length} intent(s) na fila`);

    let cleared = 0;

    for (const ev of events) {
      const iId = ev.payment_intent_id || ev.id;

      try {
        const delResp = await fetch(`${listUrl}/${iId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}` },
        });

        if (delResp.ok || delResp.status === 404) {
          console.log(`  ✅ Intent ${iId} removida`);
          cleared++;
        }
      } catch (e) {
        console.log(`  ⚠️ Erro ao remover ${iId}: ${e.message}`);
      }

      // Pequeno delay entre remoções
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log(
      `✅ [CLEAR ALL] ${cleared} intent(s) removida(s) - Maquininha limpa!`,
    );

    res.json({
      success: true,
      cleared: cleared,
      message: `${cleared} pagamento(s) removido(s) da fila`,
    });
  } catch (error) {
    console.error("❌ Erro ao limpar fila:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Configurar Point Smart 2 (modo operacional e vinculação)
// app.post("/api/point/configure", async (req, res) => {
//   // Usa apenas credenciais globais (single-tenant)
//   const MP_ACCESS_TOKEN_LOCAL = MP_ACCESS_TOKEN;
//   const MP_DEVICE_ID_LOCAL = MP_DEVICE_ID;

//   if (!MP_ACCESS_TOKEN_LOCAL || !MP_DEVICE_ID_LOCAL) {
//     return res.json({ success: false, error: "Credenciais não configuradas" });
//   }

//   try {
//     console.log(`⚙️ Configurando Point  2: ${MP_DEVICE_ID_LOCAL}`);

//     // Configuração do dispositivo Point Smart
//     const configUrl = `https://api.mercadopago.com/point/integration-api/devices/${MP_DEVICE_ID_LOCAL}`;

//     const configPayload = {
//       operating_mode: "PDV", // Modo PDV - integração com frente de caixa
//       // Isso mantém a Point vinculada e bloqueia acesso ao menu
//     };

//     const response = await fetch(configUrl, {
//       method: "PATCH",
//       headers: {
//         Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}`,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(configPayload),
//     });

//     if (response.ok) {
//       const data = await response.json();
//       console.log(`✅ Point Smart 2 configurada em modo PDV`);
//       console.log(`🔒 Menu bloqueado - apenas pagamentos via API`);

//       return res.json({
//         success: true,
//         message: "Point configurada com sucesso",
//         mode: "PDV",
//         device: data,
//       });
//     } else {
//       const error = await response.json();
//       console.error(`❌ Erro ao configurar Point:`, error);
//       return res.status(400).json({ success: false, error: error.message });
//     }
//   } catch (error) {
//     console.error("❌ Erro ao configurar Point Smart 2:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// // Verificar status da Point Smart 2
// app.get("/api/point/status", async (req, res) => {
//   // Usa apenas credenciais globais (single-tenant)
//   const MP_ACCESS_TOKEN_LOCAL = MP_ACCESS_TOKEN;
//   const MP_DEVICE_ID_LOCAL = MP_DEVICE_ID;

//   if (!MP_ACCESS_TOKEN_LOCAL || !MP_DEVICE_ID_LOCAL) {
//     console.error("⚠️ Status Point: Credenciais não configuradas");
//     console.error(
//       `MP_ACCESS_TOKEN: ${MP_ACCESS_TOKEN_LOCAL ? "OK" : "AUSENTE"}`,
//     );
//     console.error(`MP_DEVICE_ID: ${MP_DEVICE_ID_LOCAL || "AUSENTE"}`);
//     return res.json({
//       connected: false,
//       error: "Credenciais não configuradas",
//     });
//   }

//   try {
//     console.log(`🔍 Verificando status da Point: ${MP_DEVICE_ID_LOCAL}`);

//     const deviceUrl = `https://api.mercadopago.com/point/integration-api/devices/${MP_DEVICE_ID_LOCAL}`;
//     const response = await fetch(deviceUrl, {
//       headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}` },
//     });

//     console.log(`📡 Resposta API Point: Status ${response.status}`);

//     if (response.ok) {
//       const device = await response.json();
//       console.log(`✅ Point encontrada:`, device);

//       return res.json({
//         connected: true,
//         id: device.id,
//         operating_mode: device.operating_mode,
//         status: device.status,
//         model: device.model || "Point Smart 2",
//       });
//     } else {
//       const errorData = await response.json();
//       console.error(`❌ Erro ao buscar Point:`, errorData);
//       return res.json({
//         connected: false,
//         error: "Point não encontrada",
//         details: errorData,
//       });
//     }
//   } catch (error) {
//     console.error("❌ Exceção ao verificar Point:", error);
//     res.status(500).json({ connected: false, error: error.message });
//   }
// });

// Limpar TODA a fila de pagamentos da maquininha (chamar após pagamento aprovado)
// app.post("/api/payment/clear-queue", async (req, res) => {
//   // Usa apenas credenciais globais (single-tenant)
//   const MP_ACCESS_TOKEN_LOCAL = MP_ACCESS_TOKEN;
//   const MP_DEVICE_ID_LOCAL = MP_DEVICE_ID;

//   if (!MP_ACCESS_TOKEN_LOCAL || !MP_DEVICE_ID_LOCAL) {
//     return res.json({ success: true, cleared: 0 });
//   }

//   try {
//     console.log(`🧹 [CLEAR QUEUE] Limpando TODA a fila da Point Pro 2...`);

//     const listUrl = `https://api.mercadopago.com/point/integration-api/devices/${MP_DEVICE_ID_LOCAL}/payment-intents`;
//     const listResp = await fetch(listUrl, {
//       headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}` },
//     });

//     if (!listResp.ok) {
//       return res.json({ success: false, error: "Erro ao listar intents" });
//     }

//     const listData = await listResp.json();
//     const events = listData.events || [];

//     console.log(`🔍 Encontradas ${events.length} intent(s) na fila`);

//     let cleared = 0;

//     for (const ev of events) {
//       const iId = ev.payment_intent_id || ev.id;
//       const state = ev.state;

//       try {
//         const delResp = await fetch(`${listUrl}/${iId}`, {
//           method: "DELETE",
//           headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN_LOCAL}` },
//         });

//         if (delResp.ok || delResp.status === 404) {
//           console.log(`  ✅ Intent ${iId} (${state}) removida`);
//           cleared++;
//         }
//       } catch (e) {
//         console.log(`  ⚠️ Erro ao remover ${iId}: ${e.message}`);
//       }

//       // Pequeno delay entre remoções
//       await new Promise((r) => setTimeout(r, 200));
//     }

//     console.log(
//       `✅ [CLEAR QUEUE] ${cleared} intent(s) removida(s) - Point Pro 2 completamente limpa!`,
//     );

//     res.json({
//       success: true,
//       cleared: cleared,
//       message: `${cleared} pagamento(s) removido(s) da fila`,
//     });
//   } catch (error) {
//     console.error("❌ Erro ao limpar fila:", error.message);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// ============================================================================
// FIM DA SEÇÃO DEPRECATED
// ============================================================================

// --- Rotas de IA ---

// --- Rota 1: Sugestão de IA ---
app.post("/api/ai/suggestion", async (req, res) => {
  if (!openai) {
    return res.json({ text: "IA indisponível" });
  }

  try {
    // Busca todos os produtos disponíveis
    const products = await db("products").select(
      "id",
      "name",
      "description",
      "price",
      "category",
      "stock",
    );

    const availableProducts = products.filter(
      (p) => p.stock === null || p.stock > 0,
    );

    const productList = availableProducts
      .map(
        (p) =>
          `- ${p.name} (${p.category}) - R$ ${p.price} ${
            p.description ? "- " + p.description : ""
          }`,
      )
      .join("\n");

    const systemPrompt = `Você é um vendedor especializado em pelúcias e brinquedos PrimePlush.
🎯 SUA MISSÃO: Recomendar produtos DO NOSSO CATÁLOGO REAL para o cliente.
📋 PRODUTOS QUE TEMOS DISPONÍVEIS AGORA:
${productList}
... (regras ocultas para brevidade) ...`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: req.body.prompt },
      ],
      max_tokens: 150,
    });

    const aiResponse = completion.choices[0].message.content;
    return res.json({ text: aiResponse });
  } catch (e) {
    console.error("[ERRO AI]:", e);
    return res.json({ text: "Sugestão indisponível no momento." });
  }
});

// --- Rota 2: SuperAdmin (Marca recebíveis) ---
app.post(
  "/api/super-admin/receivables/mark-received-by-ids",
  async (req, res) => {
    console.log(
      "[LOG] POST /api/super-admin/receivables/mark-received-by-ids chamado",
    );

    try {
      const superAdminPassword = req.headers["x-super-admin-password"];

      if (!SUPER_ADMIN_PASSWORD) {
        return res.status(503).json({ error: "Super Admin não configurado." });
      }

      if (superAdminPassword !== SUPER_ADMIN_PASSWORD) {
        return res
          .status(401)
          .json({ error: "Acesso negado. Senha inválida." });
      }

      let { orderIds } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: "orderIds obrigatório (array)" });
      }

      const now = new Date().toISOString();
      const updateResult = await db("orders").whereIn("id", orderIds).update({
        repassadoSuperAdmin: 1,
        dataRepasseSuperAdmin: now,
      });

      // Calcula o valor total a receber desses pedidos
      const orders = await db("orders").whereIn("id", orderIds);
      let totalBrutoReceber = 0;
      for (const order of orders) {
        let items = [];
        try {
          items = Array.isArray(order.items)
            ? order.items
            : JSON.parse(order.items);
        } catch {
          items = [];
        }
        for (const item of items) {
          let precoBruto = 0;
          const prodId = item.productId || item.id;
          if (prodId) {
            const prod = await db("products").where({ id: prodId }).first();
            precoBruto = prod && prod.priceRaw ? parseFloat(prod.priceRaw) : 0;
          } else if (item.precoBruto !== undefined) {
            precoBruto = parseFloat(item.precoBruto);
          }
          const price = Number(item.price) || 0;
          const quantity = Number(item.quantity) || 1;
          const valueToReceive = (price - precoBruto) * quantity;
          totalBrutoReceber += valueToReceive;
        }
      }

      // Insere registro na tabela de recebíveis
      await db("super_admin_receivables").insert({
        amount: totalBrutoReceber,
        order_ids: JSON.stringify(orderIds),
        received_at: now,
      });

      console.log(
        "[DEBUG] Resultado do Update:",
        updateResult,
        "Total Recebido:",
        totalBrutoReceber,
      );

      return res.json({
        success: true,
        message: "Recebíveis marcados como recebidos",
        receivedOrderIds: orderIds,
        dataRepasse: now,
        updateResult,
        totalRecebido: totalBrutoReceber,
      });
    } catch (err) {
      console.error("[LOG] Erro interno:", err);
      return res.status(500).json({
        error: "Erro interno",
        details: err.message,
      });
    }
  },
);

app.post("/api/ai/chat", async (req, res) => {
  if (!openai) {
    console.log(
      "❌ OpenAI não inicializada - OPENAI_API_KEY está configurada?",
    );
    return res.status(503).json({ error: "IA indisponível" });
  }
  try {
    // Busca produtos globais para contexto
    const products = await db("products")
      .select("name", "category", "price")
      .limit(10);

    const productContext = products
      .map((p) => `${p.name} (${p.category})`)
      .join(", ");

    // Contexto fixo para PrimePlush
    const systemPrompt = `Você é um atendente amigável da PrimePlush, uma loja de pelúcias e brinquedos. Ajude os clientes com dúvidas sobre nossos produtos. Alguns dos nossos produtos: ${productContext}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: req.body.message },
      ],
      max_tokens: 150,
    });
    console.log(`✅ Resposta OpenAI recebida para PrimePlush!`);
    res.json({ text: completion.choices[0].message.content });
  } catch (e) {
    console.error("❌ ERRO OpenAI:", e.message);
    console.error("Detalhes:", e.response?.data || e);
    res.json({ text: "Desculpe, estou com problemas de conexão." });
  }
});

// --- OTIMIZAÇÃO DE FILA DE COZINHA COM IA ---

// Cache da otimização de cozinha
let kitchenCache = {
  orders: [],
  reasoning: "",
  aiEnabled: false,
  lastOrderIds: "", // Hash dos IDs para detectar mudanças
  timestamp: 0,
};

app.get("/api/ai/kitchen-priority", async (req, res) => {
  // Single-tenant

  if (!openai) {
    console.log("❌ OpenAI não inicializada - retornando ordem padrão");
    // Se IA indisponível, retorna ordem cronológica normal
    try {
      const orders = await db("orders")
        .where({ status: "active" })
        .orderBy("timestamp", "asc")
        .select("*");

      return res.json({
        orders: orders.map((o) => ({ ...o, items: parseJSON(o.items) })),
        aiEnabled: false,
        message: "IA indisponível - ordem cronológica",
      });
    } catch (e) {
      return res.status(500).json({ error: "Erro ao buscar pedidos" });
    }
  }

  try {
    // 1. Busca pedidos ativos (não finalizados) - ORDENADOS DO MAIS ANTIGO PARA O MAIS RECENTE
    // Single-tenant: busca todos os pedidos ativos
    const orders = await db("orders")
      .where({ status: "active" })
      .orderBy("timestamp", "asc")
      .select("*");

    if (orders.length === 0) {
      kitchenCache = {
        orders: [],
        reasoning: "",
        aiEnabled: true,
        lastOrderIds: "",
        timestamp: Date.now(),
      };
      return res.json({
        orders: [],
        aiEnabled: true,
        message: "Nenhum pedido pendente",
      });
    }

    // 2. Verifica se houve mudanças (novo pedido ou pedido concluído)
    const currentOrderIds = orders
      .map((o) => o.id)
      .sort()
      .join(",");

    if (kitchenCache.lastOrderIds === currentOrderIds) {
      console.log(
        "♻️ Cache válido - retornando otimização anterior (sem chamar IA)",
      );
      return res.json({
        orders: kitchenCache.orders,
        aiEnabled: kitchenCache.aiEnabled,
        reasoning: kitchenCache.reasoning,
        cached: true,
        cacheAge:
          Math.round((Date.now() - kitchenCache.timestamp) / 1000) + "s",
      });
    }

    console.log("🍳 Mudança detectada - recalculando com IA...");
    console.log(`📋 ${orders.length} pedido(s) na fila`);

    // 2. Busca informações dos produtos para calcular complexidade
    const products = await db("products").select("*");
    const productMap = {};
    products.forEach((p) => {
      productMap[p.id] = p;
    });

    // 3. Prepara dados dos pedidos para IA analisar
    const orderDetails = orders.map((order) => {
      const items = parseJSON(order.items);
      const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

      // Calcula "peso" do pedido (quantidade x complexidade estimada)
      const categories = items.map(
        (item) => productMap[item.id]?.category || "outro",
      );
      const hasHotFood = categories.some((c) =>
        ["Pastel", "Hambúrguer", "Pizza"].includes(c),
      );
      const hasColdFood = categories.some((c) =>
        ["Bebida", "Suco", "Sobremesa"].includes(c),
      );

      return {
        id: order.id,
        timestamp: order.timestamp,
        customerName: order.userName,
        itemCount: itemCount,
        items: items.map((i) => i.name).join(", "),
        hasHotFood: hasHotFood,
        hasColdFood: hasColdFood,
        observation: order.observation, // Adiciona a observação aqui
        minutesWaiting: Math.round(
          (Date.now() - new Date(order.timestamp).getTime()) / 60000,
        ),
      };
    });

    // 4. Monta prompt para IA otimizar ordem
    const ordersText = orderDetails
      .map(
        (o, idx) =>
          `${idx + 1}. Pedido ${o.id} (${o.customerName})
   - Aguardando: ${o.minutesWaiting} min
   - Itens: ${o.itemCount} (${o.items})
   - Tipo: ${o.hasHotFood ? "🔥 Quente" : ""} ${o.hasColdFood ? "❄️ Frio" : ""}
   ${o.observation ? `- OBS: ${o.observation}` : ""}`,
      )
      .join("\n\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um assistente de cozinha especializado em otimizar a ordem de preparo de pedidos.

⚠️ REGRA FUNDAMENTAL (INEGOCIÁVEL):
Pedido mais antigo (maior tempo de espera) DEVE aparecer PRIMEIRO na fila. SEMPRE!

REGRAS DE PRIORIZAÇÃO (EM ORDEM DE IMPORTÂNCIA):
1. ⏰ TEMPO DE ESPERA É PRIORIDADE MÁXIMA: Pedidos mais antigos (aguardando há mais tempo) DEVEM vir PRIMEIRO na fila
2. 🚨 Pedidos com >10 minutos de espera são CRÍTICOS e NÃO podem ser ultrapassados por nenhum outro
3. 🎯 Pedidos com >5 minutos esperando SÃO PRIORITÁRIOS e devem estar no topo da fila
4. ⚖️ JUSTIÇA: Ordem cronológica (FIFO - First In, First Out) tem prioridade ALTA sobre eficiência
5. ⚡ EXCEÇÃO LIMITADA: Apenas pedidos MUITO rápidos (1 única bebida/suco) podem ser adiantados em 1-2 posições
6. 🔥 Agrupe pedidos similares APENAS se tiverem tempo de espera semelhante (diferença <3 min)

LÓGICA DE ORDENAÇÃO RIGOROSA:
- Ordene SEMPRE do mais antigo (mais minutos esperando) para o mais recente
- O pedido #1 da lista (mais antigo) NUNCA pode sair da posição 1, exceto por bebida única
- Um pedido pode avançar APENAS 1-2 posições, NUNCA vai para o fim da fila
- Só faça micro-ajustes se ganhar eficiência SEM prejudicar quem está esperando há mais tempo
- Um pedido de 15 minutos NUNCA deve ficar atrás de um de 5 minutos
- Um pedido de 8 minutos NUNCA deve ficar atrás de um de 2 minutos
- Respeite a ordem de chegada (FIFO) como BASE ABSOLUTA

LIMITE DE REORDENAÇÃO:
- Pedido pode subir no máximo 2 posições (ex: #5 pode ir para #3, mas não para #1)
- Pedido NUNCA pode descer mais de 2 posições (ex: #2 pode ir para #4, mas não para #7)
- Se não houver ganho claro de eficiência, MANTENHA a ordem original

RESPONDA NO FORMATO JSON:
{
  "priorityOrder": ["order_123", "order_456", ...],
  "reasoning": "Explicação breve da estratégia"
}

Retorne APENAS o JSON, sem texto adicional.`,
        },
        {
          role: "user",
          content: `Otimize a ordem de preparo destes pedidos (ORDENADOS DO MAIS ANTIGO PARA O MAIS RECENTE):\n\n${ordersText}\n\nLEMBRETE: Priorize SEMPRE os pedidos com mais tempo de espera! O primeiro da lista está esperando há mais tempo.`,
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    const aiResponse = completion.choices[0].message.content.trim();
    console.log("🤖 Resposta IA:", aiResponse);

    // 5. Parse da resposta JSON da IA
    let aiSuggestion;
    try {
      // Remove markdown code blocks se existir
      const cleanJson = aiResponse
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "");
      aiSuggestion = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("❌ Erro ao parsear resposta da IA:", parseError);
      // Fallback: ordem cronológica
      return res.json({
        orders: orders.map((o) => ({ ...o, items: parseJSON(o.items) })),
        aiEnabled: true,
        message: "IA falhou - usando ordem cronológica",
        reasoning: "Erro ao processar sugestão da IA",
      });
    }

    // 6. Reorganiza pedidos conforme IA sugeriu
    const orderMap = {};
    orders.forEach((o) => {
      orderMap[o.id] = o;
    });

    const optimizedOrders = aiSuggestion.priorityOrder
      .map((orderId) => orderMap[orderId])
      .filter((o) => o !== undefined) // Remove IDs inválidos
      .map((o) => ({ ...o, items: parseJSON(o.items) }));

    // 7. VALIDAÇÃO: Garante que pedidos antigos não foram muito atrasados pela IA
    const originalOldest = orders[0]; // Pedido mais antigo (deveria ser o primeiro)
    const optimizedOldestIndex = optimizedOrders.findIndex(
      (o) => o.id === originalOldest?.id,
    );

    // Se o pedido mais antigo foi movido para posição >2, REVERTE para ordem cronológica
    if (optimizedOldestIndex > 2) {
      console.log(
        `⚠️ IA moveu pedido mais antigo (${originalOldest.id}) para posição ${
          optimizedOldestIndex + 1
        } - REVERTENDO para ordem cronológica`,
      );
      return res.json({
        orders: orders.map((o) => ({ ...o, items: parseJSON(o.items) })),
        aiEnabled: false,
        message: "IA tentou atrasar pedido antigo - usando ordem cronológica",
        reasoning: "Segurança: Pedido mais antigo não pode ser muito atrasado",
      });
    }

    console.log(
      `✅ Ordem otimizada pela IA: ${optimizedOrders
        .map((o) => o.id)
        .join(", ")}`,
    );
    console.log(
      `✅ Validação: Pedido mais antigo (${
        originalOldest?.id
      }) está na posição ${optimizedOldestIndex + 1}`,
    );

    // Salva no cache
    kitchenCache = {
      orders: optimizedOrders,
      reasoning: aiSuggestion.reasoning || "Ordem otimizada pela IA",
      aiEnabled: true,
      lastOrderIds: currentOrderIds,
      timestamp: Date.now(),
    };

    res.json({
      orders: optimizedOrders,
      aiEnabled: true,
      reasoning: aiSuggestion.reasoning || "Ordem otimizada pela IA",
      originalOrder: orders.map((o) => o.id),
      optimizedOrder: optimizedOrders.map((o) => o.id),
      cached: false,
    });
  } catch (e) {
    console.error("❌ ERRO na otimização de cozinha:", e.message);

    // Fallback: retorna ordem cronológica
    try {
      const orders = await db("orders")
        .where({ status: "active" })
        .orderBy("timestamp", "asc")
        .select("*");

      res.json({
        orders: orders.map((o) => ({ ...o, items: parseJSON(o.items) })),
        aiEnabled: false,
        message: "Erro na IA - usando ordem cronológica",
        error: e.message,
      });
    } catch (dbError) {
      res.status(500).json({ error: "Erro ao buscar pedidos" });
    }
  }
});

// --- ANÁLISE INTELIGENTE DE ESTOQUE E VENDAS (Admin) ---

app.get("/api/ai/inventory-analysis", async (req, res) => {
  console.log(`📊 [INVENTORY-ANALYSIS] (single-tenant)`);

  if (!openai) {
    return res.status(503).json({ error: "IA indisponível no momento" });
  }

  try {
    console.log(
      `🤖 Iniciando análise inteligente de estoque (single-tenant)...`,
    );

    // 1. Buscar todos os produtos
    const products = await db("products").select("*").orderBy("category");

    // 2. Buscar histórico completo de pedidos pagos
    const orders = await db("orders")
      .whereIn("paymentStatus", ["paid", "approved"])
      .select("*")
      .orderBy("timestamp", "desc");

    // Calcular período de análise
    const oldestOrder =
      orders.length > 0
        ? new Date(orders[orders.length - 1].timestamp)
        : new Date();
    const newestOrder =
      orders.length > 0 ? new Date(orders[0].timestamp) : new Date();
    const daysDiff = Math.ceil(
      (newestOrder - oldestOrder) / (1000 * 60 * 60 * 24),
    );
    const analysisperiod =
      daysDiff > 0
        ? `${daysDiff} dias (desde ${oldestOrder.toLocaleDateString("pt-BR")})`
        : "período completo";

    // 3. Calcular estatísticas de vendas por produto
    const salesStats = {};
    products.forEach((p) => {
      salesStats[p.id] = {
        name: p.name,
        category: p.category,
        price: parseFloat(p.price),
        stock: p.stock,
        totalSold: 0,
        revenue: 0,
        orderCount: 0,
      };
    });

    // Contar vendas
    orders.forEach((order) => {
      const items = parseJSON(order.items);
      items.forEach((item) => {
        if (salesStats[item.id]) {
          salesStats[item.id].totalSold += item.quantity || 1;
          salesStats[item.id].revenue +=
            (item.price || 0) * (item.quantity || 1);
          salesStats[item.id].orderCount += 1;
        }
      });
    });

    // 4. Preparar dados para análise da IA
    const totalRevenue = Object.values(salesStats).reduce(
      (sum, p) => sum + p.revenue,
      0,
    );
    const averageOrderValue =
      orders.length > 0 ? totalRevenue / orders.length : 0;

    const analysisData = {
      totalProducts: products.length,
      totalOrders: orders.length,
      totalRevenue: totalRevenue.toFixed(2),
      averageOrderValue: averageOrderValue.toFixed(2),
      period: analysisperiod,
      products: Object.values(salesStats).map((p) => ({
        name: p.name,
        category: p.category,
        price: p.price,
        stock: p.stock === null ? "ilimitado" : p.stock,
        totalSold: p.totalSold,
        revenue: p.revenue.toFixed(2),
        averagePerOrder:
          p.orderCount > 0 ? (p.totalSold / p.orderCount).toFixed(1) : 0,
      })),
    };

    // Prompt estruturado para a IA
    const prompt = `Você é um consultor de negócios especializado em food service. Analise os dados HISTÓRICOS COMPLETOS de vendas:

📊 RESUMO FINANCEIRO:
- Período analisado: ${analysisData.period}
- Total de produtos no catálogo: ${analysisData.totalProducts}
- Total de pedidos PAGOS: ${analysisData.totalOrders}
- Receita total: R$ ${analysisData.totalRevenue}
- Ticket médio: R$ ${analysisData.averageOrderValue}

📦 DESEMPENHO POR PRODUTO:
${analysisData.products
  .sort((a, b) => parseFloat(b.revenue) - parseFloat(a.revenue))
  .map(
    (p) =>
      `• ${p.name} (${p.category}):
    - Preço: R$ ${p.price}
    - Estoque atual: ${p.stock}
    - Total vendido: ${p.totalSold} unidades
    - Receita gerada: R$ ${p.revenue}
    - Média por pedido: ${p.averagePerOrder}`,
  )
  .join("\n")}

Por favor, forneça uma análise completa e acionável sobre:

1. 🏆 TOP 3 PRODUTOS: Quais são os campeões de venda e por que são importantes para o negócio?

2. 📈 CRESCIMENTO: Quais produtos/categorias têm potencial de crescer ainda mais?

3. 📉 PRODUTOS LENTOS: Quais vendem pouco e devem ser descontinuados ou reformulados?

4. 🚨 GESTÃO DE ESTOQUE: Quais produtos precisam de atenção no estoque (reposição ou ajuste)?

5. 💡 NOVOS PRODUTOS: Baseado no histórico, que novos produtos você recomendaria adicionar ao cardápio?

6. 💰 OTIMIZAÇÃO DE RECEITA: Sugestões práticas para aumentar o faturamento (preços, combos, promoções)?

Seja específico, use dados concretos e foque em AÇÕES PRÁTICAS que o admin pode implementar HOJE.

5. 💰 OPORTUNIDADES DE RECEITA: Ajustes de preço ou combos que podem aumentar o faturamento?

Seja direto, prático e use emojis. Priorize ações que o administrador pode tomar HOJE.`;

    // 6. Chamar OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você é um consultor de negócios especializado em análise de vendas e gestão de estoque para restaurantes e food service. Seja prático, direto e focado em ações.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 1500,
      temperature: 0.7,
    });

    const analysis = completion.choices[0].message.content;

    // 7. Retornar análise + dados brutos
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      period: analysisData.period,
      summary: {
        totalProducts: analysisData.totalProducts,
        totalOrders: analysisData.totalOrders,
        totalRevenue: analysisData.totalRevenue,
        averageOrderValue: analysisData.averageOrderValue,
        lowStock: products.filter((p) => p.stock !== null && p.stock <= 5)
          .length,
        outOfStock: products.filter((p) => p.stock === 0).length,
      },
      analysis: analysis,
      rawData: salesStats, // Para o frontend criar gráficos se quiser
    });
  } catch (error) {
    console.error("❌ Erro na análise de estoque:", error);
    res.status(500).json({
      error: "Erro ao processar análise",
      message: error.message,
    });
  }
});

// ========== SUPER ADMIN DASHBOARD (MULTI-TENANCY) ==========
// Endpoint protegido que ignora filtro de loja e retorna visão global
app.get("/api/super-admin/dashboard", async (req, res) => {
  try {
    // Verifica autenticação de Super Admin via header
    const superAdminPassword = req.headers["x-super-admin-password"];
    if (!SUPER_ADMIN_PASSWORD) {
      return res.status(503).json({
        error:
          "Super Admin não configurado. Defina SUPER_ADMIN_PASSWORD no servidor.",
      });
    }
    if (superAdminPassword !== SUPER_ADMIN_PASSWORD) {
      return res.status(401).json({
        error: "Acesso negado. Senha de Super Admin inválida.",
      });
    }
    console.log("🔐 Super Admin acessando dashboard global...");
    // Single-tenant: estatísticas globais
    const orderCount = await db("orders").count("id as count").first();
    const revenue = await db("orders")
      .whereIn("paymentStatus", ["paid", "authorized"])
      .sum("total as total")
      .first();
    const productCount = await db("products").count("id as count").first();
    const activeOrders = await db("orders")
      .where({ status: "active" })
      .count("id as count")
      .first();
    const globalStats = {
      total_orders: Number(orderCount.count) || 0,
      total_revenue: parseFloat(revenue.total) || 0,
      total_products: Number(productCount.count) || 0,
      total_active_orders: Number(activeOrders.count) || 0,
    };
    console.log(`✅ Dashboard gerado: single-tenant`);
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      global_stats: globalStats,
    });
  } catch (error) {
    console.error("❌ Erro no Super Admin Dashboard:", error);
    res.status(500).json({
      error: "Erro ao gerar dashboard",
      message: error.message,
    });
  }
});

// 📊 Top 5 Produtos Mais Vendidos de uma Loja
app.get("/api/super-admin/top-products", async (req, res) => {
  try {
    // Verifica autenticação de Super Admin
    const superAdminPassword = req.headers["x-super-admin-password"];

    if (!SUPER_ADMIN_PASSWORD) {
      return res.status(503).json({
        error: "Super Admin não configurado.",
      });
    }

    if (superAdminPassword !== SUPER_ADMIN_PASSWORD) {
      return res.status(401).json({
        error: "Acesso negado. Senha de Super Admin inválida.",
      });
    }

    // Single-tenant
    console.log(`📊 [TOP-PRODUCTS] Buscando top produtos (single-tenant)`);

    // Busca todos os pedidos pagos (single-tenant)
    const orders = await db("orders")
      .whereIn("paymentStatus", ["paid", "authorized"])
      .select("items");

    // Agrupa vendas por produto
    const productSales = {};

    orders.forEach((order) => {
      const items = parseJSON(order.items);
      items.forEach((item) => {
        if (!productSales[item.id]) {
          productSales[item.id] = {
            name: item.name,
            sold: 0,
            revenue: 0,
          };
        }
        productSales[item.id].sold += item.quantity || 1;
        productSales[item.id].revenue +=
          (item.price || 0) * (item.quantity || 1);
        productSales[item.id].orderCount += 1;
      });
    });

    // Converte para array e ordena por quantidade vendida
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 5)
      .map((p) => ({
        name: p.name,
        sold: p.sold,
        revenue: parseFloat(p.revenue.toFixed(2)),
      }));

    console.log(`✅ [TOP-PRODUCTS] ${topProducts.length} produtos retornados`);

    res.json(topProducts);
  } catch (error) {
    console.error("❌ Erro ao buscar top products:", error);
    res.status(500).json({
      error: "Erro ao buscar produtos mais vendidos",
      message: error.message,
    });
  }
});

// 📈 Histórico de Vendas (Últimos N Dias)
app.get("/api/super-admin/sales-history", async (req, res) => {
  try {
    // Verifica autenticação de Super Admin
    const superAdminPassword = req.headers["x-super-admin-password"];

    if (!SUPER_ADMIN_PASSWORD) {
      return res.status(503).json({
        error: "Super Admin não configurado.",
      });
    }

    if (superAdminPassword !== SUPER_ADMIN_PASSWORD) {
      return res.status(401).json({
        error: "Acesso negado. Senha de Super Admin inválida.",
      });
    }

    // Single-tenant
    const days = parseInt(req.query.days) || 7;

    console.log(
      `📈 [SALES-HISTORY] Buscando últimos ${days} dias (single-tenant)`,
    );

    // Calcula data inicial
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Busca pedidos pagos do período (single-tenant)
    const orders = await db("orders")
      .whereIn("paymentStatus", ["paid", "authorized"])
      .where("timestamp", ">=", startDate.toISOString())
      .select("timestamp", "total");

    // Agrupa por dia
    const salesByDay = {};

    orders.forEach((order) => {
      const date = new Date(order.timestamp);
      const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

      if (!salesByDay[dateStr]) {
        salesByDay[dateStr] = 0;
      }
      salesByDay[dateStr] += parseFloat(order.total) || 0;
    });

    // Converte para array e adiciona nome do dia da semana
    const dayNames = [
      "Domingo",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ];

    const salesHistory = Object.entries(salesByDay)
      .map(([date, value]) => {
        const dateObj = new Date(date + "T12:00:00"); // Meio-dia para evitar problemas de timezone
        return {
          day: dayNames[dateObj.getDay()],
          date: date,
          value: parseFloat(value.toFixed(2)),
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log(`✅ [SALES-HISTORY] ${salesHistory.length} dias com vendas`);

    res.json(salesHistory);
  } catch (error) {
    console.error("❌ Erro ao buscar sales history:", error);
    res.status(500).json({
      error: "Erro ao buscar histórico de vendas",
      message: error.message,
    });
  }
});

// Endpoint para buscar todos os pedidos
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await db("orders").orderBy("timestamp", "desc");
    const parsedOrders = orders.map((o) => ({
      ...o,
      items: typeof o.items === "string" ? JSON.parse(o.items) : o.items,
      total: parseFloat(o.total),
    }));
    res.json(parsedOrders);
  } catch (e) {
    res.status(500).json({ error: "Erro ao buscar pedidos" });
  }
});

// // 🔧 ENDPOINT TEMPORÁRIO: Atualizar credenciais do sushiman1
// app.get("/api/admin/update-sushiman1-credentials", async (req, res) => {
//   try {
//     console.log("🔧 Atualizando credenciais da loja sushiman1...");

//     const newAccessToken =
//       "APP_USR-2380991543282785-120915-186724196695d70b571258710e1f9645-272635919";
//     const newDeviceId = "GERTEC_MP35P__8701012151238699";

//     // Loja única: não atualiza mais tabela stores
//     // Se necessário, atualize as variáveis de ambiente manualmente na Render
//     res.json({
//       success: true,
//       message:
//         "Loja única: atualize as credenciais nas variáveis de ambiente da Render.",
//       mp_access_token: newAccessToken,
//       mp_device_id: newDeviceId,
//     });

//     // Verifica se foi atualizado
//     // Loja única: não busca mais na tabela stores

//     console.log("✅ Credenciais do sushiman1 atualizadas com sucesso!");
//     console.log(
//       `   Access Token: ${updatedStore.mp_access_token.substring(0, 20)}...`,
//     );
//     console.log(`   Device ID: ${updatedStore.mp_device_id}`);

//     res.json({
//       success: true,
//       message: "Credenciais do sushiman1 atualizadas com sucesso!",
//       store: {
//         id: updatedStore.id,
//         name: updatedStore.name,
//         mp_device_id: updatedStore.mp_device_id,
//         mp_access_token: updatedStore.mp_access_token.substring(0, 20) + "...",
//       },
//     });
//   } catch (error) {
//     console.error("❌ Erro ao atualizar credenciais:", error);
//     res.status(500).json({
//       success: false,
//       error: "Erro ao atualizar credenciais",
//       message: error.message,
//     });
//   }
// });

// ==========================================
// PAGAMENTO ONLINE COM SDK MERCADO PAGO
// ==========================================

// Criar preferência de pagamento (Checkout Pro - redireciona para página do MP)
app.post("/api/payment-online/create-preference", async (req, res) => {
  try {
    if (!preferenceClient) {
      return res.status(503).json({
        error: "SDK MercadoPago não configurado",
      });
    }

    const { items, orderId, payerEmail, payerName } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Items são obrigatórios" });
    }

    // Calcula o total
    const total = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    console.log(
      `💳 [ONLINE] Criando preferência de pagamento: R$ ${total.toFixed(2)}`,
    );

    const preference = await preferenceClient.create({
      body: {
        items: items.map((item) => ({
          title: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          currency_id: "BRL",
        })),
        payer: {
          email: payerEmail || "cliente@primeplush.com",
          name: payerName || "Cliente",
        },
        external_reference: orderId,
        back_urls: {
          success: `${process.env.FRONTEND_URL || "https://primeplush.com.br"}/payment-success`,
          failure: `${process.env.FRONTEND_URL || "https://primeplush.com.br"}/payment-failure`,
          pending: `${process.env.FRONTEND_URL || "https://primeplush.com.br"}/payment-pending`,
        },
        auto_return: "approved",
        notification_url: `${process.env.BACKEND_URL || "https://backendprimeplush.onrender.com"}/api/webhooks/mercadopago`,
      },
    });

    console.log(`✅ Preferência criada: ${preference.id}`);

    res.json({
      preferenceId: preference.id,
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
    });
  } catch (error) {
    console.error("❌ Erro ao criar preferência:", error);
    res.status(500).json({
      error: "Erro ao criar preferência de pagamento",
      message: error.message,
    });
  }
});

// Criar pagamento PIX direto (retorna QR Code)
app.post("/api/payment-online/create-pix-direct", async (req, res) => {
  try {
    if (!paymentClient) {
      return res.status(503).json({
        error: "SDK MercadoPago não configurado",
      });
    }

    const { amount, description, orderId, payerEmail } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valor inválido" });
    }

    console.log(`💚 [PIX ONLINE] Gerando QR Code: R$ ${amount.toFixed(2)}`);

    const payment = await paymentClient.create({
      body: {
        transaction_amount: parseFloat(amount),
        description: description || `Pedido ${orderId}`,
        payment_method_id: "pix",
        payer: {
          email: payerEmail || "cliente@primeplush.com",
        },
        external_reference: orderId,
        notification_url: `${process.env.BACKEND_URL || "https://backendprimeplush.onrender.com"}/api/webhooks/mercadopago`,
      },
    });

    console.log(`✅ PIX criado: ${payment.id}`);

    res.json({
      paymentId: payment.id,
      status: payment.status,
      qrCode: payment.point_of_interaction?.transaction_data?.qr_code,
      qrCodeBase64:
        payment.point_of_interaction?.transaction_data?.qr_code_base64,
      ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url,
    });
  } catch (error) {
    console.error("❌ Erro ao criar PIX:", error);
    res.status(500).json({
      error: "Erro ao criar pagamento PIX",
      message: error.message,
    });
  }
});

// Criar pagamento com cartão de crédito (necessita token do cartão do frontend)
app.post("/api/payment-online/create-card-payment", async (req, res) => {
  try {
    if (!paymentClient) {
      return res.status(503).json({
        error: "SDK MercadoPago não configurado",
      });
    }

    const {
      token,
      amount,
      description,
      orderId,
      installments,
      payerEmail,
      issuerId,
      paymentMethodId,
    } = req.body;

    if (!token || !amount) {
      return res.status(400).json({ error: "Token e valor são obrigatórios" });
    }

    console.log(
      `💳 [CARD ONLINE] Processando pagamento: R$ ${amount.toFixed(2)}`,
    );

    const payment = await paymentClient.create({
      body: {
        transaction_amount: parseFloat(amount),
        token: token,
        description: description || `Pedido ${orderId}`,
        installments: parseInt(installments) || 1,
        payment_method_id: paymentMethodId || "visa",
        issuer_id: issuerId,
        payer: {
          email: payerEmail || "cliente@primeplush.com",
        },
        external_reference: orderId,
        notification_url: `${process.env.BACKEND_URL || "https://backendprimeplush.onrender.com"}/api/webhooks/mercadopago`,
      },
    });

    console.log(`✅ Pagamento cartão criado: ${payment.id}`);
    console.log(`   Status: ${payment.status}`);
    console.log(`   Status Detail: ${payment.status_detail}`);

    res.json({
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.status_detail,
      approved: payment.status === "approved",
    });
  } catch (error) {
    console.error("❌ Erro ao processar pagamento:", error);
    res.status(500).json({
      error: "Erro ao processar pagamento com cartão",
      message: error.message,
    });
  }
});

// Verificar status de pagamento (qualquer tipo)
app.get("/api/payment-online/status/:paymentId", async (req, res) => {
  try {
    if (!paymentClient) {
      return res.status(503).json({
        error: "SDK MercadoPago não configurado",
      });
    }

    const { paymentId } = req.params;

    console.log(`🔍 [STATUS ONLINE] Verificando: ${paymentId}`);

    const payment = await paymentClient.get({ id: paymentId });

    console.log(`   Status: ${payment.status}`);

    res.json({
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.status_detail,
      approved: payment.status === "approved",
      externalReference: payment.external_reference,
    });
  } catch (error) {
    console.error("❌ Erro ao verificar status:", error);
    res.status(500).json({
      error: "Erro ao verificar status do pagamento",
      message: error.message,
    });
  }
});

// ==========================================

app.put("/api/users/:id", async (req, res) => {
  const { id } = req.params;
  const { name, email, cpf, cep, address, phone, password } = req.body;
  if (!name || !email || !cpf || !cep || !address || !phone || !password) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios" });
  }
  try {
    // Verifica se o usuário existe
    const user = await db("users").where({ id }).first();
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    // Atualiza os dados do usuário
    await db("users")
      .where({ id })
      .update({
        name: name.trim(),
        email: email.trim(),
        cpf: String(cpf).replace(/\D/g, ""),
        cep: cep.trim(),
        address: address.trim(),
        phone: phone.trim(),
        password: password,
      });
    // Retorna o usuário atualizado
    const updatedUser = await db("users").where({ id }).first();
    res.json({
      success: true,
      user: {
        ...updatedUser,
        historico: parseJSON(updatedUser.historico),
      },
    });
  } catch (e) {
    console.error("Erro ao atualizar usuário:", e);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

// Dummy endpoint para Point Smart 2 (apenas evita erro 404)
app.post("/api/point/configure", (req, res) => {
  res.json({
    success: true,
    message: "Configuração de Point ignorada (dummy endpoint)",
  });
});

// --- Inicialização ---
console.log("🚀 Iniciando servidor...");
Promise.all([initDatabase(), initRedis()])
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
      console.log(
        `🔐 JWT: ${JWT_SECRET ? "Configurado" : "⚠️ NÃO CONFIGURADO"}`,
      );
      console.log(`💾 Cache: ${useRedis ? "Redis" : "Map em memória"}`);
    });
  })
  .catch((err) => {
    console.error("❌ ERRO FATAL ao iniciar servidor:", err);
    process.exit(1);
  });
