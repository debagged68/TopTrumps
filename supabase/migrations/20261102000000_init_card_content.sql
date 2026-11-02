-- The Donald Deck: card content, scores, attribution and sources.
-- Source of truth for wording is docs/DONALD_DECK_CANDIDATES.md; supabase/seed.sql is generated from it
-- by scripts/build_seed.py. Scores are hidden gameplay data (REQUIREMENTS ARCH-03).

create type public.card_status as enum ('candidate', 'hold');

create table public.decks (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             text not null,
  description      text,
  document_version text,
  created_at       timestamptz not null default now()
);

-- The six scoring categories (Greed absorbs Gluttony; Stupidity replaces Sloth for this deck).
create table public.categories (
  slug           text primary key,
  name           text not null,
  sort_order     smallint not null unique,
  interpretation text
);

create table public.cards (
  id                  uuid primary key default gen_random_uuid(),
  deck_id             uuid not null references public.decks (id) on delete restrict,
  card_number         integer not null check (card_number > 0),
  label               text not null,                 -- neutral front label, e.g. "Donald #01"
  status              public.card_status not null,
  front_text          text not null,                 -- draft quote text as shown on the card front
  speaker             text not null default 'Donald Trump',
  attribution         text,                          -- attribution note / who-it-is-about, as recorded
  description         text,                          -- reveal-screen explanation (overlaps), joined
  reveal_notes        text,                          -- reveal bullets not tied to a single category
  setting             text,                          -- date / original setting
  evidence_type       text,
  verification_notes  text,
  release_status      text,
  extra_source_fields jsonb not null default '{}'::jsonb,  -- any other labelled source-record fields
  source_markdown     text not null,                 -- full original section, so nothing is lost
  content_version     integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (deck_id, card_number)
);

create table public.card_scores (
  card_id   uuid not null references public.cards (id) on delete cascade,
  category  text not null references public.categories (slug),
  score     smallint not null check (score between 1 and 100),
  rationale text,
  primary key (card_id, category)
);

create table public.card_sources (
  id         bigint generated always as identity primary key,
  card_id    uuid not null references public.cards (id) on delete cascade,
  sort_order smallint not null default 0,
  title      text not null,
  url        text not null,
  role       text,                                   -- label of the bullet the link came from
  unique (card_id, url)
);

create index cards_status_idx on public.cards (status);
create index card_sources_card_idx on public.card_sources (card_id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger cards_set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- Hidden scores and unpublished drafts must never be readable through the public API.
-- RLS is on with no policies, so only the service role / direct database access can read or write.
alter table public.decks       enable row level security;
alter table public.categories  enable row level security;
alter table public.cards       enable row level security;
alter table public.card_scores enable row level security;
alter table public.card_sources enable row level security;

comment on table public.cards is
  'Draft/held quote cards. Not publication-ready: see release_status and verification_notes per card.';
comment on column public.cards.description is
  'Editorial satirical interpretation shown only after the round resolves; not a factual claim about the speaker.';
