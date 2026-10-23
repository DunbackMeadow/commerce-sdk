/**
 * Paying a Dunback order from an agent wallet with x402 (USDC on Polygon,
 * EIP-3009). Bring any signer: viem, ethers, a smart wallet, an MPC wallet...
 *
 *   // viem
 *   const order = await payOrderWithX402(order, {
 *     address: account.address,
 *     signTypedData: (td) => walletClient.signTypedData({ account, ...td }),
 *   });
 *
 *   // ethers v6
 *   signTypedData: (td) => wallet.signTypedData(td.domain, td.types, td.message)
 *
 * Dunback's x402 facilitator verifies the signature and settles the transfer
 * on-chain; the response is the updated order (normally CONFIRMED).
 */

import { DunbackApiError } from "./errors.js";
import type { Order } from "./types.js";

export interface TypedDataToSign {
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` };
  types: { TransferWithAuthorization: Array<{ name: string; type: string }> };
  primaryType: "TransferWithAuthorization";
  message: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` };
}

export interface X402Signer {
  address: string;
  signTypedData: (td: TypedDataToSign) => Promise<string>;
}

interface Accept {
  scheme: string;
  network: string;
  amount: string;
  asset: `0x${string}`;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: { name?: string; version?: string };
}

const toB64 = (obj: unknown) => btoa(JSON.stringify(obj));
const fromB64 = (s: string) => JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")));

function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return `0x${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export async function payOrderWithX402(
  order: Pick<Order, "id" | "payment">,
  signer: X402Signer,
  { fetch: fetchImpl = globalThis.fetch, maxAmountUsdc }: { fetch?: typeof fetch; maxAmountUsdc?: number } = {},
): Promise<Order> {
  const url = order.payment?.usdc?.x402Url;
  if (!url) throw new Error("This order has no x402 payment URL (is it still awaiting payment, with USDC offered?).");

  const challenge = await fetchImpl(url, { method: "POST" });
  if (challenge.status !== 402) {
    const body = await challenge.json().catch(() => ({}));
    throw new DunbackApiError(challenge.status, body?.error?.code || "unexpected_response", body?.error?.message || "Expected a 402 payment challenge.");
  }
  const header = challenge.headers.get("PAYMENT-REQUIRED");
  const required = header ? fromB64(header) : await challenge.json();
  const accept: Accept | undefined = required?.accepts?.find((a: Accept) => a.network === "eip155:137");
  if (!accept) throw new Error("No Polygon USDC payment option was offered.");

  const amountUsdc = Number(accept.amount) / 1e6;
  if (maxAmountUsdc != null && amountUsdc > maxAmountUsdc) {
    throw new Error(`Dunback asks ${amountUsdc} USDC, above your limit of ${maxAmountUsdc}.`);
  }

  const now = Math.floor(Date.now() / 1000);
  const message = {
    from: signer.address,
    to: accept.payTo,
    value: accept.amount,
    validAfter: "0",
    validBefore: String(now + Math.min(3600, accept.maxTimeoutSeconds ?? 300)),
    nonce: randomNonce(),
  };
  const signature = await signer.signTypedData({
    domain: { name: accept.extra?.name || "USD Coin", version: accept.extra?.version || "2", chainId: 137, verifyingContract: accept.asset },
    types: {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "TransferWithAuthorization",
    message,
  });

  const paid = await fetchImpl(url, {
    method: "POST",
    headers: { "PAYMENT-SIGNATURE": toB64({ x402Version: 2, scheme: "exact", network: accept.network, accepted: accept, payload: { authorization: message, signature } }) },
  });
  const body = await paid.json().catch(() => ({}));
  if (!paid.ok) throw new DunbackApiError(paid.status, body?.error?.code || "payment_failed", body?.error?.message || "The x402 payment was not accepted.");
  return body as Order;
}
