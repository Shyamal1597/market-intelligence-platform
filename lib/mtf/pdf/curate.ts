/**
 * Trims already-fetched dashboard query results down to the curated sizes
 * decided for the MTF Market Pulse PDF export. Every input is already sorted
 * by its query function (lib/mtf/queries.ts) in the order that matters for
 * that panel (e.g. sectors by book size descending) -- these just slice,
 * they never re-sort.
 */
import type {
  SectorBreakdownRow, ContinuousFunderRow, DivergenceRow, HeatmapNode,
} from "../queries";

const SECTOR_LIMIT = 10;
// The reference report's whole point is these two "100 stocks" tables -- the client PDF
// mirrors that depth here, unlike the other panels which stay tightly curated.
const FUNDER_LIMIT = 100;
const DIVERGENCE_LIMIT = 12;
const TOP_MOVERS_LIMIT = 15;

export const curateForPdf = {
  sectors: (rows: SectorBreakdownRow[]): SectorBreakdownRow[] => rows.slice(0, SECTOR_LIMIT),
  continuousFunders: (rows: ContinuousFunderRow[]): ContinuousFunderRow[] => rows.slice(0, FUNDER_LIMIT),
  divergence: (rows: DivergenceRow[]): DivergenceRow[] => rows.slice(0, DIVERGENCE_LIMIT),
  topMovers: (rows: HeatmapNode[]): HeatmapNode[] => rows.slice(0, TOP_MOVERS_LIMIT),
};
