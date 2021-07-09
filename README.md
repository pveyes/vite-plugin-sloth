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

Add dev-runtime in your JS entry point for HMR support

```js
import "vite-plugin-sloth/dev-runtime";
```

## Usage

Create custom components using HTML template with `id` attribute. The `id` will be used as the name of [custom elements](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements) in dev. This means you have to follow [CE naming convention](https://html.spec.whatwg.org/#valid-custom-element-name) using kebab-case.

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

### External templates

You can also reference external templates using [HTML Imports](https://developer.mozilla.org/en-US/docs/Web/Web_Components/HTML_Imports). Yes, this is deprecated, which means we can ~~ab~~use it.

```html
<html>
  <head>
    <link rel="import" href="./templates/hello-world.html" />
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

### Polymorphic Element

By default custom element will be replaced by a `div` with `data-template` for easier inspection. If you want to change the wrapper element, you can use [`is` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/is)

```html
<section is="hello-world"></section>
```

### Variables

There are 2 use cases for using variables: child element and HTML attribute.

#### Children

To use variable as child element, you use `slot` element. First template must define which slot is available. Slot have `name` attribute that will be used to reference later

```html
<template id="hello-world">
  <h1>Hello, <slot name="name">{name}</slot>!</h1>
</template>
```

Note that you don't actually need to add `{name}` in the `slot` element, it's just there for easier debugging in case you forgot to add matching slot. You can use any placeholder value.

You can then create matching slot by rendering child element (usually using `span` element as it's an inline element, but you can use anything) with `slot` attribute with the same name:

```html
<hello-world>
  <span slot="name">Fatih</span>
</hello-world>
```

It will then be compiled into:

```html
<h1>
  Hello, <span slot="name">Fatih</slot>!
</h1>
```

#### Attributes

You can use variable inside HTML attributes by using data attribute.

Template can define variable placeholder by writing data attribute in any element that needs it.

```html
<template id="hello-world">
  <h1>
    <a data-href>It works!</a>
  </h1>
</template>
```

To pass the variable, you use the same data attribute

```html
<hello-world data-href="https://fatihkalifa.com"></hello-world>
```

By default `sloth` will automatically fill attribute with the same name with the data attribute. For example `data-href` will set `href` attribute. So the above example compiles into:

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
    <a data-href href="http://data.href/empty">It works!</a>
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

If you want to change how data attribute maps to different attribute, pass attribute name to the data attribute. For example, `data-link="href"` means the component read `data-link` attribute from parent element, but will be used as `href`.

```html
<!-- template -->
<template id="hello-world">
  <h1>
    <a data-link="href">It works!</a>
  </h1>
</template>

<!-- usage: pass the same `data-link` attribute -->
<hello-world data-link="https://github.com/pveyes"></hello-world>

<!-- result -->
<div data-template="hello-world">
  <h1>
    <a href="http://github.com/pveyes">It works!</a>
  </h1>
</div>
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
