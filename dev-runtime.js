/// <reference types="./sloth" />
// @ts-check

/**
 * @typedef {{ name: string, incoming: Record<string, Vertex>, incomingNames: string[], value: string }} Vertex
 * @typedef {{ fragment: DocumentFragment, element?: string; style?: HTMLStyleElement, script?: HTMLScriptElement, attributes?: NamedNodeMap }} ElementTemplate
 */

/**
 * @type {Map<string, ElementTemplate>}
 */
const templateCache = new Map();

/**
 * @type {Map<string, string>}
 */
const htmlIncludesCache = new Map();

// @ts-ignore: property .hot is not available on ImportMeta
const hmr = import.meta.hot;

const ROOT_VERTEX_NAME = "root";

/**
 * Dependency Graph represented as DAG
 */
class DependencyGraph {
  constructor() {
    /**
     * @type {string[]}
     * @public
     */
    this.names = [];
    /**
     * @type {Record<string,Vertex>}
     * @private
     */
    this.vertices = Object.create(null);
  }

  /**
   * @param {string} name
   * @return {Vertex}
   */
  add(name) {
    if (this.vertices[name]) {
      return this.vertices[name];
    }

    const vertex = Object.assign(Object.create(null), {
      name,
      incoming: Object.create(null),
      incomingNames: [],
      value: null,
    });

    this.vertices[name] = vertex;
    this.names.push(name);
    return vertex;
  }

  /**
   * @param {string} name
   * @param {string} value
   * @return {Vertex}
   */
  addVertex(name, value) {
    const vertex = this.add(name);
    vertex.value = value;
    return vertex;
  }

  /**
   * @param {string} fromName
   * @param {string} toName
   * @return {void}
   */
  addEdge(fromName, toName) {
    const from = this.add(fromName);
    const to = this.add(toName);

    if (to.incoming[fromName]) {
      return;
    }

    visitDAG(from, (vertex, path) => {
      if (vertex.name === toName) {
        throw new Error(
          `Circular dependencies detected: ${toName} <- ${path.join(" <- ")}`
        );
      }
    });

    to.incoming[fromName] = from;
    to.incomingNames.push(fromName);
  }

  get(name) {
    return this.vertices[name];
  }
}

const deps = new DependencyGraph();

if (hmr) {
  hmr.on("template-update", async (data) => {
    const href = deps.names.find((name) => data.path.endsWith(name));

    if (!href) {
      return;
    }

    const templateHTML = await fetch(href, {
      headers: {
        pragma: "no-cache",
        "cache-control": "no-cache",
      },
    }).then((res) => res.text());
    const div = document.createElement("div");
    div.innerHTML = templateHTML;
    const template = div.querySelector("template");
    const style = div.querySelector("style");
    const script = div.querySelector(`script`);

    await Promise.all(
      Array.from(
        template.content.querySelectorAll(`script[type="text/html"]`)
      ).map(async (script) => {
        const src = script.getAttribute("src");
        // remove memory cache so we get fresh content in HMR
        htmlIncludesCache.delete(src);
        const html = await loadHTMLInclude(src);
        script.parentElement.innerHTML = html.trim();
      })
    );

    /** @type {Array<Document|ShadowRoot>} */
    let roots = [document];
    visitDAG(deps.get(href), (vertex) => {
      if (vertex.name !== ROOT_VERTEX_NAME && vertex.name !== href) {
        roots = roots.flatMap((root) => {
          return Array.from(
            /** @type {NodeListOf<Element>} */ (
              root.querySelectorAll(`${vertex.value},[is="${vertex.value}"]`)
            )
          ).map((el) => el.shadowRoot);
        });
      }
    });

    templateCache.set(template.id, {
      fragment: template.content,
      element: template.getAttribute("data-element"),
      style,
      script,
      attributes: template.attributes,
    });

    roots.forEach((root) => {
      replaceCustomElement(template.id, root);
    });
  });

  // Setup custom elements from external templates.
  // Assign the promise so we can wait if some polymorphic elements
  // uses external template
  const externalTemplatesReady = initExternalTemplates(
    Array.from(document.querySelectorAll('link[rel="import"]'))
  );

  // as well as inline templates
  document.querySelectorAll("template").forEach((template) => {
    initCustomElement(template.id, template.content, {
      attributes: template.attributes,
    });
  });

  document
    .querySelectorAll('script[type="text/html"]')
    .forEach(async (script) => {
      const html = await loadHTMLInclude(script.getAttribute("src"));
      script.parentElement.innerHTML = html.trim();
    });

  // upgrade polymorphic elements to custom element
  /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[is]")
  ).forEach(async (el) => {
    const name = el.getAttribute("is");

    let template = templateCache.get(name);
    if (!template) {
      // only wait for external templates if it doesn't exist in the cache
      await externalTemplatesReady;
      template = templateCache.get(name);

      // by now, template must be resolved or is not defined everywhere
      if (!template) {
        console.error(
          `[sloth] Template \`${name}\` not found for polymorphic element`,
          { el }
        );
      }
    }

    renderPolymorphicElement(el, name);
  });
}

