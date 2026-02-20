#!/usr/bin/env node

/**
 * Search Reddit posts with official OAuth API.
 *
 * Usage:
 *   node reddit_search.js "shopify app" 10
 *   node reddit_search.js --keyword "shopify app" --limit 10 --sort relevance --time all
 *
 * Required env vars:
 *   REDDIT_CLIENT_ID
 *   REDDIT_CLIENT_SECRET
 * Optional env vars:
 *   REDDIT_USER_AGENT (default: OfficialRedditSearchScript/1.0 by u/local-script-user)
 */

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const SEARCH_URL = "https://oauth.reddit.com/search";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT = "relevance";
const DEFAULT_TIME = "all";
const ALLOWED_SORT = new Set(["relevance", "hot", "top", "new", "comments"]);
const ALLOWED_TIME = new Set(["all", "year", "month", "week", "day", "hour"]);

function parseArgs(argv) {
  const args = {
    keyword: "",
    limit: DEFAULT_LIMIT,
    sort: DEFAULT_SORT,
    time: DEFAULT_TIME,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!args.keyword && !token.startsWith("-")) {
      args.keyword = token;
      continue;
    }

    if ((token === "--keyword" || token === "-k") && argv[i + 1]) {
      args.keyword = argv[i + 1];
      i += 1;
      continue;
    }

    if ((token === "--limit" || token === "-l") && argv[i + 1]) {
      args.limit = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (token === "--sort" && argv[i + 1]) {
      args.sort = argv[i + 1].toLowerCase();
      i += 1;
      continue;
    }

    if ((token === "--time" || token === "-t") && argv[i + 1]) {
      args.time = argv[i + 1].toLowerCase();
      i += 1;
      continue;
    }
  }

  return args;
}

function validateInput(args) {
  if (!args.keyword || !args.keyword.trim()) {
    throw new Error('请提供关键词，例如: node reddit_search.js "shopify app"');
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > MAX_LIMIT) {
    throw new Error(`limit 必须是 1-${MAX_LIMIT} 的整数`);
  }
  if (!ALLOWED_SORT.has(args.sort)) {
    throw new Error(`sort 仅支持: ${Array.from(ALLOWED_SORT).join(", ")}`);
  }
  if (!ALLOWED_TIME.has(args.time)) {
    throw new Error(`time 仅支持: ${Array.from(ALLOWED_TIME).join(", ")}`);
  }
}

function getEnvConfig() {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || "OfficialRedditSearchScript/1.0 by u/local-script-user";

  if (!clientId || !clientSecret) {
    throw new Error("缺少环境变量 REDDIT_CLIENT_ID 或 REDDIT_CLIENT_SECRET");
  }

  return { clientId, clientSecret, userAgent };
}

async function getAccessToken(config) {
  const basicToken = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.userAgent,
      Accept: "application/json",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`获取 access token 失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error("Reddit 未返回 access_token");
  }
  return data.access_token;
}

function buildSearchUrl(args) {
  const params = new URLSearchParams({
    q: args.keyword,
    limit: String(args.limit),
    sort: args.sort,
    t: args.time,
    type: "link",
    raw_json: "1",
  });
  return `${SEARCH_URL}?${params.toString()}`;
}

async function searchPosts(args, token, config) {
  const response = await fetch(buildSearchUrl(args), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": config.userAgent,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`搜索失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data?.data?.children?.map((x) => x.data) || [];
}

function formatPost(post, index) {
  const permalink = post.permalink ? `https://www.reddit.com${post.permalink}` : "";
  return [
    `${index + 1}. ${post.title || "(无标题)"}`,
    `   社区: r/${post.subreddit || "unknown"}`,
    `   点赞: ${post.ups ?? 0} | 评论: ${post.num_comments ?? 0}`,
    `   NSFW: ${Boolean(post.over_18)}`,
    `   链接: ${permalink}`,
  ].join("\n");
}

(async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    validateInput(args);
    const config = getEnvConfig();

    const token = await getAccessToken(config);
    const posts = await searchPosts(args, token, config);

    if (posts.length === 0) {
      console.log("没有找到相关帖子。");
      return;
    }

    console.log(`关键词: ${args.keyword}`);
    console.log(`结果数量: ${posts.length}`);
    console.log(`排序: ${args.sort} | 时间范围: ${args.time}\n`);

    posts.forEach((post, index) => {
      console.log(formatPost(post, index));
      console.log("");
    });
  } catch (error) {
    console.error("错误:", error.message || error);
    process.exit(1);
  }
})();

