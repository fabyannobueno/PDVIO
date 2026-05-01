// WhatsApp notification service with multiple providers
export interface WhatsAppMessage {
  phone: string;
  message: string;
}

// W-API configuration
const WAPI_INSTANCE_ID = import.meta.env.VITE_WAPI_INSTANCE_ID || '';
const WAPI_TOKEN = import.meta.env.VITE_WAPI_TOKEN || '';
const WAPI_URL = `https://api.w-api.app/v1/message/send-text?instanceId=${WAPI_INSTANCE_ID}`;

// Send WhatsApp message via W-API
export async function sendWhatsAppViaAPI(phone: string, message: string): Promise<boolean> {
  try {
    if (!WAPI_INSTANCE_ID || !WAPI_TOKEN) {
      console.error('W-API credentials not configured');
      return false;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    console.log('Sending WhatsApp via W-API to:', formattedPhone);
    
    const requestBody = {
      phone: formattedPhone,
      message: message,
      delayMessage: 0
    };
    
    const response = await fetch(WAPI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WAPI_TOKEN}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    
    if (response.ok) {
      try {
        JSON.parse(responseText);
        showNotification(`Mensagem enviada para ${phone}`, 'success');
        return true;
      } catch (parseError) {
        showNotification(`Mensagem enviada para ${phone}`, 'success');
        return true;
      }
    } else if (response.status === 429) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { message: 'Rate limit excedido' };
      }
      showNotification(`Limite da API: aguarde um momento`, 'warning');
      return false;
    } else if (response.status === 422 || response.status === 400) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { message: 'Erro de validação' };
      }
      showNotification(`API: ${errorData.message || 'Número inválido'}`, 'warning');
      return false;
    } else {
      let errorMessage = 'Erro desconhecido';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        errorMessage = responseText.substring(0, 50);
      }
      showNotification(`API: ${errorMessage}`, 'error');
      return false;
    }
  } catch (error) {
    console.error('Erro ao enviar via W-API:', error);
    showNotification(`Erro de conexão: ${error}`, 'error');
    return false;
  }
}

// Send WhatsApp message manually via WhatsApp Web
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  try {
    // Limpar telefone para formato brasileiro
    const cleanPhone = phone.replace(/\D/g, '');
    console.log(`Abrindo WhatsApp para: ${phone}`);
    
    // Construir URL do WhatsApp Web usando URLSearchParams para codificação correta
    const params = new URLSearchParams();
    params.set('text', message);
    
    const whatsappUrl = `https://wa.me/55${cleanPhone}?${params.toString()}`;
    
    // Abrir WhatsApp Web em nova aba
    window.open(whatsappUrl, '_blank');
    
    showNotification(`WhatsApp aberto para ${phone}`, 'success');
    return true;
  } catch (error) {
    console.error('Error opening WhatsApp:', error);
    showNotification('Erro ao abrir WhatsApp', 'error');
    return false;
  }
}

