# vite-plugin-sloth

Simple Static Site Generator using HTML [`template`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template) and [`slot`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/slot) element powered by [Vite](https://vitejs.dev/).  _~~ab~~use the platform_.

[[ [example](./example) ]]

## Usage

Extends vite config:

```js
import { defineConfig } from 'vite';
import sloth from 'vite-plugin-sloth';

// @see https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // ...other plugins
    sloth(),
  ],
})
```

Add dev-runtime in your JS entry point for HMR support

```js
import 'vite-plugin-sloth/dev-runtime';
```

Done. When you write this HTML:

```html
<html>
  <head>
    <title>Sloth</title>
  </head>

  <body>
    <hello-world>
      <span slot="name">Fatih</slot>
    </hello>

    <template id="hello-world">
      <h1>
        <slot name="name">{name}</slot>
      </h1>
    </template>
  </body>
</html>
```

it will be compiled to this

```html
<html>
  <head>
    <title>Sloth</title>
  </head>

  <body>
    <div data-template="hello-world">
      <h1><span slot="name">Fatih</span></h1>
    </div>
  </body>
</html>
```

You don't actually need to add `{name}` in the `slot` element, it's there just for easier debugging in case you forgot to add matching slot.

### External templates

You can also reference external templates using HTML import. Yes, this is deprecated, which means we can ~~ab~~use it.

```html
<html>
  <head>
    <link rel="import" href="./templates/hello-world.html" />
  </head>

  <body>
    <hello-world>
      <span slot="name">Fatih</slot>
    </hello>
  </body>
</html>
```

This is the result

```html
<html>
  <head>
  </head>

  <body>
    <div data-template="hello-world">
      <h1><span slot="name">Fatih</span></h1>
    </div>
  </body>
</html>
```

### Polymorphic Element

By default custom element will be replaced by a `div` with `data-template` for easier inspection. If you want to change the wrapper element, you can use [`is` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/is)

```html
<section is="hello-world">
  <span slot="name">Fatih</slot>
</section>
```

### Variables

You can use variable inside HTML attributes if you need it by using data attribute. Template can define variable placeholder by using the same data attribute. This is intentionally limited to simple string replace.

```html
<hello-world data-href="https://fatihkalifa.com">
  <span slot="name">Fatih</slot>
</hello>

<template id="hello-world">
  <h1>
    <a data-href href="https://fallback.or/default/value">
      <slot name="name">{name}</slot>
    </a>
  </h1>
</template>
```

By default variable is only attached to the attribute with matching data attribute, e.g: `data-href` only binds to `href`. You can override this by passing a custom attribute to the data attribute, like `<a data-link="href">`.

```html
<hello-world data-link="https://fatihkalifa.com">
  <span slot="name">Fatih</slot>
</hello>

<template id="hello-world">
  <h1>
    <a data-link="href" href="https://fallback.or/default/value">
      <slot name="name">{name}</slot>
    </a>
  </h1>
</template>
```

### Loop, Map, Filter, Reduce

This is HTML not JavaScript

### Flatten Slot

If you don't want the slot container component (such as `span`) to be included in build output, you can use `flattenSlot` options. 

```js
import { defineConfig } from 'vite';
import sloth from 'vite-plugin-sloth';

// @see https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // ...other plugins
    sloth({
      flattenSlot: true
    }),
  ],
})
```

With this option, above example becomes:

```html
<html>
  <head>
  </head>

  <body>
    <div data-template="hello-world"><h1>Fatih</h1></div>
  </body>
</html>
```

**Note that because this affect your HTML, style that depends on specific DOM structure might break.**

## License 

MIT
