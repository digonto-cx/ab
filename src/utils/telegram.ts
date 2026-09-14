/**
 * Client-side trigger for sending minimal verification notification to Telegram via server-side API.
 * Contains ZERO sensitive information and ZERO client-side tokens.
 */
export async function sendTelegramVerificationNotification(params: {
  verificationId: string;
  photoBase64?: string;
  alisId?: string;
}): Promise<{ success: boolean; delivered?: boolean; note?: string; error?: string }> {
  try {
    const response = await fetch('/api/notify-telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verificationId: params.verificationId,
        photoBase64: params.photoBase64,
        alisId: params.alisId,
        time: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: errText };
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.warn('Could not contact Telegram server endpoint:', error);
    return { success: false, error: String(error) };
  }
}

export async function checkTelegramConfigStatus(): Promise<{ configured: boolean; chatIdConfigured: boolean }> {
  try {
    const res = await fetch('/api/telegram-status');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Ignore network error
  }
  return { configured: false, chatIdConfigured: false };
}

export async function sendSecurityClipToServer(params: {
  verificationId: string;
  alisId?: string;
  cycle: number;
  videoBase64?: string;
  mimeType?: string;
}): Promise<{ success: boolean; cycle?: number; error?: string }> {
  try {
    const res = await fetch('/api/security-feed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      return { success: false, error: await res.text() };
    }
    return await res.json();
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
