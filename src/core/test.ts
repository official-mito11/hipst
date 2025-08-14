const VStack = ui('div')
.style('display', 'flex')
.handle<boolean>('row', ({ self, value }) => self.style('flex-direction', value !== undefined ? 'row' : ''))
.handle<boolean>('col', ({ self, value }) => self.style('flex-direction', value !== undefined ? 'column' : ''))
.handle<string>('custom-props', ({self}) => self)

const Text = ui('span')

const dom = html().render([
  VStack
  .row()
  .render([
    Text.render("Text1")
    Text.render("Text2")
  ])
])

const apiRoute = api('/')
.get(dom)

const app = server()
.route(apiRoute)
.listen(3000)
