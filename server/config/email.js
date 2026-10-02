const nodemailer = require("nodemailer");

function createTransporter() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === "true",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

async function sendOrderConfirmationEmail(user, order, items) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log(`Order confirmation email skipped for ${user.email}. Configure EMAIL_HOST, EMAIL_USER, and EMAIL_PASS to enable it.`);
    return { skipped: true };
  }

  const orderLines = items.map((item) => `
    <li>
      <strong>${item.name}</strong> × ${item.quantity} — $${Number(item.unit_price || item.price).toFixed(2)}
    </li>
  `).join("");

  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM || "noreply@morrow-supply.local",
    to: user.email,
    subject: `Your Morrow Supply order #${order.id} is confirmed`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Thanks for your order, ${user.name}.</h2>
        <p>Your order #${order.id} has been placed successfully.</p>
        <ul>${orderLines}</ul>
        <p><strong>Total:</strong> $${Number(order.total).toFixed(2)}</p>
        <p>We’ll send another update when it ships.</p>
      </div>
    `
  });

  return { skipped: false, messageId: info.messageId };
}

module.exports = { sendOrderConfirmationEmail };
