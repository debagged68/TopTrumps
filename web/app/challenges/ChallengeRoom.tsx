"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  BellOff,
  Copy,
  Crown,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import CardHand, { OpponentCard } from "../components/CardHand";
import PackPicker, { DEFAULT_PACKS } from "../components/PackPicker";
import CardKey from "../components/CardKey";
import RoundResult from "../components/RoundResult";
import RoundCelebration from "../components/RoundCelebration";
import { api, daysLeft, STATUS_TEXT } from "../../lib/challenge-client";
import {
  inviteText,
  nudgeText,
  shareText,
  shareCard,
  prepareCardImage,
  copyText,
  openWhatsApp,
} from "../../lib/share";
import { alertUser, unlockAudio, soundOn, setSound } from "../../lib/alert";

export default function ChallengeRoom({ id }: { id: string }) {
  const [view, setView] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [packs, setPacks] = useState(DEFAULT_PACKS),
    [picked, setPicked] = useState(""),
    [selected, setSelected] = useState<any>(null);
  const [celebrate, setCelebrate] = useState<"win" | "loss" | "draw" | null>(
      null,
    ),
    [shareUrl, setShareUrl] = useState(""),
    [shareFile, setShareFile] = useState<File | null>(null),
    [imageFailed, setImageFailed] = useState(false),
    [rematch, setRematch] = useState<any>(null);
  const [sound, setSoundState] = useState(true);
  useEffect(() => setSoundState(soundOn()), []);
  const pending = useRef(false),
    lastStatus = useRef("");
  const load = useCallback(async () => {
    const r = await api("GET", `/api/challenges/${id}`);
    if (r.ok) {
      if (lastStatus.current && lastStatus.current !== r.data.status)
        alertUser("Your challenge has an update");
      lastStatus.current = r.data.status;
      setView(r.data);
      setError("");
    } else setError(r.data.error || "Challenge unavailable on this browser.");
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  useEffect(() => {
    if (!celebrate) return;
    const timer = setTimeout(() => setCelebrate(null), 2200);
    return () => clearTimeout(timer);
  }, [celebrate]);
  useEffect(() => {
    if (view?.status !== "completed") return;
    const ping = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await api("POST", `/api/challenges/${id}/live`, {
        action: "ping",
      });
      if (r.ok) setRematch(r.data.rematch);
    };
    void ping();
    const timer = setInterval(ping, 10000);
    return () => clearInterval(timer);
  }, [id, view?.status]);
  // Prepare before the share tap, keeping the native share call inside a fresh user gesture.
  useEffect(() => {
    if (view?.status !== "awaiting_reply") return;
    let alive = true;
    void api("GET", `/api/challenges/${id}/invitation`).then(async (r) => {
      if (!r.ok || !alive) return;
      setShareUrl(new URL(r.data.path, window.location.origin).toString());
      try {
        const file = await prepareCardImage(view.card);
        if (alive) setShareFile(file);
      } catch {
        if (alive) setImageFailed(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [id, view?.status]);
  async function act(path: string, body: unknown = {}) {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api("POST", `/api/challenges/${id}/${path}`, body);
      if (!r.ok) {
        setError(r.data.error || "Please try again.");
        if (r.status === 409 || r.status === 410) void load();
        return null;
      }
      lastStatus.current = r.data.status;
      setView(r.data);
      setSelected(null);
      setPicked("");
      return r.data;
    } catch {
      setError("Connection lost. Try again; your cards are saved.");
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function takeDeal() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await api("POST", `/api/challenges/${id}/live`, {
        action: "request",
      });
      if (r.ok) setRematch(r.data.rematch);
      else setError(r.data.error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function reveal() {
    const data = await act("reveal");
    if (data?.result) setCelebrate(data.result.outcome);
  }
  function inviteMessage() {
    return inviteText(shareUrl);
  }
  async function share(withCard: boolean) {
    const outcome = withCard
      ? await shareCard(inviteMessage(), shareFile)
      : await shareText(inviteMessage());
    setNotice(
      outcome === "copied"
        ? "Challenge link copied. Paste into your message."
        : outcome === "failed"
          ? "Copy the link below."
          : outcome === "shared"
            ? "Your challenge is saved. Your friend can respond later."
            : "",
    );
  }
  if (!view)
    return (
      <main className="challenge-page">
        <Header />
        <section className="challenge-panel">
          <h1>{error ? "Challenge unavailable" : "Loading your cards…"}</h1>
          {error && <p>{error}</p>}
          <Link href="/challenges">My challenges</Link>
        </section>
      </main>
    );
  const opponent = view.opponentName || "Your friend",
    revealed = !!view.result;
  const choosing = view.status === "draft" || view.status === "your_turn";
  const cards = view.cards?.length ? view.cards : view.card ? [view.card] : [];
  const current = selected || cards[0];
  const needsHand = choosing && !cards.length;
  const resultCards = revealed
    ? [view.card, view.opponent]
    : view.status === "result_ready"
      ? [view.card, view.opponentFront]
      : choosing
        ? cards
        : view.card
          ? [view.card]
          : [];
  const status = STATUS_TEXT[view.status] || view.status;
  return (
    <main
      className={
        needsHand
          ? "challenge-page hand-setup"
          : `game-screen two-card-game challenge-room ${revealed ? "round-result-mode" : ""}`
      }
    >
      <Header />
      <CardKey />
      {!revealed && (
        <div className="turn-banner" aria-live="polite">
          <button
            className="text-control room-sound"
            aria-label={sound ? "Mute sound alerts" : "Enable sound alerts"}
            aria-pressed={sound}
            onClick={() => {
              const next = !sound;
              setSound(next);
              setSoundState(next);
              if (next) unlockAudio();
            }}
          >
            {sound ? <Bell size={17} /> : <BellOff size={17} />}
          </button>
          <strong>
            {revealed
              ? view.result.outcome === "win"
                ? "You win"
                : view.result.outcome === "loss"
                  ? `${opponent} wins`
                  : "Draw"
              : view.status === "draft"
                ? "You have the deal"
                : view.status === "your_turn"
                  ? `${opponent} has the deal`
                  : status}
          </strong>
          <span>
            {revealed
              ? `${view.result.category}: ${view.result.yours}–${view.result.theirs}`
              : view.status === "draft"
                ? "Choose one card and a hidden sin."
                : view.status === "your_turn"
                  ? "Which sin did they choose? Pick your response."
                  : view.status === "waiting_for_sender"
                    ? `${opponent} is choosing their card and sin.`
                    : daysLeft(view.deadline)}
          </span>
        </div>
      )}
      {view.role === "recipient" && choosing && view.opponentFront && (
        <OpponentCard
          card={view.opponentFront}
          name={opponent}
          owner="friend"
        />
      )}
      {revealed ? (
        <RoundResult
          yours={view.card}
          theirs={view.opponent}
          opponent={opponent}
          opponentOwner="friend"
          result={view.result}
        />
      ) : needsHand ? (
        <section className="challenge-panel">
          <PackPicker value={packs} onChange={setPacks} />
          <button disabled={busy} onClick={() => act("hand", { packs })}>
            Deal my two cards
            <ArrowRight size={18} />
          </button>
        </section>
      ) : resultCards.length > 0 ? (
        <CardHand
          overlap={view.status === "result_ready"}
          owners={
            view.status === "result_ready" ? ["you", "friend"] : undefined
          }
          key={id + ":" + view.status}
          cards={resultCards}
          categories={view.categories}
          onActive={(c) => {
            setSelected(c);
            setPicked("");
          }}
          onPick={view.status === "draft" ? setPicked : undefined}
          picked={picked}
          disabled={busy}
          heading={
            view.status === "draft" ? "Choose your sin" : "Sins & scores"
          }
          result={view.result}
          tags={
            revealed || view.status === "result_ready"
              ? ["Your card", `${opponent}’s card`]
              : undefined
          }
        />
      ) : (
        <section className="challenge-panel">
          <p>
            Your next hand will be dealt when {opponent} locks their challenge.
          </p>
        </section>
      )}
      <div className="bottom-actions primary-actions">
        {view.status === "draft" && !needsHand && (
          <button
            disabled={busy || !picked}
            onClick={() => act("lock", { category: picked, card: current.id })}
          >
            {picked
              ? `Challenge with ${picked} · ${current.scores[picked]}`
              : "Flip a card and choose a sin"}
            <ArrowRight size={18} />
          </button>
        )}
        {view.status === "your_turn" && !needsHand && (
          <button
            disabled={busy}
            onClick={() => act("respond", { card: current.id })}
          >
            Play this card
            <ArrowRight size={18} />
          </button>
        )}
        {view.status === "awaiting_reply" && (
          <button
            disabled={busy || !shareUrl || (!shareFile && !imageFailed)}
            onClick={() => share(!imageFailed)}
          >
            <MessageCircle size={18} />
            {imageFailed ? "Share challenge link" : "Share card"}
          </button>
        )}
        {view.status === "result_ready" && (
          <button disabled={busy} onClick={reveal}>
            Reveal the sin & result
            <ArrowRight size={18} />
          </button>
        )}
        {view.status === "completed" &&
          (rematch ? (
            <Link
              className="button-link"
              href={`/challenges/${rematch.challengeId}`}
            >
              {rematch.from === "you"
                ? "You have the next deal"
                : "Your friend has the next deal"}
              <ArrowRight size={18} />
            </Link>
          ) : (
            <button disabled={busy} onClick={takeDeal}>
              <Crown size={18} />
              Take the deal · Play again
            </button>
          ))}
        {view.role === "recipient" &&
          ["completed", "result_ready"].includes(view.status) && (
            <button
              className="secondary"
              onClick={() =>
                openWhatsApp(
                  nudgeText(
                    "played",
                    view.yourName,
                    new URL(`/challenges/${id}`, location.origin).toString(),
                  ),
                )
              }
            >
              Tell {opponent}
            </button>
          )}
        {view.role === "sender" && view.status === "accepted" && (
          <button
            onClick={() =>
              openWhatsApp(
                nudgeText(
                  "your_turn",
                  view.yourName,
                  new URL(`/challenges/${id}`, location.origin).toString(),
                ),
              )
            }
          >
            Tell {opponent} it’s their turn
          </button>
        )}
        {["cancelled", "declined", "expired"].includes(view.status) && (
          <Link className="button-link" href="/challenges/new">
            New challenge
          </Link>
        )}
        {["draft", "awaiting_reply", "accepted", "your_turn"].includes(
          view.status,
        ) && (
          <button
            className="secondary compact-cancel"
            disabled={busy}
            aria-label={
              view.role === "sender" ? "Cancel challenge" : "Decline challenge"
            }
            onClick={() => {
              if (confirm("End this challenge without a result?"))
                void act(view.role === "sender" ? "cancel" : "decline");
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>
      {shareUrl && view.status === "awaiting_reply" && (
        <div className="share-tools">
          <button
            className="text-control"
            onClick={async () =>
              setNotice(
                (await copyText(inviteMessage()))
                  ? "Link copied."
                  : "Could not copy. Use the link below.",
              )
            }
          >
            <Copy size={14} />
            Copy link
          </button>
          <a href={shareUrl} onClick={(e) => e.preventDefault()}>
            {shareUrl}
          </a>
        </div>
      )}
      {(busy || error || notice) && (
        <div
          className={"notice " + (error ? "error" : "")}
          role={error ? "alert" : "status"}
          onClick={() => setNotice("")}
        >
          {error || notice || "Saving your move…"}
        </div>
      )}
      {celebrate && (
        <RoundCelebration outcome={celebrate} opponent={opponent} />
      )}
    </main>
  );
}
export function Header() {
  return (
    <header>
      <Link className="brand" href="/">
        <Crown />
        <span>TOP TRUMPS</span>
      </Link>
      <nav className="header-links">
        <Link className="header-link" href="/">
          Home
        </Link>
        <Link className="header-link" href="/challenges">
          My challenges
        </Link>
      </nav>
    </header>
  );
}
