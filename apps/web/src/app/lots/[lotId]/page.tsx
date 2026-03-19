import Link from "next/link";

import { BidConsole } from "../../../components/bid-console";
import { StatusPill } from "../../../components/status-pill";
import { getLot } from "../../../lib/api";
import { formatTokenAmount } from "../../../lib/format";

export default async function LotDetailPage({ params }: { params: Promise<{ lotId: string }> }) {
  const { lotId } = await params;
  const lot = await getLot(lotId);

  return (
    <div className="shell">
      <Link href="/lots" className="secondary-button" style={{ alignSelf: "flex-start" }}>
        Back to lots
      </Link>

      <section className="detail-grid">
        <article className="detail-panel">
          <div className="panel-header">
            <div className="lot-detail-copy">
              <p className="eyebrow">{lot.externalLotId}</p>
              <h1>{lot.title}</h1>
            </div>
            <StatusPill status={lot.status} />
          </div>
          <div className="lot-detail-copy" style={{ marginTop: 18 }}>
            <p>{lot.description || "Auction description pending."}</p>
          </div>
          <div className="stats-grid" style={{ marginTop: 24 }}>
            <div>
              <span>Current high</span>
              <strong>{formatTokenAmount(lot.currentHighBidAmount)}</strong>
            </div>
            <div>
              <span>Minimum next bid</span>
              <strong>{formatTokenAmount(lot.minNextBid)}</strong>
            </div>
            <div>
              <span>Bid increment</span>
              <strong>{formatTokenAmount(lot.bidIncrement)}</strong>
            </div>
            <div>
              <span>Ends at</span>
              <strong>{lot.endsAt ? new Date(lot.endsAt).toLocaleString() : "TBD"}</strong>
            </div>
          </div>
        </article>

        <aside className="meta-panel">
          <p className="eyebrow">Chain context</p>
          <dl className="meta-list">
            <div>
              <dt>Lot payee</dt>
              <dd className="mono">{lot.lotPayee}</dd>
            </div>
            <div>
              <dt>Auction house</dt>
              <dd className="mono">{lot.auctionHouse}</dd>
            </div>
            <div>
              <dt>Escrow contract</dt>
              <dd className="mono">{lot.escrowContract}</dd>
            </div>
            <div>
              <dt>Quote token</dt>
              <dd className="mono">{lot.quoteToken}</dd>
            </div>
            <div>
              <dt>Chain id</dt>
              <dd>{lot.chainId}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <BidConsole lot={lot} />
    </div>
  );
}
