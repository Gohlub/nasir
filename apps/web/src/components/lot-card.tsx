import Link from "next/link";

import type { LotSummary } from "@nasir/shared";

import { formatTokenAmount } from "../lib/format";
import { StatusPill } from "./status-pill";

type LotCardProps = {
  lot: LotSummary;
};

export function LotCard({ lot }: LotCardProps) {
  return (
    <Link href={`/lots/${lot.lotId}`} className="lot-card">
      <div className="lot-card-header">
        <p className="eyebrow">{lot.externalLotId}</p>
        <StatusPill status={lot.status} />
      </div>
      <h2>{lot.title}</h2>
      <dl className="lot-stats">
        <div>
          <dt>Current high</dt>
          <dd>{formatTokenAmount(lot.currentHighBidAmount)}</dd>
        </div>
        <div>
          <dt>Next bid</dt>
          <dd>{formatTokenAmount(lot.minNextBid)}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{lot.endsAt ? new Date(lot.endsAt).toLocaleString() : "TBD"}</dd>
        </div>
      </dl>
    </Link>
  );
}