/**
 * @param {string} root
 * @param {string} path;
 * @return {string}
 */
function resolveAbsolutePath(root, path) {
  if (root === "/") {
    return path;
  }

  if (path.indexOf("./") === -1) {
    return root + path;
  }

  const relativePath = path.slice(path.indexOf("./") + 2);
  const upDirLength = path.split("/").filter((p) => p === "..").length;

  const rootSegment = root.replace(/\/$/, "").split("/");
  if (upDirLength > rootSegment.length) {
    throw new Error("import outside of scope " + path);
  }

  const basePath = rootSegment
    .slice(0, rootSegment.length - upDirLength)
    .join("/");
  return basePath + "/" + relativePath;
}

/**
 * @param {HTMLLinkElement[]} paths
 * @param {string?} root
 * @param {string?} fromName
 */
function initExternalTemplates(paths, root = "/", fromName = ROOT_VERTEX_NAME) {
  return Promise.all(
    paths.map(async (link) => {
      // use getAttribute('href') instead of .href so browser doesn't transform
      // relative directory syntax
      const path = link.getAttribute("href");
      const target = resolveAbsolutePath(root, path);

      const vertex = deps.get(target);
      if (vertex) {
        // already imported, just need to attach new edge
        deps.addEdge(fromName, target);
        return;
      }

      const templateHTML = await fetch(target, {
        headers: {
          pragma: "no-cache",
          "cache-control": "no-cache",
        },
      }).then((res) => res.text());

      const div = document.createElement("div");
      div.innerHTML = templateHTML;

      const template = div.querySelector("template");
      if (!template) {
        throw new Error(`Template from ${path} not found`);
      }

      deps.addVertex(target, template.id);
      deps.addEdge(fromName, target);

      const style = div.querySelector("style");
      const script = div.querySelector("script");

      await Promise.all(
        Array.from(
          template.content.querySelectorAll(`script[type="text/html"]`)
        ).map(async (script) => {
          console.log("loading html includes", script.getAttribute("src"));
          const html = await loadHTMLInclude(script.getAttribute("src"));
          script.parentElement.innerHTML = html.trim();
        })
      );

      /**
       * @type {Array<HTMLLinkElement>}
       */
      const imports = Array.from(div.querySelectorAll("link[rel=import]"));
      if (imports.length === 0) {
        initCustomElement(template.id, template.content, {
          element: template.getAttribute("data-element"),
          style,
          script,
          attributes: template.attributes,
        });
        return;
      }

      const nextRoot = target.split("/").slice(0, -1).join("/");
      await initExternalTemplates(imports, nextRoot + root, target);
      initCustomElement(template.id, template.content, {
        element: template.getAttribute("data-element"),
        style,
        script,
        attributes: template.attributes,
      });
    })
  );
}

async function loadHTMLInclude(path) {
  if (htmlIncludesCache.has(path)) {
    return htmlIncludesCache.get(path);
  }

  const html = await fetch(path, {
    headers: {
      pragma: "no-cache",
      "cache-control": "no-cache",
    },
  }).then((res) => res.text());

  htmlIncludesCache.set(path, html);
  return html;
}

/**
 * @param {string} templateId
 * @param {DocumentFragment} fragment
 * @param {Omit<ElementTemplate, 'fragment'>} enhancer
 */
async function initCustomElement(templateId, fragment, enhancer) {
  templateCache.set(templateId, { fragment, ...enhancer });
  const customElement = await createCustomElement(templateId);
  customElements.define(templateId, customElement);
}

/**
 * @param {string} templateId
 * @param {Document|ShadowRoot} root
 */
async function replaceCustomElement(templateId, root) {
  const clazz = await createCustomElement(templateId);

  // refresh custom elements
  /** @type {NodeListOf<HTMLElement>} */ (
    root.querySelectorAll(templateId)
  ).forEach((node) => {
    node.disconnectedCallback?.();
    Object.setPrototypeOf(node, clazz.prototype);
    node.connectedCallback();
  });

  // refresh polymorphic elements
  /** @type {NodeListOf<HTMLElement>} */ (
    root.querySelectorAll(`[is="${templateId}"]`)
  ).forEach((node) => {
    Object.setPrototypeOf(node, clazz.prototype);
    renderPolymorphicElement(node, templateId);
  });
}

