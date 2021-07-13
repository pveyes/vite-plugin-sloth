import fs, { promises as fsp } from "fs";
import path from "path";
import { Plugin } from "vite";
import type { Element as DOMElement } from "domhandler";
import cheerio, { Cheerio, CheerioAPI } from "cheerio";
import chalk from "chalk";
import css from "css";

interface Options {
  flattenSlot?: boolean;
}

const runtimePublicPath = "/@sloth-refresh";
const runtimeFilePath = require.resolve("../dev-runtime");
const runtimeCode = "\n" + fs.readFileSync(runtimeFilePath, "utf8");

const preamble = `import "__BASE__${runtimePublicPath.slice(1)}"`;

export default (options: Options = {}): Plugin => {
  let isBuild = false;
  let base = "/";
  let publicDir = path.join(process.cwd(), "public");

  return {
    name: "sloth",
    enforce: "pre",
    configResolved: (config) => {
      isBuild = config.command === "build" || config.isProduction;
      base = config.base;
      publicDir = config.publicDir;
    },
    transformIndexHtml: (html) => {
      if (isBuild) {
        return transformHtml(html, { ...options, publicDir });
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

interface TransformHtmlOptions extends Options {
  publicDir: string;
}

interface Template {
  name: string;
  content: string;
  style?: string;
}

async function transformHtml(html: string, options: TransformHtmlOptions) {
  const $ = cheerio.load(html);
  const externalTemplates = await getExternalTemplates($, options.publicDir);

  const inlineTemplates = $("template")
    .map((_, template) => {
      return {
        name: template.attribs.id,
        content: $(template).html(),
      };
    })
    .toArray();

  const templates = externalTemplates.concat(inlineTemplates);

  compileTemplates(templates, $, options.flattenSlot);

  let styles = [];
  templates.forEach((template) => {
    if (template.style) {
      styles.push(compileStyle(template.style, template.name));
    }
  });
  $("head").append(`<style id="scoped-sloth">${styles.join("\n")}</style>`);

  // cleanup: remove all inline templates
  $("template").remove();
  return $.html().trim();
}

async function getExternalTemplates(
  $: CheerioAPI,
  basePath: string
): Promise<Template[]> {
  const templates = await Promise.all(
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
        return link.attribs.href;
      })
      .toArray()
      .map(async (rawPath) => {
        const templateHTML = await fsp.readFile(
          path.join(basePath, rawPath),
          "utf8"
        );
        const $$ = cheerio.load(templateHTML);

        const template = {
          name: $$("template").attr("id"),
          content: $$("template").html(),
          style: $$("style").html(),
        };

        const imports = $$('link[rel="import"]');
        if (imports.length > 0) {
          const templateBasePath = rawPath.split("/").slice(0, -1).join("/");
          const templates = await getExternalTemplates(
            $$,
            path.join(basePath, templateBasePath)
          );
          return templates.concat([template]);
        }

        return template;
      })
  );

  return templates.flat().filter(Boolean);
}

function compileTemplates(
  templates: Template[],
  $: CheerioAPI,
  flattenSlot = false
) {
  templates.forEach((template) => {
    const customElements: Cheerio<DOMElement> = $(`${template.name}`) as any;
    const isAttributeElements = $(`[is="${template.name}"]`);

    customElements.each((_, el) => {
      const target = $(el);
      const content = compileContent(target, template.content, {
        name: template.name,
        variables: getVariables(el),
        flattenSlot,
      });

      const wrapper = $("<div></div>");
      wrapper.attr("data-template", template.name);
      wrapper.append(content.trim());
      target.replaceWith(wrapper);
    });

    isAttributeElements.each((_, el) => {
      const variables = getVariables(el);
      const target = $(el);
      const content = compileContent(target, template.content, {
        name: template.name,
        variables,
        flattenSlot,
      });

      target.removeAttr("is");
      target.attr("data-template", template.name);

      // remove all variables from root element
      for (const v in variables) {
        target.attr(`data-var-${v}`, null);
      }

      target.html(content);
    });
  });

  const uncompiled = templates.reduce((total, template) => {
    return total + $(`${template.name},[is="${template.name}"]`).length;
  }, 0);

  // multi-pass compilation
  if (uncompiled > 0) {
    compileTemplates(templates, $, flattenSlot);
  }
}

function getVariables(el: DOMElement): Record<string, string> {
  const data = el.attribs;
  const variables = Object.create(null);
  for (const key in data) {
    if (key.startsWith("data-var-")) {
      const varKey = key.replace(/^data-var-/, "").toLowerCase();
      variables[varKey] = data[key];
    }
  }

  return variables;
}

function compileStyle(cssText: string, id: string) {
  const ast = css.parse(cssText, { source: `${id}.scoped.css` });
  // TODO: prefix keyframe?
  ast.stylesheet.rules.forEach((rule) => {
    if (rule.type === "rule") {
      rule.selectors = rule.selectors.map((selector: string) => {
        return `[data-template="${id}"] ${selector}`;
      });
    }
  });
  return css.stringify(ast);
}

let newLineInserted = false;

interface CompileOptions {
  name: string;
  flattenSlot?: boolean;
  variables: Record<string, string>;
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
      const element: DOMElement = el as any;
      return Object.keys(element.attribs).some((key) =>
        key.startsWith("data-var-")
      );
    })
    .each((_, el) => {
      const element: DOMElement = el as any;
      // @ts-ignore
      const $el = $(element);
      Object.keys(element.attribs)
        .filter((key) => key.startsWith("data-var-"))
        .forEach((key) => {
          const varKey = key.replace(/^data-var-/, "");

          const isCustomElement =
            element.tagName.includes("-") || element.attribs.is;
          const isVariablePassed = Boolean(variables[varKey]);
          const hasFallbackValue = Boolean(element.attribs[varKey]);

          if (isVariablePassed || hasFallbackValue) {
            if (isCustomElement) {
              const targetAttribute = element.attribs[key] || key;
              $el.attr(targetAttribute, variables[varKey]);
            } else {
              const targetAttribute = element.attribs[key] || varKey;
              $el.attr(key, null);
              $el.attr(targetAttribute, variables[varKey]);
            }
          } else {
            // log warning
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
                  `Template \`${options.name}\` requires \`data-var-${varKey}\` but it's missing`
                )
            );
            $el.attr(key, null);
          }
        });
    });

  return $.html();
}