// Show notification to user
function showNotification(message: string, type: 'success' | 'error' | 'warning' = 'success') {
  // Create a toast-like notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#ef4444'};
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add animation keyframes
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

// Main WhatsApp notification function - tries API first, then fallback to manual
export async function sendWhatsAppNotification(phone: string, message: string): Promise<boolean> {
  // Primeiro tenta enviar via API (com emojis)
  const apiSuccess = await sendWhatsAppViaAPI(phone, message);
  
  if (apiSuccess) {
    return true;
  }
  
  // Se a API falhar, usa o método manual (sem emojis)
  showNotification(`API falhou, abrindo WhatsApp Web para ${phone}`, 'warning');
  const messageWithoutEmojis = removeEmojis(message);
  return await sendWhatsAppMessage(phone, messageWithoutEmojis);
}

// Função para formatar peso em kg
function formatWeight(weight: number): string {
  return `${weight.toFixed(3).replace('.', ',')}kg`;
}

// Função para formatar o label do item (peso primeiro quando vendido por kg)
function buildItemLabelForWhatsApp(item: any): string {
  // Verifica se tem peso definido (produtos vendidos por kg)
  if (item.weight && item.weight > 0) {
    return `${formatWeight(item.weight)} ${item.product_name || item.name}`;
  }
  
  // Para produtos unitários, mantém o formato original
  const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
  return `${quantity}x ${item.product_name || item.name}`;
}

// Generate new order confirmation message
export function generateNewOrderMessage(order: any, store: any): string {
  const orderLink = `https://deliveryx.shop/order/${order.id}`;
  const estimatedTime = order.deliveryType === 'delivery' ? store.deliveryTime : store.pickupTime;
  
  return `🎉 *${store.name}* - Novo Pedido Recebido!

Olá ${order.customer_name || order.customerName || 'Cliente'}! 👋

Seu pedido #${order.id} foi recebido com sucesso! 🛒✨

📋 *Resumo do pedido:*
${order.items?.map((item: any) => {
  return `• ${buildItemLabelForWhatsApp(item)}`;
}).join('\n')}

💰 *Total:* R$ ${(typeof order.total === 'string' ? parseFloat(order.total) : order.total).toFixed(2).replace('.', ',')}

${getPaymentInfo(order)}

${order.deliveryType === 'delivery' ? '🛵 *Modalidade:* Entrega' : '🏪 *Modalidade:* Retirada na loja'}
${estimatedTime ? `⏰ *Tempo estimado:* ${estimatedTime}` : ''}

📱 *Acompanhe seu pedido em tempo real:*
${orderLink}

⏰ *Em breve confirmaremos e iniciaremos o preparo!*

Obrigado por escolher *${store.name}*! 🧡

Equipe ${store.name}`;
}

// Helper function to get payment information
function getPaymentInfo(order: any): string {
  const paymentNames: {[key: string]: string} = {
    'pix': 'PIX',
    'credit': 'Cartão de Crédito',
    'debit': 'Cartão de Débito', 
    'cash': 'Dinheiro',
    'voucher': 'Ticket Alimentação'
  };
  
  const paymentMethod = order.paymentMethod || 'Não informado';
  const paymentName = paymentNames[paymentMethod] || paymentMethod;
  let paymentInfo = `💳 *Pagamento:* ${paymentName}`;
  
  if (order.paymentMethod === 'cash' && order.needsChange && order.changeAmount) {
    const changeAmount = (order.changeAmount || 0).toFixed(2).replace('.', ',');
    const changeNeeded = ((order.changeAmount || 0) - (order.total || 0)).toFixed(2).replace('.', ',');
    paymentInfo += `\n💰 *Troco para:* R$ ${changeAmount} (Troco: R$ ${changeNeeded})`;
  }
  
  return paymentInfo;
}

// Function to remove emojis from text (for manual WhatsApp sending)
function removeEmojis(text: string): string {
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Generate status-specific messages with emojis
export function generateStatusMessage(order: any, status: string, store: any, cancelReason?: string): string {
  const orderLink = `https://deliveryx.shop/order/${order.id}`;
  
  const statusMessages: Record<string, string> = {
    confirmed: `✅ *${store.name}* - Pedido Confirmado

Olá ${order.customer_name || order.customerName || 'Cliente'}! 👋

Seu pedido #${order.id} foi confirmado e já está sendo preparado! 🛒✨

📋 *Resumo do pedido:*
${order.items?.map((item: any) => {
  return `• ${buildItemLabelForWhatsApp(item)}`;
}).join('\n')}

💰 *Total:* R$ ${(typeof order.total === 'string' ? parseFloat(order.total) : order.total).toFixed(2).replace('.', ',')}

${getPaymentInfo(order)}

${order.deliveryType === 'delivery' ? 
  (store.deliveryTime ? `🛵 *Tempo estimado para entrega:* ${store.deliveryTime}` : '⏰ *Tempo de preparo:* 30-45 minutos') :
  (store.pickupTime ? `🏪 *Tempo estimado para retirada:* ${store.pickupTime}` : '⏰ *Tempo de preparo:* 30-45 minutos')
}

📱 *Acompanhe seu pedido:*
${orderLink}

Obrigado por escolher *${store.name}*! 🧡`,
    
    preparing: `👨‍🍳 *${store.name}* - Preparando seu Pedido

Olá ${order.customer_name || order.customerName || 'Cliente'}! 😊

Seu pedido #${order.id} está sendo preparado com muito carinho pela nossa equipe! 🍳🧡

📋 *Resumo do pedido:*
${order.items?.map((item: any) => {
  return `• ${buildItemLabelForWhatsApp(item)}`;
}).join('\n')}

${order.deliveryType === 'delivery' ? '🛵 *Em breve estará pronto para entrega*' : '🏪 *Em breve estará pronto para retirada*'}

📱 *Acompanhe:* ${orderLink}

*${store.name}* - Qualidade em cada pedido! 🔝`,

    ready: `🍽️ *${store.name}* - Pedido Pronto!

Olá ${order.customer_name || order.customerName || 'Cliente'}! 🎉

Seu pedido #${order.id} está prontinho! ✅

📋 *Resumo do pedido:*
${order.items?.map((item: any) => {
  return `• ${buildItemLabelForWhatsApp(item)}`;
}).join('\n')}

${order.deliveryType === 'delivery' ? 
  '🛵 *Aguardando nosso entregador parceiro para iniciar a entrega*\n\n⏰ *Em alguns minutos seu pedido sairá para entrega*\n\n🏠 *Endereço de entrega:*\n' + (order.address || order.customer_address || 'Endereço cadastrado') : 
  '🏪 *Pode retirar na loja agora mesmo!*\n\n📍 *Endereço da loja:* ' + (store.address || 'Verifique o endereço na loja')
}

📱 *Acompanhe:* ${orderLink}

*${store.name}* - Pedido fresquinho te esperando! 🔥`,

    out_for_delivery: `🛵 *${store.name}* - Saiu para Entrega

Olá ${order.customer_name || order.customerName || 'Cliente'}! 🚀

Seu pedido #${order.id} está a caminho! 📦✨

📋 *Resumo do pedido:*
${order.items?.map((item: any) => {
  return `• ${buildItemLabelForWhatsApp(item)}`;
}).join('\n')}

🏠 *Endereço de entrega:*
${order.customer_address || 'Endereço cadastrado'}

${store.deliveryTime ? `⏰ *Previsão de chegada:* ${store.deliveryTime}` : '⏰ *Previsão de chegada:* 15-25 minutos'}

📱 *Acompanhe em tempo real:* ${orderLink}

*${store.name}* - Chegando aí! 🔥`,
    
    delivered: `🎉 *${store.name}* - Pedido Entregue

Olá ${order.customer_name || order.customerName || 'Cliente'}! 😊

Seu pedido #${order.id} foi entregue com sucesso! ✅

🧡 *Obrigado pela preferência!*

Esperamos que aproveite cada sabor! Sua opinião é muito importante para nós. 

⭐ *Que tal avaliar seu pedido?*
${orderLink}

Conte conosco sempre! 

*${store.name}*`,
    
    cancelled: `❌ *${store.name}* - Pedido Cancelado

Olá ${order.customer_name || order.customerName || 'Cliente'}! 😔

Infelizmente seu pedido #${order.id} foi cancelado.

${cancelReason ? `📝 *Motivo:* ${cancelReason}\n` : ''}
📞 *Entre em contato conosco para mais informações:*
${store.whatsapp ? `📱 WhatsApp: ${store.whatsapp}` : ''}
${store.phone ? `☎️ Telefone: ${store.phone}` : ''}

Esperamos atendê-lo novamente em breve!

*${store.name}*`
  };
  
  return statusMessages[status] || '';
}