/**
 * @param {HTMLElement} el
 * @param {string} templateId
 */
function renderPolymorphicElement(el, templateId) {
  const { fragment, style, attributes } = templateCache.get(templateId);
  /**
   * @type {Record<string, string>}
   */
  const vars = Object.create(null);
  Array.from(el.attributes)
    .filter((attr) => attr.name.startsWith("data-var-"))
    .forEach((attr) => {
      vars[attr.name] = attr.value;
    });

  // we need to bind variables before appending child to the root element,
  // but we don't want to create new wrapper so we use temporary div element
  const tempRoot = document.createElement("div");
  tempRoot.appendChild(fragment.cloneNode(true));
  bindVariables(tempRoot, vars, templateId);

  let sheet;
  if (style) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(style.innerHTML);
  }

  if (el.shadowRoot) {
    // replace all child nodes with tempRoot children
    tempRoot.childNodes.forEach((child, i) => {
      el.shadowRoot.replaceChild(child, el.shadowRoot.children[i]);
    });
    applyStyles(el.shadowRoot, sheet);
    mergeAttributes(el, attributes);
    return;
  }

  const root = el.attachShadow({ mode: "open" });
  tempRoot.childNodes.forEach((child) => {
    root.appendChild(child);
  });

  applyStyles(root, sheet);
  mergeAttributes(el, attributes);
  window.addEventListener("load", () => {
    applyStyles(root, sheet);
  });
}

/**
 * @param {string} templateId
 * @return {Promise<any>} TODO: use HTMLElement
 */
async function createCustomElement(templateId) {
  const { fragment, style, script, attributes, element } =
    templateCache.get(templateId);
  const observedAttributes = Array.from(
    new Set(
      Array.from(fragment.querySelectorAll("*")).flatMap((el) => {
        return Array.from(el.attributes)
          .filter((attr) => attr.name.startsWith("data-var-"))
          .map((attr) => attr.name.replace("data-var-", ""));
      })
    )
  );

  const BaseClass = script ? await getBaseClass(script) : HTMLElement;

  return class extends BaseClass {
    static get observedAttributes() {
      return observedAttributes;
    }

    constructor() {
      super();
      this.root = null;
      this.vars = {};
    }

    connectedCallback() {
      if (style) {
        this.sheet = new CSSStyleSheet();
        this.sheet.replaceSync(style.innerHTML);
      } else {
        this.sheet = null;
      }

      this.render();
      this.setup();

      // run super after render so user can query element from root
      super.connectedCallback?.();
      window.addEventListener("load", this.setup);
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();
      window.removeEventListener("load", this.setup);
    }

    /**
     * @param {string} variableKey
     * @param {any} _
     * @param {string} value
     */
    attributeChangedCallback(variableKey, _, value) {
      if (!value) {
        return;
      }

      const defaultTargetAttribute = variableKey.replace("data-var-", "");
      const listeners = this.root.querySelectorAll(`[${variableKey}]`);

      if (listeners.length === 0) {
        this.vars[variableKey] = value;
      }

      listeners.forEach((el) => {
        const targetAttribute =
          el.getAttribute(variableKey) || defaultTargetAttribute;
        el.setAttribute(targetAttribute, value);
      });
    }

    setup = () => {
      const reset = generateResetStyle(element || "div");
      applyStyles(this.root, this.sheet, reset);
    };

    render() {
      const tempRoot = document.createElement("div");
      tempRoot.appendChild(fragment.cloneNode(true));

      bindVariables(tempRoot, this.vars, templateId);
      // @ts-ignore
      mergeAttributes(this, attributes);

      const nonTextChildNodes = Array.from(tempRoot.childNodes).filter(
        (node) => node.nodeType !== 3
      );

      if (!this.shadowRoot) {
        this.root = this.attachShadow({ mode: "open" });
        nonTextChildNodes.forEach((child) => {
          this.root.appendChild(child);
        });
        return;
      }

      nonTextChildNodes.forEach((child, i) => {
        this.root.replaceChild(child, this.root.children[i]);
      });
    }
  };
}

/**
 * @param {HTMLScriptElement} script
 * @return {Promise<any>} TODO: use HTMLElement base class
 */
async function getBaseClass(script) {
  const js = script.innerHTML;
  const encodedJs = encodeURIComponent(js);
  const dataUri = "data:text/javascript;charset=utf-8," + encodedJs;
  const exp = await import(/* @vite-ignore */ dataUri);
  if (!exp.default) {
    throw new Error("Invalid module");
  }

  return exp.default;
}

