export default function bootstrap(templateId, Clazz) {
  const elements = document.querySelectorAll(`[data-template="${templateId}"]`);
  elements.forEach((element) => {
    const instance = new Clazz();
    instance.root = element;
    instance.connectedCallback();
  });
}
