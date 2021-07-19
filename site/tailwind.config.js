const colors = require("tailwindcss/colors");

module.exports = {
  purge: ["./**/*.html", "./public/markdown/**/*.md"],
  darkMode: false, // or 'media' or 'class'
  theme: {
    colors: {
      white: colors.white,
      black: colors.black,
      gray: colors.gray,
      amber: colors.amber,
      accent: {
        // https://components.ai/color-scale/5pdj8FuOc7VcA5A78gI8?tab=editor
        50: "#f6c6ba",
        100: "#f2ad9c",
        200: "#ee947e",
        300: "#ea7c60",
        400: "#e76342",
        500: "#e14b26",
        600: "#c14120",
        700: "#a2361b",
        800: "#822c16",
        900: "#632111",
      },
    },
    fontFamily: {
      sans: ["Poppins", "sans-serif"],
      system: [
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "Oxygen",
        "Ubuntu",
        "Cantarell",
        "Open Sans",
        "Helvetica Neue",
        "sans-serif",
      ],
    },
    extend: {
      maxWidth: {
        prose: "70ch",
      },
      spacing: {
        92: "23rem",
        108: "27rem",
        120: "30rem",
      },
    },
  },
  variants: {
    extend: {
      backgroundColor: ["active"],
    },
  },
  plugins: [],
};
