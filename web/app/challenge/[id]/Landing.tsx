"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  api,
  daysLeft,
  rememberedNickname,
  rememberNickname,
} from "../../../lib/challenge-client";
import { Header } from "../../challenges/ChallengeRoom";

type Stage = "loading" | "ready" | "unavailable" | "terminal" | "mine";

// A page load only reads the fragment and asks the server to *inspect* it. Nothing here
// claims the seat: that happens only when the visitor confirms a nickname and presses Accept.
export default function Landing({ id }: { id: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [info, setInfo] = useState<any>(null);
  const [invite, setInvite] = useState("");
  const inviteProof = useRef("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Short links are /c/<id>#<key>; older links are /challenge/<id>#invite=<token>.
    const hash = window.location.hash.slice(1);
    const token =
      new URLSearchParams(hash).get("invite") ??
      (/^[A-Za-z0-9_-]+$/.test(hash) ? hash : inviteProof.current);
    inviteProof.current = token;
    setName(rememberedNickname());
    // Remove the capability from the address bar and history once read.
    history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setStage("unavailable");
      return;
    }
    setInvite(token);
    void (async () => {
      const r = await api("POST", `/api/challenges/${id}/inspect-invitation`, {
        invite: token,
      });
      if (!r.ok) {
        setStage("unavailable");
        return;
      }
      setInfo(r.data);
      const a = r.data.availability;
      if (a === "resumable") router.replace(`/challenges/${id}`);
      else if (a === "yours") setStage("mine");
      else setStage(a === "available" ? "ready" : "terminal");
    })();
  }, [id, router]);

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await api("POST", `/api/challenges/${id}/accept`, {
      invite,
      nickname: name,
    });
    if (!r.ok) {
      setBusy(false);
      if (r.data.code === "already_accepted") {
        setInfo({ ...info, availability: "already_accepted" });
        setStage("terminal");
        return;
      }
      setError(r.data.error ?? "Could not accept this challenge.");
      return;
    }
    rememberNickname(name.trim());
    router.replace(`/challenges/${id}`);
  }

  const reason = {
    already_accepted: "Someone has already accepted this challenge.",
    expired: "This challenge has expired.",
    cancelled: "The sender cancelled this challenge.",
    declined: "This challenge was declined.",
  } as Record<string, string>;

  return (
    <main className="challenge-page">
      <Header />
      <section className="challenge-panel">
        {stage === "loading" && <p>Checking your invitation…</p>}
        {stage === "unavailable" && (
          <>
            <h1>Challenge unavailable</h1>
            <p>
              This link is not valid, or it has been removed. Ask your friend to
              send it again.
            </p>
            <p className="muted">
              Opened it from a chat app? Try opening the same link in your
              normal browser.
            </p>
          </>
        )}
        {stage === "terminal" && (
          <>
            <h1>Can’t play this one</h1>
            <p>
              {reason[info?.availability] ??
                "This challenge is no longer available."}
            </p>
            <Link className="button-link" href="/">
              Play the computer
              <ArrowRight size={18} />
            </Link>
          </>
        )}
        {stage === "mine" && (
          <>
            <h1>This is your challenge</h1>
            <p>Send this link to a friend; you can’t accept your own.</p>
            <Link className="button-link" href={`/challenges/${id}`}>
              Open my challenge
              <ArrowRight size={18} />
            </Link>
          </>
        )}
        {stage === "ready" && (
          <form onSubmit={accept}>
            <p className="eyebrow">TOP TRUMPS CHALLENGE</p>
            <h1>{info.senderName} challenged you</h1>
            <p>
              Read their card, choose your packs, then draw two cards and pick
              your response. The sin stays hidden until you play.{" "}
              {daysLeft(info.deadline)}.
            </p>
            {info.card && (
              <blockquote className="invite-quote">
                “{info.card.front}”
              </blockquote>
            )}
            <label htmlFor="nick">Your nickname</label>
            <input
              id="nick"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoComplete="nickname"
              required
            />
            <p className="muted">
              Only one person can accept this challenge. If you forward the link
              before accepting, whoever accepts first takes the seat.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button disabled={busy || !name.trim()}>
              Accept challenge
              <ArrowRight size={18} />
            </button>
          </form>
        )}
      </section>
      <p className="landing-home">
        <Link className="text-link" href="/">
          Explore the Top Trumps front page
        </Link>
        <Link className="text-link" href="/packs">
          Card packs
        </Link>
      </p>
    </main>
  );
}
