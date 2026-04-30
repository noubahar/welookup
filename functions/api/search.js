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

async function searchExactDomain(env, query) {
  const stmt = env.DB.prepare(
    `SELECT
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
      s.state
    FROM shop_domains d
    JOIN shops s ON s.id = d.shop_id
    WHERE d.domain = ?
    LIMIT 10`
  );
  const result = await stmt.bind(query).all();
  return result.results || [];
}

async function searchLikeDomain(env, query) {
  // Prefix search usually hits indexes better than %query%.
  const stmt = env.DB.prepare(
    `SELECT
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
      s.state
    FROM shop_domains d
    JOIN shops s ON s.id = d.shop_id
    WHERE d.domain LIKE ?
    LIMIT 16`
  );
  const result = await stmt.bind(`${query}%`).all();
  return result.results || [];
}

async function searchContainsDomain(env, query) {
  const stmt = env.DB.prepare(
    `SELECT
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
      s.state
    FROM shop_domains d
    JOIN shops s ON s.id = d.shop_id
    WHERE d.domain LIKE ?
    LIMIT 16`
  );
  const result = await stmt.bind(`%${query}%`).all();
  return result.results || [];
}

async function searchTitle(env, query) {
  const stmt = env.DB.prepare(
    `SELECT
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
      s.state
    FROM shops s
    WHERE lower(s.title) LIKE ?
    LIMIT 12`
  );
  const result = await stmt.bind(`${query}%`).all();
  return result.results || [];
}

/** Title, name, cluster label, domain, and start of description — broader than title-only. */
const HAYSTACK_SQL = `lower(
  coalesce(s.title,'') || ' ' || coalesce(s.name,'') || ' ' ||
  coalesce(s.cluster_best_ranked,'') || ' ' || coalesce(s.platform_domain,'') || ' ' ||
  substr(coalesce(s.description,''), 1, 500)
)`;

async function searchContainsHaystack(env, query) {
  const stmt = env.DB.prepare(
    `SELECT
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
      s.state
    FROM shops s
    WHERE ${HAYSTACK_SQL} LIKE ?
    LIMIT 16`
  );
  const result = await stmt.bind(`%${query}%`).all();
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
    const t = cleaned[0];
    const stmt = env.DB.prepare(
      `SELECT
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
        s.state
      FROM shops s
      WHERE ${HAYSTACK_SQL} LIKE ?
      ORDER BY length(coalesce(s.title, '')) ASC
      LIMIT 16`
    );
    const result = await stmt.bind(`%${t}%`).all();
    return result.results || [];
  }

  const clauses = cleaned.map(() => `${HAYSTACK_SQL} LIKE ?`).join(" AND ");
  const binds = cleaned.map((t) => `%${t}%`);
  const stmt = env.DB.prepare(
    `SELECT
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
      s.state
    FROM shops s
    WHERE ${clauses}
    LIMIT 20`
  );
  const result = await stmt.bind(...binds).all();
  return result.results || [];
}

/** Match when punctuation/spacing differs: “cuddleandkind” vs “Cuddle & Kind” → same broad string. */
async function searchBroadNormalizedHaystack(env, needle) {
  const n = normalizeBroad(needle);
  if (n.length < 4) return [];

  const stmt = env.DB.prepare(
    `SELECT
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
      s.state
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
  const perShopDomainCap = 16;
  const perShopLinkCap = 12;
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

  if (!query) {
    return json({ query: rawQuery, normalizedQuery: query, results: [] });
  }
  if (query.length < 2) {
    return json({ query: rawQuery, normalizedQuery: query, results: [] });
  }

  try {
    const tokens = extractSearchTokens(rawQuery, query);

    const exact = await searchExactDomain(env, query);
    let results = exact;

    if (results.length === 0) {
      const like = await searchLikeDomain(env, query);
      results = like;
    }

    if (results.length === 0 && query.length >= 3) {
      const containsDomain = await searchContainsDomain(env, query);
      results = containsDomain;
    }

    if (results.length === 0) {
      const titleMatches = await searchTitle(env, query);
      results = titleMatches;
    }

    if (results.length === 0 && query.length >= 3) {
      const containsHaystack = await searchContainsHaystack(env, query);
      results = containsHaystack;
    }

    if (results.length === 0 && tokens.length) {
      const tokenHits = await searchHaystackTokensAnd(env, tokens);
      results = tokenHits;
    }

    if (results.length === 0) {
      const broadNeedle = `${rawQuery} ${query}`;
      if (normalizeBroad(broadNeedle).length >= 4) {
        const broad = await searchBroadNormalizedHaystack(env, broadNeedle);
        results = broad;
      }
    }

    const deduped = [];
    const seen = new Set();
    for (const item of results) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      deduped.push(item);
      if (deduped.length >= 12) break;
    }

    const ids = deduped.map((r) => r.id);
    const extras = await enrichByShopIds(env, ids);

    const payload = deduped.map((r) => ({
      ...r,
      domains: extras[r.id]?.domains || [],
      links: extras[r.id]?.links || [],
    }));

    return json({
      query: rawQuery,
      normalizedQuery: query,
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

