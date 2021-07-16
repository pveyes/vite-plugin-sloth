export default function bootstrap(templateId, Clazz) {
  const elements = document.querySelectorAll(`[data-template="${templateId}"]`);
  elements.forEach((element) => {
    const instance = new Clazz();
    // set root to wrapper element
    instance.root = element;
    // proxy instance so we can use this.querySelector
    const thiz = new Proxy(instance, {
      get(_, key) {
        if (instance[key]) {
          return instance[key];
        }

        if (typeof element[key] === "function") {
          return element[key].bind(element);
        }

        return element[key];
      },
    });
    thiz.connectedCallback();
  });
}
