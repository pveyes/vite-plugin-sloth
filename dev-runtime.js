/// <reference types="./sloth" />
// @ts-check
/**
 * @type {Map<string, DocumentFragment>}
 */
const templateCache = new Map();

// @ts-ignore: property .hot is not available on ImportMeta
const hmr = import.meta.hot;

if (hmr) {
  hmr.on("template-update", async (data) => {
    const segment = data.path.split("/");
    const matchingLink = Array.from(document.querySelectorAll("link")).find(
      (link) =>
        link.getAttribute("href").endsWith(`${segment[segment.length - 1]}`)
    );

    if (!matchingLink) {
      return;
    }

    const templateHTML = await fetch(matchingLink.href, {
      headers: {
        pragma: "no-cache",
        "cache-control": "no-cache",
      },
    }).then((res) => res.text());
    const div = document.createElement("div");
    div.innerHTML = templateHTML;
    const t = div.querySelector("template");
    replaceCustomElement(t.id, t.content);
    // perform custom update
  });

  // Setup custom elements from external templates.
  // Assign the promise so we can wait if some polymorphic elements
  // uses external template
  const externalTemplatesReady = Promise.all(
    Array.from(document.querySelectorAll("link"))
      .filter((link) => link.rel === "import" && link.href.endsWith("html"))
      .map(async (link) => {
        const templateHTML = await fetch(link.href).then((res) => res.text());
        const div = document.createElement("div");
        div.innerHTML = templateHTML;
        const t = div.querySelector("template");

        if (!t) {
          throw new Error(`Template from ${link.href} not found`);
        }

        initCustomElement(t.id, t.content);
      })
  );

  // as well as inline templates
  document.querySelectorAll("template").forEach((t) => {
    initCustomElement(t.id, t.content);
  });

  // upgrade polymorphic elements to custom element
  /** @type {NodeListOf<PolymorphicElement>} */ (
    document.querySelectorAll("[is]")
  ).forEach(async (el) => {
    const name = el.getAttribute("is");

    let t = templateCache.get(name);
    if (!t) {
      // only wait for external templates if it doesn't exist in the cache
      await externalTemplatesReady;
      t = templateCache.get(name);

      // by now, template must be resolved or is not defined everywhere
      if (!t) {
        console.error(
          `[sloth] Template ${name} not found for polymorphic element`,
          { el }
        );
      }
    }

    renderPolymorphicElement(el, name, t);
  });
}

/**
 * @param {string} name
 * @param {DocumentFragment} t
 */
function initCustomElement(name, t) {
  templateCache.set(name, t);
  customElements.define(name, createCustomElement(name, t));
}

/**
 * @param {string} name
 * @param {DocumentFragment} t
 */
function replaceCustomElement(name, t) {
  templateCache.set(name, t);
  const clazz = createCustomElement(name, t);

  // refresh custom elements
  /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll(name)
  ).forEach((node) => {
    node.disconnectedCallback();
    Object.setPrototypeOf(node, clazz.prototype);
    node.connectedCallback();
  });

  // refresh polymorphic elements
  /** @type {NodeListOf<PolymorphicElement>} */ (
    document.querySelectorAll(`[is="${name}"]`)
  ).forEach((node) => {
    Object.setPrototypeOf(node, clazz.prototype);
    renderPolymorphicElement(node, name, t);
  });
}

/**
 * @param {PolymorphicElement} el
 * @param {string} name
 * @param {DocumentFragment} t
 */
function renderPolymorphicElement(el, name, t) {
  if (el.shadowRoot) {
    // re-renders
    el.shadowRoot.replaceChild(t.cloneNode(true), el.shadowRoot.children[0]);
    bindVariables(el.shadowRoot, el, name);
    return;
  }

  const root = el.attachShadow({ mode: "open" });
  root.appendChild(t.cloneNode(true));

  bindVariables(root, el, name);

  window.addEventListener("load", () => {
    injectGlobalStyle(root);
  });
}

/**
 * @param {string} name
 * @param {DocumentFragment} t
 */
function createCustomElement(name, t) {
  return class extends HTMLElement {
    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
      this.setup();
      this.render();

      window.addEventListener("load", this.setup);
    }

    disconnectedCallback() {
      window.removeEventListener("load", this.setup);
    }

    setup = () => {
      injectGlobalStyle(this.root);
    };

    render() {
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-template", name);
      wrapper.appendChild(t.cloneNode(true));

      bindVariables(wrapper, this, name);

      if (this.root.children.length === 0) {
        this.root.appendChild(wrapper);
      } else {
        this.root.replaceChild(wrapper, this.root.children[0]);
      }
    }
  };
}

/**
 * @param {Element | ShadowRoot} wrapper
 * @param {HTMLOrSVGElement} instance
 * @param {string} templateName
 */
function bindVariables(wrapper, instance, templateName) {
  wrapper.querySelectorAll("*").forEach((el) => {
    const data = Array.from(el.attributes).flatMap((attr) => {
      if (attr.name.startsWith("data-") && attr.name !== "data-template") {
        return {
          key: attr.name.replace("data-", ""),
          value: attr.value,
        };
      }
      return [];
    });

    if (data.length === 0) {
      return;
    }

    data.forEach(({ key, value: targetAttribute }) => {
      const attr = targetAttribute || key;
      const value = instance.dataset[key];
      const defaultValue = el.attributes.getNamedItem(attr);
      if (value) {
        el.setAttribute(attr, value);
        el.removeAttribute(`data-${key}`);
      } else if (!defaultValue) {
        console.warn(
          `[sloth] Template \`${templateName}\` requires \`data-${key}\` but it's missing`,
          { el }
        );
      }
    });
  });
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
