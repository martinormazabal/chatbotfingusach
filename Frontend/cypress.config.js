const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // Puedes agregar eventos aquí si lo necesitas
    },
    baseUrl: "http://localhost:3000", // Ajusta si tu frontend corre en otro puerto
  },
});
