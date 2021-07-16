# Advanced Features

These features below is not required to build a fully functioning components, but it allows you to work around some web platform limitations.

## Polymorphic Elements

By default custom element will be replaced by a `div` with a `data-template` attribute. If you want to change the wrapper element to be other than `div`, you can use [`is` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/is) in HTML element.

```html
<section is="hello-world"></section>
```

Unfortunately, [the spec](https://dom.spec.whatwg.org/#ref-for-dom-element-attachshadow%E2%91%A0) limits the number of elements that are allowed to be a shadow root.

For example, you can't use `is` attribute in a `li` element, even though creating a reusable `list-item` element makes sense.

To work around this, you can add `data-element` in your template definition. Note that this only applies to production build due to limitation described above. In dev, it only influences CSS property, so the Custom Elements have the [same `display` value as `data-element`](https://github.com/WICG/webcomponents/issues/224).

```html
<template id="hello-world" data-element="li"> ... </template>
```

This is also useful if you want to always use the specified element rather than using `is` attribute manually.

## Host Styles

If you want to style the root wrapper of your custom element, there are two methods that you can choose: scoped style or global style.

First alternative is to use scoped style that targets `:host` selector.

```html
<style>
  :host {
    height: 100vh;
  }
</style>

<template id="x-element"> ... </template>
```

In build time all `:host` selectors will be replaced by `[data-template="x-element"]` selector.

```html
<style>
  [data-template="x-element"] {
    height: 100vh;
  }
</style>

<div data-template="x-element">...</div>
```

Alternatively, you can also add the class name directly in the `template` tag

```html
<template id="x-element" class="h-screen"> ... </template>
```

Or in the Custom Elements itself

```html
<x-element class="h-screen"></x-element>
```

## HTML Includes

HTML doesn't really have the concept of includes here so we're going to deviate a little bit here, similar to external templates.

In static site generation context, sometimes it's useful to have this capability. For example you want to write your documentation in markdown, and the rest in HTML. You can compile the markdown to HTML and include it in your main HTML file.

Remember the old days where we ~~ab~~use `script` tag with an unknown `type` attribute to store a template? Here we're going to do the same thing.

Add a script tag with `text/html` type and an `src` attribute.

```html
<body>
  <aside></aside>
  <main>
    <div id="content">
      <script type="text/html" src="/markdown/docs.html"></script>
    </div>
  </main>
</body>
```

It will replace the `#content` children with the content from `public/markdown/docs.html`.

```html
<body>
  <aside></aside>
  <main>
    <div id="content">...</div>
  </main>
</body>
```

Similar to external templates, we need HTML includes files to be placed inside public directory. The main difference is HTML includes must always be referenced in the `src` attribute **using absolute path**.
