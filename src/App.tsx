import { useState, useEffect, useMemo } from "react";

// Robust number cleaner
function parseNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val).trim();
  if (!str || str.toUpperCase().includes("N/A") || str.toUpperCase().includes("VALUE")) return 0;

  if (/b$/i.test(str)) {
    const n = parseFloat(str.replace(/[$,bB ]/g, ""));
    return isNaN(n) ? 0 : n * 1_000_000_000;
  }
  if (/m$/i.test(str)) {
    const n = parseFloat(str.replace(/[$,mM ]/g, ""));
    return isNaN(n) ? 0 : n * 1_000_000;
  }
  if (/k$/i.test(str)) {
    const n = parseFloat(str.replace(/[$,kK ]/g, ""));
    return isNaN(n) ? 0 : n * 1_000;
  }

  const cleaned = str.replace(/[$, "]/g, "").replace("%", "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePayoutRatio(val: any): number {
  const num = parseNumber(val);
  return num > 1 ? num / 100 : num;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function App() {
  const [ticker, setTicker] = useState("");
  const [page, setPage] = useState("home");
  const [engineData, setEngineData] = useState<string[][]>([]);
  const [portfolioData, setPortfolioData] = useState<string[][]>([]);

  function formatCurrency(val: number) {
    return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatMarketCap(val: any) {
    const num = parseNumber(val);
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(0)}M`;
    return `$${num.toLocaleString()}`;
  }

  function formatVolume(val: any) {
    const num = parseNumber(val);
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toLocaleString();
  }

  const ENGINE_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRZQ9SrSDn-mxLZUQEgfQBXbsXvkNZKRJXVfvOlFrL_WZyStAPnRHf4B-J3VfIoqFbubD2mophz8_HI/pub?gid=0&single=true&output=csv";

  const PORTFOLIO_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRZQ9SrSDn-mxLZUQEgfQBXbsXvkNZKRJXVfvOlFrL_WZyStAPnRHf4B-J3VfIoqFbubD2mophz8_HI/pub?gid=1252023650&single=true&output=csv";

  useEffect(() => {
    fetch(ENGINE_URL)
      .then((res) => res.text())
      .then((text) => {
        const lines = text.trim().split(/\r?\n/);
        setEngineData(lines.map(parseCSVLine));
      })
      .catch((err) => console.error("Error loading Engine tab:", err));
  }, []);

  useEffect(() => {
    fetch(PORTFOLIO_URL)
      .then((res) => res.text())
      .then((text) => {
        const lines = text.trim().split(/\r?\n/);
        setPortfolioData(lines.map(parseCSVLine));
      })
      .catch((err) => console.error("Error loading Portfolio tab:", err));
  }, []);

  // --- ENGINE DATA PROCESSING ---
  const stockRows = useMemo(() => {
    return engineData
      .slice(1)
      .filter((row) => row[0] && row[0].trim().length > 0 && !row[0].toUpperCase().includes("TICKER"));
  }, [engineData]);

  const universeCount = stockRows.length;

  function checkRules(row: string[]) {
    if (!row || row.length < 7) {
      return {
        ticker: "",
        companyName: "",
        price: "N/A",
        cap: 0,
        vol: 0,
        divYears: 0,
        payout: 1,
        dividendPass: false,
        payoutPass: false,
        marketCapPass: false,
        volumePass: false,
        isFortress: false,
      };
    }

    const t = row[0] || "";
    const companyName = row[1] || "";
    const price = row[2] || "N/A";
    const cap = parseNumber(row[3]);
    const vol = parseNumber(row[4]);
    const divYears = parseNumber(row[5]);
    const payout = parsePayoutRatio(row[6]);

    const dividendPass = divYears >= 15;
    const payoutPass = payout <= 0.55 && payout > 0;
    const marketCapPass = cap >= 500_000_000;
    const volumePass = vol >= 2_000_000;
    const sheetFinalPass = row[10] && (row[10].toUpperCase() === "PASS" || row[10].toUpperCase() === "TRUE");

    const isFortress = (dividendPass && payoutPass && marketCapPass && volumePass) || Boolean(sheetFinalPass);

    return {
      ticker: t,
      companyName,
      price,
      cap,
      vol,
      divYears,
      payout,
      dividendPass,
      payoutPass,
      marketCapPass,
      volumePass,
      isFortress,
    };
  }

  const fortressStocks = useMemo(
    () => stockRows.filter((r) => checkRules(r).isFortress),
    [stockRows]
  );
  const fortressCount = fortressStocks.length;

  const passRate =
    universeCount > 0
      ? ((fortressCount / universeCount) * 100).toFixed(1)
      : "0.0";

  const divGrowthCount = stockRows.filter((r) => checkRules(r).dividendPass).length;
  const payoutCount = stockRows.filter((r) => checkRules(r).payoutPass).length;
  const marketCapCount = stockRows.filter((r) => checkRules(r).marketCapPass).length;
  const volumeCount = stockRows.filter((r) => checkRules(r).volumePass).length;

  // --- PORTFOLIO DATA PROCESSING ---
  const rawPortfolioRows = useMemo(() => {
    return portfolioData.slice(1).filter((r) => r[0] && r[0].trim().length > 0);
  }, [portfolioData]);

  const holdings = useMemo(() => {
    return rawPortfolioRows.filter((r) => {
      const firstCell = r[0].toUpperCase();
      return !firstCell.includes("TOTAL") && !firstCell.includes("CASH") && !firstCell.includes("DIVIDEND");
    });
  }, [rawPortfolioRows]);

  const totalStockValue = useMemo(() => {
    return holdings.reduce((sum, r) => sum + parseNumber(r[4]), 0);
  }, [holdings]);

  const annualDividendIncome = useMemo(() => {
    return holdings.reduce((sum, r) => sum + parseNumber(r[7]), 0);
  }, [holdings]);

  const cashBalance = 3921.58;
  const q3Dividends = annualDividendIncome > 0 ? annualDividendIncome / 4 : 411.20;
  const trueTotalValue = totalStockValue + cashBalance + q3Dividends;
  const startingCapital = 100000.0;
  const totalGainDollars = trueTotalValue - startingCapital;
  const totalGainPct = (totalGainDollars / startingCapital) * 100;

  const stockRow = stockRows.find((row) => row[0].toUpperCase() === ticker.trim().toUpperCase());
  const searchedRules = stockRow ? checkRules(stockRow) : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-slate-950 py-10 px-4 text-slate-100">
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl">
        {/* Main Branding Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            StoneBuilt Capital V4
          </h1>

          <div className="text-amber-400 font-semibold text-2xl">
            Cash Fortress
          </div>

          <div className="text-slate-400 text-sm">
            A Rules-Based Dividend Growth Screening Methodology
          </div>

          <div className="h-1 w-20 bg-amber-500 rounded-full mt-1 mb-2" />

          {/* Navigation Bar */}
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {[
              { id: "home", label: "HOME" },
              { id: "portfolio", label: "Paper Portfolio" },
              { id: "valuation", label: "Valuation" },
              { id: "summary", label: "Summary" },
              { id: "about", label: "About" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPage(tab.id)}
                className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-all duration-150 ${
                  page === tab.id
                    ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                    : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Global Summary Stats Row */}
        <div className="grid grid-cols-3 gap-3 w-full">
          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 text-center">
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Universe
            </div>
            <div className="text-2xl font-bold text-white mt-1">
              {universeCount}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 text-center">
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Cash Fortress
            </div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">
              {fortressCount}
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/90 border border-slate-800 p-4 text-center">
            <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Pass Rate
            </div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {passRate}%
            </div>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="w-full rounded-xl bg-slate-900/90 border border-slate-800 p-6 shadow-2xl">
          {/* 1. HOME TAB */}
          {page === "home" && (
            <div>
              <div className="border-b border-slate-800 pb-4 mb-6">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                  Stock Screener
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter any stock ticker to test against the 4 Cash Fortress rules.
                </p>
              </div>

              <div className="flex flex-col gap-2 mb-6">
                <label
                  htmlFor="ticker"
                  className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
                >
                  Stock Ticker
                </label>
                <input
                  id="ticker"
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. AAPL, JNJ, PG, HD"
                  maxLength={10}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-mono font-semibold text-white placeholder:text-slate-600 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                />
              </div>

              {ticker ? (
                stockRow && searchedRules ? (
                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-5 space-y-3">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-mono font-bold text-white">
                            {searchedRules.ticker}
                          </span>
                          <span className="text-sm text-slate-400">
                            {searchedRules.companyName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">
                          Price: {searchedRules.price}
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                          searchedRules.isFortress
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {searchedRules.isFortress ? "Cash Fortress Pass" : "Failed Screen"}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-slate-300 pt-1">
                      <div className="flex justify-between items-center">
                        <span>Dividend Growth ({searchedRules.divYears} yrs / &ge;15 yrs)</span>
                        <span className={searchedRules.dividendPass ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {searchedRules.dividendPass ? "PASS" : "FAIL"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span>Payout Ratio ({(searchedRules.payout * 100).toFixed(1)}% / &le;55%)</span>
                        <span className={searchedRules.payoutPass ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {searchedRules.payoutPass ? "PASS" : "FAIL"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span>Market Cap ({formatMarketCap(searchedRules.cap)} / &ge;$500M)</span>
                        <span className={searchedRules.marketCapPass ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {searchedRules.marketCapPass ? "PASS" : "FAIL"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span>Volume ({formatVolume(searchedRules.vol)} / &ge;2M)</span>
                        <span className={searchedRules.volumePass ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                          {searchedRules.volumePass ? "PASS" : "FAIL"}
                        </span>
                      </div>

                      <div className="border-t border-slate-800 pt-3 mt-3 flex justify-between items-center font-bold">
                        <span className="text-white">Overall Screen Result:</span>
                        <span className={searchedRules.isFortress ? "text-emerald-400 text-base" : "text-rose-400 text-base"}>
                          {searchedRules.isFortress ? "PASS" : "FAIL"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    Stock &ldquo;{ticker}&rdquo; not found in database.
                  </div>
                )
              ) : (
                <div className="text-center py-6 text-slate-500 text-sm">
                  Enter a ticker symbol above to view screen results.
                </div>
              )}
            </div>
          )}

          {/* 2. LIVE $100K PAPER PORTFOLIO TAB */}
          {page === "portfolio" && (
            <div>
              <div className="border-b border-slate-800 pb-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                      $100,000 Cash Fortress Portfolio
                    </h2>
                    <p className="text-xs text-amber-400 font-semibold mt-0.5">
                      ⚠️ Live Paper Trading Benchmark (Webull) • Inception: June 8, 2026
                    </p>
                  </div>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-bold">
                    PAPER ACCOUNT
                  </span>
                </div>
              </div>

              {/* The 4 Big Scorecard Cards */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    True Account Value
                  </div>
                  <div className="text-2xl font-bold font-mono text-white mt-1">
                    {formatCurrency(trueTotalValue)}
                  </div>
                  <div className="text-xs font-semibold text-emerald-400 mt-1">
                    +{formatCurrency(totalGainDollars)} ({totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(2)}%)
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    Q3 Dividends Earned 💰
                  </div>
                  <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    +{formatCurrency(q3Dividends)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Ignored by Webull (June 8 - Sept)
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    Annual Passive Income
                  </div>
                  <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                    {formatCurrency(annualDividendIncome)}/yr
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    ~{formatCurrency(annualDividendIncome / 12)} / month
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    Cash Cushion
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-300 mt-1">
                    {formatCurrency(cashBalance)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Uninvested Webull reserve
                  </div>
                </div>
              </div>

              {/* Breakdown Subtitle */}
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-400 mb-3 px-1">
                28 Equal-Weight Paper Holdings
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-800 pb-2 px-3">
                <div className="col-span-3">Stock</div>
                <div className="col-span-3 text-right">Shares</div>
                <div className="col-span-3 text-right">Value</div>
                <div className="col-span-3 text-right">Yield / Inc</div>
              </div>

              {/* Dynamic Holdings List */}
              <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
                {holdings.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Loading live portfolio positions...
                  </div>
                ) : (
                  holdings.map((row) => {
                    const t = row[0];
                    const name = row[1];
                    const shares = parseNumber(row[2]);
                    const mktValue = parseNumber(row[4]);
                    const yieldPct = parseNumber(row[6]);
                    const income = parseNumber(row[7]);

                    return (
                      <div
                        key={t}
                        className="grid grid-cols-12 py-2.5 px-3 hover:bg-slate-800/40 text-sm items-center transition-colors"
                      >
                        <div className="col-span-3">
                          <div className="font-mono font-bold text-white text-sm">{t}</div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[130px]">{name}</div>
                        </div>

                        <div className="col-span-3 text-right font-mono text-slate-300 text-xs">
                          {shares} shs
                        </div>

                        <div className="col-span-3 text-right font-mono font-semibold text-white text-xs">
                          {formatCurrency(mktValue)}
                        </div>

                        <div className="col-span-3 text-right font-mono text-xs">
                          <span className="text-amber-400">{yieldPct.toFixed(2)}%</span>
                          <div className="text-[11px] text-slate-400 font-normal">
                            +{formatCurrency(income)}/yr
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 3. VALUATION ENGINE TAB */}
          {page === "valuation" && (
            <div>
              <div className="border-b border-slate-800 pb-4 mb-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                      Cash Fortress Portfolio
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Elite dividend compounders meeting all 4 Cash Fortress rules.
                    </p>
                  </div>
                  <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full font-semibold">
                    {fortressCount} Stocks Qualified
                  </span>
                </div>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {fortressStocks.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No qualifying Cash Fortress stocks found yet.
                  </div>
                ) : (
                  fortressStocks.map((stock) => {
                    const info = checkRules(stock);
                    return (
                      <div
                        key={stock[0]}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 hover:border-slate-700 transition"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-base text-white">
                              {info.ticker}
                            </span>
                            <span className="text-xs text-slate-400 truncate max-w-[180px]">
                              {info.companyName}
                            </span>
                          </div>

                          <span className="text-xs px-2 py-0.5 rounded font-bold border bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                            QUALIFIED
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-900 font-mono">
                          <div>Price: <span className="text-white">{info.price}</span></div>
                          <div>Div Yrs: <span className="text-amber-400">{info.divYears}y</span></div>
                          <div>Payout: <span className="text-white">{(info.payout * 100).toFixed(0)}%</span></div>
                          <div>Cap: <span className="text-white">{formatMarketCap(info.cap)}</span></div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 4. SUMMARY / STRATEGY TAB */}
          {page === "summary" && (
            <div>
              <div className="border-b border-slate-800 pb-4 mb-5">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                  StoneBuilt Methodology
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  The Cash Fortress screening funnel and rule-by-rule attrition.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                  Screening Funnel
                </div>

                <div className="space-y-2 text-xs font-semibold">
                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="text-white text-sm">1. Starting Universe</div>
                      <div className="text-slate-400 font-normal">All screened dividend growth candidates (SCHD)</div>
                    </div>
                    <span className="text-sm font-bold font-mono text-white">{universeCount}</span>
                  </div>

                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="text-white text-sm">2. Consecutive Growth Streak (&ge; 15 Yrs)</div>
                      <div className="text-slate-400 font-normal">Column F: Survives cycles, recessions, bear markets</div>
                    </div>
                    <span className="text-sm font-bold font-mono text-amber-400">{divGrowthCount}</span>
                  </div>

                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="text-white text-sm">3. Safe Payout Ratio (&le; 55%)</div>
                      <div className="text-slate-400 font-normal">Column G: Generous earnings buffer</div>
                    </div>
                    <span className="text-sm font-bold font-mono text-amber-400">{payoutCount}</span>
                  </div>

                  <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex justify-between items-center">
                    <div>
                      <div className="text-white text-sm">4. Size & Liquidity (&ge;$500M / &ge;2M Vol)</div>
                      <div className="text-slate-400 font-normal">Columns D & E: No micro-caps, easy liquidity</div>
                    </div>
                    <span className="text-sm font-bold font-mono text-amber-400">
                      {Math.min(marketCapCount, volumeCount)}
                    </span>
                  </div>

                  <div className="p-3.5 bg-emerald-950/30 border border-emerald-500/40 rounded-lg flex justify-between items-center mt-3">
                    <div>
                      <div className="text-emerald-400 text-sm font-bold">5. The Cash Fortress Selection</div>
                      <div className="text-slate-400 font-normal">Elite companies qualifying on all criteria</div>
                    </div>
                    <span className="text-base font-bold font-mono text-emerald-400">{fortressCount}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5. ABOUT TAB */}
          {page === "about" && (
            <div className="space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-lg font-bold text-white uppercase tracking-wider">
                  About StoneBuilt Capital
                </h2>
                <p className="text-xs text-amber-400 font-semibold mt-0.5">
                  The Story Behind the Rules • Real Life, Real Discipline
                </p>
              </div>

              <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
                <p>
                  I am 58 years old, and for the past 16 years, I have made my living driving a sanitation truck. It is honest, hard, physical work—and it teaches you very quickly that you do not have the time or luxury to gamble your hard-earned savings on Wall Street hype, crypto tokens, or confusing financial jargon.
                </p>

                <p>
                  Most retail stock screeners hand you 50 overwhelming metrics—Discounted Cash Flows, WACC, complex beta sensitivity tables—that leave everyday working folks paralyzed. I created <strong>StoneBuilt Capital</strong> with a simple mission: <strong>boil down dividend investing to common sense rules that protect your capital and generate reliable passive cash flow.</strong>
                </p>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2">
                  <span className="text-amber-400 font-bold block text-sm">
                    The 4 Cash Fortress Rules:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                    <li><strong>15+ Consecutive Years of Dividend Growth:</strong> Survives recessions and bear markets.</li>
                    <li><strong>Payout Ratio &le; 55%:</strong> Earnings safely cover the cash payout with a wide margin.</li>
                    <li><strong>Market Cap &ge; $500M:</strong> Established, durable companies (no risky micro-caps).</li>
                    <li><strong>Daily Volume &ge; 2M Shares:</strong> Smooth, reliable liquidity for retail investors.</li>
                  </ul>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
                  <span className="text-emerald-400 font-bold block text-sm">
                    The $100k Live Paper Trading Experiment:
                  </span>
                  <p className="text-xs text-slate-300">
                    To test this methodology with 100% transparency, I launched an equal-weight <strong>$100,000 paper trading benchmark on Webull on June 8, 2026</strong> across the 28 qualifying Cash Fortress companies. 
                  </p>
                  <p className="text-xs text-slate-300">
                    Standard brokers ignore dividend payments in paper accounts. StoneBuilt Capital tracks both capital appreciation <em>and</em> the actual dividend cash flow collected, proving real-world total return.
                  </p>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-center space-y-2">
                  <div className="text-white font-semibold text-sm">
                    Follow the Weekly $100k Journey on Substack
                  </div>
                  <p className="text-xs text-slate-400">
                    Get weekly portfolio recaps, dividend alerts, and see which Cash Fortress stocks are trading "On Sale" near their 52-week lows.
                  </p>
                  <a
                    href="https://stonebuiltcapital.substack.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-md shadow-amber-500/20"
                  >
                    Read the Weekly Newsletter &rarr;
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
