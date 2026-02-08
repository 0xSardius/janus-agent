import { describe, it, expect, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";
import { verifyX402Payment, send402Response } from "./middleware.js";

function mockReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function mockRes(): ServerResponse & { _status: number; _headers: Record<string, string>; _body: string } {
  const res = {
    _status: 0,
    _headers: {} as Record<string, string>,
    _body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) res._headers = headers;
    },
    end(body?: string) {
      res._body = body || "";
    },
  };
  return res as unknown as ServerResponse & { _status: number; _headers: Record<string, string>; _body: string };
}

describe("verifyX402Payment", () => {
  it("allows request when gating is disabled", async () => {
    const req = mockReq();
    const result = await verifyX402Payment(req, { enableGating: false });
    expect(result).toBe(true);
  });

  it("rejects request with no proof header", async () => {
    const req = mockReq();
    const result = await verifyX402Payment(req, { enableGating: true });
    expect(result).toBe(false);
  });

  it("accepts valid JSON proof with signature and payer", async () => {
    const proof = JSON.stringify({ signature: "0xabc", payer: "0x123" });
    const req = mockReq({ "x-payment-proof": proof });
    const result = await verifyX402Payment(req, { enableGating: true });
    expect(result).toBe(true);
  });

  it("rejects invalid JSON proof", async () => {
    const req = mockReq({ "x-payment-proof": "not-json" });
    const result = await verifyX402Payment(req, { enableGating: true });
    expect(result).toBe(false);
  });

  it("rejects proof missing required fields", async () => {
    const proof = JSON.stringify({ foo: "bar" });
    const req = mockReq({ "x-payment-proof": proof });
    const result = await verifyX402Payment(req, { enableGating: true });
    expect(result).toBe(false);
  });

  it("uses custom verifier when provided", async () => {
    const customVerifier = vi.fn().mockResolvedValue(true);
    const proof = JSON.stringify({ custom: "data" });
    const req = mockReq({ "x-payment-proof": proof });

    const result = await verifyX402Payment(req, {
      enableGating: true,
      verifyPayment: customVerifier,
    });

    expect(result).toBe(true);
    expect(customVerifier).toHaveBeenCalledWith(proof);
  });
});

describe("send402Response", () => {
  it("sends 402 status with payment details", () => {
    const res = mockRes();
    send402Response(res, { pricePerRequestUSD: 0.01 });

    expect(res._status).toBe(402);
    expect(res._headers["X-Payment-Required"]).toBeDefined();
    const body = JSON.parse(res._body);
    expect(body.error).toBe("Payment Required");
    expect(body.price).toBe(0.01);
  });
});