/**
 * @param {HTMLElement} el
 * @param {NamedNodeMap} attributes
 */
function mergeAttributes(el, attributes) {
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i];
    if (attr.name === "class") {
      const elClass = el.getAttribute("class") || "";
      const templateClass = attr.value || "";
      const classes = new Set(
        elClass.split(" ").concat(templateClass.split(" ")).filter(Boolean)
      );
      el.setAttribute(attr.name, Array.from(classes).join(" "));
    }
  }
}

/**
 * @param {Element | ShadowRoot} root
 * @param {Record<string, string>} vars
 * @param {string} templateId
 */
function bindVariables(root, vars, templateId) {
  root.querySelectorAll("*").forEach((el) => {
    const subscribedVariables = Array.from(el.attributes)
      .filter((attr) => attr.name.startsWith("data-var-"))
      .map((attr) => attr.name);

    if (subscribedVariables.length === 0) {
      return;
    }

    subscribedVariables.forEach((variableKey) => {
      const passedValue = vars[variableKey];
      const defaultTargetAttribute = variableKey.replace("data-var-", "");
      const defaultValue = el.getAttribute(defaultTargetAttribute);

      if (passedValue) {
        if (isCustomElement(el)) {
          // custom elements only propagate attributes because the actual attribute
          // will be set in native DOM nodes.
          const targetAttribute = el.getAttribute(variableKey) || variableKey;
          el.setAttribute(targetAttribute, vars[variableKey]);
        } else {
          const targetAttribute =
            el.getAttribute(variableKey) || defaultTargetAttribute;
          el.setAttribute(targetAttribute, vars[variableKey]);
          el.removeAttribute(variableKey);
        }
      } else if (!defaultValue) {
        console.warn(
          `[sloth] Template \`${templateId}\` requires \`${variableKey}\` but it's missing.`,
          { el }
        );
      }
    });
  });
}

/**
 * @param {Element} el
 * @return {boolean}
 */
function isCustomElement(el) {
  return el.tagName.includes("-") || !!el.attributes.getNamedItem("is");
}

/**
 * @param {string} tagName
 * @return {CSSStyleSheet}
 * @see https://github.com/WICG/webcomponents/issues/224
 */
function generateResetStyle(tagName) {
  const reset = new CSSStyleSheet();
  const display = getNativeDisplay(tagName);
  reset.replaceSync(`
    :host {
      display: ${display};
    }
  `);
  return reset;
}

const CachedNativeDisplay = new Map();

/**
 * @param {string} tagName
 * @return {string}
 */
function getNativeDisplay(tagName) {
  if (CachedNativeDisplay.has(tagName)) {
    return CachedNativeDisplay.get(tagName);
  }

  const el = document.createElement(tagName);
  document.body.appendChild(el);
  const display = window.getComputedStyle(el).display;
  CachedNativeDisplay.set(tagName, display);
  document.body.removeChild(el);
  return display;
}

/**
 * merge root style & scoped style if any, no need to separate between the two
 * this is not web components
 * @param {ShadowRoot} root
 * @param {CSSStyleSheet=} sheet
 * @param {CSSStyleSheet=} reset
 */
function applyStyles(root, sheet, reset) {
  const adoptedStyleSheets = [];

  for (let i = 0; i < document.styleSheets.length; i++) {
    const style = document.styleSheets.item(i);
    const global = new CSSStyleSheet();

    // if the style is not in the same origin, ignore it
    if (
      style.href &&
      style.href.startsWith("http") &&
      !style.href.startsWith("http://localhost")
    ) {
      continue;
    }

    for (let j = style.cssRules.length - 1; j > 0; j--) {
      global.insertRule(style.cssRules.item(j).cssText);
    }

    adoptedStyleSheets.push(global);
  }

  if (sheet) {
    adoptedStyleSheets.push(sheet);
  }

  if (reset) {
    adoptedStyleSheets.push(reset);
  }

  root.adoptedStyleSheets = adoptedStyleSheets;
}

/**
 * @callback visitCallback
 * @param {Vertex} vertex
 * @param {string[]?} path
 */

/**
 *
 * @param {Vertex} vertex
 * @param {visitCallback} cb
 */
function visitDAG(vertex, cb, visited = {}, path = []) {
  const { name, incoming, incomingNames } = vertex;
  if (visited[name]) {
    return;
  }

  path.push(name);
  visited[name] = true;

  incomingNames.forEach((name) => {
    visitDAG(incoming[name], cb, visited, path);
  });

  cb(vertex, path);
  path.pop();
}
