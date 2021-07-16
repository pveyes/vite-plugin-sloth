import fs, { promises as fsp } from "fs";
import path from "path";
import { Plugin } from "vite";
import type { Element as DOMElement } from "domhandler";
import cheerio, { Cheerio, CheerioAPI } from "cheerio";
import chalk from "chalk";
import css from "css";

interface FlattenSlotFunc {
  (node: DOMElement): boolean;
}

type FlattenSlotOptions = boolean | string[] | FlattenSlotFunc;

interface Options {
  flattenSlot?: FlattenSlotOptions;
}

const runtimePublicPath = "/@sloth-refresh";
const runtimeFilePath = require.resolve("../dev-runtime");
const bootstrapFilePath = require.resolve("../bootstrap");
const runtimeCode = "\n" + fs.readFileSync(runtimeFilePath, "utf8");
const bootstrapCode = "\n" + fs.readFileSync(bootstrapFilePath, "utf8");

const preamble = `import "__BASE__${runtimePublicPath.slice(1)}"`;

const initScriptPath = "/@sloth-init";
const bootstrapScriptPath = "/@sloth-bootstrap";
const componentsScriptPath = "/@sloth-component/";

export default (options: Options = {}): Plugin => {
  let isBuild = false;
  let base = "/";
  let publicDir = path.join(process.cwd(), "public");

  const initScriptMap = new Map();
  const componentScriptMap = new Map();

  return {
    name: "sloth",
    enforce: "pre",
    configResolved: (config) => {
      isBuild = config.command === "build" || config.isProduction;
      base = config.base;
      publicDir = config.publicDir;
    },
    transformIndexHtml: {
      enforce: "pre",
      transform: async (html, ctx) => {
        if (!isBuild) {
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
        }

        let initScript = "";
        const $ = cheerio.load(html);
        const { templates: externalTemplates, includes } =
          await getExternalReferences($, publicDir);

        const inlineTemplates = $("template")
          .map((_, template) => {
            return {
              name: template.attribs.id,
              element: template.attribs["data-element"],
              className: template.attribs.class,
              content: $(template).html(),
            };
          })
          .toArray();

        const templates = externalTemplates.concat(inlineTemplates);

        compileTemplates(templates, $, options.flattenSlot);
        compileIncludes($, includes);

        let styles = [];
        templates.forEach((template) => {
          if (template.style) {
            styles.push(compileStyle(template.style, template.name));
          }
        });

        // cleanup: remove all inline templates
        $("template").remove();
        $("head").append(
          `<style id="scoped-sloth">${styles.join("\n")}</style>`
        );

        const templateWithScripts = templates.filter((template) => {
          return template.script;
        });

        if (templateWithScripts.length > 0) {
          initScript += `import bootstrap from "${bootstrapScriptPath}"\n`;

          templateWithScripts.forEach((template) => {
            componentScriptMap.set(template.name, template.script);
            initScript += `import ${toClassName(template.name)} from "${
              componentsScriptPath + template.name
            }";\n`;
          });

          initScript += "\n";

          templateWithScripts.forEach((template) => {
            initScript += `bootstrap("${template.name}", ${toClassName(
              template.name
            )})\n`;
          });
          initScriptMap.set(ctx.path, initScript);

          return {
            html: $.html(),
            tags: [
              {
                tag: "script",
                attrs: {
                  type: "module",
                  src: initScriptPath + ctx.path.replace(".html", ""),
                },
                injectTo: "body",
              },
            ],
          };
        }

        return $.html();
      },
    },
    resolveId(id) {
      const isSlothRuntime = [runtimePublicPath, bootstrapScriptPath].some(
        (targetId) => {
          return targetId === id;
        }
      );

      if (
        isSlothRuntime ||
        id.startsWith(componentsScriptPath) ||
        id.startsWith(initScriptPath)
      ) {
        return id;
      }
    },
    load(id) {
      switch (id) {
        case runtimePublicPath:
          return runtimeCode;
        case bootstrapScriptPath:
          return bootstrapCode;
      }

      if (id.startsWith(componentsScriptPath)) {
        const componentName = id.replace(componentsScriptPath, "");
        return componentScriptMap.get(componentName);
      }

      if (id.startsWith(initScriptPath)) {
        const pathEntry = id.replace(initScriptPath, "");
        return initScriptMap.get(pathEntry + ".html");
      }
    },
    transform: (code, id) => {
      if (id.startsWith(componentsScriptPath)) {
        // we want to instantiate the class but HTMLElement is not a constructor
        return code.replace(" extends HTMLElement", "");
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

// convert kebab-case to PascalCase
function toClassName(name: string) {
  return name.replace(/-(.)/g, (_, c) => c.toUpperCase());
}

interface Template {
  name: string;
  element?: string;
  className: string;
  content: string;
  style?: string;
  script?: string;
}

interface HTMLInclude {
  src: string;
  html: string;
}

interface ExternalReference {
  templates: Template[];
  includes: HTMLInclude[];
}

const TemplateCache = new Map<string, Template>();

async function getExternalReferences(
  $: CheerioAPI,
  publicDir: string,
  basePath = ""
): Promise<ExternalReference> {
  const includes = await Promise.all(
    $("script")
      .filter((_, script) => {
        return (
          script.attribs.type === "text/html" &&
          script.attribs.src.endsWith("html")
        );
      })
      .map((_, script) => {
        return script.attribs.src;
      })
      .toArray()
      .map(async (src) => {
        const includePath = path.join(publicDir, src);
        const html = await fsp.readFile(includePath, "utf8");

        return {
          src,
          html,
        };
      })
  );
  const templates = await Promise.all(
    $("link")
      .filter((_, link) => {
        return (
          link.attribs.rel === "import" && link.attribs.href.endsWith("html")
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
        const templatePath = path.join(publicDir, basePath, rawPath);
        if (TemplateCache.has(templatePath)) {
          return TemplateCache.get(templatePath);
        }

        const templateHTML = await fsp.readFile(templatePath, "utf8");

        const $$ = cheerio.load(templateHTML);
        const template = {
          name: $$("template").attr("id"),
          element: $$("template").attr("data-element"),
          className: $$("template").attr("class"),
          content: $$("template").html(),
          style: $$("style").html(),
          script: $$("script").html(),
        };

        const imports = $$('link[rel="import"]');
        if (imports.length > 0) {
          const templateBasePath = rawPath.split("/").slice(0, -1).join("/");
          const { templates, includes: additionalIncludes } =
            await getExternalReferences($$, publicDir, templateBasePath);
          includes.push(...additionalIncludes);
          return templates.concat([template]);
        }

        TemplateCache.set(templatePath, template);
        return template;
      })
  );

  return {
    templates: templates.flat().filter(Boolean),
    includes,
  };
}

function compileTemplates(
  templates: Template[],
  $: CheerioAPI,
  flattenSlot: FlattenSlotOptions
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

      const wrapperElement = template.element || "div";
      const wrapper = $(`<${wrapperElement}></${wrapperElement}>`);
      wrapper.attr("data-template", template.name);
      wrapper.attr("class", template.className);
      wrapper.append(content.trim());
      target.replaceWith(wrapper);
    });

    isAttributeElements.each((_, el) => {
      const variables = getVariables(el);
      const target = $(el);
      console.log("compiling PE", template.name);
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

function compileIncludes($: CheerioAPI, includes: HTMLInclude[]) {
  includes.forEach(({ src, html }) => {
    $(`script[src="${src}"]`).replaceWith(html);
  });
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
        const wrapperPrefix = `[data-template="${id}"]`;
        // TODO: throw error on :host() and :host-context() selector
        if (selector.includes(":host")) {
          return selector.replace(":host", wrapperPrefix);
        }
        return `${wrapperPrefix} ${selector}`;
      });
    }
  });
  return css.stringify(ast);
}

let newLineInserted = false;

interface CompileOptions {
  name: string;
  flattenSlot?: FlattenSlotOptions;
  variables: Record<string, string>;
}

function compileContent(
  target: Cheerio<any>,
  template: string,
  options: CompileOptions
) {
  const { flattenSlot = [], variables } = options;
  const $ = cheerio.load(template);

  // compile slots
  $("slot").each((_, slot) => {
    const name = slot.attribs.name;
    const value = target.find(`[slot=${name}]`);

    if (value.length === 0) {
      return;
    }

    let shouldFlattenSlot = false;
    if (typeof flattenSlot === "boolean") {
      shouldFlattenSlot = flattenSlot;
    } else if (Array.isArray(flattenSlot)) {
      shouldFlattenSlot = flattenSlot.includes(value.get(0).tagName);
    } else if (typeof flattenSlot === "function") {
      shouldFlattenSlot = flattenSlot(value.get(0));
    }

    $(slot).replaceWith(shouldFlattenSlot ? value.html() : value);
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
