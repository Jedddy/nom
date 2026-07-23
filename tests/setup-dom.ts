import { GlobalWindow } from "happy-dom";

const testWindow = new GlobalWindow({ url: "http://localhost" });

Object.defineProperties(globalThis, {
  window: { configurable: true, value: testWindow },
  document: { configurable: true, value: testWindow.document },
  navigator: { configurable: true, value: testWindow.navigator },
});

for (const [property, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(testWindow))) {
  if (!(property in globalThis)) {
    Object.defineProperty(globalThis, property, descriptor);
  }
}
