import { api } from "../index.ts";

export const myApi = api("/hyunho")
.get(({res, query}) => {
    const {q} = query;
    return res("hyunho is " + q)
})