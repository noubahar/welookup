function normalizeQuery(value) {
  if (!value) return "";
  let q = String(value).trim().toLowerCase();
  q = q.replace(/^https?:\/\//, "");
  q = q.replace(/^www\./, "");
  q = q.split("/")[0];
  q = q.split("?")[0];
  q = q.split("#")[0];
  return q.trim();
}

/** Lowercase alphanumerics only — matches “Cuddle & Kind” ↔ “cuddleandkind”. */
function normalizeBroad(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "your",
  "our",
  "com",
  "www",
  "shop",
  "store",
  "online",
  "inc",
  "llc",
  "ltd",
  "myshopify",
]);

/**
 * Tokens for broad AND search (spaces, hyphens, etc.).
 * Splits “cuddle and kind”, “cuddle-and-kind”, URL path segments.
 */
function extractSearchTokens(rawQuery, normalizedHostQuery) {
  const blob = `${rawQuery} ${normalizedHostQuery}`.toLowerCase();
  const parts = blob
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const uniq = [];
  const seen = new Set();
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    uniq.push(p);
  }

  // “cuddleandkind” → try split on embedded “and” (e.g. Cuddle+Kind brand)
  if (uniq.length === 1) {
    const mono = uniq[0].replace(/[^a-z0-9]/g, "");
    const idx = mono.indexOf("and");
    if (
      idx >= 4 &&
      idx + 3 < mono.length &&
      mono.length >= 8
    ) {
      const a = mono.slice(0, idx);
      const b = mono.slice(idx + 3);
      if (a.length >= 2 && b.length >= 2) {
        return [a, b];
      }
    }
  }

  return uniq.slice(0, 6);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=180, s-maxage=180",
      "access-control-allow-origin": "*",
    },
  });
}

/** Final in-memory candidate cap before paging. */
const MAX_RESULTS = 100;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

/** Ranked substring pass returns this many best rows so we do not drop good hits before merge. */
const RANKED_SUBSTRING_RETURN_CAP = 200;

