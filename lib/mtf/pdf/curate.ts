/**
 * Trims already-fetched dashboard query results down to the curated sizes
 * decided for the MTF Market Pulse PDF export. Every input is already sorted
 * by its query function (lib/mtf/queries.ts) in the order that matters for
 * that panel (e.g. sectors by book size descending) -- these just slice,
 * they never re-sort.
 */
import type {
  SectorBreakdownRow, ContinuousFunderRow, DivergenceRow, HeatmapNode, SymbolSnapshot,
} from "../queries";

const SECTOR_LIMIT = 10;
const FUNDER_LIMIT = 12;
const TURNOVER_LIMIT = 12;
const DIVERGENCE_LIMIT = 12;
const TOP_MOVERS_LIMIT = 15;

export const curateForPdf = {
  sectors: (rows: SectorBreakdownRow[]): SectorBreakdownRow[] => rows.slice(0, SECTOR_LIMIT),
  continuousFunders: (rows: ContinuousFunderRow[]): ContinuousFunderRow[] => rows.slice(0, FUNDER_LIMIT),
  turnoverLeaders: (rows: SymbolSnapshot[]): SymbolSnapshot[] => rows.slice(0, TURNOVER_LIMIT),
  divergence: (rows: DivergenceRow[]): DivergenceRow[] => rows.slice(0, DIVERGENCE_LIMIT),
  topMovers: (rows: HeatmapNode[]): HeatmapNode[] => rows.slice(0, TOP_MOVERS_LIMIT),
};
