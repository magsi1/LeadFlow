export async function sendWhatsAppReply(to: string, message: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    console.error('Missing WhatsApp env, skipping reply');
    return;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }),
    });

    const data = await response.json();
    console.log('Reply sent:', data);

    if (!response.ok || data?.error) {
      console.error('WhatsApp API Error:', data?.error ?? data);
    }
  } catch (error) {
    console.error('Error sending WhatsApp reply:', error);
  }
}
