import { Order, CartItem } from '../types';
import { RESTAURANT_NAME as BRAND_NAME } from '../constants';

/**
 * Generates a styled HTML invoice for one or more orders and triggers a download.
 */
export const downloadInvoice = (orders: Order | Order[]) => {
  const orderList = Array.isArray(orders) ? orders : [orders];
  if (orderList.length === 0) return;

  const total = orderList.reduce((acc, o) => acc + o.total, 0);
  const dateStr = new Date().toLocaleDateString();
  const invoiceId = orderList.length === 1 ? `INV-${orderList[0].id.slice(-8)}` : `STMT-${Date.now().toString().slice(-6)}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoiceId}</title>
      <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; color: #1e293b; padding: 40px; line-height: 1.6; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #6366f1; padding-bottom: 20px; margin-bottom: 40px; }
        .brand { font-size: 28px; font-weight: 900; letter-spacing: -1px; text-transform: uppercase; color: #0f172a; }
        .invoice-meta { text-align: right; }
        .invoice-meta div { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; }
        .invoice-meta span { font-size: 14px; font-weight: 700; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { text-align: left; padding: 15px; background: #f8fafc; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
        td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-size: 13px; font-weight: 600; }
        .item-details { color: #64748b; font-size: 11px; margin-top: 4px; }
        .totals { margin-top: 40px; padding-top: 20px; border-top: 2px solid #f1f5f9; text-align: right; }
        .total-row { display: flex; justify-content: flex-end; align-items: baseline; gap: 20px; margin-bottom: 10px; }
        .total-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: #94a3b8; }
        .total-amount { font-size: 32px; font-weight: 900; color: #6366f1; letter-spacing: -1px; }
        .footer { margin-top: 60px; text-align: center; font-size: 10px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 3px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 6px; background: #f0fdf4; color: #16a34a; font-size: 10px; font-weight: 800; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap" rel="stylesheet">
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">${BRAND_NAME}</div>
          <div style="font-size: 12px; color: #64748b; font-weight: 600;">Lumina Intelligence Core v4.0</div>
        </div>
        <div class="invoice-meta">
          <div>Document ID</div>
          <span>${invoiceId}</span>
          <div style="margin-top: 10px;">Issue Date</div>
          <span>${dateStr}</span>
        </div>
      </div>

      <div style="margin-bottom: 30px;">
        <div class="badge">PAID IN FULL</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Item Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th style="text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${orderList.map(order => order.items.map(item => `
            <tr>
              <td>
                <div>${item.name}</div>
                <div class="item-details">
                  ${item.selectedOptions.length > 0 ? item.selectedOptions.map(o => o.name).join(', ') : 'Standard Configuration'}
                  ${item.groupId ? ` • Group: ${item.groupName}` : ''}
                </div>
              </td>
              <td>${item.quantity}</td>
              <td>$${item.price.toFixed(2)}</td>
              <td style="text-align: right;">$${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `).join('')).join('')}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <div class="total-label">Subtotal Combined</div>
          <div style="font-size: 18px; font-weight: 700;">$${total.toFixed(2)}</div>
        </div>
        <div class="total-row">
          <div class="total-label">Tax (0%)</div>
          <div style="font-size: 18px; font-weight: 700;">$0.00</div>
        </div>
        <div class="total-row" style="margin-top: 20px;">
          <div class="total-label">Grand Total</div>
          <div class="total-amount">$${total.toFixed(2)}</div>
        </div>
      </div>

      <div class="footer">
        Thank you for choosing ${BRAND_NAME} • Digital Signal Authenticated
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${invoiceId}.html`;
  document.body.appendChild(a);
  a.click();
  // Defensive check to prevent "Node to be removed is not a child of this node" error
  if (a.parentNode === document.body) {
    document.body.removeChild(a);
  }
  URL.revokeObjectURL(url);
};