import Link from "next/link";
import {
  ArrowRight,
  Brain,
  CalendarHeart,
  Heart,
  MessageCircleHeart,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRoundPlus,
  BellRing,
  Bot,
} from "lucide-react";
import { PaddyAvatar, PaddyLogo, PaddyMark, PaddyWordmark } from "@/components/brand/paddy-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const FEATURES = [
  {
    icon: Brain,
    title: "Personal memory",
    body: "Paddy remembers the important things — preferences, events, goals — so you never have to repeat yourself.",
  },
  {
    icon: MessageCircleHeart,
    title: "Everyday companionship",
    body: "Warm, natural conversation that feels continuous. Come back days later and pick up where you left off.",
  },
  {
    icon: BellRing,
    title: "Thoughtful follow-ups",
    body: "When you want, Paddy can check in about presentations, interviews, or the things that matter to you.",
  },
  {
    icon: SlidersHorizontal,
    title: "Personalized communication",
    body: "Choose friendship, best-friend, or romantic styles. Adjust humour, directness, and affection.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy & control",
    body: "Inspect, edit, or delete memories. Turn off proactive messages. Your data stays yours.",
  },
  {
    icon: Bot,
    title: "Transparent AI",
    body: "Paddy is an AI companion — honest about that, never claiming to be human or replacing real relationships.",
  },
];

const STEPS = [
  { icon: UserRoundPlus, title: "Create your account", body: "Sign up in seconds — we'll email you a little secret phrase 💚" },
  { icon: Sparkles, title: "Shape your companion", body: "Pick a relationship style and what Paddy should call you." },
  { icon: CalendarHeart, title: "Just talk", body: "Paddy keeps track of what matters and checks in when you'd like." },
];

function PrimaryCta({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/sign-up"
      className={`group inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:translate-y-0 ${className}`}
    >
      Start with Paddy
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="glass sticky top-0 z-20 border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Paddy home" className="group rounded-full">
            <span className="inline-block transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105">
              <PaddyLogo />
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              href="/sign-in"
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="hidden rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-px hover:shadow-md hover:shadow-primary/25 sm:inline-flex"
            >
              Start with Paddy
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="paddy-glow relative overflow-hidden">
          <div className="dot-grid pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto grid max-w-5xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.15fr_1fr] lg:pb-24">
            <div className="text-center lg:text-left">
              <h1 className="rise text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                Someone who <span className="text-shimmer">remembers</span> what matters to you.
              </h1>
              <p className="rise delay-2 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground lg:mx-0">
                Paddy is your personal AI companion for everyday conversations, thoughtful guidance,
                meaningful connections, and the little things that make life yours.
              </p>
              <div className="rise delay-3 mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <PrimaryCta className="w-full sm:w-auto" />
                <a
                  href="#how-it-works"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-8 py-3 text-base font-medium text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-secondary sm:w-auto"
                >
                  Discover how it works
                  <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground transition-transform duration-300 group-hover:translate-y-0.5" />
                </a>
              </div>
              <p className="rise delay-4 mt-5 flex items-center justify-center gap-4 text-xs text-muted-foreground lg:justify-start">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Private by design
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-primary" /> Memory you control
                </span>
              </p>
            </div>

            {/* Chat preview — mirrors the in-app chat bubbles */}
            <div className="rise delay-5 relative mx-auto w-full max-w-sm">
              <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
                <span className="pulse-ring absolute inset-0 rounded-full" aria-hidden />
                <PaddyMark size={88} className="float relative drop-shadow-md" title="Paddy" />
              </div>
              <div className="lift rounded-3xl border border-border bg-card/80 p-4 shadow-xl shadow-black/5 backdrop-blur">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-end">
                    <p className="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--user-bubble)] px-3.5 py-2 text-[var(--user-bubble-fg)] shadow-sm">
                      Big interview tomorrow… kind of nervous 😅
                    </p>
                  </div>
                  <div className="flex items-end gap-2">
                    <PaddyAvatar className="h-7 w-7" />
                    <p className="max-w-[80%] rounded-2xl rounded-bl-md border border-border bg-[var(--assistant-bubble)] px-3.5 py-2 text-[var(--assistant-bubble-fg)] shadow-sm">
                      You&apos;ve prepped so well for this. Want to run through your intro once more? I&apos;ll
                      check in after to hear how it went 💚
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pl-9 text-[11px] text-muted-foreground">
                    <Brain className="h-3.5 w-3.5 text-primary" />
                    Remembered: interview on Friday
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="how-it-works" className="mx-auto max-w-5xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-20">
          <div className="reveal mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">A companion that grows with you</h2>
            <p className="mt-3 text-muted-foreground">
              Everything Paddy does is built around continuity, care, and your control.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="lift reveal group rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
            <ol className="grid gap-8 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="reveal group flex flex-col items-center text-center sm:items-start sm:text-left">
                  <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-primary shadow-sm transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-6">
                    <Icon className="h-5 w-5" />
                    <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Final CTA */}
        <section className="paddy-glow">
          <div className="reveal mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
            <PaddyMark size={56} className="float mx-auto mb-5 drop-shadow" />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ready when you are.</h2>
            <p className="mt-3 text-muted-foreground">
              Create an account and start a conversation in under a minute.
            </p>
            <PrimaryCta className="mt-8" />
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <span className="inline-flex items-center gap-2">
            <PaddyMark size={18} /> <PaddyWordmark className="text-base" /> · Personal AI companion
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs">
            Made with <Heart className="h-3.5 w-3.5 fill-primary text-primary" /> for everyday moments
          </span>
        </div>
      </footer>
    </div>
  );
}
