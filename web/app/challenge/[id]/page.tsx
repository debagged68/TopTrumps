import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { challengesEnabled } from "../../../lib/challenge-flag";
import Landing from "./Landing";
import { publicCardPreview } from "../../../lib/challenge-http";

// Only the intentionally shared quote front is public; scores and the sin stay private. The
// preview image has to be an absolute URL, so it is built from the host that served this page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await publicCardPreview(id);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");
  const title = "Your move: play your card";
  const description = card
    ? `“${card.front}” — Which sin have I chosen?`
    : "Open the link, choose your packs and play.";
  const image = host
    ? [
        {
          url: `${proto}://${host}${card ? `/api/challenges/${id}/image` : "/og.jpg"}`,
          width: 1200,
          height: 630,
          alt: "Top Trumps",
        },
      ]
    : undefined;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    openGraph: {
      title,
      description,
      siteName: "Top Trumps",
      type: "website",
      images: image,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image?.map((i) => i.url),
    },
  };
}
export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!challengesEnabled()) notFound();
  return <Landing id={(await params).id} />;
}
