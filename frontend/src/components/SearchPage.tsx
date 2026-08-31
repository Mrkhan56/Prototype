import React, { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, Filter, FileText, Calendar, Info } from "lucide-react";
import { format } from "date-fns";
import { searchDocuments, getSearchFacets } from "../api/client";
import type { SearchFilters, SearchResultItem } from "../types";
import { ClassificationLevel, DocType, CaseStatus } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CLASSIFICATION_BADGE: Record<string, string> = {
  UNCLASSIFIED: "bg-[#E8F7EE] text-[#137333] border-[#C2E7CE]",
  RESTRICTED:   "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]",
  CONFIDENTIAL: "bg-[#FFEDD5] text-[#9A3412] border-[#FDBA74]",
  SECRET:       "bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]",
};

function ClassBadge({ level }: { level: string }) {
  const style = CLASSIFICATION_BADGE[level] ?? CLASSIFICATION_BADGE["RESTRICTED"];
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style}`}>
      {level}
    </span>
  );
}

function DocTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block rounded-lg bg-slate-100 border border-[#E7E3DA] px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase">
      {type.replace(/_/g, " ")}
    </span>
  );
}

/** Renders HTML snippet from ts_headline (with <mark> tags) safely. */
function HighlightedSnippet({ html }: { html: string }) {
  return (
    <p
      className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed [&>mark]:bg-amber-200 [&>mark]:rounded [&>mark]:px-1"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ── Checkbox filter group ─────────────────────────────────────────────────────

function FilterCheckboxGroup({
  title,
  options,
  selected,
  onChange,
  counts,
}: {
  title: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  counts?: Record<string, number>;
}) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <fieldset className="mb-4">
      <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</legend>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="h-3.5 w-3.5 rounded border-[#E7E3DA] text-[#EAA037] focus:ring-[#EAA037] accent-[#EAA037]"
            />
            <span className="text-xs text-slate-700 group-hover:text-slate-900 font-medium">
              {opt.replace(/_/g, " ")}
            </span>
            {counts?.[opt] !== undefined && (
              <span className="ml-auto text-[10px] font-mono text-slate-400">{counts[opt]}</span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ── Skeleton result card ──────────────────────────────────────────────────────

function SkeletonResultCard() {
  return (
    <div className="animate-pulse card-casevault rounded-2xl p-4 space-y-2">
      <div className="h-4 w-3/4 rounded bg-slate-200" />
      <div className="h-3 w-1/2 rounded bg-slate-200" />
      <div className="h-3 w-full rounded bg-slate-100" />
    </div>
  );
}

// ── Main SearchPage Component ─────────────────────────────────────────────────

export const SearchPage: React.FC = () => {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [useSemantic, setUseSemantic] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Fetch facets for sidebar
  const facetsQuery = useQuery({
    queryKey: ["searchFacets"],
    queryFn: getSearchFacets,
    staleTime: 60_000,
  });

  // Execute search
  const searchQuery = useQuery({
    queryKey: ["search", submittedQuery, filters, page, useSemantic],
    queryFn: () => searchDocuments(submittedQuery, filters, page, 20, useSemantic),
    enabled: submittedQuery.length > 0,
  });

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.trim()) {
        setSubmittedQuery(query.trim());
        setPage(1);
      }
    },
    [query]
  );

  useEffect(() => {
    if (searchQuery.data && resultsRef.current) {
      resultsRef.current.focus();
    }
  }, [searchQuery.data]);

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
    if (submittedQuery) {
      setSubmittedQuery(submittedQuery);
    }
  };

  const clearFilters = () => {
    setFilters({});
    setPage(1);
  };

  const facets = facetsQuery.data;
  const results = searchQuery.data;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
          <span>Search Intelligence</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-semibold">Discovery & Facets</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-normal text-slate-900 tracking-tight">
          Search Intelligence
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Full-text OCR discovery, semantic similarity matching, and facet filtering.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── Sidebar Filters ──────────────────────────────────────────────── */}
        <aside
          className={`${sidebarOpen ? "w-full lg:w-72" : "hidden"} shrink-0 card-casevault rounded-2xl p-4 shadow-sm space-y-4`}
          aria-label="Search filters"
        >
          <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-3">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-[#EAA037]" aria-hidden="true" />
              Search Filters
            </h2>
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-[#92400E] hover:underline focus:outline-none"
              aria-label="Clear all filters"
            >
              Reset
            </button>
          </div>

          <FilterCheckboxGroup
            title="Case Type"
            options={["FIR", "COMPLAINT", "SUO_MOTO", "TRANSFER", "APPEAL"]}
            selected={filters.case_type ?? []}
            onChange={(v) => updateFilter("case_type", v.length ? v : undefined)}
            counts={facets?.case_types}
          />

          <FilterCheckboxGroup
            title="Document Type"
            options={Object.values(DocType)}
            selected={filters.doc_type ?? []}
            onChange={(v) => updateFilter("doc_type", v.length ? v : undefined)}
            counts={facets?.doc_types}
          />

          <FilterCheckboxGroup
            title="Case Status"
            options={Object.values(CaseStatus)}
            selected={filters.case_status ?? []}
            onChange={(v) => updateFilter("case_status", v.length ? v : undefined)}
            counts={facets?.case_statuses}
          />

          <FilterCheckboxGroup
            title="Classification"
            options={Object.values(ClassificationLevel)}
            selected={filters.classification_level ?? []}
            onChange={(v) => updateFilter("classification_level", v.length ? v : undefined)}
            counts={facets?.classification_levels}
          />

          {/* Date range */}
          <fieldset className="mb-4">
            <legend className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Date Range</legend>
            <div className="space-y-2">
              <label className="block">
                <span className="text-[11px] text-slate-500 font-medium">From</span>
                <input
                  type="date"
                  value={filters.date_from ?? ""}
                  onChange={(e) => updateFilter("date_from", e.target.value || undefined)}
                  className="mt-0.5 w-full rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-slate-500 font-medium">To</span>
                <input
                  type="date"
                  value={filters.date_to ?? ""}
                  onChange={(e) => updateFilter("date_to", e.target.value || undefined)}
                  className="mt-0.5 w-full rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
                />
              </label>
            </div>
          </fieldset>

          {/* Semantic search toggle */}
          <div className="border-t border-[#E7E3DA] pt-3">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={useSemantic}
                onChange={(e) => setUseSemantic(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[#E7E3DA] text-[#EAA037] focus:ring-[#EAA037] accent-[#EAA037]"
              />
              <span className="text-xs font-semibold text-slate-800">Use Semantic Vector Matching</span>
            </label>
            <p className="mt-1 flex items-start gap-1 text-[11px] text-slate-400">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#EAA037]" aria-hidden="true" />
              Finds conceptually related depositions and OCR records.
            </p>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 w-full space-y-4">
          {/* Search bar */}
          <form onSubmit={handleSearch} role="search">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search keywords, depositions, OCR excerpts, case tokens..."
                  className="w-full rounded-xl border border-[#E7E3DA] bg-white py-2.5 pl-10 pr-10 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:ring-2 focus:ring-[#EAA037]/50 focus:border-[#EAA037] focus:outline-none"
                  aria-label="Search documents"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => { setQuery(""); searchInputRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="btn-dark rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold shadow-sm"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-xl border border-[#E7E3DA] bg-white px-3 py-2.5 text-slate-600 hover:bg-slate-50 lg:hidden shadow-sm"
                aria-label={sidebarOpen ? "Hide filters" : "Show filters"}
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Results area */}
          <div ref={resultsRef} tabIndex={-1} aria-live="polite" aria-atomic="true">
            {searchQuery.isLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <SkeletonResultCard key={i} />)}
              </div>
            )}

            {results && (
              <p className="mb-3 text-xs text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-800">
                  {(results.page - 1) * results.page_size + 1}–
                  {Math.min(results.page * results.page_size, results.total_count)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-800">{results.total_count}</span>{" "}
                results for &quot;<span className="font-semibold text-[#92400E]">{results.query}</span>&quot;
              </p>
            )}

            {results && results.results.length > 0 && (
              <div className="space-y-3">
                {results.results.map((item: SearchResultItem) => (
                  <article
                    key={item.document_id}
                    className="card-casevault card-casevault-hover rounded-2xl p-4 space-y-2 cursor-pointer"
                    aria-label={`Search result: ${item.title}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 hover:text-[#DE942A] transition-colors">
                          {item.title}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-mono">
                            <FileText className="h-3 w-3 text-slate-400" />
                            Case: <span className="font-semibold text-slate-700">{item.case_number}</span>
                          </span>
                          <DocTypeBadge type={item.doc_type} />
                          <ClassBadge level={item.classification_level} />
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-slate-400" />
                            {format(new Date(item.created_at), "dd MMM yyyy")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {item.snippet && <HighlightedSnippet html={item.snippet} />}
                  </article>
                ))}
              </div>
            )}

            {results && results.results.length === 0 && (
              <div className="card-casevault rounded-2xl p-12 text-center">
                <Search className="mx-auto h-10 w-10 text-slate-300" aria-hidden="true" />
                <h3 className="mt-3 text-base font-bold text-slate-800">No documents found</h3>
                <p className="mt-1 text-xs text-slate-500">
                  No documents match your query. Try different keywords or adjust facet filters.
                </p>
              </div>
            )}

            {!submittedQuery && !searchQuery.isLoading && (
              <div className="card-casevault rounded-2xl p-12 text-center">
                <Search className="mx-auto h-10 w-10 text-[#EAA037]" aria-hidden="true" />
                <h3 className="mt-3 text-base font-bold text-slate-800">Search CaseVault Repository</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Type a keyword, case number, or text excerpt above to search across immutable legal filings and OCR extracts.
                </p>
              </div>
            )}

            {/* Pagination */}
            {results && results.total_pages > 1 && (
              <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Search results pagination">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-xl border border-[#E7E3DA] bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  ← Previous
                </button>
                <span className="text-xs text-slate-600 font-medium">
                  Page {results.page} of {results.total_pages}
                </span>
                <button
                  disabled={page >= results.total_pages}
                  onClick={() => setPage(page + 1)}
                  className="rounded-xl border border-[#E7E3DA] bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next →
                </button>
              </nav>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

