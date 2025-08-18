이제 내 프로젝트에 대해 전반적인 소개를 해줄게.

hipst 프로젝트는 차세대 통합 웹 풀스택 프레임워크야.
목표는 높은 개발 속도, 빠른 프로토타이핑, 개발자 친화적 ux, 생산성, 타입 안정성, 성능을 목표로 개발을 시작했어.
퍼포먼스적으로 봤을때, BE는 pure Bun API를 사용하고, FE는 Fine-grained Reactivity 아키텍쳐를 사용해.
프레임워크 철학으론 fluent interface를 사용해. typescript의 모든 기능을 지원하여 최대한 앱 구축에 한 자라도 줄이는 것을 목표로 해.

core logic 구조
이 프로젝트는 Component, Context로 주 구조체를 이루고 있어.
Component는 기능 단위의 기본 요소이며, 상태, 데이터 등을 관리할땐 chainable method를 사용해.
Context는 method에 arg로 static value를 전달하는 대신에 dynamic value를 전달하기 위해 사용해.
예) .method(T) -> .method((c:Context) => T)
그리고 모든 데이터 관리를 method로 하기 때문에 runtime에서 component의 메서드를 동적으로 추가/수정/삭제가 가능해야해.

예상 워크플로우 시나리오
```typescript
import { route, server, html, ui } from 'hipst'
import { db } from './db'

const VStack = ui('div')
.flexCol()

const HStack = ui('div')
.flexRow()

const Text = ui('span')

const Switch = ui('label')
.state("on", false)
.state("test-text", ({state}) => state.on ? "on" : "off") // 값은 static으로 정의할 수 있지만 (c:Context) => T로도 정의 가능
.id(uuidv4())
.htmlFor(({self}) => self.id)
.onClick(({self, state}) => state.on = !state.on)
(
    ui('input')
    .type("checkbox")
    .checked(({self}) => self.state.on)
    .id(({self, parent}) => parent.id)
)

const Button = ui('button')
.p(14)
.m(8)
.textCenter()
.prop("size", ({ self }, value: "small" | "medium" | "large") => {
    if(value === "small") {
        return self.p(8)
    } else if(value === "medium") {
        return self.p(14)
    } else {
        return self.p(20)
    }
})

const dom = html()
.state("count", 0)
(
    HStack
    .state("count2", 0)
    (
        HStack(
            Button.onClick(({self, root}) => root.state.count++)("Click"),
            Text(({parent}) => parent.state.count)
        ),
        HStack(
            Button.onClick(({self, parent}) => parent.state.count2++)("Click2"),
            Text(({parent}) => parent.state.count2)
        ),
        VStack(
            Switch,
            Text(({parent}) => `The Switch is ${parent.nth(0).state.testText}`)
        )
    )
)

const findRoute = api('/find')
.get(async ({self, res, query}) => {
    const {id} = query
    const data = await db.user.findMany({where: {id}})
    return res(data)
})

const api = api('/user')
.get(async ({self, res, query}) => {
    const {id} = query
    const data = await db.user.unique({where: {id}})
    return res(data)
})
.post(async ({self, res, body, status}) => {
    const {id, name, email} = body
    const data = await db.user.create({data: {id, name, email}})
    if(alreadyExists){
        return status(409).res({message: 'User already exists'})
    }
    return status(201).res(data) // content type 자동 추론
})
.route(findRoute)
.route(api("/other/:id").get(async ({self, res, param, header}) => {
    const {id} = param
    const data = await db.user.unique({where: {id}})
    return header("Content-Type", "application/json").status(200).header("X-Custom-Header", "Custom").res(JSON.stringify(data)) // status, header chaining 순서 무관 & 마지막은 항상 res로 끝남
}))

const app = new server()
.route(api)
.route(dom)
.listen(3000)

console.log(app)
```

해당 기능과 아키텍쳐를 구현하기 위해 확장 가능한 core component를 설계하고 해당 기능들을 구현해줘.
