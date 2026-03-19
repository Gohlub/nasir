"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";

import type { LotDetail, PaymentChallenge, PaymentReceipt, ProblemDetails } from "@nasir/shared";

import { getLotStatus, requestBidChallenge, submitVoucherBidRetry } from "../lib/api";
import { formatTokenAmount } from "../lib/format";
import {
  connectInjectedWallet,
  requestChannelClose,
  signVoucherWithInjectedWallet,
  withdrawChannelFunds
} from "../lib/wallet";
import { StatusPill } from "./status-pill";

type BidConsoleState =
  | "idle"
  | "requestingChallenge"
  | "received402"
  | "signingVoucher"
  | "submittingPaidRequest"
  | "accepted"
  | "rejected";

type BidConsoleProps = {
  lot: LotDetail;
};

export function BidConsole({ lot }: BidConsoleProps) {
  const [bidAmount, setBidAmount] = useState(lot.minNextBid);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [clientBidId, setClientBidId] = useState(() => crypto.randomUUID());
  const [channelIdHint, setChannelIdHint] = useState("");
  const [payer, setPayer] = useState("");
  const [voucherChannelId, setVoucherChannelId] = useState("");
  const [signature, setSignature] = useState("");
  const [flowState, setFlowState] = useState<BidConsoleState>("idle");
  const [challenge, setChallenge] = useState<PaymentChallenge | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [responseMessage, setResponseMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<ProblemDetails | null>(null);
  const [acceptedBidAmount, setAcceptedBidAmount] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState<"connecting" | "signing" | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState<"request-close" | "withdraw" | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  const { data: liveStatus } = useSWR(`/status/${lot.lotId}`, () => getLotStatus(lot.lotId), {
    refreshInterval: 5_000
  });

  const challengeSummary = useMemo(() => {
    if (!challenge) {
      return null;
    }

    return JSON.stringify(challenge, null, 2);
  }, [challenge]);

  const receiptSummary = useMemo(() => {
    if (!receipt) {
      return null;
    }

    return JSON.stringify(receipt, null, 2);
  }, [receipt]);

  function buildBidRequestBody() {
    return channelIdHint
      ? {
          bidAmount,
          channelIdHint,
          clientBidId
        }
      : {
          bidAmount,
          clientBidId
        };
  }

  async function startBidFlow() {
    setFlowState("requestingChallenge");
    setProblem(null);
    setReceipt(null);
    setResponseMessage(null);
    setWalletMessage(null);

    try {
      const result = await requestBidChallenge(
        lot.lotId,
        buildBidRequestBody(),
        idempotencyKey
      );

      if (result.kind === "accepted") {
        setFlowState("accepted");
        setReceipt(result.receipt as PaymentReceipt | null);
        setAcceptedBidAmount(result.bid.bidAmount);
        setResponseMessage("Server accepted the bid on the first response.");
        return;
      }

      setChallenge(result.challenge);
      setVoucherChannelId(result.challengeRequest.methodDetails.channelId ?? channelIdHint);
      setProblem(result.problem);
      setFlowState("received402");
      setResponseMessage(
        "402 challenge received. This UI currently completes the voucher retry path for already-funded channels."
      );
    } catch (error) {
      setFlowState("rejected");
      setProblem(error as ProblemDetails);
      setResponseMessage("Bid request failed before a valid challenge could be completed.");
    }
  }

  async function submitPaidRetry() {
    if (!challenge) {
      return;
    }

    setFlowState("signingVoucher");
    setProblem(null);
    setResponseMessage("Submitting paid retry with the challenge echo and voucher payload.");

    try {
      setFlowState("submittingPaidRequest");
      const result = await submitVoucherBidRetry({
        lotId: lot.lotId,
        idempotencyKey,
        challenge,
        payer,
        channelId: voucherChannelId,
        signature,
        body: buildBidRequestBody()
      });

      if (!result.ok) {
        setFlowState("rejected");
        setProblem(result.body as ProblemDetails);
        if (result.retryChallenge) {
          setChallenge(result.retryChallenge);
        }
        setResponseMessage("The paid retry was rejected. Inspect the fresh challenge and problem details below.");
        return;
      }

      setReceipt(result.receipt);
      setAcceptedBidAmount(result.body?.bidAmount ?? bidAmount);
      setFlowState("accepted");
      setResponseMessage("Paid retry accepted. The response included a Payment-Receipt header.");
      setIdempotencyKey(crypto.randomUUID());
      setClientBidId(crypto.randomUUID());
    } catch (error) {
      setFlowState("rejected");
      setProblem(error as ProblemDetails);
      setResponseMessage("The paid retry failed to complete.");
    }
  }

  async function connectWallet() {
    setWalletBusy("connecting");
    setWalletMessage(null);

    try {
      const account = await connectInjectedWallet();
      setWalletAddress(account);
      setPayer((current) => current || account);
      setWalletMessage("Injected wallet connected.");
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : "Failed to connect wallet.");
    } finally {
      setWalletBusy(null);
    }
  }

  async function signVoucher() {
    if (!voucherChannelId) {
      setWalletMessage("A channel id is required before a voucher can be signed.");
      return;
    }

    setWalletBusy("signing");
    setWalletMessage(null);

    try {
      const signed = await signVoucherWithInjectedWallet({
        channelId: voucherChannelId,
        cumulativeAmount: bidAmount
      });

      setWalletAddress(signed.account);
      setPayer(signed.account);
      setSignature(signed.signature);
      setWalletMessage("Voucher signed with the connected wallet.");
    } catch (error) {
      setWalletMessage(error instanceof Error ? error.message : "Failed to sign voucher.");
    } finally {
      setWalletBusy(null);
    }
  }

  async function startRecovery(action: "request-close" | "withdraw") {
    const channelId = voucherChannelId || channelIdHint;
    if (!channelId) {
      setRecoveryMessage("Enter or reuse a channel id before using the recovery actions.");
      return;
    }

    setRecoveryBusy(action);
    setRecoveryMessage(null);

    try {
      const txHash =
        action === "request-close"
          ? await requestChannelClose(channelId)
          : await withdrawChannelFunds(channelId);

      setRecoveryMessage(
        action === "request-close"
          ? `requestClose submitted: ${txHash}`
          : `withdraw submitted: ${txHash}`
      );
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : "Recovery transaction failed.");
    } finally {
      setRecoveryBusy(null);
    }
  }

  return (
    <section className="bid-console">
      <div className="bid-console-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live auction state</p>
            <h2>Reserve-backed bidding</h2>
          </div>
          <StatusPill status={liveStatus?.status ?? lot.status} />
        </div>

        <div className="stats-grid">
          <div>
            <span>Current high</span>
            <strong>{formatTokenAmount(liveStatus?.currentHighBidAmount ?? lot.currentHighBidAmount)}</strong>
          </div>
          <div>
            <span>Minimum next bid</span>
            <strong>{formatTokenAmount(liveStatus?.minNextBid ?? lot.minNextBid)}</strong>
          </div>
          <div>
            <span>Lot payee</span>
            <strong className="mono">{lot.lotPayee}</strong>
          </div>
          <div>
            <span>Escrow</span>
            <strong className="mono">{lot.escrowContract}</strong>
          </div>
        </div>

        <div className="form-grid">
          <label>
            Bid amount
            <input value={bidAmount} onChange={(event) => setBidAmount(event.target.value)} />
          </label>
          <label>
            Channel hint
            <input
              value={channelIdHint}
              onChange={(event) => {
                setChannelIdHint(event.target.value);
                setVoucherChannelId(event.target.value);
              }}
              placeholder="0x..."
            />
          </label>
          <label>
            Idempotency key
            <input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} />
          </label>
          <label>
            Client bid id
            <input value={clientBidId} onChange={(event) => setClientBidId(event.target.value)} />
          </label>
        </div>

        <div className="action-row">
          <button className="primary-button" onClick={startBidFlow} disabled={flowState === "requestingChallenge" || flowState === "submittingPaidRequest"}>
            {flowState === "requestingChallenge" ? "Requesting challenge..." : "Place bid"}
          </button>
          <span className="state-chip">State: {flowState}</span>
        </div>

        <div className="action-row">
          <button className="secondary-button" onClick={connectWallet} disabled={walletBusy !== null}>
            {walletBusy === "connecting" ? "Connecting wallet..." : walletAddress ? "Wallet connected" : "Connect wallet"}
          </button>
          <span className="helper-text mono">{walletAddress ?? "No wallet connected yet."}</span>
        </div>

        {challenge && (
          <div className="voucher-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Paid retry</p>
                <h3>Voucher path</h3>
              </div>
            </div>
            <p className="helper-text">
              The backend currently accepts the `voucher` retry path. Paste the wallet-produced voucher fields here after reviewing the 402 challenge.
            </p>
            <div className="form-grid">
              <label>
                Payer
                <input value={payer} onChange={(event) => setPayer(event.target.value)} placeholder="0x..." />
              </label>
              <label>
                Channel id
                <input
                  value={voucherChannelId}
                  onChange={(event) => setVoucherChannelId(event.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label className="full-width">
                Voucher signature
                <textarea value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="0x..." />
              </label>
            </div>
            <div className="action-row">
              <button className="secondary-button" onClick={signVoucher} disabled={walletBusy !== null}>
                {walletBusy === "signing" ? "Signing voucher..." : "Sign voucher with wallet"}
              </button>
              <button className="primary-button" onClick={submitPaidRetry} disabled={flowState === "submittingPaidRequest"}>
                {flowState === "submittingPaidRequest" ? "Submitting..." : "Submit paid retry"}
              </button>
              <span className="helper-text">Expected cumulative amount: {bidAmount}</span>
            </div>
            {walletMessage && <p className="helper-text">{walletMessage}</p>}
          </div>
        )}

        {responseMessage && <p className="helper-text">{responseMessage}</p>}
        {acceptedBidAmount && <p className="success-callout">Accepted standing bid: {formatTokenAmount(acceptedBidAmount)}</p>}
        {problem && (
          <div className="problem-callout">
            <strong>{problem.title}</strong>
            <p>{problem.detail}</p>
          </div>
        )}

        <details className="debug-panel">
          <summary>Challenge / receipt debug</summary>
          <div className="debug-grid">
            <div>
              <h4>Last challenge</h4>
              <pre>{challengeSummary ?? "No challenge yet."}</pre>
            </div>
            <div>
              <h4>Last receipt</h4>
              <pre>{receiptSummary ?? "No receipt yet."}</pre>
            </div>
          </div>
        </details>

        <div className="recovery-panel">
          <p className="eyebrow">Loser recovery</p>
          <p>
            Losing bidders will recover funds directly from the Tempo escrow contract via `requestClose(channelId)` and
            `withdraw(channelId)`.
          </p>
          <div className="action-row" style={{ marginTop: 16 }}>
            <button
              className="secondary-button"
              onClick={() => startRecovery("request-close")}
              disabled={recoveryBusy !== null}
            >
              {recoveryBusy === "request-close" ? "Requesting close..." : "Request close"}
            </button>
            <button
              className="secondary-button"
              onClick={() => startRecovery("withdraw")}
              disabled={recoveryBusy !== null}
            >
              {recoveryBusy === "withdraw" ? "Withdrawing..." : "Withdraw"}
            </button>
          </div>
          {recoveryMessage && <p className="helper-text" style={{ marginTop: 12 }}>{recoveryMessage}</p>}
        </div>
      </div>
    </section>
  );
}
