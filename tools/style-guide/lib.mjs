// BiteShark Design Style Guide CLI Library Wrapper (`tools/style-guide/lib.mjs`)
// Re-exports the shared zero-dependency Style Guide engine from `lib/style-guide-core.js`.

export {
  STYLE_GUIDE_GENERATOR_VERSION,
  STYLE_GUIDE_SCHEMA_REL_PATH,
  STYLE_GUIDE_DECISIONS_REL_PATH,
  STYLE_GUIDE_DIR_REL_PATH,
  normalizePlaceholderCandidate,
  isPlaceholderString,
  containsPlaceholderOrBlankLeaf,
  anchorSlug,
  formatDecisionValueCell,
  formatExpectedAnswerSummary,
  validateValueAgainstExpectedSpec,
  validateStyleGuideData,
  computeCompletionStats,
  renderStyleGuideMarkdownFiles,
  loadStyleGuideDecisions,
  generateStyleGuideDocs,
  validateStyleGuideWorkspace
} from '../../lib/style-guide-core.js';
