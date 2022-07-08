# Basic Features

You don't need to learn or know Custom Elements beforehand to use Sloth, nor your knowledge of Custom Elements will be useless.

Most concepts introduced in Sloth is a native web platform features. Of course, there will be something specific in sloth to fill missing platform capabilities, but we'll still be using HTML.

## Templates

Templates are basic building blocks in Sloth. Sloth leverages native HTML [`template`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template), so if you're already familiar with it, you'll feel at home. Templates in Sloth must have a uniquely-identified `id`. This `id` will be used as Custom Elements name in dev, and as a prefix in prod to simulate scoped styles.

Template can contains any HTML element that you typically find inside `body` tag. Elements inside a template can reference any global styles defined in root `index.html`. You shouldn't add `style` or `script` tag inside a template as it's not supported.

We'll see later how we can enhance our templates with custom style and script.

```html
<template id="hello-world">
  <h1 class="heading">It works!</h1>
</template>
```

Tips for naming template `id`:

1. Prefix with feature / page name for specific elements, e.g: `docs-header`.
2. Use `x-` (or any other short letter) prefix for shared elements, e.g: `x-header`.

### Using Custom Elements

You use template by referencing its `id`

```html
<hello-world></hello-world>
```

In dev, this will be rendered to actual Custom Elements. In build time, this will be compiled statically to native HTML elements so you don't have to worry about browser support or polyfill. All sloth build output behaves like regular HTML elements without Shadow DOM.

```html
<div data-template="hello-world">
  <h1 class="heading">It works!</h1>
</div>
```

## Slot

Slot is a placeholder element that you can replace when using a custom element. It is similar to `children` props in React.

First, a template must define a slot that user can fill later. Template can have multiple slot, each uniquely identifiable by its `name` attribute.

```html
<template id="hello-world">
  <h1 class="heading">
    Hello, <slot name="name">{name}</slot>
  </h1>
  <div>Good <slot name="time"></div>
</template>
```

> You don't have to add children (such as `{name}`) inside slot element, but it can be useful in case you forgot to fill the slot as it will be visible in the screen.

You fill slot by using any HTML element with `slot` attribute matching the `slot` name. Usually a `span` element is used because it's an inline element, but you can use any element.

```html
<hello-world>
  <span slot="name">Sloth</span>
  <div slot="time">night</div>
</hello-world>
```

This will be compiled in build time into

```html
<div data-template="hello-world">
  <h1 class="heading">Hello, <span>Sloth</span></h1>
  <div>Good <span>night</span></div>
</div>
```

## Variables

There's no concept of variables (or props) in HTML templates and Custom Elements, only attributes.

To help with attributes assignment and forwarding, Sloth defines a convention by using [data attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/data-*) with a `var-` prefix.

Template can define variable placeholder by writing data attribute in any element that needs it.

```html
<template id="hello-world">
  <h1>
    <a data-var-href>It works!</a>
  </h1>
</template>
```

To pass the variable, you use the attribute that's attached to `var-` prefix

```html
<hello-world href="https://github.com/pveyes/vite-plugin-sloth"></hello-world>
```

By default Sloth will automatically fill the attribute with the same name with its `data-var` equivalent. For example, `data-var-href` will set `href` attribute. So the above example compiles into:

```html
<div data-template="hello-world">
  <h1>
    <a href="https://github.com/pveyes/vite-plugin-sloth">It works!</a>
  </h1>
</div>
```

You can also mark data as optional by providing fallback value using the same attribute.

```html
<!-- template -->
<template id="hello-world">
  <h1>
    <a data-var-href href="http://default">It works!</a>
  </h1>
</template>

<!-- usage: no need to pass `href` because it's optional -->
<hello-world></hello-world>

<!-- result -->
<div data-template="hello-world">
  <h1>
    <a href="http://default">It works!</a>
  </h1>
</div>
```

### Named Variables

If you want to use different name for your variables, pass attribute name as the value in the data attribute.

For example, `data-var-link="href"` means the component read `link` attribute from parent element, but the value will be passed to `href` attribute.

```html
<!-- template -->
<template id="hello-world">
  <h1>
    <a data-var-link="href">It works!</a>
  </h1>
</template>

<!-- usage: pass `link` attribute -->
<hello-world link="https://github.com/pveyes"></hello-world>

<!-- result -->
<div data-template="hello-world">
  <h1>
    <a href="http://github.com/pveyes">It works!</a>
  </h1>
</div>
```

### Attribute Forwarding

If you want to forward data attribute to another custom element, use the same data attribute.

