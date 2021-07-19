interface HTMLElement {
  connectedCallback(): void;
  disconnectedCallback(): void;
}

interface CSSStyleSheet {
  replaceSync(cssText: string): void;
}

interface ShadowRoot {
  adoptedStyleSheets: CSSStyleSheet[];
}
