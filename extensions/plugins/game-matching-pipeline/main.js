// Game Matching Pipeline — the offline game matching pipeline.
//
// The pipeline is the consumer of `catalog-source` services. Given the scanned
// games that still need an identity, it resolves each one to a stable mediaId
// entirely from live data — there is deliberately no bundled catalog:
//
//   1. Auto-discovers every registered `catalog-source` service via ctx.discover
//      and calls its data.resolve for the still-unmatched requests. Keyed
//      sources (whose protocol matches an external id the game already carries,
//      e.g. a numeric Steam appid) are consulted before fuzzy title-search
//      sources, so a deterministic source wins when it can. Adding a data
//      source = dropping in a new plugin that registers `catalog-source` — the
//      pipeline finds it automatically, no config.
//
//   2. Every cross-store copy of a game collapses to one canonical identity
//      (the deterministic keyed source answer wins), so "Rocket League" on Epic
//      and Steam both resolve to the same mediaId.
//
//   3. Anything still unmatched self-matches to `platform:sourceGameId` with
//      the game's own artwork, so a scan is never left hanging offline.
//
// The desktop orchestrator persists the returned candidates and emits progress;
// it does not match games itself.

const { makeMatchingPipeline } = require('../shared/catalog');

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Game Matching Pipeline loaded (auto-discovers catalog sources)');
  },

  data: makeMatchingPipeline(),
};
