# vite-plugin-sloth

Simple Static Site Generator using HTML [`template`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template) and [`slot`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/slot) element powered by [Vite](https://vitejs.dev/). _~~ab~~use the platform_.

[[[example](./example)]]

## Setup

Extends vite config:

```js
import { defineConfig } from "vite";
import sloth from "vite-plugin-sloth";

// @see https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // ...other plugins
    sloth(),
  ],
});
```

## Usage

Create custom components using HTML template with `id` attribute. The `id` will be used as the name of [Custom Elements](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements) in dev. This means you have to follow Custom Elements [naming convention](https://html.spec.whatwg.org/#valid-custom-element-name) using `kebab-case`.

```html
<template id="hello-world">
  <h1>It works!</h1>
</template>
```

Write custom elements to reuse components.

```html
<hello-world></hello-world>
```

In build-time, the component will be compiled like this:

```html
<div data-template="hello-world">
  <h1>It works!</h1>
</div>
```

### Styling

Even though you're using Custom Elements, you can still reference any global style inside the template, unlike typical Web Components. This means you can bring any CSS pre-processor or CSS framework you like, for example: Tailwind.

```html
<template id="hello-world">
  <h1 class="text-lg text-pink-400 hover:text-pink-800">It works!</h1>
</template>
```

Alternatively, you can use [scoped styles](#scoped-styles) by using external templates.

### External templates

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

You can also reference other templates in an external template. Here you can use relative path, but you still need to put them inside public directory.

```html
<!-- file: public/templates/hello-world.html -->

<!-- this will be resolved to public/templates/heading-text.html -->
<link rel="import" href="./heading-text.html" />
<!-- this will be resolved to public/heading-text.html -->
<link rel="import" href="../another-component.html" />

<template id="hello-world">
  <heading-text>It works!</heading-text>
</template>
```

### Scoped Styles

Using external templates allow you to define scoped style that only applies to elements inside template. To use scoped style, add style tag in your template file.

```html
<!-- file: public/templates/hello-world.html -->
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

### Polymorphic Element

By default custom element will be replaced by a `div` with `data-template` for easier inspection. If you want to change the wrapper element, you can use [`is` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/is) in any HTML element.

```html
<section is="hello-world"></section>
```

### Variables

There are 2 use cases for using variables: to be rendered as visible text, and as HTML attribute.

#### Text

To use variable as text / child element, you use `slot` element. Template can define however many slot they need. Slot have `name` attribute that will be used to reference later. `name` in slot is scoped by its template, so different template can have slot with same `name`.

```html
<template id="hello-world">
  <h1>Hello, <slot name="name">{name}</slot>!</h1>
</template>
```

Note that you don't actually need to add `{name}` as children in the `slot` element, it's just there for easier debugging in case you forgot to add matching slot. You can use any placeholder value.

You can then create matching slot by rendering child element (usually using `span` element as it's an inline element, but you can use anything) with `slot` attribute with the same name:

```html
<hello-world>
  <span slot="name">Fatih</span>
</hello-world>
```

It will then be compiled into:

```html
<div data-template="hello-world">
  <h1>
    Hello, <span slot="name">Fatih</slot>!
  </h1>
</div>
```

#### Attributes

You can use variable inside HTML attributes by using [data attributes](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/data-*) with `var-` prefix.

Template can define variable placeholder by writing data attribute in any element that needs it.

```html
<template id="hello-world">
  <h1>
    <a data-var-href>It works!</a>
  </h1>
</template>
```

To pass the variable, you use the same data attribute

```html
<hello-world data-var-href="https://fatihkalifa.com"></hello-world>
```

By default `sloth` will automatically fill attribute with the same name with the data attribute. For example, `data-var-href` will set `href` attribute. So the above example compiles into:

```html
<div data-template="hello-world">
  <h1>
    <a href="https://fatihkalifa.com">It works!</a>
  </h1>
</div>
```

You can also mark data as optional by providing fallback value using the same attribute.

```html
<!-- template -->
<template id="hello-world">
  <h1>
    <a data-var-href href="http://data.href/empty">It works!</a>
  </h1>
</template>

<!-- usage: no need to pass data-href because it's optional -->
<hello-world></hello-world>

<!-- result -->
<div data-template="hello-world">
  <h1>
    <a href="http://data.href/empty">It works!</a>
  </h1>
</div>
```

If you want to map to different attribute, pass attribute name as the value in the data attribute. For example, `data-var-link="href"` means the component read `data-var-link` attribute from parent element, but will be used as `href`.

```html
<!-- template -->
<template id="hello-world">
  <h1>
    <a data-var-link="href">It works!</a>
  </h1>
</template>

<!-- usage: pass the same `data-link` attribute -->
<hello-world data-var-link="https://github.com/pveyes"></hello-world>

<!-- result -->
<div data-template="hello-world">
  <h1>
    <a href="http://github.com/pveyes">It works!</a>
  </h1>
</div>
```

If you want to forward data attribute to custom element, simply use the same data attribute.

```html
<hello-world
  data-var-link="https://github.com/pveyes/vite-plugin-sloth"
></hello-world>

<!-- template -->
<template id="hello-world">
  <h1>
    <!-- this will forward data-var-link to <link-component /> -->
    <link-component data-var-link></link-component>
  </h1>
</template>

<template id="link-component">
  <!-- use data-var-link from <hello-world /> -->
  <a data-var-link="href"> It works! </a>
</template>
```

### Conditional, Loop, Map, Filter, Reduce

This is HTML not JavaScript

### Flatten Slot

If you don't want the slot container component (such as `span`) to be included in build output, you can use `flattenSlot` options.

```js
import { defineConfig } from "vite";
import sloth from "vite-plugin-sloth";

// @see https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // ...other plugins
    sloth({
      flattenSlot: true,
    }),
  ],
});
```

This changes the build output to be like this

```html
<!-- template -->
<template id="hello-world">
  <h1>Hello, <slot name="name">{name}</slot>!</h1>
</template>

<!-- usage: use slot attribute as usual -->
<hello-world>
  <span slot="name">Fatih</span>
</hello-world>

<!-- result: no <span> element -->
<div data-template="hello-world">
  <h1>Hello, Fatih!</h1>
</div>
```

**Note that because this affect HTML output, style that depends on specific DOM structure might break.**

## License

MIT