/** Escape `%` and `_` for SQL LIKE (bind with ESCAPE '\\'). */
function likeFragment(raw) {
  return String(raw)
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function mergeShopRows(priorityArrays, cap) {
  const seen = new Set();
  const out = [];
  for (const rows of priorityArrays) {
    if (!rows) continue;
    for (const row of rows) {
      if (!row?.id || seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

function appendDedup(base, extraRows, cap) {
  const seen = new Set(base.map((r) => r.id));
  const out = [...base];
  for (const row of extraRows || []) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}

const SHOP_SELECT = `SELECT
      s.id,
      s.title,
      s.description,
      s.platform,
      s.platform_domain,
      s.country_code,
      s.currency_code,
      s.language_code,
      s.location,
      s.created_at,
      s.state`;

async function searchExactDomain(env, query) {
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shop_domains d
    JOIN shops s ON s.id = d.shop_id
    WHERE d.domain = ?
    LIMIT 10`
  );
  const result = await stmt.bind(query).all();
  return result.results || [];
}

async function searchLikeDomain(env, query) {
  const frag = likeFragment(query);
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shop_domains d
    JOIN shops s ON s.id = d.shop_id
    WHERE d.domain LIKE ? ESCAPE '\\'
    LIMIT 16`
  );
  const result = await stmt.bind(`${frag}%`).all();
  return result.results || [];
}

async function searchContainsDomain(env, query) {
  const frag = likeFragment(query);
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shop_domains d
    JOIN shops s ON s.id = d.shop_id
    WHERE d.domain LIKE ? ESCAPE '\\'
    LIMIT 14`
  );
  const result = await stmt.bind(`%${frag}%`).all();
  return result.results || [];
}

async function searchExactPlatformDomain(env, query) {
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shops s
    WHERE lower(trim(coalesce(s.platform_domain,''))) = ?
    LIMIT 10`
  );
  const result = await stmt.bind(query).all();
  return result.results || [];
}

async function searchLikePlatformDomain(env, query) {
  const frag = likeFragment(query);
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shops s
    WHERE lower(coalesce(s.platform_domain,'')) LIKE ? ESCAPE '\\'
    LIMIT 16`
  );
  const result = await stmt.bind(`${frag}%`).all();
  return result.results || [];
}

async function searchContainsPlatformDomain(env, query) {
  const frag = likeFragment(query);
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shops s
    WHERE lower(coalesce(s.platform_domain,'')) LIKE ? ESCAPE '\\'
    LIMIT 14`
  );
  const result = await stmt.bind(`%${frag}%`).all();
  return result.results || [];
}

async function searchTitle(env, query) {
  const frag = likeFragment(query);
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shops s
    WHERE lower(s.title) LIKE ? ESCAPE '\\'
    LIMIT 16`
  );
  const result = await stmt.bind(`${frag}%`).all();
  return result.results || [];
}

/** Title, name, cluster label, domain, and start of description — broader than title-only. */
const HAYSTACK_SQL = `lower(
  coalesce(s.title,'') || ' ' || coalesce(s.name,'') || ' ' ||
  coalesce(s.cluster_best_ranked,'') || ' ' || coalesce(s.platform_domain,'') || ' ' ||
  substr(coalesce(s.description,''), 1, 500)
)`;

/** Rank a small in-memory list: platform + title hits, then shorter title (brand-like). */
function rankShopRowsForNeedle(rows, needleLower) {
  const n = needleLower;
  const score = (r) => {
    const pf = String(r.platform_domain || "").toLowerCase();
    const tit = String(r.title || "").toLowerCase();
    let s = 0;
    if (pf.includes(`-${n}.myshopify.com`) || pf.endsWith(`-${n}.myshopify.com`)) s -= 8;
    else if (pf.includes(n)) s -= 4;
    if (tit.includes(n)) s -= 2;
    return s;
  };
  return [...rows].sort((a, b) => {
    const d = score(a) - score(b);
    if (d !== 0) return d;
    const la = String(a.platform_domain || "").length;
    const lb = String(b.platform_domain || "").length;
    if (la !== lb) return la - lb;
    return String(a.title || "").length - String(b.title || "").length;
  });
}

/**
 * Short substring queries: cap domain/platform fan-out, load those shops only, then rank in JS.
 * Avoids global ORDER BY over millions of haystack LIKE rows (very slow on D1).
 */
async function searchRankedSubstringCandidates(env, query) {
  const frag = likeFragment(query);
  const needle = query.toLowerCase();
  if (needle.length < 2) return [];

  const hyphenPat = `%-${frag}%`;
  const shopifySlugPat = `%-${frag}.myshopify.com`;
  /** Matches e.g. cuddle-and-kind.myshopify.com (hyphen + needle + dot). */
  const hyphenDotPat = `%-${frag}.%`;
  const domainKindDotLiteral = `${needle}.`;

  const [domainDotRes, shopifySlugRes, hyphenDotRes, domRes, slugRes, platRes] = await Promise.all([
    env.DB.prepare(
      `SELECT shop_id AS id FROM shop_domains
       WHERE instr(lower(domain), ?) > 0
       LIMIT 5000`
    )
      .bind(domainKindDotLiteral)
      .all(),
    env.DB.prepare(
      `SELECT id FROM shops
       WHERE lower(coalesce(platform_domain,'')) LIKE ? ESCAPE '\\'
       LIMIT 120`
    )
      .bind(shopifySlugPat)
      .all(),
    env.DB.prepare(
      `SELECT id FROM shops
       WHERE lower(coalesce(platform_domain,'')) LIKE ? ESCAPE '\\'
       LIMIT 120`
    )
      .bind(hyphenDotPat)
      .all(),
    env.DB.prepare(
      `SELECT DISTINCT shop_id AS id FROM shop_domains
       WHERE lower(domain) LIKE ? ESCAPE '\\'
       LIMIT 200`
    )
      .bind(`%${frag}%`)
      .all(),
    env.DB.prepare(
      `SELECT id FROM shops
       WHERE lower(coalesce(platform_domain,'')) LIKE ? ESCAPE '\\'
       LIMIT 120`
    )
      .bind(hyphenPat)
      .all(),
    env.DB.prepare(
      `SELECT id FROM shops
       WHERE lower(coalesce(platform_domain,'')) LIKE ? ESCAPE '\\'
       LIMIT 120`
    )
      .bind(`%${frag}%`)
      .all(),
  ]);

  const ids = [];
  const seen = new Set();
  const pushId = (v) => {
    if (v == null || seen.has(v)) return;
    seen.add(v);
    ids.push(v);
  };

  for (const r of domainDotRes.results || []) pushId(r.id);
  for (const r of shopifySlugRes.results || []) pushId(r.id);
  for (const r of hyphenDotRes.results || []) pushId(r.id);
  for (const r of domRes.results || []) pushId(r.id);
  for (const r of slugRes.results || []) pushId(r.id);
  for (const r of platRes.results || []) pushId(r.id);

  const idList = ids.slice(0, 1200);
  if (!idList.length) return [];

  const chunkSize = 80;
  const chunks = [];
  for (let i = 0; i < idList.length; i += chunkSize) {
    chunks.push(idList.slice(i, i + chunkSize));
  }

  const loads = await Promise.all(
    chunks.map((chunk) => {
      const ph = chunk.map(() => "?").join(",");
      return env.DB.prepare(`${SHOP_SELECT} FROM shops s WHERE s.id IN (${ph})`)
        .bind(...chunk)
        .all();
    })
  );

  const rows = loads.flatMap((load) => load.results || []);
  return rankShopRowsForNeedle(rows, needle).slice(0, RANKED_SUBSTRING_RETURN_CAP);
}

async function searchContainsHaystack(env, query) {
  const frag = likeFragment(query);
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shops s
    WHERE ${HAYSTACK_SQL} LIKE ? ESCAPE '\\'
    LIMIT 16`
  );
  const result = await stmt.bind(`%${frag}%`).all();
  return result.results || [];
}

/**
 * Every token must appear somewhere in the haystack (AND).
 * Single token: substring match, ordered by shorter title first (tighter brand-like hits).
 */
async function searchHaystackTokensAnd(env, tokens) {
  const cleaned = tokens
    .map((t) => String(t).toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 5);
  if (!cleaned.length) return [];

  if (cleaned.length === 1) {
    const rawTok = cleaned[0];
    const t = likeFragment(rawTok);
    const stmt = env.DB.prepare(
      `${SHOP_SELECT}
      FROM shops s
      WHERE ${HAYSTACK_SQL} LIKE ? ESCAPE '\\'
      LIMIT 16`
    );
    const result = await stmt.bind(`%${t}%`).all();
    return result.results || [];
  }

  const clauses = cleaned.map(() => `${HAYSTACK_SQL} LIKE ? ESCAPE '\\'`).join(" AND ");
  const binds = cleaned.map((t) => `%${likeFragment(t)}%`);
  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shops s
    WHERE ${clauses}
    LIMIT 28`
  );
  const result = await stmt.bind(...binds).all();
  return result.results || [];
}

/** Match when punctuation/spacing differs: “cuddleandkind” vs “Cuddle & Kind” → same broad string. */
async function searchBroadNormalizedHaystack(env, needle) {
  const n = normalizeBroad(needle);
  if (n.length < 4) return [];

  const stmt = env.DB.prepare(
    `${SHOP_SELECT}
    FROM shops s
    WHERE instr(
      lower(replace(replace(replace(replace(replace(replace(replace(replace(
        coalesce(s.title,'') || coalesce(s.name,'') || coalesce(s.cluster_best_ranked,'') ||
        coalesce(s.platform_domain,'') || substr(coalesce(s.description,''),1,300),
        ' ', ''), '-', ''), '&', ''), '.', ''), ',', ''), '''', ''), '/', ''), '_', '')
    ), ?) > 0
    LIMIT 16`
  );
  const result = await stmt.bind(n).all();
  return result.results || [];
}

async function enrichByShopIds(env, shopIds) {
  if (!shopIds.length) return {};

  const placeholders = shopIds.map(() => "?").join(",");
  const perShopDomainCap = 20;
  const perShopLinkCap = 14;
  const domainLimit = shopIds.length * perShopDomainCap;
  const linksLimit = shopIds.length * perShopLinkCap;

  const domainsStmt = env.DB.prepare(
    `SELECT shop_id, domain, source_field
     FROM shop_domains
     WHERE shop_id IN (${placeholders})
     LIMIT ${domainLimit}`
  ).bind(...shopIds);

  const linksStmt = env.DB.prepare(
    `SELECT shop_id, link, source_field, link_type
     FROM shop_links
     WHERE shop_id IN (${placeholders})
     LIMIT ${linksLimit}`
  ).bind(...shopIds);

  const [domainsRes, linksRes] = await Promise.all([domainsStmt.all(), linksStmt.all()]);
  const byShop = {};

  for (const shopId of shopIds) {
    byShop[shopId] = { domains: [], links: [] };
  }

  for (const row of domainsRes.results || []) {
    const target = byShop[row.shop_id]?.domains;
    if (!target || target.length >= perShopDomainCap) continue;
    target.push({
      domain: row.domain,
      source: row.source_field,
    });
  }

  for (const row of linksRes.results || []) {
    const target = byShop[row.shop_id]?.links;
    if (!target || target.length >= perShopLinkCap) continue;
    target.push({
      link: row.link,
      source: row.source_field,
      type: row.link_type,
    });
  }

  return byShop;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return json({ error: "D1 binding `DB` is missing." }, 500);
  }

  const url = new URL(request.url);
  const rawQuery = url.searchParams.get("q") || "";
  const query = normalizeQuery(rawQuery);
  const rawPage = Number.parseInt(url.searchParams.get("page") || "1", 10);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, rawLimit))
    : DEFAULT_LIMIT;

  if (!query) {
    return json({ query: rawQuery, normalizedQuery: query, results: [] });
  }
  if (query.length < 2) {
    return json({ query: rawQuery, normalizedQuery: query, results: [] });
  }

  try {
    const tokens = extractSearchTokens(rawQuery, query);

    // Fast path: exact host only (2 queries), skip scans when we already know the shop.
    const [exactD, exactP] = await Promise.all([
      searchExactDomain(env, query),
      searchExactPlatformDomain(env, query),
    ]);
    let results = mergeShopRows([exactD, exactP], MAX_RESULTS);

    // Before prefix "kind%" domain scans (which flood generic hits), surface storefront / slug matches.
    if (results.length < MAX_RESULTS && query.length >= 3) {
      const rankedSubs = await searchRankedSubstringCandidates(env, query);
      results = appendDedup(results, rankedSubs, MAX_RESULTS);
    }

    if (results.length === 0) {
      const [likeD, likeP] = await Promise.all([
        searchLikeDomain(env, query),
        searchLikePlatformDomain(env, query),
      ]);
      results = mergeShopRows([likeD, likeP], MAX_RESULTS);
    }

    // Haystack / tokens before last-resort unconstrained domain rows.
    if (results.length < MAX_RESULTS && query.length >= 3) {
      const hay = await searchContainsHaystack(env, query);
      results = appendDedup(results, hay, MAX_RESULTS);
    }

    if (results.length < MAX_RESULTS && tokens.length) {
      const tokenHits = await searchHaystackTokensAnd(env, tokens);
      results = appendDedup(results, tokenHits, MAX_RESULTS);
    }

    if (results.length < MAX_RESULTS) {
      const titleHits = await searchTitle(env, query);
      results = appendDedup(results, titleHits, MAX_RESULTS);
    }

    if (results.length < MAX_RESULTS && query.length >= 3) {
      const [containD, containP] = await Promise.all([
        searchContainsDomain(env, query),
        searchContainsPlatformDomain(env, query),
      ]);
      results = appendDedup(results, containD, MAX_RESULTS);
      results = appendDedup(results, containP, MAX_RESULTS);
    }

    if (results.length < MAX_RESULTS) {
      const broadNeedle = `${rawQuery} ${query}`;
      if (normalizeBroad(broadNeedle).length >= 4) {
        const broad = await searchBroadNormalizedHaystack(env, broadNeedle);
        results = appendDedup(results, broad, MAX_RESULTS);
      }
    }

    const deduped = results.slice(0, MAX_RESULTS);
    const offset = (page - 1) * limit;
    const paged = deduped.slice(offset, offset + limit);
    const hasMore = offset + limit < deduped.length;

    const ids = paged.map((r) => r.id);
    const extras = await enrichByShopIds(env, ids);

    const payload = paged.map((r) => ({
      ...r,
      domains: extras[r.id]?.domains || [],
      links: extras[r.id]?.links || [],
    }));

    return json({
      query: rawQuery,
      normalizedQuery: query,
      page,
      limit,
      has_more: hasMore,
      total_available: deduped.length,
      count: payload.length,
      results: payload,
    });
  } catch (error) {
    return json(
      {
        error: "Search failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}

