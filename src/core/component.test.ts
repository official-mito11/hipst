import { Component } from "./component";

const comp1 = new Component()
.handle('test', ({ self }, value?: number) => {
  console.log(value)
  return self;
})
.handle('test2', ({ self }, value?: string) => {
  console.log(value)
  return self;
})
.test()
.test2()

console.log(comp1)