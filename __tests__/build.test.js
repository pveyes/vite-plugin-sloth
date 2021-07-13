const path = require("path");
const fs = require("fs");
const cheerio = require("cheerio");
const css = require("css");

const html = fs.readFileSync(
  path.join(__dirname, "../example/dist/index.html"),
  "utf-8"
);
const $ = cheerio.load(html);

test("must not contain HTML import", () => {
  expect($('link[rel="import"]').length).toBe(0);
});

test("must not contain inline template tag", () => {
  expect($("template").length).toBe(0);
});

test("all custom elements must be resolved", () => {
  const unresolvedCustomElements = $("*")
    .filter((_, el) => {
      return el.tagName.includes("-");
    })
    .map((_, el) => el.tagName)
    .toArray();
  expect(unresolvedCustomElements).toEqual([]);
});

test("all polymorphic elements must be resolved", () => {
  const unresolvedPolymorphicElements = $("[is]")
    .filter((_, el) => {
      return el.attribs["data-template"] === undefined;
    })
    .map((_, el) => el.attribs.is)
    .toArray();
  expect(unresolvedPolymorphicElements).toEqual([]);
});

test("render correct slot: hello-world", () => {
  const hw = $('[data-template="hello-world"]');
  const first = $(hw.get(0));
  const second = $(hw.get(1));

  expect(first.find("a").html()).toMatchInlineSnapshot(`"Hello, Fatih"`);
  expect(second.find("a").html()).toMatchInlineSnapshot(`"Hello, Kalifa"`);
});

test("use data-var for variable-attribute binding", () => {
  const hw = $('[data-template="hello-world"]');
  const first = $(hw.get(0));

  expect(first.find("a").attr("href")).toMatchInlineSnapshot(
    `"https://fatihkalifa.com"`
  );
});

test("use default value to make data-var optional", () => {
  const hw = $('[data-template="hello-world"]');
  const second = $(hw.get(1));

  // passed variable
  expect(second.find("a").attr("href")).toMatchInlineSnapshot(
    `"https://github.com/pveyes"`
  );
});

test("can bind variable deep in the tree over multiple custom elements", () => {
  const tw = $('[data-template="tailwind-card"]');

  expect($(tw.get(0)).find("a").attr("href")).toMatchInlineSnapshot(
    `undefined`
  );

  expect($(tw.get(1)).find("a").attr("href")).toMatchInlineSnapshot(
    `"https://github.com/pveyes/htmr"`
  );
});

test("no trace of variable bindings in build output", () => {
  const bindings = $("*").filter((_, el) =>
    Object.keys(el.attribs).some((attr) => attr.startsWith("data-var"))
  );
  expect(bindings.map((_, el) => el.tagName).toArray()).toEqual([]);
});

test("compile scoped style by adding template id prefix", () => {
  const style = $("style#scoped-sloth");
  const ast = css.parse(style.html());
  console.log("ast", ast.stylesheet.rules);
  expect(ast.stylesheet.rules[0].selectors[0]).toMatchInlineSnapshot(
    `"[data-template=\\"plain-card\\"] .card"`
  );
  expect(ast.stylesheet.rules[1].selectors[0]).toMatchInlineSnapshot(
    `"[data-template=\\"plain-card\\"] h3"`
  );
});
