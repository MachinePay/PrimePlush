import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

export async function sendOrderPdfEmail({ order, email }) {
  // 1. Gerar PDF em memória
  const doc = new PDFDocument({ margin: 40 });
  let buffers = [];
  doc.on("data", buffers.push.bind(buffers));
  doc.on("end", async () => {
    const pdfData = Buffer.concat(buffers);
    // 2. Enviar email com PDF em anexo
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `Comprovante do Pedido #${order.id}`,
      text: `Segue em anexo o comprovante do seu pedido.`,
      attachments: [
        {
          filename: `pedido-${order.id}.pdf`,
          content: pdfData,
        },
      ],
    });
  });

  // --- PDF DESIGN ---
  // Logo removida (imagem não encontrada). Pode adicionar PNG em backend/public e restaurar esta linha se desejar.

  // Cabeçalho
  doc
    .fontSize(20)
    .fillColor('#1d4ed8')
    .text('Gira Kids', { align: 'center', continued: false })
    .moveDown(0.2);
  doc
    .fontSize(14)
    .fillColor('black')
    .text('ORÇAMENTO / COMPROVANTE DE PEDIDO', { align: 'center' })
    .moveDown(1);

  // Dados do pedido e cliente
  doc
    .fontSize(10)
    .fillColor('black')
    .text(`Número: GK-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${order.id}`, { align: 'right' })
    .text(`Data: ${new Date(order.timestamp).toLocaleDateString()}`, { align: 'right' })
    .moveDown(0.5);

  // Blocos de dados
  const startY = doc.y;
  doc
    .rect(doc.x, startY, 250, 60).stroke()
    .font('Helvetica-Bold').text('DADOS DO CLIENTE', doc.x + 5, startY + 3)
    .font('Helvetica').fontSize(9)
    .text(`${order.userName || '-'}`, { continued: false })
    .text(`Telefone: ${order.phone || '-'}`)
    .text(`E-mail: ${email}`)
    .text(`Endereço: ${order.address || '-'}`)
    .text(`Cidade: ${order.city || '-'}`)
    .text(`CEP: ${order.cep || '-'}`);

  doc
    .rect(doc.x + 270, startY, 120, 25).stroke()
    .font('Helvetica-Bold').fontSize(9)
    .text('FORMA DE PAGAMENTO', doc.x + 275, startY + 3)
    .font('Helvetica').fontSize(9)
    .text(`${order.paymentType || '-'}`, doc.x + 275, startY + 15);

  doc
    .rect(doc.x + 270, startY + 35, 120, 25).stroke()
    .font('Helvetica-Bold').fontSize(9)
    .text('PESO ESTIMADO', doc.x + 275, startY + 38)
    .font('Helvetica').fontSize(9)
    .text(`${order.weight || '-'}kg`, doc.x + 275, startY + 50);

  doc.moveDown(5);

  // Tabela de produtos
  doc.font('Helvetica-Bold').fontSize(11).text('PRODUTOS', { align: 'left' });
  doc.moveDown(0.2);
  // Cabeçalho da tabela
  const tableTop = doc.y;
  doc
    .fontSize(9)
    .text('Produto', 40, tableTop, { width: 120 })
    .text('Qtd', 170, tableTop, { width: 40, align: 'right' })
    .text('Valor Unit.', 220, tableTop, { width: 60, align: 'right' })
    .text('Subtotal', 290, tableTop, { width: 60, align: 'right' });
  doc.moveTo(40, tableTop + 13).lineTo(370, tableTop + 13).stroke();

  // Linhas dos produtos
  let y = tableTop + 18;
  (order.items || []).forEach((item) => {
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(item.name, 40, y, { width: 120 })
      .text(item.quantity, 170, y, { width: 40, align: 'right' })
      .text(`R$ ${Number(item.price).toFixed(2)}`, 220, y, { width: 60, align: 'right' })
      .text(`R$ ${(item.quantity * item.price).toFixed(2)}`, 290, y, { width: 60, align: 'right' });
    y += 15;
  });

  // Totais
  doc.moveTo(220, y + 2).lineTo(370, y + 2).stroke();
  doc.font('Helvetica-Bold').fontSize(10).text('Subtotal:', 220, y + 8, { width: 60, align: 'right' });
  doc.font('Helvetica').fontSize(10).text(`R$ ${order.total.toFixed(2)}`, 290, y + 8, { width: 60, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(12).text('TOTAL:', 220, y + 28, { width: 60, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(12).text(`R$ ${order.total.toFixed(2)}`, 290, y + 28, { width: 60, align: 'right' });

  // Observações
  doc.moveDown(3);
  doc.font('Helvetica-Bold').fontSize(10).text('OBSERVAÇÕES');
  doc.font('Helvetica').fontSize(9).text(order.observation || '-');

  // Rodapé
  doc.moveDown(2);
  doc.font('Helvetica').fontSize(9).fillColor('#666').text('CONTATO PARA CONFIRMAR PEDIDO', { align: 'left' });
  doc.font('Helvetica').fontSize(9).fillColor('#666').text('WhatsApp: (11) 94205-8445 | E-mail: orcamento@girakids.com', { align: 'left' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(8).fillColor('#aaa').text('GIRA KIDS - CNPJ: 17.440.365/0001-30', { align: 'center' });

  doc.end();
}
