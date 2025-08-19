import { api } from "../src/core/server/api";

export const myApi = api("/hyunho")
.get(({res, query}) => {
    const {q} = query;
    return res("hyunho is " + q)
})
