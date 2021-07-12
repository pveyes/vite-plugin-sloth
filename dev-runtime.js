/// <reference types="./sloth" />
// @ts-check

/**
 * @typedef {{ name: string, incoming: Record<string, Vertex>, incomingNames: string[], value: string }} Vertex
 */

/**
 * @type {Map<string, DocumentFragment>}
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

    templateCache.set(template.id, template.content);

    roots.forEach((root) => {
      replaceCustomElement(template.id, template.content, root);
    });
  });

  // Setup custom elements from external templates.
  // Assign the promise so we can wait if some polymorphic elements
  // uses external template
  const externalTemplatesReady = fetchExternalDependencies(
    Array.from(document.querySelectorAll("link")).filter(
      (link) => link.rel === "import" && link.href.endsWith("html")
    )
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

    renderPolymorphicElement(el, name, template);
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
function fetchExternalDependencies(
  paths,
  root = "/",
  fromName = ROOT_VERTEX_NAME
) {
  return Promise.all(
    paths.map(async (link) => {
      const url = new URL(link.href);

      if (url.hostname === "localhost") {
        throw new Error(
          "You need to use double slash to prefix your HTML imports"
        );
      }

      const path = link.href.replace("http://", "");
      const target = resolveAbsolutePath(root, path);
      const templateHTML = await fetch(target).then((res) => res.text());
      const div = document.createElement("div");
      div.innerHTML = templateHTML;
      const template = div.querySelector("template");

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
        initCustomElement(template.id, template.content);
        return;
      }

      const nextRoot = target.split("/").slice(0, -1).join("/");
      await fetchExternalDependencies(imports, nextRoot + root, target);
      initCustomElement(template.id, template.content);
    })
  );
}

/**
 * @param {string} templateId
 * @param {DocumentFragment} fragment
 */
function initCustomElement(templateId, fragment) {
  templateCache.set(templateId, fragment);
  customElements.define(templateId, createCustomElement(templateId, fragment));
}

/**
 * @param {string} templateId
 * @param {DocumentFragment} fragment
 * @param {Document|ShadowRoot} root
 */
function replaceCustomElement(templateId, fragment, root) {
  const clazz = createCustomElement(templateId, fragment);

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
    renderPolymorphicElement(node, templateId, fragment);
  });
}

/**
 * @param {PolymorphicElement} el
 * @param {string} templateId
 * @param {DocumentFragment} fragment
 */
function renderPolymorphicElement(el, templateId, fragment) {
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

  if (el.shadowRoot) {
    // re-renders
    el.shadowRoot.replaceChild(
      tempRoot.children.item(0),
      el.shadowRoot.children[0]
    );
    return;
  }

  const root = el.attachShadow({ mode: "open" });
  root.appendChild(tempRoot.children.item(0));

  injectGlobalStyle(root);
  window.addEventListener("load", () => {
    injectGlobalStyle(root);
  });
}

/**
 * @param {string} templateId
 * @param {DocumentFragment} fragment
 */
function createCustomElement(templateId, fragment) {
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
      injectGlobalStyle(this.root);
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
 * who needs scoped style, this is not web components
 * @param {ShadowRoot} root
 */
function injectGlobalStyle(root) {
  for (let i = 0; i < document.styleSheets.length; i++) {
    const style = document.styleSheets.item(i);
    const sheet = new CSSStyleSheet();
    for (let j = style.cssRules.length - 1; j > 0; j--) {
      sheet.insertRule(style.cssRules.item(j).cssText);
    }

    // @ts-ignore: https://github.com/microsoft/TypeScript/issues/30022
    root.adoptedStyleSheets = [sheet];
  }
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
