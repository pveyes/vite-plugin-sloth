if (import.meta.hot) {
  window.__template__ = {};

  import.meta.hot.on('template-update', async (data) => {
    const segment = data.path.split('/');
    const matchingLink = Array.from(document.querySelectorAll('link'))
      .find(link => link.getAttribute('href').endsWith(`${segment[segment.length - 1]}`));

    if (!matchingLink) {
      return;
    }

    console.log('reloading', matchingLink);

    const templateHTML = await fetch(matchingLink.href, {
      headers: {
        pragma: 'no-cache',
        'cache-control': 'no-cache'
      },
    }).then(res => res.text());
    const div = document.createElement('div');
    div.innerHTML = templateHTML;
    const t = div.querySelector('template');
    replaceCustomElement(t.id, t.content);
    // perform custom update
  })

  // setup custom elements from external templates
  Array.from(document.querySelectorAll('link'))
    .filter(link => link.rel === 'import' && link.href.endsWith('html'))
    // using forEach is fine here because we don't need to wait for
    // everything to load before continuing
    .forEach(async link => {
      const templateHTML = await fetch(link.href).then(res => res.text());
      const div = document.createElement('div');
      div.innerHTML = templateHTML;
      const t = div.querySelector('template');

      if (!t) {
        throw new Error(`Template from ${link.href} not found`);
      }

      initCustomElement(t.id, t.content);
    });

  // as well as inline templates
  document.querySelectorAll('template').forEach(t => {
    initCustomElement(t.id, t.content);
  });

  function initCustomElement(name, t) {
    window.__template__[name] = t;
    customElements.define(name, createCustomElement(name, t))
  }

  function createCustomElement(name, t) {
    return class extends HTMLElement {

      constructor() {
        super();

        this.root = this.attachShadow({ mode: 'open' });
      }

      connectedCallback() {
        window.addEventListener('load', this.setup);

        this.render();
        this.setup();
      }

      disconnectedCallback() {
        window.removeEventListener('load', this.setup)
      }

      setup = () => {
        injectGlobalStyle(this.root);

        this.root.querySelectorAll('*').forEach(el => {
          const data = Array.from(el.attributes).flatMap(attr => {
            if (attr.name.startsWith('data-') && attr.name !== 'data-template') {
              return {
                key: attr.name.replace('data-', ''),
                value: attr.value
              }
            }
            return [];
          });

          if (data.length === 0) {
            return;
          }

          data.forEach(({ key, value: targetAttribute }) => {
            const attr = targetAttribute || key;
            const value = this.dataset[key]
            if (value) {
              el.setAttribute(attr, value);
              el.removeAttribute(`data-${key}`);
            }
          });
        });
      }

      render() {
        const el = document.createElement('div');
        el.setAttribute('data-template', name);
        el.appendChild(t.cloneNode(true));
        if (this.root.children.length === 0) {
          this.root.appendChild(el);
        } else {
          this.root.replaceChild(el, this.root.children[0]);
        }
      }
    }
  }

  // upgrade polymorphic elements to custom element
  document.querySelectorAll('[is]').forEach(el => {
    const root = el
      .attachShadow({ mode: 'open' })

    root.appendChild(__template__[el.getAttribute('is')].cloneNode(true));

    window.addEventListener('load', () => {
      injectGlobalStyle(root);
    });
  });

  // who needs scoped style, this is not web components
  function injectGlobalStyle(root) {
    for (let i = 0; i < document.styleSheets.length; i++) {
      const style = document.styleSheets.item(i);
      const sheet = new CSSStyleSheet();
      for (let j = style.cssRules.length - 1; j > 0; j--) {
        sheet.insertRule(style.cssRules.item(j).cssText)
      }

      root.adoptedStyleSheets = [
        sheet
      ];
    }
  }

  function replaceCustomElement(name, t) {
    window.__template__[name] = t;
    const clazz = createCustomElement(name, t);

    document.querySelectorAll(name).forEach(node => {
      Object.setPrototypeOf(node, clazz.prototype);
      node.connectedCallback();
    });
  }
}
