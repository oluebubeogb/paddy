import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight text-primary">
              Paddy
            </span>
            <span className="text-muted-foreground text-sm hidden sm:inline">
              · companion
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-medium bg-primary text-primary-foreground px-3.5 py-1.5 rounded-full hover:opacity-90 transition-opacity"
            >
              Start with Paddy
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-foreground leading-[1.1] max-w-3xl mx-auto">
            Someone who remembers what matters to you.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Paddy is your personal AI companion for everyday conversations,
            thoughtful guidance, meaningful connections, and the little things
            that make life yours.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-8 py-3 text-base font-medium hover:opacity-90 transition-opacity"
            >
              Start with Paddy
            </Link>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-full border border-border bg-card px-8 py-3 text-base font-medium text-foreground hover:bg-secondary transition-colors"
            >
              Discover how it works
            </a>
          </div>
        </section>

        <section
          id="how-it-works"
          className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20"
        >
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Personal memory",
                body: "Paddy remembers the important things — preferences, events, goals — so you never have to repeat yourself.",
              },
              {
                title: "Everyday companionship",
                body: "Warm, natural conversation that feels continuous. Come back days later and pick up where you left off.",
              },
              {
                title: "Thoughtful follow-ups",
                body: "When you want, Paddy can check in about presentations, interviews, or the things that matter to you.",
              },
              {
                title: "Personalized communication",
                body: "Choose friendship, best-friend, or romantic styles. Adjust humour, directness, and affection.",
              },
              {
                title: "Privacy & control",
                body: "Inspect, edit, or delete memories. Turn off proactive messages. Your data stays yours.",
              },
              {
                title: "Transparent AI",
                body: "Paddy is an AI companion — honest about that, never claiming to be human or replacing real relationships.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <h3 className="text-lg font-medium text-foreground">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 text-center border-t border-border">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Ready when you are.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Create an account and start a conversation in under a minute.
          </p>
          <Link
            href="/sign-up"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-8 py-3 text-base font-medium hover:opacity-90 transition-opacity"
          >
            Start with Paddy
          </Link>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>Paddy · Personal AI companion</p>
      </footer>
    </div>
  );
}
