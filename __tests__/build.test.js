const path = require("path");
const fs = require("fs");
const cheerio = require("cheerio");
const css = require("css");

const $index = cheerio.load(
  fs.readFileSync(path.join(__dirname, "../site/dist/index.html"), "utf-8")
);

test("must not contain HTML import", () => {
  expect($index('link[rel="import"]').length).toBe(0);
});

test("must not contain inline template tag", () => {
  expect($index("template").length).toBe(0);
});

test("all custom elements must be resolved", () => {
  const unresolvedCustomElements = $index("*")
    .filter((_, el) => {
      return el.tagName.includes("-");
    })
    .map((_, el) => el.tagName)
    .toArray();
  expect(unresolvedCustomElements).toEqual([]);
});

test("all polymorphic elements must be resolved", () => {
  const unresolvedPolymorphicElements = $index("[is]")
    .filter((_, el) => {
      return el.attribs["data-template"] === undefined;
    })
    .map((_, el) => el.attribs.is)
    .toArray();
  expect(unresolvedPolymorphicElements).toEqual([]);
});

test("all HTML includes must be resolved", () => {
  const unresolvedHTMLIncludes = $index("script")
    .filter((_, el) => {
      return el.attribs.type === "text/html";
    })
    .map((_, el) => el.attribs.src)
    .toArray();
  expect(unresolvedHTMLIncludes).toEqual([]);
});

test("render correct slot: feature-set", () => {
  const features = $index('[data-template="feature-set"]');
  expect(features.find("h3").html().trim()).toMatchInlineSnapshot(
    `"❤️ HTML that You Know and Love"`
  );
});

// test("use data-var for variable-attribute binding", () => {
//   const hw = $('[data-template="hello-world"]');
//   const first = $(hw.get(0));

//   expect(first.find("a").attr("href")).toMatchInlineSnapshot(
//     `"https://fatihkalifa.com"`
//   );
// });

// test("use default value to make data-var optional", () => {
//   const hw = $('[data-template="hello-world"]');
//   const second = $(hw.get(1));

//   // passed variable
//   expect(second.find("a").attr("href")).toMatchInlineSnapshot(
//     `"https://github.com/pveyes"`
//   );
// });

// test("can bind variable deep in the tree over multiple custom elements", () => {
//   const tw = $('[data-template="tailwind-card"]');

//   expect($(tw.get(0)).find("a").attr("href")).toMatchInlineSnapshot(
//     `undefined`
//   );

//   expect($(tw.get(1)).find("a").attr("href")).toMatchInlineSnapshot(
//     `"https://github.com/pveyes/htmr"`
//   );
// });

test("no trace of variable bindings in build output", () => {
  const bindings = $index("*").filter((_, el) =>
    Object.keys(el.attribs).some((attr) => attr.startsWith("data-var"))
  );
  expect(bindings.map((_, el) => el.tagName).toArray()).toEqual([]);
});

test("compile scoped style by adding template id prefix", () => {
  const style = $index("style#scoped-sloth");
  const ast = css.parse(style.html());
  expect(ast.stylesheet.rules[1].selectors[0]).toMatchInlineSnapshot(
    `"[data-template=\\"hero-text\\"] .with-cursor::after"`
  );
  expect(ast.stylesheet.rules[2].selectors[0]).toMatchInlineSnapshot(
    `"[data-template=\\"hero-text\\"] h1 strong"`
  );
});
