export function formatNumber(n, decimals = 2) {
  return Number(n).toFixed(decimals);
}

export function nowISO() {
  return new Date().toISOString();
}