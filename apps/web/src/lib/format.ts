export function formatTokenAmount(value: string | null) {
  if (!value) {
    return "No bids yet";
  }

  return new Intl.NumberFormat("en-US").format(Number(value));
}

