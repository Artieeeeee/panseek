
    import { BaseAsyncPlugin } from "./manager";
    import type { SearchResult } from "../types/models";
    import { ofetch } from "ofetch";
    import { load } from "cheerio";

    const BASE = "https://sukebei.nyaa.si";
    // 默认按做种数（seeders）从高到低降序
    const SEARCH = (kw: string) =>
      `${BASE}/?f=0&c=0_0&q=${encodeURIComponent(kw)}&s=seeders&o=desc`;

    async function fetchDetailMagnet(url: string): Promise<string> {
      try {
        const html = await ofetch<string>(url, {
          headers: { "user-agent": "Mozilla/5.0", referer: BASE + "/" },
          timeout: 10000,
        });
        const $ = load(html);
        return $("a[href^='magnet:']").attr("href") || "";
      } catch {
        return "";
      }
    }

    export class SukebeiPlugin extends BaseAsyncPlugin {
      constructor() {
        super("sukebei", 4);
      }

      override async search(keyword: string): Promise<SearchResult[]> {
        const html = await ofetch<string>(SEARCH(keyword), {
          headers: {
            "user-agent": "Mozilla/5.0",
            referer: BASE + "/",
          },
          timeout: 10000,
        }).catch(() => "");

        if (!html) return [];
        const $ = load(html);
        const out: SearchResult[] = [];
        const tasks: Promise<void>[] = [];

        $("table tbody tr").each((_, tr) => {
          const row = $(tr);
          const tds = row.find("td");
          if (!tds.length) return;

          const titleA = tds.eq(1).find("a").last();
          const title = (titleA.text() || "").trim();
          if (!title) return;

          const pageHref = titleA.attr("href") || "";
          const detail = pageHref.startsWith("/") ? `${BASE}${pageHref}` : pageHref;
          const unique = detail
            ? `sukebei-${detail.split("/").pop()}`
            : `sukebei-${title}`;

          // 优先从列表直接提取 magnet 链接
          let magnet = row.find("a[href^='magnet:']").attr("href") || "";

          // 如果列表未直接暴露，异步进入详情页获取
          if (!magnet && detail) {
            tasks.push(
              (async () => {
                const mg = await fetchDetailMagnet(detail);
                if (!mg) return;
                out.push({
                  message_id: "",
                  unique_id: unique,
                  channel: "",
                  datetime: new Date().toISOString(),
                  title,
                  content: "",
                  links: [{ type: "magnet", url: mg, password: "" }],
                });
              })()
            );
            return;
          }

          if (!magnet) return;

          // 提取文件体积、做种数和下载数
          const size = row.find("td").eq(3).text().trim();
          const seeders = row.find("td").eq(5).text().trim();
          const leechers = row.find("td").eq(6).text().trim();
          const contentParts: string[] = [];
          if (size) contentParts.push(`Size: ${size}`);
          if (seeders) contentParts.push(`Seeders: ${seeders}`);
          if (leechers) contentParts.push(`Leechers: ${leechers}`);

          out.push({
            message_id: "",
            unique_id: unique,
            channel: "",
            datetime: new Date().toISOString(),
            title,
            content: contentParts.join(" | "),
            links: [{ type: "magnet", url: magnet, password: "" }],
          });
        });

        if (tasks.length) await Promise.allSettled(tasks);
        return out;
      }
    }
