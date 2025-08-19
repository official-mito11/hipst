이제 내 프로젝트에 대해 전반적인 소개를 해줄게.

hipst 프로젝트는 차세대 통합 웹 풀스택 프레임워크야.
목표는 높은 개발 속도, 빠른 프로토타이핑, 개발자 친화적 ux, 생산성, 타입 안정성, 성능을 목표로 개발을 시작했어.
퍼포먼스적으로 봤을때, BE는 pure Bun API를 사용하고, FE는 VDOM Fine-grained Reactivity 아키텍쳐를 사용해.
프레임워크 철학으론 fluent interface를 사용해. typescript의 모든 기능을 지원하여 최대한 앱 구축에 한 자라도 줄이는 것을 목표로 해.
보일러플레이트를 최대한 줄이고 동일한 방법이 있을때, 한자라도 줄이고 직관적인 문법을 목표로 해.
예) .style("display", "flex") -> .display("flex") -> .flexCol()
    .attribute("value", "something") -> .value("somthing")
코드에는 사용 예시를 포함한 개발자 친화적 주석을 달아놔.
style은 최대한 css class를 사용하여 최적화 해야해.
FE만 build할 수 있고, 통합 server로도 build할 수 있어.
server config에서 SSR, CSR 선택 가능하지만 Default는 SSR이야.
**Component의 method나 Context에 대한 타입 추론은 정밀하게 IDE에서 별도의 플러그인 없이 순수 typescript만으로 지원해야해** (되도록 any를 사용하지 말 것)

core logic 구조
이 프로젝트는 Component, Context로 주 구조체를 이루고 있어.
Component는 기능 단위의 기본 요소이며, 상태, 데이터 등을 관리할땐 chainable method를 사용해.
Context는 method에 arg로 static value를 전달하는 대신에 dynamic value를 전달하기 위해 사용해.
예) .method(T) -> .method((c:Context) => T)
그리고 모든 데이터 관리를 method로 하기 때문에 runtime에서 component의 메서드를 동적으로 추가/수정/삭제가 가능해야해.
Context는 Component 타입/역할에 따라 받는 속성도 달라.
예) ApiComponent는 ApiContext {res, query, header, body, status}
    UIComponent는 UIContext {parent, root, state, prop} 등
하지만 component instance본인을 반환하는 self같은 공통적으로 들어가는 Context도 있어.

예상 워크플로우 시나리오
```typescript
import { route, server, html, ui } from 'hipst'
import { db } from './db'

const VStack = ui('div')
// .display('flex')
// .flexDirection('column') // default style applying
// .style({ display: 'flex' , flexDirection: 'column' }) // obj style applying
.flexCol() // tailwind style method

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
// .meta("title", "Hipst")
.title("Hipst")
.state("count", 0)
(
    HStack
    .state("count2", 0)
    .state<User>("user", null)
    (
        HStack(
            Button.onClick(({self, root}) => root.state.count++)("Click"),
            Text(({parent}) => parent.state.count)
        ),
        HStack(
            Button.onClick(({self, parent}) => parent.state.count2++)("Click2"),
            Text(({parent}) => parent.state.count2)
        ),
        HStack(
            Button
            .onClick(async ({self, parent}) => {
                parent.state.user = await userApi.client.user.get({query: {id: "1"}}) // must be hoisting to get api component
                // ApiComponent.client is consists of getter for using in frontend;
                // when it is built, it will be transformed to fetch;
            })("Get User")
            Text(({parent}) => parent.state.user?.name)
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

const userApi = api('/user')
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
.route(api("/other/:paramId").get(async ({self, req, res, param, header, headers}) => {
    const { paramId } = param;
    // headers["Content-Type"] -> headers는 request header임
    const data = await db.user.unique({where: {id: paramId}})
    return status(200).header("Content-Type", "application/json").header("X-Custom-Header", "Custom").res(JSON.stringify(data)) // status, header chaining 순서 무관 & 마지막은 항상 res로 끝남
    // response header로 객체도 넣을 수 있음 .header({"Content-Type": "application/json", "X-Custom-Header": "Custom"})
}))

const app = new server()
.route(userApi)
.route(dom)
.listen(3000)
```

현재 구현된 core component, context 구조를 계승/개선하면서 해당 기능과 아키텍쳐를 구현하기 위해 확장 가능한 core component를 설계하고 해당 기능들을 구현해줘.