```html
<hello-world link="https://github.com/pveyes/vite-plugin-sloth"></hello-world>

<!-- template -->
<template id="hello-world">
  <h1>
    <!-- this will forward `link` from <hello-world /> to <link-component /> -->
    <link-component data-var-link></link-component>
  </h1>
</template>

<template id="link-component">
  <!-- use `link` from <hello-world /> -->
  <a data-var-link="href"> It works! </a>
</template>
```

## External Templates

You can reference external templates using [HTML Imports](https://developer.mozilla.org/en-US/docs/Web/Web_Components/HTML_Imports). Yes, this is deprecated, which means we can ~~ab~~use it.

> Quick note: Due to how Vite handles `href` in `link` tag, you need to put your template files inside [public directory](https://vitejs.dev/guide/assets.html#the-public-directory) and reference top-level import using absolute path.

```html
<html>
  <head>
    <link rel="import" href="/templates/hello-world.html" />
  </head>

  <body>
    <hello-world></hello-world>
  </body>
</html>
```

This is the result

```html
<html>
  <head> </head>

  <body>
    <div data-template="hello-world">
      <h1>It works</h1>
    </div>
  </body>
</html>
```

As you see, the template is rendered inline and HTML imports are removed from the output.

### Template Dependencies

You can also import other templates in an external template. Here you can use relative path, but you still need to put them inside public directory so it's still accessible by Vite dev server.

```html
<link rel="import" href="./heading-text.html" />
<link rel="import" href="../another-component.html" />

<template id="hello-world">
  <heading-text>It works!</heading-text>
  <another-component></another-component>
</template>
```

## Scoped Styles

Using external templates allows you to define scoped style that only applies to elements inside the template. To use scoped style, add style tag in your template file.

```html
<style>
  h1 {
    font-size: max(10vw, 10vh);
  }
</style>

<template id="hello-world">
  <h1>It works!</h1>
</template>
```

In build-time, the style will be hoisted to root, and all of its selectors will be scoped by template id.

## Element Extensions

If you want to add a sprinkle of JS to make your components more interactive, you can create `script` tag, and export a class that extends `HTMLElement`, same as creating Custom Elements class.

Sloth will guarantee that any Slot, Variables, and Scoped Styles will be initialized before `connectedCallback` is executed.

```html
<template id="hello-world">
  <h1>It works!</h1>
</template>

<script type="module">
  export default class HelloWorld extends HTMLElement {
    connectedCallback() {
      alert("HA!");
    }
  }
</script>
```

### Query Element

To query element inside Custom Elements, you can use `this.root` instead of `document`:

```html
<template id="hello-world">
  <h1>It works!</h1>
</template>

<script type="module">
  export default class HelloWorld extends HTMLElement {
    connectedCallback() {
      this.root.querySelector("h1").classList.add("mounted");
    }
  }
</script>
```

You can also query element inside another shadow DOM by using `this`. For example, here we want to query a `span` inside `another-element`

```html
<link rel="import" href="../another-component.html" />

<template id="hello-world">
  <h1>It works!</h1>
  <another-element></another-element>
</template>

<script type="module">
  export default class HelloWorld extends HTMLElement {
    connectedCallback() {
      this.querySelector("span").style.display = "none";
    }
  }
</script>
```

### 3rd-party dependencies

You can also import external dependencies using [Skypack](https://www.skypack.dev/).

```html
<template id="hello-world">
  <h1>It works!</h1>
</template>

<script type="module">
  import confetti from "https://cdn.skypack.dev/canvas-confetti";

  export default class HelloWorld extends HTMLElement {
    connectedCallback() {
      confetti();
    }
  }
</script>
```

<button id="confetti" class="py-1 px-8 rounded-sm bg-accent-500 text-sm text-white hover:bg-accent-600" aria-label="Show confetti">Try it</button>

### Lifecycle Cleanup

If you have event listeners or other cancellable operations, put the cleanup logic in `disconnectedCallback` method.

```html
<script type="module">
  export default class HelloWorld extends HTMLElement {
    connectedCallback() {
      window.addEventListener("scroll", this.handleScroll);
    }

    disconnectedCallback() {
      window.removeEventListener("scroll", this.handleScroll);
    }

    handleScroll = () => {};
  }
</script>
```

This will only be used in HMR cleanup phase, as there's no concept of disconnect in static build.

[Previous Page](/site/public/markdown/raw/getting-started.md)

[Next Page](/site/public/markdown/raw/advanced-features.md)
