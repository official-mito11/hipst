export async function parseBody(req: Request, headers: Headers): Promise<any> {
  let body: any = undefined;
  try {
    const contentType = headers.get("content-type") || "";
    if (contentType.includes("application/json")) body = await req.json();
    else if (contentType.includes("text/")) body = await req.text();
    else body = await req.arrayBuffer();
  } catch {}
  return body;
}
