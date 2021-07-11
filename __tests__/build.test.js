const path = require("path");
const fs = require("fs");
const cheerio = require("cheerio");

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
