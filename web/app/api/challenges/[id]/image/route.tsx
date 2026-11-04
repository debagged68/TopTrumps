import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  publicCardPreview,
  PRIVATE_HEADERS,
  IdParams,
} from "../../../../../lib/challenge-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: IdParams) {
  const card = await publicCardPreview((await params).id);
  if (!card)
    return new Response("Unavailable", {
      status: 404,
      headers: PRIVATE_HEADERS,
    });
  const art = await readFile(join(process.cwd(), "public/trump-art.png"));
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#102b31",
          padding: 30,
          color: "#192b33",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            border: "5px solid #cca453",
            borderRadius: 20,
            background: "#fff5df",
            padding: 30,
            gap: 35,
          }}
        >
          <img
            src={`data:image/png;base64,${art.toString("base64")}`}
            width="330"
            height="500"
            style={{ objectFit: "contain" }}
            alt=""
          />
          <div
            style={{
              display: "flex",
              flex: 1,
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", fontSize: 24, marginBottom: 20 }}>
              TOP TRUMPS · YOUR MOVE
            </div>
            <div
              style={{
                display: "flex",
                fontSize:
                  card.front.length > 500
                    ? 23
                    : card.front.length > 300
                      ? 29
                      : 38,
              }}
            >{`“${card.front}”`}</div>
            <div style={{ display: "flex", fontSize: 22, marginTop: 22 }}>
              {card.speaker || "Donald Trump"}
            </div>
            <div style={{ display: "flex", fontSize: 23, marginTop: 20 }}>
              Which sin have I chosen?
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: PRIVATE_HEADERS },
  );
}
