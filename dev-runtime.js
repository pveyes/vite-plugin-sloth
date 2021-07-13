/// <reference types="./sloth" />
// @ts-check

/**
 * @typedef {{ name: string, incoming: Record<string, Vertex>, incomingNames: string[], value: string }} Vertex
 */

/**
 * @typedef {{ fragment: DocumentFragment, style?: HTMLStyleElement }} ElementTemplate
 * @type {Map<string, ElementTemplate>}
 */
const templateCache = new Map();

// @ts-ignore: property .hot is not available on ImportMeta
const hmr = import.meta.hot;

const ROOT_VERTEX_NAME = "root";

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

    /** @type {Array<Document|ShadowRoot>} */
    let roots = [document];
    visitDAG(deps.add(href), (vertex) => {
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

    templateCache.set(template.id, { fragment: template.content, style });
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
    initCustomElement(template.id, template.content);
  });

  // upgrade polymorphic elements to custom element
  /** @type {NodeListOf<PolymorphicElement>} */ (
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
  if (path.indexOf("./") === -1) {
    return root + path;
  }

  const relativePath = path.slice(path.indexOf("./") + 1);
  const upDirLength = path.split("/").filter((p) => p === "..").length;

  const rootSegment = root.split("/").filter(Boolean);
  if (upDirLength > rootSegment.length) {
    throw new Error("import outside of scope " + path);
  }

  return (
    rootSegment.slice(0, rootSegment.length - upDirLength).join("/") +
    relativePath
  );
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
      const target = resolveAbsolutePath(root, path).replace(/\/\//g, "/");
      const templateHTML = await fetch(target).then((res) => res.text());
      const div = document.createElement("div");
      div.innerHTML = templateHTML;
      const template = div.querySelector("template");
      const style = div.querySelector("style");

      if (!template) {
        throw new Error(`Template from ${path} not found`);
      }

      deps.addVertex(target, template.id);
      deps.addEdge(fromName, target);

      /**
       * @type {Array<HTMLLinkElement>}
       */
      const imports = Array.from(div.querySelectorAll("link[rel=import]"));
      if (imports.length === 0) {
        initCustomElement(template.id, template.content, style);
        return;
      }

      const nextRoot = target.split("/").slice(0, -1).join("/");
      await initExternalTemplates(imports, nextRoot + root, target);
      initCustomElement(template.id, template.content, style);
    })
  );
}

/**
 * @param {string} templateId
 * @param {DocumentFragment} fragment
 * @param {HTMLStyleElement=} style
 */
function initCustomElement(templateId, fragment, style) {
  templateCache.set(templateId, { fragment, style });
  customElements.define(templateId, createCustomElement(templateId));
}

/**
 * @param {string} templateId
 * @param {Document|ShadowRoot} root
 */
function replaceCustomElement(templateId, root) {
  const clazz = createCustomElement(templateId);

  // refresh custom elements
  /** @type {NodeListOf<HTMLElement>} */ (
    root.querySelectorAll(templateId)
  ).forEach((node) => {
    node.disconnectedCallback();
    Object.setPrototypeOf(node, clazz.prototype);
    node.connectedCallback();
  });

  // refresh polymorphic elements
  /** @type {NodeListOf<PolymorphicElement>} */ (
    root.querySelectorAll(`[is="${templateId}"]`)
  ).forEach((node) => {
    Object.setPrototypeOf(node, clazz.prototype);
    renderPolymorphicElement(node, templateId);
  });
}

/**
 * @param {PolymorphicElement} el
 * @param {string} templateId
 */
function renderPolymorphicElement(el, templateId) {
  const { fragment, style } = templateCache.get(templateId);
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
    // re-renders
    el.shadowRoot.replaceChild(
      tempRoot.children.item(0),
      el.shadowRoot.children[0]
    );
    applyStyles(el.shadowRoot, sheet);
    return;
  }

  const root = el.attachShadow({ mode: "open" });
  root.appendChild(tempRoot.children.item(0));

  applyStyles(root, sheet);
  window.addEventListener("load", () => {
    applyStyles(root, sheet);
  });
}

/**
 * @param {string} templateId
 */
function createCustomElement(templateId) {
  const { fragment, style } = templateCache.get(templateId);
  const observedAttributes = Array.from(
    new Set(
      Array.from(fragment.querySelectorAll("*")).flatMap((el) => {
        return Array.from(el.attributes)
          .filter((attr) => attr.name.startsWith("data-var-"))
          .map((attr) => attr.name);
      })
    )
  );

  return class extends HTMLElement {
    static get observedAttributes() {
      return observedAttributes;
    }

    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this.vars = {};
    }

    connectedCallback() {
      if (style) {
        this.sheet = new CSSStyleSheet();
        this.sheet.replaceSync(style.innerHTML);
      } else {
        this.sheet = null;
      }

      this.setup();
      this.render();

      window.addEventListener("load", this.setup);
    }

    disconnectedCallback() {
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
      applyStyles(this.root, this.sheet);
    };

    render() {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-template", templateId);
      wrapper.appendChild(fragment.cloneNode(true));

      bindVariables(wrapper, this.vars, templateId);

      if (this.root.children.length === 0) {
        this.root.appendChild(wrapper);
      } else {
        this.root.replaceChild(wrapper, this.root.children[0]);
      }
    }
  };
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
 * merge root style & scoped style if any, no need to separate between the two
 * this is not web components
 * @param {ShadowRoot} root
 * @param {CSSStyleSheet=} sheet
 */
function applyStyles(root, sheet) {
  const adoptedStyleSheets = [];

  for (let i = 0; i < document.styleSheets.length; i++) {
    const style = document.styleSheets.item(i);
    const global = new CSSStyleSheet();
    for (let j = style.cssRules.length - 1; j > 0; j--) {
      global.insertRule(style.cssRules.item(j).cssText);
    }

    adoptedStyleSheets.push(global);
  }

  if (sheet) {
    adoptedStyleSheets.push(sheet);
  }

  root.adoptedStyleSheets = adoptedStyleSheets;
}

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

const deps = new DependencyGraph();
