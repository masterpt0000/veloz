export function formatPrice(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString('pt-PT', { maximumFractionDigits: 2 })
  }
  if (Math.abs(value) < 2) {
    return value.toLocaleString('pt-PT', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 5,
    })
  }
  return value.toLocaleString('pt-PT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}%`
}

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-PT', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

export function formatTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
