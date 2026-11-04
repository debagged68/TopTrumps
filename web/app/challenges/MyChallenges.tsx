"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Copy, KeyRound, Send } from "lucide-react";
import { api, daysLeft, STATUS_TEXT } from "../../lib/challenge-client";
import { copyText } from "../../lib/share";
import { challengeUpdateMessage } from "../../lib/challenge-notifications.mjs";
import { alertUser, soundOn, setSound, unlockAudio } from "../../lib/alert";
import { Header } from "./ChallengeRoom";

const GROUPS: [string, (c: any) => boolean][] = [
  ["Needs you", (c) => ["your_turn", "result_ready"].includes(c.status)],
  [
    "Waiting",
    (c) =>
      ["awaiting_reply", "accepted", "draft", "waiting_for_sender"].includes(
        c.status,
      ),
  ],
  [
    "Finished",
    (c) => ["completed", "cancelled", "declined", "expired"].includes(c.status),
  ],
];

export default function MyChallenges() {
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const [recovered, setRecovered] = useState("");
  const [saved, setSaved] = useState("");
  const [editing, setEditing] = useState("");
  const [friendName, setFriendName] = useState("");
  const [saving, setSaving] = useState(false);

  const previous = useRef<Map<string, any>>(new Map());
  const loading = useRef(false);
  const [sound, setSoundState] = useState(true);

  async function load(notify = false) {
    if (loading.current) return;
    loading.current = true;
    const r = await api("GET", "/api/challenges");
    if (r.ok) {
      if (notify) {
        const updates = r.data.challenges
          .map((c: any) =>
            challengeUpdateMessage(previous.current.get(c.id), c),
          )
          .filter(Boolean);
        if (updates.length) {
          const text =
            updates.length === 1
              ? updates[0]
              : `${updates.length} friend challenges have updates.`;
          setMessage(text);
          alertUser(text);
        }
      }
      previous.current = new Map(r.data.challenges.map((c: any) => [c.id, c]));
      setData(r.data);
      setState("ready");
    } else setState(r.status === 404 ? "none" : "error");
    loading.current = false;
  }

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1)).get(
      "access",
    );
    if (hash) {
      setRecovered(hash);
      history.replaceState(null, "", window.location.pathname);
      setState("none");
      return;
    }
    void load();
  }, []);

  useEffect(() => {
    setSoundState(soundOn());
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  useEffect(() => {
    if (recovered) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [recovered]);

  async function recover() {
    const r = await api("POST", "/api/guests/recover", { access: recovered });
    if (!r.ok) {
      setMessage("This private access link is not valid or has expired.");
      return;
    }
    setRecovered("");
    setMessage("");
    void load();
  }

  async function saveLink() {
    const r = await api("GET", "/api/guests/recovery-link");
    if (!r.ok) {
      setMessage(r.data.error);
      return;
    }
    const url = new URL(r.data.path, window.location.origin).toString();
    setSaved(url);
    setMessage(
      (await copyText(url))
        ? "Private access link copied. Keep it to yourself."
        : "Copy the link below and keep it private.",
    );
  }

  async function saveFriend(id: string) {
    if (saving) return;
    setSaving(true);
    setMessage("");
    const r = await api("POST", `/api/challenges/${id}/friend-name`, {
      friendName,
    });
    if (r.ok) {
      setEditing("");
      await load();
    } else setMessage(r.data.error || "Could not save the friend name.");
    setSaving(false);
  }

  const totals = data?.totals;
  return (
    <main className="challenge-page">
      <Header />
      <section className="challenge-panel">
        <p className="eyebrow">FRIEND CHALLENGES</p>
        <h1>My challenges</h1>
        <button
          className="sound-toggle"
          aria-pressed={sound}
          onClick={() => {
            const next = !sound;
            setSound(next);
            setSoundState(next);
            if (next) unlockAudio();
          }}
        >
          {sound ? <Bell size={14} /> : <BellOff size={14} />}Sound alerts{" "}
          {sound ? "on" : "off"}
        </button>
        <p className="muted">Updates automatically while this page is open.</p>
        {totals && (
          <p className="tally-line" aria-label="Friend challenge totals">
            <strong>{totals.wins}</strong> You ·{" "}
            <strong>{totals.losses}</strong> Opponents ·{" "}
            <strong>{totals.draws}</strong> Draws
          </p>
        )}
        <Link className="button-link" href="/challenges/new">
          <Send size={18} />
          New challenge
        </Link>
      </section>

      {recovered && (
        <section className="challenge-panel">
          <h2>Restore your challenges?</h2>
          <p>
            This private access link restores the challenges and totals from
            another browser. It replaces nothing here unless you confirm.
          </p>
          <button onClick={recover}>
            <KeyRound size={18} />
            Restore on this browser
          </button>
        </section>
      )}

      {state === "loading" && (
        <section className="challenge-panel">
          <p>Loading…</p>
        </section>
      )}
      {state === "none" && !recovered && (
        <section className="challenge-panel">
          <p>
            No challenges on this browser yet. If you used another browser or
            app, open your private access link here.
          </p>
        </section>
      )}
      {state === "error" && (
        <section className="challenge-panel">
          <p role="alert">
            Could not load your challenges.{" "}
            <button className="secondary" onClick={() => void load()}>
              Try again
            </button>
          </p>
        </section>
      )}

      {state === "ready" &&
        (data.challenges.length === 0 ? (
          <section className="challenge-panel">
            <p>Nothing yet. Start a challenge and send it to a friend.</p>
          </section>
        ) : (
          GROUPS.map(([title, test]) => {
            const rows = data.challenges.filter(test);
            return (
              rows.length > 0 && (
                <section className="challenge-panel" key={title}>
                  <h2>{title}</h2>
                  <ul className="challenge-list">
                    {rows.map((c: any) => {
                      const friend = c.opponentName || c.friendLabel;
                      return (
                        <li key={c.id} className="challenge-friend-row">
                          <Link href={`/challenges/${c.id}`}>
                            <span className="friend-main">
                              <span
                                className="friend-avatar"
                                data-card-owner="friend"
                                aria-hidden="true"
                              >
                                {friend
                                  ? Array.from(String(friend))[0].toUpperCase()
                                  : "?"}
                              </span>
                              <span>
                                <strong>
                                  {friend || "Waiting for a friend"}
                                </strong>
                                <small>
                                  {c.role === "sender"
                                    ? "You challenged them"
                                    : "They challenged you"}
                                </small>
                                {c.friendLabel &&
                                  c.opponentName &&
                                  c.friendLabel !== c.opponentName && (
                                    <small>Your label: {c.friendLabel}</small>
                                  )}
                              </span>
                            </span>
                            <small>
                              {STATUS_TEXT[c.status] ?? c.status}
                              {c.outcome
                                ? ` · ${c.outcome === "win" ? "You won" : c.outcome === "loss" ? "You lost" : "Draw"}`
                                : ""}
                              {c.deadline ? ` · ${daysLeft(c.deadline)}` : ""}
                            </small>
                            <small>
                              {new Date(c.createdAt * 1000).toLocaleString(
                                "en-GB",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </small>
                          </Link>
                          {c.role === "sender" &&
                            (editing === c.id ? (
                              <form
                                className="friend-label-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void saveFriend(c.id);
                                }}
                              >
                                <label htmlFor={`friend-${c.id}`}>
                                  Friend’s name or label
                                </label>
                                <input
                                  id={`friend-${c.id}`}
                                  autoFocus
                                  value={friendName}
                                  onChange={(e) =>
                                    setFriendName(e.target.value)
                                  }
                                  maxLength={24}
                                />
                                <small className="muted">
                                  Only you see this label. Your friend’s chosen
                                  nickname stays unchanged.
                                </small>
                                <div>
                                  <button disabled={saving} type="submit">
                                    Save
                                  </button>
                                  <button
                                    disabled={saving}
                                    className="secondary"
                                    type="button"
                                    onClick={() => setEditing("")}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <button
                                className="text-control"
                                type="button"
                                onClick={() => {
                                  setEditing(c.id);
                                  setFriendName(c.friendLabel || "");
                                }}
                              >
                                {c.friendLabel
                                  ? "Edit friend label"
                                  : "Add friend name"}
                              </button>
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )
            );
          })
        ))}

      {state === "ready" && (
        <section className="challenge-panel">
          <h2>Use another browser?</h2>
          <p className="muted">
            Save a private access link to get your challenges back on another
            device. Anyone who has it can restore your history, so don’t share
            it in an invitation.
          </p>
          <button className="secondary" onClick={saveLink}>
            <Copy size={16} />
            Save private access link
          </button>
          {saved && (
            <input
              readOnly
              value={saved}
              aria-label="Private access link"
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
        </section>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
    </main>
  );
}
