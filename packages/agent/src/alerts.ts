// ═══════════════════════════════════════════════════════════════════════════
// ALERT TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AlertType = "info" | "warning" | "error" | "success";

export interface AlertPayload {
  message: string;
  type: AlertType;
  fields?: Record<string, string | number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════

const EMOJI_MAP: Record<AlertType, string> = {
  info: "ℹ️",
  warning: "⚠️",
  error: "🚨",
  success: "✅",
};

const COLOR_MAP: Record<AlertType, number> = {
  info: 0x3498db, // Blue
  warning: 0xf39c12, // Orange
  error: 0xe74c3c, // Red
  success: 0x2ecc71, // Green
};

export async function sendAlert(
  message: string,
  type: AlertType = "info",
  fields?: Record<string, string | number>
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log(`[ALERT:${type.toUpperCase()}] ${message}`);
    return;
  }

  const emoji = EMOJI_MAP[type];

  try {
    const embed: Record<string, unknown> = {
      title: `${emoji} Token Launcher Agent`,
      description: message,
      color: COLOR_MAP[type],
      timestamp: new Date().toISOString(),
    };

    if (fields && Object.keys(fields).length > 0) {
      embed.fields = Object.entries(fields).map(([name, value]) => ({
        name,
        value: String(value),
        inline: true,
      }));
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });
  } catch (error) {
    console.error("Failed to send alert:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function alertLaunchSuccess(
  symbol: string,
  txHash: string,
  tokenAddress: string
): Promise<void> {
  await sendAlert(`Launched $${symbol}`, "success", {
    "Token Address": tokenAddress,
    "TX Hash": txHash.slice(0, 18) + "...",
  });
}

export async function alertPositionOpened(
  symbol: string,
  amountETH: string,
  tokensReceived: string
): Promise<void> {
  await sendAlert(`Position opened in $${symbol}`, "info", {
    "Cost": `${amountETH} ETH`,
    "Tokens": tokensReceived,
  });
}

export async function alertPositionExit(
  symbol: string,
  action: string,
  multiple: string,
  ethReceived: string
): Promise<void> {
  const type = action === "STOP_LOSS" ? "warning" : "success";
  await sendAlert(`${action}: $${symbol} at ${multiple}x`, type, {
    "ETH Received": ethReceived,
  });
}

export async function alertLowBalance(balance: string): Promise<void> {
  await sendAlert(`Low ETH balance`, "warning", {
    "Balance": `${balance} ETH`,
    "Minimum": "0.1 ETH",
  });
}

export async function alertError(error: string, context?: string): Promise<void> {
  await sendAlert(error, "error", context ? { Context: context } : undefined);
}
