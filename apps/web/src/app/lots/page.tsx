import { getLots } from "../../lib/api";
import { LotCard } from "../../components/lot-card";

export default async function LotsPage() {
  const data = await getLots();

  return (
    <div className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Auction lots</p>
          <h1>Standing bids, visible reserve, clear settlement.</h1>
          <p>
            Every lot exposes the off-chain standing bid state needed to decide whether the next request should open,
            top up, or just authorize more voucher value.
          </p>
        </div>
      </section>

      <section className="lots-grid">
        {data.lots.map((lot) => (
          <LotCard key={lot.lotId} lot={lot} />
        ))}
      </section>
    </div>
  );
}

