const BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  getStats: () => request('/api/stats'),
  getResults: () => request('/api/results'),
  getHistory: () => request('/api/history'),
  getPartners: (category) => request(`/api/partners/${category}`),

  runGapFill: (postIds) =>
    request('/api/gap-fill/run', { method: 'POST', body: JSON.stringify({ postIds }) }),

  getGapFillStatus: () => request('/api/gap-fill/status'),

  stopGapFill: () => request('/api/gap-fill/stop', { method: 'POST' }),

  updateResult: (id, updates) =>
    request(`/api/results/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),

  bulkStatus: (ids, status) =>
    request('/api/results/bulk-status', { method: 'POST', body: JSON.stringify({ ids, status }) }),

  regenerateFeatureText: (id) =>
    request(`/api/results/${id}/regenerate`, { method: 'POST' }),

  apply: (ids) =>
    request('/api/apply', { method: 'POST', body: JSON.stringify({ ids }) }),

  rollback: (historyId) =>
    request(`/api/rollback/${historyId}`, { method: 'POST' }),

  auditDuplicates: (postIds) =>
    request('/api/audit/duplicates', { method: 'POST', body: JSON.stringify({ postIds }) }),

  removeCta: (postId, { partner, featureText, sectionHeading, occurrence }) =>
    request('/api/audit/remove-cta', { method: 'POST', body: JSON.stringify({ postId, partner, featureText, sectionHeading, occurrence }) }),

  removeAllDuplicates: (duplicates) =>
    request('/api/audit/remove-all-duplicates', { method: 'POST', body: JSON.stringify({ duplicates }) }),

  getScoring: () => request('/api/scoring'),
  refreshScoring: () => request('/api/scoring/refresh', { method: 'POST' }),
  getScoringStatus: () => request('/api/scoring/status'),

  // リンク張替ツール
  getLinkReplacerRules: () => request('/api/link-replacer/rules'),
  previewLinkReplace: (urls, partner) =>
    request('/api/link-replacer/preview', { method: 'POST', body: JSON.stringify({ urls, partner }) }),
  applyLinkReplace: (urls, partner) =>
    request('/api/link-replacer/apply', { method: 'POST', body: JSON.stringify({ urls, partner }) }),

  getAllPartners: () => request('/api/partners'),

  updatePartner: (category, slug, data) =>
    request(`/api/partners/${category}/${slug}`, { method: 'PUT', body: JSON.stringify(data) }),

  deletePartner: (category, slug) =>
    request(`/api/partners/${category}/${slug}`, { method: 'DELETE' }),

  // 順位モニタリング
  getMonitorStatus: () => request('/api/monitor/status'),
  getMonitorArticles: () => request('/api/monitor/articles'),
  getMonitorTimeline: (postId, days = 90) => request(`/api/monitor/articles/${postId}/timeline?days=${days}`),
  getMonitorKwHistory: (postId, top = 10) => request(`/api/monitor/articles/${postId}/kw-history?top=${top}`),
  getMonitorAffBreakdown: (postId, days = 90) => request(`/api/monitor/articles/${postId}/affiliate-breakdown?days=${days}`),
  analyzeArticle: (postId, days = 30) => request(`/api/monitor/articles/${postId}/analyze`, { method: 'POST', body: JSON.stringify({ days }) }),
  getMonitorComments: (postId, limit = 20) => request(`/api/monitor/articles/${postId}/comments?limit=${limit}`),
  getScraperSettings: () => request('/api/monitor/scraper/settings'),
  updateScraperSettings: (payload) => request('/api/monitor/scraper/settings', { method: 'POST', body: JSON.stringify(payload) }),
  runScraper: (payload = {}) => request('/api/monitor/scraper/run', { method: 'POST', body: JSON.stringify(payload) }),
  getScraperStatus: () => request('/api/monitor/scraper/status'),
  refreshMonitor: () => request('/api/monitor/refresh', { method: 'POST' }),
  startMonitorBackfill: () => request('/api/monitor/backfill/start', { method: 'POST' }),
  runKwSnapshot: () => request('/api/monitor/kw-snapshot', { method: 'POST' }),
  runWpMetaBackfill: () => request('/api/monitor/wp-meta', { method: 'POST' }),
  getMonitorJobs: (limit = 20) => request(`/api/monitor/jobs?limit=${limit}`),

  // ============================================================
  // SEO リライトシステム — マスター管理 API
  // ============================================================
  listAnnotations: (params = {}) => request(`/api/masters/annotations?${new URLSearchParams(params)}`),
  getAnnotation: (id) => request(`/api/masters/annotations/${id}`),
  createAnnotation: (body) => request('/api/masters/annotations', { method: 'POST', body: JSON.stringify(body) }),
  updateAnnotation: (id, body) => request(`/api/masters/annotations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteAnnotation: (id) => request(`/api/masters/annotations/${id}`, { method: 'DELETE' }),

  listRules: (params = {}) => request(`/api/masters/rules?${new URLSearchParams(params)}`),
  getRule: (id) => request(`/api/masters/rules/${id}`),
  createRule: (body) => request('/api/masters/rules', { method: 'POST', body: JSON.stringify(body) }),
  updateRule: (id, body) => request(`/api/masters/rules/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteRule: (id) => request(`/api/masters/rules/${id}`, { method: 'DELETE' }),

  listChecklist: (params = {}) => request(`/api/masters/checklist?${new URLSearchParams(params)}`),
  updateChecklistItem: (id, body) => request(`/api/masters/checklist/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  listAuditLog: (params = {}) => request(`/api/masters/audit-log?${new URLSearchParams(params)}`),
  getCompletenessSummary: () => request('/api/masters/completeness-summary'),

  importMasters: (table, rows) =>
    request('/api/masters/import', { method: 'POST', body: JSON.stringify({ table, rows }) }),
  exportMastersUrl: (table, params = {}) => {
    const qs = new URLSearchParams({ table, ...params });
    return `${BASE}/api/masters/export?${qs}`;
  },

  // ============================================================
  // リライトシステム — 対象選定 (Phase 4 MVP Phase 1)
  // ============================================================
  getRewriteCandidates: (axis, limit = 20) =>
    request(`/api/rewrite/queue?axis=${encodeURIComponent(axis)}&limit=${limit}`),
  getRewriteQueue: (status) =>
    request(`/api/rewrite/queue${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  createRewriteQueue: (body) =>
    request('/api/rewrite/queue', { method: 'POST', body: JSON.stringify(body) }),
  updateRewriteQueue: (id, body) =>
    request(`/api/rewrite/queue/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};
