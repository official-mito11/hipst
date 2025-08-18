import { Component } from "./comp";

const comp1 = new Component()
.handle('test', ({ self }, value?: number) => {
  console.log(value, typeof value)
  return self;
})
.handle('test2', ({ self }, value: string) => {
  console.log(value, typeof value)
  return self;
})
.test(123)
.test2("hi")

console.log(comp1)