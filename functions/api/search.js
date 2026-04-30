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

async function searchContainsTitle(env, query) {
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
  const result = await stmt.bind(`%${query}%`).all();
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
      const containsTitle = await searchContainsTitle(env, query);
      results = containsTitle;
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

