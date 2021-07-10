interface HTMLElement {
  connectedCallback(): void;
  disconnectedCallback(): void;
}

interface PolymorphicElement extends Element, HTMLOrSVGElement {}
