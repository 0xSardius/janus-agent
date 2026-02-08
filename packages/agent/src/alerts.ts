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

export async function sendDiscordAlert(
  message: string,
  type: AlertType = "info",
  fields?: Record<string, string | number>
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
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
    console.error("Failed to send Discord alert:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SLACK WEBHOOK (Block Kit format)
// ═══════════════════════════════════════════════════════════════════════════

export async function sendSlackAlert(
  message: string,
  type: AlertType = "info",
  fields?: Record<string, string | number>
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  const emoji = EMOJI_MAP[type];

  try {
    const blocks: Record<string, unknown>[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} Token Launcher Agent`,
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      },
    ];

    if (fields && Object.keys(fields).length > 0) {
      blocks.push({
        type: "section",
        fields: Object.entries(fields).map(([name, value]) => ({
          type: "mrkdwn",
          text: `*${name}*\n${String(value)}`,
        })),
      });
    }

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_${new Date().toISOString()}_`,
        },
      ],
    });

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
  } catch (error) {
    console.error("Failed to send Slack alert:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ALERT DISPATCHER
// Routes to Discord, Slack, or console based on env config
// ═══════════════════════════════════════════════════════════════════════════

export async function sendAlert(
  message: string,
  type: AlertType = "info",
  fields?: Record<string, string | number>
): Promise<void> {
  const hasDiscord = !!process.env.DISCORD_WEBHOOK_URL;
  const hasSlack = !!process.env.SLACK_WEBHOOK_URL;

  // Always log to console
  console.log(`[ALERT:${type.toUpperCase()}] ${message}`);

  const promises: Promise<void>[] = [];

  if (hasDiscord) {
    promises.push(sendDiscordAlert(message, type, fields));
  }

  if (hasSlack) {
    promises.push(sendSlackAlert(message, type, fields));
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function alertX402Payment(
  url: string,
  amount: string
): Promise<void> {
  await sendAlert(`x402 micropayment: $${amount}`, "info", {
    "URL": url,
    "Amount": `$${amount}`,
  });
}

export async function alertIdentityRegistered(
  agentId: string,
  registry: string
): Promise<void> {
  await sendAlert(`Agent identity registered on-chain`, "success", {
    "Agent ID": agentId,
    "Registry": registry.slice(0, 10) + "...",
  });
}

export async function alertWalletFunded(
  balance: string,
  txHash?: string
): Promise<void> {
  await sendAlert(`Wallet funded`, "success", {
    "Balance": `${balance} ETH`,
    ...(txHash ? { "TX Hash": txHash.slice(0, 18) + "..." } : {}),
  });
}

export async function alertShutdown(reason: string): Promise<void> {
  await sendAlert(`Agent shutting down: ${reason}`, "warning", {
    "Reason": reason,
    "Timestamp": new Date().toISOString(),
  });
}
