import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  sendAlert,
  sendDiscordAlert,
  sendSlackAlert,
  alertLaunchSuccess,
  alertPositionOpened,
  alertPositionExit,
  alertLowBalance,
  alertError,
  alertX402Payment,
  alertIdentityRegistered,
  alertWalletFunded,
  alertShutdown,
} from "./alerts.js";

// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP
// ═══════════════════════════════════════════════════════════════════════════

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
});

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD FORMAT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("sendDiscordAlert", () => {
  it("should not send when DISCORD_WEBHOOK_URL is not set", async () => {
    await sendDiscordAlert("test message", "info");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should send embed to Discord webhook URL", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await sendDiscordAlert("Test message", "success");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://discord.com/api/webhooks/test");

    const body = JSON.parse(options.body);
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].description).toBe("Test message");
    expect(body.embeds[0].color).toBe(0x2ecc71); // Green for success
  });

  it("should include fields in Discord embed", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await sendDiscordAlert("Test", "info", { Key: "Value", Count: 42 });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].fields).toHaveLength(2);
    expect(body.embeds[0].fields[0].name).toBe("Key");
    expect(body.embeds[0].fields[0].value).toBe("Value");
    expect(body.embeds[0].fields[1].value).toBe("42");
  });

  it("should use correct colors per type", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    const colors: Record<string, number> = {
      info: 0x3498db,
      warning: 0xf39c12,
      error: 0xe74c3c,
      success: 0x2ecc71,
    };

    for (const [type, expectedColor] of Object.entries(colors)) {
      fetchMock.mockClear();
      await sendDiscordAlert("test", type as "info" | "warning" | "error" | "success");

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.embeds[0].color).toBe(expectedColor);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SLACK FORMAT TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("sendSlackAlert", () => {
  it("should not send when SLACK_WEBHOOK_URL is not set", async () => {
    await sendSlackAlert("test message", "info");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should send Block Kit format to Slack webhook URL", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";

    await sendSlackAlert("Test message", "info");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/test");

    const body = JSON.parse(options.body);
    expect(body.blocks).toBeDefined();
    expect(body.blocks.length).toBeGreaterThanOrEqual(2);

    // Header block
    expect(body.blocks[0].type).toBe("header");

    // Message section
    expect(body.blocks[1].type).toBe("section");
    expect(body.blocks[1].text.text).toBe("Test message");
  });

  it("should include fields in Slack format", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";

    await sendSlackAlert("Test", "info", { Balance: "1.5 ETH", Status: "Active" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    // Fields section (3rd block, after header and message)
    const fieldsBlock = body.blocks[2];
    expect(fieldsBlock.type).toBe("section");
    expect(fieldsBlock.fields).toHaveLength(2);
    expect(fieldsBlock.fields[0].text).toContain("Balance");
    expect(fieldsBlock.fields[0].text).toContain("1.5 ETH");
  });

  it("should include context block with timestamp", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";

    await sendSlackAlert("Test", "info");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const contextBlock = body.blocks[body.blocks.length - 1];
    expect(contextBlock.type).toBe("context");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ROUTING TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("sendAlert", () => {
  it("should log to console when no webhooks configured", async () => {
    await sendAlert("Test message", "info");

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("[ALERT:INFO] Test message")
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should send to Discord only when only Discord is configured", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await sendAlert("Test message", "info");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("discord.com");
  });

  it("should send to Slack only when only Slack is configured", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";

    await sendAlert("Test message", "info");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("slack.com");
  });

  it("should send to both when both are configured", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";

    await sendAlert("Test message", "info");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("should not fail if one webhook errors", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/test";

    fetchMock
      .mockRejectedValueOnce(new Error("Discord down"))
      .mockResolvedValueOnce(new Response("ok"));

    // Should not throw
    await sendAlert("Test message", "info");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("alertLaunchSuccess", () => {
  it("should send success alert with token details", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertLaunchSuccess("PEPE", "0xabc123def456", "0xtoken");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].description).toContain("$PEPE");
    expect(body.embeds[0].color).toBe(0x2ecc71); // success = green
  });
});

describe("alertPositionOpened", () => {
  it("should send info alert with position details", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertPositionOpened("DOGE", "0.003", "1000000");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].description).toContain("$DOGE");
  });
});

describe("alertPositionExit", () => {
  it("should send success for profit exit", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertPositionExit("PEPE", "TAKE_PROFIT", "5", "0.015");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0x2ecc71); // success
  });

  it("should send warning for stop loss", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertPositionExit("PEPE", "STOP_LOSS", "0.5", "0.0015");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0xf39c12); // warning
  });
});

describe("alertLowBalance", () => {
  it("should send warning alert", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertLowBalance("0.05");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0xf39c12); // warning
  });
});

describe("alertError", () => {
  it("should send error alert with context", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertError("Transaction failed", "Cycle 42");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0xe74c3c); // error
    expect(body.embeds[0].fields[0].value).toBe("Cycle 42");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 CONVENIENCE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe("alertX402Payment", () => {
  it("should send info alert with payment details", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertX402Payment("https://api.example.com", "0.05");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].description).toContain("x402");
    expect(body.embeds[0].description).toContain("$0.05");
  });
});

describe("alertIdentityRegistered", () => {
  it("should send success alert with agent ID", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertIdentityRegistered("42", "0x8004e3e07100dFbE22800a5025b1A8a2037aa65C");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0x2ecc71); // success
    expect(body.embeds[0].description).toContain("identity");
  });
});

describe("alertWalletFunded", () => {
  it("should send success alert with balance", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertWalletFunded("0.5", "0xabc123");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0x2ecc71);
    expect(body.embeds[0].description).toContain("funded");
  });

  it("should work without txHash", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertWalletFunded("0.5");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0x2ecc71);
  });
});

describe("alertShutdown", () => {
  it("should send warning alert with reason", async () => {
    process.env.DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/test";

    await alertShutdown("SIGTERM received");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.embeds[0].color).toBe(0xf39c12); // warning
    expect(body.embeds[0].description).toContain("SIGTERM");
  });
});
