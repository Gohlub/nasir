import Link from "next/link";

import { getWebEnv } from "../lib/env";

export default function HomePage() {
  const env = getWebEnv();

  return (
    <div className="shell">
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Tempo Session Auctions</p>
            <h1>Bid with escrow-backed authority, not soft promises.</h1>
            <p>
              Nasir’s auction flow is a real MPP service from the first request: the browser hits an unpaid bid route,
              receives a `402 Payment Required` challenge, and retries with `Authorization: Payment`.
            </p>
            <div className="cta-row">
              <Link href="/lots" className="primary-button">
                Browse lots
              </Link>
              <a href={`${env.NEXT_PUBLIC_API_ORIGIN}/openapi.json`} className="secondary-button">
                OpenAPI
              </a>
            </div>
          </div>
          <div className="meta-panel">
            <p className="eyebrow">Build snapshot</p>
            <h2>What this first pass already wires up</h2>
            <dl className="meta-list">
              <div>
                <dt>API shape</dt>
                <dd>Free lot reads, OpenAPI discovery, and a payable bid route with MPP 402 challenges.</dd>
              </div>
              <div>
                <dt>Frontend flow</dt>
                <dd>Unpaid request, challenge inspection, voucher retry UI, receipt/debug panels, and lot status polling.</dd>
              </div>
              <div>
                <dt>On-chain model</dt>
                <dd>Designed around one `LotPayee` per lot and one winning channel close, exactly like the current contracts.</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
