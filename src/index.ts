import fs, { promises as fsp } from "fs";
import path from "path";
import { Plugin } from "vite";
import cheerio, { Cheerio } from "cheerio";
import chalk from "chalk";

interface Options {
  flattenSlot?: boolean;
}

const runtimePublicPath = "/@sloth-refresh";
const runtimeFilePath = require.resolve("../dev-runtime");
const runtimeCode = "\n" + fs.readFileSync(runtimeFilePath, "utf8");

console.log("path", runtimeFilePath);

const preamble = `import "__BASE__${runtimePublicPath.slice(1)}"`;

export default (options: Options = {}): Plugin => {
  let isBuild = false;
  let base = "/";

  return {
    name: "sloth",
    configResolved: (config) => {
      isBuild = config.command === "build" || config.isProduction;
      base = config.base;
    },
    transformIndexHtml: (html) => {
      if (isBuild) {
        return transformHtml(html, options);
      }

      // use custom-elements to support HMR for external templates in dev
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              type: "module",
            },
            injectTo: "body",
            children: preamble.replace("__BASE__", base),
          },
        ],
      };
    },
    resolveId(id) {
      if (id === runtimePublicPath) {
        return id;
      }
    },
    load(id) {
      if (id === runtimePublicPath) {
        return runtimeCode;
      }
    },
    handleHotUpdate({ file, server }) {
      if (file.endsWith(".html")) {
        server.ws.send({
          type: "custom",
          event: "template-update",
          data: {
            path: file,
          },
        });
      }
    },
  };
};

async function transformHtml(html: string, options: Options) {
  const $ = cheerio.load(html);
  const externalTemplates: Template[] = await Promise.all(
    $("link")
      .filter((_, link) => {
        return (
          link.attribs.rel === "import" &&
          (link.attribs.href.endsWith("html") ||
            link.attribs.href.startsWith("data:text/html"))
        );
      })
      .map((_, link) => {
        // we don't want rel import to be included in HTML
        // as this is dev only import
        $(link).remove();

        try {
          if (link.attribs.href.startsWith("data:")) {
            const template = Buffer.from(
              link.attribs.href.replace("data:text/html;base64,", ""),
              "base64"
            ).toString();
            return {
              content: template,
            };
          }

          return {
            path: path.join(process.cwd(), link.attribs.href),
          };
        } catch (err) {
          return null;
        }
      })
      .toArray()
      .map(async (raw) => {
        const template = raw.path
          ? await fsp.readFile(raw.path, "utf8")
          : raw.content;

        const $$ = cheerio.load(template);
        return {
          name: $$("template").attr("id"),
          content: $$("template").html(),
        };
      })
      .filter(Boolean)
  );

  const inlineTemplates = $("template")
    .map((_, template) => {
      return {
        name: template.attribs.id,
        content: $(template).html(),
      };
    })
    .toArray();

  const templates = externalTemplates.concat(inlineTemplates);

  templates.forEach((template) => {
    const customElements = $(`${template.name}`);
    const isAttributeElements = $(`[is="${template.name}"]`);

    customElements.each((_, el) => {
      const target = $(el);
      const content = compileContent(target, template.content, {
        name: template.name,
        flattenSlot: options.flattenSlot,
        variables: target.data(),
      });

      const wrapper = $("<div></div>");
      wrapper.attr("data-template", template.name);
      wrapper.append(content.trim());
      target.replaceWith(wrapper);
    });

    isAttributeElements.each((_, el) => {
      const target = $(el);
      const content = compileContent(target, template.content, {
        name: template.name,
        flattenSlot: options.flattenSlot,
        variables: target.data(),
      });
      target.removeAttr("is");
      target.attr("data-template", template.name);
      target.html(content);
    });
  });

  // cleanup: remove all inline templates
  $("templates").remove();
  return $.html().trim();
}

let newLineInserted = false;

interface CompileOptions {
  name: string;
  flattenSlot?: boolean;
  variables: Record<string, any>;
}

function compileContent(
  target: Cheerio<any>,
  template: string,
  options: CompileOptions
) {
  const { flattenSlot, variables } = options;
  const $ = cheerio.load(template);

  // compile slots
  $("slot").each((_, slot) => {
    const name = slot.attribs.name;
    const value = target.find(`[slot=${name}]`);
    $(slot).replaceWith(flattenSlot ? value.html() : value);
  });

  // compile variables
  $("*")
    .filter((_, el) => {
      const data = $(el).data();
      return Object.keys(data).length > 0;
    })
    .each((_, element) => {
      const $el = $(element);
      const elementData = $el.data();
      Object.keys(elementData).forEach((key) => {
        if (variables[key] === undefined && !$el.attr(key)) {
          // vite uses writeLine without newline when logging rendered chunk
          // @see https://github.com/vitejs/vite/blob/eb66b4350c635fb4f2ef2e8a9eb50958cde73743/packages/vite/src/node/plugins/reporter.ts#L126
          if (!newLineInserted) {
            newLineInserted = true;
            console.log();
          }

          console.warn(
            chalk.yellowBright("[sloth]") +
              " " +
              chalk.yellow(
                `Template \`${options.name}\` requires \`data-${key}\` but it's missing`
              )
          );
        } else {
          const targetAttribute = (elementData[key] as any) || key;
          $el.attr(`data-${key}`, null);
          $el.attr(targetAttribute, variables[key]);
        }
      });
    });

  return $.html();
}

interface Template {
  name: string;
  content: string;
}
