import { expect, test, type Page, type Route } from '@playwright/test'

const API = 'http://192.168.1.216:8080'
const API_KEY = 'e2e-test-key'

function makeBars(count: number) {
  const start = 1_700_000_000
  const bars = []
  let price = 100
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 8) * 3
    const open = price
    const close = 100 + wave + i * 0.01
    bars.push({
      time: start + i * 3600,
      open,
      high: Math.max(open, close) + 0.3,
      low: Math.min(open, close) - 0.3,
      close,
      volume: 1000 + i,
    })
    price = close
  }
  return bars
}

async function mockCandlesApi(page: Page) {
  const bars = makeBars(500)

  await page.route(`${API}/**`, async (route: Route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const key = route.request().headers()['x-api-key']

    if (path === '/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          database: 'ok',
          symbols: ['BTCUSDT'],
          dbSymbols: ['BTCUSDT'],
          market: 'spot',
        }),
      })
      return
    }

    if (key !== API_KEY) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'invalid or missing X-API-Key' }),
      })
      return
    }

    if (path === '/symbols' || path === '/v1/symbols') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          symbols: [
            {
              symbol: 'BTCUSDT',
              minTs: '2024-01-01T00:00:00.000Z',
              maxTs: '2024-06-01T00:00:00.000Z',
              minTime: 1_704_067_200,
              maxTime: 1_717_200_000,
              barCount: 200_000,
            },
          ],
        }),
      })
      return
    }

    if (path === '/candles' || path === '/v1/candles') {
      const limit = Number(url.searchParams.get('limit') || 500)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          symbol: url.searchParams.get('symbol') || 'BTCUSDT',
          timeframe: url.searchParams.get('timeframe') || '1h',
          bars: bars.slice(-Math.min(limit, bars.length)),
          nextBefore: null,
          hasMore: false,
        }),
      })
      return
    }

    if (path === '/sync-status' || path === '/v1/sync-status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'daily',
          ok: true,
          startedAt: '2024-06-01T01:00:00.000Z',
          finishedAt: '2024-06-01T01:01:00.000Z',
          results: { _total_bars: 1440, _symbol_count: 1, BTCUSDT: 1440 },
          error: null,
          message: null,
        }),
      })
      return
    }

    await route.fulfill({ status: 404, body: 'not mocked' })
  })
}

test.describe('smoke: Dados BD → chart → Executar', () => {
  test('mock API candles then backtest shows results', async ({ page }) => {
    await mockCandlesApi(page)

    await page.addInitScript((key) => {
      sessionStorage.setItem('veloz.candlesApiKey', key)
      // Fresh library so templates seed cleanly
      localStorage.removeItem('veloz.strategies.v1')
      localStorage.removeItem('veloz.runHistory.v1')
    }, API_KEY)

    await page.goto('/')

    // Topbar should show API candles (probe /health + /symbols)
    await expect(page.locator('.pill').filter({ hasText: /API candles/i })).toBeVisible({
      timeout: 15_000,
    })

    // Dados BD panel — sync status from mock
    await page.getByRole('button', { name: 'Dados BD' }).click()
    await expect(page.getByRole('heading', { name: /Dados Binance/i })).toBeVisible()
    await expect(page.getByText(/Último sucesso/i)).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Fechar' }).first().click()

    // Chart ATIVO includes BTC from BD coverage (label may be BTC/USDT)
    await expect(page.locator('.controls select').first()).toContainText(/BTC/, {
      timeout: 10_000,
    })

    // Pick SMA Cross template if needed, then Executar
    const strategySelect = page.getByLabel('Escolher estratégia')
    await strategySelect.selectOption({ label: 'SMA Cross 20/50' })

    await page.getByRole('button', { name: 'Executar backtest' }).click()

    await expect(page.getByRole('heading', { name: 'Resultados' })).toBeVisible()
    // Metrics row should leave the placeholder dashes after a run
    await expect(page.locator('.metric-value').first()).not.toHaveText('—', {
      timeout: 20_000,
    })
    await expect(page.getByText(/barras ·/i)).toBeVisible()
  })
})
