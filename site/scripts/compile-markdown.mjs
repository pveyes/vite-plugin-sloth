import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import fs, { promises as fsp } from "fs";
import { unified } from "unified";
import markdown from "remark-parse";
import gfm from "remark-gfm";
import slug from "remark-slug";
import autolinks from "remark-autolink-headings";
import withShiki from "@stefanprobst/remark-shiki";
import toRehype from "remark-rehype";
import raw from "rehype-raw";
import toHTML from "rehype-stringify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const theme = JSON.parse(
  fs.readFileSync(join(__dirname, "../theme.json"), "utf-8")
);

const processor = unified()
  .use(markdown)
  .use(gfm)
  .use(slug)
  .use(autolinks, { behavior: "wrap" })
  .use(withShiki, { theme })
  .use(toRehype, { allowDangerousHtml: true })
  .use(raw)
  .use(toHTML);

const BASE_SRC_DIR = resolve(__dirname, "../public/markdown/raw");
const BASE_DIST_DIR = resolve(__dirname, "../public/markdown/html");

async function md2html(md) {
  return processor.process(md).then((vfile) => vfile.toString());
}

async function compile(file) {
  const md = await fsp.readFile(join(BASE_SRC_DIR, file), "utf8");
  const html = await md2html(md);
  await fsp.writeFile(
    join(BASE_DIST_DIR, file.replace(".md", ".html")),
    html,
    "utf-8"
  );
}

async function compileAll() {
  const files = await fsp.readdir(BASE_SRC_DIR);
  for (const file of files) {
    if (file.endsWith(".md")) {
      await compile(file);
    }
  }
}

if (process.argv[2] !== "--watch") {
  compileAll();
} else {
  console.log("watching raw markdown files...");
  // TODO: watch
  setInterval(() => {
    compileAll();
  }, 5000);
}
