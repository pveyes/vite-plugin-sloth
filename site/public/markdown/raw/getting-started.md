# Getting Started

We recommend creating a new vanilla Vite app using [create-vite](https://vitejs.dev/guide/#scaffolding-your-first-vite-project), which sets up initial boilerplate automatically for you.

```sh
yarn create vite my-sloth-app --template vanilla
```

You can then install Sloth by running:

```sh
cd my-sloth-app
yarn install vite-plugin-sloth -D
```

Create new `vite.config.js`, and add Sloth plugin

```js
import sloth from "vite-plugin-sloth";

export default {
  plugins: [sloth()],
};
```

Run Vite dev server

```bash
yarn dev
```

You should be able to see default page, there should be no errors. The plugin by default doesn't do anything if you don't use it in your HTML.

Next, we'll see how we create reusable components using HTML templates.

[Next Page](/site/public/markdown/raw/basic-features.md)
