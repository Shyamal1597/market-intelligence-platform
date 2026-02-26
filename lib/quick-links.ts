export interface QuickLink {
  name: string;
  url: string;
  description: string;
  favicon?: string;
}

export interface LinkSection {
  title: string;
  icon: string;
  links: QuickLink[];
}

export const QUICK_LINKS: LinkSection[] = [
  {
    title: "NSE / BSE",
    icon: "Building2",
    links: [
      { name: "NSE India", url: "https://www.nseindia.com", description: "National Stock Exchange — live data, F&O, equity" },
      { name: "BSE India", url: "https://www.bseindia.com", description: "Bombay Stock Exchange — filings, prices, IPOs" },
      { name: "NSE Corporate Filings", url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements", description: "Company announcements on NSE" },
      { name: "BSE Corporate Filings", url: "https://www.bseindia.com/corporates/ann.html", description: "Company announcements on BSE" },
      { name: "NSE F&O Market", url: "https://www.nseindia.com/market-data/live-equity-market", description: "Live F&O market data" },
    ],
  },
  {
    title: "SEBI & Regulatory",
    icon: "Scale",
    links: [
      { name: "SEBI", url: "https://www.sebi.gov.in", description: "Securities and Exchange Board of India" },
      { name: "SEBI Circulars", url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=2&smid=0", description: "Latest SEBI circulars and regulations" },
      { name: "RBI", url: "https://www.rbi.org.in", description: "Reserve Bank of India — monetary policy, data" },
      { name: "MCA21", url: "https://www.mca.gov.in", description: "Ministry of Corporate Affairs — company records" },
      { name: "AMFI", url: "https://www.amfiindia.com", description: "Association of Mutual Funds in India" },
    ],
  },
  {
    title: "Research & Screeners",
    icon: "Search",
    links: [
      { name: "Screener.in", url: "https://www.screener.in", description: "Financial data, ratios, and stock screening" },
      { name: "Trendlyne", url: "https://trendlyne.com", description: "Advanced stock screener and analytics" },
      { name: "Tijori Finance", url: "https://tijorifinance.com", description: "Deep financial analysis and company data" },
      { name: "Tickertape", url: "https://www.tickertape.in", description: "Stock research and portfolio analytics" },
      { name: "Chittorgarh", url: "https://www.chittorgarh.com", description: "IPO data, grey market premium, allotments" },
    ],
  },
  {
    title: "Data & Analytics",
    icon: "BarChart2",
    links: [
      { name: "Trading Economics", url: "https://tradingeconomics.com/india", description: "Macro economic indicators — India and global" },
      { name: "FRED", url: "https://fred.stlouisfed.org", description: "Federal Reserve Economic Data — free macro data" },
      { name: "NSDL FII Data", url: "https://www.fpi.nsdl.co.in/web/Reports/Yearwise.aspx", description: "FPI/FII investment data by year" },
      { name: "Moneycontrol Markets", url: "https://www.moneycontrol.com/markets/", description: "Market data, IPOs, mutual funds" },
      { name: "Yahoo Finance India", url: "https://finance.yahoo.com/quote/%5ENSEI/", description: "Nifty 50 live chart and data" },
    ],
  },
  {
    title: "Global Markets",
    icon: "Globe",
    links: [
      { name: "Bloomberg Markets", url: "https://www.bloomberg.com/markets", description: "Global financial news and data" },
      { name: "Financial Times", url: "https://www.ft.com/markets", description: "FT markets section — global analysis" },
      { name: "Reuters Markets", url: "https://www.reuters.com/markets/", description: "Breaking markets news from Reuters" },
      { name: "CME FedWatch", url: "https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html", description: "Fed rate decision probability tracker" },
      { name: "CNBC Markets", url: "https://www.cnbc.com/markets/", description: "US and global market updates" },
    ],
  },
];
