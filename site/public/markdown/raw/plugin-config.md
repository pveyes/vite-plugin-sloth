# Plugin Config

If you don't want the slot container component (such as `span`) to be included in build output, you can use `flattenSlot` options in plugin config.

```js
import sloth from "vite-plugin-sloth";

export default {
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
  <span slot="name">Sloth</span>
</hello-world>

<!-- result: no <span> element -->
<div data-template="hello-world">
  <h1>Hello, Sloth!</h1>
</div>
```

**Note that because this affect HTML output, style that depends on specific DOM structure might break.**

You can also provide more fine-grained rule to slot flattening, by either using array of HTML tags, or a filter function

```js
export default {
  plugins: [
    // ...other plugins
    sloth({
      // flatten all span and div slot
      // but leave the rest
      flattenSlot: ['span', 'div'],
      // or use filter function
      flattenSlot = element => {
        // flatten span elements
        if (element.tagName === 'span') {
          return true;
        }
      }
    }),
  ],
});
```
